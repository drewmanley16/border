import { Decimal } from "../../domain/money.js";
import { CachedReader, type ReadingCache } from "./cachedReader.js";

/**
 * Observed fee and confirmation time for one stablecoin transfer on a network.
 *
 * The gas and block data are measurements. The gas used, the confirmation
 * counts and the signature count below are this service's assumptions, so the
 * result is an estimate of a typical transfer and not a price anyone quoted.
 *
 * Read-only: this calls view methods and never signs or sends a transaction.
 */
export type LiveNetwork = "Solana" | "Base" | "Ethereum";

export interface NetworkCondition {
  feeUSD: string;
  seconds: number;
  observedAt: string;
}

export interface NetworkConditionSource {
  /** Resolves to undefined when no live figure is available, so callers fall back. */
  get(network: LiveNetwork): Promise<NetworkCondition | undefined>;
}

export interface RpcUrls {
  solana?: string | undefined;
  ethereum?: string | undefined;
  base?: string | undefined;
}

export interface RpcConditionOptions {
  urls: RpcUrls;
  now: () => Date;
  cache?: ReadingCache<NetworkCondition> | undefined;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  freshForMs?: number;
  /** How long to skip a network after a failed read. */
  retryAfterMs?: number;
  onError?: (network: LiveNetwork, reason: string) => void;
}

/** Typical gas for an ERC-20 transfer to an address that already holds the token. */
const ERC20_TRANSFER_GAS = 65_000n;
/** Size of the transfer that the OP Stack L1 data fee is estimated for. */
const OP_STACK_TX_BYTES = 120;
const SOLANA_BASE_FEE_LAMPORTS = 5_000n;
const SOLANA_TRANSFER_COMPUTE_UNITS = 10_000n;
const BLOCK_SAMPLE = 20n;

/** Our waiting policy, not a statement of finality. */
const CONFIRMATIONS: Record<LiveNetwork, number> = { Ethereum: 12, Base: 10, Solana: 32 };

const LATEST_ROUND_DATA = "0xfeaf968c";
const GET_L1_FEE_UPPER_BOUND = "0xf1c7a58b";
const OP_GAS_PRICE_ORACLE = "0x420000000000000000000000000000000000000F";
const SOLANA_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const HOUR_S = 3_600;
/** Chainlink feeds with their maximum age. These update on deviation or a heartbeat. */
const FEEDS = {
  ethUsdEthereum: { address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", maxAgeSeconds: 2 * HOUR_S },
  solUsdEthereum: { address: "0x4ffC43a60e009B551865A93d232E33Fce9f01507", maxAgeSeconds: 26 * HOUR_S },
  ethUsdBase: { address: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", maxAgeSeconds: 2 * HOUR_S },
} as const;
const FEED_DECIMALS = 8;

/** Anything outside these is treated as a bad read rather than shown to a caller. */
const MAX_FEE_USD = 500;
const MAX_SECONDS = 3_600;

export class RpcFailure extends Error {}

/** Errors deliberately carry no URL: an endpoint URL contains its access token. */
export async function rpc<T>(request: typeof globalThis.fetch, url: string, method: string, params: unknown[], signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal,
    });
  } catch {
    throw new RpcFailure(`${method}: request failed`);
  }
  if (!response.ok) throw new RpcFailure(`${method}: HTTP ${response.status}`);
  const body = (await response.json().catch(() => null)) as { result?: T; error?: { code?: number } } | null;
  if (!body || body.error || body.result === undefined || body.result === null) {
    throw new RpcFailure(`${method}: ${body?.error?.code ?? "empty result"}`);
  }
  return body.result;
}

function hexToBigInt(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) throw new RpcFailure(`${field}: not a hex value`);
  return BigInt(value);
}

function median(values: readonly bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor(sorted.length / 2)]!;
}

const dec = (value: bigint) => new Decimal(value.toString());

/** Reads a USD price from `latestRoundData()`, refusing a stale or non-positive answer. */
async function chainlinkPrice(request: typeof globalThis.fetch, url: string, feed: { address: string; maxAgeSeconds: number }, now: Date, signal: AbortSignal): Promise<Decimal> {
  const raw = await rpc<string>(request, url, "eth_call", [{ to: feed.address, data: LATEST_ROUND_DATA }, "latest"], signal);
  const words = raw.slice(2).match(/.{64}/g);
  if (words?.length !== 5) throw new RpcFailure("latestRoundData: unexpected shape");
  const answer = BigInt(`0x${words[1]}`);
  const updatedAt = Number(BigInt(`0x${words[3]}`));
  // A negative int256 answer reads as enormous, so bound it from above too.
  if (answer <= 0n || answer >= 1n << 128n) throw new RpcFailure("latestRoundData: bad answer");
  if (now.getTime() / 1000 - updatedAt > feed.maxAgeSeconds) throw new RpcFailure("latestRoundData: stale price");
  return dec(answer).div(new Decimal(10).pow(FEED_DECIMALS));
}

async function evmBlockSeconds(request: typeof globalThis.fetch, url: string, signal: AbortSignal): Promise<number> {
  const latest = await rpc<{ number: string; timestamp: string }>(request, url, "eth_getBlockByNumber", ["latest", false], signal);
  const height = hexToBigInt(latest.number, "number");
  const older = await rpc<{ timestamp: string }>(request, url, "eth_getBlockByNumber", [`0x${(height - BLOCK_SAMPLE).toString(16)}`, false], signal);
  const elapsed = hexToBigInt(latest.timestamp, "timestamp") - hexToBigInt(older.timestamp, "timestamp");
  return Number(elapsed) / Number(BLOCK_SAMPLE);
}

/** EIP-1559 gas price: the next block's base fee plus the median recent tip. */
async function evmGasPriceWei(request: typeof globalThis.fetch, url: string, signal: AbortSignal): Promise<bigint> {
  const history = await rpc<{ baseFeePerGas: string[]; reward?: string[][] }>(request, url, "eth_feeHistory", ["0x5", "latest", [50]], signal);
  const nextBase = hexToBigInt(history.baseFeePerGas.at(-1), "baseFeePerGas");
  const tips = (history.reward ?? []).map((reward) => hexToBigInt(reward[0], "reward"));
  return nextBase + median(tips);
}

async function readEthereum(request: typeof globalThis.fetch, url: string, now: Date, signal: AbortSignal) {
  const [gasPrice, blockSeconds, ethUSD] = await Promise.all([
    evmGasPriceWei(request, url, signal),
    evmBlockSeconds(request, url, signal),
    chainlinkPrice(request, url, FEEDS.ethUsdEthereum, now, signal),
  ]);
  return { feeUSD: dec(gasPrice * ERC20_TRANSFER_GAS).div(1e18).mul(ethUSD), blockSeconds };
}

async function readBase(request: typeof globalThis.fetch, url: string, now: Date, signal: AbortSignal) {
  const size = OP_STACK_TX_BYTES.toString(16).padStart(64, "0");
  const [gasPrice, blockSeconds, ethUSD, l1Fee] = await Promise.all([
    evmGasPriceWei(request, url, signal),
    evmBlockSeconds(request, url, signal),
    chainlinkPrice(request, url, FEEDS.ethUsdBase, now, signal),
    rpc<string>(request, url, "eth_call", [{ to: OP_GAS_PRICE_ORACLE, data: `${GET_L1_FEE_UPPER_BOUND}${size}` }, "latest"], signal),
  ]);
  const wei = gasPrice * ERC20_TRANSFER_GAS + hexToBigInt(l1Fee, "l1Fee");
  return { feeUSD: dec(wei).div(1e18).mul(ethUSD), blockSeconds };
}

/** Solana has no native USD feed here, so its price comes from the Ethereum endpoint. */
async function readSolana(request: typeof globalThis.fetch, url: string, priceUrl: string, now: Date, signal: AbortSignal) {
  const [samples, fees, solUSD] = await Promise.all([
    rpc<{ numSlots: number; samplePeriodSecs: number }[]>(request, url, "getRecentPerformanceSamples", [5], signal),
    rpc<{ prioritizationFee: number }[]>(request, url, "getRecentPrioritizationFees", [[SOLANA_TOKEN_PROGRAM]], signal),
    chainlinkPrice(request, priceUrl, FEEDS.solUsdEthereum, now, signal),
  ]);
  const slots = samples.reduce((sum, sample) => sum + sample.numSlots, 0);
  const elapsed = samples.reduce((sum, sample) => sum + sample.samplePeriodSecs, 0);
  if (slots <= 0) throw new RpcFailure("getRecentPerformanceSamples: no samples");

  const microLamportsPerUnit = median(fees.map((fee) => BigInt(fee.prioritizationFee)));
  const lamports = dec(SOLANA_BASE_FEE_LAMPORTS).add(dec(microLamportsPerUnit * SOLANA_TRANSFER_COMPUTE_UNITS).div(1e6));
  return { feeUSD: lamports.div(1e9).mul(solUSD), blockSeconds: elapsed / slots };
}

/**
 * Reads conditions over JSON-RPC. It never throws: a missing endpoint or failed
 * read is an `undefined`, and quotes stay simulated.
 */
export class RpcNetworkConditions implements NetworkConditionSource {
  private readonly reader: CachedReader<NetworkCondition>;
  private readonly request: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: RpcConditionOptions) {
    this.request = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 1_200;
    this.reader = new CachedReader({
      now: options.now,
      freshForMs: options.freshForMs ?? 300_000,
      retryAfterMs: options.retryAfterMs ?? 120_000,
      cache: options.cache,
    });
  }

  private reading(network: LiveNetwork, signal: AbortSignal) {
    const { urls, now } = this.options;
    const at = now();
    if (network === "Ethereum") return urls.ethereum ? readEthereum(this.request, urls.ethereum, at, signal) : undefined;
    if (network === "Base") return urls.base ? readBase(this.request, urls.base, at, signal) : undefined;
    return urls.solana && urls.ethereum ? readSolana(this.request, urls.solana, urls.ethereum, at, signal) : undefined;
  }

  private async read(network: LiveNetwork): Promise<NetworkCondition | undefined> {
    try {
      const reading = this.reading(network, AbortSignal.timeout(this.timeoutMs));
      if (!reading) return undefined;
      const { feeUSD, blockSeconds } = await reading;
      const seconds = Math.ceil(blockSeconds * CONFIRMATIONS[network]);
      if (!feeUSD.isFinite() || feeUSD.lte(0) || feeUSD.gt(MAX_FEE_USD) || !(seconds > 0 && seconds <= MAX_SECONDS)) {
        throw new RpcFailure("reading outside sane bounds");
      }
      return { feeUSD: feeUSD.toFixed(12), seconds, observedAt: this.options.now().toISOString() };
    } catch (error) {
      this.options.onError?.(network, error instanceof RpcFailure ? error.message : "unexpected read failure");
      return undefined;
    }
  }

  get(network: LiveNetwork): Promise<NetworkCondition | undefined> {
    return this.reader.get(`network-condition:${network}`, () => this.read(network));
  }
}
