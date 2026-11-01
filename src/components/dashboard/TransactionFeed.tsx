"use client";

import { memo, useMemo, useState } from "react";
import { ChevronUp } from "lucide-react";
import { motion } from "motion/react";
import { selectTransaction } from "@/lib/actions";
import { FEED_VISIBLE, WHALE_USD } from "@/lib/constants";
import { flagEmoji, formatAgo, formatUSD } from "@/lib/format";
import { matchesFilters, useAppStore } from "@/store/transactionStore";
import type { StablecoinTransaction } from "@/types/transaction";
import { CoinDot, StatusText, useSecondClock } from "@/components/ui/Primitives";

const ROW_HEIGHT = 80;

function Ago({ timestamp }: { timestamp: number }) {
  const now = useSecondClock();
  return <>{now === 0 ? "now" : formatAgo(timestamp, now)}</>;
}

const FeedRow = memo(function FeedRow({
  tx,
  selected,
  onPick,
}: {
  tx: StablecoinTransaction;
  selected: boolean;
  onPick: (tx: StablecoinTransaction) => void;
}) {
  const reducedMotion = useAppStore((state) => state.reducedMotion);
  const whale = tx.amountUSD >= WHALE_USD;

  return (
    <motion.li
      initial={reducedMotion ? false : { height: 0, opacity: 0 }}
      animate={{ height: ROW_HEIGHT, opacity: 1 }}
      transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
      className="overflow-hidden"
    >
      <button
        type="button"
        onClick={() => onPick(tx)}
        aria-pressed={selected}
        className={`block h-20 w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/6 ${
          selected ? "bg-white/10" : ""
        }`}
      >
        <span className="block truncate text-[13px] text-ink-2">
          {flagEmoji(tx.origin.countryCode)} {tx.origin.city}
          <span aria-label=" to "> → </span>
          {flagEmoji(tx.destination.countryCode)} {tx.destination.city}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[15px] font-medium">
          <CoinDot coin={tx.stablecoin} />
          {formatUSD(tx.amountUSD)} <span className="font-normal text-ink-2">{tx.stablecoin}</span>
          {whale ? <span className="ml-auto text-xs font-normal text-gold">Large transfer</span> : null}
        </span>
        <span className="mt-0.5 block text-xs text-ink-2">
          {tx.chain} · <StatusText status={tx.status} /> · <Ago timestamp={tx.timestamp} />
        </span>
      </button>
    </motion.li>
  );
});

export function TransactionFeed() {
  const feed = useAppStore((state) => state.feed);
  const filters = useAppStore((state) => state.filters);
  const selectedId = useAppStore((state) => state.selectedTx?.id);
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const matching: StablecoinTransaction[] = [];
    for (const tx of feed) {
      if (matchesFilters(tx, filters)) matching.push(tx);
      if (matching.length === FEED_VISIBLE) break;
    }
    return matching;
  }, [feed, filters]);

  const pick = useMemo(
    () => (tx: StablecoinTransaction) => {
      setOpen(false);
      selectTransaction(tx);
    },
    [],
  );

  return (
    <aside
      aria-label="Live Transactions"
      className={`glass absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-b-0 transition-[height] duration-300 lg:top-16 lg:right-4 lg:bottom-4 lg:left-auto lg:h-auto lg:w-[340px] lg:rounded-2xl lg:border-b ${
        open ? "h-[58dvh]" : "h-[calc(52px+env(safe-area-inset-bottom))]"
      }`}
    >
      <h2 className="sr-only">Live Transactions</h2>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-[52px] shrink-0 items-center justify-between px-4 text-sm font-medium lg:pointer-events-none"
      >
        Live Transactions
        <ChevronUp className={`size-4 text-ink-2 transition-transform lg:hidden ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm leading-6 text-ink-2">
          {feed.length === 0
            ? "Waiting for the first transaction."
            : "No transactions match these filters. Turn on a stablecoin and a chain to see some."}
        </p>
      ) : (
        <ul className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1">
          {rows.map((tx) => (
            <FeedRow key={tx.id} tx={tx} selected={tx.id === selectedId} onPick={pick} />
          ))}
        </ul>
      )}
    </aside>
  );
}
