import { create } from "zustand";
import { ALL_TRAFFIC, type Filters } from "@/lib/aggregate";
import { DEFAULT_SEED, type Speed } from "@/lib/constants";
import type { City } from "@/lib/cities";
import type { Chain, Stablecoin, StablecoinTransaction } from "@/types/transaction";

export interface CameraCommand {
  /** Unit vector to face, or null for the default view. */
  direction: [number, number, number] | null;
  distance: number | null;
  nonce: number;
}

export interface HoveredCity {
  city: City;
  x: number;
  y: number;
}

interface AppState {
  /** Newest first. Replaced, never mutated, at most a few times a second. */
  feed: StablecoinTransaction[];
  /** Bumps whenever session aggregates have changed. */
  revision: number;
  activeRoutes: number;

  filters: Filters;
  speed: Speed;
  paused: boolean;
  autoRotate: boolean;
  soundOn: boolean;
  bloomOn: boolean;
  seed: number;
  reducedMotion: boolean;

  globeVisited: boolean;
  globeReady: boolean;
  selectedTx: StablecoinTransaction | null;
  focusedCity: City | null;
  hoveredCity: HoveredCity | null;
  cameraCommand: CameraCommand | null;

  toggleCoin: (coin: Stablecoin) => void;
  toggleChain: (chain: Chain) => void;
  commandCamera: (direction: [number, number, number] | null, distance: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  feed: [],
  revision: 0,
  activeRoutes: 0,

  filters: ALL_TRAFFIC,
  speed: 1,
  paused: false,
  autoRotate: true,
  soundOn: false,
  bloomOn: true,
  seed: DEFAULT_SEED,
  reducedMotion: false,

  globeVisited: false,
  globeReady: false,
  selectedTx: null,
  focusedCity: null,
  hoveredCity: null,
  cameraCommand: null,

  toggleCoin: (coin) =>
    set(({ filters }) => ({
      filters: { ...filters, coins: { ...filters.coins, [coin]: !filters.coins[coin] } },
    })),
  toggleChain: (chain) =>
    set(({ filters }) => ({
      filters: { ...filters, chains: { ...filters.chains, [chain]: !filters.chains[chain] } },
    })),
  commandCamera: (direction, distance) =>
    set(({ cameraCommand }) => ({
      cameraCommand: { direction, distance, nonce: (cameraCommand?.nonce ?? 0) + 1 },
    })),
}));

export function matchesFilters(tx: StablecoinTransaction, filters: Filters): boolean {
  return filters.coins[tx.stablecoin] && filters.chains[tx.chain];
}
