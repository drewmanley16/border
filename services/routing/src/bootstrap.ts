import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { Env } from "./config/env.js";
import { generateApiKey, hashApiKey } from "./http/apiKeys.js";
import { buildApp } from "./http/app.js";
import { QuoteAggregator, type QuoteCache } from "./providers/aggregator.js";
import { corridorsFromScenario } from "./providers/corridors.js";
import { RpcChainActivity } from "./providers/live/chainActivity.js";
import { FrankfurterHistory, type FxHistory, type FxHistorySource } from "./providers/live/fxHistory.js";
import { FrankfurterRates, type FxRates, type FxRateSource } from "./providers/live/fxRates.js";
import { WiseComparison, type ProviderQuotes, type ProviderQuoteSource } from "./providers/live/providerQuotes.js";
import { RpcNetworkConditions } from "./providers/live/networkConditions.js";
import { ProviderRegistry } from "./providers/registry.js";
import type { ReadingCache } from "./providers/live/cachedReader.js";
import type { ChainActivity } from "./providers/live/chainActivity.js";
import type { NetworkCondition } from "./providers/live/networkConditions.js";
import type { QuoteProvider } from "./providers/types.js";
import { QuoteService } from "./quotes/service.js";
import { MemoryStore } from "./store/memoryStore.js";
import type { Store } from "./store/types.js";

export interface BootstrapOptions {
  env: Env;
  now?: () => Date;
  store?: Store;
  providers?: QuoteProvider[];
  fxRates?: FxRateSource;
  fxHistory?: FxHistorySource;
  providerQuotes?: ProviderQuoteSource;
  logger?: boolean;
  retryDelayMs?: number;
  /** Prints a generated development key. Only the real server wants this. */
  announceDevKey?: (key: string) => void;
}

export async function bootstrap(options: BootstrapOptions): Promise<FastifyInstance> {
  const { env } = options;
  const now = options.now ?? (() => new Date());

  let redis: Redis | undefined;
  let cache: QuoteCache | undefined;
  let readingCaches: { conditions: ReadingCache<NetworkCondition>; activity: ReadingCache<ChainActivity>; fx: ReadingCache<FxRates>; fxHistory: ReadingCache<FxHistory>; quotes: ReadingCache<ProviderQuotes> } | undefined;
  if (env.REDIS_URL) {
    const { createRedis, RedisQuoteCache, RedisReadingCache } = await import("./store/redisCache.js");
    redis = createRedis(env.REDIS_URL);
    // Without a listener, a dropped connection would crash the process.
    redis.on("error", () => undefined);
    cache = new RedisQuoteCache(redis);
    readingCaches = { conditions: new RedisReadingCache(redis), activity: new RedisReadingCache(redis), fx: new RedisReadingCache(redis), fxHistory: new RedisReadingCache(redis), quotes: new RedisReadingCache(redis) };
  }

  const log: { logger?: FastifyBaseLogger } = {};
  const urls = { solana: env.QUICKNODE_SOLANA_URL, ethereum: env.QUICKNODE_ETHEREUM_URL, base: env.QUICKNODE_BASE_URL };
  const conditions = urls.solana || urls.ethereum || urls.base
    ? new RpcNetworkConditions({
        urls,
        now,
        freshForMs: env.NETWORK_CONDITIONS_TTL_MS,
        cache: readingCaches?.conditions,
        onError: (network, reason) => log.logger?.warn({ network, reason }, "live network read failed, using simulated figures"),
      })
    : undefined;
  const activity = urls.ethereum || urls.base
    ? new RpcChainActivity({
        urls,
        now,
        freshForMs: env.NETWORK_CONDITIONS_TTL_MS,
        cache: readingCaches?.activity,
        onError: (chain, reason) => log.logger?.warn({ chain, reason }, "live activity read failed"),
      })
    : undefined;
  const fxRates = options.fxRates ?? new FrankfurterRates({
    now,
    cache: readingCaches?.fx,
    onError: (reason) => log.logger?.warn({ reason }, "exchange rate read failed"),
  });
  const fxHistory = options.fxHistory ?? new FrankfurterHistory({
    now,
    cache: readingCaches?.fxHistory,
    onError: (reason) => log.logger?.warn({ reason }, "exchange rate history read failed"),
  });
  const providerQuotes = options.providerQuotes ?? (env.PROVIDER_QUOTES_ENABLED
    ? new WiseComparison({
        now,
        cache: readingCaches?.quotes,
        onError: (reason) => log.logger?.warn({ reason }, "provider comparison read failed"),
      })
    : undefined);
  const registry = new ProviderRegistry(env.SIMULATION_SCENARIO, now, undefined, options.providers, conditions);

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

  const aggregator = new QuoteAggregator({
    timeoutMs: env.PROVIDER_TIMEOUT_MS,
    concurrency: env.PROVIDER_CONCURRENCY,
    retries: env.PROVIDER_RETRIES,
    retryDelayMs: options.retryDelayMs ?? 100,
    maxQuoteAgeMs: env.MAX_QUOTE_AGE_MS,
    now,
    ...(cache ? { cache } : {}),
  });

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
    ...(conditions ? { conditions } : {}),
    ...(activity ? { activity } : {}),
    fxRates,
    fxHistory,
    ...(providerQuotes ? { providerQuotes } : {}),
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
