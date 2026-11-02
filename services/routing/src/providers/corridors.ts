import type { Scenario } from "./simulated/scenarios.js";

export interface CorridorRecord {
  sourceCountry: string;
  destinationCountry: string;
  sourceCurrency: string;
  destinationCurrency: string;
  supportedFundingMethods: string[];
  supportedPayoutMethods: string[];
  enabled: boolean;
}

export function corridorsFromScenario(scenario: Scenario): CorridorRecord[] {
  const corridors = new Map<string, CorridorRecord>();
  for (const funding of scenario.funding) {
    for (const rail of scenario.destinations) {
      if (funding.country === rail.country) continue;
      const key = [funding.country, rail.country, funding.currency, rail.currency].join(":");
      const corridor = corridors.get(key) ?? {
        sourceCountry: funding.country,
        destinationCountry: rail.country,
        sourceCurrency: funding.currency,
        destinationCurrency: rail.currency,
        supportedFundingMethods: [],
        supportedPayoutMethods: [],
        enabled: true,
      };
      if (!corridor.supportedFundingMethods.includes(funding.method)) corridor.supportedFundingMethods.push(funding.method);
      if (!corridor.supportedPayoutMethods.includes(rail.method)) corridor.supportedPayoutMethods.push(rail.method);
      corridors.set(key, corridor);
    }
  }
  return [...corridors.values()];
}
