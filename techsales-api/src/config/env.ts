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

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // ----- AI pipeline (Phase 1+) -----
  // Master switch. When false, /api/ai/* returns 501 AI_DISABLED.
  AI_ENABLED: truthy.default(true),

  // Phase 7 — LLM provider switch. Default 'ollama' (free, local). Flip to
  // 'anthropic' when the user has Console credits. The same getChatModel()
  // factory dispatches; agent code is unchanged.
  AI_LLM_PROVIDER: z.enum(['ollama', 'anthropic']).default('ollama'),

  // Anthropic config (only required when AI_LLM_PROVIDER='anthropic').
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_DEFAULT: z.string().default('claude-sonnet-4-6'),
  AI_MODEL_PREMIUM: z.string().default('claude-opus-4-7'),
  AI_MAX_DAILY_TOKENS: z.coerce.number().int().nonnegative().default(5_000_000),

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

export const env = parsed.data;
export type Env = typeof env;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
