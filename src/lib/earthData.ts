import { geoEquirectangular, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { latLngToUnit } from "./geo";

export interface EarthData {
  /** Equirectangular land mask. */
  land: HTMLCanvasElement;
  /** Evenly spaced points that fall on land: xyz + a random value per point. */
  dots: Float32Array;
  coast: Float32Array;
  borders: Float32Array;
}

const MASK_WIDTH = 3600;
const MASK_HEIGHT = 1800;
const LATTICE_POINTS = 64_000;
const DOT_RADIUS = 1.0015;
const LINE_RADIUS = 1.002;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function toSegments(lines: GeoJSON.MultiLineString): Float32Array {
  let segments = 0;
  for (const line of lines.coordinates) segments += line.length - 1;
  const out = new Float32Array(segments * 6);
  let offset = 0;
  for (const line of lines.coordinates) {
    for (let i = 0; i < line.length - 1; i += 1) {
      for (const [lng, lat] of [line[i], line[i + 1]]) {
        const [x, y, z] = latLngToUnit(lat, lng);
        out[offset++] = x * LINE_RADIUS;
        out[offset++] = y * LINE_RADIUS;
        out[offset++] = z * LINE_RADIUS;
      }
    }
  }
  return out;
}

function sampleDots(mask: Uint8ClampedArray): Float32Array {
  const points: number[] = [];
  for (let i = 0; i < LATTICE_POINTS; i += 1) {
    const y = 1 - (2 * (i + 0.5)) / LATTICE_POINTS;
    const lat = (Math.asin(y) * 180) / Math.PI;
    const lng = ((((i * GOLDEN_ANGLE * 180) / Math.PI + 180) % 360) + 360) % 360 - 180;
    const px = Math.min(MASK_WIDTH - 1, Math.floor(((lng + 180) / 360) * MASK_WIDTH));
    const py = Math.min(MASK_HEIGHT - 1, Math.floor(((90 - lat) / 180) * MASK_HEIGHT));
    if (mask[(py * MASK_WIDTH + px) * 4 + 3] < 128) continue;
    const [ux, uy, uz] = latLngToUnit(lat, lng);
    points.push(ux * DOT_RADIUS, uy * DOT_RADIUS, uz * DOT_RADIUS, ((i * 2654435761) % 4294967296) / 4294967296);
  }
  return Float32Array.from(points);
}

export async function loadEarthData(signal?: AbortSignal): Promise<EarthData> {
  const response = await fetch("/geo/countries-50m.json", { signal });
  if (!response.ok) throw new Error(`Map data request failed with ${response.status}`);
  const topology = (await response.json()) as Topology<{
    countries: GeometryCollection;
    land: GeometryCollection;
  }>;

  const land = document.createElement("canvas");
  land.width = MASK_WIDTH;
  land.height = MASK_HEIGHT;
  const context = land.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas is unavailable");

  const projection = geoEquirectangular()
    .scale(MASK_WIDTH / (2 * Math.PI))
    .translate([MASK_WIDTH / 2, MASK_HEIGHT / 2])
    .precision(0.5);
  context.fillStyle = "#fff";
  context.beginPath();
  geoPath(projection, context)(feature(topology, topology.objects.land));
  context.fill();

  const mask = context.getImageData(0, 0, MASK_WIDTH, MASK_HEIGHT).data;
  return {
    land,
    dots: sampleDots(mask),
    coast: toSegments(mesh(topology, topology.objects.land) as GeoJSON.MultiLineString),
    borders: toSegments(
      mesh(topology, topology.objects.countries, (a, b) => a !== b) as GeoJSON.MultiLineString,
    ),
  };
}
