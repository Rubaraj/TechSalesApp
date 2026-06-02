/**
 * Phase 3b.1 — Post-call note summarizer.
 *
 * Runs once when the call ends (via `callAnalysisAgent.stop()`). Scans the
 * accumulated prospect transcript for predefined anchor categories and
 * returns ONE note per category that fired (dedup so a prospect saying
 * "worried" three times produces one concern line). Also emits a
 * `catalog_miss` note for each pharmacy chain or provider name that was
 * extracted during the call but didn't resolve against a catalog row.
 *
 * Pure rule-based; LLM-driven semantic summarization replaces this in
 * Phase 3c without changing the wire shape (still emits `add_note` actions).
 */
import type { TranscriptChunk } from '../types/call.types.js';

export type NoteCategory =
  | 'concern'
  | 'preference'
  | 'financial'
  | 'family'
  | 'health_context'
  | 'switching'
  | 'catalog_miss'
  | 'other';

export interface SummaryNote {
  text: string;
  category: NoteCategory;
}

export interface SummarizeOptions {
  /** Names mentioned during the call that didn't resolve in their catalog.
   *  Each becomes a `catalog_miss` note so the agent doesn't lose the info. */
  catalogMisses?: {
    pharmacy?: string[];
    provider?: string[];
  };
}

interface CategoryDef {
  category: Exclude<NoteCategory, 'catalog_miss' | 'other'>;
  /** Anchor regex. Match captures the trigger word for context-window slicing. */
  pattern: RegExp;
}

// Order matters: more-specific patterns first within each category.
const CATEGORY_PATTERNS: CategoryDef[] = [
  {
    category: 'concern',
    pattern: /\b(worried|afraid|nervous|concerned|anxious)\s+(?:about|that|of)\b/i,
  },
  {
    category: 'preference',
    pattern: /\b(?:i\s+(?:prefer|would\s+(?:like|prefer)|want|need)|i'?d\s+(?:like|prefer))\b/i,
  },
  {
    category: 'financial',
    pattern: /\b(?:fixed\s+income|can'?t\s+afford|too\s+expensive|on\s+a\s+budget|tight\s+budget|monthly\s+budget|can'?t\s+pay)\b/i,
  },
  {
    category: 'family',
    pattern: /\b(?:my\s+(?:husband|wife|spouse|son|daughter|mom|mother|dad|father|partner|caregiver))\b/i,
  },
  {
    category: 'health_context',
    // Prospect-stated conditions. Distinct from compliance — these are facts
    // shared by the prospect, not the agent asking inappropriately.
    pattern: /\b(?:i\s+have|diagnosed\s+with|i'?m\s+(?:dealing\s+with|managing))\s+(?:diabetes|cancer|heart\s+(?:disease|failure|attack)|copd|kidney\s+disease|high\s+blood\s+pressure|stroke|alzheimer|dementia|asthma)\b/i,
  },
  {
    category: 'switching',
    pattern: /\b(?:want(?:ing)?\s+to\s+switch|switch(?:ing)?\s+(?:plans?|carriers?)|change\s+plans?|unhappy\s+with|drop\s+my\s+plan|leave\s+my\s+current)\b/i,
  },
];

/**
 * Produce a deduped list of summary notes for the call. Each fired category
 * yields ONE note carrying the most representative captured sentence from
 * the transcript history.
 */
export function summarizeTranscript(
  chunks: TranscriptChunk[],
  opts: SummarizeOptions = {},
): SummaryNote[] {
  const out: SummaryNote[] = [];
  const seenCategories = new Set<NoteCategory>();

  for (const def of CATEGORY_PATTERNS) {
    if (seenCategories.has(def.category)) continue;
    for (const chunk of chunks) {
      if (chunk.speaker !== 'prospect') continue;
      const m = def.pattern.exec(chunk.text);
      if (!m) continue;
      // Capture the sentence containing the match (up to ~120 chars).
      const sentence = sliceSentence(chunk.text, m.index, 120);
      out.push({ text: sentence, category: def.category });
      seenCategories.add(def.category);
      break;
    }
  }

  // Catalog miss notes — one per unresolved pharmacy or provider name.
  if (opts.catalogMisses) {
    for (const name of opts.catalogMisses.pharmacy ?? []) {
      out.push({ text: `Pharmacy mentioned: ${name}`, category: 'catalog_miss' });
    }
    for (const name of opts.catalogMisses.provider ?? []) {
      out.push({ text: `Provider mentioned: ${name}`, category: 'catalog_miss' });
    }
  }

  return out;
}

/**
 * Extract a sentence-shaped snippet containing the match index. Honors
 * sentence boundaries (. ! ?) within ±60 chars of the match, then truncates
 * the whole thing to `maxLen`.
 */
function sliceSentence(text: string, matchIndex: number, maxLen: number): string {
  // Find sentence-ish bounds.
  const sentenceEndRe = /[.!?]/g;
  let start = 0;
  let end = text.length;
  // Walk backwards for sentence start.
  for (let i = matchIndex - 1; i >= 0; i--) {
    if (/[.!?]/.test(text[i]!)) {
      start = i + 1;
      break;
    }
  }
  // Walk forwards for sentence end.
  sentenceEndRe.lastIndex = matchIndex;
  const endMatch = sentenceEndRe.exec(text);
  if (endMatch) end = endMatch.index + 1;
  let snippet = text.slice(start, end).trim();
  if (snippet.length > maxLen) {
    snippet = snippet.slice(0, maxLen).trim() + '…';
  }
  return snippet;
}
