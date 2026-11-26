import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? resolve(__dirname, "../data/runmap.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

/**
 * Run `fn` inside a transaction. The body MUST be fully synchronous (no await)
 * so BEGIN/COMMIT can't interleave with another request's transaction.
 */
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Create tables if they don't exist. Safe to call on every boot. */
export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      distance_m REAL NOT NULL,
      elevation_gain_m REAL NOT NULL,
      geometry_json TEXT NOT NULL,      -- GeoJSON LineString coordinates
      elevation_json TEXT NOT NULL,     -- [{ dist_m, ele_m }]
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('seed','upload')),
      start_time TEXT NOT NULL,
      distance_m REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS track_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      ele REAL,
      t TEXT,
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_track_points_activity ON track_points(activity_id);

    CREATE TABLE IF NOT EXISTS elevation_cache (
      coord_key TEXT PRIMARY KEY,
      ele_m REAL NOT NULL
    );
  `);

  // Added after the first release. Routes saved before it have NULL here and
  // open view-only, since their waypoints weren't kept.
  addColumnIfMissing("routes", "waypoints_json", "TEXT"); // [[lon, lat], ...]
}

function addColumnIfMissing(table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function activityCount(): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM activities").get() as { n: number };
  return row.n;
}
