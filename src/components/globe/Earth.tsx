"use client";

import { useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { loadEarthData, type EarthData } from "@/lib/earthData";
import { useAppStore } from "@/store/appStore";

const EARTH_VERTEX = /* glsl */ `
  varying vec3 vDir;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D uLand;
  uniform float uReveal;
  varying vec3 vDir;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  const float PI = 3.14159265359;
  void main() {
    vec3 d = normalize(vDir);
    vec2 uv = vec2(atan(d.x, d.z) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
    float land = texture2D(uLand, uv).a * uReveal;

    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vViewDir);
    vec3 l = normalize(vec3(-0.55, 0.5, 0.67));
    float diffuse = dot(n, l) * 0.5 + 0.5;
    float shade = diffuse * diffuse;

    vec3 ocean = mix(vec3(0.0012, 0.0022, 0.0055), vec3(0.0028, 0.0065, 0.018), shade);
    vec3 ground = mix(vec3(0.0028, 0.0055, 0.0135), vec3(0.0105, 0.024, 0.055), shade);
    vec3 color = mix(ocean, ground, land);

    vec3 h = normalize(l + v);
    color += vec3(0.02, 0.05, 0.1) * pow(max(dot(n, h), 0.0), 36.0) * (1.0 - land) * 0.5;

    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 4.5);
    color += vec3(0.02, 0.1, 0.26) * fresnel * (0.3 + shade);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const DOTS_VERTEX = /* glsl */ `
  attribute float aRand;
  uniform float uPixelRatio;
  uniform float uReveal;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * position);
    float facing = max(dot(n, normalize(-mv.xyz)), 0.0);
    float appear = smoothstep(aRand * 0.8, aRand * 0.8 + 0.2, uReveal);
    float twinkle = 0.86 + 0.14 * sin(uTime * (0.4 + aRand) + aRand * 40.0);
    vAlpha = appear * twinkle * smoothstep(0.0, 0.42, facing);
    gl_PointSize = uPixelRatio * clamp(3.4 / -mv.z, 0.9, 3.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const DOTS_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vec3(0.17, 0.33, 0.56), vAlpha * smoothstep(0.5, 0.2, d) * 0.85);
    #include <colorspace_fragment>
  }
`;

const LINE_VERTEX = /* glsl */ `
  varying float vFacing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * position);
    vFacing = max(dot(n, normalize(-mv.xyz)), 0.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uReveal;
  varying float vFacing;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * uReveal * smoothstep(0.0, 0.35, vFacing));
    #include <colorspace_fragment>
  }
`;

function buildLines(positions: Float32Array) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function lineMaterial(color: string, opacity: number, reveal: { value: number }) {
  return new THREE.ShaderMaterial({
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uReveal: reveal },
    transparent: true,
    depthWrite: false,
  });
}

function Surface({ data }: { data: EarthData }) {
  const pixelRatio = useThree((state) => state.viewport.dpr);

  const parts = useMemo(() => {
    const reveal = { value: useAppStore.getState().reducedMotion ? 1 : 0 };
    const time = { value: 0 };
    const landTexture = new THREE.CanvasTexture(data.land);
    landTexture.wrapS = THREE.RepeatWrapping;
    landTexture.minFilter = THREE.LinearFilter;
    landTexture.generateMipmaps = false;

    const sphereGeometry = new THREE.SphereGeometry(1, 128, 96);
    const sphereMaterial = new THREE.ShaderMaterial({
      vertexShader: EARTH_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
      uniforms: { uLand: { value: landTexture }, uReveal: reveal },
    });

    const dotsGeometry = new THREE.BufferGeometry();
    const dotBuffer = new THREE.InterleavedBuffer(data.dots, 4);
    dotsGeometry.setAttribute("position", new THREE.InterleavedBufferAttribute(dotBuffer, 3, 0));
    dotsGeometry.setAttribute("aRand", new THREE.InterleavedBufferAttribute(dotBuffer, 1, 3));
    const dotsMaterial = new THREE.ShaderMaterial({
      vertexShader: DOTS_VERTEX,
      fragmentShader: DOTS_FRAGMENT,
      uniforms: { uPixelRatio: { value: 1 }, uReveal: reveal, uTime: time },
      transparent: true,
      depthWrite: false,
    });

    return {
      reveal,
      time,
      landTexture,
      sphereGeometry,
      sphereMaterial,
      dotsGeometry,
      dotsMaterial,
      coastGeometry: buildLines(data.coast),
      coastMaterial: lineMaterial("#38BDF8", 0.3, reveal),
      borderGeometry: buildLines(data.borders),
      borderMaterial: lineMaterial("#7DA7D9", 0.13, reveal),
    };
  }, [data]);

  useEffect(
    () => () => {
      parts.landTexture.dispose();
      parts.sphereGeometry.dispose();
      parts.sphereMaterial.dispose();
      parts.dotsGeometry.dispose();
      parts.dotsMaterial.dispose();
      parts.coastGeometry.dispose();
      parts.coastMaterial.dispose();
      parts.borderGeometry.dispose();
      parts.borderMaterial.dispose();
    },
    [parts],
  );

  useEffect(() => {
    useAppStore.setState({ globeReady: true });
  }, []);

  useFrame((_, delta) => {
    parts.dotsMaterial.uniforms.uPixelRatio.value = pixelRatio;
    parts.reveal.value = Math.min(1, parts.reveal.value + delta / 1.8);
    parts.time.value += delta;
  });

  return (
    <group>
      <mesh geometry={parts.sphereGeometry} material={parts.sphereMaterial} />
      <points geometry={parts.dotsGeometry} material={parts.dotsMaterial} renderOrder={1} frustumCulled={false} />
      <lineSegments geometry={parts.borderGeometry} material={parts.borderMaterial} renderOrder={1} frustumCulled={false} />
      <lineSegments geometry={parts.coastGeometry} material={parts.coastMaterial} renderOrder={1} frustumCulled={false} />
    </group>
  );
}

export function Earth() {
  const [data, setData] = useState<EarthData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadEarthData(controller.signal)
      .then(setData)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Could not load map data", error);
        // Show the planet without landmasses rather than a stuck loader.
        useAppStore.setState({ globeReady: true });
      });
    return () => controller.abort();
  }, []);

  if (data) return <Surface data={data} />;
  return (
    <mesh>
      <sphereGeometry args={[1, 64, 48]} />
      <meshBasicMaterial color="#060C1A" />
    </mesh>
  );
}
