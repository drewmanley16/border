import type { Chain, Stablecoin, StablecoinTransaction, TransactionEndpoint } from "@/types/transaction";
import { CHAINS, STABLECOINS } from "./constants";

export interface Filters {
  coins: Record<Stablecoin, boolean>;
  chains: Record<Chain, boolean>;
}

export const ALL_TRAFFIC: Filters = {
  coins: { USDC: true, USDT: true, PYUSD: true, DAI: true },
  chains: { Solana: true, Base: true, Ethereum: true, Tron: true },
};

export interface Totals {
  count: number;
  settled: number;
  failed: number;
  volumeUSD: number;
  settlementMsTotal: number;
}

interface Cell extends Totals {
  coin: Stablecoin;
  chain: Chain;
  origin: TransactionEndpoint;
  destination: TransactionEndpoint;
}

export interface TimeBucket {
  time: number;
  count: number;
  USDC: number;
  USDT: number;
  PYUSD: number;
  DAI: number;
}

export interface CorridorRow {
  origin: TransactionEndpoint;
  destination: TransactionEndpoint;
  count: number;
  volumeUSD: number;
}

export interface CountryRow {
  country: string;
  countryCode: string;
  sent: number;
  received: number;
  volumeUSD: number;
}

export interface CityActivity {
  sent: number;
  received: number;
  volumeUSD: number;
}

export const BUCKET_MS = 5_000;
const BUCKETS_RETAINED = 120;
const LARGEST_RETAINED = 12;

const emptyTotals = (): Totals => ({
  count: 0,
  settled: 0,
  failed: 0,
  volumeUSD: 0,
  settlementMsTotal: 0,
});

/** Session aggregates. Memory is bounded by the corridor and coin combinations. */
export class Aggregator {
  private readonly cells = new Map<string, Cell>();
  private readonly buckets = new Map<number, TimeBucket>();
  private largestSettled: StablecoinTransaction[] = [];
  /** Ids submitted but not yet settled or failed. */
  private readonly open = new Set<string>();

  reset(): void {
    this.cells.clear();
    this.buckets.clear();
    this.open.clear();
    this.largestSettled = [];
  }

  ingest(tx: StablecoinTransaction): void {
    const cell = this.cellFor(tx);
    const known = this.open.has(tx.id);
    if (!known) {
      cell.count += 1;
      this.bucketFor(tx.timestamp).count += 1;
    }

    if (tx.status === "pending") {
      this.open.add(tx.id);
      return;
    }
    this.open.delete(tx.id);

    if (tx.status === "failed") {
      cell.failed += 1;
      return;
    }
    cell.settled += 1;
    cell.volumeUSD += tx.amountUSD;
    cell.settlementMsTotal += tx.settlementTimeMs ?? 0;
    this.bucketFor(tx.timestamp)[tx.stablecoin] += tx.amountUSD;
    this.trackLargest(tx);
  }

  totals(filters: Filters = ALL_TRAFFIC): Totals {
    const sum = emptyTotals();
    for (const cell of this.matching(filters)) addTotals(sum, cell);
    return sum;
  }

  byCoin(): Record<Stablecoin, Totals> {
    const out = Object.fromEntries(STABLECOINS.map((k) => [k, emptyTotals()])) as Record<Stablecoin, Totals>;
    for (const cell of this.cells.values()) addTotals(out[cell.coin], cell);
    return out;
  }

  byChain(): Record<Chain, Totals> {
    const out = Object.fromEntries(CHAINS.map((k) => [k, emptyTotals()])) as Record<Chain, Totals>;
    for (const cell of this.cells.values()) addTotals(out[cell.chain], cell);
    return out;
  }

  /** Returns copies: chart libraries may freeze the objects they receive. */
  timeline(): TimeBucket[] {
    return [...this.buckets.values()].map((bucket) => ({ ...bucket })).sort((a, b) => a.time - b.time);
  }

  largest(): StablecoinTransaction[] {
    return this.largestSettled;
  }

  corridors(limit: number, filters: Filters = ALL_TRAFFIC): CorridorRow[] {
    const rows = new Map<string, CorridorRow>();
    for (const cell of this.matching(filters)) {
      const key = `${cell.origin.city}>${cell.destination.city}`;
      const row = rows.get(key) ?? {
        origin: cell.origin,
        destination: cell.destination,
        count: 0,
        volumeUSD: 0,
      };
      row.count += cell.count;
      row.volumeUSD += cell.volumeUSD;
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.volumeUSD - a.volumeUSD).slice(0, limit);
  }

  /** Corridors touching a city, busiest first. */
  corridorsFor(city: string, limit: number): CorridorRow[] {
    return this.corridors(Number.MAX_SAFE_INTEGER)
      .filter((row) => row.origin.city === city || row.destination.city === city)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  countries(limit: number): CountryRow[] {
    const rows = new Map<string, CountryRow>();
    const rowFor = ({ country, countryCode }: TransactionEndpoint) => {
      const row = rows.get(countryCode) ?? { country, countryCode, sent: 0, received: 0, volumeUSD: 0 };
      rows.set(countryCode, row);
      return row;
    };
    for (const cell of this.cells.values()) {
      const from = rowFor(cell.origin);
      const to = rowFor(cell.destination);
      from.sent += cell.count;
      to.received += cell.count;
      from.volumeUSD += cell.volumeUSD;
      to.volumeUSD += cell.volumeUSD;
    }
    return [...rows.values()].sort((a, b) => b.volumeUSD - a.volumeUSD).slice(0, limit);
  }

  city(name: string): CityActivity {
    const out: CityActivity = { sent: 0, received: 0, volumeUSD: 0 };
    for (const cell of this.cells.values()) {
      const sent = cell.origin.city === name;
      const received = cell.destination.city === name;
      if (sent) out.sent += cell.count;
      if (received) out.received += cell.count;
      if (sent || received) out.volumeUSD += cell.volumeUSD;
    }
    return out;
  }

  private *matching(filters: Filters): Generator<Cell> {
    for (const cell of this.cells.values()) {
      if (filters.coins[cell.coin] && filters.chains[cell.chain]) yield cell;
    }
  }

  private cellFor(tx: StablecoinTransaction): Cell {
    const key = `${tx.stablecoin}|${tx.chain}|${tx.origin.city}>${tx.destination.city}`;
    let cell = this.cells.get(key);
    if (!cell) {
      cell = {
        ...emptyTotals(),
        coin: tx.stablecoin,
        chain: tx.chain,
        origin: tx.origin,
        destination: tx.destination,
      };
      this.cells.set(key, cell);
    }
    return cell;
  }

  private bucketFor(timestamp: number): TimeBucket {
    const time = Math.floor(timestamp / BUCKET_MS) * BUCKET_MS;
    let bucket = this.buckets.get(time);
    if (!bucket) {
      bucket = { time, count: 0, USDC: 0, USDT: 0, PYUSD: 0, DAI: 0 };
      this.buckets.set(time, bucket);
      if (this.buckets.size > BUCKETS_RETAINED) {
        this.buckets.delete(Math.min(...this.buckets.keys()));
      }
    }
    return bucket;
  }

  private trackLargest(tx: StablecoinTransaction): void {
    const worst = this.largestSettled[LARGEST_RETAINED - 1];
    if (worst && tx.amountUSD <= worst.amountUSD) return;
    this.largestSettled = [...this.largestSettled, tx]
      .sort((a, b) => b.amountUSD - a.amountUSD)
      .slice(0, LARGEST_RETAINED);
  }
}

/**
 * Stands in for live aggregates until the first snapshot. The simulation can
 * start before a page finishes hydrating, and that render must match the server.
 */
export const EMPTY_AGGREGATOR = new Aggregator();

function addTotals(into: Totals, from: Totals): void {
  into.count += from.count;
  into.settled += from.settled;
  into.failed += from.failed;
  into.volumeUSD += from.volumeUSD;
  into.settlementMsTotal += from.settlementMsTotal;
}

export function averageSettlementMs(totals: Totals): number {
  return totals.settled === 0 ? 0 : totals.settlementMsTotal / totals.settled;
}
