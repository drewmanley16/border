"use client";

import { useEffect, type CSSProperties } from "react";
import { LEFT_PANEL_PX, RAIL_PX, RIGHT_PANEL_PX, useAppStore } from "@/store/appStore";
import { FocusCard } from "./FocusCard";
import { LiveStats } from "./LiveStats";
import { RightPanel } from "./RightPanel";
import { SendPanel } from "./SendPanel";

export function Dashboard() {
  const leftOpen = useAppStore((state) => state.leftOpen);
  const rightOpen = useAppStore((state) => state.rightOpen);
  // Two open panels leave too little of the globe on a small laptop.
  useEffect(() => {
    if (window.innerWidth >= 1024 && window.innerWidth < 1280) useAppStore.setState({ rightOpen: false });
  }, []);

  const insets = {
    "--left-inset": `${RAIL_PX + (leftOpen ? LEFT_PANEL_PX : 0)}px`,
    "--right-inset": `${RAIL_PX + (rightOpen ? RIGHT_PANEL_PX : 0)}px`,
  } as CSSProperties;

  return (
    <main style={insets} className="pointer-events-none fixed inset-0 *:pointer-events-auto">
      <h1 className="sr-only">StableFlow: real stablecoin transfers, exchange rates and network fees</h1>
      <LiveStats />
      <FocusCard />
      <SendPanel />
      <RightPanel />
    </main>
  );
}
