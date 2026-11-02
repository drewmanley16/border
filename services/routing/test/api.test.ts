import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrap } from "../src/bootstrap.js";
import { loadEnv } from "../src/config/env.js";
import { generateApiKey, hashApiKey } from "../src/http/apiKeys.js";
import { corridorsFromScenario } from "../src/providers/corridors.js";
import { createSimulatedProviders } from "../src/providers/simulated/adapter.js";
import { QuoteAggregator, type QuoteCache } from "../src/providers/aggregator.js";
import type { FxRateSource } from "../src/providers/live/fxRates.js";
import { DEFAULT_SCENARIO, SCENARIOS } from "../src/providers/simulated/scenarios.js";
import { ProviderError, type ProviderQuote, type QuoteProvider } from "../src/providers/types.js";
import { MemoryStore } from "../src/store/memoryStore.js";

const API_KEY = "sf_test_integration";
const compareBody = {
  source: { country: "US", currency: "USD", amount: "1000.00", fundingMethod: "bank_transfer" },
  destination: { country: "BR", currency: "BRL", payoutMethod: "pix" },
  optimizeFor: "balanced",
};
const auth = { "x-api-key": API_KEY };

let app: FastifyInstance | undefined;
afterEach(() => app?.close());

interface Setup {
  env?: Record<string, string>;
  now?: () => Date;
  providers?: QuoteProvider[];
  fxRates?: FxRateSource;
}

async function start({ env = {}, now = () => new Date(), providers, fxRates }: Setup = {}) {
  const store = new MemoryStore(corridorsFromScenario(DEFAULT_SCENARIO));
  store.addApiKey(hashApiKey(API_KEY), { id: "key_a", name: "A", environment: "sandbox" });
  store.addApiKey(hashApiKey("sf_test_other"), { id: "key_b", name: "B", environment: "sandbox" });
  app = await bootstrap({
    env: loadEnv({ PROVIDER_TIMEOUT_MS: "50", PROVIDER_RETRIES: "1", ...env }),
    now,
    store,
    logger: false,
    retryDelayMs: 1,
    ...(providers ? { providers } : {}),
    fxRates: fxRates ?? { get: async () => undefined },
    providerQuotes: { get: async () => undefined },
    fxHistory: { get: async () => undefined },
  });
  return { app, store };
}

describe("GET /v1/network-conditions", () => {
  it("needs no key, and reports unavailable with no endpoints", async () => {
    const { app } = await start();
    const response = await app.inject({ method: "GET", url: "/v1/network-conditions" });
    expect(response.statusCode).toBe(200);
    expect(response.json().refreshSeconds).toBe(300);
    expect(response.json().networks.map((entry: { status: string }) => entry.status)).toEqual(["unavailable", "unavailable", "unavailable"]);
  });
});

describe("GET /v1/fx-rates", () => {
  it("returns no rates rather than made-up ones when the source is down", async () => {
    const { app } = await start();
    const response = await app.inject({ method: "GET", url: "/v1/fx-rates" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "unavailable", date: null, rates: {} });
  });

  it("returns the published rates", async () => {
    const fxRates: FxRateSource = { get: async () => ({ base: "USD", date: "2026-11-02", rates: { USD: 1, JPY: 157.9 }, observedAt: new Date().toISOString() }) };
    const { app } = await start({ fxRates });
    const response = await app.inject({ method: "GET", url: "/v1/fx-rates" });
    expect(response.json()).toMatchObject({ status: "live", date: "2026-11-02", rates: { JPY: 157.9 } });
  });
});

describe("GET /v1/fx-history", () => {
  it("returns no points rather than an invented line", async () => {
    const { app } = await start();
    const response = await app.inject({ method: "GET", url: "/v1/fx-history?from=USD&to=JPY" });
    expect(response.json()).toEqual({ status: "unavailable", points: [] });
  });
});

describe("GET /v1/provider-quotes", () => {
  it("says so when there are no quotes", async () => {
    const { app } = await start();
    const response = await app.inject({ method: "GET", url: "/v1/provider-quotes?from=USD&to=JPY&amount=1000" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "unavailable", quotes: [] });
  });

  it("rejects a bad request", async () => {
    const { app } = await start();
    const response = await app.inject({ method: "GET", url: "/v1/provider-quotes?from=usd&to=JPY&amount=-1" });
    expect(response.statusCode).toBe(400);
  });
});

describe("GET /v1/chain-activity", () => {
  it("never invents activity when no endpoint is configured", async () => {
    const { app } = await start();
    const response = await app.inject({ method: "GET", url: "/v1/chain-activity" });
    expect(response.statusCode).toBe(200);
    expect(response.json().chains).toMatchObject([
      { chain: "Ethereum", status: "unavailable", transferCount: null, largest: [] },
      { chain: "Base", status: "unavailable", transferCount: null, largest: [] },
    ]);
  });
});

const compare = (instance: FastifyInstance, body: unknown = compareBody, headers: Record<string, string> = auth) =>
  instance.inject({ method: "POST", url: "/v1/routes/compare", payload: body as object, headers });

const defaults = (now = () => new Date()) => createSimulatedProviders(DEFAULT_SCENARIO, now);

function replaceProvider(id: string, change: (provider: QuoteProvider) => Partial<QuoteProvider>): QuoteProvider[] {
  return defaults().map((provider) => (provider.id === id ? Object.assign(Object.create(provider) as QuoteProvider, change(provider)) : provider));
}

describe("POST /v1/routes/compare", () => {
  it("returns ranked, labeled, nonbinding routes with every required field", async () => {
    const { app } = await start();
    const res = await compare(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.binding).toBe(false);
    expect(body.disclaimer).toMatch(/Nonbinding/);
    expect(body.dataProvenance.dataSource).toBe("simulated");
    expect(body.routes.length).toBeGreaterThanOrEqual(4);
    expect(body.recommendedRouteId).toBe(body.routes[0].id);
    for (const route of body.routes) {
      expect(route.quoteId).toBe(body.quoteId);
      expect(route.dataProvenance.dataSource).toBe("simulated");
      expect(route.dataProvenance.note).toMatch(/simulated and illustrative/);
      expect(route.estimatedDestinationAmount).toMatch(/^\d+\.\d{2}$/);
      expect(route.exchangeRate.fxSpreadBps).toMatch(/^\d+\.\d{2}$/);
      expect(route.steps.length).toBe(route.stages.length);
      expect(route.rankingExplanation).toBeTruthy();
      expect(new Date(route.expiresAt).getTime()).toBeGreaterThan(Date.now());
    }
    expect(body.providers.every((p: { status: string }) => p.status === "ok")).toBe(true);
  });

  it("changes the winner with the objective", async () => {
    const { app } = await start();
    const first = async (optimizeFor: string) => (await compare(app, { ...compareBody, optimizeFor })).json().routes[0];
    expect((await first("fastest")).network).toBe("Solana");
    expect((await first("lowest_cost")).network).toBe("Base");
    expect((await first("most_reliable")).routeType).toBe("traditional");
  });

  it.each([
    ["0.00", "invalid_amount"],
    ["-10.00", "invalid_amount"],
    ["1e3", "invalid_amount"],
    ["ten", "invalid_amount"],
    ["10.123", "invalid_amount_precision"],
  ])("rejects the amount %s", async (amount, code) => {
    const { app } = await start();
    const res = await compare(app, { ...compareBody, source: { ...compareBody.source, amount } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe(code);
  });

  it("rejects a numeric amount rather than risk float error", async () => {
    const { app } = await start();
    const res = await compare(app, { ...compareBody, source: { ...compareBody.source, amount: 1000 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");
  });

  it("rejects unsupported corridors and rails with guidance", async () => {
    const { app } = await start();
    const corridor = await compare(app, { ...compareBody, destination: { country: "CN", currency: "CNY", payoutMethod: "pix" } });
    expect(corridor.statusCode).toBe(422);
    expect(corridor.json().error.code).toBe("unsupported_corridor");

    const payout = await compare(app, { ...compareBody, destination: { ...compareBody.destination, payoutMethod: "boleto" } });
    expect(payout.json().error.code).toBe("unsupported_payout_method");
    expect(payout.json().error.details.supported).toEqual(["pix"]);

    const funding = await compare(app, { ...compareBody, source: { ...compareBody.source, fundingMethod: "card" } });
    expect(funding.json().error.code).toBe("unsupported_funding_method");
  });

  it("rejects unsupported stablecoin and network choices", async () => {
    const { app } = await start();
    const coin = await compare(app, { ...compareBody, preferences: { preferredStablecoins: ["BUSD"] } });
    expect(coin.json().error.code).toBe("unsupported_stablecoin");
    const pair = await compare(app, { ...compareBody, preferences: { preferredStablecoins: ["USDT"], excludedNetworks: ["Solana", "Ethereum"] } });
    expect(pair.json().error.code).toBe("unsupported_stablecoin_network");
  });

  it("returns an empty result with reasons when every route is filtered out", async () => {
    const { app } = await start();
    const res = await compare(app, { ...compareBody, preferences: { maxFeeUSD: "0.01" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().routes).toEqual([]);
    expect(res.json().recommendedRouteId).toBeNull();
    expect(res.json().excludedRoutes.every((e: { reason: string }) => e.reason === "max_fee_exceeded")).toBe(true);
  });

  it("selects a seeded scenario by header, and refuses unknown ones", async () => {
    const { app } = await start();
    const ok = await compare(app, compareBody, { ...auth, "x-simulation-scenario": "base_outage" });
    const body = ok.json();
    expect(body.dataProvenance.scenario).toBe("base_outage");
    expect(body.providers.find((p: { providerId: string }) => p.providerId === "sim_base_usdc").status).toBe("unavailable");
    expect(body.routes.some((r: { providers: string[] }) => r.providers.includes("sim_base_usdc"))).toBe(false);
    const bad = await compare(app, compareBody, { ...auth, "x-simulation-scenario": "nope" });
    expect(bad.json().error.code).toBe("unknown_scenario");
  });
});

describe("provider failures", () => {
  it("survives a timeout, reports it, and retries once", async () => {
    let calls = 0;
    const { app } = await start({
      providers: replaceProvider("sim_solana_usdc", () => ({
        getQuotes: () => {
          calls += 1;
          return new Promise<ProviderQuote[]>(() => undefined);
        },
      })),
    });
    const body = (await compare(app)).json();
    const outcome = body.providers.find((p: { providerId: string }) => p.providerId === "sim_solana_usdc");
    expect(outcome.status).toBe("timeout");
    expect(outcome.attempts).toBe(2);
    expect(calls).toBe(2);
    expect(body.routes.length).toBeGreaterThan(0);
    expect(body.routes.some((r: { providers: string[] }) => r.providers.includes("sim_solana_usdc"))).toBe(false);
  });

  it("recovers when a retry succeeds", async () => {
    const real = defaults().find((p) => p.id === "sim_base_usdc")!;
    let calls = 0;
    const { app } = await start({
      providers: replaceProvider("sim_base_usdc", () => ({
        getQuotes: async (request) => {
          calls += 1;
          if (calls === 1) throw new ProviderError("upstream_error", "blip", true);
          return real.getQuotes(request);
        },
      })),
    });
    const outcome = (await compare(app)).json().providers.find((p: { providerId: string }) => p.providerId === "sim_base_usdc");
    expect(outcome).toMatchObject({ status: "ok", attempts: 2 });
  });

  it("doesn't retry a failure marked permanent", async () => {
    let calls = 0;
    const { app } = await start({
      providers: replaceProvider("sim_base_usdc", () => ({
        getQuotes: async () => {
          calls += 1;
          throw new ProviderError("rate_limited", "slow down", false);
        },
      })),
    });
    const outcome = (await compare(app)).json().providers.find((p: { providerId: string }) => p.providerId === "sim_base_usdc");
    expect(outcome.status).toBe("rate_limited");
    expect(calls).toBe(1);
  });

  it("discards an invalid response without leaking it", async () => {
    const { app } = await start({
      providers: replaceProvider("sim_base_usdc", () => ({
        getQuotes: async () => [{ edge: { id: "bad" }, quotedAt: "soon", expiresAt: "later" }] as unknown as ProviderQuote[],
      })),
    });
    const body = (await compare(app)).json();
    expect(body.providers.find((p: { providerId: string }) => p.providerId === "sim_base_usdc").status).toBe("invalid_response");
    expect(body.routes.length).toBeGreaterThan(0);
  });

  it("refuses a rate better than the reference, which would fake negative cost", async () => {
    const real = defaults().find((p) => p.id === "sim_base_usdc")!;
    const { app } = await start({
      providers: replaceProvider("sim_base_usdc", () => ({
        getQuotes: async (request) =>
          (await real.getQuotes(request)).map((quote) =>
            quote.edge.kind === "offramp" ? { ...quote, edge: { ...quote.edge, exchangeRate: "99" } } : quote,
          ),
      })),
    });
    const outcome = (await compare(app)).json().providers.find((p: { providerId: string }) => p.providerId === "sim_base_usdc");
    expect(outcome.status).toBe("invalid_response");
    expect(outcome.detail).toMatch(/better than its reference/);
  });

  it("drops stale quotes", async () => {
    const { app } = await start({
      providers: replaceProvider("sim_base_usdc", () => ({
        getQuotes: async (request) => {
          const old = createSimulatedProviders(DEFAULT_SCENARIO, () => new Date(Date.now() - 3_600_000));
          return old.find((p) => p.id === "sim_base_usdc")!.getQuotes(request);
        },
      })),
    });
    const outcome = (await compare(app)).json().providers.find((p: { providerId: string }) => p.providerId === "sim_base_usdc");
    expect(outcome.status).toBe("stale_quotes");
  });

  it("answers 503 when no provider works at all", async () => {
    const down = (provider: QuoteProvider): QuoteProvider => Object.assign(Object.create(provider) as QuoteProvider, {
      getQuotes: async () => {
        throw new ProviderError("unavailable", "down", false);
      },
    });
    const { app } = await start({ providers: defaults().map(down) });
    const res = await compare(app);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("no_providers_available");
  });
});

describe("quote cache", () => {
  it("never serves one scenario's quotes to another", async () => {
    const entries = new Map<string, ProviderQuote[]>();
    const cache: QuoteCache = {
      get: async (key) => entries.get(key) ?? null,
      set: async (key, quotes) => void entries.set(key, quotes),
    };
    const aggregator = new QuoteAggregator({ timeoutMs: 50, concurrency: 4, retries: 0, retryDelayMs: 1, maxQuoteAgeMs: 60_000, now: () => new Date(), cache });
    const request = { source: compareBody.source, destination: compareBody.destination };
    const healthy = createSimulatedProviders(DEFAULT_SCENARIO, () => new Date());
    const outage = createSimulatedProviders(SCENARIOS.base_outage!, () => new Date());

    const first = await aggregator.collect("sandbox:default", healthy, request);
    expect(first.outcomes.every((outcome) => outcome.status === "ok")).toBe(true);
    const cached = await aggregator.collect("sandbox:default", healthy, request);
    expect(cached.outcomes.every((outcome) => outcome.attempts === 0)).toBe(true);

    const other = await aggregator.collect("sandbox:base_outage", outage, request);
    expect(other.outcomes.find((outcome) => outcome.providerId === "sim_base_usdc")!.status).toBe("unavailable");
  });

  it("ignores cached quotes that have since expired", async () => {
    let time = Date.parse("2026-06-01T12:00:00Z");
    const now = () => new Date(time);
    const entries = new Map<string, ProviderQuote[]>();
    const cache: QuoteCache = { get: async (key) => entries.get(key) ?? null, set: async (key, quotes) => void entries.set(key, quotes) };
    const aggregator = new QuoteAggregator({ timeoutMs: 50, concurrency: 4, retries: 0, retryDelayMs: 1, maxQuoteAgeMs: 60_000, now, cache });
    const providers = createSimulatedProviders(DEFAULT_SCENARIO, now);
    const request = { source: compareBody.source, destination: compareBody.destination };
    await aggregator.collect("s", providers, request);
    time += 120_000;
    const result = await aggregator.collect("s", providers, request);
    expect(result.outcomes.every((outcome) => outcome.attempts === 1)).toBe(true);
  });
});

describe("stored routes", () => {
  it("returns a route with its version, expiry and assumptions", async () => {
    const { app } = await start();
    const route = (await compare(app)).json().routes[0];
    const res = await app.inject({ url: `/v1/routes/${route.id}`, headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ id: route.id, quoteVersion: 1, quoteStatus: "active", binding: false, totalCostUSD: route.totalCostUSD });
    expect(body.assumptions.length).toBeGreaterThan(0);
  });

  it("marks a route expired after its quote lapses", async () => {
    let time = Date.parse("2026-06-01T12:00:00Z");
    const now = () => new Date(time);
    const { app } = await start({ now, providers: defaults(now) });
    const route = (await compare(app)).json().routes[0];
    time += 61_000;
    const res = await app.inject({ url: `/v1/routes/${route.id}`, headers: auth });
    expect(res.json().quoteStatus).toBe("expired");
    const viz = await app.inject({ url: `/v1/routes/${route.id}/visualization`, headers: auth });
    expect(viz.json().expired).toBe(true);
  });

  it("hides routes from other API keys", async () => {
    const { app } = await start();
    const route = (await compare(app)).json().routes[0];
    const res = await app.inject({ url: `/v1/routes/${route.id}`, headers: { "x-api-key": "sf_test_other" } });
    expect(res.statusCode).toBe(404);
  });

  it("answers 404 for an unknown route", async () => {
    const { app } = await start();
    const res = await app.inject({ url: "/v1/routes/route_nope", headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("route_not_found");
  });
});

describe("visualization", () => {
  it("labels routes as hypothetical with representative coordinates", async () => {
    const { app } = await start();
    const routes = (await compare(app, { ...compareBody, optimizeFor: "lowest_cost" })).json().routes;
    const res = await app.inject({ url: `/v1/routes/${routes[0].id}/visualization`, headers: auth });
    const body = res.json();
    expect(body).toMatchObject({ kind: "hypothetical_route", isRealPayment: false, coordinatesAreRepresentative: true });
    expect(body.origin).toMatchObject({ country: "US", lat: 37.7749, locationType: "representative" });
    expect(body.destination.country).toBe("BR");
    expect(body.disclaimer).toMatch(/No payment has occurred/);
    expect(body.comparison).toMatchObject({ isCheapest: true, relativeCost: "1.00", routesCompared: routes.length });
    expect(body.animation.mode).toBe("hypothetical");

    const worst = await app.inject({ url: `/v1/routes/${routes.at(-1).id}/visualization`, headers: auth });
    expect(worst.json().comparison.isCheapest).toBe(false);
    expect(Number(worst.json().comparison.relativeCost)).toBeGreaterThan(1);
  });
});

describe("catalog", () => {
  it("filters corridors", async () => {
    const { app } = await start();
    const all = (await app.inject({ url: "/v1/corridors" })).json().corridors;
    const pix = (await app.inject({ url: "/v1/corridors?payoutMethod=pix" })).json().corridors;
    const brazil = (await app.inject({ url: "/v1/corridors?country=BR&currency=BRL" })).json().corridors;
    expect(all.length).toBeGreaterThan(pix.length);
    expect(pix.length).toBeGreaterThan(0);
    expect(pix.every((c: { supportedPayoutMethods: string[] }) => c.supportedPayoutMethods.includes("pix"))).toBe(true);
    expect(brazil.every((c: { destinationCountry: string }) => c.destinationCountry === "BR")).toBe(true);
  });

  it("lists providers with capabilities and simulated status", async () => {
    const { app } = await start();
    const { providers, note } = (await app.inject({ url: "/v1/providers" })).json();
    expect(providers.length).toBeGreaterThanOrEqual(4);
    expect(note).toMatch(/illustrative/);
    const solana = providers.find((p: { id: string }) => p.id === "sim_solana_usdc");
    expect(solana).toMatchObject({ mode: "simulated", enabled: true, stablecoins: ["USDC"], blockchains: ["Solana"] });
    expect(solana.health.status).toBe("healthy");
    expect(providers.find((p: { id: string }) => p.id === "sim_bank_fx").blockchains).toEqual([]);
  });

  it("reports health", async () => {
    const { app } = await start();
    const res = await app.inject({ url: "/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", environment: "sandbox", dependencies: { database: { status: "ok", type: "memory" }, redis: { status: "not_configured" } } });
  });

  it("serves OpenAPI and docs", async () => {
    const { app } = await start();
    const spec = (await app.inject({ url: "/openapi.json" })).json();
    expect(spec.openapi).toBe("3.1.0");
    for (const path of ["/v1/routes/compare", "/v1/routes/{routeId}", "/v1/routes/{routeId}/visualization", "/v1/corridors", "/v1/providers", "/v1/health"]) {
      expect(Object.keys(spec.paths), path).toContain(path);
    }
    expect(spec.paths["/v1/routes/compare"].post.requestBody).toBeDefined();
    expect((await app.inject({ url: "/docs/" })).statusCode).toBe(200);
  });
});

describe("security", () => {
  it("requires an API key on protected endpoints", async () => {
    const { app } = await start();
    const missing = await compare(app, compareBody, {});
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe("missing_api_key");
    const wrong = await compare(app, compareBody, { "x-api-key": "sf_test_wrong" });
    expect(wrong.json().error.code).toBe("invalid_api_key");
    expect((await app.inject({ url: "/v1/routes/route_x" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/v1/routes/route_x/visualization" })).statusCode).toBe(401);
  });

  it("accepts a bearer token", async () => {
    const { app } = await start();
    expect((await compare(app, compareBody, { authorization: `Bearer ${API_KEY}` })).statusCode).toBe(200);
  });

  it("stores only hashes of API keys", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^sf_test_/);
    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(key)).not.toContain(key.slice(8));
  });

  it("rate limits per key, and consistently formats the error", async () => {
    const { app } = await start({ env: { RATE_LIMIT_MAX: "2" } });
    expect((await compare(app)).statusCode).toBe(200);
    expect((await compare(app)).statusCode).toBe(200);
    const limited = await compare(app);
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("rate_limited");
    expect(limited.headers["x-ratelimit-limit"]).toBe("2");
    expect((await compare(app, compareBody, { "x-api-key": "sf_test_other" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/health" })).statusCode).toBe(200);
  });

  it("echoes safe request ids and replaces unsafe ones", async () => {
    const { app } = await start();
    const kept = await app.inject({ url: "/v1/health", headers: { "x-request-id": "trace-12345678" } });
    expect(kept.headers["x-request-id"]).toBe("trace-12345678");
    const replaced = await app.inject({ url: "/v1/nothing", headers: { "x-request-id": "bad id\n" } });
    expect(replaced.headers["x-request-id"]).not.toContain("bad");
    expect(replaced.json().error.requestId).toBe(replaced.headers["x-request-id"]);
    expect(replaced.statusCode).toBe(404);
  });

  it("only allows configured origins", async () => {
    const { app } = await start({ env: { CORS_ORIGINS: "https://app.example" } });
    const allowed = await app.inject({ url: "/v1/health", headers: { origin: "https://app.example" } });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example");
    const blocked = await app.inject({ url: "/v1/health", headers: { origin: "https://evil.example" } });
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuses to run production on simulated data", () => {
    expect(() => loadEnv({ STABLEFLOW_ENV: "production", DATABASE_URL: "postgresql://x" })).toThrowError(/live provider/);
    expect(() => loadEnv({ PORT: "not-a-port" })).toThrowError(/Invalid environment/);
  });
});
