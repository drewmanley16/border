import { z } from "zod";
import { CachedReader, type ReadingCache } from "./cachedReader.js";

/** Daily ECB reference rates for one currency pair, through Frankfurter. */
export interface FxHistory {
  from: string;
  to: string;
  points: { date: string; rate: number }[];
  observedAt: string;
}

export interface FxHistorySource {
  get(from: string, to: string): Promise<FxHistory | undefined>;
}

const DAYS = 30;
const responseSchema = z.object({
  rates: z.record(z.iso.date(), z.record(z.string(), z.number().positive())),
});

export interface FrankfurterHistoryOptions {
  now: () => Date;
  cache?: ReadingCache<FxHistory> | undefined;
  fetch?: typeof globalThis.fetch;
  onError?: (reason: string) => void;
}

export class FrankfurterHistory implements FxHistorySource {
  private readonly reader: CachedReader<FxHistory>;
  private readonly request: typeof globalThis.fetch;

  constructor(private readonly options: FrankfurterHistoryOptions) {
    this.request = options.fetch ?? globalThis.fetch;
    this.reader = new CachedReader({ now: options.now, freshForMs: 6 * 3_600_000, retryAfterMs: 300_000, cache: options.cache });
  }

  private async read(from: string, to: string): Promise<FxHistory | undefined> {
    try {
      const now = this.options.now();
      const start = new Date(now.getTime() - DAYS * 86_400_000).toISOString().slice(0, 10);
      const query = new URLSearchParams({ base: from, symbols: to });
      const response = await this.request(`https://api.frankfurter.dev/v1/${start}..?${query}`, { signal: AbortSignal.timeout(4_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { rates } = responseSchema.parse(await response.json());
      const points = Object.entries(rates)
        .flatMap(([date, values]) => (values[to] === undefined ? [] : [{ date, rate: values[to] }]))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (points.length < 2) throw new Error("too few points");
      return { from, to, points, observedAt: now.toISOString() };
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error.message.slice(0, 200) : "unexpected failure");
      return undefined;
    }
  }

  get(from: string, to: string): Promise<FxHistory | undefined> {
    if (from === to) return Promise.resolve(undefined);
    return this.reader.get(`fx-history:${from}:${to}`, () => this.read(from, to));
  }
}
