export type RailSpeed = "Instant" | "Same day" | "1 to 2 days";

export interface Rail {
  name: string;
  speed: RailSpeed;
}

export interface Country {
  code: string;
  name: string;
  currency: string;
  /** The capital, used only to place a pin. */
  lat: number;
  lng: number;
  rails: Rail[];
}

const SEPA: Rail[] = [
  { name: "SEPA Instant", speed: "Instant" },
  { name: "SEPA Credit Transfer", speed: "1 to 2 days" },
  { name: "T2", speed: "Same day" },
];
const euro = (code: string, name: string, lat: number, lng: number): Country => ({ code, name, currency: "EUR", lat, lng, rails: SEPA });

/**
 * Public payment systems by country, limited to currencies with an ECB rate.
 * There are deliberately no fees here: banks and providers set those.
 */
export const COUNTRIES: readonly Country[] = [
  { code: "AU", name: "Australia", currency: "AUD", lat: -35.28, lng: 149.13, rails: [{ name: "NPP (PayID, Osko)", speed: "Instant" }, { name: "RITS", speed: "Same day" }, { name: "BECS Direct Entry", speed: "1 to 2 days" }] },
  euro("AT", "Austria", 48.21, 16.37),
  euro("BE", "Belgium", 50.85, 4.35),
  { code: "BR", name: "Brazil", currency: "BRL", lat: -15.79, lng: -47.88, rails: [{ name: "Pix", speed: "Instant" }, { name: "TED", speed: "Same day" }] },
  { code: "CA", name: "Canada", currency: "CAD", lat: 45.42, lng: -75.7, rails: [{ name: "Interac e-Transfer", speed: "Instant" }, { name: "Lynx", speed: "Same day" }, { name: "EFT", speed: "1 to 2 days" }] },
  { code: "CN", name: "China", currency: "CNY", lat: 39.9, lng: 116.41, rails: [{ name: "IBPS", speed: "Instant" }, { name: "CNAPS HVPS", speed: "Same day" }] },
  euro("FI", "Finland", 60.17, 24.94),
  euro("FR", "France", 48.86, 2.35),
  euro("DE", "Germany", 52.52, 13.41),
  euro("GR", "Greece", 37.98, 23.73),
  { code: "HK", name: "Hong Kong", currency: "HKD", lat: 22.32, lng: 114.17, rails: [{ name: "FPS", speed: "Instant" }, { name: "CHATS", speed: "Same day" }] },
  { code: "IN", name: "India", currency: "INR", lat: 28.61, lng: 77.21, rails: [{ name: "UPI", speed: "Instant" }, { name: "IMPS", speed: "Instant" }, { name: "RTGS", speed: "Same day" }, { name: "NEFT", speed: "Same day" }] },
  { code: "ID", name: "Indonesia", currency: "IDR", lat: -6.21, lng: 106.85, rails: [{ name: "BI-FAST", speed: "Instant" }, { name: "BI-RTGS", speed: "Same day" }, { name: "SKNBI", speed: "Same day" }] },
  euro("IE", "Ireland", 53.35, -6.26),
  { code: "IL", name: "Israel", currency: "ILS", lat: 31.77, lng: 35.21, rails: [{ name: "ZAHAV", speed: "Same day" }, { name: "Masav", speed: "1 to 2 days" }] },
  euro("IT", "Italy", 41.9, 12.5),
  { code: "JP", name: "Japan", currency: "JPY", lat: 35.68, lng: 139.69, rails: [{ name: "Zengin System", speed: "Same day" }, { name: "BOJ-NET", speed: "Same day" }] },
  { code: "MY", name: "Malaysia", currency: "MYR", lat: 3.14, lng: 101.69, rails: [{ name: "DuitNow", speed: "Instant" }, { name: "RENTAS", speed: "Same day" }] },
  { code: "MX", name: "Mexico", currency: "MXN", lat: 19.43, lng: -99.13, rails: [{ name: "SPEI", speed: "Instant" }] },
  euro("NL", "Netherlands", 52.37, 4.9),
  { code: "PH", name: "Philippines", currency: "PHP", lat: 14.6, lng: 120.98, rails: [{ name: "InstaPay", speed: "Instant" }, { name: "PESONet", speed: "Same day" }] },
  { code: "PL", name: "Poland", currency: "PLN", lat: 52.23, lng: 21.01, rails: [{ name: "Express Elixir", speed: "Instant" }, { name: "SORBNET3", speed: "Same day" }, { name: "Elixir", speed: "Same day" }] },
  euro("PT", "Portugal", 38.72, -9.14),
  { code: "SG", name: "Singapore", currency: "SGD", lat: 1.35, lng: 103.82, rails: [{ name: "FAST (PayNow)", speed: "Instant" }, { name: "MEPS+", speed: "Same day" }, { name: "GIRO", speed: "1 to 2 days" }] },
  { code: "ZA", name: "South Africa", currency: "ZAR", lat: -25.75, lng: 28.19, rails: [{ name: "PayShap", speed: "Instant" }, { name: "SAMOS", speed: "Same day" }, { name: "EFT", speed: "1 to 2 days" }] },
  { code: "KR", name: "South Korea", currency: "KRW", lat: 37.57, lng: 126.98, rails: [{ name: "BOK-Wire+", speed: "Same day" }] },
  euro("ES", "Spain", 40.42, -3.7),
  { code: "SE", name: "Sweden", currency: "SEK", lat: 59.33, lng: 18.07, rails: [{ name: "Swish", speed: "Instant" }, { name: "RIX", speed: "Same day" }, { name: "Bankgirot", speed: "1 to 2 days" }] },
  { code: "CH", name: "Switzerland", currency: "CHF", lat: 46.95, lng: 7.45, rails: [{ name: "SIC", speed: "Same day" }] },
  { code: "TH", name: "Thailand", currency: "THB", lat: 13.76, lng: 100.5, rails: [{ name: "PromptPay", speed: "Instant" }, { name: "BAHTNET", speed: "Same day" }] },
  { code: "TR", name: "Turkey", currency: "TRY", lat: 39.93, lng: 32.86, rails: [{ name: "FAST", speed: "Instant" }, { name: "EFT", speed: "Same day" }] },
  { code: "GB", name: "United Kingdom", currency: "GBP", lat: 51.51, lng: -0.13, rails: [{ name: "Faster Payments", speed: "Instant" }, { name: "CHAPS", speed: "Same day" }, { name: "Bacs", speed: "1 to 2 days" }] },
  { code: "US", name: "United States", currency: "USD", lat: 38.91, lng: -77.04, rails: [{ name: "RTP", speed: "Instant" }, { name: "FedNow", speed: "Instant" }, { name: "Fedwire", speed: "Same day" }, { name: "ACH", speed: "1 to 2 days" }] },
];

export function findCountry(query: string): Country | undefined {
  const text = query.trim().toLowerCase();
  if (!text) return undefined;
  return COUNTRIES.find((country) => country.name.toLowerCase() === text || country.code.toLowerCase() === text);
}

/** The viewer's likely country, from their own browser language. Nothing leaves the device. */
export function countryFromLocale(language: string): Country | undefined {
  const region = language.split("-").at(-1);
  return region && region.length === 2 ? findCountry(region) : undefined;
}

/** Converts through USD, or returns null when a rate is missing rather than guessing. */
export function convert(amount: number, from: string, to: string, rates: Record<string, number>): number | null {
  const fromRate = rates[from];
  const toRate = rates[to];
  return fromRate && toRate ? (amount / fromRate) * toRate : null;
}

export function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

/** Small fees keep two significant digits, so they don't round to nothing. */
export function formatSmallMoney(value: number, currency: string): string {
  const whole = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  const rounded = Number(whole.replace(/[^0-9.]/g, ""));
  if (rounded >= value * 0.9 && rounded > 0) return whole;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumSignificantDigits: 2 }).format(value);
}
