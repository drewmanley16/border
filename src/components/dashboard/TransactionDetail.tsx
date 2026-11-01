"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { clearSelection } from "@/lib/actions";
import type { City } from "@/lib/cities";
import { flagEmoji, formatClock, formatCompactUSD, formatDuration, formatInteger, formatUSD } from "@/lib/format";
import { network } from "@/lib/network";
import { useAppStore } from "@/store/transactionStore";
import type { StablecoinTransaction } from "@/types/transaction";
import { CoinDot, IconButton, StatusText } from "@/components/ui/Primitives";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-ink-2">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(id).then(() => {
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="flex max-w-full items-center gap-1.5 rounded text-ink-2 transition-colors hover:text-ink"
    >
      <span className="truncate">{id}</span>
      {copied ? <Check className="size-3.5 shrink-0 text-green" aria-hidden /> : <Copy className="size-3.5 shrink-0" aria-hidden />}
      <span className="sr-only" role="status">
        {copied ? "Copied transaction ID" : "Copy transaction ID"}
      </span>
    </button>
  );
}

function PaymentCard({ tx }: { tx: StablecoinTransaction }) {
  return (
    <>
      <p className="pr-8 text-sm text-ink-2">
        {flagEmoji(tx.origin.countryCode)} {tx.origin.city} → {flagEmoji(tx.destination.countryCode)} {tx.destination.city}
      </p>
      <p className="mt-1 flex items-center gap-2 text-2xl font-medium tracking-tight">
        {formatUSD(tx.amountUSD)}
        <span className="flex items-center gap-1.5 text-sm font-normal text-ink-2">
          <CoinDot coin={tx.stablecoin} />
          {tx.stablecoin}
        </span>
      </p>
      <dl className="mt-3 space-y-1">
        <Field label="Blockchain">{tx.chain}</Field>
        <Field label="Status"><StatusText status={tx.status} /></Field>
        <Field label="Settlement">{tx.settlementTimeMs ? formatDuration(tx.settlementTimeMs) : "—"}</Field>
        <Field label="Submitted">{formatClock(tx.timestamp)}</Field>
        <Field label="ID"><CopyId id={tx.id} /></Field>
      </dl>
      <p className="mt-3 text-xs text-ink-2">Simulated payment, not a real transfer.</p>
    </>
  );
}

function CityCard({ city }: { city: City }) {
  const revision = useAppStore((state) => state.revision);
  // `revision` stands in for the aggregates, which mutate in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activity = useMemo(() => network.aggregator.city(city.city), [city, revision]);
  return (
    <>
      <p className="pr-8 text-2xl font-medium tracking-tight">
        {flagEmoji(city.countryCode)} {city.city}
      </p>
      <p className="text-sm text-ink-2">{city.country}. Showing its busiest routes.</p>
      <dl className="mt-3 space-y-1">
        <Field label="Simulated sent">{formatInteger(activity.sent)}</Field>
        <Field label="Simulated received">{formatInteger(activity.received)}</Field>
        <Field label="Simulated volume">{formatCompactUSD(activity.volumeUSD)}</Field>
      </dl>
    </>
  );
}

export function TransactionDetail() {
  const tx = useAppStore((state) => state.selectedTx);
  const city = useAppStore((state) => state.focusedCity);
  const key = tx?.id ?? city?.id;

  return (
    <AnimatePresence mode="wait">
      {key ? (
        <motion.section
          key={key}
          aria-label={tx ? "Selected transaction" : "Selected city"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className="glass absolute inset-x-3 bottom-[calc(112px+env(safe-area-inset-bottom))] z-20 rounded-xl p-3.5 sm:right-auto sm:w-72 lg:bottom-4 lg:left-4"
        >
          <span className="absolute top-1.5 right-1.5">
            <IconButton label="Close details" onClick={clearSelection}>
              <X className="size-4" />
            </IconButton>
          </span>
          {tx ? <PaymentCard tx={tx} /> : city ? <CityCard city={city} /> : null}
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
