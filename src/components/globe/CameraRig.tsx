"use client";

import { useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { latLngToUnit } from "@/lib/geo";
import { useAppStore } from "@/store/transactionStore";

const FOV = 32;
const MIN_DISTANCE = 1.42;
const IDLE_BEFORE_ROTATE_MS = 2600;
const HOME_DIRECTION = new THREE.Vector3(...latLngToUnit(22, -28));
/** Horizontal space the live feed takes from the right of the viewport. */
const FEED_WIDTH_PX = 372;
const DESKTOP_PX = 1024;

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
  const aspect = size.width / size.height;

  const tween = useRef<{ direction: THREE.Vector3; distance: number; rate: number } | null>(null);
  const lastInteraction = useRef(-Infinity);
  const introduced = useRef(false);
  const working = useRef(new THREE.Vector3()).current;

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const desktop = size.width >= DESKTOP_PX;
    const offsetX = desktop ? FEED_WIDTH_PX / 2 : 0;
    // Keep the globe clear of the stats above it, and of the controls on mobile.
    const offsetY = -size.height * (desktop ? 0.03 : 0.02);
    perspective.setViewOffset(size.width, size.height, offsetX, offsetY, size.width, size.height);
    perspective.updateProjectionMatrix();
  }, [camera, size]);

  useEffect(() => {
    if (introduced.current) return;
    introduced.current = true;
    const { reducedMotion } = useAppStore.getState();
    const home = homeDistance(aspect);
    camera.position.copy(HOME_DIRECTION).multiplyScalar(reducedMotion ? home : home * 1.45);
    if (!reducedMotion) tween.current = { direction: HOME_DIRECTION.clone(), distance: home, rate: 1.5 };
  }, [aspect, camera]);

  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        const command = state.cameraCommand;
        if (!command || command === previous.cameraCommand) return;
        const direction = command.direction
          ? new THREE.Vector3(...command.direction).normalize()
          : HOME_DIRECTION.clone();
        const home = homeDistance((camera as THREE.PerspectiveCamera).aspect);
        // Portrait screens need extra distance to fit the same part of the world.
        const fit = home / homeDistance(16 / 9);
        const distance = command.distance === null ? home : Math.min(home, command.distance * fit);
        tween.current = { direction, distance, rate: 3 };
      }),
    [camera],
  );

  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit) return;
    const step = Math.min(delta, 0.1);
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

    const { autoRotate, selectedTx, focusedCity, hoveredCity, globeReady } = useAppStore.getState();
    const idle = performance.now() - lastInteraction.current > IDLE_BEFORE_ROTATE_MS;
    orbit.autoRotate = autoRotate && globeReady && idle && !tween.current && !selectedTx && !focusedCity && !hoveredCity;
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
      maxDistance={maxDistance(homeDistance(aspect))}
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
