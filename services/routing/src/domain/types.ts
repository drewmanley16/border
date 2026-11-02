import type { Decimal } from "./money.js";

export type DataSource = "simulated" | "live";
export type OptimizeFor = "lowest_cost" | "fastest" | "most_reliable" | "balanced";

export type EdgeKind = "funding" | "fx" | "onramp" | "bridge" | "transfer" | "offramp" | "payout";

export interface FeeModel {
  /** Percentage of the amount entering the edge, in basis points. */
  percentBps: string;
  /** Flat fee, in the edge's input asset. */
  fixed: string;
  min?: string;
  max?: string;
}

export interface PaymentEdge {
  id: string;
  providerId: string;
  kind: EdgeKind;
  label: string;

  sourceNode: string;
  destinationNode: string;
  inputAsset: string;
  outputAsset: string;

  feeModel: FeeModel;
  /** Customer rate: output units per input unit, after any spread. */
  exchangeRate?: string;
  /** Mid-market rate the spread is measured against. */
  referenceRate?: string;

  estimatedDurationSeconds: number;
  estimatedSuccessRate: number;
  /** Stages in one domain fail together. See routing/reliability.ts. */
  failureDomain: string;

  minAmount?: string;
  maxAmount?: string;

  network?: string;
  stablecoin?: string;

  enabled: boolean;
  dataSource: DataSource;
}

export interface Preferences {
  preferredStablecoins?: string[];
  excludedNetworks?: string[];
  excludedProviders?: string[];
  maxFeeUSD?: string;
  maxDurationSeconds?: number;
  minSuccessRate?: number;
  balancedWeights?: BalancedWeights;
}

export interface BalancedWeights {
  cost: number;
  duration: number;
  reliability: number;
}

export interface CompareRequest {
  source: { country: string; currency: string; amount: string; fundingMethod: string };
  destination: { country: string; currency: string; payoutMethod: string };
  optimizeFor: OptimizeFor;
  preferences?: Preferences;
}

export interface RouteStage {
  edgeId: string;
  kind: EdgeKind;
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

export interface FeeBreakdown {
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
}

export interface EvaluatedRoute {
  fingerprint: string;
  routeType: "stablecoin" | "traditional";
  provider: string;
  providers: string[];
  stablecoin: string | null;
  network: string | null;
  networks: string[];
  fundingRail: string;
  payoutRail: string;
  stages: RouteStage[];
  steps: string[];
  fees: FeeBreakdown;

  sourceAmount: Decimal;
  recipientAmount: Decimal;
  destinationCurrency: string;
  /** Destination units per source unit, after every fee and spread. */
  effectiveRate: Decimal;
  referenceRate: Decimal;
  totalCostUSD: Decimal;
  explicitFeesUSD: Decimal;
  fxSpreadUSD: Decimal;
  durationSeconds: number;
  reliability: Decimal;
  dataSource: DataSource;
  expiresAt: Date;
  /** Provider quotes this route was built from. */
  quotedAt: Date;
  liquidityKnown: boolean;
}

export interface ScoreBreakdown {
  cost: number;
  duration: number;
  reliability: number;
  weights: BalancedWeights;
  /** Lower is better. */
  total: number;
}

export interface RankedRoute extends EvaluatedRoute {
  rank: number;
  recommended: boolean;
  rankingScore: number;
  score: ScoreBreakdown;
  rankingExplanation: string;
}
