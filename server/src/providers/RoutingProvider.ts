import { readFile } from "node:fs/promises";
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
const USER_AGENT = "RunMap/1.0 (self-hosted demo)";

/** A non-2xx answer from an upstream service (as opposed to a timeout). */
export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    statusText: string,
  ) {
    super(`Upstream ${status} ${statusText}`);
  }
}

/** The parts of BRouter's GeoJSON answer that we read. */
interface BRouterTrack {
  features?: {
    properties?: { "track-length"?: string };
    geometry?: { coordinates?: number[][] };
  }[];
}

/** BRouter's answer to a profile upload. */
interface BRouterUpload {
  profileid?: string;
  error?: string;
}

/** The parts of OSRM's answer that we read. */
interface OsrmRoute {
  code?: string;
  routes?: { distance?: number; geometry?: { coordinates?: number[][] } }[];
}

/** Fetch JSON. `T` describes what we expect back; it isn't checked at runtime. */
async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": USER_AGENT, ...init.headers },
  });
  if (!res.ok) throw new UpstreamError(res.status, res.statusText);
  return (await res.json()) as T;
}

/** Profiles that ship with RunMap, as server/profiles/<name>.brf. */
const LOCAL_PROFILES = new Set(["running"]);

async function readLocalProfile(name: string): Promise<string> {
  return readFile(new URL(`../../profiles/${name}.brf`, import.meta.url), "utf8");
}

/**
 * BRouter public server — keyless, supports true pedestrian/foot profiles
 * (follows sidewalks and trails, not just drivable roads). Default provider.
 * Docs: https://brouter.de/brouter-web/
 *
 * The default profile, `running`, is RunMap's own (server/profiles/running.brf).
 * BRouter doesn't know it, so it's uploaded on first use, the same way
 * brouter-web handles custom profiles. BRouter answers with a "custom_<n>" id
 * to route with. Set BROUTER_PROFILE to use one of BRouter's built-in profiles
 * (e.g. hiking-beta, trekking) instead.
 */
export class BRouterProvider implements RoutingProvider {
  readonly name = "brouter";
  private readonly profile: string;
  private readonly base: string;
  private readonly loadProfile: (name: string) => Promise<string>;
  /** Pending or finished upload of a local profile, resolving to its custom id. */
  private uploaded: Promise<string> | null = null;

  constructor(
    opts: {
      profile?: string;
      base?: string;
      loadProfile?: (name: string) => Promise<string>;
    } = {},
  ) {
    this.profile = opts.profile ?? process.env.BROUTER_PROFILE ?? "running";
    this.base = opts.base ?? process.env.BROUTER_URL ?? "https://brouter.de/brouter";
    this.loadProfile = opts.loadProfile ?? readLocalProfile;
  }

  async route(waypoints: LngLat[]): Promise<RoutingResult> {
    if (!LOCAL_PROFILES.has(this.profile)) return this.request(waypoints, this.profile);
    try {
      return await this.request(waypoints, await this.customProfileId());
    } catch (err) {
      // Uploaded profiles don't live forever on the public server. Routing with
      // an id it no longer has gets a bare HTTP 500, so upload again and retry
      // once. Timeouts and other failures aren't retried.
      if (!(err instanceof UpstreamError) || err.status !== 500) throw err;
      this.uploaded = null;
      return this.request(waypoints, await this.customProfileId());
    }
  }

  private customProfileId(): Promise<string> {
    this.uploaded ??= this.uploadProfile().catch((err) => {
      this.uploaded = null; // let the next request try again
      throw err;
    });
    return this.uploaded;
  }

  private async uploadProfile(): Promise<string> {
    const text = await this.loadProfile(this.profile);
    const json = await fetchJson<BRouterUpload>(`${this.base}/profile`, {
      method: "POST",
      body: text,
      headers: { "Content-Type": "text/plain" },
    });
    // BRouter returns an id even for a profile it can't parse, plus an error.
    if (json?.error || typeof json?.profileid !== "string") {
      throw new Error(`BRouter rejected profile "${this.profile}": ${json?.error ?? "no id"}`);
    }
    return json.profileid;
  }

  private async request(waypoints: LngLat[], profile: string): Promise<RoutingResult> {
    const lonlats = waypoints.map(([lon, lat]) => `${lon},${lat}`).join("|");
    const url = `${this.base}?lonlats=${encodeURIComponent(lonlats)}&profile=${encodeURIComponent(profile)}&alternativeidx=0&format=geojson`;
    const json = await fetchJson<BRouterTrack>(url);
    const feature = json?.features?.[0];
    const coords = feature?.geometry?.coordinates;
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
    const json = await fetchJson<OsrmRoute>(url);
    if (json?.code !== "Ok") throw new Error(`OSRM error: ${json?.code ?? "unknown"}`);
    const route = json.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (!coords?.length) throw new Error("OSRM returned no geometry");

    const coordinates = coords.map((c) => [c[0], c[1]] as LngLat);
    const reported = route?.distance;
    const distance_m =
      typeof reported === "number" && Number.isFinite(reported)
        ? reported
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
