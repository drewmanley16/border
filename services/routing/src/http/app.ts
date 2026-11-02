import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError, jsonSchemaTransform, jsonSchemaTransformObject, serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { Redis } from "ioredis";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { ApiError } from "../domain/errors.js";
import type { CompareRequest } from "../domain/types.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { ASSUMPTIONS, ESTIMATE_DISCLAIMER, QUOTE_VERSION, type QuoteService } from "../quotes/service.js";
import { buildVisualization } from "../quotes/visualization.js";
import type { ApiKeyRecord, Store } from "../store/types.js";
import { hashApiKey } from "./apiKeys.js";
import type { ActivityChain, ChainActivitySource } from "../providers/live/chainActivity.js";
import type { FxHistorySource } from "../providers/live/fxHistory.js";
import type { FxRateSource } from "../providers/live/fxRates.js";
import type { ProviderQuoteRequest, ProviderQuoteSource } from "../providers/live/providerQuotes.js";
import type { LiveNetwork, NetworkConditionSource } from "../providers/live/networkConditions.js";
import { chainActivityResponseSchema, compareRequestSchema, compareResponseSchema, corridorQuerySchema, corridorsResponseSchema, errorSchema, fxHistoryQuerySchema, fxHistoryResponseSchema, fxRatesResponseSchema, healthResponseSchema, providerQuotesQuerySchema, providerQuotesResponseSchema, networkConditionsResponseSchema, providersResponseSchema, routeDetailSchema, visualizationSchema } from "./schemas.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: ApiKeyRecord;
  }
}

export interface AppDependencies {
  env: Env;
  store: Store;
  storeType: "postgres" | "memory";
  registry: ProviderRegistry;
  conditions?: NetworkConditionSource;
  activity?: ChainActivitySource;
  fxRates?: FxRateSource;
  fxHistory?: FxHistorySource;
  providerQuotes?: ProviderQuoteSource;
  quotes: QuoteService;
  redis?: Redis;
  now: () => Date;
  logger?: boolean | object;
}

const VERSION = "0.1.0";
const SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14";

/** One static page. @fastify/swagger-ui's file server can't load on Vercel. */
const DOCS_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StableFlow Routing API</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  </head>
  <body>
    <div id="docs"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
    <script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#docs" });</script>
  </body>
</html>`;
const HEALTH_TIMEOUT_MS = 3_000;
const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

/** A stuck dependency should report as unavailable, not hang the health check. */
function probe(check: Promise<unknown>): Promise<"ok" | "unavailable"> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<"unavailable">((resolve) => {
    timer = setTimeout(() => resolve("unavailable"), HEALTH_TIMEOUT_MS);
  });
  const result = check.then(() => "ok" as const, () => "unavailable" as const);
  return Promise.race([result, timeout]).finally(() => clearTimeout(timer));
}

function presentedKey(request: FastifyRequest): string | null {
  const header = request.headers["x-api-key"];
  if (typeof header === "string" && header) return header;
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? "");
  return match?.[1] ?? null;
}

const errorResponses = {
  400: errorSchema,
  401: errorSchema,
  404: errorSchema,
  422: errorSchema,
  429: errorSchema,
  503: errorSchema,
};

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { env, store, registry, quotes, redis, now } = deps;

  const app = Fastify({
    logger: deps.logger ?? {
      level: env.LOG_LEVEL,
      redact: { paths: ["req.headers.authorization", 'req.headers["x-api-key"]', "req.headers.cookie"], remove: true },
    },
    genReqId: (request) => {
      const supplied = request.headers["x-request-id"];
      return typeof supplied === "string" && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
    },
    bodyLimit: 32 * 1024,
    // On Vercel the client IP arrives in x-forwarded-for, set by the platform.
    trustProxy: Boolean(process.env.VERCEL),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const respond = (statusCode: number, code: string, message: string, details?: unknown) =>
      reply.status(statusCode).send({ error: { code, message, requestId: request.id, ...(details === undefined ? {} : { details }) } });

    if (error instanceof ApiError) return respond(error.statusCode, error.code, error.message, error.details);
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map(({ instancePath, message }) => ({ path: instancePath, message }));
      return respond(400, "validation_error", "The request is invalid.", { issues });
    }
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, "response failed its schema");
      return respond(500, "internal_error", "Something went wrong on our side.");
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return respond(429, "rate_limited", "Too many requests. Slow down and retry after the reset time.");
    if (status && status >= 400 && status < 500) {
      return respond(status, "bad_request", error instanceof Error ? error.message : "The request is invalid.");
    }
    request.log.error({ err: error }, "unhandled error");
    return respond(500, "internal_error", "Something went wrong on our side.");
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ error: { code: "not_found", message: `No endpoint at ${request.method} ${request.url}.`, requestId: request.id } }),
  );

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false, allowedHeaders: ["content-type", "authorization", "x-api-key", "x-request-id"] });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    skipOnError: true,
    ...(redis ? { redis } : {}),
    // Hashed so raw keys can't end up in Redis.
    keyGenerator: (request) => {
      const key = presentedKey(request);
      return key ? `key:${hashApiKey(key)}` : `ip:${request.ip}`;
    },
    allowList: (request) => !request.url.startsWith("/v1/") || request.url.startsWith("/v1/health"),
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "StableFlow Routing API",
        version: VERSION,
        description:
          "Compares international payment routes across stablecoins, blockchains, FX providers and local payout rails. Quote comparison only: this API moves no money. All current data is simulated and illustrative, and every quote is a nonbinding estimate.",
      },
      tags: [
        { name: "Routes", description: "Compare and inspect payment routes" },
        { name: "Catalog", description: "Supported corridors and providers" },
        { name: "System", description: "Service health" },
      ],
      components: {
        securitySchemes: {
          apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
          bearer: { type: "http", scheme: "bearer" },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });

  const api = app.withTypeProvider<ZodTypeProvider>();

  const authenticate = async (request: FastifyRequest) => {
    const key = presentedKey(request);
    if (!key) throw new ApiError(401, "missing_api_key", "Send your API key in the x-api-key header.");
    const record = await store.findActiveApiKey(hashApiKey(key));
    if (!record) throw new ApiError(401, "invalid_api_key", "This API key is invalid or has been revoked.");
    if (record.environment !== env.STABLEFLOW_ENV) {
      throw new ApiError(401, "wrong_environment", `This key is for ${record.environment}, and this server runs ${env.STABLEFLOW_ENV}.`);
    }
    request.apiKey = record;
  };
  const secured: Record<string, string[]>[] = [{ apiKey: [] }, { bearer: [] }];

  api.post("/v1/routes/compare", {
    onRequest: authenticate,
    schema: {
      tags: ["Routes"],
      summary: "Compare payment routes",
      description: "Returns every eligible route, ranked by `optimizeFor`. Estimates are nonbinding. In sandbox, `x-simulation-scenario` selects a seeded scenario.",
      security: secured,
      headers: z.object({ "x-simulation-scenario": z.string().optional() }),
      body: compareRequestSchema,
      response: { 200: compareResponseSchema, ...errorResponses },
    },
  }, async (request) => {
    const scenario = request.headers["x-simulation-scenario"];
    return quotes.compare(request.body as CompareRequest, request.apiKey!.id, typeof scenario === "string" ? scenario : undefined);
  });

  const routeParams = z.object({ routeId: z.string().min(1) });

  api.get("/v1/routes/:routeId", {
    onRequest: authenticate,
    schema: {
      tags: ["Routes"],
      summary: "Get a stored route",
      description: "Stays readable after expiry, with `quoteStatus` set to `expired`.",
      security: secured,
      params: routeParams,
      response: { 200: routeDetailSchema, ...errorResponses },
    },
  }, async (request) => {
    const { quote, route } = await quotes.findRoute(request.params.routeId, request.apiKey!.id);
    return {
      ...route,
      quoteVersion: quote.version ?? QUOTE_VERSION,
      quoteStatus: new Date(route.expiresAt) <= now() ? ("expired" as const) : ("active" as const),
      quoteCreatedAt: quote.createdAt.toISOString(),
      binding: false as const,
      disclaimer: ESTIMATE_DISCLAIMER,
      assumptions: ASSUMPTIONS,
    };
  });

  api.get("/v1/routes/:routeId/visualization", {
    onRequest: authenticate,
    schema: {
      tags: ["Routes"],
      summary: "Get globe-ready route data",
      description: "Describes a hypothetical route. Coordinates are representative, and nothing here is a real payment.",
      security: secured,
      params: routeParams,
      response: { 200: visualizationSchema, ...errorResponses },
    },
  }, async (request) => {
    const { quote, route } = await quotes.findRoute(request.params.routeId, request.apiKey!.id);
    return buildVisualization(quote, route, now());
  });

  api.get("/v1/corridors", {
    schema: {
      tags: ["Catalog"],
      summary: "List supported corridors",
      querystring: corridorQuerySchema,
      response: { 200: corridorsResponseSchema, ...errorResponses },
    },
  }, async (request) => ({ corridors: await store.listCorridors(request.query) }));

  api.get("/v1/providers", {
    schema: {
      tags: ["Catalog"],
      summary: "List providers and capabilities",
      response: { 200: providersResponseSchema, ...errorResponses },
    },
  }, async () => {
    const disabled = await store.disabledProviderIds();
    const providers = await Promise.all(
      registry.providers().map(async (provider) => {
        const [capabilities, health] = await Promise.all([provider.getCapabilities(), provider.getHealth()]);
        return {
          id: provider.id,
          name: provider.name,
          type: provider.type,
          mode: provider.dataSource,
          enabled: !disabled.has(provider.id),
          supportedCountries: capabilities.countries,
          supportedCurrencies: capabilities.currencies,
          fundingMethods: capabilities.fundingMethods,
          payoutMethods: capabilities.payoutMethods,
          stablecoins: capabilities.stablecoins,
          blockchains: capabilities.networks,
          health,
        };
      }),
    );
    return { providers, note: "Simulated providers are illustrative and don't represent any real company." };
  });

  // Public on purpose: this is chain data, and it's served from the same cached
  // reading as quotes, so traffic here can't add RPC calls.
  api.get("/v1/network-conditions", {
    schema: {
      tags: ["Catalog"],
      summary: "Estimated fee and confirmation time for a stablecoin transfer on each network",
      response: { 200: networkConditionsResponseSchema, ...errorResponses },
    },
  }, async (_request, reply) => {
    const refreshSeconds = Math.round(env.NETWORK_CONDITIONS_TTL_MS / 1000);
    const networks = await Promise.all((["Ethereum", "Base", "Solana"] as LiveNetwork[]).map(async (network) => {
      const condition = await deps.conditions?.get(network);
      return {
        network,
        status: condition ? ("live" as const) : ("unavailable" as const),
        feeUSD: condition?.feeUSD ?? null,
        estimatedDurationSeconds: condition?.seconds ?? null,
        observedAt: condition?.observedAt ?? null,
      };
    }));
    reply.header("cache-control", "public, s-maxage=60");
    return {
      networks,
      refreshSeconds,
      note: "Estimates for a typical USDC transfer, from observed gas, block times and Chainlink prices. Not a quote.",
    };
  });

  api.get("/v1/chain-activity", {
    schema: {
      tags: ["Catalog"],
      summary: "Real USDC and USDT transfers from a short window of recent blocks",
      response: { 200: chainActivityResponseSchema, ...errorResponses },
    },
  }, async (_request, reply) => {
    const chains = await Promise.all((["Ethereum", "Base"] as ActivityChain[]).map(async (chain) => {
      const reading = await deps.activity?.get(chain);
      return reading
        ? { ...reading, status: "live" as const }
        : { chain, status: "unavailable" as const, fromBlock: null, toBlock: null, windowSeconds: null, transferCount: null, volumeByCoin: {}, countByCoin: {}, largest: [], observedAt: null };
    }));
    reply.header("cache-control", "public, s-maxage=60");
    return {
      chains,
      refreshSeconds: Math.round(env.NETWORK_CONDITIONS_TTL_MS / 1000),
      note: "Raw token transfers, including exchange and contract activity. A transfer isn't necessarily a payment, and locations are unknown.",
    };
  });

  api.get("/v1/fx-rates", {
    schema: {
      tags: ["Catalog"],
      summary: "ECB reference exchange rates per US dollar",
      response: { 200: fxRatesResponseSchema, ...errorResponses },
    },
  }, async (_request, reply) => {
    const reading = await deps.fxRates?.get();
    reply.header("cache-control", "public, s-maxage=300");
    return {
      status: reading ? ("live" as const) : ("unavailable" as const),
      base: "USD" as const,
      date: reading?.date ?? null,
      rates: reading?.rates ?? {},
      note: "European Central Bank reference rates, published each working day. Providers charge a spread on top.",
    };
  });

  api.get("/v1/fx-history", {
    schema: {
      tags: ["Catalog"],
      summary: "ECB reference rates for a currency pair over the last 30 days",
      querystring: fxHistoryQuerySchema,
      response: { 200: fxHistoryResponseSchema, ...errorResponses },
    },
  }, async (request, reply) => {
    const { from, to } = request.query as { from: string; to: string };
    const reading = await deps.fxHistory?.get(from, to);
    reply.header("cache-control", "public, s-maxage=3600");
    return { status: reading ? ("live" as const) : ("unavailable" as const), points: reading?.points ?? [] };
  });

  api.get("/v1/provider-quotes", {
    schema: {
      tags: ["Catalog"],
      summary: "What named providers deliver for a transfer, from Wise's public comparison data",
      querystring: providerQuotesQuerySchema,
      response: { 200: providerQuotesResponseSchema, ...errorResponses },
    },
  }, async (request, reply) => {
    const reading = await deps.providerQuotes?.get(request.query as ProviderQuoteRequest);
    reply.header("cache-control", "public, s-maxage=300");
    return {
      status: reading ? ("live" as const) : ("unavailable" as const),
      quotes: reading?.quotes ?? [],
      note: "Collected and published by Wise, which is itself a listed provider. Quotes are indicative, and each has its own collection time.",
    };
  });

  api.get("/v1/health", {
    schema: {
      tags: ["System"],
      summary: "Readiness and dependency health",
      response: { 200: healthResponseSchema, 503: healthResponseSchema },
    },
  }, async (_request, reply) => {
    const [database, redisStatus] = await Promise.all([
      probe(store.ping()),
      redis ? probe(redis.ping()) : Promise.resolve("not_configured" as const),
    ]);
    const health = await Promise.all(registry.providers().map((provider) => provider.getHealth().catch(() => ({ status: "unavailable" as const }))));
    const count = (status: string) => health.filter((entry) => entry.status === status).length;
    const healthy = count("healthy");

    const status = database !== "ok" || healthy + count("degraded") === 0 ? "unavailable" : redisStatus === "unavailable" || healthy < health.length ? "degraded" : "ok";
    return reply.status(status === "unavailable" ? 503 : 200).send({
      status,
      environment: env.STABLEFLOW_ENV,
      version: VERSION,
      dependencies: {
        database: { status: database, type: deps.storeType },
        redis: { status: redisStatus },
        providers: { total: health.length, healthy, degraded: count("degraded"), unavailable: count("unavailable") },
      },
    });
  });

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
  for (const url of ["/docs", "/docs/"]) {
    app.get(url, { schema: { hide: true } }, (_request, reply) => reply.type("text/html").send(DOCS_PAGE));
  }

  return app;
}
