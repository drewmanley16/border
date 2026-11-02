"use client";

import { Component, Suspense, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useAppStore } from "@/store/appStore";
import { Atmosphere } from "./Atmosphere";
import { CameraRig, FOV } from "./CameraRig";
import { Earth } from "./Earth";
import { GlobePins } from "./GlobePins";
import { GlobeRoute } from "./GlobeRoute";
import { Starfield } from "./Starfield";

class GlobeErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Glow() {
  const bloomOn = useAppStore((state) => state.bloomOn);
  if (!bloomOn) return null;
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.7} luminanceSmoothing={0.3} radius={0.72} />
    </EffectComposer>
  );
}

export default function GlobeScene({ active, fallback }: { active: boolean; fallback: ReactNode }) {
  const [dpr, setDpr] = useState(2);

  return (
    <GlobeErrorBoundary fallback={fallback}>
      <Canvas
        className="!absolute inset-0 touch-none"
        flat
        dpr={[1, dpr]}
        frameloop={active ? "always" : "never"}
        camera={{ fov: FOV, near: 0.05, far: 300 }}
        gl={{ antialias: true, alpha: false, stencil: false, powerPreference: "high-performance" }}
        aria-label="Interactive globe"
        role="img"
      >
        <color attach="background" args={["#05070D"]} />
        <PerformanceMonitor
          onDecline={() => setDpr(1.25)}
          onFallback={() => useAppStore.setState({ bloomOn: false })}
          flipflops={3}
        >
          <Suspense fallback={null}>
            <Starfield />
            <Earth />
            <Atmosphere />
            <GlobePins />
            <GlobeRoute />
          </Suspense>
          <CameraRig />
          <Glow />
        </PerformanceMonitor>
      </Canvas>
    </GlobeErrorBoundary>
  );
}
