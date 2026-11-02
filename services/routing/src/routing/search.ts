import { isValidPath, type PaymentGraph } from "../graph/graph.js";
import { kShortestPaths, type EdgeWeight } from "../graph/kShortest.js";
import { bps, Decimal } from "../domain/money.js";
import type { PaymentEdge } from "../domain/types.js";
import type { ReferenceRates } from "./rates.js";

/** Candidates kept per objective. Bounds the search on any graph size. */
export const CANDIDATES_PER_OBJECTIVE = 10;
const SECONDS_PER_PERCENT_COST = 600;

/** Approximate fractional cost of an edge, at the size of this payment. */
export function edgeCostFraction(edge: PaymentEdge, notionalUSD: Decimal, rates: ReferenceRates): number {
  const percent = bps(edge.feeModel.percentBps);
  const fixed = new Decimal(edge.feeModel.fixed).mul(rates.usdValue(edge.inputAsset)).div(notionalUSD);
  const reference = new Decimal(edge.referenceRate ?? edge.exchangeRate ?? 1);
  const spread = reference.isZero() ? new Decimal(0) : Decimal.sub(1, new Decimal(edge.exchangeRate ?? reference).div(reference));
  return Decimal.max(0, percent.add(fixed).add(spread)).toNumber();
}

/**
 * Finds candidates once per objective and pools them. Cost isn't strictly
 * additive, so these weights only steer the search: every candidate is then
 * priced exactly by evaluatePath. Pooling keeps the eligible set identical
 * across `optimizeFor` values, so the objective only changes the order.
 */
export function findCandidatePaths(
  graph: PaymentGraph,
  start: string,
  goal: string,
  notionalUSD: Decimal,
  rates: ReferenceRates,
): PaymentEdge[][] {
  const cost: EdgeWeight = (edge) => edgeCostFraction(edge, notionalUSD, rates);
  const time: EdgeWeight = (edge) => edge.estimatedDurationSeconds;
  const risk: EdgeWeight = (edge) => -Math.log(edge.estimatedSuccessRate);
  const blended: EdgeWeight = (edge) => cost(edge) * 100 + time(edge) / SECONDS_PER_PERCENT_COST + risk(edge) * 100;

  const pool = new Map<string, PaymentEdge[]>();
  for (const weight of [cost, time, risk, blended]) {
    for (const { edges } of kShortestPaths(graph, start, goal, CANDIDATES_PER_OBJECTIVE, weight)) {
      if (isValidPath(edges)) pool.set(edges.map((edge) => edge.id).join(">"), edges);
    }
  }
  return [...pool.keys()].sort().map((key) => pool.get(key)!);
}
