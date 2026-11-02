import { Decimal } from "../domain/money.js";

/** Reference (mid-market) values, used to measure cost. Never a customer rate. */
export interface ReferenceRates {
  usdValue(asset: string): Decimal;
}

export function referenceRates(usdPerUnit: Readonly<Record<string, string>>): ReferenceRates {
  return {
    usdValue(asset) {
      const value = usdPerUnit[asset];
      if (value === undefined) throw new Error(`No reference rate for ${asset}`);
      return new Decimal(value);
    },
  };
}

