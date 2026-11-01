"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Globe2, Info, Settings2 } from "lucide-react";
import { network } from "@/lib/network";
import { unlockSound } from "@/lib/sound";
import { useAppStore } from "@/store/transactionStore";
import { IconButton, usePopover } from "@/components/ui/Primitives";

const LINKS = [
  { href: "/", label: "Globe", icon: Globe2 },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/about", label: "About", icon: Info },
] as const;

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="11" stroke="#38BDF8" strokeOpacity=".4" />
      <ellipse cx="16" cy="16" rx="5" ry="11" stroke="#38BDF8" strokeOpacity=".25" />
      <path d="M7 21C11 11 19 7 28 7" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
      <circle cx="28" cy="7" r="2.5" fill="#F8FAFC" />
    </svg>
  );
}

export function SimulatedBadge() {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-cyan/30 bg-cyan/8 px-2.5 py-1 text-[11px] font-medium tracking-wide text-cyan">
      <span className="live-dot size-1.5 rounded-full bg-cyan" />
      SIMULATED LIVE NETWORK
    </span>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 py-1.5 text-sm">
      {label}
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-5 w-9 rounded-full bg-white/12 transition-colors peer-checked:bg-blue peer-focus-visible:outline-2 peer-focus-visible:outline-cyan after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-ink after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}

function Settings() {
  const { open, setOpen, root } = usePopover();
  const soundOn = useAppStore((state) => state.soundOn);
  const bloomOn = useAppStore((state) => state.bloomOn);
  const seed = useAppStore((state) => state.seed);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(seed);
  const parsed = Number(value);
  const valid = value !== "" && Number.isInteger(parsed) && parsed >= 0;

  return (
    <div ref={root} className="relative">
      <IconButton label="Settings" pressed={open} onClick={() => setOpen(!open)}>
        <Settings2 className="size-[18px]" />
      </IconButton>
      {open ? (
        <div className="glass absolute top-11 right-0 w-64 rounded-xl p-3">
          <Toggle
            label="Arrival sounds"
            on={soundOn}
            onChange={(on) => {
              if (on) unlockSound();
              useAppStore.setState({ soundOn: on });
            }}
          />
          <Toggle label="Glow" on={bloomOn} onChange={(on) => useAppStore.setState({ bloomOn: on })} />
          <form
            className="mt-2 border-t border-line pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid) return;
              network.restart(parsed);
              setDraft(null);
              setOpen(false);
            }}
          >
            <label htmlFor="seed" className="text-sm">
              Simulation seed
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="seed"
                inputMode="numeric"
                value={value}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-line bg-void/60 px-2.5 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={!valid}
                className="shrink-0 rounded-lg bg-white/10 px-2.5 text-sm transition-colors hover:bg-white/16 disabled:opacity-40"
              >
                Restart
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-2">Restarting clears this session. A seed always replays the same transactions.</p>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 px-3 sm:px-4">
      <Link href="/" className="pointer-events-auto flex items-center gap-2 rounded-lg" aria-label="StableFlow home">
        <Logo />
        <span className="text-[15px] font-medium tracking-tight">StableFlow</span>
      </Link>

      <nav aria-label="Views" className="pointer-events-auto ml-auto flex items-center gap-0.5 sm:ml-5">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const current = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              aria-label={label}
              className={`flex h-9 items-center rounded-lg px-2.5 text-sm transition-colors hover:text-ink ${
                current ? "bg-white/8 text-ink" : "text-ink-2"
              }`}
            >
              <Icon className="size-[18px] md:hidden" aria-hidden />
              <span className="hidden md:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="pointer-events-auto flex items-center gap-2 sm:ml-auto">
        <span className="hidden sm:inline-flex">
          <SimulatedBadge />
        </span>
        <Settings />
      </div>
    </header>
  );
}
