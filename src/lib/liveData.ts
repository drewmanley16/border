const API_URL = process.env.NEXT_PUBLIC_ROUTING_API_URL ?? "https://stableflow-api-one.vercel.app";

/** Matches the API's reuse window, so polling faster would only reread the same figures. */
export const POLL_MS = 5 * 60_000;

export type Coin = "USDC" | "USDT";
export type ActivityChain = "Ethereum" | "Base";

export interface NetworkConditionRow {
  network: "Ethereum" | "Base" | "Solana";
  status: "live" | "unavailable";
  feeUSD: string | null;
  estimatedDurationSeconds: number | null;
  observedAt: string | null;
}

export interface Transfer {
  coin: Coin;
  amount: string;
  from: string;
  to: string;
  txHash: string;
  blockNumber: number;
  timestamp: string | null;
}

export interface ChainActivity {
  chain: ActivityChain;
  status: "live" | "unavailable";
  fromBlock: number | null;
  toBlock: number | null;
  windowSeconds: number | null;
  transferCount: number | null;
  volumeByCoin: Partial<Record<Coin, string>>;
  countByCoin: Partial<Record<Coin, number>>;
  largest: Transfer[];
  observedAt: string | null;
}

export type ChainTransfer = Transfer & { chain: ActivityChain };

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { signal });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

export const fetchConditions = (signal: AbortSignal) =>
  getJson<{ networks: NetworkConditionRow[] }>("/v1/network-conditions", signal).then((body) => body.networks);

export interface FxRates {
  date: string;
  rates: Record<string, number>;
}

export const fetchFxRates = (signal: AbortSignal) =>
  getJson<{ status: string; date: string | null; rates: Record<string, number> }>("/v1/fx-rates", signal).then((body) =>
    body.status === "live" && body.date ? { date: body.date, rates: body.rates } : null,
  );

export interface ProviderQuote {
  name: string;
  type: "bank" | "provider";
  fee: number;
  rate: number;
  received: number;
  midMarket: boolean;
  collectedAt: string;
  deliveryHours: { min: number; max: number } | null;
}

export async function fetchProviderQuotes(
  request: { from: string; to: string; amount: number; fromCountry: string; toCountry: string },
  signal: AbortSignal,
): Promise<ProviderQuote[] | null> {
  const query = new URLSearchParams({ ...request, amount: String(request.amount) });
  const body = await getJson<{ status: string; quotes: ProviderQuote[] }>(`/v1/provider-quotes?${query}`, signal);
  return body.status === "live" ? body.quotes : null;
}

export interface RatePoint {
  date: string;
  rate: number;
}

export async function fetchFxHistory(from: string, to: string, signal: AbortSignal): Promise<RatePoint[] | null> {
  const body = await getJson<{ status: string; points: RatePoint[] }>(`/v1/fx-history?${new URLSearchParams({ from, to })}`, signal);
  return body.status === "live" ? body.points : null;
}

export function formatDelivery(hours: { min: number; max: number } | null): string | null {
  if (!hours) return null;
  const label = (value: number) => (value < 1 ? "Under 1h" : value < 24 ? `${Math.round(value)}h` : `${Math.round(value / 24)} days`);
  return hours.min === hours.max ? label(hours.max) : `Up to ${label(hours.max)}`;
}

/** The highest mid-market quote, since several providers can carry the flag, or null. */
export function midMarketRate(quotes: readonly ProviderQuote[]): number | null {
  const rates = quotes.filter((quote) => quote.midMarket).map((quote) => quote.rate);
  return rates.length > 0 ? Math.max(...rates) : null;
}

export const fetchActivity = (signal: AbortSignal) =>
  getJson<{ chains: ChainActivity[] }>("/v1/chain-activity", signal).then((body) => body.chains);

export function summarizeActivity(chains: readonly ChainActivity[]) {
  const live = chains.filter((chain) => chain.status === "live");
  const volumeByCoin: Record<Coin, number> = { USDC: 0, USDT: 0 };
  for (const chain of live) {
    for (const coin of ["USDC", "USDT"] as const) volumeByCoin[coin] += Number(chain.volumeByCoin[coin] ?? 0);
  }
  const transfers = live
    .flatMap((chain) => chain.largest.map((transfer): ChainTransfer => ({ ...transfer, chain: chain.chain })))
    .sort((a, b) => Number(b.amount) - Number(a.amount));
  return {
    isLive: live.length > 0,
    volume: volumeByCoin.USDC + volumeByCoin.USDT,
    volumeByCoin,
    count: live.reduce((sum, chain) => sum + (chain.transferCount ?? 0), 0),
    largest: transfers[0] ? Number(transfers[0].amount) : 0,
    seconds: live.reduce((sum, chain) => sum + (chain.windowSeconds ?? 0), 0),
    transfers,
  };
}

/** Sub-cent fees are the interesting ones here, so they keep two significant digits. */
export function formatNetworkFee(feeUSD: string): string {
  const fee = Number(feeUSD);
  return fee >= 0.01 ? `$${fee.toFixed(2)}` : `$${fee.toPrecision(2)}`;
}

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

const EXPLORERS: Record<ActivityChain, string> = { Ethereum: "https://etherscan.io", Base: "https://basescan.org" };
export const txUrl = (chain: ActivityChain, hash: string) => `${EXPLORERS[chain]}/tx/${hash}`;
export const addressUrl = (chain: ActivityChain, address: string) => `${EXPLORERS[chain]}/address/${address}`;
