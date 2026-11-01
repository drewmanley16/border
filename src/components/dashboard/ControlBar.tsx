"use client";

import { Crosshair, Orbit, Pause, Play, SlidersHorizontal } from "lucide-react";
import { resetCamera } from "@/lib/actions";
import { CHAINS, COIN_COLORS, SPEEDS, STABLECOINS } from "@/lib/constants";
import { network } from "@/lib/network";
import { useAppStore } from "@/store/transactionStore";
import { IconButton, usePopover } from "@/components/ui/Primitives";

const CHIP = "h-8 rounded-md px-2 text-[13px] transition-colors";

function chipState(on: boolean) {
  return on ? "bg-white/10 text-ink" : "text-ink-3 hover:text-ink-2";
}

function CoinFilters() {
  const coins = useAppStore((state) => state.filters.coins);
  const toggleCoin = useAppStore((state) => state.toggleCoin);
  return (
    <div role="group" aria-label="Filter by stablecoin" className="flex gap-0.5">
      {STABLECOINS.map((coin) => (
        <button
          key={coin}
          type="button"
          aria-pressed={coins[coin]}
          onClick={() => toggleCoin(coin)}
          className={`${CHIP} flex items-center gap-1.5 ${chipState(coins[coin])}`}
        >
          <span
            aria-hidden
            className="size-2 rounded-full transition-opacity"
            style={{ backgroundColor: COIN_COLORS[coin], opacity: coins[coin] ? 1 : 0.3 }}
          />
          {coin}
        </button>
      ))}
    </div>
  );
}

function ChainFilters() {
  const chains = useAppStore((state) => state.filters.chains);
  const toggleChain = useAppStore((state) => state.toggleChain);
  return (
    <div role="group" aria-label="Filter by blockchain" className="flex gap-0.5">
      {CHAINS.map((chain) => (
        <button
          key={chain}
          type="button"
          aria-pressed={chains[chain]}
          onClick={() => toggleChain(chain)}
          className={`${CHIP} ${chipState(chains[chain])}`}
        >
          {chain}
        </button>
      ))}
    </div>
  );
}

function SpeedControl() {
  const speed = useAppStore((state) => state.speed);
  return (
    <div role="group" aria-label="Transaction speed" className="flex gap-0.5">
      {SPEEDS.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={speed === value}
          aria-label={`${value} times speed`}
          onClick={() => network.setSpeed(value)}
          className={`${CHIP} ${speed === value ? "bg-white/10 text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {value}×
        </button>
      ))}
    </div>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;

export function ControlBar() {
  const paused = useAppStore((state) => state.paused);
  const autoRotate = useAppStore((state) => state.autoRotate);
  const { open, setOpen, root } = usePopover();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-10 flex justify-center px-3 lg:right-[372px] lg:bottom-4">
      <div ref={root} className="pointer-events-auto relative">
        {open ? (
          <div className="glass absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 flex-col gap-2 rounded-xl p-2 2xl:hidden">
            <CoinFilters />
            <ChainFilters />
          </div>
        ) : null}
        <div role="toolbar" aria-label="Simulation controls" className="glass flex items-center rounded-xl p-1">
          <div className="hidden items-center 2xl:flex">
            <CoinFilters />
            <Divider />
            <ChainFilters />
            <Divider />
          </div>
          <span className="2xl:hidden">
            <IconButton label="Filters" pressed={open} onClick={() => setOpen(!open)}>
              <SlidersHorizontal className="size-[18px]" />
            </IconButton>
          </span>
          <Divider />
          <SpeedControl />
          <Divider />
          <IconButton label={paused ? "Resume simulation" : "Pause simulation"} onClick={() => network.setPaused(!paused)}>
            {paused ? <Play className="size-[18px]" /> : <Pause className="size-[18px]" />}
          </IconButton>
          <IconButton label="Reset camera" onClick={resetCamera}>
            <Crosshair className="size-[18px]" />
          </IconButton>
          <IconButton
            label="Auto-rotate"
            pressed={autoRotate}
            onClick={() => useAppStore.setState({ autoRotate: !autoRotate })}
          >
            <Orbit className="size-[18px]" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
