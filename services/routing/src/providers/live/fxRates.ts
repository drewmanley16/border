import { z } from "zod";
import { CachedReader, type ReadingCache } from "./cachedReader.js";

/**
 * European Central Bank reference rates, through the keyless Frankfurter API.
 * They publish once each working day, and they're mid-market reference rates
 * and not rates any provider offers a customer.
 */
export interface FxRates {
  base: "USD";
  /** The ECB publication date. */
  date: string;
  rates: Record<string, number>;
  observedAt: string;
}

export interface FxRateSource {
  get(): Promise<FxRates | undefined>;
}

const SOURCE_URL = "https://api.frankfurter.dev/v1/latest?base=USD";

const responseSchema = z.object({
  base: z.literal("USD"),
  date: z.iso.date(),
  rates: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().positive()),
});

export interface FrankfurterOptions {
  now: () => Date;
  cache?: ReadingCache<FxRates> | undefined;
  fetch?: typeof globalThis.fetch;
  onError?: (reason: string) => void;
}

export class FrankfurterRates implements FxRateSource {
  private readonly reader: CachedReader<FxRates>;
  private readonly request: typeof globalThis.fetch;

  constructor(private readonly options: FrankfurterOptions) {
    this.request = options.fetch ?? globalThis.fetch;
    this.reader = new CachedReader({ now: options.now, freshForMs: 3_600_000, retryAfterMs: 300_000, cache: options.cache });
  }

  private async read(): Promise<FxRates | undefined> {
    try {
      const response = await this.request(SOURCE_URL, { signal: AbortSignal.timeout(4_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { date, rates } = responseSchema.parse(await response.json());
      if (Object.keys(rates).length === 0) throw new Error("no rates");
      return { base: "USD", date, rates: { ...rates, USD: 1 }, observedAt: this.options.now().toISOString() };
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error.message.slice(0, 200) : "unexpected failure");
      return undefined;
    }
  }

  get(): Promise<FxRates | undefined> {
    return this.reader.get("fx-rates:usd", () => this.read());
  }
}
