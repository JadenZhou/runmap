import { db, migrate, activityCount, tx } from "./db";
import { lineDistance, type LngLat } from "./lib/geo";

// Boston hot spots. `weight` controls how many runs cluster here, so the
// heatmap shows realistic bright corridors (Esplanade, the Common, ...).
const HOTSPOTS = [
  { name: "Charles River Esplanade", lon: -71.089, lat: 42.354, weight: 4 },
  { name: "Boston Common & Public Garden", lon: -71.066, lat: 42.355, weight: 3 },
  { name: "Back Bay", lon: -71.081, lat: 42.35, weight: 2 },
  { name: "Seaport & Harborwalk", lon: -71.044, lat: 42.352, weight: 2 },
  { name: "Cambridge / Memorial Drive", lon: -71.105, lat: 42.36, weight: 3 },
];

const TOTAL_RUNS = Number(process.env.SEED_RUNS ?? 75);

function pickHotspot() {
  const pool: typeof HOTSPOTS = [];
  for (const h of HOTSPOTS) for (let i = 0; i < h.weight; i++) pool.push(h);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Build one run as a momentum-biased random walk so it reads like a path. */
function makeRun(): { coords: LngLat[]; eles: number[] } {
  const spot = pickHotspot();
  // start within ~400m of the hotspot
  let lon = spot.lon + (Math.random() - 0.5) * 0.008;
  let lat = spot.lat + (Math.random() - 0.5) * 0.008;

  const n = 120 + Math.floor(Math.random() * 220); // ~120–340 points
  const step = 0.00025 + Math.random() * 0.00035; // ~25–65m per step
  let heading = Math.random() * Math.PI * 2;

  const coords: LngLat[] = [[lon, lat]];
  const eles: number[] = [3 + Math.random() * 4];

  for (let i = 1; i < n; i++) {
    // mostly keep heading (momentum), occasionally turn — and curl back near
    // the midpoint so runs tend to loop rather than wander off forever.
    heading += (Math.random() - 0.5) * 0.5;
    if (i > n / 2) heading += 0.04; // gentle curl home on the back half
    lon += Math.cos(heading) * step;
    lat += Math.sin(heading) * step * 0.78; // lon-degrees are shorter this far north
    coords.push([lon, lat]);
    eles.push(Math.max(0, eles[i - 1] + (Math.random() - 0.5) * 1.5));
  }
  return { coords, eles };
}

function isoDaysAgo(days: number): string {
  const ms = Date.now() - days * 86400_000;
  return new Date(ms).toISOString();
}

export function seed(): number {
  migrate();

  const insertActivity = db.prepare(
    `INSERT INTO activities (name, source, start_time, distance_m, created_at)
     VALUES (?, 'seed', ?, ?, ?)`,
  );
  const insertPoint = db.prepare(
    `INSERT INTO track_points (activity_id, seq, lat, lon, ele, t)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  tx(() => {
    for (let r = 0; r < TOTAL_RUNS; r++) {
      const { coords, eles } = makeRun();
      const dist = lineDistance(coords);
      const daysAgo = Math.floor(Math.random() * 120); // spread across ~4 months
      const start = isoDaysAgo(daysAgo);
      const info = insertActivity.run(
        `Morning run #${r + 1}`,
        start,
        dist,
        new Date().toISOString(),
      );
      const activityId = Number(info.lastInsertRowid);
      coords.forEach((c, i) => {
        insertPoint.run(activityId, i, c[1], c[0], eles[i], null);
      });
    }
  });
  return TOTAL_RUNS;
}

/** Seed only if the DB has no activities yet (called on server boot). */
export function seedIfEmpty(): void {
  migrate();
  if (activityCount() === 0) {
    const n = seed();
    console.log(`[seed] inserted ${n} synthetic Boston runs (DB was empty)`);
  }
}

// CLI: `npm run seed`
if (process.argv.includes("--run")) {
  const n = seed();
  console.log(`[seed] inserted ${n} synthetic Boston runs`);
}
