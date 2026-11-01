import type { Chain, Stablecoin } from "@/types/transaction";

export const STABLECOINS: readonly Stablecoin[] = ["USDC", "USDT", "PYUSD", "DAI"];
export const CHAINS: readonly Chain[] = ["Solana", "Base", "Ethereum", "Tron"];

export const COIN_COLORS: Record<Stablecoin, string> = {
  USDC: "#3B82F6",
  USDT: "#10B981",
  PYUSD: "#A78BFA",
  DAI: "#FBBF24",
};

/**
 * Which stablecoins the simulation may send on which chain, with the relative
 * share of that coin's traffic on each. USDC left Tron in 2024, PYUSD issues on
 * Ethereum and Solana, USDT has no canonical Base deployment, and DAI lives on
 * EVM chains.
 */
export const COIN_CHAINS: Record<Stablecoin, Partial<Record<Chain, number>>> = {
  USDC: { Solana: 45, Base: 35, Ethereum: 20 },
  USDT: { Tron: 62, Ethereum: 26, Solana: 12 },
  PYUSD: { Solana: 55, Ethereum: 45 },
  DAI: { Ethereum: 70, Base: 30 },
};

/** Simulated settlement windows in milliseconds: [min, max]. */
export const CHAIN_SETTLEMENT_MS: Record<Chain, [number, number]> = {
  Solana: [420, 1400],
  Base: [1800, 3200],
  Tron: [3000, 6000],
  Ethereum: [6000, 9500],
};

export const WHALE_USD = 100_000;

/** Average simulated transactions per second at 1× speed. */
export const BASE_TX_PER_SECOND = 6;
export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** Routes animated at once. Whales may exceed this; everything else waits. */
export const MAX_ACTIVE_ROUTES = 110;
export const FEED_RETAINED = 240;
export const FEED_VISIBLE = 60;
export const DEFAULT_SEED = 20260;
