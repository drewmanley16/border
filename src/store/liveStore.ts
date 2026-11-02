import { create } from "zustand";
import { fetchActivity, fetchConditions, fetchFxRates, POLL_MS, type ChainActivity, type FxRates, type NetworkConditionRow } from "@/lib/liveData";

interface LiveState {
  conditions: NetworkConditionRow[];
  activity: ChainActivity[];
  fx: FxRates | null;
  /** When a load last succeeded. Null until one does. */
  loadedAt: number | null;
  /** The latest load failed, so anything on screen is from an earlier one. */
  failed: boolean;
}

export const useLiveStore = create<LiveState>(() => ({ conditions: [], activity: [], fx: null, loadedAt: null, failed: false }));

/** Loads once per poll window, and not at all while the tab is hidden. */
export function startLiveData(): () => void {
  let controller: AbortController | undefined;
  let lastAttempt = 0;

  const load = async () => {
    if (document.hidden || Date.now() - lastAttempt < POLL_MS) return;
    lastAttempt = Date.now();
    controller?.abort();
    const current = (controller = new AbortController());
    const [conditions, activity, fx] = await Promise.allSettled([fetchConditions(current.signal), fetchActivity(current.signal), fetchFxRates(current.signal)]);
    if (current.signal.aborted) return;
    useLiveStore.setState((state) => ({
      conditions: conditions.status === "fulfilled" ? conditions.value : state.conditions,
      activity: activity.status === "fulfilled" ? activity.value : state.activity,
      fx: fx.status === "fulfilled" ? fx.value : state.fx,
      loadedAt: conditions.status === "fulfilled" || activity.status === "fulfilled" ? Date.now() : state.loadedAt,
      failed: conditions.status === "rejected" || activity.status === "rejected",
    }));
  };

  void load();
  const timer = setInterval(load, POLL_MS);
  document.addEventListener("visibilitychange", load);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", load);
    controller?.abort();
  };
}
