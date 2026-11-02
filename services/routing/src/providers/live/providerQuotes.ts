import { z } from "zod";
import { CachedReader, type ReadingCache } from "./cachedReader.js";

/**
 * What named providers deliver for a transfer, from Wise's public comparison
 * API. Wise collects these and is itself listed, so they're credited as Wise's
 * data. Each quote keeps its own collection time because they differ by hours.
 */
export interface ProviderQuoteRow {
  name: string;
  type: "bank" | "provider";
  fee: number;
  rate: number;
  received: number;
  /** Wise considers this quote to be at the mid-market rate. */
  midMarket: boolean;
  collectedAt: string;
  deliveryHours: { min: number; max: number } | null;
}

export interface ProviderQuoteRequest {
  from: string;
  to: string;
  amount: number;
  fromCountry?: string | undefined;
  toCountry?: string | undefined;
}

export interface ProviderQuotes {
  quotes: ProviderQuoteRow[];
  observedAt: string;
}

export interface ProviderQuoteSource {
  get(request: ProviderQuoteRequest): Promise<ProviderQuotes | undefined>;
}

const responseSchema = z.object({
  providers: z.array(z.object({
    name: z.string(),
    type: z.string(),
    quotes: z.array(z.object({
      fee: z.number().nullish(),
      isConsideredMidMarketRate: z.boolean().nullish(),
      rate: z.number().nullish(),
      receivedAmount: z.number().nullish(),
      dateCollected: z.string(),
      sourceCountry: z.string().nullish(),
      targetCountry: z.string().nullish(),
      deliveryEstimation: z.object({
        providerGivesEstimate: z.boolean().nullish(),
        duration: z.object({ min: z.string().nullish(), max: z.string().nullish() }).nullish(),
      }).nullish(),
    })),
  })),
});

type RawProviders = z.infer<typeof responseSchema>["providers"];
type RawQuote = RawProviders[number]["quotes"][number];

/** Reads `PT48H` or `PT90M`. Anything else is left as unknown. */
function hours(duration: string | null | undefined): number | null {
  const match = duration?.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?$/);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  return Number(match[1] ?? 0) + Number(match[2] ?? 0) / 60;
}

function delivery(quote: RawQuote): ProviderQuoteRow["deliveryHours"] {
  const estimate = quote.deliveryEstimation;
  if (!estimate?.providerGivesEstimate) return null;
  const min = hours(estimate.duration?.min);
  const max = hours(estimate.duration?.max);
  return min === null || max === null ? null : { min, max };
}

/** A quote for another country isn't an answer, but a quote for no country in particular is. */
const applies = (value: string | null | undefined, country: string | undefined) => !value || !country || value === country;

export function toRows(providers: RawProviders, request: ProviderQuoteRequest): ProviderQuoteRow[] {
  const rows: ProviderQuoteRow[] = [];
  for (const provider of providers) {
    const usable = provider.quotes.flatMap((quote) => {
      const { fee, rate, receivedAmount: received } = quote;
      if (fee == null || rate == null || received == null || received <= 0) return [];
      if (!applies(quote.sourceCountry, request.fromCountry) || !applies(quote.targetCountry, request.toCountry)) return [];
      return [{ quote, fee, rate, received }];
    });
    const best = usable.sort((a, b) => b.received - a.received)[0];
    if (!best) continue;
    rows.push({
      name: provider.name,
      type: provider.type === "bank" ? "bank" : "provider",
      fee: best.fee,
      rate: best.rate,
      received: best.received,
      midMarket: best.quote.isConsideredMidMarketRate === true,
      collectedAt: best.quote.dateCollected,
      deliveryHours: delivery(best.quote),
    });
  }
  return rows.sort((a, b) => b.received - a.received);
}

export interface WiseOptions {
  now: () => Date;
  cache?: ReadingCache<ProviderQuotes> | undefined;
  fetch?: typeof globalThis.fetch;
  onError?: (reason: string) => void;
}

export class WiseComparison implements ProviderQuoteSource {
  private readonly reader: CachedReader<ProviderQuotes>;
  private readonly request: typeof globalThis.fetch;

  constructor(private readonly options: WiseOptions) {
    this.request = options.fetch ?? globalThis.fetch;
    this.reader = new CachedReader({ now: options.now, freshForMs: 3_600_000, retryAfterMs: 300_000, cache: options.cache });
  }

  private async read(request: ProviderQuoteRequest): Promise<ProviderQuotes | undefined> {
    try {
      const query = new URLSearchParams({ sourceCurrency: request.from, targetCurrency: request.to, sendAmount: String(request.amount) });
      const response = await this.request(`https://api.wise.com/v4/comparisons/?${query}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { providers } = responseSchema.parse(await response.json());
      return { quotes: toRows(providers, request), observedAt: this.options.now().toISOString() };
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error.message.slice(0, 200) : "unexpected failure");
      return undefined;
    }
  }

  get(request: ProviderQuoteRequest): Promise<ProviderQuotes | undefined> {
    const { from, to, amount, fromCountry, toCountry } = request;
    return this.reader.get(`provider-quotes:${from}:${to}:${amount}:${fromCountry ?? ""}:${toCountry ?? ""}`, () => this.read(request));
  }
}
