import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { matchesCorridor, type CorridorFilter, type MetricRecord, type QuoteRecord, type RouteRecord, type Store } from "./types.js";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

type RouteRow = Prisma.RouteGetPayload<object>;

const toRouteRecord = (row: RouteRow): RouteRecord => ({
  id: row.id,
  quoteId: row.quoteId,
  rank: row.rank,
  providerIds: row.providerIds,
  network: row.network,
  stablecoin: row.stablecoin,
  totalFees: row.totalFees.toString(),
  recipientAmount: row.recipientAmount.toString(),
  estimatedDuration: row.estimatedDuration,
  reliability: row.reliability.toString(),
  rankingScore: row.rankingScore.toString(),
  details: row.routeDetails as Record<string, unknown>,
});

export class PrismaStore implements Store {
  constructor(private readonly db: PrismaClient) {}

  async findActiveApiKey(keyHash: string) {
    const key = await this.db.apiKey.findFirst({ where: { keyHash, revokedAt: null } });
    return key ? { id: key.id, name: key.name, environment: key.environment } : null;
  }

  async saveQuote(quote: QuoteRecord) {
    await this.db.quote.create({
      data: {
        id: quote.id,
        apiKeyId: quote.apiKeyId,
        version: quote.version,
        requestPayload: quote.requestPayload as Prisma.InputJsonObject,
        scenario: quote.scenario,
        createdAt: quote.createdAt,
        expiresAt: quote.expiresAt,
        environment: quote.environment,
        routes: {
          create: quote.routes.map((route) => ({
            id: route.id,
            rank: route.rank,
            providerIds: route.providerIds,
            network: route.network,
            stablecoin: route.stablecoin,
            totalFees: route.totalFees,
            recipientAmount: route.recipientAmount,
            estimatedDuration: route.estimatedDuration,
            reliability: route.reliability,
            rankingScore: route.rankingScore,
            routeDetails: route.details as Prisma.InputJsonObject,
          })),
        },
      },
    });
  }

  async findQuoteByRoute(routeId: string, apiKeyId: string) {
    const quote = await this.db.quote.findFirst({
      where: { apiKeyId, routes: { some: { id: routeId } } },
      include: { routes: { orderBy: { rank: "asc" } } },
    });
    if (!quote) return null;
    return {
      id: quote.id,
      apiKeyId: quote.apiKeyId,
      version: quote.version,
      requestPayload: quote.requestPayload as Record<string, unknown>,
      scenario: quote.scenario,
      createdAt: quote.createdAt,
      expiresAt: quote.expiresAt,
      environment: quote.environment,
      routes: quote.routes.map(toRouteRecord),
    };
  }

  async listCorridors(filter?: CorridorFilter) {
    const rows = await this.db.corridor.findMany({
      where: { enabled: true },
      orderBy: [{ sourceCountry: "asc" }, { destinationCountry: "asc" }],
    });
    return rows.filter((row) => matchesCorridor(row, filter));
  }

  async disabledProviderIds() {
    const rows = await this.db.provider.findMany({ where: { enabled: false }, select: { id: true } });
    return new Set(rows.map((row) => row.id));
  }

  async recordMetrics(metrics: MetricRecord[]) {
    await this.db.providerMetric.createMany({ data: metrics });
  }

  async ping() {
    await this.db.$queryRaw`SELECT 1`;
  }

  async close() {
    await this.db.$disconnect();
  }
}
