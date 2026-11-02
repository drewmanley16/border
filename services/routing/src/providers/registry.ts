import type { NetworkConditionSource } from "./live/networkConditions.js";
import { createSimulatedProviders, type Clock } from "./simulated/adapter.js";
import { SCENARIOS, type Scenario } from "./simulated/scenarios.js";
import type { QuoteProvider } from "./types.js";

/** Builds each scenario's adapters once, so requests only pick a set. */
export class ProviderRegistry {
  private readonly sets = new Map<string, QuoteProvider[]>();

  constructor(
    readonly defaultScenario: string,
    private readonly clock: Clock,
    private readonly scenarios: Readonly<Record<string, Scenario>> = SCENARIOS,
    private readonly override?: QuoteProvider[],
    private readonly conditions?: NetworkConditionSource,
  ) {
    if (!scenarios[defaultScenario]) throw new Error(`Unknown simulation scenario: ${defaultScenario}`);
  }

  scenario(name: string = this.defaultScenario): Scenario | undefined {
    return this.scenarios[name];
  }

  scenarioNames(): string[] {
    return Object.keys(this.scenarios);
  }

  providers(name: string = this.defaultScenario): QuoteProvider[] {
    if (this.override) return this.override;
    let set = this.sets.get(name);
    if (!set) {
      // Only the default scenario takes observed conditions: the others
      // exist to stage specific failures, which real data would overwrite.
      set = createSimulatedProviders(this.scenarios[name]!, this.clock, name === "default" ? this.conditions : undefined);
      this.sets.set(name, set);
    }
    return set;
  }
}
