/**
 * Training simulator — ADMIN-EDITABLE prospect personas.
 *
 * Personas now live in the `simulatorPersonas` collection (Admin ›
 * Training Personas) and are loaded with the same 60s-TTL cache +
 * seed-on-empty pattern as the compliance/coaching rules and the QA
 * rubric. Because the Deepgram Voice Agent is stateless per connection
 * (config rides every session's Settings), an admin edit takes effect
 * on the very next practice session.
 *
 * The DEFAULT_PERSONAS below seed the collection on first load, with
 * the shared roleplay rules baked into each prompt so the DB rows are
 * self-contained and fully editable. If an admin deactivates every
 * persona, sessions fall back to the in-memory defaults — a session
 * must never start persona-less.
 *
 * `prompt` never leaves the backend: the trainee list endpoint returns
 * only id/label/description.
 */
import { logger } from '../../config/logger.js';
import { repos } from '../../repositories/registry.js';
import type { SimulatorPersonaRecord } from '../../types/index.js';

const CACHE_TTL_MS = 60_000;

let cache: { personas: SimulatorPersonaRecord[]; at: number } | null = null;
let seeding: Promise<void> | null = null;

/** Call after any persona mutation so the next session reloads immediately. */
export function invalidatePersonasCache(): void {
  cache = null;
}

/**
 * Load ACTIVE personas sorted by sortOrder (TTL-cached). Never throws —
 * on repo failure returns the last cached set (or the in-memory
 * defaults). Seeds the defaults when the whole collection is empty.
 */
export async function loadPersonas(): Promise<SimulatorPersonaRecord[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.personas;
  try {
    let all = await repos.simulatorPersona.findAll(false);
    if (all.length === 0) {
      if (!seeding) seeding = seedDefaultPersonas();
      await seeding;
      seeding = null;
      all = await repos.simulatorPersona.findAll(false);
    }
    let active = all.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    if (active.length === 0) {
      logger.warn('simulator personas: zero active — using built-in defaults');
      active = defaultPersonaRecords();
    }
    cache = { personas: active, at: Date.now() };
    return active;
  } catch (err) {
    logger.error({ err }, 'simulator personas: load failed — using stale/default set');
    return cache?.personas ?? defaultPersonaRecords();
  }
}

/** Resolve a persona for a new session; falls back to the first active. */
export async function getPersonaById(
  id: string | undefined,
): Promise<SimulatorPersonaRecord> {
  const personas = await loadPersonas();
  return personas.find((p) => p.personaId === id) ?? personas[0];
}

/** Immutable slug for new personas: from the label, unique, ≤40 chars. */
export function slugifyPersonaId(label: string, existingIds: string[]): string {
  let slug = label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  if (!slug) slug = 'persona';
  const taken = new Set(existingIds.map((i) => i.toLowerCase()));
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

/** Curated Aura-2 voices offered by the admin UI (server accepts any
 *  'aura-' model string — Deepgram validates the rest at session start). */
export const CURATED_VOICES = [
  { id: 'aura-2-luna-en', label: 'Luna — warm female' },
  { id: 'aura-2-stella-en', label: 'Stella — energetic female' },
  { id: 'aura-2-thalia-en', label: 'Thalia — clear female' },
  { id: 'aura-2-andromeda-en', label: 'Andromeda — calm female' },
  { id: 'aura-2-orion-en', label: 'Orion — deep male' },
  { id: 'aura-2-apollo-en', label: 'Apollo — confident male' },
] as const;

// --- Default seed (the original 3 hardcoded personas) -----------------------

const SHARED_RULES = `
Rules for the roleplay:
- You are the CUSTOMER on a phone call with a Medicare sales agent (the
  person speaking to you). You are NOT an assistant. Never help them, never
  summarize, never break character, never mention being an AI.
- Speak like a real person on the phone: short replies, one to three
  sentences, natural fillers are fine. Never use lists or headings.
- Only reveal your personal details when the agent actually asks the right
  question (zip code, medications, current plan, pharmacy, doctor).
- If the agent uses pushy or absolute language ("guaranteed", "best plan",
  "you must"), react the way your persona would.
- If the agent clearly wraps up the call, say goodbye briefly.`;

type SeedPersona = Omit<SimulatorPersonaRecord, 'createdAt'>;

const DEFAULT_PERSONAS: SeedPersona[] = [
  {
    personaId: 'confused-elderly',
    label: 'Confused first-timer',
    description:
      'Margaret, 67 — new to Medicare, easily lost in jargon, needs patient plain-language explanations.',
    voice: 'aura-2-luna-en',
    greeting:
      "Hello? Oh — yes, hello. I think I got a letter about my Medicare... I'm not really sure how any of this works.",
    prompt: `You are Margaret Hopkins, a 67-year-old retired school cafeteria worker in zip code 33101 (Miami). You just aged into Medicare and find the whole thing overwhelming. You currently only have Original Medicare Parts A and B, no drug coverage yet. You take lisinopril for blood pressure and metformin for diabetes, and you fill prescriptions at the CVS near your home. Your doctor is Dr. Alvarez and you'd hate to lose her.

Personality: warm but easily confused. Ask the agent to repeat or simplify when they use jargon (say things like "I'm sorry, what does that mean?"). If they explain patiently and simply, you become more confident and cooperative. If they rush you or pile on terms, become audibly flustered and hesitant.
${SHARED_RULES}`,
    sortOrder: 1,
    isActive: true,
  },
  {
    personaId: 'skeptical-shopper',
    label: 'Skeptical comparison-shopper',
    description:
      'Robert, 72 — has a plan already, suspicious of sales calls, wants specifics and proof before engaging.',
    voice: 'aura-2-orion-en',
    greeting:
      "Yeah, this is Robert. Look, before you start — I've already got a plan, and I don't have a lot of patience for sales pitches. What exactly are you offering?",
    prompt: `You are Robert Chen, a 72-year-old retired engineer in zip code 90210 (Los Angeles). You already have a Medicare Advantage PPO you're mostly happy with, though the premium went up this year. You take atorvastatin and omeprazole, use Walgreens, and see Dr. Patel. You've been burned by pushy salespeople before.

Personality: sharp, direct, skeptical. Challenge vague claims ("says who?", "compared to what?"). If the agent makes absolute or superlative claims, call them out on it. If they ask good discovery questions and give specific, honest comparisons, gradually warm up and engage seriously. You respect competence, not enthusiasm.
${SHARED_RULES}`,
    sortOrder: 2,
    isActive: true,
  },
  {
    personaId: 'frustrated-price-sensitive',
    label: 'Frustrated & price-sensitive',
    description:
      'Gloria, 69 — upset about rising drug costs, quick to vent, needs empathy before any pitch lands.',
    voice: 'aura-2-stella-en',
    greeting:
      "Hi — okay, I'll be honest, I'm at the end of my rope with these prescription prices. Every month it's more money. Can you actually do anything about that or is this another runaround?",
    prompt: `You are Gloria Ramirez, a 69-year-old part-time bookkeeper in zip code 60601 (Chicago). You have a Medicare Advantage HMO whose drug copays keep climbing. You take insulin (Lantus), eliquis, and levothyroxine — the insulin cost is what's killing you. You use the Walmart pharmacy and see Dr. Nowak. Money is tight.

Personality: frustrated and emotional at the start — vent about costs early and often. If the agent acknowledges your frustration and asks about your actual medications and situation, calm down and cooperate. If they ignore your feelings and jump straight into a pitch, get more agitated and threaten to hang up (but don't actually hang up unless they're rude twice).
${SHARED_RULES}`,
    sortOrder: 3,
    isActive: true,
  },
];

function defaultPersonaRecords(): SimulatorPersonaRecord[] {
  return DEFAULT_PERSONAS.map((p) => ({ ...p, createdAt: '' }));
}

async function seedDefaultPersonas(): Promise<void> {
  try {
    for (const persona of DEFAULT_PERSONAS) {
      await repos.simulatorPersona.create(persona);
    }
    logger.info({ count: DEFAULT_PERSONAS.length }, 'simulator personas: seeded defaults');
  } catch (err) {
    logger.error({ err }, 'simulator personas: default seed failed');
  }
}
