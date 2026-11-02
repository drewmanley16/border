import { bps, Decimal, ONE, type DecimalValue } from "../../domain/money.js";
import type { FeeModel, PaymentEdge } from "../../domain/types.js";
import { node } from "../../graph/nodes.js";
import { ProviderError, type ProviderCapabilities, type ProviderHealth, type ProviderQuote, type ProviderQuoteRequest, type QuoteProvider } from "../types.js";
import type { BankProviderParams, BridgeProviderParams, DestinationRail, FundingRail, OnchainProviderParams, ProviderParams, Scenario } from "./scenarios.js";

export type Clock = () => Date;

const unique = (values: string[]) => [...new Set(values)].sort();

function abortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/**
 * Deterministic: the same scenario and request always produce the same edges.
 * Figures are illustrative, and every edge is stamped `dataSource: "simulated"`.
 */
export class SimulatedProvider implements QuoteProvider {
  readonly id: string;
  readonly name: string;
  readonly type;
  readonly dataSource = "simulated" as const;

  constructor(
    private readonly params: ProviderParams,
    private readonly scenario: Scenario,
    private readonly clock: Clock,
  ) {
    this.id = params.id;
    this.name = params.name;
    this.type = params.kind === "onchain" ? ("stablecoin" as const) : params.kind;
  }

  private usdValue(asset: string): Decimal {
    return new Decimal(this.scenario.usdPerUnit[asset]!);
  }

  /** Converts a USD-denominated parameter into `asset` at the reference rate. */
  private fromUSD(usd: DecimalValue, asset: string): string {
    return new Decimal(usd).div(this.usdValue(asset)).toDecimalPlaces(12).toString();
  }

  private fee(percentBps: string, fixedUSD: DecimalValue, asset: string): FeeModel {
    return { percentBps, fixed: this.fromUSD(fixedUSD, asset) };
  }

  private edge(
    fields: Pick<PaymentEdge, "kind" | "label" | "sourceNode" | "destinationNode" | "inputAsset" | "outputAsset" | "feeModel" | "estimatedDurationSeconds" | "estimatedSuccessRate"> & Partial<PaymentEdge>,
  ): PaymentEdge {
    const failureDomain = fields.failureDomain ?? `provider:${this.id}`;
    return {
      ...fields,
      id: `${this.id}:${fields.kind}:${fields.sourceNode}>${fields.destinationNode}`,
      providerId: this.id,
      failureDomain,
      enabled: true,
      dataSource: "simulated",
    };
  }

  private rate(from: string, to: string, spreadBps: string) {
    const reference = this.usdValue(from).div(this.usdValue(to));
    return {
      referenceRate: reference.toDecimalPlaces(12).toString(),
      exchangeRate: reference.mul(ONE.sub(bps(spreadBps))).toDecimalPlaces(12, Decimal.ROUND_FLOOR).toString(),
    };
  }

  private limits(minUSD: string, maxUSD: string, asset: string) {
    return { minAmount: this.fromUSD(minUSD, asset), maxAmount: this.fromUSD(maxUSD, asset) };
  }

  private fundingEdge(rail: FundingRail, venue: string, multiplier: DecimalValue = 1): PaymentEdge {
    return this.edge({
      kind: "funding",
      label: rail.label,
      sourceNode: node.funding(rail.method, rail.currency, rail.country),
      destinationNode: node.fiat(rail.currency, venue),
      inputAsset: rail.currency,
      outputAsset: rail.currency,
      feeModel: this.fee(rail.percentBps, new Decimal(rail.fixedUSD).mul(multiplier), rail.currency),
      estimatedDurationSeconds: rail.seconds,
      estimatedSuccessRate: rail.success,
      failureDomain: `banking:${rail.country}`,
    });
  }

  private payoutEdge(rail: DestinationRail, venue: string, multiplier: DecimalValue = 1): PaymentEdge {
    return this.edge({
      kind: "payout",
      label: rail.label,
      sourceNode: node.fiat(rail.currency, venue),
      destinationNode: node.payout(rail.method, rail.currency, rail.country),
      inputAsset: rail.currency,
      outputAsset: rail.currency,
      feeModel: this.fee(rail.percentBps, new Decimal(rail.fixedUSD).mul(multiplier), rail.currency),
      estimatedDurationSeconds: rail.seconds,
      estimatedSuccessRate: rail.success,
      failureDomain: `payout:${rail.method}`,
    });
  }

  private fxEdge(from: string, to: string, venue: string, feeBps: string, spreadBps: string, seconds: number, success: number): PaymentEdge {
    return this.edge({
      kind: "fx",
      label: `${from} to ${to} conversion`,
      sourceNode: node.fiat(from, venue),
      destinationNode: node.fiat(to, venue),
      inputAsset: from,
      outputAsset: to,
      feeModel: this.fee(feeBps, 0, from),
      estimatedDurationSeconds: seconds,
      estimatedSuccessRate: success,
      ...this.rate(from, to, spreadBps),
    });
  }

  private onchainEdges(p: OnchainProviderParams, funding: FundingRail, rail: DestinationRail): PaymentEdge[] {
    const { stablecoin: coin, network } = p;
    const edges: PaymentEdge[] = [];
    const source = funding.currency;
    const sender = node.sender(coin, network);
    const recipient = node.recipient(coin, network);
    const limits = this.limits(p.minUSD, p.maxUSD, source);

    edges.push(this.fundingEdge(funding, p.id, p.fundingMultiplier));

    // A venue that can't on-ramp this currency converts to dollars first.
    const onrampAsset = p.onrampCurrencies.includes(source) ? source : "USD";
    if (onrampAsset !== source) {
      if (!p.onrampCurrencies.includes("USD")) return [];
      edges.push({ ...this.fxEdge(source, "USD", p.id, "0", p.fxSpreadBps, 5, p.rampSuccess), ...limits });
    }

    const onrampLimits = this.limits(p.minUSD, p.maxUSD, onrampAsset);
    edges.push(this.edge({
      kind: "onramp",
      label: `${onrampAsset} to ${coin} conversion`,
      sourceNode: node.fiat(onrampAsset, p.id),
      destinationNode: sender,
      inputAsset: onrampAsset,
      outputAsset: coin,
      feeModel: this.fee(p.rampBps, 0, onrampAsset),
      estimatedDurationSeconds: p.rampSeconds,
      estimatedSuccessRate: p.rampSuccess,
      stablecoin: coin,
      network,
      ...this.rate(onrampAsset, coin, p.rampSpreadBps),
      ...onrampLimits,
    }));

    edges.push(this.edge({
      kind: "transfer",
      label: `${coin} transfer on ${network}`,
      sourceNode: sender,
      destinationNode: recipient,
      inputAsset: coin,
      outputAsset: coin,
      feeModel: this.fee("0", p.networkFeeUSD, coin),
      estimatedDurationSeconds: p.transferSeconds,
      estimatedSuccessRate: p.transferSuccess,
      failureDomain: `network:${network}`,
      network,
      stablecoin: coin,
    }));

    if (p.offrampCurrencies.includes(rail.currency)) {
      edges.push(this.edge({
        kind: "offramp",
        label: `${coin} to ${rail.currency} conversion`,
        sourceNode: recipient,
        destinationNode: node.fiat(rail.currency, p.id),
        inputAsset: coin,
        outputAsset: rail.currency,
        feeModel: this.fee(p.rampBps, 0, coin),
        estimatedDurationSeconds: p.rampSeconds,
        estimatedSuccessRate: p.rampSuccess,
        stablecoin: coin,
        network,
        ...this.rate(coin, rail.currency, p.fxSpreadBps),
        // Limits sit on both ramps, so bridging in can't sidestep this venue's.
        ...this.limits(p.minUSD, p.maxUSD, coin),
      }));
      edges.push(this.payoutEdge(rail, p.id, p.payoutMultiplier));
    }
    return edges;
  }

  private bankEdges(p: BankProviderParams, funding: FundingRail, rail: DestinationRail): PaymentEdge[] {
    return [
      this.fundingEdge(funding, p.id),
      {
        ...this.fxEdge(funding.currency, rail.currency, p.id, p.fxFeeBps, p.fxSpreadBps, p.extraSeconds, p.success),
        ...this.limits(p.minUSD, p.maxUSD, funding.currency),
        feeModel: { percentBps: p.fxFeeBps, fixed: this.fromUSD(p.wireFeeUSD, funding.currency) },
      },
      this.payoutEdge(rail, p.id),
    ];
  }

  private bridgeEdges(p: BridgeProviderParams): PaymentEdge[] {
    const edges: PaymentEdge[] = [];
    for (const from of p.networks) {
      for (const to of p.networks) {
        if (from === to) continue;
        edges.push(this.edge({
          kind: "bridge",
          label: `${p.stablecoin} bridge from ${from} to ${to}`,
          sourceNode: node.sender(p.stablecoin, from),
          destinationNode: node.sender(p.stablecoin, to),
          inputAsset: p.stablecoin,
          outputAsset: p.stablecoin,
          feeModel: this.fee(p.percentBps, p.fixedUSD, p.stablecoin),
          estimatedDurationSeconds: p.seconds,
          estimatedSuccessRate: p.success,
          stablecoin: p.stablecoin,
          network: to,
        }));
      }
    }
    return edges;
  }

  async getCapabilities(): Promise<ProviderCapabilities> {
    const { params: p, scenario } = this;
    const fundingRails = scenario.funding;
    const rails = scenario.destinations;
    if (p.kind === "bridge") {
      return { countries: [], currencies: [], fundingMethods: [], payoutMethods: [], stablecoins: [p.stablecoin], networks: [...p.networks] };
    }
    const payable = p.kind === "onchain" ? rails.filter((rail) => p.offrampCurrencies.includes(rail.currency)) : rails;
    return {
      countries: unique([...fundingRails.map((rail) => rail.country), ...payable.map((rail) => rail.country)]),
      currencies: unique([...fundingRails.map((rail) => rail.currency), ...payable.map((rail) => rail.currency)]),
      fundingMethods: unique(fundingRails.map((rail) => rail.method)),
      payoutMethods: unique(payable.map((rail) => rail.method)),
      stablecoins: p.kind === "onchain" ? [p.stablecoin] : [],
      networks: p.kind === "onchain" ? [p.network] : [],
    };
  }

  async getQuotes(request: ProviderQuoteRequest): Promise<ProviderQuote[]> {
    const behavior = this.scenario.behavior[this.id];
    if (behavior?.latencyMs) await abortable(behavior.latencyMs, request.signal);
    if (behavior?.availability === "down") {
      throw new ProviderError("unavailable", `${this.name} is unavailable in this scenario.`, false);
    }

    const { source, destination } = request;
    const funding = this.scenario.funding.find((rail) => rail.country === source.country && rail.currency === source.currency && rail.method === source.fundingMethod);
    const rail = this.scenario.destinations.find((candidate) => candidate.country === destination.country && candidate.currency === destination.currency && candidate.method === destination.payoutMethod);
    if (!funding || !rail) return [];

    const { params: p } = this;
    const edges = p.kind === "onchain" ? this.onchainEdges(p, funding, rail) : p.kind === "bank_fx" ? this.bankEdges(p, funding, rail) : this.bridgeEdges(p);

    const quotedAt = this.clock();
    const expiresAt = new Date(quotedAt.getTime() + this.scenario.quoteTtlSeconds * 1000);
    const liquidityUSD = p.kind === "onchain" ? p.liquidityUSD : undefined;
    return edges.map((edge) => ({
      edge,
      quotedAt: quotedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ...(liquidityUSD && (edge.kind === "onramp" || edge.kind === "offramp")
        ? { availableLiquidity: this.fromUSD(liquidityUSD, edge.inputAsset) }
        : {}),
    }));
  }

  async getHealth(): Promise<ProviderHealth> {
    const availability = this.scenario.behavior[this.id]?.availability ?? "up";
    return {
      status: availability === "up" ? "healthy" : availability === "down" ? "unavailable" : "degraded",
      checkedAt: this.clock().toISOString(),
      detail: `Simulated status from the "${this.scenario.name}" scenario.`,
    };
  }
}

export function createSimulatedProviders(scenario: Scenario, clock: Clock): QuoteProvider[] {
  return scenario.providers.map((params) => new SimulatedProvider(params, scenario, clock));
}

