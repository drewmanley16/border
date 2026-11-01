import type { StablecoinTransaction } from "@/types/transaction";
import { matchesFilters, useAppStore } from "@/store/transactionStore";
import { Aggregator } from "./aggregate";
import { FEED_RETAINED, MAX_ACTIVE_ROUTES, WHALE_USD, type Speed } from "./constants";
import { angularDistance, flightMs, latLngToUnit } from "./geo";
import { SimulationTransactionProvider } from "./providers/simulationProvider";
import { playArrival } from "./sound";

/** Delay between the launch pulse and the star leaving the city, in sim seconds. */
export const LAUNCH_DELAY_S = 0.22;
const FLUSH_MS = 250;

export type ArcEvent =
  | { kind: "launch"; tx: StablecoinTransaction; startS: number; durationS: number }
  | { kind: "fail"; id: string; atS: number }
  | { kind: "clear" };

interface Flight {
  tx: StablecoinTransaction;
  landsAtS: number;
  failed: boolean;
}

/**
 * Connects a provider to the rest of the app. Aggregates update on every event,
 * the globe hears about every flight directly, and React only sees a snapshot a
 * few times a second.
 */
class Network {
  readonly aggregator = new Aggregator();
  private provider: SimulationTransactionProvider | null = null;
  private readonly arcListeners = new Set<(event: ArcEvent) => void>();
  private readonly flights = new Map<string, Flight>();
  private feed: StablecoinTransaction[] = [];
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  /** Simulation time in seconds. Stands still while paused. */
  nowS(): number {
    return (this.provider?.now() ?? 0) / 1000;
  }

  start(seed: number): () => void {
    useAppStore.setState({ seed });
    const provider = new SimulationTransactionProvider(seed);
    this.provider = provider;

    const { speed, paused } = useAppStore.getState();
    provider.setSpeed(speed);
    provider.setPaused(paused);
    const unsubscribe = provider.subscribe((tx) => this.onTransaction(tx));

    const syncVisibility = () => provider.setHidden(document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    provider.start();
    this.flushTimer = setInterval(() => this.flush(), FLUSH_MS);

    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      unsubscribe();
      provider.stop();
      if (this.flushTimer) clearInterval(this.flushTimer);
      this.flushTimer = null;
      this.provider = null;
      this.clearSession();
    };
  }

  setPaused(paused: boolean): void {
    this.provider?.setPaused(paused);
    useAppStore.setState({ paused });
  }

  setSpeed(speed: Speed): void {
    this.provider?.setSpeed(speed);
    useAppStore.setState({ speed });
  }

  /** Starts a new session from `seed`, discarding everything so far. */
  restart(seed: number): void {
    this.clearSession();
    this.provider?.reseed(seed);
    useAppStore.setState({ seed });
  }

  onArc(listener: (event: ArcEvent) => void): () => void {
    this.arcListeners.add(listener);
    return () => {
      this.arcListeners.delete(listener);
    };
  }

  private clearSession(): void {
    this.aggregator.reset();
    this.flights.clear();
    this.feed = [];
    for (const listener of this.arcListeners) listener({ kind: "clear" });
    useAppStore.setState({
      feed: [],
      activeRoutes: 0,
      selectedTx: null,
      focusedCity: null,
      revision: useAppStore.getState().revision + 1,
    });
  }

  private onTransaction(tx: StablecoinTransaction): void {
    this.aggregator.ingest(tx);
    this.dirty = true;

    if (tx.status === "pending") {
      this.feed.unshift(tx);
      if (this.feed.length > FEED_RETAINED) this.feed.length = FEED_RETAINED;
      this.launch(tx);
      return;
    }

    const index = this.feed.findIndex((row) => row.id === tx.id);
    if (index >= 0) this.feed[index] = tx;

    const flight = this.flights.get(tx.id);
    if (flight && tx.status === "failed") {
      flight.failed = true;
      flight.landsAtS = this.nowS();
      for (const listener of this.arcListeners) listener({ kind: "fail", id: tx.id, atS: flight.landsAtS });
    }
  }

  private launch(tx: StablecoinTransaction): void {
    const whale = tx.amountUSD >= WHALE_USD;
    if (!whale && this.flights.size >= MAX_ACTIVE_ROUTES) return;

    const omega = angularDistance(
      latLngToUnit(tx.origin.lat, tx.origin.lng),
      latLngToUnit(tx.destination.lat, tx.destination.lng),
    );
    const startS = this.nowS();
    const durationS = flightMs(tx.expectedSettlementMs, omega) / 1000;
    this.flights.set(tx.id, {
      tx,
      landsAtS: startS + LAUNCH_DELAY_S + durationS,
      failed: false,
    });
    for (const listener of this.arcListeners) listener({ kind: "launch", tx, startS, durationS });
  }

  private flush(): void {
    const nowS = this.nowS();
    const state = useAppStore.getState();

    let active = 0;
    for (const [id, flight] of this.flights) {
      if (flight.landsAtS <= nowS) {
        this.flights.delete(id);
        if (state.soundOn && !flight.failed && matchesFilters(flight.tx, state.filters)) {
          playArrival(flight.tx.amountUSD);
        }
      } else if (matchesFilters(flight.tx, state.filters)) {
        active += 1;
      }
    }

    if (!this.dirty && active === state.activeRoutes) return;

    const patch: Partial<ReturnType<typeof useAppStore.getState>> = { activeRoutes: active };
    if (this.dirty) {
      patch.feed = [...this.feed];
      patch.revision = state.revision + 1;
      const selected = state.selectedTx;
      if (selected && selected.status === "pending") {
        patch.selectedTx = this.feed.find((row) => row.id === selected.id) ?? selected;
      }
      this.dirty = false;
    }
    useAppStore.setState(patch);
  }
}

export const network = new Network();

