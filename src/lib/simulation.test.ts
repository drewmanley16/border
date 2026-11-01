import { describe, expect, it } from "vitest";
import { Aggregator, averageSettlementMs } from "./aggregate";
import { CITIES, CORRIDORS, CITY_BY_ID } from "./cities";
import { COIN_CHAINS, STABLECOINS, WHALE_USD } from "./constants";
import { angularDistance, latLngToUnit, slerpUnit } from "./geo";
import { TransactionGenerator } from "./simulation";

const sample = (seed: number, n: number) => {
  const generator = new TransactionGenerator(seed);
  return Array.from({ length: n }, () => generator.next(0));
};

describe("TransactionGenerator", () => {
  it("repeats exactly for the same seed", () => {
    expect(sample(7, 500)).toEqual(sample(7, 500));
  });

  it("differs between seeds", () => {
    expect(sample(7, 50)).not.toEqual(sample(8, 50));
  });

  it("only pairs stablecoins with chains that carry them", () => {
    for (const { transaction: tx } of sample(1, 5000)) {
      expect(COIN_CHAINS[tx.stablecoin][tx.chain], `${tx.stablecoin} on ${tx.chain}`).toBeDefined();
    }
  });

  it("uses a realistic, not uniform, amount and coin mix", () => {
    const events = sample(2, 20000);
    const under500 = events.filter((e) => e.transaction.amountUSD <= 500).length / events.length;
    const whales = events.filter((e) => e.transaction.amountUSD >= WHALE_USD).length / events.length;
    expect(under500).toBeGreaterThan(0.5);
    expect(whales).toBeGreaterThan(0.002);
    expect(whales).toBeLessThan(0.02);
    const seen = new Set(events.map((e) => e.transaction.stablecoin));
    expect(seen.size).toBe(STABLECOINS.length);
  });

  it("only produces cross-border routes", () => {
    for (const { transaction: tx } of sample(3, 5000)) {
      expect(tx.origin.countryCode).not.toBe(tx.destination.countryCode);
    }
  });

  it("averages several transactions per second", () => {
    const events = sample(4, 20000);
    const seconds = events.reduce((sum, e) => sum + e.gapMs, 0) / 1000;
    const rate = events.length / seconds;
    expect(rate).toBeGreaterThan(3);
    expect(rate).toBeLessThan(15);
  });
});

describe("corridors", () => {
  it("reference known cities in different countries", () => {
    for (const { from, to } of CORRIDORS) {
      const a = CITY_BY_ID.get(from);
      const b = CITY_BY_ID.get(to);
      expect(a, from).toBeDefined();
      expect(b, to).toBeDefined();
      expect(a!.countryCode).not.toBe(b!.countryCode);
    }
  });

  it("keep every city in use", () => {
    const used = new Set(CORRIDORS.flatMap((c) => [c.from, c.to]));
    expect(CITIES.filter((c) => !used.has(c.id)).map((c) => c.city)).toEqual([]);
  });
});

describe("geo", () => {
  it("places coordinates on the expected axes", () => {
    expect(latLngToUnit(90, 0)[1]).toBeCloseTo(1);
    expect(latLngToUnit(0, 0)[2]).toBeCloseTo(1);
    expect(latLngToUnit(0, 90)[0]).toBeCloseTo(1);
  });

  it("measures New York to London at about 5,570 km", () => {
    const km = angularDistance(latLngToUnit(40.7128, -74.006), latLngToUnit(51.5074, -0.1278)) * 6371;
    expect(km).toBeGreaterThan(5500);
    expect(km).toBeLessThan(5650);
  });

  it("starts and ends arcs on the exact coordinates", () => {
    const a = latLngToUnit(40.7, -74);
    const b = latLngToUnit(-33.9, 151.2);
    slerpUnit(a, b, 0).forEach((v, i) => expect(v).toBeCloseTo(a[i]));
    slerpUnit(a, b, 1).forEach((v, i) => expect(v).toBeCloseTo(b[i]));
  });
});

describe("Aggregator", () => {
  it("keeps ingesting after a consumer freezes what it was given", () => {
    const aggregator = new Aggregator();
    const [first, second] = sample(6, 2);
    aggregator.ingest(first.transaction);
    aggregator.timeline().forEach(Object.freeze);
    expect(() => aggregator.ingest(second.transaction)).not.toThrow();
    expect(aggregator.totals().count).toBe(2);
  });

  it("reconciles counts, volume and settlement across status changes", () => {
    const aggregator = new Aggregator();
    let settledVolume = 0;
    let settlementTotal = 0;
    let settled = 0;
    let failed = 0;
    const events = sample(5, 2000);
    for (const { transaction, outcome, resolveInMs } of events) {
      aggregator.ingest(transaction);
      if (outcome === "settled") {
        aggregator.ingest({ ...transaction, status: "settled", settlementTimeMs: resolveInMs });
        settledVolume += transaction.amountUSD;
        settlementTotal += resolveInMs;
        settled += 1;
      } else {
        aggregator.ingest({ ...transaction, status: "failed" });
        failed += 1;
      }
    }
    const totals = aggregator.totals();
    expect(totals.count).toBe(events.length);
    expect(totals.settled).toBe(settled);
    expect(totals.failed).toBe(failed);
    expect(totals.volumeUSD).toBeCloseTo(settledVolume, 2);
    expect(averageSettlementMs(totals)).toBeCloseTo(settlementTotal / settled, 5);

    const coinSum = Object.values(aggregator.byCoin()).reduce((n, t) => n + t.count, 0);
    expect(coinSum).toBe(events.length);
    const chainVolume = Object.values(aggregator.byChain()).reduce((n, t) => n + t.volumeUSD, 0);
    expect(chainVolume).toBeCloseTo(settledVolume, 2);
    const largest = aggregator.largest();
    expect(largest[0].amountUSD).toBe(
      Math.max(...events.filter((e) => e.outcome === "settled").map((e) => e.transaction.amountUSD)),
    );
  });
});
