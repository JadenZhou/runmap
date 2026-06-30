import { lineDistance, type LngLat } from "../lib/geo";

export interface RoutingResult {
  /** Snapped polyline as [lon, lat] pairs. */
  coordinates: LngLat[];
  distance_m: number;
  provider: string;
}

export interface RoutingProvider {
  readonly name: string;
  /** Snap a list of waypoints (>= 2) to the path network. Throws on failure. */
  route(waypoints: LngLat[]): Promise<RoutingResult>;
}

const TIMEOUT_MS = Number(process.env.ROUTING_TIMEOUT_MS ?? 12000);

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "RunMap/1.0 (self-hosted demo)" },
  });
  if (!res.ok) throw new Error(`Upstream ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * BRouter public server — keyless, supports true pedestrian/foot profiles
 * (follows sidewalks and trails, not just drivable roads). Default provider.
 * Docs: https://brouter.de/brouter-web/
 */
class BRouterProvider implements RoutingProvider {
  readonly name = "brouter";
  private profile = process.env.BROUTER_PROFILE ?? "hiking-beta";
  private base = process.env.BROUTER_URL ?? "https://brouter.de/brouter";

  async route(waypoints: LngLat[]): Promise<RoutingResult> {
    const lonlats = waypoints.map(([lon, lat]) => `${lon},${lat}`).join("|");
    const url = `${this.base}?lonlats=${encodeURIComponent(lonlats)}&profile=${this.profile}&alternativeidx=0&format=geojson`;
    const json = await fetchJson(url);
    const feature = json?.features?.[0];
    const coords = feature?.geometry?.coordinates as number[][] | undefined;
    if (!coords?.length) throw new Error("BRouter returned no geometry");

    const coordinates = coords.map((c) => [c[0], c[1]] as LngLat);
    const reported = Number(feature?.properties?.["track-length"]);
    const distance_m = Number.isFinite(reported) ? reported : lineDistance(coordinates);
    return { coordinates, distance_m, provider: this.name };
  }
}

/**
 * OSRM public demo server. NOTE: the public demo only hosts the *driving*
 * profile, so it snaps to drivable roads rather than foot paths. Kept as a
 * swappable fallback (set ROUTING_PROVIDER=osrm). Point OSRM_URL at a
 * self-hosted foot instance for proper running routes.
 */
class OsrmProvider implements RoutingProvider {
  readonly name = "osrm";
  private profile = process.env.OSRM_PROFILE ?? "driving";
  private base = process.env.OSRM_URL ?? "https://router.project-osrm.org";

  async route(waypoints: LngLat[]): Promise<RoutingResult> {
    const coordsParam = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(";");
    const url = `${this.base}/route/v1/${this.profile}/${coordsParam}?overview=full&geometries=geojson`;
    const json = await fetchJson(url);
    if (json?.code !== "Ok") throw new Error(`OSRM error: ${json?.code ?? "unknown"}`);
    const route = json.routes?.[0];
    const coords = route?.geometry?.coordinates as number[][] | undefined;
    if (!coords?.length) throw new Error("OSRM returned no geometry");

    const coordinates = coords.map((c) => [c[0], c[1]] as LngLat);
    const distance_m = Number.isFinite(route.distance)
      ? route.distance
      : lineDistance(coordinates);
    return { coordinates, distance_m, provider: this.name };
  }
}

let cached: RoutingProvider | null = null;

export function getRoutingProvider(): RoutingProvider {
  if (cached) return cached;
  const which = (process.env.ROUTING_PROVIDER ?? "brouter").toLowerCase();
  cached = which === "osrm" ? new OsrmProvider() : new BRouterProvider();
  return cached;
}
