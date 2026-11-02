import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "../domain/errors.js";
import { bps, Decimal, formatAsset, formatUSD, parseAmount } from "../domain/money.js";
import type { BalancedWeights, CompareRequest, DataSource, FeeBreakdown, RankedRoute, RouteStage, ScoreBreakdown } from "../domain/types.js";
import type { AggregationResult, ProviderOutcome, QuoteAggregator } from "../providers/aggregator.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { runEngine, validatePreferences, type ExcludedRoute } from "../routing/engine.js";
import { referenceRates } from "../routing/rates.js";
import type { QuoteRecord, RouteRecord, Store } from "../store/types.js";

export const QUOTE_VERSION = 1;

export const ESTIMATE_DISCLAIMER =
  "Nonbinding estimates for comparison only. Rates are not guaranteed and no payment can be made from this quote.";
const SIMULATED_NOTE =
  "Fees, rates, durations and reliability figures are simulated and illustrative unless a stage is marked live. Live stages estimate a typical transfer from observed network conditions. None of this is the actual cost or performance of any real provider.";

const LIVE_NOTE = "Built from live provider quotes. Figures remain nonbinding estimates.";

/** A response only counts as live when every route in it is entirely live. */
const allRoutesLive = (routes: readonly RankedRoute[]) => routes.length > 0 && routes.every((route) => route.dataSource === "live");

export const ASSUMPTIONS = [
  "Figures are nonbinding estimates, and no rate is guaranteed.",
  "Costs are measured against the reference rate, with explicit fees and FX spread tracked separately.",
  "Each stage's fee applies to the amount remaining at that stage, and each stage settles to its asset's minor units.",
  "Stages in one failure domain are treated as fully correlated. Separate domains are treated as independent.",
  "Duration is the sum of stage estimates, end to end.",
  "A quote does not make a payment executable or compliant. This service does not move money.",
];

export interface RouteDto {
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
  totalFeeUSD: string;
  fxSpreadUSD: string;
  totalCostUSD: string;
  estimatedDestinationAmount: string;
  destinationCurrency: string;
  estimatedDurationSeconds: number;
  estimatedSuccessRate: number;
  feeBreakdown: FeeBreakdown;
  steps: string[];
  stages: RouteStage[];
  quotedAt: string;
  expiresAt: string;
  liquidityKnown: boolean;
  rankingScore: number;
  scoreBreakdown: ScoreBreakdown;
  rankingExplanation: string;
  dataProvenance: { dataSource: DataSource; scenario: string | null; note: string };
}

export interface CompareResponse {
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
  optimizeFor: CompareRequest["optimizeFor"];
  recommendedRouteId: string | null;
  recommendation: string;
  routes: RouteDto[];
  excludedRoutes: ExcludedRoute[];
  providers: ProviderOutcome[];
  dataProvenance: { dataSource: DataSource; scenario: string | null; note: string };
}

interface ServiceOptions {
  store: Store;
  registry: ProviderRegistry;
  aggregator: QuoteAggregator;
  weights: BalancedWeights;
  environment: "sandbox" | "production";
  now: () => Date;
  onMetricsError?: (error: unknown) => void;
}

const routeId = (quoteId: string, fingerprint: string) =>
  `route_${createHash("sha256").update(`${quoteId}|${fingerprint}`).digest("hex").slice(0, 24)}`;

export class QuoteService {
  constructor(private readonly options: ServiceOptions) {}

  private async assertCorridor(request: CompareRequest): Promise<void> {
    const { source, destination } = request;
    const corridors = await this.options.store.listCorridors();
    const corridor = corridors.find(
      (row) =>
        row.sourceCountry === source.country &&
        row.destinationCountry === destination.country &&
        row.sourceCurrency === source.currency &&
        row.destinationCurrency === destination.currency,
    );
    const name = `${source.country}/${source.currency} to ${destination.country}/${destination.currency}`;
    if (!corridor) {
      throw new ApiError(422, "unsupported_corridor", `The corridor ${name} is not supported.`, { hint: "See GET /v1/corridors." });
    }
    if (!corridor.supportedFundingMethods.includes(source.fundingMethod)) {
      throw new ApiError(422, "unsupported_funding_method", `${source.fundingMethod} isn't available for ${name}.`, { supported: corridor.supportedFundingMethods });
    }
    if (!corridor.supportedPayoutMethods.includes(destination.payoutMethod)) {
      throw new ApiError(422, "unsupported_payout_method", `${destination.payoutMethod} isn't available for ${name}.`, { supported: corridor.supportedPayoutMethods });
    }
  }

  private toDto(route: RankedRoute, quoteId: string, scenario: string | null, source: { amount: string; currency: string }, rates: ReturnType<typeof referenceRates>): RouteDto {
    const sourceUSD = new Decimal(source.amount).mul(rates.usdValue(source.currency));
    return {
      id: routeId(quoteId, route.fingerprint),
      quoteId,
      rank: route.rank,
      recommended: route.recommended,
      routeType: route.routeType,
      provider: route.provider,
      providers: route.providers,
      stablecoin: route.stablecoin,
      network: route.network,
      networks: route.networks,
      fundingRail: route.fundingRail,
      payoutRail: route.payoutRail,
      exchangeRate: {
        effective: route.effectiveRate.toDecimalPlaces(8).toString(),
        reference: route.referenceRate.toDecimalPlaces(8).toString(),
        fxSpreadBps: route.fxSpreadUSD.div(sourceUSD).div(bps(1)).toFixed(2),
      },
      totalFeeUSD: route.fees.totalExplicitFees,
      fxSpreadUSD: route.fees.fxSpread,
      totalCostUSD: formatUSD(route.totalCostUSD),
      estimatedDestinationAmount: formatAsset(route.recipientAmount, route.destinationCurrency),
      destinationCurrency: route.destinationCurrency,
      estimatedDurationSeconds: route.durationSeconds,
      estimatedSuccessRate: route.reliability.toDecimalPlaces(4).toNumber(),
      feeBreakdown: route.fees,
      steps: route.steps,
      stages: route.stages,
      quotedAt: route.quotedAt.toISOString(),
      expiresAt: route.expiresAt.toISOString(),
      liquidityKnown: route.liquidityKnown,
      rankingScore: Number(route.rankingScore.toFixed(6)),
      scoreBreakdown: route.score,
      rankingExplanation: route.rankingExplanation,
      dataProvenance: { dataSource: route.dataSource, scenario: route.dataSource === "live" ? null : scenario, note: route.dataSource === "live" ? LIVE_NOTE : SIMULATED_NOTE },
    };
  }

  async compare(request: CompareRequest, apiKeyId: string, scenarioName?: string): Promise<CompareResponse> {
    const { store, registry, aggregator, weights, environment, now } = this.options;
    const scenario = registry.scenario(scenarioName);
    if (!scenario) {
      throw new ApiError(400, "unknown_scenario", `Unknown simulation scenario: ${scenarioName}.`, { supported: registry.scenarioNames() });
    }

    parseAmount(request.source.amount, request.source.currency);
    validatePreferences(request.preferences);
    await this.assertCorridor(request);

    const disabled = await store.disabledProviderIds();
    const providers = registry.providers(scenario.name).filter((provider) => !disabled.has(provider.id));
    const collected: AggregationResult = await aggregator.collect(`${environment}:${scenario.name}`, providers, { source: request.source, destination: request.destination });

    if (collected.outcomes.length > 0 && !collected.outcomes.some((outcome) => outcome.status === "ok" || outcome.status === "no_coverage")) {
      throw new ApiError(503, "no_providers_available", "No provider returned a usable quote. Try again shortly.", { providers: collected.outcomes });
    }

    const createdAt = now();
    const rates = referenceRates(scenario.usdPerUnit);
    const result = runEngine(request, collected.quotes, rates, weights, createdAt);

    const quoteId = `quote_${randomUUID().replaceAll("-", "")}`;
    const scenarioLabel = scenario.name;
    const sources = new Map(providers.map((provider) => [provider.id, provider.dataSource]));
    const isLive = allRoutesLive(result.routes);
    const routes = result.routes.map((route) => this.toDto(route, quoteId, scenarioLabel, request.source, rates));
    const expiresAt = routes.length > 0
      ? new Date(Math.min(...routes.map((route) => new Date(route.expiresAt).getTime())))
      : new Date(createdAt.getTime() + scenario.quoteTtlSeconds * 1000);

    const records: RouteRecord[] = routes.map((route) => ({
      id: route.id,
      quoteId,
      rank: route.rank,
      providerIds: route.providers,
      network: route.network,
      stablecoin: route.stablecoin,
      totalFees: route.totalCostUSD,
      recipientAmount: route.estimatedDestinationAmount,
      estimatedDuration: route.estimatedDurationSeconds,
      reliability: String(route.estimatedSuccessRate),
      rankingScore: String(route.rankingScore),
      details: route as unknown as Record<string, unknown>,
    }));

    await store.saveQuote({
      id: quoteId,
      apiKeyId,
      version: QUOTE_VERSION,
      requestPayload: request as unknown as Record<string, unknown>,
      scenario: scenarioLabel,
      createdAt,
      expiresAt,
      environment,
      routes: records,
    });

    // Metrics must never fail or slow a quote.
    void store
      .recordMetrics(
        collected.outcomes.map((outcome) => ({
          providerId: outcome.providerId,
          observedLatency: outcome.latencyMs,
          healthStatus: outcome.status,
          environment,
          dataSource: sources.get(outcome.providerId) ?? "simulated",
        })),
      )
      .catch((error: unknown) => this.options.onMetricsError?.(error));

    const best = routes[0];
    return {
      quoteId,
      quoteVersion: QUOTE_VERSION,
      environment,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      binding: false,
      disclaimer: ESTIMATE_DISCLAIMER,
      sourceAmount: formatAsset(new Decimal(request.source.amount), request.source.currency),
      sourceCurrency: request.source.currency,
      destinationCurrency: request.destination.currency,
      optimizeFor: request.optimizeFor,
      recommendedRouteId: best?.id ?? null,
      recommendation: best?.rankingExplanation ?? "No route met this request. See excludedRoutes and providers for the reasons.",
      routes,
      excludedRoutes: result.excluded,
      providers: collected.outcomes,
      dataProvenance: { dataSource: isLive ? "live" : "simulated", scenario: isLive ? null : scenarioLabel, note: isLive ? LIVE_NOTE : SIMULATED_NOTE },
    };
  }

  async findRoute(routeIdValue: string, apiKeyId: string): Promise<{ quote: QuoteRecord; route: RouteDto }> {
    const quote = await this.options.store.findQuoteByRoute(routeIdValue, apiKeyId);
    const record = quote?.routes.find((route) => route.id === routeIdValue);
    if (!quote || !record) throw new ApiError(404, "route_not_found", `No route found with id ${routeIdValue}.`);
    return { quote, route: record.details as unknown as RouteDto };
  }
}
