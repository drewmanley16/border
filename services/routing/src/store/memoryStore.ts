import type { CorridorRecord } from "../providers/corridors.js";
import { matchesCorridor, type ApiKeyRecord, type CorridorFilter, type MetricRecord, type QuoteRecord, type Store } from "./types.js";

/** For local development and tests. Nothing survives a restart. */
export class MemoryStore implements Store {
  private readonly keys = new Map<string, ApiKeyRecord>();
  private readonly quotes = new Map<string, QuoteRecord>();
  private readonly routeIndex = new Map<string, string>();
  readonly metrics: MetricRecord[] = [];

  constructor(private readonly corridors: CorridorRecord[]) {}

  addApiKey(keyHash: string, record: ApiKeyRecord): void {
    this.keys.set(keyHash, record);
  }

  async findActiveApiKey(keyHash: string) {
    return this.keys.get(keyHash) ?? null;
  }

  async saveQuote(quote: QuoteRecord) {
    this.quotes.set(quote.id, quote);
    for (const route of quote.routes) this.routeIndex.set(route.id, quote.id);
  }

  async findQuoteByRoute(routeId: string, apiKeyId: string) {
    const quote = this.quotes.get(this.routeIndex.get(routeId) ?? "");
    return quote?.apiKeyId === apiKeyId ? quote : null;
  }

  async listCorridors(filter?: CorridorFilter) {
    return this.corridors.filter((corridor) => matchesCorridor(corridor, filter));
  }

  async disabledProviderIds() {
    return new Set<string>();
  }

  async recordMetrics(metrics: MetricRecord[]) {
    this.metrics.push(...metrics);
    this.metrics.splice(0, Math.max(0, this.metrics.length - 1000));
  }

  async ping() {}
  async close() {}
}
