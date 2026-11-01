"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CITY_INDEX } from "@/lib/cities";
import { CHAINS, COIN_COLORS, MAX_ACTIVE_ROUTES, STABLECOINS } from "@/lib/constants";
import { angularDistance, arcLift, flightMs, latLngToUnit } from "@/lib/geo";
import { LAUNCH_DELAY_S, network, type ArcEvent } from "@/lib/network";
import { useAppStore } from "@/store/transactionStore";
import type { StablecoinTransaction, TransactionEndpoint } from "@/types/transaction";
import {
  COMET_FRAGMENT,
  COMET_VERTEX,
  HEAD_FRAGMENT,
  HEAD_VERTEX,
  PULSE_FRAGMENT,
  PULSE_VERTEX,
  ROUTE_FRAGMENT,
  ROUTE_VERTEX,
} from "./arcShaders";

/** Slots kept for routes the viewer pinned, by selecting a payment or a city. */
const PINNED_SLOTS = 9;
const SLOTS = PINNED_SLOTS + MAX_ACTIVE_ROUTES + 30;
const COMET_SEGMENTS = 44;
const ROUTE_SEGMENTS = 72;
const PINNED_REPLAY_S = 3.4;

const COIN_LINEAR = STABLECOINS.map((coin) => new THREE.Color(COIN_COLORS[coin]));

/** Grows with the log of the amount: about 0.65 at $50 and 2.8 at $100,000. */
function sizeForAmount(amountUSD: number): number {
  const scale = Math.log10(Math.max(amountUSD, 10));
  return 0.42 + 0.075 * scale * scale + (amountUSD >= 100_000 ? 0.5 : 0);
}

function stripGeometry(segments: number) {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const index: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const s = i / segments;
    positions.set([s, -1, 0, s, 1, 0], i * 6);
    if (i < segments) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

function quadGeometry() {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/** Two quads, one for the launch pulse and one for the arrival pulse. */
function pulseGeometry() {
  const positions: number[] = [];
  const ends: number[] = [];
  const index: number[] = [];
  for (let end = 0; end < 2; end += 1) {
    const base = end * 4;
    positions.push(-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0);
    ends.push(end, end, end, end);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aEnd", new THREE.BufferAttribute(new Float32Array(ends), 1));
  geometry.setIndex(index);
  return geometry;
}

function damp(current: number, target: number, rate: number, delta: number) {
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}

export function ArcSystem() {
  const system = useMemo(() => {
    const attribute = (size: number) =>
      new THREE.InstancedBufferAttribute(new Float32Array(SLOTS * size), size).setUsage(THREE.DynamicDrawUsage);
    const instances = {
      aA: attribute(3),
      aB: attribute(3),
      aColor: attribute(3),
      aTiming: attribute(4),
      aStyle: attribute(4),
      aMeta: attribute(4),
    };
    for (let i = 0; i < SLOTS; i += 1) instances.aTiming.setXYZW(i, -1e6, 1, -1, 0.3);

    const uniforms = {
      uTime: { value: 0 },
      uDim: { value: 0 },
      uFocusCity: { value: -1 },
      uPinned: { value: 0 },
      uReduced: { value: 0 },
      uCoinVis: { value: [1, 1, 1, 1] },
      uChainVis: { value: [1, 1, 1, 1] },
    };

    const parts = [
      { geometry: stripGeometry(ROUTE_SEGMENTS), vertex: ROUTE_VERTEX, fragment: ROUTE_FRAGMENT, order: 3 },
      { geometry: pulseGeometry(), vertex: PULSE_VERTEX, fragment: PULSE_FRAGMENT, order: 3 },
      { geometry: stripGeometry(COMET_SEGMENTS), vertex: COMET_VERTEX, fragment: COMET_FRAGMENT, order: 4 },
      { geometry: quadGeometry(), vertex: HEAD_VERTEX, fragment: HEAD_FRAGMENT, order: 5 },
    ].map(({ geometry, vertex, fragment, order }) => {
      for (const [name, value] of Object.entries(instances)) geometry.setAttribute(name, value);
      geometry.instanceCount = SLOTS;
      const material = new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      return { geometry, material, order };
    });

    return {
      instances,
      uniforms,
      parts,
      /** Sim time when each slot's effects have fully finished. */
      slotEnds: new Float64Array(SLOTS),
      slotById: new Map<string, number>(),
      replayAt: 0,
      pinned: [] as { origin: TransactionEndpoint; destination: TransactionEndpoint; tx?: StablecoinTransaction }[],
      replay: null as ((nowS: number) => void) | null,
    };
  }, []);

  useEffect(
    () => () => {
      for (const { geometry, material } of system.parts) {
        geometry.dispose();
        material.dispose();
      }
    },
    [system],
  );

  useEffect(() => {
    const { instances, slotEnds, slotById } = system;

    const writeSlot = (
      slot: number,
      tx: Pick<StablecoinTransaction, "origin" | "destination" | "amountUSD" | "stablecoin" | "chain" | "expectedSettlementMs">,
      startS: number,
      durationS: number,
      pinned: boolean,
    ) => {
      const a = latLngToUnit(tx.origin.lat, tx.origin.lng);
      const b = latLngToUnit(tx.destination.lat, tx.destination.lng);
      const coin = STABLECOINS.indexOf(tx.stablecoin);
      const color = COIN_LINEAR[coin];
      const size = sizeForAmount(tx.amountUSD);
      instances.aA.setXYZ(slot, a[0], a[1], a[2]);
      instances.aB.setXYZ(slot, b[0], b[1], b[2]);
      instances.aColor.setXYZ(slot, color.r, color.g, color.b);
      // Quick stars carry shorter tails, so the eye still reads them as streaks.
      const lag = 0.2 + Math.random() * 0.1 + Math.min(0.1, 2.4 / (durationS * 30));
      instances.aTiming.setXYZW(slot, startS, durationS, -1, lag);
      instances.aStyle.setXYZW(slot, size, arcLift(angularDistance(a, b)), coin, CHAINS.indexOf(tx.chain));
      instances.aMeta.setXYZW(
        slot,
        CITY_INDEX.get(tx.origin.city) ?? -1,
        CITY_INDEX.get(tx.destination.city) ?? -1,
        pinned ? 1 : 0,
        Math.random(),
      );
      slotEnds[slot] = startS + LAUNCH_DELAY_S + durationS * (1 + lag) + 2;
      for (const value of Object.values(instances)) value.needsUpdate = true;
    };

    const freeSlot = (nowS: number) => {
      let oldest = PINNED_SLOTS;
      for (let slot = PINNED_SLOTS; slot < SLOTS; slot += 1) {
        if (slotEnds[slot] <= nowS) return slot;
        if (slotEnds[slot] < slotEnds[oldest]) oldest = slot;
      }
      return oldest;
    };

    const onEvent = (event: ArcEvent) => {
      if (event.kind === "launch") {
        const slot = freeSlot(event.startS);
        writeSlot(slot, event.tx, event.startS, event.durationS, false);
        slotById.set(event.tx.id, slot);
        if (slotById.size > SLOTS * 2) {
          for (const key of slotById.keys()) {
            slotById.delete(key);
            if (slotById.size <= SLOTS) break;
          }
        }
      } else if (event.kind === "fail") {
        const slot = slotById.get(event.id);
        if (slot === undefined) return;
        instances.aTiming.setZ(slot, event.atS);
        instances.aTiming.needsUpdate = true;
      } else {
        slotEnds.fill(0);
        slotById.clear();
        for (let i = PINNED_SLOTS; i < SLOTS; i += 1) instances.aTiming.setXYZW(i, -1e6, 1, -1, 0.3);
        instances.aTiming.needsUpdate = true;
      }
    };

    const firePinned = (nowS: number) => {
      system.pinned.forEach(({ origin, destination, tx }, i) => {
        const a = latLngToUnit(origin.lat, origin.lng);
        const b = latLngToUnit(destination.lat, destination.lng);
        const durationS = tx
          ? flightMs(tx.expectedSettlementMs, angularDistance(a, b)) / 1000
          : 2.4;
        writeSlot(
          i,
          {
            origin,
            destination,
            amountUSD: tx?.amountUSD ?? 2500,
            stablecoin: tx?.stablecoin ?? "USDC",
            chain: tx?.chain ?? "Solana",
          },
          // Stagger a city's routes so they don't launch as one flash.
          nowS + i * 0.28,
          Math.min(durationS, PINNED_REPLAY_S - 0.6),
          true,
        );
      });
      system.replayAt = nowS + PINNED_REPLAY_S + system.pinned.length * 0.2;
    };

    const syncPinned = () => {
      const { selectedTx, focusedCity } = useAppStore.getState();
      const routes: typeof system.pinned = selectedTx
        ? [{ origin: selectedTx.origin, destination: selectedTx.destination, tx: selectedTx }]
        : focusedCity
          ? network.aggregator.corridorsFor(focusedCity.city, PINNED_SLOTS)
          : [];
      for (let i = 0; i < PINNED_SLOTS; i += 1) {
        if (i >= routes.length) instances.aTiming.setXYZW(i, -1e6, 1, -1, 0.3);
      }
      instances.aTiming.needsUpdate = true;
      system.pinned = routes;
      if (routes.length > 0) firePinned(network.nowS());

      const { uniforms } = system;
      uniforms.uFocusCity.value = focusedCity ? (CITY_INDEX.get(focusedCity.city) ?? -1) : -1;
    };

    system.replay = firePinned;

    const stopArcs = network.onArc(onEvent);
    const stopStore = useAppStore.subscribe((state, previous) => {
      if (state.selectedTx?.id !== previous.selectedTx?.id || state.focusedCity !== previous.focusedCity) {
        syncPinned();
      }
    });
    syncPinned();
    return () => {
      stopArcs();
      stopStore();
    };
  }, [system]);

  useFrame((_, delta) => {
    const { uniforms } = system;
    const { filters, selectedTx, focusedCity, reducedMotion } = useAppStore.getState();
    const step = Math.min(delta, 0.1);
    const nowS = network.nowS();

    uniforms.uTime.value = nowS;
    uniforms.uReduced.value = reducedMotion ? 1 : 0;
    uniforms.uDim.value = damp(uniforms.uDim.value, selectedTx || focusedCity ? 1 : 0, 5, step);
    uniforms.uPinned.value = damp(uniforms.uPinned.value, system.pinned.length > 0 ? 1 : 0, 6, step);
    STABLECOINS.forEach((coin, i) => {
      uniforms.uCoinVis.value[i] = damp(uniforms.uCoinVis.value[i], filters.coins[coin] ? 1 : 0, 7, step);
    });
    CHAINS.forEach((chain, i) => {
      uniforms.uChainVis.value[i] = damp(uniforms.uChainVis.value[i], filters.chains[chain] ? 1 : 0, 7, step);
    });

    if (system.pinned.length > 0 && nowS >= system.replayAt) system.replay?.(nowS);
  });

  return (
    <>
      {system.parts.map(({ geometry, material, order }) => (
        <mesh key={order + geometry.uuid} geometry={geometry} material={material} renderOrder={order} frustumCulled={false} />
      ))}
    </>
  );
}
