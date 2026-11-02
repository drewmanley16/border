/**
 * SIMULATED, ILLUSTRATIVE FIGURES.
 *
 * Every number in this file was invented to exercise the routing engine. None of
 * them is a measurement of a market or the pricing, speed or reliability of any
 * real company. Nothing here is a claim about Bridge, Circle, Stripe, Wise or
 * anyone else.
 */

export interface RailParams {
  percentBps: string;
  fixedUSD: string;
  seconds: number;
  success: number;
}

export interface DestinationRail extends RailParams {
  country: string;
  currency: string;
  method: string;
  label: string;
}

export interface FundingRail extends RailParams {
  country: string;
  currency: string;
  method: string;
  label: string;
}

export interface OnchainProviderParams {
  kind: "onchain";
  id: string;
  name: string;
  network: "Solana" | "Base" | "Ethereum";
  stablecoin: string;
  /** Fiat this venue converts to stablecoin directly. Others go through FX first. */
  onrampCurrencies: string[];
  offrampCurrencies: string[];
  fundingMultiplier: string;
  rampBps: string;
  rampSpreadBps: string;
  rampSeconds: number;
  rampSuccess: number;
  fxSpreadBps: string;
  networkFeeUSD: string;
  transferSeconds: number;
  transferSuccess: number;
  payoutMultiplier: string;
  minUSD: string;
  maxUSD: string;
  liquidityUSD?: string;
}

export interface BankProviderParams {
  kind: "bank_fx";
  id: string;
  name: string;
  fxFeeBps: string;
  wireFeeUSD: string;
  fxSpreadBps: string;
  extraSeconds: number;
  success: number;
  minUSD: string;
  maxUSD: string;
}

export interface BridgeProviderParams {
  kind: "bridge";
  id: string;
  name: string;
  stablecoin: string;
  networks: ("Solana" | "Base" | "Ethereum")[];
  percentBps: string;
  fixedUSD: string;
  seconds: number;
  success: number;
}

export type ProviderParams = OnchainProviderParams | BankProviderParams | BridgeProviderParams;

export interface Behavior {
  availability: "up" | "degraded" | "down";
  /** Artificial response delay. */
  latencyMs: number;
}

export interface Scenario {
  name: string;
  description: string;
  quoteTtlSeconds: number;
  usdPerUnit: Record<string, string>;
  funding: FundingRail[];
  destinations: DestinationRail[];
  providers: ProviderParams[];
  behavior: Record<string, Behavior>;
}

const UP: Behavior = { availability: "up", latencyMs: 0 };

const SOLANA: OnchainProviderParams = {
  kind: "onchain",
  id: "sim_solana_usdc",
  name: "Simulated Solana USDC Provider",
  network: "Solana",
  stablecoin: "USDC",
  onrampCurrencies: ["USD", "EUR"],
  offrampCurrencies: ["BRL", "MXN", "EUR", "GBP", "PHP", "NGN"],
  fundingMultiplier: "1",
  rampBps: "15",
  rampSpreadBps: "4",
  rampSeconds: 20,
  rampSuccess: 0.9985,
  fxSpreadBps: "22",
  networkFeeUSD: "0.01",
  transferSeconds: 8,
  transferSuccess: 0.9975,
  payoutMultiplier: "1",
  minUSD: "1",
  maxUSD: "250000",
  liquidityUSD: "500000",
};

const BASE: OnchainProviderParams = {
  kind: "onchain",
  id: "sim_base_usdc",
  name: "Simulated Base USDC Provider",
  network: "Base",
  stablecoin: "USDC",
  onrampCurrencies: ["USD"],
  offrampCurrencies: ["BRL", "MXN", "EUR", "GBP", "INR"],
  fundingMultiplier: "0.9",
  rampBps: "12",
  rampSpreadBps: "3",
  rampSeconds: 30,
  rampSuccess: 0.9988,
  fxSpreadBps: "20",
  networkFeeUSD: "0.03",
  transferSeconds: 15,
  transferSuccess: 0.9985,
  payoutMultiplier: "1.05",
  minUSD: "5",
  maxUSD: "500000",
};

const ETHEREUM: OnchainProviderParams = {
  kind: "onchain",
  id: "sim_ethereum_usdc",
  name: "Simulated Ethereum USDC Provider",
  network: "Ethereum",
  stablecoin: "USDC",
  onrampCurrencies: ["USD", "EUR", "GBP"],
  offrampCurrencies: ["BRL", "MXN", "EUR", "GBP", "INR", "PHP", "NGN"],
  fundingMultiplier: "1.1",
  rampBps: "10",
  rampSpreadBps: "2",
  rampSeconds: 40,
  rampSuccess: 0.9992,
  fxSpreadBps: "16",
  networkFeeUSD: "1.80",
  transferSeconds: 180,
  transferSuccess: 0.9994,
  payoutMultiplier: "1",
  minUSD: "50",
  maxUSD: "5000000",
  liquidityUSD: "20000000",
};

const BANK: BankProviderParams = {
  kind: "bank_fx",
  id: "sim_bank_fx",
  name: "Simulated Bank and FX Provider",
  fxFeeBps: "3",
  wireFeeUSD: "25",
  fxSpreadBps: "30",
  extraSeconds: 86_400,
  success: 0.9996,
  minUSD: "100",
  maxUSD: "50000000",
};

const BRIDGE: BridgeProviderParams = {
  kind: "bridge",
  id: "sim_bridge",
  name: "Simulated Cross-Chain Bridge",
  stablecoin: "USDC",
  networks: ["Solana", "Base", "Ethereum"],
  percentBps: "3",
  fixedUSD: "0.10",
  seconds: 90,
  success: 0.998,
};

export const DEFAULT_SCENARIO: Scenario = {
  name: "default",
  description: "All simulated providers available, with baseline illustrative figures.",
  quoteTtlSeconds: 60,
  usdPerUnit: {
    USD: "1",
    USDC: "1",
    EUR: "1.08",
    GBP: "1.27",
    BRL: "0.19",
    MXN: "0.055",
    INR: "0.012",
    PHP: "0.0175",
    NGN: "0.00065",
    JPY: "0.0067",
    KWD: "3.25",
  },
  funding: [
    { country: "US", currency: "USD", method: "bank_transfer", label: "USD bank funding", percentBps: "0", fixedUSD: "0.40", seconds: 60, success: 0.9995 },
    { country: "DE", currency: "EUR", method: "sepa_transfer", label: "EUR SEPA funding", percentBps: "0", fixedUSD: "0.25", seconds: 30, success: 0.9995 },
    { country: "GB", currency: "GBP", method: "faster_payments", label: "GBP Faster Payments funding", percentBps: "0", fixedUSD: "0.20", seconds: 30, success: 0.9995 },
  ],
  destinations: [
    { country: "BR", currency: "BRL", method: "pix", label: "PIX payout", percentBps: "0", fixedUSD: "0.30", seconds: 15, success: 0.9985 },
    { country: "MX", currency: "MXN", method: "spei", label: "SPEI payout", percentBps: "0", fixedUSD: "0.45", seconds: 40, success: 0.998 },
    { country: "IN", currency: "INR", method: "upi", label: "UPI payout", percentBps: "0", fixedUSD: "0.20", seconds: 30, success: 0.9975 },
    { country: "PH", currency: "PHP", method: "instapay", label: "InstaPay payout", percentBps: "0", fixedUSD: "0.35", seconds: 60, success: 0.997 },
    { country: "NG", currency: "NGN", method: "bank_transfer", label: "NGN bank payout", percentBps: "20", fixedUSD: "0.50", seconds: 300, success: 0.993 },
    { country: "DE", currency: "EUR", method: "sepa_transfer", label: "SEPA payout", percentBps: "0", fixedUSD: "0.30", seconds: 60, success: 0.9985 },
    { country: "GB", currency: "GBP", method: "faster_payments", label: "Faster Payments payout", percentBps: "0", fixedUSD: "0.30", seconds: 60, success: 0.9985 },
    { country: "JP", currency: "JPY", method: "bank_transfer", label: "JPY bank payout", percentBps: "0", fixedUSD: "2.50", seconds: 7_200, success: 0.998 },
    { country: "KW", currency: "KWD", method: "bank_transfer", label: "KWD bank payout", percentBps: "0", fixedUSD: "3.00", seconds: 14_400, success: 0.997 },
  ],
  providers: [SOLANA, BASE, ETHEREUM, BANK, BRIDGE],
  behavior: {
    sim_solana_usdc: UP,
    sim_base_usdc: UP,
    sim_ethereum_usdc: UP,
    sim_bank_fx: UP,
    sim_bridge: UP,
  },
};

function variant(name: string, description: string, change: (scenario: Scenario) => void): Scenario {
  const scenario = structuredClone(DEFAULT_SCENARIO);
  scenario.name = name;
  scenario.description = description;
  change(scenario);
  return scenario;
}

function onchain(scenario: Scenario, id: string): OnchainProviderParams {
  const provider = scenario.providers.find((candidate) => candidate.id === id);
  if (provider?.kind !== "onchain") throw new Error(`No onchain provider ${id}`);
  return provider;
}

export const SCENARIOS: Readonly<Record<string, Scenario>> = {
  default: DEFAULT_SCENARIO,
  solana_congestion: variant("solana_congestion", "Solana transfers are slower, costlier and less reliable.", (s) => {
    const solana = onchain(s, "sim_solana_usdc");
    solana.networkFeeUSD = "0.60";
    solana.transferSeconds = 900;
    solana.transferSuccess = 0.965;
    s.behavior.sim_solana_usdc = { availability: "degraded", latencyMs: 0 };
  }),
  base_outage: variant("base_outage", "The Base provider is unavailable.", (s) => {
    s.behavior.sim_base_usdc = { availability: "down", latencyMs: 0 };
  }),
  bank_holiday: variant("bank_holiday", "Bank routes wait out a two-day closure.", (s) => {
    const bank = s.providers.find((provider) => provider.kind === "bank_fx");
    if (bank?.kind === "bank_fx") bank.extraSeconds += 172_800;
  }),
  slow_provider: variant("slow_provider", "The Ethereum provider takes too long to respond.", (s) => {
    s.behavior.sim_ethereum_usdc = { availability: "up", latencyMs: 30_000 };
  }),
};
