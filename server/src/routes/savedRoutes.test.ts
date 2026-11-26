import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import Fastify, { type FastifyInstance } from "fastify";

// db.ts opens DB_PATH when first imported, so set it before importing anything
// that uses the database.
const dir = mkdtempSync(join(tmpdir(), "runmap-test-"));
process.env.DB_PATH = join(dir, "test.db");

// Start from the routes table as the first release created it (no waypoints
// column), with one route saved, to check the upgrade path.
const old = new DatabaseSync(process.env.DB_PATH);
old.exec(`
  CREATE TABLE routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    distance_m REAL NOT NULL,
    elevation_gain_m REAL NOT NULL,
    geometry_json TEXT NOT NULL,
    elevation_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  INSERT INTO routes (name, distance_m, elevation_gain_m, geometry_json, elevation_json, created_at)
  VALUES ('old route', 100, 5, '[[0,0],[0,0.001]]', '[]', '2026-11-04T00:00:00.000Z');
`);
old.close();

let app: FastifyInstance;

before(async () => {
  const { migrate } = await import("../db");
  const { savedRoutesRoutes } = await import("./savedRoutes");
  migrate();
  migrate(); // safe to run on every boot
  app = Fastify();
  await app.register(savedRoutesRoutes);
});

after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const ROUTE = {
  name: "loop",
  coordinates: [
    [-71.06, 42.36],
    [-71.061, 42.361],
    [-71.062, 42.362],
  ],
  distance_m: 250,
  elevation_gain_m: 3,
  elevation_profile: [],
};

describe("saved routes", () => {
  it("keeps the waypoints a route was built from", async () => {
    const waypoints = [
      [-71.06, 42.36],
      [-71.062, 42.362],
    ];
    const saved = await app.inject({
      method: "POST",
      url: "/api/routes",
      payload: { ...ROUTE, waypoints },
    });
    assert.equal(saved.statusCode, 201);

    const got = await app.inject({ method: "GET", url: `/api/routes/${saved.json().id}` });
    assert.deepEqual(got.json().waypoints, waypoints);
    assert.deepEqual(got.json().coordinates, ROUTE.coordinates);
  });

  it("still accepts a route saved without waypoints", async () => {
    const saved = await app.inject({ method: "POST", url: "/api/routes", payload: ROUTE });
    assert.equal(saved.statusCode, 201);
    const got = await app.inject({ method: "GET", url: `/api/routes/${saved.json().id}` });
    assert.equal(got.json().waypoints, null);
  });

  it("rejects a waypoints list with fewer than 2 points", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/routes",
      payload: { ...ROUTE, waypoints: [[-71.06, 42.36]] },
    });
    assert.equal(res.statusCode, 400);
  });

  it("opens routes saved before waypoints were kept, with waypoints null", async () => {
    const list = (await app.inject({ method: "GET", url: "/api/routes" })).json();
    const oldRoute = list.find((r: { name: string }) => r.name === "old route");
    const got = await app.inject({ method: "GET", url: `/api/routes/${oldRoute.id}` });
    assert.equal(got.statusCode, 200);
    assert.equal(got.json().waypoints, null);
    assert.deepEqual(got.json().coordinates, [
      [0, 0],
      [0, 0.001],
    ]);
  });
});
