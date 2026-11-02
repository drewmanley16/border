import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { Env } from "./config/env.js";
import { generateApiKey, hashApiKey } from "./http/apiKeys.js";
import { buildApp } from "./http/app.js";
import { QuoteAggregator, type QuoteCache } from "./providers/aggregator.js";
import { corridorsFromScenario } from "./providers/corridors.js";
import { ProviderRegistry } from "./providers/registry.js";
import type { QuoteProvider } from "./providers/types.js";
import { QuoteService } from "./quotes/service.js";
import { MemoryStore } from "./store/memoryStore.js";
import type { Store } from "./store/types.js";

export interface BootstrapOptions {
  env: Env;
  now?: () => Date;
  store?: Store;
  providers?: QuoteProvider[];
  logger?: boolean;
  retryDelayMs?: number;
  /** Prints a generated development key. Only the real server wants this. */
  announceDevKey?: (key: string) => void;
}

export async function bootstrap(options: BootstrapOptions): Promise<FastifyInstance> {
  const { env } = options;
  const now = options.now ?? (() => new Date());
  const registry = new ProviderRegistry(env.SIMULATION_SCENARIO, now, undefined, options.providers);

  let store = options.store;
  let storeType: "postgres" | "memory" = "memory";
  if (!store && env.DATABASE_URL) {
    const { createPrismaClient, PrismaStore } = await import("./store/prismaStore.js");
    store = new PrismaStore(createPrismaClient(env.DATABASE_URL));
    storeType = "postgres";
  }
  if (!store) {
    const memory = new MemoryStore(corridorsFromScenario(registry.scenario()!));
    const key = env.DEV_API_KEY ?? generateApiKey();
    memory.addApiKey(hashApiKey(key), { id: "dev", name: "Development key", environment: "sandbox" });
    if (!env.DEV_API_KEY) options.announceDevKey?.(key);
    store = memory;
  }

  let redis: Redis | undefined;
  let cache: QuoteCache | undefined;
  if (env.REDIS_URL) {
    const { createRedis, RedisQuoteCache } = await import("./store/redisCache.js");
    redis = createRedis(env.REDIS_URL);
    // Without a listener, a dropped connection would crash the process.
    redis.on("error", () => undefined);
    cache = new RedisQuoteCache(redis);
  }

  const aggregator = new QuoteAggregator({
    timeoutMs: env.PROVIDER_TIMEOUT_MS,
    concurrency: env.PROVIDER_CONCURRENCY,
    retries: env.PROVIDER_RETRIES,
    retryDelayMs: options.retryDelayMs ?? 100,
    maxQuoteAgeMs: env.MAX_QUOTE_AGE_MS,
    now,
    ...(cache ? { cache } : {}),
  });

  const log: { logger?: FastifyBaseLogger } = {};
  const quotes = new QuoteService({
    store,
    registry,
    aggregator,
    environment: env.STABLEFLOW_ENV,
    now,
    weights: { cost: env.BALANCED_WEIGHT_COST, duration: env.BALANCED_WEIGHT_DURATION, reliability: env.BALANCED_WEIGHT_RELIABILITY },
    onMetricsError: (error) => log.logger?.warn({ err: error }, "could not record provider metrics"),
  });

  const app = await buildApp({
    env,
    store,
    storeType,
    registry,
    quotes,
    now,
    ...(redis ? { redis } : {}),
    ...(options.logger === false ? { logger: false } : {}),
  });
  log.logger = app.log;

  const resolvedStore = store;
  app.addHook("onClose", async () => {
    await resolvedStore.close();
    redis?.disconnect();
  });
  return app;
}
