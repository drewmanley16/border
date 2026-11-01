"use client";

import { CHAINS } from "@/lib/constants";
import type { Totals } from "@/lib/aggregate";
import { averageSettlementMs } from "@/lib/aggregate";
import { formatDuration, formatInteger } from "@/lib/format";
import type { Chain } from "@/types/transaction";

function Bars({ rows }: { rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map(({ label, value, display }) => (
        <li key={label} title={`${label}: ${display}`} className="grid grid-cols-[72px_1fr_56px] items-center gap-3 text-sm">
          <span className="text-ink-2">{label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-white/6">
            <span className="block h-full rounded-full bg-cyan transition-[width] duration-500" style={{ width: `${(value / max) * 100}%` }} />
          </span>
          <span className="text-right">{display}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChainCounts({ byChain }: { byChain: Record<Chain, Totals> }) {
  return (
    <Bars
      rows={CHAINS.map((chain) => ({
        label: chain,
        value: byChain[chain].count,
        display: formatInteger(byChain[chain].count),
      })).sort((a, b) => b.value - a.value)}
    />
  );
}

export function ChainSettlement({ byChain }: { byChain: Record<Chain, Totals> }) {
  return (
    <Bars
      rows={CHAINS.map((chain) => {
        const average = averageSettlementMs(byChain[chain]);
        return { label: chain, value: average, display: formatDuration(average) };
      }).sort((a, b) => a.value - b.value)}
    />
  );
}
