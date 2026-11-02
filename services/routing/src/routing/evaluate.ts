import { isStablecoin } from "../domain/assets.js";
import { bps, ceilToAsset, Decimal, floorToAsset, formatAsset, formatUSD, formatUSDExact, ONE, ZERO } from "../domain/money.js";
import type { EdgeKind, EvaluatedRoute, FeeModel, PaymentEdge, RouteStage } from "../domain/types.js";
import type { ReferenceRates } from "./rates.js";
import { routeReliability } from "./reliability.js";

export type Exclusion =
  | "below_minimum"
  | "above_maximum"
  | "fees_exceed_amount"
  | "insufficient_liquidity";

export interface EdgeContext {
  quotedAt: Date;
  expiresAt: Date;
  /** Available liquidity in the edge's input asset, when the provider states it. */
  availableLiquidity?: string;
}

export function computeFee(model: FeeModel, amount: Decimal, asset: string): Decimal {
  let fee = amount.mul(bps(model.percentBps)).add(model.fixed);
  if (model.min !== undefined) fee = Decimal.max(fee, model.min);
  if (model.max !== undefined) fee = Decimal.min(fee, model.max);
  return ceilToAsset(fee, asset);
}

export type EvaluationResult =
  | { ok: true; route: EvaluatedRoute }
  | { ok: false; reason: Exclusion; edgeId: string; limit?: string; fingerprint: string; steps: string[] };

const FEE_BUCKET: Readonly<Record<EdgeKind, "funding" | "fx" | "onramp" | "bridge" | "network" | "offramp" | "payout">> = {
  funding: "funding",
  fx: "fx",
  onramp: "onramp",
  bridge: "bridge",
  transfer: "network",
  offramp: "offramp",
  payout: "payout",
};

/**
 * Walks a path stage by stage. Each edge acts on what the last one delivered, so
 * a percentage fee applies to the amount that's actually left at that point.
 * Every stage settles to its asset's minor units, as a real ledger would.
 */
export function evaluatePath(
  path: readonly PaymentEdge[],
  sourceAmount: Decimal,
  rates: ReferenceRates,
  contexts: ReadonlyMap<string, EdgeContext>,
): EvaluationResult {
  const fingerprint = path.map((edge) => edge.id).join(">");
  const steps = path.map((edge) => edge.label);
  const first = path[0];
  const last = path.at(-1);
  if (!first || !last) throw new Error("Cannot evaluate an empty path");

  const buckets = { funding: ZERO, onramp: ZERO, network: ZERO, bridge: ZERO, fx: ZERO, offramp: ZERO, payout: ZERO };
  const stages: RouteStage[] = [];
  let amount = sourceAmount;
  let spreadTotal = ZERO;
  let liquidityKnown = true;

  for (const edge of path) {
    const context = contexts.get(edge.id);
    if (edge.minAmount !== undefined && amount.lt(edge.minAmount)) {
      return { ok: false, reason: "below_minimum", edgeId: edge.id, limit: `${edge.minAmount} ${edge.inputAsset}`, fingerprint, steps };
    }
    if (edge.maxAmount !== undefined && amount.gt(edge.maxAmount)) {
      return { ok: false, reason: "above_maximum", edgeId: edge.id, limit: `${edge.maxAmount} ${edge.inputAsset}`, fingerprint, steps };
    }
    if (context?.availableLiquidity === undefined) {
      liquidityKnown = false;
    } else if (amount.gt(context.availableLiquidity)) {
      return { ok: false, reason: "insufficient_liquidity", edgeId: edge.id, limit: `${context.availableLiquidity} ${edge.inputAsset}`, fingerprint, steps };
    }

    const fee = computeFee(edge.feeModel, amount, edge.inputAsset);
    const net = amount.sub(fee);
    if (net.lte(0)) return { ok: false, reason: "fees_exceed_amount", edgeId: edge.id, fingerprint, steps };

    const rate = new Decimal(edge.exchangeRate ?? 1);
    const reference = new Decimal(edge.referenceRate ?? rate);
    const output = floorToAsset(net.mul(rate), edge.outputAsset);

    const feeUSD = fee.mul(rates.usdValue(edge.inputAsset));
    const spreadUSD = net.mul(reference.sub(rate)).mul(rates.usdValue(edge.outputAsset));
    buckets[FEE_BUCKET[edge.kind]] = buckets[FEE_BUCKET[edge.kind]].add(feeUSD);
    spreadTotal = spreadTotal.add(spreadUSD);

    stages.push({
      edgeId: edge.id,
      kind: edge.kind,
      providerId: edge.providerId,
      label: edge.label,
      inputAsset: edge.inputAsset,
      inputAmount: formatAsset(amount, edge.inputAsset),
      feeAmount: formatAsset(fee, edge.inputAsset),
      feeUSD: formatUSDExact(feeUSD),
      outputAsset: edge.outputAsset,
      outputAmount: formatAsset(output, edge.outputAsset),
      exchangeRate: rate.toString(),
      referenceRate: reference.toString(),
      spreadUSD: formatUSDExact(spreadUSD),
      estimatedDurationSeconds: edge.estimatedDurationSeconds,
      estimatedSuccessRate: edge.estimatedSuccessRate,
      dataSource: edge.dataSource,
      ...(edge.network ? { network: edge.network } : {}),
    });
    amount = output;
  }

  const sourceAsset = first.inputAsset;
  const destinationAsset = last.outputAsset;
  const explicit = Object.values(buckets).reduce((sum, value) => sum.add(value), ZERO);

  // Measured from what actually arrives, so this total can't miss a cost.
  const sourceUSD = sourceAmount.mul(rates.usdValue(sourceAsset));
  const recipientUSD = amount.mul(rates.usdValue(destinationAsset));
  const totalCost = sourceUSD.sub(recipientUSD);
  const rounding = totalCost.sub(explicit).sub(spreadTotal);

  const networks = [...new Set(path.flatMap((edge) => (edge.network ? [edge.network] : [])))];
  const stablecoin = path.find((edge) => isStablecoin(edge.outputAsset))?.outputAsset ?? null;
  const providers = [...new Set(path.map((edge) => edge.providerId))];
  const transfer = path.find((edge) => edge.kind === "transfer");
  const dataSource = path.every((edge) => edge.dataSource === "live") ? "live" : "simulated";
  const edgeContexts = path.flatMap((edge) => {
    const context = contexts.get(edge.id);
    return context ? [context] : [];
  });
  const earliest = (dates: Date[]) => new Date(Math.min(...dates.map((date) => date.getTime())));

  return {
    ok: true,
    route: {
      fingerprint,
      routeType: stablecoin ? "stablecoin" : "traditional",
      provider: (transfer ?? first).providerId,
      providers,
      stablecoin,
      network: transfer?.network ?? null,
      networks,
      fundingRail: first.label,
      payoutRail: last.label,
      stages,
      steps,
      fees: {
        ...Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, formatUSDExact(value)])),
        totalExplicitFees: formatUSD(explicit),
        fxSpread: formatUSD(spreadTotal),
        rounding: formatUSDExact(rounding),
        totalCost: formatUSD(totalCost),
      } as EvaluatedRoute["fees"],
      sourceAmount,
      recipientAmount: amount,
      destinationCurrency: destinationAsset,
      effectiveRate: amount.div(sourceAmount),
      referenceRate: ONE.mul(rates.usdValue(sourceAsset)).div(rates.usdValue(destinationAsset)),
      totalCostUSD: totalCost,
      explicitFeesUSD: explicit,
      fxSpreadUSD: spreadTotal,
      durationSeconds: path.reduce((sum, edge) => sum + edge.estimatedDurationSeconds, 0),
      reliability: routeReliability(path),
      dataSource,
      quotedAt: earliest(edgeContexts.map((context) => context.quotedAt)),
      expiresAt: earliest(edgeContexts.map((context) => context.expiresAt)),
      liquidityKnown,
    },
  };
}
