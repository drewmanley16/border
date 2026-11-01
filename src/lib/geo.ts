export const DEG = Math.PI / 180;
export type Vec3 = [number, number, number];

/** Unit vector for a coordinate. Longitude 0 faces +z and north is +y. */
export function latLngToUnit(lat: number, lng: number): Vec3 {
  const phi = lat * DEG;
  const lambda = lng * DEG;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.sin(lambda), Math.sin(phi), cosPhi * Math.cos(lambda)];
}

export function angularDistance(a: Vec3, b: Vec3): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

/** Point on the great circle between two unit vectors. */
export function slerpUnit(a: Vec3, b: Vec3, t: number): Vec3 {
  const omega = angularDistance(a, b);
  if (omega < 1e-5) return a;
  const s = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / s;
  const wb = Math.sin(t * omega) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

/** Peak height of an arc above the surface. Longer routes climb higher. */
export function arcLift(omega: number): number {
  return 0.05 + 0.5 * Math.pow(omega / Math.PI, 0.85);
}

const DEFAULT_SETTLEMENT_MS = 3000;

/**
 * Simulated milliseconds a star spends in flight. It tracks settlement time, so
 * Ethereum drifts while Solana snaps, and stretches slightly with distance.
 */
export function flightMs(expectedSettlementMs: number | undefined, omega: number): number {
  const base = Math.min(8000, Math.max(1500, expectedSettlementMs ?? DEFAULT_SETTLEMENT_MS));
  return base * (0.85 + 0.5 * (omega / Math.PI));
}
