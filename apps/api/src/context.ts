import type { PrismaClient } from '@hype/db';
import { getPrisma } from '@hype/db';
import { createLlmProvider, type LlmProvider } from '@hype/ai';
import { createNotifier, type Notifier } from '@hype/notifications';
import { PublishingRegistry } from '@hype/publishing';
import { createStorageAdapter, type StorageAdapter } from '@hype/storage';
import { loadEnv, type Env } from './env.js';
import { TokenCrypto } from './lib/crypto.js';

export interface AppContext {
  env: Env;
  prisma: PrismaClient;
  llm: LlmProvider;
  storage: StorageAdapter;
  notifier: Notifier;
  publishing: PublishingRegistry;
  crypto: TokenCrypto;
}

export function createContext(overrides: Partial<AppContext> = {}): AppContext {
  const env = overrides.env ?? loadEnv();
  const storage = overrides.storage ?? createStorageAdapter(env.STORAGE_DRIVER);
  return {
    env,
    prisma: overrides.prisma ?? getPrisma(),
    llm: overrides.llm ?? createLlmProvider(env.LLM_PROVIDER),
    storage,
    notifier: overrides.notifier ?? createNotifier(),
    publishing: overrides.publishing ?? new PublishingRegistry(storage),
    crypto: overrides.crypto ?? new TokenCrypto(env.TOKEN_ENCRYPTION_KEY),
  };
}
