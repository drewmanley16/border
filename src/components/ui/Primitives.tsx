"use client";

import { memo, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { COIN_COLORS } from "@/lib/constants";
import type { Stablecoin, TransactionStatus } from "@/types/transaction";
import { useAppStore } from "@/store/transactionStore";

/** Tweens to `value` by writing to the DOM, so it never re-renders React. */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const formatRef = useRef(format);

  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const from = shown.current;
    if (useAppStore.getState().reducedMotion) {
      shown.current = value;
      node.textContent = formatRef.current(value);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 420);
      const eased = 1 - Math.pow(1 - progress, 3);
      shown.current = from + (value - from) * eased;
      node.textContent = formatRef.current(shown.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span ref={element} className={className}>
      {format(value)}
    </span>
  );
}

export function CoinDot({ coin, className = "" }: { coin: Stablecoin; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: COIN_COLORS[coin] }}
    />
  );
}

const STATUS_STYLE: Record<TransactionStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "text-ink-2" },
  settled: { label: "Settled", className: "text-ink-2" },
  failed: { label: "Failed", className: "text-danger" },
};

export const StatusText = memo(function StatusText({ status }: { status: TransactionStatus }) {
  const { label, className } = STATUS_STYLE[status];
  return <span className={className}>{label}</span>;
});

const listeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;
let clockValue = 0;

function subscribeClock(listener: () => void) {
  listeners.add(listener);
  if (!clockTimer) {
    clockValue = Date.now();
    clockTimer = setInterval(() => {
      clockValue = Date.now();
      for (const notify of listeners) notify();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** A clock shared by every relative timestamp, ticking once a second. */
export function useSecondClock(): number {
  return useSyncExternalStore(subscribeClock, () => clockValue, () => 0);
}

/** Closes a popover on an outside press or Escape. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPress = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPress);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPress);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, root };
}

export function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`grid size-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-white/8 ${
        pressed ? "text-cyan" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
