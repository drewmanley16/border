"use client";

import { useMemo } from "react";
import { formatAgo } from "@/lib/format";
import { shortAddress, summarizeActivity, type ChainTransfer } from "@/lib/liveData";
import { useLiveStore } from "@/store/liveStore";
import { CoinDot, useSecondClock } from "@/components/ui/Primitives";

const amountFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SHOWN = 30;
const transferKey = (t: ChainTransfer) => `${t.txHash}:${t.from}:${t.to}:${t.amount}`;

function Row({ transfer, selected, onPick }: { transfer: ChainTransfer; selected: boolean; onPick: () => void }) {
  const now = useSecondClock();
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={selected}
        className={`block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/6 ${selected ? "bg-white/10" : ""}`}
      >
        <span className="flex items-center gap-2">
          <CoinDot coin={transfer.coin} />
          <span className="truncate font-mono text-sm font-medium">{amountFormat.format(Number(transfer.amount))}</span>
          <span className="text-[13px] text-ink-2">{transfer.coin}</span>
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-2">
          {shortAddress(transfer.from)} → {shortAddress(transfer.to)}
        </span>
        <span className="mt-0.5 block text-[11px] text-ink-3">
          {transfer.chain} · {transfer.timestamp && now !== 0 ? formatAgo(new Date(transfer.timestamp).getTime(), now) : `block ${transfer.blockNumber}`}
        </span>
      </button>
    </li>
  );
}

function Freshness() {
  const loadedAt = useLiveStore((state) => state.loadedAt);
  const failed = useLiveStore((state) => state.failed);
  const now = useSecondClock();
  if (loadedAt === null || now === 0) return null;
  return (
    <p className={`px-3 pt-2 text-[11px] ${failed ? "text-gold" : "text-ink-3"}`}>
      {failed ? "Refresh failed. " : ""}Loaded {formatAgo(loadedAt, now)}, refreshes every 5 min
    </p>
  );
}

export function TransferFeed({ selected, onSelect }: { selected: ChainTransfer | null; onSelect: (transfer: ChainTransfer) => void }) {
  const activity = useLiveStore((state) => state.activity);
  const loadedAt = useLiveStore((state) => state.loadedAt);
  const failed = useLiveStore((state) => state.failed);
  const transfers = useMemo(() => summarizeActivity(activity).transfers.slice(0, SHOWN), [activity]);

  return (
    <>
      {transfers.length > 0 ? (
        <ul>
          {transfers.map((transfer, index) => {
            const key = transferKey(transfer);
            // One transaction can hold identical transfers, so the key needs the position.
            return <Row key={`${key}:${index}`} transfer={transfer} selected={selected !== null && transferKey(selected) === key} onPick={() => onSelect(transfer)} />;
          })}
        </ul>
      ) : (
        <p className="px-3 py-2 text-sm leading-6 text-ink-2">
          {loadedAt === null && !failed ? "Reading recent blocks." : "No chain data right now. Nothing is shown until a real reading arrives."}
        </p>
      )}
      <Freshness />
      <p className="px-3 pt-1 text-[11px] leading-4 text-ink-3">
        Ethereum and Base. Includes exchange and contract movements, so a transfer isn’t always a payment.
      </p>
    </>
  );
}
