"use client";

import { useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { latLngToUnit } from "@/lib/geo";
import { LEFT_PANEL_PX, RAIL_PX, RIGHT_PANEL_PX, useAppStore } from "@/store/appStore";

const FOV = 32;
const MIN_DISTANCE = 1.42;
const IDLE_BEFORE_ROTATE_MS = 2600;
const HOME_DIRECTION = new THREE.Vector3(...latLngToUnit(22, -28));
const DESKTOP_PX = 1024;

const leftInset = (open: boolean) => RAIL_PX + (open ? LEFT_PANEL_PX : 0);
const rightInset = (open: boolean) => RAIL_PX + (open ? RIGHT_PANEL_PX : 0);

/** Distance at which the globe fills about 70% of the height, or fits the width. */
function homeDistance(aspect: number): number {
  const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
  const heightFit = 1 / (0.7 * tan);
  const widthFit = 1 / (0.92 * aspect * tan);
  return Math.sqrt(1 + Math.max(heightFit, widthFit) ** 2);
}

/** Room to zoom out past the default view, which is further away in portrait. */
const maxDistance = (home: number) => home * 1.6;

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const desktop = size.width >= DESKTOP_PX;
  const leftOpen = useAppStore((state) => state.leftOpen);
  const rightOpen = useAppStore((state) => state.rightOpen);
  const aspect = size.width / size.height;
  // Framed for the space between the side panels, so they don't crop it.
  const fitAspect = desktop ? (size.width - leftInset(leftOpen) - rightInset(rightOpen)) / size.height : aspect;
  const offset = useRef({ x: 0, y: 0, targetX: 0, placed: false });

  const tween = useRef<{ direction: THREE.Vector3; distance: number; rate: number } | null>(null);
  const lastInteraction = useRef(-Infinity);
  const introduced = useRef(false);
  const working = useRef(new THREE.Vector3()).current;

  useEffect(() => {
    const view = offset.current;
    view.targetX = desktop ? (rightInset(rightOpen) - leftInset(leftOpen)) / 2 : 0;
    // Keep the globe clear of the stats above it.
    view.y = -size.height * (desktop ? 0.03 : 0.02);
    if (!view.placed || useAppStore.getState().reducedMotion) view.x = view.targetX;
    view.placed = true;
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.setViewOffset(size.width, size.height, view.x, view.y, size.width, size.height);
    perspective.updateProjectionMatrix();
  }, [camera, size, desktop, leftOpen, rightOpen]);

  useEffect(() => {
    if (introduced.current) return;
    introduced.current = true;
    const { reducedMotion } = useAppStore.getState();
    const home = homeDistance(fitAspect);
    camera.position.copy(HOME_DIRECTION).multiplyScalar(reducedMotion ? home : home * 1.45);
    if (!reducedMotion) tween.current = { direction: HOME_DIRECTION.clone(), distance: home, rate: 1.5 };
  }, [fitAspect, camera]);

  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        const target = state.cameraTarget;
        if (!target || target === previous.cameraTarget) return;
        const direction = new THREE.Vector3(...latLngToUnit(target.pin.lat, target.pin.lng)).normalize();
        tween.current = { direction, distance: camera.position.length(), rate: 2.5 };
        lastInteraction.current = performance.now();
      }),
    [camera],
  );

  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit) return;
    const step = Math.min(delta, 0.1);

    const view = offset.current;
    if (Math.abs(view.targetX - view.x) > 0.25) {
      view.x += (view.targetX - view.x) * (1 - Math.exp(-9 * step));
      const perspective = camera as THREE.PerspectiveCamera;
      perspective.setViewOffset(size.width, size.height, view.x, view.y, size.width, size.height);
      perspective.updateProjectionMatrix();
    }
    const goal = tween.current;

    if (goal) {
      const { reducedMotion } = useAppStore.getState();
      const amount = reducedMotion ? 1 : 1 - Math.exp(-goal.rate * step);
      const radius = camera.position.length();
      const nextRadius = radius + (goal.distance - radius) * amount;
      working.copy(camera.position).normalize();
      const remaining = working.angleTo(goal.direction);
      working.lerp(goal.direction, amount).normalize();
      camera.position.copy(working).multiplyScalar(nextRadius);
      if (remaining < 0.002 && Math.abs(goal.distance - radius) < 0.003) tween.current = null;
    }

    const { autoRotate, globeReady } = useAppStore.getState();
    const idle = performance.now() - lastInteraction.current > IDLE_BEFORE_ROTATE_MS;
    orbit.autoRotate = autoRotate && globeReady && idle && !tween.current;
    // Scales with distance so the surface tracks the pointer at any zoom.
    orbit.rotateSpeed = Math.max(0.05, 0.11 * (camera.position.length() - 1));
    orbit.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.055}
      zoomSpeed={0.6}
      minDistance={MIN_DISTANCE}
      maxDistance={maxDistance(homeDistance(fitAspect))}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI - 0.2}
      autoRotateSpeed={-0.42}
      onStart={() => {
        tween.current = null;
        lastInteraction.current = Infinity;
      }}
      onEnd={() => {
        lastInteraction.current = performance.now();
      }}
    />
  );
}

export { FOV };
