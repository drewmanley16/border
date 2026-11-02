"use client";

import { useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { latLngToUnit } from "@/lib/geo";
import { useAppStore } from "@/store/appStore";

const SEGMENTS = 96;
const TRAVEL_SECONDS = 3.2;

/** A great circle between two unit vectors, lifted off the surface by distance. */
function arcPoints(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  const omega = from.angleTo(to);
  const sin = Math.sin(omega) || 1;
  const lift = 0.05 + omega * 0.11;
  return Array.from({ length: SEGMENTS + 1 }, (_, index) => {
    const t = index / SEGMENTS;
    return from
      .clone()
      .multiplyScalar(Math.sin((1 - t) * omega) / sin)
      .addScaledVector(to, Math.sin(t * omega) / sin)
      .normalize()
      .multiplyScalar(1.006 + lift * Math.sin(Math.PI * t));
  });
}

/** The viewer's own route, between the countries they chose. It never shows a payment. */
export function GlobeRoute() {
  const from = useAppStore((state) => state.pins.from);
  const to = useAppStore((state) => state.pins.to);
  const focus = useAppStore((state) => state.focus);
  const dot = useRef<THREE.Mesh>(null);

  const points = useMemo(() => {
    if (!from || !to || (from.lat === to.lat && from.lng === to.lng)) return null;
    return arcPoints(new THREE.Vector3(...latLngToUnit(from.lat, from.lng)), new THREE.Vector3(...latLngToUnit(to.lat, to.lng)));
  }, [from, to]);

  const travelling = focus !== null && focus.kind !== "rail";

  useFrame(({ clock }) => {
    const mesh = dot.current;
    if (!mesh || !points) return;
    const { reducedMotion } = useAppStore.getState();
    const t = reducedMotion ? 0.5 : (clock.elapsedTime / TRAVEL_SECONDS) % 1;
    mesh.position.copy(points[Math.round(t * SEGMENTS)]!);
  });

  if (!points) return null;
  return (
    <>
      <Line points={points} color={travelling ? focus.color : "#94A3B8"} lineWidth={travelling ? 2.5 : 1} transparent opacity={travelling ? 1 : 0.45} />
      {travelling ? (
        <mesh ref={dot}>
          <sphereGeometry args={[0.014, 16, 16]} />
          <meshBasicMaterial color={focus.color} toneMapped={false} />
        </mesh>
      ) : null}
    </>
  );
}
