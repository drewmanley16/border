import { Redis } from "ioredis";
import type { QuoteCache } from "../providers/aggregator.js";
import type { ProviderQuote } from "../providers/types.js";

export function createRedis(url: string): Redis {
  // Commands wait for the connection, which a serverless cold start has to open.
  return new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 3_000 });
}

/** Keeps quotes for no longer than they're valid. Failures just skip the cache. */
export class RedisQuoteCache implements QuoteCache {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<ProviderQuote[] | null> {
    const value = await this.redis.get(key);
    return value ? (JSON.parse(value) as ProviderQuote[]) : null;
  }

  async set(key: string, quotes: ProviderQuote[], ttlMs: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(quotes), "PX", Math.ceil(ttlMs));
  }
}
