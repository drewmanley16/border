"use client";

import { useEffect } from "react";
import { clearSelection } from "@/lib/actions";
import { CityTooltip } from "./CityTooltip";
import { ControlBar } from "./ControlBar";
import { StatsBar } from "./StatsBar";
import { TransactionDetail } from "./TransactionDetail";
import { TransactionFeed } from "./TransactionFeed";

export function Dashboard() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="pointer-events-none fixed inset-0 *:pointer-events-auto">
      <h1 className="sr-only">StableFlow: simulated global stablecoin transfers</h1>
      <StatsBar />
      <TransactionFeed />
      <ControlBar />
      <TransactionDetail />
      <CityTooltip />
    </main>
  );
}
