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
