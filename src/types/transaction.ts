export type Stablecoin = "USDC" | "USDT" | "PYUSD" | "DAI";
export type Chain = "Solana" | "Base" | "Ethereum" | "Tron";
export type TransactionStatus = "pending" | "settled" | "failed";

export interface TransactionEndpoint {
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
}

export interface StablecoinTransaction {
  id: string;
  timestamp: number;
  origin: TransactionEndpoint;
  destination: TransactionEndpoint;
  amountUSD: number;
  stablecoin: Stablecoin;
  chain: Chain;
  status: TransactionStatus;
  /** Known once the transaction has reached `settled`. */
  settlementTimeMs?: number;
  /**
   * Optional hint for how long settlement is likely to take. The globe uses it
   * to pace the flight of a pending transaction; without it a default is used.
   */
  expectedSettlementMs?: number;
}
