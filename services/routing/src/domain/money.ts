import { Decimal as BaseDecimal } from "decimal.js";
import { assetDecimals } from "./assets.js";
import { ApiError } from "./errors.js";

/**
 * All money runs through this isolated Decimal class, never through `number`.
 * Forty significant digits comfortably hold the largest transfer multiplied by
 * an 18-place rate. See docs in README, "Rounding".
 */
export const Decimal = BaseDecimal.clone({
  precision: 40,
  rounding: BaseDecimal.ROUND_HALF_EVEN,
  toExpNeg: -30,
  toExpPos: 30,
});
export type Decimal = BaseDecimal;
export type DecimalValue = BaseDecimal.Value;

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
const BPS = new Decimal(10_000);

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export function bps(value: DecimalValue): Decimal {
  return new Decimal(value).div(BPS);
}

export function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL_PATTERN.test(value);
}

/** Parses a client amount, rejecting anything the currency cannot represent. */
export function parseAmount(raw: string, currency: string): Decimal {
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new ApiError(400, "invalid_amount", "Amount must be a positive decimal string, such as \"1000.00\".");
  }
  const amount = new Decimal(raw);
  if (amount.lte(0)) {
    throw new ApiError(400, "invalid_amount", "Amount must be greater than zero.");
  }
  const decimals = assetDecimals(currency);
  if (amount.decimalPlaces() > decimals) {
    throw new ApiError(400, "invalid_amount_precision", `${currency} supports at most ${decimals} decimal places.`, {
      currency,
      decimals,
    });
  }
  return amount;
}

/** Rounds down: a recipient is never promised a fraction that doesn't exist. */
export function floorToAsset(value: Decimal, asset: string): Decimal {
  return value.toDecimalPlaces(assetDecimals(asset), Decimal.ROUND_FLOOR);
}

/** Rounds up: a fee is never understated. */
export function ceilToAsset(value: Decimal, asset: string): Decimal {
  return value.toDecimalPlaces(assetDecimals(asset), Decimal.ROUND_CEIL);
}

export function formatAsset(value: Decimal, asset: string): string {
  return value.toFixed(assetDecimals(asset));
}

/** USD for display. Banker's rounding, so totals don't drift upward. */
export function formatUSD(value: Decimal): string {
  return value.toFixed(2, Decimal.ROUND_HALF_EVEN);
}

/** USD with enough places for a breakdown to reconcile. */
export function formatUSDExact(value: Decimal): string {
  return value.toFixed(6, Decimal.ROUND_HALF_EVEN);
}
