"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { addressUrl, txUrl, type ChainTransfer } from "@/lib/liveData";
import { CoinDot, IconButton } from "@/components/ui/Primitives";

const amountFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 text-ink-3 transition-colors hover:text-ink"
    >
      {copied ? <Check aria-hidden className="size-3.5 text-green" /> : <Copy aria-hidden className="size-3.5" />}
    </button>
  );
}

function Field({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div>
      <dt className="stat-label">{label}</dt>
      <dd className="mt-1 flex items-start gap-2">
        <a href={href} target="_blank" rel="noreferrer" className="min-w-0 font-mono text-xs leading-5 break-all text-ink hover:text-cyan">
          {value}
        </a>
        <CopyButton value={value} label={label.toLowerCase()} />
      </dd>
    </div>
  );
}

export function TransferDetail({ transfer, onClose }: { transfer: ChainTransfer; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { chain, coin, timestamp } = transfer;
  return (
    <section aria-label="Transfer details" className="glass absolute z-20 overflow-y-auto !bg-void p-4 max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[80dvh] max-lg:rounded-t-2xl lg:bottom-4 lg:left-[calc(var(--left-inset)+1rem)] lg:w-[min(400px,calc(100vw-var(--left-inset)-var(--right-inset)-2rem))] lg:rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-2xl font-medium tracking-tight tabular-nums">
            <CoinDot coin={coin} />
            {amountFormat.format(Number(transfer.amount))}
            <span className="text-base font-normal text-ink-2">{coin}</span>
          </p>
          <p className="mt-1 text-[13px] text-ink-2">
            {chain} · block {transfer.blockNumber.toLocaleString("en-US")}
            {timestamp ? ` · ${new Date(timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" })}` : ""}
          </p>
        </div>
        <IconButton label="Close details" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <dl className="mt-4 space-y-3">
        <Field label="From" value={transfer.from} href={addressUrl(chain, transfer.from)} />
        <Field label="To" value={transfer.to} href={addressUrl(chain, transfer.to)} />
        <Field label="Transaction" value={transfer.txHash} href={txUrl(chain, transfer.txHash)} />
      </dl>
      <p className="mt-4 text-[11px] leading-4 text-ink-3">Not shown on the globe, because blockchains don’t record where senders and recipients are.</p>
      <a
        href={txUrl(chain, transfer.txHash)}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-cyan hover:underline"
      >
        View on {chain === "Ethereum" ? "Etherscan" : "Basescan"}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
    </section>
  );
}
