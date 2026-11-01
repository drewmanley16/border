"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { clearSelection, focusCity } from "@/lib/actions";
import { CITIES, CITY_INDEX } from "@/lib/cities";
import { latLngToUnit } from "@/lib/geo";
import { network } from "@/lib/network";
import { useAppStore } from "@/store/transactionStore";

const HIT_RADIUS_PX = 16;
const DRAG_THRESHOLD_PX = 6;

const VERTEX = /* glsl */ `
  attribute vec3 aDir;
  attribute float aTier;
  attribute float aIndex;
  attribute float aPulse;
  uniform float uTime;
  uniform float uHover;
  uniform float uFocus;
  uniform float uReduced;
  varying vec2 vQuad;
  varying float vRing;
  varying float vAccent;
  varying float vFacing;

  void main() {
    bool lit = abs(aIndex - uHover) < 0.5 || abs(aIndex - uFocus) < 0.5;
    vec4 center = modelViewMatrix * vec4(aDir * 1.0045, 1.0);
    vec3 n = normalize(normalMatrix * aDir);
    vFacing = smoothstep(0.02, 0.3, dot(n, normalize(-center.xyz)));
    float scale = (0.012 + aTier * 0.0035) * 2.6 * (lit ? 1.6 : 1.0);
    center.xy += position.xy * scale * clamp(-center.z / 2.5, 0.45, 1.3);
    vQuad = position.xy;
    float age = uTime - aPulse;
    vRing = uReduced > 0.5 ? -1.0 : age / 1.7;
    vAccent = lit ? 1.0 : 0.0;
    gl_Position = projectionMatrix * center;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec2 vQuad;
  varying float vRing;
  varying float vAccent;
  varying float vFacing;

  void main() {
    float r = length(vQuad);
    float core = 1.0 - smoothstep(0.16, 0.24, r);
    float halo = exp(-r * r * 22.0) * 0.5;
    float ring = 0.0;
    if (vRing >= 0.0 && vRing <= 1.0) {
      float radius = 0.16 + vRing * 0.7;
      ring = exp(-pow((r - radius) / 0.045, 2.0)) * pow(1.0 - vRing, 2.0) * 0.8;
    }
    vec3 cyan = vec3(0.04, 0.5, 0.95);
    vec3 color = mix(vec3(0.72, 0.9, 1.0), vec3(1.0), vAccent) * core * (0.5 + vAccent * 1.4)
      + cyan * (halo * 0.5 + ring) * (0.6 + vAccent);
    gl_FragColor = vec4(color * vFacing * (1.0 - smoothstep(0.9, 1.0, r)), 1.0);
    #include <colorspace_fragment>
  }
`;

export function CityMarkers() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);

  const { geometry, material, pulses } = useMemo(() => {
    const instanced = new THREE.InstancedBufferGeometry();
    instanced.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
    );
    instanced.setIndex([0, 1, 2, 0, 2, 3]);

    const dirs = new Float32Array(CITIES.length * 3);
    CITIES.forEach((city, i) => dirs.set(latLngToUnit(city.lat, city.lng), i * 3));
    const pulseAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(CITIES.length).fill(-1e6),
      1,
    ).setUsage(THREE.DynamicDrawUsage);

    instanced.setAttribute("aDir", new THREE.InstancedBufferAttribute(dirs, 3));
    instanced.setAttribute(
      "aTier",
      new THREE.InstancedBufferAttribute(Float32Array.from(CITIES, (city) => city.tier), 1),
    );
    instanced.setAttribute(
      "aIndex",
      new THREE.InstancedBufferAttribute(Float32Array.from(CITIES, (_, i) => i), 1),
    );
    instanced.setAttribute("aPulse", pulseAttribute);
    instanced.instanceCount = CITIES.length;

    return {
      geometry: instanced,
      pulses: pulseAttribute,
      material: new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uHover: { value: -1 },
          uFocus: { value: -1 },
          uReduced: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(
    () =>
      network.onArc((event) => {
        if (event.kind !== "launch") return;
        const { filters } = useAppStore.getState();
        if (!filters.coins[event.tx.stablecoin] || !filters.chains[event.tx.chain]) return;
        const index = CITY_INDEX.get(event.tx.origin.city);
        if (index === undefined) return;
        // Don't restart a ring that has only just begun.
        if (event.startS - pulses.getX(index) < 1.1) return;
        pulses.setX(index, event.startS);
        pulses.needsUpdate = true;
      }),
    [pulses],
  );

  // Cities are picked in screen space. There are few of them, and it avoids
  // raycasting against tiny quads while everything is moving.
  useEffect(() => {
    const element = gl.domElement;
    const point = new THREE.Vector3();
    const toCamera = new THREE.Vector3();
    let pressX = 0;
    let pressY = 0;
    let pressed = false;
    let dragging = false;

    const pick = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      toCamera.copy(camera.position);
      const distance = toCamera.length();
      toCamera.normalize();

      let best = -1;
      let bestDistance = HIT_RADIUS_PX;
      CITIES.forEach((city, i) => {
        const [ux, uy, uz] = latLngToUnit(city.lat, city.lng);
        // On the far side of the horizon as seen from the camera.
        if (ux * toCamera.x + uy * toCamera.y + uz * toCamera.z < 1 / distance) return;
        point.set(ux, uy, uz).project(camera);
        const sx = ((point.x + 1) / 2) * rect.width;
        const sy = ((1 - point.y) / 2) * rect.height;
        const gap = Math.hypot(sx - x, sy - y);
        if (gap < bestDistance) {
          bestDistance = gap;
          best = i;
        }
      });
      return { index: best, x: clientX, y: clientY };
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (pressed) {
        dragging ||= Math.hypot(event.clientX - pressX, event.clientY - pressY) > DRAG_THRESHOLD_PX;
        return;
      }
      const hit = pick(event.clientX, event.clientY);
      const { hoveredCity } = useAppStore.getState();
      const next = hit.index >= 0 ? CITIES[hit.index] : null;
      element.style.cursor = next ? "pointer" : "";
      if (next === (hoveredCity?.city ?? null) && !next) return;
      useAppStore.setState({ hoveredCity: next ? { city: next, x: hit.x, y: hit.y } : null });
      material.uniforms.uHover.value = hit.index;
    };

    const onDown = (event: PointerEvent) => {
      pressed = true;
      dragging = false;
      pressX = event.clientX;
      pressY = event.clientY;
    };

    const onUp = (event: PointerEvent) => {
      const wasClick = pressed && !dragging;
      pressed = false;
      if (!wasClick) return;
      const hit = pick(event.clientX, event.clientY);
      const state = useAppStore.getState();
      if (hit.index >= 0) {
        focusCity(CITIES[hit.index]);
      } else if (state.selectedTx || state.focusedCity) {
        clearSelection();
      }
    };

    const onLeave = () => {
      useAppStore.setState({ hoveredCity: null });
      material.uniforms.uHover.value = -1;
    };

    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    element.addEventListener("pointerleave", onLeave);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointerleave", onLeave);
    };
  }, [camera, gl, material]);

  useFrame(() => {
    const { focusedCity, reducedMotion } = useAppStore.getState();
    material.uniforms.uTime.value = network.nowS();
    material.uniforms.uFocus.value = focusedCity ? (CITY_INDEX.get(focusedCity.city) ?? -1) : -1;
    material.uniforms.uReduced.value = reducedMotion ? 1 : 0;
  });

  return <mesh geometry={geometry} material={material} renderOrder={2} frustumCulled={false} />;
}
