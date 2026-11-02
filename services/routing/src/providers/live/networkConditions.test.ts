import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../../config/env.js";
import { QuoteAggregator } from "../aggregator.js";
import { createSimulatedProviders } from "../simulated/adapter.js";
import { DEFAULT_SCENARIO, SCENARIOS } from "../simulated/scenarios.js";
import { ProviderRegistry } from "../registry.js";
import type { ProviderQuoteRequest } from "../types.js";
import { RpcNetworkConditions, type NetworkConditionSource } from "./networkConditions.js";

const NOW = new Date("2026-11-02T12:00:00Z");
const now = () => NOW;
const SECRET = "https://example.quiknode.pro/secret-token/";
const word = (value: bigint) => value.toString(16).padStart(64, "0");

function roundData(usd: bigint, updatedAt = NOW) {
  return `0x${word(1n)}${word(usd * 100_000_000n)}${word(0n)}${word(BigInt(updatedAt.getTime() / 1000))}${word(1n)}`;
}

function answers(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eth_feeHistory: { baseFeePerGas: ["0x1", "0x3b9aca00"], reward: [["0x3b9aca00"]] }, // 1 + 1 gwei
    eth_getBlockByNumber: (params: unknown[]) => (params[0] === "latest" ? { number: "0x64", timestamp: "0xf0" } : { number: "0x50", timestamp: "0x0" }), // 12s blocks
    eth_call: (params: { to: string }[]) => (params[0]!.to.startsWith("0x4200") ? "0x38d7ea4c68000" : roundData(params[0]!.to.startsWith("0x4ffC") ? 100n : 2000n)), // L1 fee 0.001 ETH
    getRecentPerformanceSamples: [{ numSlots: 100, samplePeriodSecs: 40 }],
    getRecentPrioritizationFees: [{ prioritizationFee: 0 }, { prioritizationFee: 1000 }, { prioritizationFee: 1000 }],
    ...overrides,
  };
}

function fakeFetch(table: Record<string, unknown>) {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const { method, params } = JSON.parse(init!.body as string) as { method: string; params: never[] };
    const answer = table[method];
    if (answer instanceof Error) throw answer;
    const result = typeof answer === "function" ? (answer as (p: unknown[]) => unknown)(params) : answer;
    return new Response(JSON.stringify({ result }));
  }) as unknown as typeof globalThis.fetch;
}

const source = (fetch: typeof globalThis.fetch, extra = {}) =>
  new RpcNetworkConditions({ urls: { ethereum: SECRET, base: SECRET, solana: SECRET }, now, fetch, ...extra });

describe("RpcNetworkConditions", () => {
  it("prices an Ethereum transfer from gas and the ETH price", async () => {
    const condition = await source(fakeFetch(answers())).get("Ethereum");
    // 65,000 gas at 2 gwei is 0.00013 ETH, at $2,000.
    expect(Number(condition!.feeUSD)).toBeCloseTo(0.26, 10);
    expect(condition!.seconds).toBe(144);
  });

  it("adds the L1 data fee on Base", async () => {
    const condition = await source(fakeFetch(answers())).get("Base");
    expect(Number(condition!.feeUSD)).toBeCloseTo(2.26, 10);
  });

  it("prices Solana from its base and priority fees", async () => {
    const condition = await source(fakeFetch(answers())).get("Solana");
    // 5,000 lamports + 1,000 micro-lamports/CU * 10,000 CU = 5,010 lamports, at $100.
    expect(Number(condition!.feeUSD)).toBeCloseTo(0.000501, 10);
    expect(condition!.seconds).toBe(13);
  });

  it("does nothing for a network with no endpoint", async () => {
    const fetch = fakeFetch(answers());
    const partial = new RpcNetworkConditions({ urls: { solana: SECRET }, now, fetch });
    await expect(partial.get("Base")).resolves.toBeUndefined();
    await expect(partial.get("Solana")).resolves.toBeUndefined(); // needs Ethereum for its price
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["a failed request", { eth_feeHistory: new Error(`connect failed ${SECRET}`) }],
    ["a stale price", { eth_call: () => roundData(2000n, new Date(NOW.getTime() - 3 * 3_600_000)) }],
    ["a negative price", { eth_call: () => `0x${word(1n)}${"f".repeat(64)}${word(0n)}${word(BigInt(NOW.getTime() / 1000))}${word(1n)}` }],
    ["an absurd fee", { eth_feeHistory: { baseFeePerGas: ["0xffffffffffff"], reward: [] } }],
  ])("falls back on %s without exposing the endpoint", async (_name, override) => {
    const onError = vi.fn();
    await expect(source(fakeFetch(answers(override)), { onError }).get("Ethereum")).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
    expect(JSON.stringify(onError.mock.calls)).not.toContain("secret-token");
  });

  it("reuses a reading, and shares one read between concurrent callers", async () => {
    const fetch = fakeFetch(answers());
    const conditions = source(fetch);
    await Promise.all([conditions.get("Ethereum"), conditions.get("Ethereum")]);
    const calls = vi.mocked(fetch).mock.calls.length;
    await conditions.get("Ethereum");
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  });

  it("uses a fresh shared reading instead of calling the chain", async () => {
    const fetch = fakeFetch(answers());
    const cached = { feeUSD: "1.000000000000", seconds: 9, observedAt: NOW.toISOString() };
    const conditions = source(fetch, { cache: { get: async () => cached, set: async () => undefined } });
    await expect(conditions.get("Base")).resolves.toEqual(cached);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("live transfer stages", () => {
  const request = {
    source: { country: "US", currency: "USD", amount: "1000.00", fundingMethod: "bank_transfer" },
    destination: { country: "BR", currency: "BRL", payoutMethod: "pix" },
  };
  const live: NetworkConditionSource = { get: async () => ({ feeUSD: "0.000500000000", seconds: 13, observedAt: NOW.toISOString() }) };
  const aggregator = new QuoteAggregator({ timeoutMs: 1000, concurrency: 4, retries: 0, retryDelayMs: 0, maxQuoteAgeMs: 60_000, now });

  it("marks only transfer edges live, and they pass validation", async () => {
    const { quotes, outcomes } = await aggregator.collect("test", createSimulatedProviders(DEFAULT_SCENARIO, now, live), request);
    expect(outcomes.some((outcome) => outcome.status === "invalid_response")).toBe(false);
    const liveEdges = quotes.filter((quote) => quote.edge.dataSource === "live").map((quote) => quote.edge);
    expect(liveEdges.length).toBeGreaterThan(0);
    expect(liveEdges.every((edge) => edge.kind === "transfer" && edge.estimatedDurationSeconds === 13)).toBe(true);
    expect(quotes.filter((quote) => quote.edge.kind === "transfer").every((quote) => quote.edge.dataSource === "live")).toBe(true);
  });

  it("keeps simulated transfers when there is no reading", async () => {
    const none: NetworkConditionSource = { get: async () => undefined };
    const { quotes } = await aggregator.collect("test", createSimulatedProviders(DEFAULT_SCENARIO, now, none), request);
    expect(quotes.every((quote) => quote.edge.dataSource === "simulated")).toBe(true);
  });

  it("still refuses a live edge of any other kind", async () => {
    const [provider] = createSimulatedProviders(DEFAULT_SCENARIO, now);
    const forged = {
      ...provider!,
      id: provider!.id,
      dataSource: provider!.dataSource,
      liveEdgeKinds: ["transfer" as const],
      getQuotes: async (input: ProviderQuoteRequest) =>
        (await provider!.getQuotes(input)).map((quote) => ({ ...quote, edge: { ...quote.edge, dataSource: "live" as const } })),
    };
    const { outcomes } = await aggregator.collect("test", [forged], request);
    expect(outcomes[0]!.status).toBe("invalid_response");
  });

  it("applies only to the default scenario", async () => {
    const registry = new ProviderRegistry("default", now, SCENARIOS, undefined, live);
    const staged = await aggregator.collect("staged", registry.providers("solana_congestion"), request);
    const normal = await aggregator.collect("normal", registry.providers("default"), request);
    expect(staged.quotes.every((quote) => quote.edge.dataSource === "simulated")).toBe(true);
    expect(normal.quotes.some((quote) => quote.edge.dataSource === "live")).toBe(true);
  });
});

describe("endpoint configuration", () => {
  it("rejects a plain http endpoint without repeating the URL", () => {
    expect(() => loadEnv({ QUICKNODE_BASE_URL: "http://example.com/secret-token/" })).toThrow(/QUICKNODE_BASE_URL/);
    try {
      loadEnv({ QUICKNODE_BASE_URL: "http://example.com/secret-token/" });
    } catch (error) {
      expect(String(error)).not.toContain("secret-token");
    }
  });

  it("treats a blank endpoint as unset", () => {
    expect(loadEnv({ QUICKNODE_BASE_URL: "" }).QUICKNODE_BASE_URL).toBeUndefined();
  });
});
