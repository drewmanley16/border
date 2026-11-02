"use client";

import { useEffect, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useAppStore } from "@/store/appStore";

const GlobeScene = dynamic(() => import("./GlobeScene"), { ssr: false });

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

let webglSupport: boolean | null = null;
const noSubscribe = () => () => {};
const clientWebGL = () => (webglSupport ??= detectWebGL());

function WebGLFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6 pb-40 lg:pr-96">
      <div className="max-w-sm text-center">
        <h2 className="text-lg font-medium text-ink">The 3D globe can’t run in this browser</h2>
        <p className="mt-2 text-sm leading-6 text-ink-2">
          It needs WebGL. Turn on hardware acceleration or try another browser. Live transfers and
          analytics keep working without it.
        </p>
      </div>
    </div>
  );
}

function GlobeLoader() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 flex items-center justify-center lg:pr-[372px]"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-14 rounded-full border border-line">
          <span className="loader-orbit absolute inset-[-1px] rounded-full border border-transparent border-t-cyan" />
        </div>
        <p className="text-sm text-ink-2">Loading the globe</p>
      </div>
    </motion.div>
  );
}

/**
 * The scene mounts the first time the globe route is shown and then stays, so
 * returning from Analytics is instant. It only renders while it is visible.
 */
export function GlobeStage() {
  const pathname = usePathname();
  const active = pathname === "/";
  const hasWebGL = useSyncExternalStore(noSubscribe, clientWebGL, () => true);
  const ready = useAppStore((state) => state.globeReady);
  const visited = useAppStore((state) => state.globeVisited);

  useEffect(() => {
    if (active) useAppStore.setState({ globeVisited: true });
  }, [active]);

  if (!active && !visited) return null;

  return (
    <div className={`fixed inset-0 ${active ? "" : "invisible"}`} aria-hidden={!active}>
      {hasWebGL ? (
        <GlobeScene active={active} fallback={<WebGLFallback />} />
      ) : (
        <WebGLFallback />
      )}
      <AnimatePresence>{hasWebGL && active && !ready ? <GlobeLoader key="loader" /> : null}</AnimatePresence>
    </div>
  );
}
