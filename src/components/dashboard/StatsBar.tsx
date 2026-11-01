"use client";

import { useMemo } from "react";
import { averageSettlementMs, EMPTY_AGGREGATOR } from "@/lib/aggregate";
import { formatCompactUSD, formatDuration, formatInteger } from "@/lib/format";
import { network } from "@/lib/network";
import { useAppStore } from "@/store/transactionStore";
import { AnimatedNumber } from "@/components/ui/Primitives";
import { SimulatedBadge } from "./Navbar";

function Stat({ label, short, value, format }: { label: string; short?: string; value: number; format: (v: number) => string }) {
  return (
    <div className="min-w-0 flex-1 text-center lg:flex-none lg:px-7 lg:first:pl-0 lg:last:pr-0">
      <AnimatedNumber value={value} format={format} className="block text-lg leading-7 font-medium tracking-tight sm:text-2xl sm:leading-8 lg:text-3xl lg:leading-9" />
      <div className="stat-label mt-0.5 truncate !text-[10px] sm:!text-[11px]">
        <span className={short ? "hidden sm:inline" : undefined}>{label}</span>
        {short ? <span className="sm:hidden">{short}</span> : null}
      </div>
    </div>
  );
}

export function StatsBar() {
  const revision = useAppStore((state) => state.revision);
  const filters = useAppStore((state) => state.filters);
  const activeRoutes = useAppStore((state) => state.activeRoutes);

  // `revision` stands in for the aggregates, which mutate in place.
  const totals = useMemo(
    () => (revision === 0 ? EMPTY_AGGREGATOR : network.aggregator).totals(filters),
    [revision, filters],
  );

  return (
    <section
      aria-label="Session totals for the simulated network"
      className="pointer-events-none absolute inset-x-0 top-14 z-10 flex flex-col items-center gap-2 px-3 [text-shadow:0_1px_12px_#05070d] lg:top-14 lg:right-[372px]"
    >
      <span className="sm:hidden">
        <SimulatedBadge />
      </span>
      <div className="flex w-full justify-center divide-x divide-line">
        <Stat label="Total Volume" value={totals.volumeUSD} format={formatCompactUSD} />
        <Stat label="Transactions" value={totals.count} format={formatInteger} />
        <Stat label="Active Routes" value={activeRoutes} format={formatInteger} />
        <Stat label="Average Settlement" short="Settlement" value={averageSettlementMs(totals)} format={formatDuration} />
      </div>
    </section>
  );
}
