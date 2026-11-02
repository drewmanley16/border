export const DEG = Math.PI / 180;
export type Vec3 = [number, number, number];

/** Unit vector for a coordinate. Longitude 0 faces +z and north is +y. */
export function latLngToUnit(lat: number, lng: number): Vec3 {
  const phi = lat * DEG;
  const lambda = lng * DEG;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.sin(lambda), Math.sin(phi), cosPhi * Math.cos(lambda)];
}
