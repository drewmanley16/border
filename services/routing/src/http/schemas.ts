import { z } from "zod";

const countryCode = z.string().regex(/^[A-Z]{2}$/, "Use an ISO 3166-1 alpha-2 code, such as US.");
const currencyCode = z.string().regex(/^[A-Z]{3,5}$/, "Use an uppercase currency code, such as USD.");

const balancedWeights = z
  .object({ cost: z.number().min(0), duration: z.number().min(0), reliability: z.number().min(0) })
  .refine(({ cost, duration, reliability }) => cost + duration + reliability > 0, "At least one weight must be above zero.");

export const compareRequestSchema = z
  .object({
    source: z.object({
      country: countryCode,
      currency: currencyCode,
      amount: z.string().min(1).meta({ description: "Decimal string. Numbers are rejected to prevent precision loss.", example: "1000.00" }),
      fundingMethod: z.string().min(1).meta({ example: "bank_transfer" }),
    }),
    destination: z.object({
      country: countryCode,
      currency: currencyCode,
      payoutMethod: z.string().min(1).meta({ example: "pix" }),
    }),
    optimizeFor: z.enum(["lowest_cost", "fastest", "most_reliable", "balanced"]),
    preferences: z
      .object({
        preferredStablecoins: z.array(z.string()).optional().meta({
          description: "Stablecoin routes must use one of these. Routes with no stablecoin stay eligible.",
        }),
        excludedNetworks: z.array(z.string()).optional(),
        excludedProviders: z.array(z.string()).optional(),
        maxFeeUSD: z.string().optional().meta({ description: "Limit on total estimated cost, including FX spread." }),
        maxDurationSeconds: z.number().int().positive().optional(),
        minSuccessRate: z.number().min(0).max(1).optional(),
        balancedWeights: balancedWeights.optional().meta({ description: "Overrides the default weights for this request." }),
      })
      .optional(),
  })
  .meta({ id: "CompareRoutesRequest" });

const provenance = z.object({ dataSource: z.enum(["simulated", "live"]), scenario: z.string().nullable(), note: z.string() });

const stage = z.object({
  edgeId: z.string(),
  kind: z.enum(["funding", "fx", "onramp", "bridge", "transfer", "offramp", "payout"]),
  providerId: z.string(),
  label: z.string(),
  inputAsset: z.string(),
  inputAmount: z.string(),
  feeAmount: z.string(),
  feeUSD: z.string(),
  outputAsset: z.string(),
  outputAmount: z.string(),
  exchangeRate: z.string(),
  referenceRate: z.string(),
  spreadUSD: z.string(),
  estimatedDurationSeconds: z.number(),
  estimatedSuccessRate: z.number(),
  network: z.string().optional(),
  dataSource: z.enum(["simulated", "live"]),
});

export const routeSchema = z
  .object({
    id: z.string(),
    quoteId: z.string(),
    rank: z.number(),
    recommended: z.boolean(),
    routeType: z.enum(["stablecoin", "traditional"]),
    provider: z.string(),
    providers: z.array(z.string()),
    stablecoin: z.string().nullable(),
    network: z.string().nullable(),
    networks: z.array(z.string()),
    fundingRail: z.string(),
    payoutRail: z.string(),
    exchangeRate: z.object({ effective: z.string(), reference: z.string(), fxSpreadBps: z.string() }),
    totalFeeUSD: z.string().meta({ description: "Explicit fees only, excluding FX spread." }),
    fxSpreadUSD: z.string(),
    totalCostUSD: z.string().meta({ description: "Everything the sender loses against the reference rate." }),
    estimatedDestinationAmount: z.string(),
    destinationCurrency: z.string(),
    estimatedDurationSeconds: z.number(),
    estimatedSuccessRate: z.number(),
    feeBreakdown: z.object({
      funding: z.string(),
      onramp: z.string(),
      network: z.string(),
      bridge: z.string(),
      fx: z.string(),
      offramp: z.string(),
      payout: z.string(),
      totalExplicitFees: z.string(),
      fxSpread: z.string(),
      rounding: z.string(),
      totalCost: z.string(),
    }),
    steps: z.array(z.string()),
    stages: z.array(stage),
    quotedAt: z.string(),
    expiresAt: z.string(),
    liquidityKnown: z.boolean(),
    rankingScore: z.number(),
    scoreBreakdown: z.object({
      cost: z.number(),
      duration: z.number(),
      reliability: z.number(),
      total: z.number(),
      weights: z.object({ cost: z.number(), duration: z.number(), reliability: z.number() }),
    }),
    rankingExplanation: z.string(),
    dataProvenance: provenance,
  })
  .meta({ id: "Route" });

export const compareResponseSchema = z
  .object({
    quoteId: z.string(),
    quoteVersion: z.number(),
    environment: z.enum(["sandbox", "production"]),
    createdAt: z.string(),
    expiresAt: z.string(),
    binding: z.literal(false),
    disclaimer: z.string(),
    sourceAmount: z.string(),
    sourceCurrency: z.string(),
    destinationCurrency: z.string(),
    optimizeFor: z.enum(["lowest_cost", "fastest", "most_reliable", "balanced"]),
    recommendedRouteId: z.string().nullable(),
    recommendation: z.string(),
    routes: z.array(routeSchema),
    excludedRoutes: z.array(z.object({ steps: z.array(z.string()), reason: z.string(), detail: z.string().optional() })),
    providers: z.array(
      z.object({
        providerId: z.string(),
        status: z.string(),
        quotes: z.number(),
        latencyMs: z.number(),
        attempts: z.number(),
        detail: z.string().optional(),
      }),
    ),
    dataProvenance: provenance,
  })
  .meta({ id: "CompareRoutesResponse" });

export const routeDetailSchema = routeSchema
  .extend({
    quoteVersion: z.number(),
    quoteStatus: z.enum(["active", "expired"]),
    quoteCreatedAt: z.string(),
    binding: z.literal(false),
    disclaimer: z.string(),
    assumptions: z.array(z.string()),
  })
  .meta({ id: "RouteDetail" });

const place = z.object({
  country: z.string(),
  city: z.string(),
  lat: z.number(),
  lng: z.number(),
  locationType: z.literal("representative"),
});

export const visualizationSchema = z
  .object({
    routeId: z.string(),
    quoteId: z.string(),
    kind: z.literal("hypothetical_route"),
    isRealPayment: z.literal(false),
    coordinatesAreRepresentative: z.literal(true),
    expired: z.boolean(),
    disclaimer: z.string(),
    origin: place,
    destination: place,
    routeType: z.enum(["stablecoin", "traditional"]),
    network: z.string().nullable(),
    networks: z.array(z.string()),
    stablecoin: z.string().nullable(),
    segments: z.array(z.object({ kind: z.string(), label: z.string(), network: z.string().nullable(), estimatedDurationSeconds: z.number() })),
    estimates: z.object({
      totalCostUSD: z.string(),
      estimatedDurationSeconds: z.number(),
      estimatedSuccessRate: z.number(),
      dataSource: z.enum(["simulated", "live"]),
    }),
    comparison: z.object({
      routesCompared: z.number(),
      rank: z.number(),
      isCheapest: z.boolean(),
      isFastest: z.boolean(),
      isMostReliable: z.boolean(),
      relativeCost: z.string().meta({ description: "This route's cost divided by the cheapest route's." }),
    }),
    animation: z.object({ mode: z.literal("hypothetical"), label: z.string(), estimatedLatencySeconds: z.number() }),
  })
  .meta({ id: "RouteVisualization" });

export const corridorQuerySchema = z.object({
  country: countryCode.optional(),
  currency: currencyCode.optional(),
  payoutMethod: z.string().optional(),
});

export const corridorsResponseSchema = z.object({
  corridors: z.array(
    z.object({
      sourceCountry: z.string(),
      destinationCountry: z.string(),
      sourceCurrency: z.string(),
      destinationCurrency: z.string(),
      supportedFundingMethods: z.array(z.string()),
      supportedPayoutMethods: z.array(z.string()),
    }),
  ),
});

export const providersResponseSchema = z.object({
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      mode: z.enum(["simulated", "live"]),
      enabled: z.boolean(),
      supportedCountries: z.array(z.string()),
      supportedCurrencies: z.array(z.string()),
      fundingMethods: z.array(z.string()),
      payoutMethods: z.array(z.string()),
      stablecoins: z.array(z.string()),
      blockchains: z.array(z.string()),
      health: z.object({ status: z.string(), checkedAt: z.string(), detail: z.string().optional() }),
    }),
  ),
  note: z.string(),
});

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "unavailable"]),
  environment: z.enum(["sandbox", "production"]),
  version: z.string(),
  dependencies: z.object({
    database: z.object({ status: z.enum(["ok", "unavailable", "not_configured"]), type: z.string() }),
    redis: z.object({ status: z.enum(["ok", "unavailable", "not_configured"]) }),
    providers: z.object({ total: z.number(), healthy: z.number(), degraded: z.number(), unavailable: z.number() }),
  }),
});

export const errorSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string(), requestId: z.string(), details: z.unknown().optional() }),
  })
  .meta({ id: "Error" });
