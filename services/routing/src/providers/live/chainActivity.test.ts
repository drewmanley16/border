import { describe, expect, it, vi } from "vitest";
import { RpcChainActivity, summarize } from "./chainActivity.js";

const NOW = new Date("2026-11-02T12:00:00Z");
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (value: string) => `0x${value.padStart(64, "0")}`;

function log(address: string, units: bigint, overrides = {}) {
  return {
    address,
    topics: [TOPIC, pad("aa".repeat(20)), pad("bb".repeat(20))],
    data: pad(units.toString(16)),
    blockNumber: "0x64",
    blockTimestamp: "0x6a000000",
    transactionHash: "0xabc",
    ...overrides,
  };
}

describe("summarize", () => {
  it("reads amounts at six decimals and ranks the largest first", () => {
    const activity = summarize("Ethereum", 98, 100, 36, [log(USDC, 5_000_000n), log(USDT, 2_500_000_000n)], NOW.toISOString());
    expect(activity.transferCount).toBe(2);
    expect(activity.volumeByCoin).toEqual({ USDC: "5.000000", USDT: "2500.000000" });
    expect(activity.largest[0]).toMatchObject({ coin: "USDT", amount: "2500.000000", from: `0x${"aa".repeat(20)}`, to: `0x${"bb".repeat(20)}` });
  });

  it("ignores other contracts, other events and zero transfers", () => {
    const activity = summarize("Ethereum", 98, 100, 36, [
      log("0x0000000000000000000000000000000000000001", 1_000_000n),
      log(USDC, 1_000_000n, { topics: ["0xdead", pad("aa"), pad("bb")] }),
      log(USDC, 0n),
    ], NOW.toISOString());
    expect(activity.transferCount).toBe(0);
    expect(activity.largest).toEqual([]);
  });

  it("leaves the time empty rather than guessing when a node omits it", () => {
    const bare = log(USDC, 1_000_000n, { blockTimestamp: undefined });
    expect(summarize("Ethereum", 98, 100, 36, [bare], NOW.toISOString()).largest[0]!.timestamp).toBeNull();
  });
});

describe("RpcChainActivity", () => {
  const fetchWith = (logs: unknown) => vi.fn(async (_url: unknown, init?: RequestInit) => {
    const { method, params } = JSON.parse(init!.body as string) as { method: string; params: unknown[] };
    const result = method === "eth_getLogs" ? logs : { number: "0x64", timestamp: params[0] === "0x62" ? "0x70" : "0x40" };
    return new Response(JSON.stringify({ result }));
  }) as unknown as typeof globalThis.fetch;

  it("reads once, then serves the same reading", async () => {
    const fetch = fetchWith([log(USDC, 1_000_000n)]);
    const source = new RpcChainActivity({ urls: { ethereum: "https://x.test/secret-token/" }, now: () => NOW, freshForMs: 300_000, fetch });
    const first = await source.get("Ethereum");
    const calls = vi.mocked(fetch).mock.calls.length;
    await expect(source.get("Ethereum")).resolves.toEqual(first);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    expect(first).toMatchObject({ fromBlock: 96, toBlock: 98, transferCount: 1 });
  });

  it("reports nothing on failure, without exposing the endpoint", async () => {
    const onError = vi.fn();
    const fetch = vi.fn(async () => { throw new Error("connect https://x.test/secret-token/"); }) as unknown as typeof globalThis.fetch;
    const source = new RpcChainActivity({ urls: { ethereum: "https://x.test/secret-token/" }, now: () => NOW, freshForMs: 300_000, fetch, onError });
    await expect(source.get("Ethereum")).resolves.toBeUndefined();
    expect(JSON.stringify(onError.mock.calls)).not.toContain("secret-token");
  });

  it("makes no calls for a chain with no endpoint", async () => {
    const fetch = fetchWith([]);
    const source = new RpcChainActivity({ urls: {}, now: () => NOW, freshForMs: 300_000, fetch });
    await expect(source.get("Base")).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
