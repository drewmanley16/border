"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { averageSettlementMs, EMPTY_AGGREGATOR } from "@/lib/aggregate";
import { COIN_COLORS, STABLECOINS } from "@/lib/constants";
import { formatCompactUSD, formatDuration, formatInteger } from "@/lib/format";
import { network } from "@/lib/network";
import { useAppStore } from "@/store/transactionStore";
import { ChainCounts, ChainSettlement } from "./ChainBreakdown";
import { CoinShare } from "./CoinShare";
import { CorridorTable, GeographyTable, LargestTable } from "./CorridorTable";
import { VolumeChart } from "./VolumeChart";

const REFRESH_MS = 2000;

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-navy/70 p-5 ${className}`}>
      <h2 className="mb-4 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Headline({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-3xl font-medium tracking-tight">{value}</p>
      <p className="stat-label mt-1">{label}</p>
    </div>
  );
}

const EMPTY = "No transfers have settled yet.";

export function AnalyticsView() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let last = 0;
    const refresh = () => {
      const now = performance.now();
      if (now - last < REFRESH_MS) return;
      last = now;
      setTick((value) => value + 1);
    };
    refresh();
    return useAppStore.subscribe(refresh);
  }, []);

  const data = useMemo(() => {
    const aggregator = tick === 0 ? EMPTY_AGGREGATOR : network.aggregator;
    return {
      totals: aggregator.totals(),
      byCoin: aggregator.byCoin(),
      byChain: aggregator.byChain(),
      timeline: aggregator.timeline(),
      corridors: aggregator.corridors(8),
      largest: aggregator.largest().slice(0, 8),
      countries: aggregator.countries(10),
    };
    // `tick` stands in for the aggregates, which mutate in place.
  }, [tick]);

  const { totals } = data;
  const failureRate = totals.count === 0 ? 0 : (totals.failed / totals.count) * 100;

  return (
    <main className="relative z-10 mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6">
      <h1 className="text-2xl font-medium tracking-tight">Simulated network analytics</h1>
      <p className="mt-1 max-w-prose text-sm leading-6 text-ink-2">
        Every figure is calculated from transactions generated in your browser this session. None of
        them describe real payments.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Headline label="Simulated volume" value={formatCompactUSD(totals.volumeUSD)} />
        <Headline label="Simulated transactions" value={formatInteger(totals.count)} />
        <Headline label="Average settlement" value={formatDuration(averageSettlementMs(totals))} />
        <Headline label="Failure rate" value={`${failureRate.toFixed(1)}%`} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Panel title="Settled volume over time" className="lg:col-span-2">
          <ul className="-mt-2 mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
            {STABLECOINS.map((coin) => (
              <li key={coin} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: COIN_COLORS[coin] }} aria-hidden />
                {coin}
              </li>
            ))}
          </ul>
          <VolumeChart data={data.timeline} />
        </Panel>
        <Panel title="Stablecoin share of volume">
          <CoinShare byCoin={data.byCoin} />
        </Panel>
        <Panel title="Transactions by blockchain">
          <ChainCounts byChain={data.byChain} />
        </Panel>
        <Panel title="Average settlement by blockchain">
          <ChainSettlement byChain={data.byChain} />
        </Panel>
        <Panel title="Top corridors by volume">
          {data.corridors.length ? <CorridorTable rows={data.corridors.slice(0, 5)} /> : <p className="text-sm text-ink-2">{EMPTY}</p>}
        </Panel>
        <Panel title="Largest transfers" className="lg:col-span-2">
          {data.largest.length ? <LargestTable rows={data.largest} /> : <p className="text-sm text-ink-2">{EMPTY}</p>}
        </Panel>
        <Panel title="Activity by country">
          {data.countries.length ? <GeographyTable rows={data.countries.slice(0, 8)} /> : <p className="text-sm text-ink-2">{EMPTY}</p>}
        </Panel>
      </div>
    </main>
  );
}
