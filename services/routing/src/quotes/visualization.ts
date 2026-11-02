import { Decimal } from "../domain/money.js";
import type { QuoteRecord } from "../store/types.js";
import type { RouteDto } from "./service.js";

/**
 * One fixed point per country, for drawing arcs. These say nothing about where a
 * sender or recipient is. A quote has no real location at all.
 */
const REPRESENTATIVE_LOCATIONS: Readonly<Record<string, { city: string; lat: number; lng: number }>> = {
  US: { city: "San Francisco", lat: 37.7749, lng: -122.4194 },
  DE: { city: "Berlin", lat: 52.52, lng: 13.405 },
  GB: { city: "London", lat: 51.5074, lng: -0.1278 },
  BR: { city: "São Paulo", lat: -23.5505, lng: -46.6333 },
  MX: { city: "Mexico City", lat: 19.4326, lng: -99.1332 },
  IN: { city: "Mumbai", lat: 19.076, lng: 72.8777 },
  PH: { city: "Manila", lat: 14.5995, lng: 120.9842 },
  NG: { city: "Lagos", lat: 6.5244, lng: 3.3792 },
  JP: { city: "Tokyo", lat: 35.6762, lng: 139.6503 },
  KW: { city: "Kuwait City", lat: 29.3759, lng: 47.9774 },
};

function location(country: string) {
  const place = REPRESENTATIVE_LOCATIONS[country];
  if (!place) throw new Error(`No representative location for ${country}`);
  return { country, ...place, locationType: "representative" as const };
}

export function buildVisualization(quote: QuoteRecord, route: RouteDto, now: Date) {
  const request = quote.requestPayload as { source: { country: string }; destination: { country: string } };
  const siblings = quote.routes.map((candidate) => candidate.details as unknown as RouteDto);

  const lowestCost = Decimal.min(...siblings.map((candidate) => candidate.totalCostUSD));
  const shortest = Math.min(...siblings.map((candidate) => candidate.estimatedDurationSeconds));
  const safest = Math.max(...siblings.map((candidate) => candidate.estimatedSuccessRate));
  const cost = new Decimal(route.totalCostUSD);

  return {
    routeId: route.id,
    quoteId: route.quoteId,
    kind: "hypothetical_route" as const,
    isRealPayment: false as const,
    coordinatesAreRepresentative: true as const,
    expired: new Date(route.expiresAt) <= now,
    disclaimer:
      "A hypothetical route from a nonbinding quote. No payment has occurred. Coordinates are representative visualization locations, not verified payment origins or destinations.",
    origin: location(request.source.country),
    destination: location(request.destination.country),
    routeType: route.routeType,
    network: route.network,
    networks: route.networks,
    stablecoin: route.stablecoin,
    segments: route.stages.map((stage) => ({
      kind: stage.kind,
      label: stage.label,
      network: stage.network ?? null,
      estimatedDurationSeconds: stage.estimatedDurationSeconds,
    })),
    estimates: {
      totalCostUSD: route.totalCostUSD,
      estimatedDurationSeconds: route.estimatedDurationSeconds,
      estimatedSuccessRate: route.estimatedSuccessRate,
      dataSource: route.dataProvenance.dataSource,
    },
    comparison: {
      routesCompared: siblings.length,
      rank: route.rank,
      isCheapest: cost.eq(lowestCost),
      isFastest: route.estimatedDurationSeconds === shortest,
      isMostReliable: route.estimatedSuccessRate === safest,
      relativeCost: lowestCost.isZero() ? "1.00" : cost.div(lowestCost).toFixed(2),
    },
    animation: {
      mode: "hypothetical" as const,
      label: "Simulated illustration of a quoted route",
      estimatedLatencySeconds: route.estimatedDurationSeconds,
    },
  };
}
