"use client";

import type { Totals } from "@/lib/aggregate";
import { COIN_COLORS, STABLECOINS } from "@/lib/constants";
import { formatCompactUSD } from "@/lib/format";
import { CoinDot } from "@/components/ui/Primitives";
import type { Stablecoin } from "@/types/transaction";

export function CoinShare({ byCoin }: { byCoin: Record<Stablecoin, Totals> }) {
  const total = STABLECOINS.reduce((sum, coin) => sum + byCoin[coin].volumeUSD, 0);
  const share = (coin: Stablecoin) => (total === 0 ? 0 : (byCoin[coin].volumeUSD / total) * 100);
  return (
    <>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-white/6" role="img" aria-label="Share of simulated volume by stablecoin">
        {STABLECOINS.map((coin) => (
          <span
            key={coin}
            title={`${coin}: ${share(coin).toFixed(1)}%`}
            className="block h-full transition-[width] duration-500"
            style={{ width: `${share(coin)}%`, backgroundColor: COIN_COLORS[coin] }}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {STABLECOINS.map((coin) => (
          <li key={coin} className="flex items-center gap-2">
            <CoinDot coin={coin} />
            {coin}
            <span className="ml-auto text-ink-2">{formatCompactUSD(byCoin[coin].volumeUSD)}</span>
            <span className="w-14 text-right">{share(coin).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}
