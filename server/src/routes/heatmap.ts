import type { FastifyInstance } from "fastify";
import { db } from "../db";

interface HeatQuery {
  from?: string; // ISO date (inclusive)
  to?: string; // ISO date (inclusive)
}

interface Cell {
  lon: number;
  lat: number;
  w: number;
}

export async function heatmapRoutes(app: FastifyInstance): Promise<void> {
  // Aggregated, binned heatmap points. Weight = number of track points that
  // fell in each ~11m grid cell, so popular corridors glow hotter.
  app.get<{ Querystring: HeatQuery }>("/api/heatmap", async (req) => {
    const { from, to } = req.query;
    const conds: string[] = [];
    const params: string[] = [];
    if (from) {
      conds.push("a.start_time >= ?");
      params.push(from);
    }
    if (to) {
      conds.push("a.start_time <= ?");
      // make `to` inclusive of the whole day if a bare date was passed
      params.push(to.length === 10 ? `${to}T23:59:59Z` : to);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const rows = db
      .prepare(
        `SELECT ROUND(tp.lon, 4) AS lon, ROUND(tp.lat, 4) AS lat, COUNT(*) AS w
         FROM track_points tp
         JOIN activities a ON a.id = tp.activity_id
         ${where}
         GROUP BY ROUND(tp.lon, 4), ROUND(tp.lat, 4)`,
      )
      .all(...params) as unknown as Cell[];

    let maxWeight = 1;
    const features = rows.map((c) => {
      if (c.w > maxWeight) maxWeight = c.w;
      return {
        type: "Feature" as const,
        properties: { weight: c.w },
        geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
      };
    });

    return {
      type: "FeatureCollection" as const,
      maxWeight,
      cells: features.length,
      features,
    };
  });
}
