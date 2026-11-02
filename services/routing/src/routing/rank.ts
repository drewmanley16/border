import { Decimal, formatUSD } from "../domain/money.js";
import type { BalancedWeights, EvaluatedRoute, OptimizeFor, RankedRoute, ScoreBreakdown } from "../domain/types.js";

export const DEFAULT_WEIGHTS: BalancedWeights = { cost: 0.5, duration: 0.3, reliability: 0.2 };

function range(values: number[]) {
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Maps to 0 (best in this set) through 1 (worst). Equal values all score 0. */
function normalize(value: number, { min, max }: { min: number; max: number }): number {
  return max === min ? 0 : (value - min) / (max - min);
}

/**
 * Normalizing against the eligible set is what makes dollars, seconds and
 * probabilities comparable. Duration is on a log scale: otherwise one two-day
 * bank wire would flatten the difference between 45 seconds and ten minutes.
 */
export function scoreRoutes(routes: readonly EvaluatedRoute[], weights: BalancedWeights): Map<string, ScoreBreakdown> {
  const costs = routes.map((route) => route.totalCostUSD.toNumber());
  const durations = routes.map((route) => Math.log1p(route.durationSeconds));
  const failures = routes.map((route) => 1 - route.reliability.toNumber());
  const costRange = range(costs);
  const durationRange = range(durations);
  const failureRange = range(failures);
  const totalWeight = weights.cost + weights.duration + weights.reliability;

  const scores = new Map<string, ScoreBreakdown>();
  routes.forEach((route, index) => {
    const cost = normalize(costs[index]!, costRange);
    const duration = normalize(durations[index]!, durationRange);
    const reliability = normalize(failures[index]!, failureRange);
    const total = (cost * weights.cost + duration * weights.duration + reliability * weights.reliability) / totalWeight;
    scores.set(route.fingerprint, { cost, duration, reliability, weights, total });
  });
  return scores;
}

const byCost = (a: EvaluatedRoute, b: EvaluatedRoute) => a.totalCostUSD.comparedTo(b.totalCostUSD);
const byDuration = (a: EvaluatedRoute, b: EvaluatedRoute) => a.durationSeconds - b.durationSeconds;
const byReliability = (a: EvaluatedRoute, b: EvaluatedRoute) => b.reliability.comparedTo(a.reliability);
/** Last resort. Unique per path, so ranking is total and repeatable. */
const byFingerprint = (a: EvaluatedRoute, b: EvaluatedRoute) =>
  a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0;

function firstDifference(...orders: number[]): number {
  return orders.find((order) => order !== 0) ?? 0;
}

function compareFor(optimizeFor: OptimizeFor, scores: Map<string, ScoreBreakdown>) {
  return (a: EvaluatedRoute, b: EvaluatedRoute): number => {
    const tieBreakers = [byCost(a, b), byDuration(a, b), byReliability(a, b), byFingerprint(a, b)];
    switch (optimizeFor) {
      case "lowest_cost":
        return firstDifference(...tieBreakers);
      case "fastest":
        return firstDifference(byDuration(a, b), ...tieBreakers);
      case "most_reliable":
        return firstDifference(byReliability(a, b), ...tieBreakers);
      case "balanced":
        return firstDifference(scores.get(a.fingerprint)!.total - scores.get(b.fingerprint)!.total, ...tieBreakers);
    }
  };
}

export function formatPercent(value: Decimal | number): string {
  return `${new Decimal(value).mul(100).toFixed(2)}%`;
}

export function formatDurationText(seconds: number): string {
  if (seconds < 120) return `${seconds} seconds`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}

const usd = (value: Decimal) => `$${formatUSD(value)}`;

function reasonFor(route: EvaluatedRoute, score: ScoreBreakdown, optimizeFor: OptimizeFor, eligible: number): string {
  const among = eligible === 1 ? "as the only eligible route" : `among ${eligible} eligible routes`;
  switch (optimizeFor) {
    case "lowest_cost":
      return `it has the lowest total estimated cost ${among}`;
    case "fastest":
      return `it has the shortest estimated delivery time ${among}`;
    case "most_reliable":
      return `it has the highest modeled reliability ${among}`;
    case "balanced": {
      const { weights } = score;
      const total = weights.cost + weights.duration + weights.reliability;
      const share = (value: number) => `${Math.round((value / total) * 100)}%`;
      return `it has the best balanced score (${score.total.toFixed(3)}, lower is better) ${among}, weighting cost ${share(weights.cost)}, time ${share(weights.duration)} and reliability ${share(weights.reliability)}`;
    }
  }
}

function explain(route: EvaluatedRoute, rank: number, leader: EvaluatedRoute, score: ScoreBreakdown, optimizeFor: OptimizeFor, eligible: number): string {
  const facts = `Estimated cost is ${usd(route.totalCostUSD)}, delivery is ${formatDurationText(route.durationSeconds)} and modeled reliability is ${formatPercent(route.reliability)}`;
  if (rank === 1) return `Route 1 is recommended because ${reasonFor(route, score, optimizeFor, eligible)}. ${facts}.`;

  const costGap = route.totalCostUSD.sub(leader.totalCostUSD);
  const timeGap = route.durationSeconds - leader.durationSeconds;
  const comparison: string[] = [];
  if (!costGap.isZero()) comparison.push(`${usd(costGap.abs())} ${costGap.gt(0) ? "more" : "less"} in cost`);
  if (timeGap !== 0) comparison.push(`${formatDurationText(Math.abs(timeGap))} ${timeGap > 0 ? "slower" : "faster"}`);
  const versus = comparison.length > 0 ? ` Compared with route 1, it is ${comparison.join(" and ")}.` : "";
  return `Route ${rank}. ${facts}.${versus}`;
}

export function rankRoutes(routes: readonly EvaluatedRoute[], optimizeFor: OptimizeFor, weights: BalancedWeights): RankedRoute[] {
  if (routes.length === 0) return [];
  const scores = scoreRoutes(routes, weights);
  const ordered = [...routes].sort(compareFor(optimizeFor, scores));
  const leader = ordered[0]!;
  return ordered.map((route, index) => {
    const score = scores.get(route.fingerprint)!;
    return {
      ...route,
      rank: index + 1,
      recommended: index === 0,
      rankingScore: score.total,
      score,
      rankingExplanation: explain(route, index + 1, leader, score, optimizeFor, ordered.length),
    };
  });
}
