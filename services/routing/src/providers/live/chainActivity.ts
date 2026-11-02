import { Decimal } from "../../domain/money.js";
import { CachedReader, type ReadingCache } from "./cachedReader.js";
import { rpc, RpcFailure, type RpcUrls } from "./networkConditions.js";

/**
 * Real ERC-20 Transfer events from a short window of recent blocks.
 *
 * These are raw token movements. They include exchange, contract and routing
 * hops, so a transfer isn't a payment, and nothing here says where anyone is.
 */
export type ActivityChain = "Ethereum" | "Base";
export type ActivityCoin = "USDC" | "USDT";

export interface ChainTransfer {
  coin: ActivityCoin;
  amount: string;
  from: string;
  to: string;
  txHash: string;
  blockNumber: number;
  timestamp: string | null;
}

export interface ChainActivity {
  chain: ActivityChain;
  fromBlock: number;
  toBlock: number;
  windowSeconds: number;
  transferCount: number;
  volumeByCoin: Partial<Record<ActivityCoin, string>>;
  countByCoin: Partial<Record<ActivityCoin, number>>;
  largest: ChainTransfer[];
  observedAt: string;
}

export interface ChainActivitySource {
  get(chain: ActivityChain): Promise<ChainActivity | undefined>;
}

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockTimestamp?: string;
  transactionHash: string;
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const COIN_DECIMALS = 6;
const LARGEST_KEPT = 40;
/** Blocks read each time. Few, because eth_getLogs is the costly call here. */
const BLOCKS: Record<ActivityChain, number> = { Ethereum: 3, Base: 5 };
/** Left off the tip, where a block may yet be replaced. */
const TIP_MARGIN = 2;

const CONTRACTS: Record<ActivityChain, Record<string, ActivityCoin>> = {
  Ethereum: { "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC", "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT" },
  Base: { "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC" },
};

const hex = (value: number) => `0x${value.toString(16)}`;
const topicAddress = (topic: string) => `0x${topic.slice(-40)}`;

export function summarize(chain: ActivityChain, fromBlock: number, toBlock: number, windowSeconds: number, logs: RawLog[], observedAt: string): ChainActivity {
  const volumes = new Map<ActivityCoin, Decimal>();
  const counts = new Map<ActivityCoin, number>();
  const transfers: ChainTransfer[] = [];

  for (const log of logs) {
    const coin = CONTRACTS[chain][log.address.toLowerCase()];
    if (!coin || log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
    const amount = new Decimal(BigInt(log.data).toString()).div(new Decimal(10).pow(COIN_DECIMALS));
    if (amount.lte(0)) continue;
    volumes.set(coin, (volumes.get(coin) ?? new Decimal(0)).add(amount));
    counts.set(coin, (counts.get(coin) ?? 0) + 1);
    transfers.push({
      coin,
      amount: amount.toFixed(COIN_DECIMALS),
      from: topicAddress(log.topics[1]!),
      to: topicAddress(log.topics[2]!),
      txHash: log.transactionHash,
      blockNumber: Number(BigInt(log.blockNumber)),
      timestamp: log.blockTimestamp ? new Date(Number(BigInt(log.blockTimestamp)) * 1000).toISOString() : null,
    });
  }

  transfers.sort((a, b) => new Decimal(b.amount).cmp(a.amount));
  return {
    chain,
    fromBlock,
    toBlock,
    windowSeconds,
    transferCount: transfers.length,
    volumeByCoin: Object.fromEntries([...volumes].map(([coin, volume]) => [coin, volume.toFixed(COIN_DECIMALS)])),
    countByCoin: Object.fromEntries(counts),
    largest: transfers.slice(0, LARGEST_KEPT),
    observedAt,
  };
}

export interface RpcActivityOptions {
  urls: RpcUrls;
  now: () => Date;
  freshForMs: number;
  cache?: ReadingCache<ChainActivity> | undefined;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retryAfterMs?: number;
  onError?: (chain: ActivityChain, reason: string) => void;
}

export class RpcChainActivity implements ChainActivitySource {
  private readonly reader: CachedReader<ChainActivity>;
  private readonly request: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: RpcActivityOptions) {
    this.request = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.reader = new CachedReader({
      now: options.now,
      freshForMs: options.freshForMs,
      retryAfterMs: options.retryAfterMs ?? 120_000,
      cache: options.cache,
    });
  }

  private async read(chain: ActivityChain, url: string): Promise<ChainActivity | undefined> {
    const { now, onError } = this.options;
    try {
      const signal = AbortSignal.timeout(this.timeoutMs);
      const tip = await rpc<{ number: string }>(this.request, url, "eth_getBlockByNumber", ["latest", false], signal);
      const toBlock = Number(BigInt(tip.number)) - TIP_MARGIN;
      const fromBlock = toBlock - BLOCKS[chain] + 1;
      const [logs, first, last] = await Promise.all([
        rpc<RawLog[]>(this.request, url, "eth_getLogs", [{ address: Object.keys(CONTRACTS[chain]), topics: [TRANSFER_TOPIC], fromBlock: hex(fromBlock), toBlock: hex(toBlock) }], signal),
        rpc<{ timestamp: string }>(this.request, url, "eth_getBlockByNumber", [hex(fromBlock - 1), false], signal),
        rpc<{ timestamp: string }>(this.request, url, "eth_getBlockByNumber", [hex(toBlock), false], signal),
      ]);
      const windowSeconds = Number(BigInt(last.timestamp) - BigInt(first.timestamp));
      if (!(windowSeconds > 0)) throw new RpcFailure("block window: not positive");
      return summarize(chain, fromBlock, toBlock, windowSeconds, logs, now().toISOString());
    } catch (error) {
      onError?.(chain, error instanceof RpcFailure ? error.message : "unexpected read failure");
      return undefined;
    }
  }

  async get(chain: ActivityChain): Promise<ChainActivity | undefined> {
    const url = chain === "Ethereum" ? this.options.urls.ethereum : this.options.urls.base;
    if (!url) return undefined;
    return this.reader.get(`chain-activity:${chain}`, () => this.read(chain, url));
  }
}
