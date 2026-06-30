import { db, tx } from "../db";
import { binKey, type LngLat } from "../lib/geo";

export interface ElevationResult {
  /** One elevation (meters) per input coord; null where unknown. */
  elevations: (number | null)[];
  /** True if the upstream lookup failed and values were stubbed. */
  degraded: boolean;
}

export interface ElevationProvider {
  readonly name: string;
  lookup(coords: LngLat[]): Promise<ElevationResult>;
}

const TIMEOUT_MS = Number(process.env.ELEVATION_TIMEOUT_MS ?? 12000);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Open-Meteo Elevation API — keyless, no signup, fast, up to 100 coords per
 * request. More reliable than open-elevation. Results are cached in SQLite by
 * rounded coordinate so repeated lookups (e.g. re-routing) avoid the network.
 * On failure it degrades gracefully: cached values are kept, the rest are null,
 * and `degraded: true` is returned so the UI can say "elevation unavailable".
 */
class OpenMeteoProvider implements ElevationProvider {
  readonly name = "open-meteo";
  private base = process.env.ELEVATION_URL ?? "https://api.open-meteo.com/v1/elevation";

  private getCached = db.prepare("SELECT ele_m FROM elevation_cache WHERE coord_key = ?");
  private putCached = db.prepare(
    "INSERT OR REPLACE INTO elevation_cache (coord_key, ele_m) VALUES (?, ?)",
  );

  async lookup(coords: LngLat[]): Promise<ElevationResult> {
    const elevations: (number | null)[] = new Array(coords.length).fill(null);
    const missing: { idx: number; lon: number; lat: number; key: string }[] = [];

    coords.forEach(([lon, lat], idx) => {
      const key = binKey(lon, lat, 5);
      const row = this.getCached.get(key) as { ele_m: number } | undefined;
      if (row) elevations[idx] = row.ele_m;
      else missing.push({ idx, lon, lat, key });
    });

    if (missing.length === 0) return { elevations, degraded: false };

    let degraded = false;
    for (const group of chunk(missing, 100)) {
      try {
        const lats = group.map((g) => g.lat).join(",");
        const lons = group.map((g) => g.lon).join(",");
        const url = `${this.base}?latitude=${lats}&longitude=${lons}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) throw new Error(`Elevation upstream ${res.status}`);
        const json = (await res.json()) as { elevation?: number[] };
        const eles = json.elevation ?? [];
        tx(() => {
          group.forEach((g, i) => {
            const ele = eles[i];
            if (typeof ele === "number") {
              elevations[g.idx] = ele;
              this.putCached.run(g.key, ele);
            }
          });
        });
      } catch {
        degraded = true; // leave this group's values as null
      }
    }

    return { elevations, degraded };
  }
}

let cached: ElevationProvider | null = null;

export function getElevationProvider(): ElevationProvider {
  if (cached) return cached;
  cached = new OpenMeteoProvider();
  return cached;
}
