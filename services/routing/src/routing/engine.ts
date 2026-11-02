import { isSupportedPair, isStablecoin, NETWORKS, STABLECOIN_NETWORKS } from "../domain/assets.js";
import { ApiError } from "../domain/errors.js";
import { Decimal, parseAmount } from "../domain/money.js";
import type { BalancedWeights, CompareRequest, EvaluatedRoute, PaymentEdge, Preferences, RankedRoute } from "../domain/types.js";
import { buildGraph, type RejectedEdge } from "../graph/graph.js";
import { node } from "../graph/nodes.js";
import type { ProviderQuote } from "../providers/types.js";
import { evaluatePath, type EdgeContext, type Exclusion } from "./evaluate.js";
import { rankRoutes } from "./rank.js";
import type { ReferenceRates } from "./rates.js";
import { findCandidatePaths } from "./search.js";

export type ExclusionReason = Exclusion | "max_fee_exceeded" | "max_duration_exceeded" | "min_success_rate_not_met" | "quote_expired";

export interface ExcludedRoute {
  steps: string[];
  reason: ExclusionReason;
  detail?: string;
}

export interface EngineResult {
  routes: RankedRoute[];
  excluded: ExcludedRoute[];
  rejectedEdges: RejectedEdge[];
  candidates: number;
}

/** Rejects preferences that name things that can never exist. */
export function validatePreferences(preferences: Preferences | undefined): void {
  for (const coin of preferences?.preferredStablecoins ?? []) {
    if (!isStablecoin(coin)) {
      throw new ApiError(400, "unsupported_stablecoin", `${coin} is not a supported stablecoin.`, { supported: Object.keys(STABLECOIN_NETWORKS) });
    }
  }
  for (const network of preferences?.excludedNetworks ?? []) {
    if (!(NETWORKS as readonly string[]).includes(network)) {
      throw new ApiError(400, "unsupported_network", `${network} is not a supported network.`, { supported: NETWORKS });
    }
  }
  const coins = preferences?.preferredStablecoins;
  if (coins?.length) {
    const excluded = new Set(preferences?.excludedNetworks ?? []);
    for (const coin of coins) {
      const usable = NETWORKS.filter((network) => isSupportedPair(coin, network) && !excluded.has(network));
      if (usable.length === 0) {
        throw new ApiError(400, "unsupported_stablecoin_network", `${coin} isn't available on any network left after exclusions.`, { stablecoin: coin });
      }
    }
  }
  if (preferences?.maxFeeUSD !== undefined) parseAmount(preferences.maxFeeUSD, "USD");
}

/** Removes what preferences rule out before the search, so it can't crowd results. */
function allowedByPreferences(edge: PaymentEdge, preferences: Preferences | undefined): boolean {
  if (preferences?.excludedProviders?.includes(edge.providerId)) return false;
  if (edge.network && preferences?.excludedNetworks?.includes(edge.network)) return false;
  const coins = preferences?.preferredStablecoins;
  if (coins?.length && edge.stablecoin && !coins.includes(edge.stablecoin)) return false;
  return true;
}

function constraintProblem(route: EvaluatedRoute, preferences: Preferences | undefined, now: Date): { reason: ExclusionReason; detail?: string } | null {
  if (route.expiresAt <= now) return { reason: "quote_expired" };
  if (preferences?.maxFeeUSD !== undefined && route.totalCostUSD.gt(preferences.maxFeeUSD)) {
    return { reason: "max_fee_exceeded", detail: `Estimated cost $${route.totalCostUSD.toFixed(2)} is above the $${preferences.maxFeeUSD} limit.` };
  }
  if (preferences?.maxDurationSeconds !== undefined && route.durationSeconds > preferences.maxDurationSeconds) {
    return { reason: "max_duration_exceeded", detail: `Estimated ${route.durationSeconds}s is above the ${preferences.maxDurationSeconds}s limit.` };
  }
  if (preferences?.minSuccessRate !== undefined && route.reliability.lt(preferences.minSuccessRate)) {
    return { reason: "min_success_rate_not_met", detail: `Modeled reliability ${route.reliability.toFixed(4)} is below ${preferences.minSuccessRate}.` };
  }
  return null;
}

export function runEngine(
  request: CompareRequest,
  quotes: readonly ProviderQuote[],
  rates: ReferenceRates,
  weights: BalancedWeights,
  now: Date,
): EngineResult {
  const { source, destination, preferences, optimizeFor } = request;
  const amount = parseAmount(source.amount, source.currency);

  const contexts = new Map<string, EdgeContext>();
  const edges: PaymentEdge[] = [];
  for (const quote of quotes) {
    if (!allowedByPreferences(quote.edge, preferences)) continue;
    edges.push(quote.edge);
    contexts.set(quote.edge.id, {
      quotedAt: new Date(quote.quotedAt),
      expiresAt: new Date(quote.expiresAt),
      ...(quote.availableLiquidity !== undefined ? { availableLiquidity: quote.availableLiquidity } : {}),
    });
  }

  const { graph, rejected } = buildGraph(edges);
  const notionalUSD = new Decimal(amount).mul(rates.usdValue(source.currency));
  const start = node.funding(source.fundingMethod, source.currency, source.country);
  const goal = node.payout(destination.payoutMethod, destination.currency, destination.country);
  const paths = findCandidatePaths(graph, start, goal, notionalUSD, rates);

  const eligible: EvaluatedRoute[] = [];
  const excluded: ExcludedRoute[] = [];
  for (const path of paths) {
    const result = evaluatePath(path, amount, rates, contexts);
    if (!result.ok) {
      excluded.push({ steps: result.steps, reason: result.reason, ...(result.limit ? { detail: `Limit: ${result.limit}.` } : {}) });
      continue;
    }
    const problem = constraintProblem(result.route, preferences, now);
    if (problem) {
      excluded.push({ steps: result.route.steps, ...problem });
      continue;
    }
    eligible.push(result.route);
  }

  return {
    routes: rankRoutes(eligible, optimizeFor, preferences?.balancedWeights ?? weights),
    excluded,
    rejectedEdges: rejected,
    candidates: paths.length,
  };
}
