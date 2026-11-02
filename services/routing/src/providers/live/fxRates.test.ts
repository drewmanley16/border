import { describe, expect, it, vi } from "vitest";
import { FrankfurterRates } from "./fxRates.js";

const now = () => new Date("2026-11-02T12:00:00Z");
const respond = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof globalThis.fetch;
const good = { base: "USD", date: "2026-11-02", rates: { JPY: 157.9, EUR: 0.89 } };

describe("FrankfurterRates", () => {
  it("adds USD at 1, and reads only once", async () => {
    const fetch = respond(good);
    const source = new FrankfurterRates({ now, fetch });
    await expect(source.get()).resolves.toMatchObject({ date: "2026-11-02", rates: { JPY: 157.9, USD: 1 } });
    await source.get();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ["an error status", respond(good, 503)],
    ["a zero rate", respond({ ...good, rates: { JPY: 0 } })],
    ["no rates", respond({ ...good, rates: {} })],
  ])("gives no rates on %s", async (_name, fetch) => {
    await expect(new FrankfurterRates({ now, fetch }).get()).resolves.toBeUndefined();
  });
});
