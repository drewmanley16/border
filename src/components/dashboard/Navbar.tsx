"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Globe2, Info, Settings2 } from "lucide-react";
import { summarizeActivity } from "@/lib/liveData";
import { useAppStore } from "@/store/appStore";
import { useLiveStore } from "@/store/liveStore";
import { IconButton, usePopover } from "@/components/ui/Primitives";

export const LINKS = [
  { href: "/", label: "Globe", icon: Globe2 },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/about", label: "About", icon: Info },
] as const;

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="11" stroke="#38BDF8" strokeOpacity=".4" />
      <ellipse cx="16" cy="16" rx="5" ry="11" stroke="#38BDF8" strokeOpacity=".25" />
      <path d="M7 21C11 11 19 7 28 7" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
      <circle cx="28" cy="7" r="2.5" fill="#F8FAFC" />
    </svg>
  );
}

export function DataBadge() {
  const live = useLiveStore((state) => summarizeActivity(state.activity).isLive);
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${live ? "border-green/30 bg-green/8 text-green" : "border-line text-ink-2"}`}>
      <span className={`size-1.5 rounded-full ${live ? "live-dot bg-green" : "bg-ink-3"}`} />
      {live ? "LIVE ONCHAIN DATA" : "NO LIVE DATA"}
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

export function Settings() {
  const { open, setOpen, root } = usePopover();
  const autoRotate = useAppStore((state) => state.autoRotate);
  const bloomOn = useAppStore((state) => state.bloomOn);

  return (
    <div ref={root} className="relative">
      <IconButton label="Settings" pressed={open} onClick={() => setOpen(!open)}>
        <Settings2 className="size-[18px]" />
      </IconButton>
      {open ? (
        <div className="glass absolute top-11 right-0 w-56 rounded-xl p-3 lg:top-auto lg:right-auto lg:bottom-0 lg:left-14 lg:!bg-void">
          <Toggle label="Rotate globe" on={autoRotate} onChange={(on) => useAppStore.setState({ autoRotate: on })} />
          <Toggle label="Glow" on={bloomOn} onChange={(on) => useAppStore.setState({ bloomOn: on })} />
        </div>
      ) : null}
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 px-3 sm:px-4 lg:hidden">
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
          <DataBadge />
        </span>
        <Settings />
      </div>
    </header>
  );
}
