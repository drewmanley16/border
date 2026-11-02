import { z } from "zod";
import { isDecimalString, Decimal } from "../domain/money.js";
import { assetDecimals } from "../domain/assets.js";
import { ProviderError, type ProviderQuote, type ProviderQuoteRequest, type QuoteProvider } from "./types.js";

export type ProviderStatus = "ok" | "no_coverage" | "timeout" | "unavailable" | "rate_limited" | "invalid_response" | "error" | "stale_quotes";

export interface ProviderOutcome {
  providerId: string;
  status: ProviderStatus;
  quotes: number;
  latencyMs: number;
  attempts: number;
  detail?: string;
}

export interface AggregationResult {
  quotes: ProviderQuote[];
  outcomes: ProviderOutcome[];
}

export interface AggregatorOptions {
  timeoutMs: number;
  /** Per-provider overrides of `timeoutMs`. */
  providerTimeoutsMs?: Record<string, number>;
  concurrency: number;
  retries: number;
  retryDelayMs: number;
  /** Quotes older than this are refused, whatever their stated expiry. */
  maxQuoteAgeMs: number;
  now: () => Date;
  cache?: QuoteCache;
}

export interface QuoteCache {
  get(key: string): Promise<ProviderQuote[] | null>;
  set(key: string, quotes: ProviderQuote[], ttlMs: number): Promise<void>;
}

const decimal = z.string().refine(isDecimalString, "must be a non-negative decimal string");

const edgeSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  kind: z.enum(["funding", "fx", "onramp", "bridge", "transfer", "offramp", "payout"]),
  label: z.string().min(1),
  sourceNode: z.string().min(1),
  destinationNode: z.string().min(1),
  inputAsset: z.string().min(1),
  outputAsset: z.string().min(1),
  feeModel: z.object({ percentBps: decimal, fixed: decimal, min: decimal.optional(), max: decimal.optional() }),
  exchangeRate: decimal.optional(),
  referenceRate: decimal.optional(),
  estimatedDurationSeconds: z.number().int().nonnegative(),
  estimatedSuccessRate: z.number().gt(0).lte(1),
  failureDomain: z.string().min(1),
  minAmount: decimal.optional(),
  maxAmount: decimal.optional(),
  network: z.string().optional(),
  stablecoin: z.string().optional(),
  enabled: z.boolean(),
  dataSource: z.enum(["simulated", "live"]),
});

const quoteSchema = z.object({
  edge: edgeSchema,
  quotedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  availableLiquidity: decimal.optional(),
});

class InvalidResponse extends Error {}

/** Refuses anything the routing engine can't safely price. */
function validate(provider: QuoteProvider, raw: unknown): ProviderQuote[] {
  const parsed = z.array(quoteSchema).safeParse(raw);
  if (!parsed.success) throw new InvalidResponse(parsed.error.issues[0]?.message ?? "Quote failed validation");

  const quotes: ProviderQuote[] = parsed.data;
  for (const { edge } of quotes) {
    if (edge.providerId !== provider.id) throw new InvalidResponse(`Edge ${edge.id} belongs to another provider`);
    const liveStage = edge.dataSource === "live" && provider.liveEdgeKinds?.includes(edge.kind);
    if (edge.dataSource !== provider.dataSource && !liveStage) throw new InvalidResponse(`Edge ${edge.id} has the wrong data source`);
    try {
      assetDecimals(edge.inputAsset);
      assetDecimals(edge.outputAsset);
    } catch {
      throw new InvalidResponse(`Edge ${edge.id} uses an unknown asset`);
    }
    if (edge.exchangeRate !== undefined && new Decimal(edge.exchangeRate).lte(0)) {
      throw new InvalidResponse(`Edge ${edge.id} has a non-positive rate`);
    }
    if (edge.exchangeRate !== undefined && edge.referenceRate !== undefined && new Decimal(edge.exchangeRate).gt(edge.referenceRate)) {
      throw new InvalidResponse(`Edge ${edge.id} quotes better than its reference rate`);
    }
    if (edge.inputAsset !== edge.outputAsset && edge.exchangeRate === undefined) {
      throw new InvalidResponse(`Edge ${edge.id} converts assets without a rate`);
    }
  }
  return quotes;
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException("Provider timed out", "TimeoutError");
      controller.abort(error);
      reject(error);
    }, ms);
  });
  return Promise.race([run(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

async function mapConcurrent<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Collects quotes from every provider. A provider's failure is recorded as an
 * outcome and never reaches the caller, so one outage only removes its routes.
 */
export class QuoteAggregator {
  constructor(private readonly options: AggregatorOptions) {}

  private cacheKey(scope: string, provider: QuoteProvider, request: Omit<ProviderQuoteRequest, "signal">): string {
    const { source, destination } = request;
    return ["quotes", scope, provider.id, source.country, source.currency, source.fundingMethod, source.amount, destination.country, destination.currency, destination.payoutMethod].join(":");
  }

  private async fetchOne(scope: string, provider: QuoteProvider, request: Omit<ProviderQuoteRequest, "signal">): Promise<ProviderOutcome & { received: ProviderQuote[] }> {
    const { options } = this;
    const started = performance.now();
    const finish = (status: ProviderStatus, attempts: number, received: ProviderQuote[] = [], detail?: string) => ({
      providerId: provider.id,
      status,
      quotes: received.length,
      latencyMs: Math.round(performance.now() - started),
      attempts,
      received,
      ...(detail ? { detail } : {}),
    });

    const key = this.cacheKey(scope, provider, request);
    const cached = await options.cache?.get(key).catch(() => null);
    if (cached) {
      const fresh = this.dropStale(cached);
      if (fresh.length === cached.length) return finish("ok", 0, fresh, "served from cache");
    }

    const timeoutMs = options.providerTimeoutsMs?.[provider.id] ?? options.timeoutMs;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const raw = await withTimeout((signal) => provider.getQuotes({ ...request, signal }), timeoutMs);
        const quotes = validate(provider, raw);
        if (quotes.length === 0) return finish("no_coverage", attempt);
        const fresh = this.dropStale(quotes);
        if (fresh.length === 0) return finish("stale_quotes", attempt, [], "All quotes were expired or too old.");
        await this.store(key, fresh);
        return finish("ok", attempt, fresh);
      } catch (error) {
        const retryable = error instanceof ProviderError ? error.retryable : error instanceof DOMException && error.name === "TimeoutError";
        if (retryable && attempt <= options.retries) {
          await delay(options.retryDelayMs * attempt);
          continue;
        }
        if (error instanceof InvalidResponse) return finish("invalid_response", attempt, [], error.message);
        if (error instanceof DOMException && error.name === "TimeoutError") return finish("timeout", attempt, [], `No response within ${timeoutMs}ms.`);
        if (error instanceof ProviderError) {
          const status = error.code === "rate_limited" ? "rate_limited" : error.code === "unavailable" ? "unavailable" : "error";
          return finish(status, attempt, [], error.message);
        }
        return finish("error", attempt, [], "The provider adapter failed unexpectedly.");
      }
    }
  }

  private dropStale(quotes: ProviderQuote[]): ProviderQuote[] {
    const now = this.options.now().getTime();
    return quotes.filter((quote) => new Date(quote.expiresAt).getTime() > now && now - new Date(quote.quotedAt).getTime() <= this.options.maxQuoteAgeMs);
  }

  private async store(key: string, quotes: ProviderQuote[]): Promise<void> {
    const { cache, now } = this.options;
    if (!cache) return;
    const earliest = Math.min(...quotes.map((quote) => new Date(quote.expiresAt).getTime()));
    const ttlMs = Math.min(earliest - now().getTime(), this.options.maxQuoteAgeMs);
    if (ttlMs > 0) await cache.set(key, quotes, ttlMs).catch(() => undefined);
  }

  /** `scope` partitions the cache, so quotes never cross scenarios or environments. */
  async collect(scope: string, providers: readonly QuoteProvider[], request: Omit<ProviderQuoteRequest, "signal">): Promise<AggregationResult> {
    const results = await mapConcurrent(providers, this.options.concurrency, (provider) => this.fetchOne(scope, provider, request));
    return {
      quotes: results.flatMap((result) => result.received),
      outcomes: results.map(({ received: _received, ...outcome }) => outcome),
    };
  }
}
