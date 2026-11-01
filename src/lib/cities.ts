import type { TransactionEndpoint } from "@/types/transaction";

export interface City extends TransactionEndpoint {
  id: string;
  /** Marker prominence, 1 (regional) to 3 (global hub). */
  tier: 1 | 2 | 3;
}

const c = (
  id: string,
  city: string,
  country: string,
  countryCode: string,
  lat: number,
  lng: number,
  tier: City["tier"],
): City => ({ id, city, country, countryCode, lat, lng, tier });

export const CITIES: readonly City[] = [
  c("sfo", "San Francisco", "United States", "US", 37.7749, -122.4194, 3),
  c("lax", "Los Angeles", "United States", "US", 34.0522, -118.2437, 2),
  c("nyc", "New York", "United States", "US", 40.7128, -74.006, 3),
  c("mia", "Miami", "United States", "US", 25.7617, -80.1918, 2),
  c("yyz", "Toronto", "Canada", "CA", 43.6532, -79.3832, 2),
  c("mex", "Mexico City", "Mexico", "MX", 19.4326, -99.1332, 2),
  c("bog", "Bogotá", "Colombia", "CO", 4.711, -74.0721, 1),
  c("gru", "São Paulo", "Brazil", "BR", -23.5505, -46.6333, 2),
  c("eze", "Buenos Aires", "Argentina", "AR", -34.6037, -58.3816, 2),
  c("lon", "London", "United Kingdom", "GB", 51.5074, -0.1278, 3),
  c("par", "Paris", "France", "FR", 48.8566, 2.3522, 2),
  c("ber", "Berlin", "Germany", "DE", 52.52, 13.405, 2),
  c("ist", "Istanbul", "Türkiye", "TR", 41.0082, 28.9784, 2),
  c("los", "Lagos", "Nigeria", "NG", 6.5244, 3.3792, 2),
  c("acc", "Accra", "Ghana", "GH", 5.6037, -0.187, 1),
  c("nbo", "Nairobi", "Kenya", "KE", -1.2921, 36.8219, 2),
  c("jnb", "Johannesburg", "South Africa", "ZA", -26.2041, 28.0473, 1),
  c("dxb", "Dubai", "United Arab Emirates", "AE", 25.2048, 55.2708, 3),
  c("bom", "Mumbai", "India", "IN", 19.076, 72.8777, 2),
  c("dac", "Dhaka", "Bangladesh", "BD", 23.8103, 90.4125, 1),
  c("sin", "Singapore", "Singapore", "SG", 1.3521, 103.8198, 3),
  c("jkt", "Jakarta", "Indonesia", "ID", -6.2088, 106.8456, 2),
  c("bkk", "Bangkok", "Thailand", "TH", 13.7563, 100.5018, 2),
  c("sgn", "Ho Chi Minh City", "Vietnam", "VN", 10.8231, 106.6297, 1),
  c("mnl", "Manila", "Philippines", "PH", 14.5995, 120.9842, 2),
  c("hkg", "Hong Kong", "Hong Kong", "HK", 22.3193, 114.1694, 3),
  c("sel", "Seoul", "South Korea", "KR", 37.5665, 126.978, 2),
  c("tyo", "Tokyo", "Japan", "JP", 35.6762, 139.6503, 3),
  c("syd", "Sydney", "Australia", "AU", -33.8688, 151.2093, 2),
];

export const CITY_BY_ID: ReadonlyMap<string, City> = new Map(CITIES.map((x) => [x.id, x]));
export const CITY_INDEX: ReadonlyMap<string, number> = new Map(CITIES.map((x, i) => [x.city, i]));

export interface Corridor {
  from: string;
  to: string;
  /** Relative traffic. Reflects remittance-style flows, not measured volume. */
  weight: number;
  /** Regions that lean on dollar stablecoins as savings favour USDT. */
  usdtBias?: number;
}

export const CORRIDORS: readonly Corridor[] = [
  // Remittance and payout flows
  { from: "sfo", to: "mex", weight: 12 },
  { from: "lax", to: "mnl", weight: 11, usdtBias: 1.2 },
  { from: "lon", to: "los", weight: 11, usdtBias: 1.8 },
  { from: "dxb", to: "bom", weight: 13, usdtBias: 1.4 },
  { from: "dxb", to: "dac", weight: 6, usdtBias: 1.6 },
  { from: "mia", to: "eze", weight: 9, usdtBias: 2 },
  { from: "mia", to: "bog", weight: 7, usdtBias: 1.5 },
  { from: "par", to: "nbo", weight: 6, usdtBias: 1.4 },
  { from: "lon", to: "acc", weight: 5, usdtBias: 1.6 },
  { from: "yyz", to: "gru", weight: 6 },
  { from: "ber", to: "ist", weight: 8, usdtBias: 2 },
  { from: "sin", to: "jkt", weight: 9, usdtBias: 1.2 },
  { from: "sin", to: "sgn", weight: 5, usdtBias: 1.4 },
  { from: "hkg", to: "bkk", weight: 7, usdtBias: 1.3 },
  { from: "syd", to: "mnl", weight: 3 },
  { from: "jnb", to: "lon", weight: 3 },
  { from: "dxb", to: "nbo", weight: 3, usdtBias: 1.5 },
  // Treasury and settlement between financial hubs
  { from: "nyc", to: "lon", weight: 14 },
  { from: "tyo", to: "sel", weight: 7 },
  { from: "nyc", to: "sin", weight: 6 },
  { from: "lon", to: "dxb", weight: 7 },
  { from: "hkg", to: "sin", weight: 8 },
  { from: "sfo", to: "tyo", weight: 5 },
  { from: "nyc", to: "gru", weight: 5 },
  { from: "lon", to: "hkg", weight: 6 },
  { from: "par", to: "dxb", weight: 3 },
  { from: "sfo", to: "lon", weight: 5 },
  { from: "nyc", to: "mex", weight: 4 },
  { from: "syd", to: "sin", weight: 4 },
  { from: "yyz", to: "lon", weight: 4 },
  { from: "ber", to: "nyc", weight: 3 },
  { from: "gru", to: "eze", weight: 4, usdtBias: 1.6 },
];
