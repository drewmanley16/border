import type { CorridorRecord } from "../providers/corridors.js";
import type { DataSource } from "../domain/types.js";

export interface ApiKeyRecord {
  id: string;
  name: string;
  environment: "sandbox" | "production";
}

export interface RouteRecord {
  id: string;
  quoteId: string;
  rank: number;
  providerIds: string[];
  network: string | null;
  stablecoin: string | null;
  totalFees: string;
  recipientAmount: string;
  estimatedDuration: number;
  reliability: string;
  rankingScore: string;
  details: Record<string, unknown>;
}

export interface QuoteRecord {
  id: string;
  apiKeyId: string;
  version: number;
  requestPayload: Record<string, unknown>;
  scenario: string | null;
  createdAt: Date;
  expiresAt: Date;
  environment: "sandbox" | "production";
  routes: RouteRecord[];
}

export interface MetricRecord {
  providerId: string;
  observedLatency: number;
  healthStatus: string;
  environment: "sandbox" | "production";
  dataSource: DataSource;
}

export interface CorridorFilter {
  country?: string;
  currency?: string;
  payoutMethod?: string;
}

export interface Store {
  findActiveApiKey(keyHash: string): Promise<ApiKeyRecord | null>;
  saveQuote(quote: QuoteRecord): Promise<void>;
  /** Scoped to the key that created the quote. */
  findQuoteByRoute(routeId: string, apiKeyId: string): Promise<QuoteRecord | null>;
  listCorridors(filter?: CorridorFilter): Promise<CorridorRecord[]>;
  disabledProviderIds(): Promise<Set<string>>;
  recordMetrics(metrics: MetricRecord[]): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export function matchesCorridor(corridor: CorridorRecord, filter: CorridorFilter = {}): boolean {
  const { country, currency, payoutMethod } = filter;
  if (!corridor.enabled) return false;
  if (country && corridor.sourceCountry !== country && corridor.destinationCountry !== country) return false;
  if (currency && corridor.sourceCurrency !== currency && corridor.destinationCurrency !== currency) return false;
  if (payoutMethod && !corridor.supportedPayoutMethods.includes(payoutMethod)) return false;
  return true;
}
