import { describe, expect, it } from "vitest";
import { StableFlow, StableFlowError } from "./index.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function client(responses: Response[], seen: { url: string; init: RequestInit }[] = []) {
  return new StableFlow({
    apiKey: "sf_test_x",
    baseUrl: "https://api.example/",
    fetch: (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return responses.shift()!;
    }) as typeof fetch,
  });
}

const request = {
  source: { country: "US", currency: "USD", amount: "1000.00", fundingMethod: "bank_transfer" },
  destination: { country: "BR", currency: "BRL", payoutMethod: "pix" },
  optimizeFor: "lowest_cost" as const,
};

describe("StableFlow SDK", () => {
  it("sends the key, body and scenario", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    await client([json(200, { routes: [] })], seen).routes.compare(request, { scenario: "base_outage" });
    const { url, init } = seen[0]!;
    expect(url).toBe("https://api.example/v1/routes/compare");
    expect(init.headers).toMatchObject({ "x-api-key": "sf_test_x", "x-simulation-scenario": "base_outage" });
    expect(JSON.parse(init.body as string)).toEqual(request);
  });

  it("raises API errors with their code and request id", async () => {
    const failing = client([json(422, { error: { code: "unsupported_corridor", message: "No.", requestId: "req_1" } })]);
    const error = await failing.routes.compare(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StableFlowError);
    expect(error).toMatchObject({ status: 422, code: "unsupported_corridor", requestId: "req_1" });
  });

  it("retries reads", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const providers = await client([json(503, {}), json(200, { providers: [] })], seen).providers.list();
    expect(providers).toEqual([]);
    expect(seen).toHaveLength(2);
  });

  it("never resends a compare", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    await client([json(503, {}), json(200, {})], seen).routes.compare(request).catch(() => undefined);
    expect(seen).toHaveLength(1);
  });

  it("builds filtered corridor queries", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    await client([json(200, { corridors: [] })], seen).corridors.list({ country: "BR", payoutMethod: "pix" });
    expect(seen[0]!.url).toBe("https://api.example/v1/corridors?country=BR&payoutMethod=pix");
  });
});
