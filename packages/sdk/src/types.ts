export type OptimizeFor = "lowest_cost" | "fastest" | "most_reliable" | "balanced";
export type DataSource = "simulated" | "live";

export interface CompareRoutesRequest {
  source: {
    country: string;
    currency: string;
    /** A decimal string, such as "1000.00". Numbers are rejected. */
    amount: string;
    fundingMethod: string;
  };
  destination: {
    country: string;
    currency: string;
    payoutMethod: string;
  };
  optimizeFor: OptimizeFor;
  preferences?: {
    /** Stablecoin routes must use one of these. Non-stablecoin routes stay eligible. */
    preferredStablecoins?: string[];
    excludedNetworks?: string[];
    excludedProviders?: string[];
    /** Limit on total estimated cost, including FX spread. */
    maxFeeUSD?: string;
    maxDurationSeconds?: number;
    minSuccessRate?: number;
    balancedWeights?: { cost: number; duration: number; reliability: number };
  };
}

export interface DataProvenance {
  dataSource: DataSource;
  scenario: string | null;
  note: string;
}

export interface RouteStage {
  edgeId: string;
  kind: "funding" | "fx" | "onramp" | "bridge" | "transfer" | "offramp" | "payout";
  providerId: string;
  label: string;
  inputAsset: string;
  inputAmount: string;
  feeAmount: string;
  feeUSD: string;
  outputAsset: string;
  outputAmount: string;
  exchangeRate: string;
  referenceRate: string;
  spreadUSD: string;
  estimatedDurationSeconds: number;
  estimatedSuccessRate: number;
  network?: string;
  dataSource: DataSource;
}

export interface Route {
  id: string;
  quoteId: string;
  rank: number;
  recommended: boolean;
  routeType: "stablecoin" | "traditional";
  provider: string;
  providers: string[];
  stablecoin: string | null;
  network: string | null;
  networks: string[];
  fundingRail: string;
  payoutRail: string;
  exchangeRate: { effective: string; reference: string; fxSpreadBps: string };
  /** Explicit fees only. */
  totalFeeUSD: string;
  fxSpreadUSD: string;
  /** Everything lost against the reference rate: fees, spread and rounding. */
  totalCostUSD: string;
  estimatedDestinationAmount: string;
  destinationCurrency: string;
  estimatedDurationSeconds: number;
  estimatedSuccessRate: number;
  feeBreakdown: {
    funding: string;
    onramp: string;
    network: string;
    bridge: string;
    fx: string;
    offramp: string;
    payout: string;
    totalExplicitFees: string;
    fxSpread: string;
    rounding: string;
    totalCost: string;
  };
  steps: string[];
  stages: RouteStage[];
  quotedAt: string;
  expiresAt: string;
  liquidityKnown: boolean;
  rankingScore: number;
  scoreBreakdown: {
    cost: number;
    duration: number;
    reliability: number;
    total: number;
    weights: { cost: number; duration: number; reliability: number };
  };
  rankingExplanation: string;
  dataProvenance: DataProvenance;
}

export interface ProviderOutcome {
  providerId: string;
  status: string;
  quotes: number;
  latencyMs: number;
  attempts: number;
  detail?: string;
}

export interface CompareRoutesResponse {
  quoteId: string;
  quoteVersion: number;
  environment: "sandbox" | "production";
  createdAt: string;
  expiresAt: string;
  binding: false;
  disclaimer: string;
  sourceAmount: string;
  sourceCurrency: string;
  destinationCurrency: string;
  optimizeFor: OptimizeFor;
  recommendedRouteId: string | null;
  recommendation: string;
  routes: Route[];
  excludedRoutes: { steps: string[]; reason: string; detail?: string }[];
  providers: ProviderOutcome[];
  dataProvenance: DataProvenance;
}

export interface RouteDetail extends Route {
  quoteVersion: number;
  quoteStatus: "active" | "expired";
  quoteCreatedAt: string;
  binding: false;
  disclaimer: string;
  assumptions: string[];
}

export interface RepresentativePlace {
  country: string;
  city: string;
  lat: number;
  lng: number;
  locationType: "representative";
}

export interface RouteVisualization {
  routeId: string;
  quoteId: string;
  kind: "hypothetical_route";
  isRealPayment: false;
  coordinatesAreRepresentative: true;
  expired: boolean;
  disclaimer: string;
  origin: RepresentativePlace;
  destination: RepresentativePlace;
  routeType: "stablecoin" | "traditional";
  network: string | null;
  networks: string[];
  stablecoin: string | null;
  segments: { kind: string; label: string; network: string | null; estimatedDurationSeconds: number }[];
  estimates: { totalCostUSD: string; estimatedDurationSeconds: number; estimatedSuccessRate: number; dataSource: DataSource };
  comparison: { routesCompared: number; rank: number; isCheapest: boolean; isFastest: boolean; isMostReliable: boolean; relativeCost: string };
  animation: { mode: "hypothetical"; label: string; estimatedLatencySeconds: number };
}

export interface Corridor {
  sourceCountry: string;
  destinationCountry: string;
  sourceCurrency: string;
  destinationCurrency: string;
  supportedFundingMethods: string[];
  supportedPayoutMethods: string[];
}

export interface CorridorFilter {
  country?: string;
  currency?: string;
  payoutMethod?: string;
}

export interface Provider {
  id: string;
  name: string;
  type: string;
  mode: DataSource;
  enabled: boolean;
  supportedCountries: string[];
  supportedCurrencies: string[];
  fundingMethods: string[];
  payoutMethods: string[];
  stablecoins: string[];
  blockchains: string[];
  health: { status: string; checkedAt: string; detail?: string };
}

export interface Health {
  status: "ok" | "degraded" | "unavailable";
  environment: "sandbox" | "production";
  version: string;
  dependencies: {
    database: { status: string; type: string };
    redis: { status: string };
    providers: { total: number; healthy: number; degraded: number; unavailable: number };
  };
}
