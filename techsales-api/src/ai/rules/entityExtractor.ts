/**
 * Phase 3a + 3b — Rule-based entity extractor for prospect transcript chunks.
 *
 * Pulls structured facts out of a single transcript chunk. Anchored to common
 * spoken phrasings; conservative on false positives. Every emitted entity has
 * the FE's 'AI' chip as a safety net so the agent can override if wrong.
 *
 * Phase 3a (existing): zipCode (anchor OR zipStateCounty.json validation),
 * planTypeMentions, drugs (case-insensitive word-boundary against drugData.json).
 *
 * Phase 3b (new):
 *   - phone (anchor + flexible digit-group; caller-ID dedup for inbound)
 *   - email (\S+@\S+\.\S+ shape)
 *   - medicareNumber / MBI (Medicare Beneficiary ID format)
 *   - medicaidNumber (anchor + alphanumeric)
 *   - firstName / lastName (anchor + leading-cap token + carrier blocklist)
 *   - isDualEligible (anchor phrases)
 *   - isLISEligible (anchor phrases)
 *
 * Deferred to Phase 3c (LLM): dateOfBirth, address-line, Part A/B effective dates.
 * YOB-only DOB extraction is rejected — `1955 → 1955-01-01` is misleading.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../config/logger.js';
import { normalizeToE164 } from '../../utils/phoneUtils.js';
import type { ExtractedEntities } from '../types/call.types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..', '..');
const ZIP_PATH = path.join(SERVER_ROOT, 'data', 'sample', 'lookup', 'zipStateCounty.json');
const DRUG_PATH = path.join(SERVER_ROOT, 'data', 'sample', 'lookup', 'drugData.json');

// --- Lookup tables (loaded once at module init) ----------------------------

interface ZipRow {
  zipCode: string;
  state?: string;
  stateAbbr?: string;
  county?: string;
  city?: string;
}

interface DrugRow {
  drugId: string;
  brandName?: string;
  genericName?: string;
}

let validZips: Set<string> = new Set();
let drugNameToCanonical: Map<string, string> = new Map();
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  try {
    const [zipRaw, drugRaw] = await Promise.all([
      fs.readFile(ZIP_PATH, 'utf8'),
      fs.readFile(DRUG_PATH, 'utf8'),
    ]);
    const zips = JSON.parse(zipRaw) as ZipRow[];
    const drugs = JSON.parse(drugRaw) as DrugRow[];
    validZips = new Set(zips.map((z) => z.zipCode));
    drugNameToCanonical = new Map();
    for (const d of drugs) {
      if (d.brandName) drugNameToCanonical.set(d.brandName.toLowerCase(), d.brandName);
      if (d.genericName && d.genericName !== d.brandName) {
        drugNameToCanonical.set(d.genericName.toLowerCase(), d.genericName);
      }
    }
    loaded = true;
    logger.info(
      { zips: validZips.size, drugs: drugNameToCanonical.size },
      'entityExtractor: lookup tables loaded',
    );
  } catch (err) {
    logger.error({ err }, 'entityExtractor: failed to load lookup data; using empty tables');
    loaded = true;
  }
}

const loadPromise = ensureLoaded();

// --- Pattern constants -----------------------------------------------------

const ZIP_PATTERN = /\b(\d{5})\b/g;
const ZIP_ANCHOR_PATTERN = /\b(zip(?:\s+code)?|postal(?:\s+code)?|i\s+(?:live|am)\s+in|i'?m\s+in)\b/i;

const PLAN_TYPE_PATTERN = /\b(HMO|PPO|CSNP|DSNP|MAPD|PDP|Medigap)\b/gi;

// Phone: anchor "my (phone|cell|number|contact) is" — then strip non-digits
// from the next ~50 chars and require 10 (US, +1 prefix) or 11 (1 + 10)
// digits. This is robust to Deepgram's varied output ("555-123-4567",
// "(555) 123 4567", "5551234567", "five five five..." — though spelled-out
// words are still a gap, deferred to LLM phase).
const PHONE_ANCHOR_PATTERN = /\b(?:my\s+)?(?:phone|cell|number|contact|reach\s+me\s+at)\b/i;

// Email: \S+@\S+\.\S+ — require a TLD-ish dot after the @. Reject obvious
// garbage like "x@y" (no TLD) or "@example.com" (no local part).
const EMAIL_PATTERN = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/;

// MBI: 11 alphanumeric chars, optionally dashed as 4-3-4.
// Per CMS spec the positional alpha/num pattern is:
//   p1: 1-9, p2: alpha, p3: alphanum, p4: num, p5: alpha, p6: alphanum,
//   p7: num, p8: alpha, p9: alpha, p10: num, p11: num.
// Loose-but-correct matcher (excluded letters S/L/O/I/B/Z not enforced —
// downstream validation can do that):
const MBI_ANCHOR_PATTERN = /\b(?:medicare\s+(?:number|id)|mbi)\s+(?:is\s+)?([1-9][A-Z][A-Z\d]\d-?[A-Z][A-Z\d]\d-?[A-Z]{2}\d{2})\b/i;

// Medicaid number: anchored + alphanumeric token 6-12 chars. Low precision;
// chip safety net.
const MEDICAID_ANCHOR_PATTERN = /\b(?:medicaid\s+(?:number|id))\s+(?:is\s+)?([A-Z0-9]{6,12})\b/i;

// First-name anchors. Capture 1-2 capitalized tokens following the anchor.
// Deepgram capitalizes proper nouns reasonably well on isFinal chunks.
const NAME_ANCHOR_PATTERN = /\b(?:my\s+name\s+is|this\s+is|i'?m)\s+([A-Z][a-z]{1,19})(?:\s+([A-Z][a-z]{1,19}))?\b/;

// Carrier / company names that should NOT be confused with first names.
const NAME_BLOCKLIST = new Set([
  'Medicare', 'Medicaid', 'Aetna', 'Humana', 'Cigna', 'Unitedhealthcare',
  'United', 'Wellcare', 'Anthem', 'Kaiser', 'Bluecross', 'Centene',
  'Caller', 'Calling', 'Sorry', 'Hello', 'Hi', 'Yes', 'No', 'Maybe',
]);

const DUAL_ELIGIBLE_PATTERN = /\b(?:i\s+have\s+medicaid|i'?m\s+(?:on|dual)\s+(?:medicaid|eligible)|dual[- ]eligible|i\s+get\s+medicaid)\b/i;
const LIS_PATTERN = /\b(?:low[- ]income\s+subsidy|\blis\b|extra\s+help)\b/i;

// Phase 3b.1 — pharmacy chain regex. Matches the common US chains the
// prospect is likely to say verbatim. Captures the canonical name (preserving
// case). Anchor words are optional but boost confidence — bare "CVS" in
// any sentence is enough.
const PHARMACY_CHAIN_PATTERN = /\b(CVS|Walgreens|Walmart|Rite\s?Aid|Costco|Kroger|Publix|Target|Sam'?s\s+Club|Meijer|Wegmans|HEB|Albertsons|Safeway)\b/gi;

// Phase 3b.1 — provider name capture. Anchor phrases followed by an optional
// "Dr." prefix and 1-2 leading-capital tokens. Conservative: requires the
// "my doctor/dr/physician/provider is" or "I see Dr." anchor — bare "Dr.
// Smith" without context is too risky. `/gi` flag so the anchor matches
// regardless of sentence-start capitalization; we re-validate the captured
// name groups for explicit uppercase below (since /i loosens [A-Z]).
const PROVIDER_ANCHOR_PATTERN = /\b(?:my\s+(?:doctor|dr|physician|provider)\s+is|i\s+see)\s+(?:dr\.?\s+)?([A-Z]\w{1,20})(?:\s+([A-Z]\w{1,20}))?\b/gi;

const PROVIDER_NAME_BLOCKLIST = new Set([
  // Words that look like names but show up in common conversation.
  'My', 'The', 'Some', 'New', 'Other', 'Doctor', 'Hospital', 'Clinic',
  'Yesterday', 'Today', 'Tomorrow', 'About', 'Twice', 'Often', 'Now',
]);

// --- Options ---------------------------------------------------------------

export interface ExtractOptions {
  /** Inbound calls: the prospect's E.164 caller ID. Phone extractions equal
   *  to this number are suppressed (prospect repeating their own number). */
  callerNumber?: string;
}

// --- Public API ------------------------------------------------------------

/**
 * Extract new entities from a prospect transcript chunk. `current` is the
 * accumulator so we can decide what's actually new (don't re-emit zip if
 * it's already known).
 *
 * Returns a partial — only fields that changed or are newly known.
 */
export async function extractFromProspectChunk(
  text: string,
  current: ExtractedEntities,
  opts: ExtractOptions = {},
): Promise<Partial<ExtractedEntities>> {
  if (!text) return {};
  await loadPromise;
  const out: Partial<ExtractedEntities> = {};

  // ----- zipCode -----
  if (!current.zipCode) {
    const zip = extractZip(text);
    if (zip) out.zipCode = zip;
  }

  // ----- plan-type mentions -----
  const mentions = extractPlanTypes(text);
  if (mentions.length > 0) {
    const merged = mergeUnique(current.planTypeMentions ?? [], mentions);
    if (merged.length !== (current.planTypeMentions ?? []).length) {
      out.planTypeMentions = merged;
    }
  }

  // ----- drugs (with dosage + frequency parsing) -----
  const drugs = extractDrugs(text);
  if (drugs.length > 0) {
    const existingNames = new Set((current.drugs ?? []).map((d) => d.name.toLowerCase()));
    const newOnes = drugs.filter((d) => !existingNames.has(d.name.toLowerCase()));
    if (newOnes.length > 0) {
      out.drugs = [...(current.drugs ?? []), ...newOnes];
    }
  }

  // ----- phone (with caller-ID dedup) -----
  if (!current.phone) {
    const phone = extractPhone(text, opts.callerNumber);
    if (phone) out.phone = phone;
  }

  // ----- email -----
  if (!current.email) {
    const email = extractEmail(text);
    if (email) out.email = email;
  }

  // ----- MBI -----
  if (!current.medicareNumber) {
    const mbi = extractMbi(text);
    if (mbi) out.medicareNumber = mbi;
  }

  // ----- Medicaid number -----
  if (!current.medicaidNumber) {
    const med = extractMedicaidNumber(text);
    if (med) out.medicaidNumber = med;
  }

  // ----- first / last name -----
  if (!current.firstName || !current.lastName) {
    const { firstName, lastName } = extractName(text);
    if (firstName && !current.firstName) out.firstName = firstName;
    if (lastName && !current.lastName) out.lastName = lastName;
  }

  // ----- pharmacies -----
  const pharmacyChains = extractPharmacyChains(text);
  if (pharmacyChains.length > 0) {
    const existingNames = new Set((current.pharmacies ?? []).map((p) => p.name.toLowerCase()));
    const newOnes = pharmacyChains.filter((p) => !existingNames.has(p.toLowerCase()));
    if (newOnes.length > 0) {
      out.pharmacies = [...(current.pharmacies ?? []), ...newOnes.map((name) => ({ name }))];
    }
  }

  // ----- providers -----
  const providers = extractProviders(text);
  if (providers.length > 0) {
    const existingNames = new Set((current.providers ?? []).map((p) => p.name.toLowerCase()));
    const newOnes = providers.filter((p) => !existingNames.has(p.name.toLowerCase()));
    if (newOnes.length > 0) {
      out.providers = [...(current.providers ?? []), ...newOnes];
    }
  }

  // ----- dual eligibility -----
  if (current.isDualEligible === null && DUAL_ELIGIBLE_PATTERN.test(text)) {
    out.isDualEligible = true;
  }

  // ----- LIS eligibility -----
  if (current.isLISEligible === null && LIS_PATTERN.test(text)) {
    out.isLISEligible = true;
  }

  return out;
}

// --- Internals -------------------------------------------------------------

function extractZip(text: string): string | null {
  const matches = Array.from(text.matchAll(ZIP_PATTERN)).map((m) => ({
    value: m[1],
    index: m.index ?? 0,
  }));
  if (matches.length === 0) return null;

  const lowered = text.toLowerCase();
  for (const m of matches) {
    const windowStart = Math.max(0, m.index - 80);
    const windowText = lowered.slice(windowStart, m.index);
    if (ZIP_ANCHOR_PATTERN.test(windowText)) {
      return m.value;
    }
    if (validZips.has(m.value)) {
      return m.value;
    }
  }
  return null;
}

function extractPlanTypes(text: string): string[] {
  const out: string[] = [];
  const matches = text.matchAll(PLAN_TYPE_PATTERN);
  for (const m of matches) {
    const canonical = m[1].toUpperCase() === 'MEDIGAP' ? 'Medigap' : m[1].toUpperCase();
    if (!out.includes(canonical)) out.push(canonical);
  }
  return out;
}

interface ExtractedDrug {
  name: string;
  dosage?: string;
  frequency?: string;
}

/**
 * Match a number-with-unit dosage. Accepts: "5mg", "5 mg", "5 milligrams",
 * "0.5 mcg", "10 units". Returns the canonical "<number><unit>" form
 * (lowercase unit, no space). Spelled-out numbers ("five milligrams") are
 * deferred to LLM phase.
 */
const DOSAGE_PATTERN = /\b(\d+(?:\.\d+)?)\s*(milligrams?|micrograms?|grams?|milliliters?|units?|mg|mcg|g|ml|iu)\b/i;

function normalizeDosageUnit(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith('milligram')) return 'mg';
  if (lower.startsWith('microgram')) return 'mcg';
  if (lower.startsWith('milliliter')) return 'ml';
  if (lower === 'gram' || lower === 'grams') return 'g';
  if (lower.startsWith('unit')) return 'units';
  return lower;
}

/**
 * Frequency patterns — ordered most-specific-first. Each tuple is
 * `[regex, canonicalForm]`. Output strings match what the LeadForm
 * DrugSearch component displays.
 */
const FREQUENCY_PATTERNS: Array<[RegExp, string]> = [
  [/\bevery\s+other\s+day\b/i, 'Every other day'],
  [/\bonce\s+(?:a\s+)?(?:day|daily)\b|\bonce[- ]a[- ]day\b/i, 'Once daily'],
  [/\b(?:twice|two\s+times)\s+(?:a\s+)?(?:day|daily)\b|\b2x\s+(?:a\s+)?day\b/i, 'Twice daily'],
  [/\bthree\s+times\s+(?:a\s+)?(?:day|daily)\b|\b3x\s+(?:a\s+)?day\b/i, 'Three times daily'],
  [/\bfour\s+times\s+(?:a\s+)?(?:day|daily)\b|\b4x\s+(?:a\s+)?day\b/i, 'Four times daily'],
  [/\bevery\s+(?:morning|am)\b/i, 'Every morning'],
  [/\bevery\s+(?:night|evening|pm)\b|\bat\s+(?:night|bedtime)\b/i, 'Every night'],
  [/\bas\s+needed\b|\bp\.?r\.?n\.?\b/i, 'As needed'],
  [/\b(?:once\s+a\s+)?week(?:ly)?\b|\b1x\s+(?:a\s+)?week\b/i, 'Weekly'],
  [/\b(?:once\s+a\s+)?month(?:ly)?\b/i, 'Monthly'],
];

function extractDrugs(text: string): ExtractedDrug[] {
  if (drugNameToCanonical.size === 0) return [];
  const out: ExtractedDrug[] = [];
  const seen = new Set<string>();
  for (const [lower, canonical] of drugNameToCanonical) {
    if (seen.has(canonical)) continue;
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    const match = re.exec(text);
    if (!match) continue;
    seen.add(canonical);
    // Look at a ±60-char window around the drug name for dosage + frequency.
    // Phrases like "Eliquis 5mg twice a day" or "I take 5mg of Eliquis daily"
    // all fit within this window in normal speech.
    const windowStart = Math.max(0, match.index - 30);
    const windowEnd = Math.min(text.length, match.index + match[0].length + 60);
    const window = text.slice(windowStart, windowEnd);
    const dosage = extractDosage(window);
    const frequency = extractFrequency(window);
    const drug: ExtractedDrug = { name: canonical };
    if (dosage) drug.dosage = dosage;
    if (frequency) drug.frequency = frequency;
    out.push(drug);
  }
  return out;
}

function extractDosage(window: string): string | undefined {
  const m = DOSAGE_PATTERN.exec(window);
  if (!m) return undefined;
  const num = m[1];
  const unit = normalizeDosageUnit(m[2]);
  return `${num}${unit}`;
}

function extractFrequency(window: string): string | undefined {
  for (const [re, canonical] of FREQUENCY_PATTERNS) {
    if (re.test(window)) return canonical;
  }
  return undefined;
}

function extractPhone(text: string, callerNumber: string | undefined): string | null {
  const anchor = PHONE_ANCHOR_PATTERN.exec(text);
  if (!anchor) return null;
  const start = anchor.index + anchor[0].length;
  const window = text.slice(start, start + 50);
  const digits = window.replace(/\D/g, '');
  if (digits.length < 10) return null;
  // Prefer 11-digit form if it starts with 1; otherwise take first 10.
  const candidate =
    digits.length >= 11 && digits.startsWith('1') ? digits.slice(0, 11) : digits.slice(0, 10);
  const e164 = normalizeToE164(candidate);
  if (!e164) return null;
  // Inbound caller-ID dedup — prospect repeating their own number.
  if (callerNumber && normalizeToE164(callerNumber) === e164) return null;
  return e164;
}

function extractEmail(text: string): string | null {
  const m = EMAIL_PATTERN.exec(text);
  return m ? m[1].toLowerCase() : null;
}

function extractMbi(text: string): string | null {
  const m = MBI_ANCHOR_PATTERN.exec(text);
  if (!m) return null;
  // Normalize to all-caps without dashes for storage; FE can re-format.
  return m[1].replace(/-/g, '').toUpperCase();
}

function extractMedicaidNumber(text: string): string | null {
  const m = MEDICAID_ANCHOR_PATTERN.exec(text);
  return m ? m[1].toUpperCase() : null;
}

function extractPharmacyChains(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Reset lastIndex for global regex when reused across calls.
  PHARMACY_CHAIN_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHARMACY_CHAIN_PATTERN.exec(text)) !== null) {
    // Canonicalize whitespace (e.g. "Rite Aid" or "Rite aid" → "Rite Aid").
    const canonical = canonicalChain(m[1]);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}

function canonicalChain(raw: string): string {
  // Normalize whitespace + case.
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  const lower = collapsed.toLowerCase();
  if (lower === 'cvs') return 'CVS';
  if (lower === 'heb') return 'HEB';
  if (lower === 'rite aid' || lower === 'riteaid') return 'Rite Aid';
  if (lower === "sam's club" || lower === 'sams club') return "Sam's Club";
  // Default: capitalize each word.
  return collapsed
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function extractProviders(text: string): { name: string }[] {
  const out: { name: string }[] = [];
  const seen = new Set<string>();
  PROVIDER_ANCHOR_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROVIDER_ANCHOR_PATTERN.exec(text)) !== null) {
    const first = m[1];
    // Re-verify uppercase start (the /i flag on the regex loosens [A-Z]).
    // Names must be capitalized proper-noun-style; "smith" → reject.
    if (!first || !/^[A-Z]/.test(first) || PROVIDER_NAME_BLOCKLIST.has(first)) continue;
    const last =
      m[2] && /^[A-Z]/.test(m[2]) && !PROVIDER_NAME_BLOCKLIST.has(m[2]) ? m[2] : null;
    // Always render as "Dr. <name>" — the anchor implies a doctor.
    const display = last ? `Dr. ${first} ${last}` : `Dr. ${first}`;
    const key = display.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: display });
  }
  return out;
}

function extractName(text: string): { firstName: string | null; lastName: string | null } {
  const m = NAME_ANCHOR_PATTERN.exec(text);
  if (!m) return { firstName: null, lastName: null };
  const first = m[1];
  const last = m[2] ?? null;
  if (!first || NAME_BLOCKLIST.has(first)) return { firstName: null, lastName: null };
  if (last && NAME_BLOCKLIST.has(last)) {
    return { firstName: first, lastName: null };
  }
  return { firstName: first, lastName: last };
}

function mergeUnique<T>(a: T[], b: T[]): T[] {
  const seen = new Set<T>(a);
  for (const x of b) seen.add(x);
  return Array.from(seen);
}
