import type { City } from "./cities";
import { angularDistance, latLngToUnit, slerpUnit } from "./geo";
import { useAppStore } from "@/store/transactionStore";
import type { StablecoinTransaction } from "@/types/transaction";

/** Camera distances, as tuned for a landscape screen. The default view is about 5. */
const CITY_DISTANCE = 3.2;
const ROUTE_BASE_DISTANCE = 2.7;
const ROUTE_DISTANCE_PER_RADIAN = 1.5;

/** Highlights a payment's route and frames the whole of it. */
export function selectTransaction(tx: StablecoinTransaction): void {
  const a = latLngToUnit(tx.origin.lat, tx.origin.lng);
  const b = latLngToUnit(tx.destination.lat, tx.destination.lng);
  const omega = angularDistance(a, b);
  const state = useAppStore.getState();
  useAppStore.setState({ selectedTx: tx, focusedCity: null });
  state.commandCamera(slerpUnit(a, b, 0.5), ROUTE_BASE_DISTANCE + omega * ROUTE_DISTANCE_PER_RADIAN);
}

export function focusCity(city: City): void {
  const state = useAppStore.getState();
  useAppStore.setState({ focusedCity: city, selectedTx: null, hoveredCity: null });
  state.commandCamera(latLngToUnit(city.lat, city.lng), CITY_DISTANCE);
}

export function clearSelection(): void {
  useAppStore.setState({ selectedTx: null, focusedCity: null });
}

export function resetCamera(): void {
  clearSelection();
  useAppStore.getState().commandCamera(null, null);
}
