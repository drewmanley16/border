import { describe, expect, it } from "vitest";
import { formatDelivery, formatNetworkFee, midMarketRate, shortAddress, summarizeActivity, txUrl, type ChainActivity } from "./liveData";

const chain = (overrides: Partial<ChainActivity>): ChainActivity => ({
  chain: "Ethereum",
  status: "live",
  fromBlock: 1,
  toBlock: 3,
  windowSeconds: 36,
  transferCount: 2,
  volumeByCoin: { USDC: "10.5", USDT: "20" },
  countByCoin: { USDC: 1, USDT: 1 },
  largest: [{ coin: "USDT", amount: "20", from: "0xaa", to: "0xbb", txHash: "0x1", blockNumber: 2, timestamp: null }],
  observedAt: "2026-11-02T12:00:00Z",
  ...overrides,
});

describe("summarizeActivity", () => {
  it("adds up only what was actually read", () => {
    const summary = summarizeActivity([
      chain({}),
      chain({ chain: "Base", status: "unavailable", transferCount: null, windowSeconds: null, volumeByCoin: { USDC: "999" }, largest: [] }),
    ]);
    expect(summary).toMatchObject({ isLive: true, volume: 30.5, count: 2, largest: 20, seconds: 36 });
  });

  it("shows nothing when nothing is live", () => {
    expect(summarizeActivity([])).toMatchObject({ isLive: false, volume: 0, count: 0, transfers: [] });
  });

  it("merges chains with the largest transfer first", () => {
    const base = chain({ chain: "Base", largest: [{ coin: "USDC", amount: "500", from: "0xaa", to: "0xbb", txHash: "0x2", blockNumber: 9, timestamp: null }] });
    expect(summarizeActivity([chain({}), base]).transfers.map((row) => row.chain)).toEqual(["Base", "Ethereum"]);
  });
});

describe("midMarketRate", () => {
  const quote = (rate: number, midMarket: boolean) => ({ name: "A", type: "provider" as const, fee: 0, rate, received: 1, midMarket, collectedAt: "", deliveryHours: null });

  it("uses a mid-market quote, and never a marked-up one", () => {
    expect(midMarketRate([quote(1.3, false), quote(1.4, true)])).toBe(1.4);
    expect(midMarketRate([quote(1.3, false)])).toBeNull();
    expect(midMarketRate([quote(1.39855, true), quote(1.39885, true)])).toBe(1.39885);
  });
});

describe("formatting", () => {
  it("states delivery only when a provider gave one", () => {
    expect(formatDelivery({ min: 1, max: 48 })).toBe("Up to 2 days");
    expect(formatDelivery({ min: 0.5, max: 0.5 })).toBe("Under 1h");
    expect(formatDelivery(null)).toBeNull();
  });

  it("keeps sub-cent fees readable", () => {
    expect(formatNetworkFee("0.031")).toBe("$0.03");
    expect(formatNetworkFee("0.00046391")).toBe("$0.00046");
  });

  it("shortens addresses and links the right explorer", () => {
    expect(shortAddress("0xaabbccddeeff00112233")).toBe("0xaabb…2233");
    expect(txUrl("Base", "0x1")).toBe("https://basescan.org/tx/0x1");
  });
});
