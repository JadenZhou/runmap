export type Units = "metric" | "imperial";

export const MI = 1609.344; // meters per mile
export const FT = 0.3048; // meters per foot

/** Human-readable distance, e.g. "3.73 mi" or "6.00 km". */
export function formatDistance(m: number | null, units: Units): string {
  if (m == null) return "—";
  return units === "imperial" ? `${(m / MI).toFixed(2)} mi` : `${(m / 1000).toFixed(2)} km`;
}

/** Human-readable elevation, e.g. "118 ft" or "36 m". */
export function formatElevation(m: number | null, units: Units): string {
  if (m == null) return "—";
  return units === "imperial" ? `${Math.round(m / FT)} ft` : `${Math.round(m)} m`;
}

// --- chart axis helpers ---

export function distanceValue(m: number, units: Units): number {
  return units === "imperial" ? m / MI : m / 1000;
}

export function distanceUnitLabel(units: Units): string {
  return units === "imperial" ? "mi" : "km";
}

export function elevationValue(m: number, units: Units): number {
  return units === "imperial" ? m / FT : m;
}

export function elevationUnitLabel(units: Units): string {
  return units === "imperial" ? "ft" : "m";
}
