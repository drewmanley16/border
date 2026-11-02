import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrap } from "../src/bootstrap.js";
import { loadEnv } from "../src/config/env.js";
import { generateApiKey, hashApiKey, keyPrefix } from "../src/http/apiKeys.js";
import { corridorsFromScenario } from "../src/providers/corridors.js";
import { DEFAULT_SCENARIO } from "../src/providers/simulated/scenarios.js";
import { createPrismaClient } from "../src/store/prismaStore.js";

/**
 * Runs against real services when TEST_DATABASE_URL and TEST_REDIS_URL are set,
 * as `npm run test:infra` does using docker-compose. Otherwise it's skipped.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;

describe.skipIf(!databaseUrl || !redisUrl)("Postgres and Redis", () => {
  const db = createPrismaClient(databaseUrl ?? "postgresql://localhost/unset");
  const apiKey = generateApiKey();
  const revokedKey = generateApiKey();
  const headers = { "x-api-key": apiKey };
  const body = {
    source: { country: "US", currency: "USD", amount: "2500.00", fundingMethod: "bank_transfer" },
    destination: { country: "JP", currency: "JPY", payoutMethod: "bank_transfer" },
    optimizeFor: "lowest_cost",
  };
  let app: FastifyInstance;

  beforeAll(async () => {
    for (const provider of DEFAULT_SCENARIO.providers) {
      const type = provider.kind === "onchain" ? "stablecoin" : provider.kind;
      await db.provider.upsert({ where: { id: provider.id }, create: { id: provider.id, name: provider.name, type }, update: {} });
    }
    await db.corridor.createMany({ data: corridorsFromScenario(DEFAULT_SCENARIO), skipDuplicates: true });
    await db.apiKey.create({ data: { name: "test", keyHash: hashApiKey(apiKey), keyPrefix: keyPrefix(apiKey) } });
    await db.apiKey.create({ data: { name: "revoked", keyHash: hashApiKey(revokedKey), keyPrefix: keyPrefix(revokedKey), revokedAt: new Date() } });
    app = await bootstrap({
      env: loadEnv({ DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, RATE_LIMIT_MAX: "4", LOG_LEVEL: "silent" }),
      logger: false,
    });
  });

  afterAll(async () => {
    await app?.close();
    await db.apiKey.deleteMany({ where: { keyHash: { in: [hashApiKey(apiKey), hashApiKey(revokedKey)] } } }).catch(() => undefined);
    await db.$disconnect();
  });

  it("persists a quote and reads the same route back", async () => {
    const quote = (await app.inject({ method: "POST", url: "/v1/routes/compare", payload: body, headers })).json();
    expect(quote.routes.length).toBeGreaterThan(0);
    const route = quote.routes[0];

    const stored = await db.route.findUniqueOrThrow({ where: { id: route.id }, include: { quote: true } });
    expect(stored.totalFees.toFixed(2)).toBe(route.totalCostUSD);
    expect(stored.recipientAmount.toFixed(0)).toBe(route.estimatedDestinationAmount);
    expect(stored.quote.environment).toBe("sandbox");

    const read = (await app.inject({ url: `/v1/routes/${route.id}`, headers })).json();
    expect(read).toMatchObject({ id: route.id, totalCostUSD: route.totalCostUSD, quoteStatus: "active" });
    expect((await app.inject({ url: `/v1/routes/${route.id}/visualization`, headers })).json().destination.country).toBe("JP");
  });

  it("reports healthy dependencies and filters seeded corridors", async () => {
    const health = (await app.inject({ url: "/v1/health" })).json();
    expect(health.dependencies).toMatchObject({ database: { status: "ok", type: "postgres" }, redis: { status: "ok" } });
    const { corridors } = (await app.inject({ url: "/v1/corridors?payoutMethod=pix" })).json();
    expect(corridors.length).toBeGreaterThan(0);
  });

  it("refuses revoked keys", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/routes/compare", payload: body, headers: { "x-api-key": revokedKey } });
    expect(res.statusCode).toBe(401);
  });

  it("honors a provider disabled in the database", async () => {
    await db.provider.update({ where: { id: "sim_base_usdc" }, data: { enabled: false } });
    try {
      const quote = (await app.inject({ method: "POST", url: "/v1/routes/compare", payload: body, headers })).json();
      expect(quote.providers.some((p: { providerId: string }) => p.providerId === "sim_base_usdc")).toBe(false);
    } finally {
      await db.provider.update({ where: { id: "sim_base_usdc" }, data: { enabled: true } });
    }
  });

  it("enforces the rate limit through Redis", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await app.inject({ url: "/v1/routes/route_none", headers })).statusCode);
    expect(statuses).toContain(429);
  });
});
