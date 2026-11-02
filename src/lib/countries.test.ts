import { describe, expect, it } from "vitest";
import { convert, COUNTRIES, countryFromLocale, findCountry, formatMoney, formatSmallMoney } from "./countries";

const rates = { USD: 1, JPY: 157.9, EUR: 0.9 };

describe("convert", () => {
  it("converts through USD", () => {
    expect(convert(1000, "USD", "JPY", rates)).toBeCloseTo(157_900);
    expect(convert(90, "EUR", "JPY", rates)).toBeCloseTo(15_790);
  });

  it("refuses to guess a missing rate", () => {
    expect(convert(1000, "USD", "XXX", rates)).toBeNull();
  });
});

describe("countries", () => {
  it("finds by name or code, and ignores anything else", () => {
    expect(findCountry(" japan ")?.currency).toBe("JPY");
    expect(findCountry("jp")?.name).toBe("Japan");
    expect(findCountry("Atlantis")).toBeUndefined();
  });

  it("reads the region from a browser language", () => {
    expect(countryFromLocale("en-US")?.code).toBe("US");
    expect(countryFromLocale("ja")).toBeUndefined();
  });

  it("has rails for every country", () => {
    expect(COUNTRIES.every((country) => country.rails.length > 0)).toBe(true);
    expect(new Set(COUNTRIES.map((country) => country.code)).size).toBe(COUNTRIES.length);
  });
});

describe("money formatting", () => {
  it("uses each currency's own format", () => {
    expect(formatMoney(157900, "JPY")).toBe("¥157,900");
    expect(formatMoney(1000, "USD")).toBe("$1,000.00");
  });

  it("doesn't round a small fee away", () => {
    expect(formatSmallMoney(0.14, "JPY")).toBe("¥0.14");
    expect(formatSmallMoney(0.00046, "USD")).toBe("$0.00046");
    expect(formatSmallMoney(6.3, "JPY")).toBe("¥6");
  });
});
