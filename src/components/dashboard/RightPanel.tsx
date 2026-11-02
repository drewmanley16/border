"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeftRight, ChevronUp, Landmark, PanelRightClose, Route, type LucideIcon } from "lucide-react";
import type { Country } from "@/lib/countries";
import type { ChainTransfer } from "@/lib/liveData";
import { faceGlobe, useAppStore, type RightTab } from "@/store/appStore";
import { IconButton } from "@/components/ui/Primitives";
import { ChainTable } from "./ChainTable";
import { RailButton } from "./Rail";
import { TransferDetail } from "./TransferDetail";
import { TransferFeed } from "./TransferFeed";

const TABS: { id: RightTab; label: string; title: string; icon: LucideIcon }[] = [
  { id: "transfers", label: "Transfers", title: "Largest recent transfers", icon: ArrowLeftRight },
  { id: "paths", label: "Paths", title: "Blockchain paths", icon: Route },
  { id: "rails", label: "Rails", title: "Payment rails", icon: Landmark },
];

function Step({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <li className="group relative pb-4 pl-5 last:pb-0">
      <span aria-hidden className="absolute top-1.5 left-0 size-2 rounded-full bg-ink-3" />
      <span aria-hidden className="absolute top-3.5 bottom-[-6px] left-[3.5px] w-px bg-line group-last:hidden" />
      <p className="text-sm">{title}</p>
      <p className="text-[11px] leading-4 text-ink-3">{detail}</p>
      {children}
    </li>
  );
}

function Paths() {
  const from = useAppStore((state) => state.from);
  const to = useAppStore((state) => state.to);
  const firstRail = from.rails[0]!;
  const lastRail = to.rails[0]!;

  return (
    <div className="px-3">
      <ol>
        <Step title={`${from.currency} from ${from.name}`} detail={`${firstRail.name} · ${firstRail.speed} · fee set by bank`} />
        <Step title={`Buy USDC with ${from.currency}`} detail="Price not available yet" />
        <Step title="Send USDC onchain" detail="Live estimate, cheapest first">
          <ChainTable />
        </Step>
        <Step title={`Sell USDC for ${to.currency}`} detail="Price not available yet" />
        <Step title={`${to.currency} in ${to.name}`} detail={`${lastRail.name} · ${lastRail.speed} · fee set by bank`} />
      </ol>
      <p className="mt-5 text-[11px] leading-4 text-ink-3">
        A shape, not a quote. Only the onchain step is priced, so there’s no total cost or arrival time for a whole path yet. Rails shown are the fastest listed for each country.
      </p>
    </div>
  );
}

function RailList({ title, country, side }: { title: string; country: Country; side: "from" | "to" }) {
  const focusId = useAppStore((state) => state.focus?.id ?? null);
  return (
    <div>
      <h3 className="stat-label">{title}</h3>
      <ul className="mt-2 text-sm">
        {country.rails.map((rail) => {
          const id = `${side}:${rail.name}`;
          return (
            <li key={rail.name}>
              <button
                type="button"
                aria-pressed={focusId === id}
                onClick={() => {
                  useAppStore.setState({
                    focus: { id, kind: "rail", title: rail.name, detail: `Payment rail in ${country.name}, ${rail.speed.toLowerCase()}. Pin marks the capital.`, color: side === "from" ? "#38BDF8" : "#FBBF24" },
                  });
                  faceGlobe(country);
                }}
                className={`-mx-2 flex w-[calc(100%+1rem)] justify-between gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/8 ${focusId === id ? "bg-cyan/15" : ""}`}
              >
                <span className="min-w-0 truncate">{rail.name}</span>
                <span className="shrink-0 text-xs text-ink-3">{rail.speed}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Rails() {
  const from = useAppStore((state) => state.from);
  const to = useAppStore((state) => state.to);
  return (
    <div className="space-y-5 px-3">
      <RailList title={from.name} country={from} side="from" />
      <RailList title={to.name} country={to} side="to" />
      <p className="text-[11px] leading-4 text-ink-3">Fees for individual rails aren’t shown because each bank sets its own.</p>
    </div>
  );
}

export function RightPanel() {
  const rightOpen = useAppStore((state) => state.rightOpen);
  const tab = useAppStore((state) => state.rightTab);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<ChainTransfer | null>(null);
  const title = TABS.find((candidate) => candidate.id === tab)!.title;

  const pick = (id: RightTab) => useAppStore.setState(id === tab && rightOpen ? { rightOpen: false } : { rightTab: id, rightOpen: true });

  return (
    <>
      <nav aria-label="Panels" className="absolute inset-y-0 right-0 z-20 hidden w-[72px] flex-col items-center gap-1 border-l border-line bg-void py-3 lg:flex">
        {TABS.map(({ id, label, icon }) => (
          <RailButton key={id} label={label} icon={icon} active={rightOpen && tab === id} onClick={() => pick(id)} />
        ))}
      </nav>

      <section
        aria-label={title}
        className={`glass absolute z-10 flex flex-col !bg-void transition-[height,translate,visibility] duration-300 max-lg:inset-x-0 max-lg:bottom-0 max-lg:rounded-t-2xl max-lg:border-b-0 lg:inset-y-0 lg:right-[72px] lg:w-[340px] lg:rounded-none lg:border-y-0 lg:border-r-0 ${
          sheetOpen ? "max-lg:h-[62dvh]" : "max-lg:h-14"
        } ${rightOpen ? "" : "lg:invisible lg:translate-x-full"}`}
      >
        <div className="flex h-14 shrink-0 items-center border-line lg:border-b">
          <button
            type="button"
            onClick={() => setSheetOpen(!sheetOpen)}
            aria-expanded={sheetOpen}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 text-left lg:pointer-events-none"
          >
            <span className="truncate text-sm font-medium lg:stat-label">{title}</span>
            <ChevronUp aria-hidden className={`size-4 shrink-0 text-ink-2 transition-transform lg:hidden ${sheetOpen ? "rotate-180" : ""}`} />
          </button>
          <span className="mr-2 max-lg:hidden">
            <IconButton label="Collapse panel" onClick={() => useAppStore.setState({ rightOpen: false })}>
              <PanelRightClose className="size-[18px]" />
            </IconButton>
          </span>
        </div>

        <div className={`flex shrink-0 gap-1 px-3 pb-2 lg:hidden ${sheetOpen ? "" : "hidden"}`}>
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => useAppStore.setState({ rightTab: id })}
              className={`rounded-lg px-3 py-1.5 text-[13px] ${tab === id ? "bg-white/10 text-ink" : "text-ink-2"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto pb-3 lg:pt-3 ${sheetOpen ? "px-1" : "max-lg:hidden px-1"}`}>
          {tab === "transfers" ? <TransferFeed selected={selected} onSelect={setSelected} /> : tab === "paths" ? <Paths /> : <Rails />}
        </div>
      </section>

      {selected ? <TransferDetail transfer={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
