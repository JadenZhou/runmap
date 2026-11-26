import type { FastifyInstance } from "fastify";
import { getRoutingProvider } from "../providers/RoutingProvider";
import { LegRouter } from "../lib/legs";
import { getElevationProvider } from "../providers/ElevationProvider";
import { haversine, elevationGain, type LngLat } from "../lib/geo";

interface RouteBody {
  waypoints: LngLat[];
}

export interface ElevationProfilePoint {
  dist_m: number;
  ele_m: number;
}

/** Evenly sample up to `max` points along a polyline, with cumulative distance. */
function sampleWithDistance(
  coords: LngLat[],
  max = 100,
): { coord: LngLat; dist_m: number }[] {
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  if (coords.length <= max) {
    return coords.map((coord, i) => ({ coord, dist_m: cum[i] }));
  }
  const out: { coord: LngLat; dist_m: number }[] = [];
  const stride = (coords.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * stride);
    out.push({ coord: coords[idx], dist_m: cum[idx] });
  }
  return out;
}

export async function routingRoutes(app: FastifyInstance): Promise<void> {
  const router = new LegRouter(getRoutingProvider());

  // Preview/build a route: snap waypoints + compute distance + elevation profile.
  app.post<{ Body: RouteBody }>("/api/route", async (req, reply) => {
    const waypoints = req.body?.waypoints;
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return reply.code(400).send({ error: "Need at least 2 waypoints" });
    }

    let routed;
    try {
      routed = await router.route(waypoints);
    } catch (err) {
      req.log.warn({ err }, "routing failed");
      return reply.code(502).send({
        error: `Routing service unavailable (${router.name}). Try again, or set ROUTING_PROVIDER to switch.`,
      });
    }

    // Elevation profile (best-effort; degrades gracefully).
    const samples = sampleWithDistance(routed.coordinates, 100);
    const elev = getElevationProvider();
    const { elevations, degraded } = await elev.lookup(samples.map((s) => s.coord));

    const profile: ElevationProfilePoint[] = [];
    const eleVals: number[] = [];
    samples.forEach((s, i) => {
      const ele = elevations[i];
      if (typeof ele === "number") {
        profile.push({ dist_m: Math.round(s.dist_m), ele_m: Math.round(ele * 10) / 10 });
        eleVals.push(ele);
      }
    });

    return {
      coordinates: routed.coordinates,
      distance_m: Math.round(routed.distance_m),
      provider: routed.provider,
      snapped: routed.snapped,
      legs: routed.legs,
      elevation: {
        profile,
        gain_m: Math.round(elevationGain(eleVals)),
        degraded,
      },
    };
  });
}
