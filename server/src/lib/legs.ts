import { lineDistance, pointAlong, type LngLat } from "./geo";
import type { RoutingProvider, RoutingResult } from "../providers/RoutingProvider";

export interface LegSummary {
  distance_m: number;
  /** Halfway along the leg's path, where the client puts its "+" handle. */
  midpoint: LngLat;
}

export interface LegRoute {
  coordinates: LngLat[];
  distance_m: number;
  provider: string;
  /** Where each waypoint attached to the path network, one per waypoint. */
  snapped: LngLat[];
  /** One per pair of consecutive waypoints. */
  legs: LegSummary[];
}

/**
 * Routes each leg (waypoint i to i+1) on its own and caches the results, so
 * adding or moving one waypoint only re-routes the legs that touch it.
 * BRouter routes a multi-point request leg by leg anyway, so the joined path
 * is the same as asking for all the waypoints at once.
 */
export class LegRouter {
  /** Promises, so two requests for the same leg share one upstream call. */
  private cache = new Map<string, Promise<RoutingResult>>();

  constructor(
    private readonly router: RoutingProvider,
    private readonly opts = { cacheSize: 500, concurrency: 4 },
  ) {}

  get name(): string {
    return this.router.name;
  }

  async route(waypoints: LngLat[]): Promise<LegRoute> {
    const pairs = waypoints.slice(1).map((b, i) => [waypoints[i], b] as const);
    const legs = await mapLimit(pairs, this.opts.concurrency, ([a, b]) => this.leg(a, b));

    const coordinates: LngLat[] = [];
    for (const leg of legs) {
      const last = coordinates[coordinates.length - 1];
      const first = leg.coordinates[0];
      // Consecutive legs share the waypoint they meet at; keep one copy.
      const skip = last && last[0] === first[0] && last[1] === first[1] ? 1 : 0;
      coordinates.push(...leg.coordinates.slice(skip));
    }

    return {
      coordinates,
      distance_m: legs.reduce((sum, l) => sum + l.distance_m, 0),
      provider: legs[0].provider,
      snapped: [
        legs[0].coordinates[0],
        ...legs.map((l) => l.coordinates[l.coordinates.length - 1]),
      ],
      legs: legs.map((l) => ({
        distance_m: Math.round(l.distance_m),
        midpoint: pointAlong(l.coordinates, lineDistance(l.coordinates) / 2),
      })),
    };
  }

  private leg(a: LngLat, b: LngLat): Promise<RoutingResult> {
    const key = `${a[0]},${a[1]};${b[0]},${b[1]}`;
    const hit = this.cache.get(key);
    if (hit) {
      // Re-insert so the Map's order stays least-recently-used first.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const pending = this.router.route([a, b]);
    pending.catch(() => {
      if (this.cache.get(key) === pending) this.cache.delete(key); // don't cache failures
    });
    this.cache.set(key, pending);
    while (this.cache.size > this.opts.cacheSize) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    return pending;
  }
}

/** Like Promise.all(items.map(fn)), with at most `limit` calls in flight. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
