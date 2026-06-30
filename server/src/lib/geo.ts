export type LngLat = [number, number]; // [lon, lat]

const R = 6371000; // earth radius, meters

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Great-circle distance between two [lon,lat] points in meters. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(a[0] === b[0] ? 0 : b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Total length in meters of a [lon,lat] polyline. */
export function lineDistance(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  return total;
}

/**
 * Bin a coordinate to a grid for heatmap aggregation.
 * 4 decimals ≈ 11m at the equator — fine enough for a city heatmap.
 */
export function binKey(lon: number, lat: number, decimals = 4): string {
  return `${lon.toFixed(decimals)},${lat.toFixed(decimals)}`;
}

/** Sum of positive elevation deltas (total gain) in meters. */
export function elevationGain(eles: number[]): number {
  let gain = 0;
  for (let i = 1; i < eles.length; i++) {
    const d = eles[i] - eles[i - 1];
    if (d > 0) gain += d;
  }
  return gain;
}
