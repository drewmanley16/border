"use client";

import type { CorridorRow, CountryRow } from "@/lib/aggregate";
import { flagEmoji, formatClock, formatCompactUSD, formatInteger, formatUSDWhole } from "@/lib/format";
import { CoinDot } from "@/components/ui/Primitives";
import type { StablecoinTransaction } from "@/types/transaction";

const HEAD = "pb-2 text-left text-xs font-normal text-ink-2";
const NUM = "text-right";
const ROW = "border-t border-line";
const CELL = "py-2 pr-3 last:pr-0";

export function CorridorTable({ rows }: { rows: CorridorRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className={HEAD}>Corridor</th>
          <th className={`${HEAD} ${NUM}`}>Transfers</th>
          <th className={`${HEAD} ${NUM}`}>Volume</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.origin.city}>${row.destination.city}`} className={ROW}>
            <td className={CELL}>
              {flagEmoji(row.origin.countryCode)} {row.origin.city} → {flagEmoji(row.destination.countryCode)} {row.destination.city}
            </td>
            <td className={`${CELL} ${NUM} text-ink-2`}>{formatInteger(row.count)}</td>
            <td className={`${CELL} ${NUM}`}>{formatCompactUSD(row.volumeUSD)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LargestTable({ rows }: { rows: StablecoinTransaction[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className={HEAD}>Amount</th>
          <th className={HEAD}>Route</th>
          <th className={`${HEAD} ${NUM}`}>Time</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((tx) => (
          <tr key={tx.id} className={ROW}>
            <td className={`${CELL} whitespace-nowrap`}>
              <span className="flex items-center gap-2">
                <CoinDot coin={tx.stablecoin} />
                {formatUSDWhole(tx.amountUSD)}
              </span>
            </td>
            <td className={`${CELL} text-ink-2`}>
              {tx.origin.city} → {tx.destination.city}
            </td>
            <td className={`${CELL} ${NUM} whitespace-nowrap text-ink-2`}>{formatClock(tx.timestamp)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GeographyTable({ rows }: { rows: CountryRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className={HEAD}>Country</th>
          <th className={`${HEAD} ${NUM}`}>Sent</th>
          <th className={`${HEAD} ${NUM}`}>Received</th>
          <th className={`${HEAD} ${NUM}`}>Volume</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.countryCode} className={ROW}>
            <td className={CELL}>
              {flagEmoji(row.countryCode)} {row.country}
            </td>
            <td className={`${CELL} ${NUM} text-ink-2`}>{formatInteger(row.sent)}</td>
            <td className={`${CELL} ${NUM} text-ink-2`}>{formatInteger(row.received)}</td>
            <td className={`${CELL} ${NUM}`}>{formatCompactUSD(row.volumeUSD)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
