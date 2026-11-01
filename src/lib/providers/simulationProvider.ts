import type { StablecoinTransaction } from "@/types/transaction";
import { TransactionGenerator, type SimulatedEvent } from "@/lib/simulation";
import type { TransactionProvider } from "./types";

interface Resolution {
  at: number;
  event: SimulatedEvent;
}

const TICK_MS = 40;

/**
 * Plays a TransactionGenerator on a simulation clock. Speed, pause and hidden
 * tabs all act on that one clock, so the feed, metrics and globe stay in step.
 */
export class SimulationTransactionProvider implements TransactionProvider {
  private readonly listeners = new Set<(tx: StablecoinTransaction) => void>();
  private generator: TransactionGenerator;
  private resolutions: Resolution[] = [];
  private nextEvent: SimulatedEvent | null = null;
  private nextEventAt = 0;

  private timer: ReturnType<typeof setInterval> | null = null;
  private clockBase = 0;
  private clockAnchor = 0;
  private speed = 1;
  private userPaused = false;
  private hidden = false;

  constructor(seed: number) {
    this.generator = new TransactionGenerator(seed);
  }

  /** Current simulation time in milliseconds. */
  now(): number {
    if (!this.isRunning()) return this.clockBase;
    return this.clockBase + (performance.now() - this.clockAnchor) * this.speed;
  }

  isRunning(): boolean {
    return this.timer !== null && !this.userPaused && !this.hidden;
  }

  subscribe(callback: (tx: StablecoinTransaction) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  start(): void {
    if (this.timer) return;
    this.clockAnchor = performance.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.syncClock();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setPaused(paused: boolean): void {
    this.syncClock();
    this.userPaused = paused;
  }

  setHidden(hidden: boolean): void {
    this.syncClock();
    this.hidden = hidden;
  }

  setSpeed(speed: number): void {
    this.syncClock();
    this.speed = speed;
  }

  /** Discards scheduled events and starts a fresh stream from `seed`. */
  reseed(seed: number): void {
    this.generator = new TransactionGenerator(seed);
    this.resolutions = [];
    this.nextEvent = null;
    this.nextEventAt = this.now();
  }

  private syncClock(): void {
    const now = this.now();
    this.clockBase = now;
    this.clockAnchor = performance.now();
  }

  private tick(): void {
    if (!this.isRunning()) return;
    const now = this.now();

    if (!this.nextEvent) this.nextEvent = this.generator.next(Date.now());
    while (this.nextEventAt <= now) {
      const event = this.nextEvent;
      const transaction = { ...event.transaction, timestamp: Date.now() };
      this.emit(transaction);
      this.resolutions.push({
        at: this.nextEventAt + event.resolveInMs,
        event: { ...event, transaction },
      });
      this.nextEventAt += event.gapMs;
      this.nextEvent = this.generator.next(Date.now());
    }

    if (this.resolutions.length === 0) return;
    const remaining: Resolution[] = [];
    for (const resolution of this.resolutions) {
      if (resolution.at > now) {
        remaining.push(resolution);
        continue;
      }
      const { transaction, outcome, resolveInMs } = resolution.event;
      this.emit(
        outcome === "settled"
          ? { ...transaction, status: "settled", settlementTimeMs: resolveInMs }
          : { ...transaction, status: "failed" },
      );
    }
    this.resolutions = remaining;
  }

  private emit(transaction: StablecoinTransaction): void {
    for (const listener of this.listeners) listener(transaction);
  }
}
