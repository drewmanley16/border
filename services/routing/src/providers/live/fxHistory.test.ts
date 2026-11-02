import { describe, expect, it, vi } from "vitest";
import { FrankfurterHistory } from "./fxHistory.js";

const now = () => new Date("2026-11-02T12:00:00Z");
const respond = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof globalThis.fetch;

describe("FrankfurterHistory", () => {
  it("returns dated points in order, and reads a pair once", async () => {
    const fetch = respond({ rates: { "2026-11-02": { JPY: 158 }, "2026-10-30": { JPY: 157 } } });
    const source = new FrankfurterHistory({ now, fetch });
    const history = await source.get("USD", "JPY");
    await source.get("USD", "JPY");
    expect(history?.points).toEqual([{ date: "2026-10-30", rate: 157 }, { date: "2026-11-02", rate: 158 }]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("makes no request for a currency against itself", async () => {
    const fetch = respond({});
    await expect(new FrankfurterHistory({ now, fetch }).get("EUR", "EUR")).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("gives nothing rather than a one-point line", async () => {
    await expect(new FrankfurterHistory({ now, fetch: respond({ rates: { "2026-11-02": { JPY: 158 } } }) }).get("USD", "JPY")).resolves.toBeUndefined();
  });
});
