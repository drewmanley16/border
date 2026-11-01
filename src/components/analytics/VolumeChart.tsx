"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimeBucket } from "@/lib/aggregate";
import { COIN_COLORS, STABLECOINS } from "@/lib/constants";
import { formatClock, formatCompactUSD, formatUSDWhole } from "@/lib/format";
import { CoinDot } from "@/components/ui/Primitives";
import type { Stablecoin } from "@/types/transaction";

interface TooltipEntry {
  dataKey?: unknown;
  value?: unknown;
}

function VolumeTooltip({ active, payload, label }: { active?: boolean; payload?: readonly TooltipEntry[]; label?: unknown }) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].reverse();
  const total = rows.reduce((sum, row) => sum + Number(row.value), 0);
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs">
      <p className="text-ink-2">{formatClock(Number(label))}</p>
      <p className="mt-0.5 text-sm font-medium">{formatUSDWhole(total)}</p>
      {rows.map((row) => (
        <p key={String(row.dataKey)} className="mt-0.5 flex items-center gap-1.5 text-ink-2">
          <CoinDot coin={row.dataKey as Stablecoin} />
          {String(row.dataKey)}
          <span className="ml-auto pl-4 text-ink">{formatUSDWhole(Number(row.value))}</span>
        </p>
      ))}
    </div>
  );
}

export function VolumeChart({ data }: { data: TimeBucket[] }) {
  if (data.length < 2) {
    return <p className="grid h-64 place-items-center text-sm text-ink-2">The chart fills in after a few seconds of traffic.</p>;
  }
  return (
    <div className="h-64" role="img" aria-label="Stacked area chart of simulated settled volume by stablecoin in five-second intervals">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="rgb(148 163 184 / 0.1)" />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value: number) => formatClock(value)}
            tick={{ fill: "#94A3B8", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={72}
          />
          <YAxis
            tickFormatter={formatCompactUSD}
            tick={{ fill: "#94A3B8", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={54}
          />
          <Tooltip content={VolumeTooltip} cursor={{ stroke: "rgb(148 163 184 / 0.4)" }} isAnimationActive={false} />
          {STABLECOINS.map((coin) => (
            <Area
              key={coin}
              dataKey={coin}
              stackId="volume"
              type="monotone"
              stroke={COIN_COLORS[coin]}
              strokeWidth={1.5}
              fill={COIN_COLORS[coin]}
              fillOpacity={0.26}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
