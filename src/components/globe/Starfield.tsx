"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createRng } from "@/lib/rng";

const STAR_COUNT = 3200;

const VERTEX = /* glsl */ `
  attribute vec3 aStar; // size, brightness, phase
  uniform float uPixelRatio;
  uniform float uTime;
  varying float vBrightness;
  varying float vWarm;
  void main() {
    vBrightness = aStar.y * (0.8 + 0.2 * sin(uTime * 0.7 + aStar.z * 6.28));
    vWarm = fract(aStar.z * 7.0);
    gl_PointSize = aStar.x * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  varying float vBrightness;
  varying float vWarm;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    vec3 color = mix(vec3(0.62, 0.76, 1.0), vec3(1.0, 0.9, 0.78), step(0.82, vWarm));
    gl_FragColor = vec4(color * vBrightness, a);
    #include <colorspace_fragment>
  }
`;

export function Starfield() {
  const pixelRatio = useThree((state) => state.viewport.dpr);

  const { geometry, material } = useMemo(() => {
    const random = createRng(9);
    const positions = new Float32Array(STAR_COUNT * 3);
    const stars = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const y = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      const distance = 40 + random() * 90;
      positions.set([r * Math.cos(theta) * distance, y * distance, r * Math.sin(theta) * distance], i * 3);
      const bright = Math.pow(random(), 5);
      stars.set([0.9 + bright * 2.1, 0.16 + bright * 0.7, random()], i * 3);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute("aStar", new THREE.BufferAttribute(stars, 3));
    const starMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uPixelRatio: { value: 1 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: starGeometry, material: starMaterial };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((_, delta) => {
    material.uniforms.uPixelRatio.value = pixelRatio;
    material.uniforms.uTime.value += delta;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />;
}
