import type {
  Chain,
  Stablecoin,
  StablecoinTransaction,
  TransactionEndpoint,
} from "@/types/transaction";
import {
  BASE_TX_PER_SECOND,
  CHAIN_SETTLEMENT_MS,
  COIN_CHAINS,
  STABLECOINS,
} from "./constants";
import { CITY_BY_ID, CORRIDORS, type City, type Corridor } from "./cities";
import { createRng, pickWeighted } from "./rng";

const COIN_SHARE: Record<Stablecoin, number> = { USDT: 46, USDC: 40, PYUSD: 8, DAI: 6 };

/** Share of traffic that runs against the corridor's dominant direction. */
const REVERSE_FLOW = 0.22;
const FAILURE_RATE = 0.014;

const AMOUNT_TIERS = [
  { weight: 58, min: 10, max: 500 },
  { weight: 30, min: 500, max: 5_000 },
  { weight: 11.4, min: 5_000, max: 100_000 },
  { weight: 0.6, min: 100_000, max: 2_500_000 },
];

export interface SimulatedEvent {
  transaction: StablecoinTransaction;
  outcome: "settled" | "failed";
  /** Simulated time from submission until the outcome is known. */
  resolveInMs: number;
  /** Simulated time to wait before the next transaction. */
  gapMs: number;
}

function endpoint({ city, country, countryCode, lat, lng }: City): TransactionEndpoint {
  return { city, country, countryCode, lat, lng };
}

/**
 * Produces a reproducible stream of simulated transactions. The same seed gives
 * the same sequence, apart from the `timestamp` the caller supplies.
 */
export class TransactionGenerator {
  private readonly random: () => number;
  private sequence = 0;
  private burstLevel = 1;
  private burstRemaining = 0;

  constructor(readonly seed: number) {
    this.random = createRng(seed);
  }

  next(timestamp: number): SimulatedEvent {
    const corridor = pickWeighted(CORRIDORS, (c) => c.weight, this.random());
    const reversed = this.random() < REVERSE_FLOW;
    const from = CITY_BY_ID.get(reversed ? corridor.to : corridor.from)!;
    const to = CITY_BY_ID.get(reversed ? corridor.from : corridor.to)!;

    const stablecoin = this.pickCoin(corridor);
    const chain = this.pickChain(stablecoin);
    const amountUSD = this.pickAmount();
    const [minMs, maxMs] = CHAIN_SETTLEMENT_MS[chain];
    const settlementMs = Math.round(minMs + this.random() * (maxMs - minMs));
    const failed = this.random() < FAILURE_RATE;

    this.sequence += 1;
    const transaction: StablecoinTransaction = {
      id: this.makeId(),
      timestamp,
      origin: endpoint(from),
      destination: endpoint(to),
      amountUSD,
      stablecoin,
      chain,
      status: "pending",
      expectedSettlementMs: settlementMs,
    };

    return {
      transaction,
      outcome: failed ? "failed" : "settled",
      resolveInMs: failed ? Math.round(settlementMs * (0.45 + this.random() * 0.3)) : settlementMs,
      gapMs: this.nextGap(),
    };
  }

  private pickCoin(corridor: Corridor): Stablecoin {
    return pickWeighted(
      STABLECOINS,
      (coin) => COIN_SHARE[coin] * (coin === "USDT" ? (corridor.usdtBias ?? 1) : 1),
      this.random(),
    );
  }

  private pickChain(coin: Stablecoin): Chain {
    const entries = Object.entries(COIN_CHAINS[coin]) as [Chain, number][];
    return pickWeighted(entries, ([, share]) => share, this.random())[0];
  }

  private pickAmount(): number {
    const tier = pickWeighted(AMOUNT_TIERS, (t) => t.weight, this.random());
    // Log-uniform inside a tier, so small values in each band are more common.
    const exact = tier.min * Math.pow(tier.max / tier.min, this.random());
    const step = exact < 1_000 ? 0.01 : exact < 100_000 ? 1 : 100;
    return Math.round(exact / step) * step;
  }

  /** Poisson arrivals, with occasional bursts so the network feels organic. */
  private nextGap(): number {
    if (this.burstRemaining <= 0) {
      this.burstLevel = this.random() < 0.3 ? 1.6 + this.random() * 1.2 : 0.75 + this.random() * 0.4;
      this.burstRemaining = 10 + Math.floor(this.random() * 40);
    }
    this.burstRemaining -= 1;
    const mean = 1000 / (BASE_TX_PER_SECOND * this.burstLevel);
    return -Math.log(1 - this.random()) * mean;
  }

  private makeId(): string {
    let hex = "";
    for (let i = 0; i < 3; i += 1) {
      hex += Math.floor(this.random() * 0x10000)
        .toString(16)
        .padStart(4, "0");
    }
    return `sim_${this.sequence.toString(36).padStart(4, "0")}${hex}`;
  }
}
