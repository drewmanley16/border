import { describe, expect, it } from "vitest";
import { Decimal, parseAmount } from "../domain/money.js";
import type { CompareRequest, EvaluatedRoute, PaymentEdge } from "../domain/types.js";
import { buildGraph, isValidPath } from "../graph/graph.js";
import { kShortestPaths } from "../graph/kShortest.js";
import { node } from "../graph/nodes.js";
import { createSimulatedProviders } from "../providers/simulated/adapter.js";
import { DEFAULT_SCENARIO, SCENARIOS, type Scenario } from "../providers/simulated/scenarios.js";
import type { ProviderQuote } from "../providers/types.js";
import { computeFee, evaluatePath } from "./evaluate.js";
import { runEngine, validatePreferences } from "./engine.js";
import { DEFAULT_WEIGHTS, rankRoutes, scoreRoutes } from "./rank.js";
import { referenceRates } from "./rates.js";
import { routeReliability } from "./reliability.js";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const clock = () => NOW;

const usdToBrl = (overrides: Partial<CompareRequest> = {}, amount = "1000.00"): CompareRequest => ({
  source: { country: "US", currency: "USD", amount, fundingMethod: "bank_transfer" },
  destination: { country: "BR", currency: "BRL", payoutMethod: "pix" },
  optimizeFor: "balanced",
  ...overrides,
});

async function quotesFor(request: CompareRequest, scenario: Scenario = DEFAULT_SCENARIO) {
  const signal = new AbortController().signal;
  const all: ProviderQuote[] = [];
  for (const provider of createSimulatedProviders(scenario, clock)) {
    if (scenario.behavior[provider.id]?.availability === "down") continue;
    all.push(...(await provider.getQuotes({ source: request.source, destination: request.destination, signal })));
  }
  return all;
}

async function compare(request: CompareRequest, scenario: Scenario = DEFAULT_SCENARIO) {
  const rates = referenceRates(scenario.usdPerUnit);
  return runEngine(request, await quotesFor(request, scenario), rates, DEFAULT_WEIGHTS, NOW);
}

const edge = (from: string, to: string, fields: Partial<PaymentEdge> = {}): PaymentEdge => ({
  id: `${from}>${to}`,
  providerId: "test",
  kind: "fx",
  label: `${from} to ${to}`,
  sourceNode: from,
  destinationNode: to,
  inputAsset: "USD",
  outputAsset: "USD",
  feeModel: { percentBps: "0", fixed: "0" },
  estimatedDurationSeconds: 1,
  estimatedSuccessRate: 1,
  failureDomain: "test",
  enabled: true,
  dataSource: "simulated",
  ...fields,
});

const route = (fingerprint: string, cost: string, seconds: number, reliability: string): EvaluatedRoute =>
  ({ fingerprint, totalCostUSD: new Decimal(cost), durationSeconds: seconds, reliability: new Decimal(reliability) }) as EvaluatedRoute;

describe("USD to BRL comparison", () => {
  it("returns stablecoin and traditional routes ending in the right rail", async () => {
    const { routes } = await compare(usdToBrl());
    expect(routes.length).toBeGreaterThanOrEqual(4);
    expect(new Set(routes.map((r) => r.routeType))).toEqual(new Set(["stablecoin", "traditional"]));
    for (const r of routes) {
      expect(r.steps[0]).toBe("USD bank funding");
      expect(r.steps.at(-1)).toBe("PIX payout");
      expect(r.destinationCurrency).toBe("BRL");
      expect(r.dataSource).toBe("simulated");
    }
    expect(new Set(routes.map((r) => r.network))).toEqual(new Set(["Solana", "Base", "Ethereum", null]));
  });

  it("finds a cross-provider route through the bridge", async () => {
    const { routes } = await compare(usdToBrl());
    const bridged = routes.find((r) => r.stages.some((s) => s.kind === "bridge"));
    expect(bridged).toBeDefined();
    expect(bridged!.providers.length).toBeGreaterThan(1);
    expect(bridged!.networks.length).toBe(2);
  });

  it("marks exactly the first route as recommended", async () => {
    const { routes } = await compare(usdToBrl());
    expect(routes.map((r) => r.rank)).toEqual(routes.map((_, i) => i + 1));
    expect(routes.filter((r) => r.recommended).map((r) => r.rank)).toEqual([1]);
  });
});

describe("optimization objectives", () => {
  it("orders by cost, duration and reliability", async () => {
    const cheap = (await compare(usdToBrl({ optimizeFor: "lowest_cost" }))).routes;
    const fast = (await compare(usdToBrl({ optimizeFor: "fastest" }))).routes;
    const safe = (await compare(usdToBrl({ optimizeFor: "most_reliable" }))).routes;

    for (let i = 1; i < cheap.length; i += 1) expect(cheap[i]!.totalCostUSD.gte(cheap[i - 1]!.totalCostUSD)).toBe(true);
    for (let i = 1; i < fast.length; i += 1) expect(fast[i]!.durationSeconds).toBeGreaterThanOrEqual(fast[i - 1]!.durationSeconds);
    for (let i = 1; i < safe.length; i += 1) expect(safe[i]!.reliability.lte(safe[i - 1]!.reliability)).toBe(true);
  });

  it("considers the same routes whichever objective is chosen", async () => {
    const keys = async (optimizeFor: CompareRequest["optimizeFor"]) =>
      (await compare(usdToBrl({ optimizeFor }))).routes.map((r) => r.fingerprint).sort();
    expect(await keys("fastest")).toEqual(await keys("lowest_cost"));
    expect(await keys("balanced")).toEqual(await keys("most_reliable"));
  });

  it("prefers the bank's flat fee for a large transfer and stablecoins for a small one", async () => {
    const small = (await compare(usdToBrl({ optimizeFor: "lowest_cost" }, "1000.00"))).routes[0]!;
    const large = (await compare(usdToBrl({ optimizeFor: "lowest_cost" }, "200000.00"))).routes[0]!;
    expect(small.routeType).toBe("stablecoin");
    expect(large.routeType).toBe("traditional");
  });

  it("normalizes balanced scores to 0 through 1 per dimension", async () => {
    const { routes } = await compare(usdToBrl());
    for (const dimension of ["cost", "duration", "reliability"] as const) {
      const values = routes.map((r) => r.score[dimension]);
      expect(Math.min(...values)).toBe(0);
      expect(Math.max(...values)).toBe(1);
    }
  });

  it("honors configured balanced weights", () => {
    const cheapSlow = route("a", "1", 1000, "0.99");
    const dearFast = route("b", "9", 10, "0.99");
    const lean = (cost: number, duration: number) =>
      rankRoutes([cheapSlow, dearFast], "balanced", { cost, duration, reliability: 0 })[0]!.fingerprint;
    expect(lean(1, 0)).toBe("a");
    expect(lean(0, 1)).toBe("b");
  });

  it("gives every route a score of 0 for a single candidate rather than dividing by zero", () => {
    const score = scoreRoutes([route("a", "1", 10, "0.9")], DEFAULT_WEIGHTS).get("a")!;
    expect(score.total).toBe(0);
  });
});

describe("deterministic ranking", () => {
  it("breaks identical-cost ties the same way regardless of input order", () => {
    const a = route("a", "5", 100, "0.99");
    const b = route("b", "5", 100, "0.99");
    const faster = route("c", "5", 50, "0.99");
    for (const input of [[a, b, faster], [faster, b, a], [b, faster, a]]) {
      expect(rankRoutes(input, "lowest_cost", DEFAULT_WEIGHTS).map((r) => r.fingerprint)).toEqual(["c", "a", "b"]);
    }
  });

  it("produces identical results for identical inputs", async () => {
    const first = await compare(usdToBrl());
    const second = await compare(usdToBrl());
    expect(JSON.stringify(second.routes)).toBe(JSON.stringify(first.routes));
  });
});

describe("explanations", () => {
  it("quotes values taken from the route itself", async () => {
    const { routes } = await compare(usdToBrl({ optimizeFor: "lowest_cost" }));
    const best = routes[0]!;
    expect(best.rankingExplanation).toContain("Route 1 is recommended because it has the lowest total estimated cost");
    expect(best.rankingExplanation).toContain(`$${best.fees.totalCost}`);
    expect(best.rankingExplanation).toContain(`${routes.length} eligible routes`);
  });
});

describe("corridors and filtering", () => {
  it("finds no path for a rail no provider serves", async () => {
    const result = await compare({
      ...usdToBrl(),
      destination: { country: "BR", currency: "BRL", payoutMethod: "boleto" },
    });
    expect(result.routes).toEqual([]);
  });

  it("drops excluded networks and providers before searching", async () => {
    const { routes } = await compare(usdToBrl({
      preferences: { excludedNetworks: ["Solana"], excludedProviders: ["sim_bank_fx"] },
    }));
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(r.networks).not.toContain("Solana");
      expect(r.stages.some((stage) => stage.network === "Solana")).toBe(false);
      expect(r.providers).not.toContain("sim_bank_fx");
    }
  });

  it("reports a route that's too slow but within budget", async () => {
    const { excluded } = await compare(usdToBrl({ preferences: { maxDurationSeconds: 600 } }));
    expect(excluded.map((e) => e.reason)).toEqual(["max_duration_exceeded"]);
  });

  it("excludes routes over a hard limit before scoring and says why", async () => {
    const { routes, excluded } = await compare(usdToBrl({
      preferences: { maxDurationSeconds: 600, maxFeeUSD: "7.00", minSuccessRate: 0.98 },
    }));
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(r.durationSeconds).toBeLessThanOrEqual(600);
      expect(r.totalCostUSD.lte("7.00")).toBe(true);
    }
    expect(excluded.map((e) => e.reason)).toContain("max_fee_exceeded");
    // Normalization only sees eligible routes, so the excluded bank wire can't skew it.
    expect(Math.max(...routes.map((r) => r.score.duration))).toBe(1);
  });

  it("keeps non-stablecoin routes when restricting stablecoins", async () => {
    const { routes } = await compare(usdToBrl({ preferences: { preferredStablecoins: ["USDT"] } }));
    expect(routes.map((r) => r.routeType)).toEqual(["traditional"]);
  });

  it("rejects unknown coins and impossible coin and network combinations", () => {
    expect(() => validatePreferences({ preferredStablecoins: ["DOGEUSD"] })).toThrowError(/not a supported stablecoin/);
    expect(() => validatePreferences({ excludedNetworks: ["Tron"] })).toThrowError(/not a supported network/);
    expect(() => validatePreferences({ preferredStablecoins: ["USDT"], excludedNetworks: ["Solana", "Ethereum"] })).toThrowError(/isn't available/);
  });
});

describe("transfer limits", () => {
  it("excludes routes under a provider minimum", async () => {
    const { routes, excluded } = await compare(usdToBrl({}, "20.00"));
    expect(routes.some((r) => r.providers.includes("sim_bank_fx"))).toBe(false);
    expect(routes.some((r) => r.providers.includes("sim_ethereum_usdc"))).toBe(false);
    expect(excluded.some((e) => e.reason === "below_minimum")).toBe(true);
  });

  it("excludes routes over a provider maximum", async () => {
    const { routes, excluded } = await compare(usdToBrl({}, "300000.00"));
    expect(routes.some((r) => r.network === "Solana")).toBe(false);
    expect(excluded.some((e) => e.reason === "above_maximum" || e.reason === "insufficient_liquidity")).toBe(true);
  });

  it("excludes a route when stated liquidity is too low", async () => {
    const scenario = structuredClone(DEFAULT_SCENARIO);
    const solana = scenario.providers.find((p) => p.id === "sim_solana_usdc")!;
    if (solana.kind === "onchain") solana.liquidityUSD = "500";
    const { routes, excluded } = await compare(usdToBrl(), scenario);
    expect(routes.some((r) => r.network === "Solana" && r.networks.length === 1)).toBe(false);
    expect(excluded.some((e) => e.reason === "insufficient_liquidity")).toBe(true);
  });

  it("flags routes whose liquidity a provider didn't report", async () => {
    const { routes } = await compare(usdToBrl());
    expect(routes.find((r) => r.network === "Base" && r.networks.length === 1)!.liquidityKnown).toBe(false);
  });
});

describe("money arithmetic", () => {
  it("rejects zero, negative and malformed amounts", () => {
    for (const bad of ["0", "0.00", "-5", "1e3", "abc", "", "1,000", " 10", ".5"]) {
      expect(() => parseAmount(bad, "USD"), bad).toThrowError();
    }
  });

  it("enforces each currency's precision", () => {
    expect(() => parseAmount("10.123", "USD")).toThrowError(/at most 2/);
    expect(() => parseAmount("100.5", "JPY")).toThrowError(/at most 0/);
    expect(() => parseAmount("1.2345", "KWD")).toThrowError(/at most 3/);
    expect(parseAmount("1.234", "KWD").toString()).toBe("1.234");
  });

  it("avoids binary floating point error", () => {
    expect(new Decimal("0.1").add("0.2").toString()).toBe("0.3");
  });

  it("combines percentage, fixed, minimum and maximum fees", () => {
    const amount = new Decimal("1000");
    expect(computeFee({ percentBps: "25", fixed: "1.00" }, amount, "USD").toString()).toBe("3.5");
    expect(computeFee({ percentBps: "1", fixed: "0", min: "5" }, amount, "USD").toString()).toBe("5");
    expect(computeFee({ percentBps: "100", fixed: "0", max: "4" }, amount, "USD").toString()).toBe("4");
  });

  it("rounds fees up to the asset's minor unit", () => {
    expect(computeFee({ percentBps: "33", fixed: "0" }, new Decimal("1.01"), "USD").toString()).toBe("0.01");
    expect(computeFee({ percentBps: "33", fixed: "0" }, new Decimal("101"), "JPY").toString()).toBe("1");
  });

  it("applies each percentage to what's left, not to the original amount", () => {
    const hop = (id: string, from: string, to: string, kind: PaymentEdge["kind"]): PaymentEdge =>
      edge(from, to, { id, kind, feeModel: { percentBps: "100", fixed: "0" } });
    const result = evaluatePath(
      [hop("a", "fiat:USD@x", "sender:USDC:Base", "onramp"), hop("b", "sender:USDC:Base", "recipient:USDC:Base", "transfer")],
      new Decimal("1000"),
      referenceRates({ USD: "1" }),
      new Map(),
    );
    if (!result.ok) throw new Error("expected a route");
    // 1% then 1% is 980.10 after compounding, not the 980.00 of adding the rates.
    expect(result.route.recipientAmount.toString()).toBe("980.1");
  });

  it("converts through several currencies in sequence", () => {
    const rates = referenceRates({ EUR: "1.1", USD: "1", GBP: "1.25" });
    const fx = (from: string, to: string, a: string, b: string, rate: string, reference: string) =>
      edge(from, to, { kind: "fx", inputAsset: a, outputAsset: b, exchangeRate: rate, referenceRate: reference, feeModel: { percentBps: "10", fixed: "0" } });
    const result = evaluatePath(
      [fx("fiat:EUR@x", "fiat:USD@x", "EUR", "USD", "1.09", "1.1"), fx("fiat:USD@x", "fiat:GBP@x", "USD", "GBP", "0.79", "0.8")],
      new Decimal("1000"),
      rates,
      new Map(),
    );
    if (!result.ok) throw new Error("expected a route");
    // EUR: 1000 - 1.00 fee = 999.00 -> 1088.91 USD. USD: 1088.91 - 1.09 fee = 1087.82 -> 859.37 GBP.
    expect(result.route.stages[0]!.outputAmount).toBe("1088.91");
    expect(result.route.stages[1]!.feeAmount).toBe("1.09");
    expect(result.route.recipientAmount.toString()).toBe("859.37");
  });

  it("reconciles fees, spread and rounding to the total cost on every route", async () => {
    for (const amount of ["37.13", "1000.00", "98765.43"]) {
      const { routes } = await compare(usdToBrl({}, amount));
      for (const r of routes) {
        const parts = r.explicitFeesUSD.add(r.fxSpreadUSD).add(r.fees.rounding);
        expect(parts.sub(r.totalCostUSD).abs().lt("0.000001"), r.fingerprint).toBe(true);
        expect(new Decimal(r.fees.rounding).abs().lt("0.05"), r.fingerprint).toBe(true);
        expect(r.totalCostUSD.gt(0)).toBe(true);
      }
    }
  });

  it("matches the amount each stage hands to the next", async () => {
    const { routes } = await compare(usdToBrl());
    for (const r of routes) {
      r.stages.slice(1).forEach((stage, index) => {
        expect(stage.inputAmount).toBe(r.stages[index]!.outputAmount);
        expect(stage.inputAsset).toBe(r.stages[index]!.outputAsset);
      });
      expect(r.stages.at(-1)!.outputAmount).toBe(r.recipientAmount.toFixed(2));
    }
  });

  it("respects zero- and three-decimal destination currencies", async () => {
    const jpy = (await compare({ ...usdToBrl(), destination: { country: "JP", currency: "JPY", payoutMethod: "bank_transfer" } })).routes;
    expect(jpy.length).toBeGreaterThan(0);
    for (const r of jpy) expect(r.recipientAmount.isInteger()).toBe(true);

    const kwd = (await compare({ ...usdToBrl(), destination: { country: "KW", currency: "KWD", payoutMethod: "bank_transfer" } })).routes;
    expect(kwd.length).toBeGreaterThan(0);
    for (const r of kwd) expect(r.recipientAmount.decimalPlaces()).toBeLessThanOrEqual(3);
  });

  it("uses a higher fee-free rate for reference than for the customer", async () => {
    for (const r of (await compare(usdToBrl())).routes) {
      expect(r.effectiveRate.lt(r.referenceRate)).toBe(true);
      expect(r.fxSpreadUSD.gt(0)).toBe(true);
    }
  });
});

describe("reliability", () => {
  const stage = (domain: string, rate: number) => edge("a", "b", { failureDomain: domain, estimatedSuccessRate: rate });

  it("multiplies independent domains", () => {
    expect(routeReliability([stage("x", 0.9), stage("y", 0.9)]).toNumber()).toBeCloseTo(0.81);
  });

  it("doesn't double-count stages that fail together", () => {
    expect(routeReliability([stage("x", 0.9), stage("x", 0.95), stage("x", 0.9)]).toNumber()).toBeCloseTo(0.9);
  });

  it("is never worse than multiplying everything, or better than the weakest stage", async () => {
    const quotes = await compare(usdToBrl());
    for (const r of quotes.routes) {
      const naive = r.stages.reduce((product, s) => product * s.estimatedSuccessRate, 1);
      expect(r.reliability.toNumber()).toBeGreaterThanOrEqual(naive - 1e-12);
      expect(r.reliability.toNumber()).toBeLessThanOrEqual(Math.min(...r.stages.map((s) => s.estimatedSuccessRate)));
    }
  });
});

describe("graph search", () => {
  const unit = () => 1;
  const fxEdge = (from: string, to: string, fields: Partial<PaymentEdge> = {}) => edge(from, to, { outputAsset: "EUR", ...fields });

  it("returns the k cheapest paths in order, without brute-force duplicates", () => {
    const { graph } = buildGraph([
      fxEdge("fiat:a@x", "fiat:b@x", { estimatedDurationSeconds: 1 }),
      fxEdge("fiat:b@x", "fiat:d@x", { estimatedDurationSeconds: 1 }),
      fxEdge("fiat:a@x", "fiat:c@x", { estimatedDurationSeconds: 2 }),
      fxEdge("fiat:c@x", "fiat:d@x", { estimatedDurationSeconds: 2 }),
      fxEdge("fiat:b@x", "fiat:c@x", { estimatedDurationSeconds: 5 }),
    ]);
    const paths = kShortestPaths(graph, "fiat:a@x", "fiat:d@x", 5, (e) => e.estimatedDurationSeconds);
    expect(paths.map((p) => p.weight)).toEqual([2, 4, 8]);
  });

  it("treats parallel edges between the same nodes as distinct", () => {
    const { graph } = buildGraph([
      fxEdge("fiat:a@x", "fiat:b@x", { id: "one" }),
      fxEdge("fiat:a@x", "fiat:b@x", { id: "two" }),
    ]);
    expect(kShortestPaths(graph, "fiat:a@x", "fiat:b@x", 5, unit)).toHaveLength(2);
  });

  it("never returns a cycle, even when the graph contains one", () => {
    const { graph } = buildGraph([
      fxEdge("fiat:a@x", "fiat:b@x"),
      fxEdge("fiat:b@x", "fiat:a@x"),
      fxEdge("fiat:b@x", "fiat:c@x"),
      fxEdge("fiat:c@x", "fiat:b@x"),
      fxEdge("fiat:c@x", "fiat:d@x"),
    ]);
    const paths = kShortestPaths(graph, "fiat:a@x", "fiat:d@x", 20, unit);
    expect(paths).toHaveLength(1);
    for (const { edges } of paths) {
      const visited = edges.map((e) => e.sourceNode);
      expect(new Set(visited).size).toBe(visited.length);
    }
  });

  it("stays bounded on a dense graph", () => {
    const edges: PaymentEdge[] = [];
    const size = 14;
    for (let i = 0; i < size; i += 1) {
      for (let j = 0; j < size; j += 1) {
        if (i !== j) edges.push(fxEdge(`fiat:${i}@x`, `fiat:${j}@x`));
      }
    }
    const { graph } = buildGraph(edges);
    const started = performance.now();
    const paths = kShortestPaths(graph, "fiat:0@x", `fiat:${size - 1}@x`, 10, unit);
    expect(paths).toHaveLength(10);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("refuses invalid transitions and disabled or duplicate edges", () => {
    const { rejected } = buildGraph([
      edge("funding:a:USD:US", "payout:a:USD:US", { kind: "funding" }),
      edge("sender:USDC:Base", "fiat:USD@x", { kind: "offramp" }),
      fxEdge("fiat:a@x", "fiat:b@x", { enabled: false }),
      fxEdge("fiat:a@x", "fiat:a@x"),
      fxEdge("fiat:a@x", "fiat:c@x", { id: "dup", outputAsset: "EUR" }),
      fxEdge("fiat:a@x", "fiat:d@x", { id: "dup", outputAsset: "EUR" }),
    ]);
    expect(rejected.map((r) => r.reason)).toEqual([
      "invalid_transition:funding",
      "invalid_transition:offramp",
      "disabled",
      "self_loop",
      "duplicate_edge",
    ]);
  });

  it("rejects paths that repeat a stage", () => {
    const hop = (from: string, to: string, kind: PaymentEdge["kind"]) => edge(from, to, { kind });
    expect(isValidPath([hop("fiat:a@x", "fiat:b@x", "fx"), hop("fiat:b@x", "fiat:c@x", "fx")])).toBe(false);
    expect(isValidPath([hop("fiat:a@x", "sender:U:A", "onramp"), hop("sender:U:A", "recipient:U:A", "transfer")])).toBe(true);
  });

  it("uses node ids that distinguish venues", () => {
    expect(node.fiat("USD", "a")).not.toBe(node.fiat("USD", "b"));
  });
});

describe("scenarios", () => {
  it("makes congested Solana lose the fastest spot it held", async () => {
    const fastest = usdToBrl({ optimizeFor: "fastest" });
    expect((await compare(fastest)).routes[0]!.network).toBe("Solana");
    expect((await compare(fastest, SCENARIOS.solana_congestion)).routes[0]!.network).not.toBe("Solana");
  });
});
