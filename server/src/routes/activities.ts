import type { FastifyInstance } from "fastify";
import { db, tx } from "../db";
import { parseTrackFile } from "../lib/gpx";
import { lineDistance, type LngLat } from "../lib/geo";

export async function activitiesRoutes(app: FastifyInstance): Promise<void> {
  // Upload a GPX/TCX file -> parse -> store as an activity + track points.
  app.post("/api/activities/upload", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No file uploaded" });

    const buf = await file.toBuffer();
    const xml = buf.toString("utf-8");

    let tracks;
    try {
      tracks = parseTrackFile(xml, file.filename);
    } catch (err) {
      req.log.warn({ err }, "parse failed");
      return reply.code(400).send({ error: "Could not parse file as GPX or TCX" });
    }
    if (!tracks.length) {
      return reply.code(400).send({ error: "No usable tracks found in file" });
    }

    const insertActivity = db.prepare(
      `INSERT INTO activities (name, source, start_time, distance_m, created_at)
       VALUES (?, 'upload', ?, ?, ?)`,
    );
    const insertPoint = db.prepare(
      `INSERT INTO track_points (activity_id, seq, lat, lon, ele, t)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    const now = new Date().toISOString();
    const ids: number[] = [];
    tx(() => {
      for (const track of tracks) {
        const coords: LngLat[] = track.points.map((p) => [p.lon, p.lat]);
        const dist = lineDistance(coords);
        const info = insertActivity.run(
          track.name || file.filename || "Uploaded run",
          track.startTime ?? now,
          dist,
          now,
        );
        const id = Number(info.lastInsertRowid);
        ids.push(id);
        track.points.forEach((p, i) => {
          insertPoint.run(id, i, p.lat, p.lon, p.ele, p.t);
        });
      }
    });

    const totalPoints = tracks.reduce((s, t) => s + t.points.length, 0);
    return reply.code(201).send({
      activityIds: ids,
      tracks: tracks.length,
      points: totalPoints,
    });
  });

  // List activities (metadata).
  app.get("/api/activities", async () => {
    return db
      .prepare(
        `SELECT id, name, source, start_time, distance_m, created_at
         FROM activities ORDER BY start_time DESC`,
      )
      .all();
  });
}
