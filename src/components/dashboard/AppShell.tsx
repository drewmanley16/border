"use client";

import { useEffect, type ReactNode } from "react";
import { GlobeStage } from "@/components/globe/GlobeStage";
import { useAppStore } from "@/store/appStore";
import { startLiveData } from "@/store/liveStore";
import { LeftRail } from "./LeftRail";
import { Navbar } from "./Navbar";

/** Lives in the root layout so live data survives moving between views. */
export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => startLiveData(), []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      useAppStore.setState({
        reducedMotion: query.matches,
        ...(query.matches ? { autoRotate: false } : {}),
      });
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return (
    <>
      <GlobeStage />
      <Navbar />
      <LeftRail />
      {children}
    </>
  );
}
