"use client";

import { useMemo } from "react";
import { formatCompactUSD, formatInteger } from "@/lib/format";
import { formatNetworkFee, summarizeActivity, type Coin } from "@/lib/liveData";
import { useLiveStore } from "@/store/liveStore";

const COINS: Coin[] = ["USDC", "USDT"];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-navy/70 p-5">
      <h2 className="stat-label">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Empty = () => <p className="text-sm text-ink-2">No chain data right now.</p>;

export function AnalyticsView() {
  const activity = useLiveStore((state) => state.activity);
  const conditions = useLiveStore((state) => state.conditions);
  const summary = useMemo(() => summarizeActivity(activity), [activity]);
  const live = activity.filter((chain) => chain.status === "live");
  const measured = conditions.filter((row) => row.feeUSD !== null);

  return (
    <main className="relative z-10 mx-auto min-h-dvh max-w-4xl px-5 pt-24 pb-16 lg:pl-[92px]">
      <h1 className="text-3xl font-medium tracking-tight">Analytics</h1>
      <p className="mt-2 text-sm leading-6 text-ink-2">
        Measured from the latest block sample. Figures replace each other on refresh, so this is a snapshot and not a history or a market total.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card title="By chain">
          {live.length === 0 ? <Empty /> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr><th className="pb-2 font-normal">Chain</th><th className="pb-2 text-right font-normal">Transfers</th><th className="pb-2 text-right font-normal">Moved</th><th className="pb-2 text-right font-normal">Blocks</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {live.map((chain) => (
                  <tr key={chain.chain} className="border-t border-line">
                    <td className="py-2">{chain.chain}</td>
                    <td className="py-2 text-right">{formatInteger(chain.transferCount ?? 0)}</td>
                    <td className="py-2 text-right">{formatCompactUSD(COINS.reduce((sum, coin) => sum + Number(chain.volumeByCoin[coin] ?? 0), 0))}</td>
                    <td className="py-2 text-right text-ink-2">{(chain.toBlock ?? 0) - (chain.fromBlock ?? 0) + 1} in {chain.windowSeconds}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="By stablecoin">
          {!summary.isLive || summary.volume === 0 ? <Empty /> : (
            <div className="space-y-3">
              {COINS.map((coin) => {
                const share = summary.volumeByCoin[coin] / summary.volume;
                return (
                  <div key={coin}>
                    <div className="flex justify-between text-sm"><span>{coin}</span><span className="tabular-nums text-ink-2">{formatCompactUSD(summary.volumeByCoin[coin])} · {(share * 100).toFixed(0)}%</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div className={`h-full rounded-full ${coin === "USDC" ? "bg-blue" : "bg-green"}`} style={{ width: `${share * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Cost of a USDC transfer">
          {measured.length === 0 ? <Empty /> : (
            <dl className="space-y-2 text-sm">
              {measured.map((row) => (
                <div key={row.network} className="flex justify-between">
                  <dt className="text-ink-2">{row.network}</dt>
                  <dd className="tabular-nums">{formatNetworkFee(row.feeUSD!)} · {row.estimatedDurationSeconds}s</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>

        <Card title="Reading these numbers">
          <p className="text-sm leading-6 text-ink-2">
            Volume counts every token transfer in the sample, including exchange and contract hops, so one payment can appear more than once. Tokens are valued at $1. Solana shows fees only, and USDT on Base isn’t included.
          </p>
        </Card>
      </div>
    </main>
  );
}
