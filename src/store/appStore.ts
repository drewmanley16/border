import { create } from "zustand";
import { findCountry, type Country } from "@/lib/countries";
import { latLngToUnit } from "@/lib/geo";

export const RAIL_PX = 72;
export const LEFT_PANEL_PX = 360;
export const RIGHT_PANEL_PX = 340;

export type RightTab = "transfers" | "paths" | "rails";

export interface GlobePin {
  lat: number;
  lng: number;
}

export interface GlobeFocus {
  id: string;
  kind: "provider" | "chain" | "rail";
  title: string;
  detail: string;
  color: string;
}

/** Faces the middle of a route, or a single place. */
export function faceGlobe(a: GlobePin, b: GlobePin = a): void {
  const [x, y, z] = latLngToUnit(a.lat, a.lng);
  const [p, q, r] = latLngToUnit(b.lat, b.lng);
  const [mx, my, mz] = [x + p, y + q, z + r];
  const length = Math.hypot(mx, my, mz);
  // Opposite sides of the world have no midpoint, so face the destination.
  const pin = length < 0.05 ? b : { lat: (Math.asin(my / length) * 180) / Math.PI, lng: (Math.atan2(mx, mz) * 180) / Math.PI };
  useAppStore.setState(({ cameraTarget }) => ({ cameraTarget: { pin, nonce: (cameraTarget?.nonce ?? 0) + 1 } }));
}

interface AppState {
  /** What the viewer last picked for the globe to show. */
  focus: GlobeFocus | null;
  leftOpen: boolean;
  rightOpen: boolean;
  rightTab: RightTab;
  from: Country;
  to: Country;
  /** Places the viewer chose, so these are the only locations the globe ever marks. */
  pins: { from: GlobePin | null; to: GlobePin | null };
  /** Bumped with a new place to face. */
  cameraTarget: { pin: GlobePin; nonce: number } | null;
  autoRotate: boolean;
  bloomOn: boolean;
  reducedMotion: boolean;
  globeVisited: boolean;
  globeReady: boolean;
}

export const useAppStore = create<AppState>(() => ({
  focus: null,
  leftOpen: true,
  rightOpen: true,
  rightTab: "transfers",
  from: findCountry("US")!,
  to: findCountry("JP")!,
  pins: { from: null, to: null },
  cameraTarget: null,
  autoRotate: true,
  bloomOn: true,
  reducedMotion: false,
  globeVisited: false,
  globeReady: false,
}));
