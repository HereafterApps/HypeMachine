import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as dotenv } from 'dotenv';
import { z } from 'zod';

// Load .env from the nearest of: cwd, then the monorepo root.
for (const candidate of [resolve('.env'), resolve('../../.env')]) {
  if (existsSync(candidate)) {
    dotenv({ path: candidate });
    break;
  }
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  API_PORT: z.coerce.number().default(3001),
  API_TOKEN: z.string().min(1).default('change-me'),
  PIPELINE_URL: z.string().default('http://127.0.0.1:8300'),
  PIPELINE_TOKEN: z.string().default('dev-pipeline-token'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  NOTIFY_CHANNELS: z.string().default('console'),
  DASHBOARD_BASE_URL: z.string().default('http://localhost:3000'),
  TOKEN_ENCRYPTION_KEY: z.string().min(16).default('dev-only-encryption-key-change-me'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(overrides: Partial<Env> = {}): Env {
  return EnvSchema.parse({ ...process.env, ...overrides });
}
