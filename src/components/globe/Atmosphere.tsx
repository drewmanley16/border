"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

const OUTER_RADIUS = 1.13;
/** Cosine at which the shell's back faces meet the planet's silhouette. */
const LIMB_COSINE = Math.sqrt(1 - 1 / (OUTER_RADIUS * OUTER_RADIUS));

const VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uLimb;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    vec3 n = normalize(vNormalView);
    float depth = clamp(-dot(n, normalize(vViewDir)) / uLimb, 0.0, 1.0);
    float glow = pow(depth, 4.2);
    float side = dot(n, normalize(vec3(0.6, -0.5, 0.0))) * 0.5 + 0.5;
    vec3 color = mix(vec3(0.05, 0.3, 0.95), vec3(0.14, 0.62, 1.0), side);
    gl_FragColor = vec4(color * glow * (0.1 + side * 0.2), 1.0);
    #include <colorspace_fragment>
  }
`;

export function Atmosphere() {
  const { geometry, material } = useMemo(
    () => ({
      geometry: new THREE.SphereGeometry(OUTER_RADIUS, 96, 64),
      material: new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uLimb: { value: LIMB_COSINE } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <mesh geometry={geometry} material={material} renderOrder={2} />;
}
