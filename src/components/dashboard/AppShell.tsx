"use client";

import { useEffect, type ReactNode } from "react";
import { GlobeStage } from "@/components/globe/GlobeStage";
import { DEFAULT_SEED } from "@/lib/constants";
import { network } from "@/lib/network";
import { useAppStore } from "@/store/transactionStore";
import { Navbar } from "./Navbar";

function seedFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get("seed");
  const seed = raw === null ? NaN : Number(raw);
  return Number.isInteger(seed) && seed >= 0 ? seed : DEFAULT_SEED;
}

/** Lives in the root layout so the session survives moving between views. */
export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => network.start(seedFromUrl()), []);

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
      {children}
    </>
  );
}
