import { describe, expect, it, vi } from "vitest";
import { toRows, WiseComparison } from "./providerQuotes.js";

const quote = (received: number | null, overrides = {}) => ({
  fee: 5,
  rate: 150,
  receivedAmount: received,
  dateCollected: "2026-11-02T10:00:00Z",
  sourceCountry: null,
  targetCountry: null,
  deliveryEstimation: { providerGivesEstimate: true, duration: { min: "PT1H", max: "PT48H" } },
  ...overrides,
});
const request = { from: "USD", to: "JPY", amount: 1000, fromCountry: "US", toCountry: "JP" };

describe("toRows", () => {
  it("ranks by what the recipient actually gets, not by the upfront fee", () => {
    const rows = toRows([
      { name: "Free but dear", type: "moneyTransferProvider", quotes: [quote(140, { fee: 0 })] },
      { name: "Bank", type: "bank", quotes: [quote(150, { fee: 25 })] },
    ], request);
    expect(rows.map((row) => row.name)).toEqual(["Bank", "Free but dear"]);
    expect(rows[0]).toMatchObject({ type: "bank", deliveryHours: { min: 1, max: 48 } });
  });

  it("ignores quotes for other countries", () => {
    const rows = toRows([{ name: "A", type: "x", quotes: [quote(999, { targetCountry: "BR" }), quote(100, { targetCountry: "JP" })] }], request);
    expect(rows[0]!.received).toBe(100);
  });

  it("drops a provider with no usable quote rather than filling it in", () => {
    expect(toRows([{ name: "A", type: "x", quotes: [quote(null)] }, { name: "B", type: "x", quotes: [] }], request)).toEqual([]);
  });

  it("leaves delivery unknown unless the provider estimates it", () => {
    const rows = toRows([{ name: "A", type: "x", quotes: [quote(100, { deliveryEstimation: { providerGivesEstimate: false, duration: null } })] }], request);
    expect(rows[0]!.deliveryHours).toBeNull();
  });
});

describe("WiseComparison", () => {
  const now = () => new Date("2026-11-02T12:00:00Z");

  it("reuses a reading for the same request only", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ providers: [] }))) as unknown as typeof globalThis.fetch;
    const source = new WiseComparison({ now, fetch });
    await source.get(request);
    await source.get(request);
    await source.get({ ...request, amount: 2000 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gives nothing on failure", async () => {
    const fetch = vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof globalThis.fetch;
    await expect(new WiseComparison({ now, fetch }).get(request)).resolves.toBeUndefined();
  });
});
