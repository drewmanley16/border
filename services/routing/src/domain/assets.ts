/** ISO 4217 minor units for supported fiat currencies. */
export const FIAT_DECIMALS: Readonly<Record<string, number>> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  BRL: 2,
  MXN: 2,
  INR: 2,
  PHP: 2,
  NGN: 2,
  JPY: 0,
  KWD: 3,
};

export const STABLECOIN_DECIMALS: Readonly<Record<string, number>> = {
  USDC: 6,
  USDT: 6,
  PYUSD: 6,
};

export const NETWORKS = ["Solana", "Base", "Ethereum"] as const;
export type Network = (typeof NETWORKS)[number];

/** Networks each stablecoin may be routed over. Anything else is rejected. */
export const STABLECOIN_NETWORKS: Readonly<Record<string, readonly Network[]>> = {
  USDC: ["Solana", "Base", "Ethereum"],
  USDT: ["Solana", "Ethereum"],
  PYUSD: ["Solana", "Ethereum"],
};

export function isFiat(code: string): boolean {
  return Object.hasOwn(FIAT_DECIMALS, code);
}

export function isStablecoin(code: string): boolean {
  return Object.hasOwn(STABLECOIN_DECIMALS, code);
}

export function assetDecimals(asset: string): number {
  const decimals = FIAT_DECIMALS[asset] ?? STABLECOIN_DECIMALS[asset];
  if (decimals === undefined) throw new Error(`Unknown asset: ${asset}`);
  return decimals;
}

export function isSupportedPair(stablecoin: string, network: string): boolean {
  return (STABLECOIN_NETWORKS[stablecoin] as readonly string[] | undefined)?.includes(network) ?? false;
}
