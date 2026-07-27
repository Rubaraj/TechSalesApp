import 'dotenv/config';
import { z } from 'zod';

const truthy = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('4000')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  MONGO_APP_DB: z.string().min(1).default('medhub_app'),
  MONGO_LOOKUP_DB: z.string().min(1).default('medhub_lookup'),
  MONGO_CONNECT_TIMEOUT_MS: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),

  FORCE_JSON: truthy.default(false),
  JSON_PERSIST: truthy.default(true),

  // ----- Data backend (Phase 1 — Databricks migration) -----
  // Explicit data-store selector. When set, supersedes FORCE_JSON. When unset,
  // FORCE_JSON drives the choice between 'mongo' and 'json' (legacy behavior).
  // Use getDataBackend() helper to read — never read DATA_BACKEND directly,
  // because the resolved value depends on FORCE_JSON when DATA_BACKEND is unset.
  DATA_BACKEND: z.enum(['mongo', 'json', 'databricks']).optional(),

  // Databricks SQL Warehouse connection (required only when DATA_BACKEND='databricks').
  // Asserted at boot inside connectMongo()'s 'databricks' branch.
  DATABRICKS_HOST: z.string().optional(),         // e.g. https://adb-1234.5.azuredatabricks.net
  DATABRICKS_HTTP_PATH: z.string().optional(),    // SQL Warehouse HTTP path
  DATABRICKS_TOKEN: z.string().optional(),        // PAT or service-principal token
  DATABRICKS_CATALOG: z.string().default('dev_medhub'),
  DATABRICKS_APP_SCHEMA: z.string().default('medhub_app'),
  DATABRICKS_LOOKUP_SCHEMA: z.string().default('medhub_lookup'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // ----- AI pipeline (Phase 1+) -----
  // Master switch. When false, /api/ai/* returns 501 AI_DISABLED.
  AI_ENABLED: truthy.default(true),

  // Phase 4 — Atlas agentic copilot master switch. When false, /api/ai/atlas/*
  // returns 501 ATLAS_DISABLED. Independent of AI_ENABLED so admins can keep
  // member-facing chat while turning off the internal copilot.
  ATLAS_ENABLED: truthy.default(true),

  // Phase 7 — LLM provider switch. Default 'ollama' (free, local). Flip to
  // 'anthropic' when the user has Console credits. The same getChatModel()
  // factory dispatches; agent code is unchanged.
  AI_LLM_PROVIDER: z.enum(['ollama', 'anthropic', 'stub']).default('ollama'),

  // Anthropic config (only required when AI_LLM_PROVIDER='anthropic').
  ANTHROPIC_API_KEY: z.string().optional(),
  // Optional override for Anthropic-compatible gateways (e.g. OpenRouter's
  // /api/v1/messages passthrough). Leave unset for api.anthropic.com.
  ANTHROPIC_BASE_URL: z.string().optional(),
  AI_MODEL_DEFAULT: z.string().default('claude-sonnet-4-6'),
  AI_MODEL_PREMIUM: z.string().default('claude-opus-4-7'),
  /** QA pipeline — model for on-demand call QA reviews. Empty → falls
   *  through to AI_MODEL_DEFAULT. Set to a cheap model (haiku tier). */
  AI_MODEL_QA: z.string().optional(),
  AI_MAX_DAILY_TOKENS: z.coerce.number().int().nonnegative().default(5_000_000),

  // Phase 4 — per-user daily token cap (Atlas-scoped; protects the $50 POC
  // budget). 100k tokens/day @ Haiku ≈ $1/user/day max.
  AI_MAX_DAILY_TOKENS_PER_USER: z.coerce.number().int().nonnegative().default(100_000),

  // Ollama config (chat models — used when AI_LLM_PROVIDER='ollama').
  // Default chat + premium chat are both qwen2.5:7b — bump premium to
  // qwen2.5:14b on a GPU box / patient demos.
  OLLAMA_LLM_MODEL: z.string().default('qwen2.5:7b'),
  OLLAMA_LLM_PREMIUM_MODEL: z.string().default('qwen2.5:7b'),

  // Local services (Qdrant + Ollama via Docker on the laptop).
  QDRANT_URL: z.string().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  AI_EMBED_MODEL: z.string().default('nomic-embed-text'),
  AI_EMBED_DIM: z.coerce.number().int().positive().default(768),

  // Agent guardrails.
  AI_MAX_TOOL_STEPS: z.coerce.number().int().positive().default(8),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  // Phase 6 — per-user/IP rate limiting on /api/ai/* (echo exempt).
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(300_000),

  // ----- Phase 2 — Live Call Copilot: Twilio + Deepgram -----
  // Master switch. When false, /api/ai/call/* returns 501 and the FE falls
  // back to the Web Speech path. Twilio webhooks (/api/twilio/*) refuse to
  // serve TwiML.
  TWILIO_ENABLED: truthy.default(false),

  // Twilio config — only required when TWILIO_ENABLED=true (asserted at boot).
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_API_KEY_SID: z.string().optional(),
  TWILIO_API_KEY_SECRET: z.string().optional(),
  TWILIO_TWIML_APP_SID: z.string().optional(),
  TWILIO_OUTBOUND_CALLER_ID: z.string().optional(),

  // Hard cap on a single call's duration. Enforced via TwiML <Dial timeLimit>
  // and a server-side timer in the Media Stream WS receiver. Stops a stuck
  // call from burning Twilio + Deepgram budget all weekend.
  TWILIO_MAX_CALL_DURATION_SECONDS: z.coerce.number().int().positive().default(1800),

  // Per-user daily Twilio-call minute budget. Refuses to mint new Voice
  // Access Tokens once exceeded. Mirrors AI_MAX_DAILY_TOKENS pattern.
  TWILIO_MAX_DAILY_CALL_MINUTES_PER_USER: z.coerce.number().int().positive().default(240),

  // Dev escape hatch for X-Twilio-Signature verification. Module-asserted to
  // be off when NODE_ENV === 'production' so a misconfigured prod boot fails
  // loudly rather than silently disabling the webhook auth.
  TWILIO_SKIP_VERIFY: truthy.default(false),

  // Deepgram config.
  DEEPGRAM_API_KEY: z.string().optional(),
  DEEPGRAM_MODEL: z.string().default('nova-3'),
  DEEPGRAM_LANGUAGE: z.string().default('en-US'),

  // Training simulator (Deepgram Voice Agent). The effective on-switch is
  // `simulatorEnabled()` below — zod defaults can't reference other vars.
  SIMULATOR_ENABLED: truthy.default(true),
  // Deepgram-hosted "think" LLM for the prospect persona. Runs inside
  // Deepgram's cloud (NOT the app's OpenRouter stack). Must be on Deepgram's
  // CURRENT voice-agent model list (developers.deepgram.com/docs/
  // voice-agent-llm-models) — ids off that list are rejected at Settings
  // time ("model not available"). claude-4-5-haiku = their Standard tier:
  // fastest replies, right fit for a live voice persona.
  SIMULATOR_THINK_MODEL: z.string().default('claude-4-5-haiku'),
  // Hard per-session cap — cost control on agent minutes.
  SIMULATOR_MAX_SESSION_SECONDS: z.coerce.number().int().positive().default(600),

  // Public base URL the Pi tunnel exposes. Used for the TwiML <Stream url>
  // and any callbacks that need a full URL. e.g. https://techsales-dev.example.com
  PUBLIC_BASE_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Print friendly errors and bail. We can't use the logger here — the logger
  // depends on env to know whether to pretty-print.
  // eslint-disable-next-line no-console
  console.error('[env] Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}

// Phase 2 — when TWILIO_ENABLED, required Twilio vars must be set. Fail at
// boot rather than at the first call attempt. PUBLIC_BASE_URL + Deepgram are
// also needed for any meaningful call but we surface a clearer message at
// runtime if they're missing.
const TWILIO_REQUIRED_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'TWILIO_TWIML_APP_SID',
  'TWILIO_OUTBOUND_CALLER_ID',
  'DEEPGRAM_API_KEY',
  'PUBLIC_BASE_URL',
] as const;
if (parsed.data.TWILIO_ENABLED) {
  const missing = TWILIO_REQUIRED_KEYS.filter((k) => !parsed.data[k]);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[env] TWILIO_ENABLED=true but required vars missing: ${missing.join(', ')}`,
    );
    process.exit(1);
  }
}

// Production must NEVER skip Twilio signature verification — module-level
// assert so a misconfigured prod boot fails loudly.
if (parsed.data.NODE_ENV === 'production' && parsed.data.TWILIO_SKIP_VERIFY) {
  // eslint-disable-next-line no-console
  console.error('[env] TWILIO_SKIP_VERIFY=true is not allowed in production');
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * cors() `origin` value. `CORS_ORIGIN=*` reflects any origin — safe here only
 * because the API sets `credentials: false` and uses no cookies. Otherwise an
 * explicit comma-separated allowlist; empty disables cross-origin entirely.
 */
export const corsOriginSetting: boolean | string[] = corsOrigins.includes('*')
  ? true
  : corsOrigins.length === 0
    ? false
    : corsOrigins;

export type DataBackend = 'mongo' | 'json' | 'databricks';

/**
 * Resolves the active data backend. Explicit `DATA_BACKEND` wins; otherwise
 * we fall back to the legacy `FORCE_JSON` boolean (true → 'json', else 'mongo').
 * Single source of truth — `connectMongo()` and the registry both read this.
 */
export function getDataBackend(): DataBackend {
  if (env.DATA_BACKEND) return env.DATA_BACKEND;
  return env.FORCE_JSON ? 'json' : 'mongo';
}

/** Training simulator on-switch: flag AND a Deepgram key (the Voice Agent
 *  session is a Deepgram cloud service). */
export function simulatorEnabled(): boolean {
  return env.SIMULATOR_ENABLED && !!env.DEEPGRAM_API_KEY;
}
