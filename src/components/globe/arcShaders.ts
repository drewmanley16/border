import { LAUNCH_DELAY_S } from "@/lib/network";

/**
 * Every flight lives in instance attributes written once at launch. The vertex
 * shaders derive all motion from `uTime`, so an in-flight star costs no
 * JavaScript per frame.
 *
 *   aA, aB    unit vectors of the origin and destination
 *   aTiming   start, duration, failure time (or -1), trail lag
 *   aStyle    size, arc lift, coin index, chain index
 *   aMeta     origin city, destination city, pinned (0 or 1), seed
 */
const COMMON = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  uniform float uFocusCity;
  uniform float uPinned;
  uniform float uReduced;
  uniform float uCoinVis[4];
  uniform float uChainVis[4];
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec3 aColor;
  attribute vec4 aTiming;
  attribute vec4 aStyle;
  attribute vec4 aMeta;

  const float DELAY = ${LAUNCH_DELAY_S.toFixed(3)};
  const float PI = 3.14159265359;

  vec3 arcPoint(float t) {
    float omega = acos(clamp(dot(aA, aB), -1.0, 1.0));
    float s = sin(omega);
    vec3 dir = s < 1e-4 ? aA : (sin((1.0 - t) * omega) * aA + sin(t * omega) * aB) / s;
    float climb = sin(PI * t);
    return dir * (1.003 + aStyle.y * climb * (0.65 + 0.35 * climb));
  }

  float flightEase(float x) {
    x = clamp(x, 0.0, 1.0);
    return mix(x, x * x * (3.0 - 2.0 * x), 0.55);
  }

  float flightProgress() {
    return (uTime - aTiming.x - DELAY) / aTiming.y;
  }

  float failAmount() {
    if (aTiming.z < 0.0) return 0.0;
    return smoothstep(aTiming.z, aTiming.z + 0.55, uTime);
  }

  /** Clamps progress to the point a failed flight stopped at. */
  float heldProgress(float u) {
    if (aTiming.z < 0.0) return u;
    return min(u, (aTiming.z - aTiming.x - DELAY) / aTiming.y);
  }

  float visibility() {
    if (aMeta.z > 0.5) return uPinned;
    float shown = uCoinVis[int(aStyle.z + 0.5)] * uChainVis[int(aStyle.w + 0.5)];
    bool involved = uFocusCity >= 0.0
      && (abs(aMeta.x - uFocusCity) < 0.5 || abs(aMeta.y - uFocusCity) < 0.5);
    return shown * (involved ? 1.0 : mix(1.0, 0.1, uDim));
  }

  vec3 failTint(vec3 color, float fail) {
    return mix(color, vec3(1.0, 0.16, 0.14), smoothstep(0.0, 0.12, fail));
  }
`;

const OFFSCREEN = "gl_Position = vec4(2.0, 2.0, 2.0, 1.0);";

export const COMET_VERTEX = /* glsl */ `
  ${COMMON}
  varying float vS;
  varying float vSide;
  varying vec3 vColor;
  varying float vIntensity;

  void main() {
    float s = position.x;
    float side = position.y;
    float u = heldProgress(flightProgress());
    float head = flightEase(u);
    float tail = flightEase(u - aTiming.w);
    float vis = visibility();
    float fail = failAmount();
    if (uReduced > 0.5 || head - tail < 0.0005 || vis < 0.003 || fail >= 1.0) {
      ${OFFSCREEN}
      return;
    }

    float t = mix(tail, head, s);
    vec4 here = modelViewMatrix * vec4(arcPoint(t), 1.0);
    vec4 ahead = modelViewMatrix * vec4(arcPoint(t + 0.004), 1.0);
    vec3 tangent = normalize(ahead.xyz - here.xyz);
    vec3 normal = normalize(cross(tangent, normalize(here.xyz)));

    float width = 0.0105 * aStyle.x * pow(s, 1.25);
    here.xyz += normal * side * width;

    vS = s;
    vSide = side;
    vColor = failTint(aColor, fail);
    vIntensity = vis * (1.0 - fail) * (0.85 + 0.35 * aStyle.x);
    gl_Position = projectionMatrix * here;
  }
`;

export const COMET_FRAGMENT = /* glsl */ `
  varying float vS;
  varying float vSide;
  varying vec3 vColor;
  varying float vIntensity;

  void main() {
    float across = exp(-vSide * vSide * 3.6);
    float fall = pow(vS, 2.1);
    float hot = exp(-vSide * vSide * 16.0) * pow(vS, 7.0);
    vec3 color = vColor * across * fall * 2.6 + vec3(1.0) * hot * 2.2;
    gl_FragColor = vec4(color * vIntensity, 1.0);
    #include <colorspace_fragment>
  }
`;

export const ROUTE_VERTEX = /* glsl */ `
  ${COMMON}
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSide;

  void main() {
    float t = position.x;
    float side = position.y;
    float vis = visibility();
    float age = uTime - aTiming.x;
    float u = heldProgress(flightProgress());
    float pinned = aMeta.z;

    float arrived = max(0.0, age - DELAY - aTiming.y);
    float fade = 1.0 - smoothstep(0.0, 1.4, arrived);
    float drawn = uReduced > 0.5
      ? smoothstep(0.0, 0.5, age) * step(0.0, 1.0 - u)
      : smoothstep(t - 0.01, t + 0.01, flightEase(u));
    float alpha = pinned > 0.5 ? 0.5 : drawn * fade * (1.0 - failAmount()) * (uReduced > 0.5 ? 0.6 : 0.2);

    if (alpha * vis < 0.003) {
      ${OFFSCREEN}
      return;
    }

    vec4 here = modelViewMatrix * vec4(arcPoint(t), 1.0);
    vec4 ahead = modelViewMatrix * vec4(arcPoint(t + 0.004), 1.0);
    vec3 tangent = normalize(ahead.xyz - here.xyz);
    vec3 normal = normalize(cross(tangent, normalize(here.xyz)));
    float pixels = (pinned > 0.5 ? 0.00105 : 0.00075) * sqrt(aStyle.x);
    here.xyz += normal * side * pixels * -here.z;

    vColor = aColor;
    vAlpha = alpha * vis;
    vSide = side;
    gl_Position = projectionMatrix * here;
  }
`;

export const ROUTE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSide;

  void main() {
    float edge = 1.0 - smoothstep(0.4, 1.0, abs(vSide));
    gl_FragColor = vec4(vColor * edge * vAlpha * 1.3, 1.0);
    #include <colorspace_fragment>
  }
`;

export const HEAD_VERTEX = /* glsl */ `
  ${COMMON}
  varying vec2 vQuad;
  varying vec3 vColor;
  varying float vIntensity;

  void main() {
    float u = heldProgress(flightProgress());
    float env = smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.96, 1.0, u));
    float vis = visibility();
    float fail = failAmount();
    if (uReduced > 0.5 || env * vis < 0.003 || fail >= 1.0) {
      ${OFFSCREEN}
      return;
    }
    vec4 center = modelViewMatrix * vec4(arcPoint(flightEase(u)), 1.0);
    center.xy += position.xy * 0.024 * (0.55 + aStyle.x * 0.55);
    vQuad = position.xy;
    vColor = failTint(aColor, fail);
    vIntensity = env * vis * (1.0 - fail);
    gl_Position = projectionMatrix * center;
  }
`;

export const HEAD_FRAGMENT = /* glsl */ `
  varying vec2 vQuad;
  varying vec3 vColor;
  varying float vIntensity;

  void main() {
    float r2 = dot(vQuad, vQuad);
    float core = exp(-r2 * 46.0);
    float halo = exp(-r2 * 6.5) * (1.0 - smoothstep(0.7, 1.0, r2));
    vec3 color = vec3(1.0) * core * 2.4 + vColor * (core * 1.4 + halo * 0.6);
    gl_FragColor = vec4(color * vIntensity, 1.0);
    #include <colorspace_fragment>
  }
`;

export const PULSE_VERTEX = /* glsl */ `
  ${COMMON}
  attribute float aEnd;
  varying vec2 vQuad;
  varying vec3 vColor;
  varying float vProgress;
  varying float vKind;
  varying float vVis;

  void main() {
    float vis = visibility();
    float age = aEnd < 0.5
      ? uTime - aTiming.x
      : uTime - aTiming.x - DELAY - aTiming.y * 0.98;
    float life = aEnd < 0.5 ? 0.85 : 1.15 + aStyle.x * 0.3;
    float progress = age / life;
    if (uReduced > 0.5 && aEnd < 0.5) progress = -1.0;
    if (aEnd > 0.5 && aTiming.z >= 0.0) progress = -1.0;
    if (progress < 0.0 || progress > 1.0 || vis < 0.003) {
      ${OFFSCREEN}
      return;
    }
    vec3 dir = aEnd < 0.5 ? aA : aB;
    vec3 helper = abs(dir.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(helper, dir));
    vec3 bitangent = cross(dir, tangent);
    float radius = (aEnd < 0.5 ? 0.03 : 0.052) * (0.6 + aStyle.x * 0.5);
    vec3 world = dir * 1.0045 + (tangent * position.x + bitangent * position.y) * radius;

    vQuad = position.xy;
    vColor = aColor;
    vProgress = progress;
    vKind = aEnd;
    vVis = vis;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

export const PULSE_FRAGMENT = /* glsl */ `
  varying vec2 vQuad;
  varying vec3 vColor;
  varying float vProgress;
  varying float vKind;
  varying float vVis;

  void main() {
    float r = length(vQuad);
    float grow = 1.0 - pow(1.0 - vProgress, 2.4);
    float width = 0.03 + 0.09 * vProgress;
    float ring = exp(-pow((r - grow * 0.92) / width, 2.0));
    float flash = exp(-r * r * 26.0) * pow(1.0 - vProgress, 3.0);
    float edge = 1.0 - smoothstep(0.86, 1.0, r);
    float strength = pow(1.0 - vProgress, 1.6);
    vec3 color = vColor * ring * strength * 0.9 + (vColor + 0.6) * flash * (vKind > 0.5 ? 1.2 : 0.5);
    gl_FragColor = vec4(color * edge * vVis, 1.0);
    #include <colorspace_fragment>
  }
`;
