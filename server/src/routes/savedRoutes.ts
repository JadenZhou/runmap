import type { FastifyInstance } from "fastify";
import { db } from "../db";
import { buildGpx } from "../lib/gpx";
import type { ElevationProfilePoint } from "./routing";
import type { LngLat } from "../lib/geo";

interface SaveBody {
  name: string;
  coordinates: LngLat[];
  distance_m: number;
  elevation_gain_m?: number;
  elevation_profile?: ElevationProfilePoint[];
}

interface RouteRow {
  id: number;
  name: string;
  distance_m: number;
  elevation_gain_m: number;
  geometry_json: string;
  elevation_json: string;
  created_at: string;
}

export async function savedRoutesRoutes(app: FastifyInstance): Promise<void> {
  // Save a built route.
  app.post<{ Body: SaveBody }>("/api/routes", async (req, reply) => {
    const { name, coordinates, distance_m } = req.body ?? ({} as SaveBody);
    if (!name?.trim() || !Array.isArray(coordinates) || coordinates.length < 2) {
      return reply.code(400).send({ error: "name and >= 2 coordinates required" });
    }
    const info = db
      .prepare(
        `INSERT INTO routes (name, distance_m, elevation_gain_m, geometry_json, elevation_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        name.trim(),
        Math.round(distance_m ?? 0),
        Math.round(req.body.elevation_gain_m ?? 0),
        JSON.stringify(coordinates),
        JSON.stringify(req.body.elevation_profile ?? []),
        new Date().toISOString(),
      );
    return reply.code(201).send({ id: Number(info.lastInsertRowid) });
  });

  // List saved routes (metadata only).
  app.get("/api/routes", async () => {
    const rows = db
      .prepare(
        `SELECT id, name, distance_m, elevation_gain_m, created_at
         FROM routes ORDER BY created_at DESC`,
      )
      .all();
    return rows;
  });

  // Get one route with full geometry + elevation profile.
  app.get<{ Params: { id: string } }>("/api/routes/:id", async (req, reply) => {
    const row = db
      .prepare("SELECT * FROM routes WHERE id = ?")
      .get(req.params.id) as RouteRow | undefined;
    if (!row) return reply.code(404).send({ error: "Not found" });
    return {
      id: row.id,
      name: row.name,
      distance_m: row.distance_m,
      elevation_gain_m: row.elevation_gain_m,
      coordinates: JSON.parse(row.geometry_json),
      elevation_profile: JSON.parse(row.elevation_json),
      created_at: row.created_at,
    };
  });

  // Delete a route.
  app.delete<{ Params: { id: string } }>("/api/routes/:id", async (req, reply) => {
    db.prepare("DELETE FROM routes WHERE id = ?").run(req.params.id);
    return reply.code(204).send();
  });

  // Export a route as a downloadable GPX file.
  app.get<{ Params: { id: string } }>("/api/routes/:id/gpx", async (req, reply) => {
    const row = db
      .prepare("SELECT * FROM routes WHERE id = ?")
      .get(req.params.id) as RouteRow | undefined;
    if (!row) return reply.code(404).send({ error: "Not found" });

    const coords = JSON.parse(row.geometry_json) as LngLat[];
    const profile = JSON.parse(row.elevation_json) as ElevationProfilePoint[];
    // Map the sparse elevation profile back onto coords by nearest index.
    const eles: (number | null)[] = coords.map((_, i) => {
      if (!profile.length) return null;
      const frac = coords.length > 1 ? i / (coords.length - 1) : 0;
      const p = profile[Math.round(frac * (profile.length - 1))];
      return p ? p.ele_m : null;
    });

    const gpx = buildGpx(row.name, coords, eles);
    const safe = row.name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "route";
    reply
      .header("Content-Type", "application/gpx+xml")
      .header("Content-Disposition", `attachment; filename="${safe}.gpx"`)
      .send(gpx);
  });
}
