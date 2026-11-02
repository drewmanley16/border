import type { DataSource, PaymentEdge } from "../domain/types.js";

export interface ProviderCapabilities {
  countries: string[];
  currencies: string[];
  fundingMethods: string[];
  payoutMethods: string[];
  stablecoins: string[];
  networks: string[];
}

export interface ProviderQuoteRequest {
  source: { country: string; currency: string; amount: string; fundingMethod: string };
  destination: { country: string; currency: string; payoutMethod: string };
  signal: AbortSignal;
}

/** One priced edge, normalized to the common schema by the adapter. */
export interface ProviderQuote {
  edge: PaymentEdge;
  quotedAt: string;
  expiresAt: string;
  /** Omitted when the provider doesn't report it. */
  availableLiquidity?: string;
}

export type HealthStatus = "healthy" | "degraded" | "unavailable";

export interface ProviderHealth {
  status: HealthStatus;
  checkedAt: string;
  detail?: string;
}

export interface QuoteProvider {
  id: string;
  name: string;
  type: "stablecoin" | "bank_fx" | "bridge";
  dataSource: DataSource;
  getCapabilities(): Promise<ProviderCapabilities>;
  getQuotes(request: ProviderQuoteRequest): Promise<ProviderQuote[]>;
  getHealth(): Promise<ProviderHealth>;
}

export type ProviderErrorCode = "unavailable" | "rate_limited" | "upstream_error";

/** Adapters translate their upstream failures into this. */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    /** Quotes are reads, so retrying a transient failure is safe. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
