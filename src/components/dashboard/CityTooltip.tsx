"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { flagEmoji, formatCompactUSD, formatInteger } from "@/lib/format";
import { network } from "@/lib/network";
import { useAppStore } from "@/store/transactionStore";

export function CityTooltip() {
  const hovered = useAppStore((state) => state.hoveredCity);
  const revision = useAppStore((state) => state.revision);
  const city = hovered?.city;
  const activity = useMemo(
    () => (city ? network.aggregator.city(city.city) : null),
    // `revision` stands in for the aggregates, which mutate in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city, revision],
  );

  return (
    <AnimatePresence>
      {hovered && activity ? (
        <motion.div
          key={hovered.city.id}
          role="tooltip"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          style={{ left: hovered.x + 14, top: hovered.y + 14 }}
          className="glass pointer-events-none fixed z-40 w-52 rounded-lg px-3 py-2.5"
        >
          <p className="text-sm font-medium">
            {flagEmoji(hovered.city.countryCode)} {hovered.city.city}
          </p>
          <p className="text-xs text-ink-2">{hovered.city.country}</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-ink-2">Simulated sent</dt>
            <dd className="text-right">{formatInteger(activity.sent)}</dd>
            <dt className="text-ink-2">Simulated received</dt>
            <dd className="text-right">{formatInteger(activity.received)}</dd>
            <dt className="text-ink-2">Simulated volume</dt>
            <dd className="text-right">{formatCompactUSD(activity.volumeUSD)}</dd>
          </dl>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
