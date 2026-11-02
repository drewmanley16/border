"use client";

import { useMemo } from "react";
import { formatCompactUSD, formatInteger } from "@/lib/format";
import { summarizeActivity } from "@/lib/liveData";
import { useLiveStore } from "@/store/liveStore";
import { AnimatedNumber } from "@/components/ui/Primitives";

function Stat({ label, value, format }: { label: string; value: number | null; format: (v: number) => string }) {
  return (
    <div className="min-w-0 flex-1 text-center lg:flex-none lg:px-4 lg:first:pl-0 lg:last:pr-0 xl:px-7">
      {value === null ? (
        <span className="block text-lg leading-7 font-medium text-ink-3 sm:text-2xl sm:leading-8 xl:text-3xl xl:leading-9">—</span>
      ) : (
        <AnimatedNumber value={value} format={format} className="block font-mono text-lg leading-7 font-medium tracking-tight sm:text-2xl sm:leading-8 xl:text-3xl xl:leading-9" />
      )}
      <div className="stat-label mt-0.5 truncate !text-[10px] sm:!text-[11px]">{label}</div>
    </div>
  );
}

export function LiveStats() {
  const activity = useLiveStore((state) => state.activity);
  const summary = useMemo(() => summarizeActivity(activity), [activity]);
  const shown = summary.isLive ? summary : null;

  return (
    <section
      aria-label="Stablecoin transfers in the latest block sample"
      className="pointer-events-none absolute inset-x-0 top-14 z-10 flex flex-col items-center gap-1 px-3 [text-shadow:0_1px_12px_#05070d] transition-[left,right] duration-300 lg:right-[var(--right-inset)] lg:left-[var(--left-inset)]"
    >
      <div className="flex w-full justify-center divide-x divide-line">
        <Stat label="Moved" value={shown ? shown.volume : null} format={formatCompactUSD} />
        <Stat label="Transfers" value={shown ? shown.count : null} format={formatInteger} />
        <Stat label="Largest" value={shown ? shown.largest : null} format={formatCompactUSD} />
      </div>
      <p className="text-center text-[11px] text-ink-2">
        {shown ? `USDC and USDT in the latest ${shown.seconds} seconds of sampled blocks, at $1 per token` : "Waiting for chain data"}
      </p>
    </section>
  );
}
