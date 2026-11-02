import { Decimal, ONE } from "../domain/money.js";
import type { PaymentEdge } from "../domain/types.js";

/**
 * Estimates end-to-end success without assuming that stages fail independently.
 *
 * Multiplying every stage would double-count shared risk: if a provider is down,
 * its on-ramp and off-ramp fail together, so that's one risk, not two. Stages are
 * therefore grouped by failure domain. Inside a domain they're treated as fully
 * correlated, so the domain succeeds with its weakest stage's probability.
 * Separate domains are treated as independent and multiplied.
 */
export function routeReliability(edges: readonly PaymentEdge[]): Decimal {
  const weakest = new Map<string, Decimal>();
  for (const edge of edges) {
    const rate = new Decimal(edge.estimatedSuccessRate);
    const current = weakest.get(edge.failureDomain);
    if (!current || rate.lt(current)) weakest.set(edge.failureDomain, rate);
  }
  let reliability = ONE;
  for (const rate of weakest.values()) reliability = reliability.mul(rate);
  return reliability;
}
