"use client";

import { useEffect, useState } from "react";
import { fetchFxHistory, type RatePoint } from "@/lib/liveData";

const WIDTH = 300;
const HEIGHT = 56;
const PAD = 4;
const rateFormat = (value: number) => value.toLocaleString("en-US", { maximumSignificantDigits: 5 });
const dateFormat = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** One series, so the title names it. Hover reads any day's published rate. */
export function RateChart({ from, to }: { from: string; to: string }) {
  const key = `${from}:${to}`;
  const [state, setState] = useState<{ key: string; points: RatePoint[] | null } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    if (from === to) return;
    const controller = new AbortController();
    fetchFxHistory(from, to, controller.signal)
      .then((points) => setState({ key, points }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, points: null });
      });
    return () => controller.abort();
  }, [from, to, key]);

  if (from === to) return null;
  const points = state?.key === key ? state.points : null;
  if (!points) return null;

  const rates = points.map((point) => point.rate);
  const low = Math.min(...rates);
  const high = Math.max(...rates);
  const span = high - low || 1;
  const x = (index: number) => PAD + (index / (points.length - 1)) * (WIDTH - PAD * 2);
  const y = (rate: number) => PAD + (1 - (rate - low) / span) * (HEIGHT - PAD * 2);
  const first = points[0]!;
  const last = points.at(-1)!;
  const change = ((last.rate - first.rate) / first.rate) * 100;
  const shown = hovered === null ? null : points[hovered]!;

  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="stat-label">{from} to {to}, 30 days</span>
        <span className="font-mono text-[11px] text-ink-2">
          {shown ? `${dateFormat(shown.date)}: ${rateFormat(shown.rate)}` : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-1.5 block w-full touch-none"
        role="img"
        aria-label={`${from} to ${to} moved from ${rateFormat(first.rate)} to ${rateFormat(last.rate)} between ${dateFormat(first.date)} and ${dateFormat(last.date)}, with a low of ${rateFormat(low)} and a high of ${rateFormat(high)}.`}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setHovered(Math.round(((event.clientX - box.left) / box.width) * (points.length - 1)));
        }}
        onPointerLeave={() => setHovered(null)}
      >
        <polyline points={points.map((point, index) => `${x(index)},${y(point.rate)}`).join(" ")} fill="none" stroke="var(--color-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {shown && hovered !== null ? (
          <>
            <line x1={x(hovered)} x2={x(hovered)} y1="0" y2={HEIGHT} stroke="var(--color-ink-3)" vectorEffect="non-scaling-stroke" />
            <circle cx={x(hovered)} cy={y(shown.rate)} r="4" fill="var(--color-cyan)" stroke="var(--color-void)" strokeWidth="2" />
          </>
        ) : null}
      </svg>
      <p className="mt-1 flex justify-between font-mono text-[10px] text-ink-3">
        <span>Low {rateFormat(low)}</span>
        <span>High {rateFormat(high)}</span>
      </p>
    </figure>
  );
}
