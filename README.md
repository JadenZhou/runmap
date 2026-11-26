# RunMap

A Strava-inspired web app with two features:

1. **Route builder** — click a map to drop waypoints; they snap to the
   running/walking path network. See live distance, an elevation profile, and
   total gain. Save routes, reopen them, and export to GPX.
2. **Activity heatmap** — many GPS tracks aggregated into a density overlay so
   popular corridors glow hotter. Toggle it on/off and filter by date.

**No API keys, no signups, no paid services anywhere.**

## Quick start

```bash
npm install        # installs both workspaces (client + server)
npm run dev        # starts API (:3001) and the web app (:5173)
```

Then open **http://localhost:5173**.

On first launch the server creates a SQLite DB and **auto-seeds ~75 synthetic
runs around Boston**, so the heatmap is populated immediately — fully offline,
no network needed for seeding.

> Requires Node 22.13 or newer, because the server uses Node's built-in
> `node:sqlite`. With nvm, run `nvm use` first (the repo has an `.nvmrc`).

## What you can do

- **Build a route:** make sure *Build mode* is on, click ≥2 points on the map.
  The line snaps to paths, distance + elevation update live. Drag a numbered
  waypoint to move it — the route re-snaps. Undo / Clear as needed.
- **Save & reload:** name it, click *Save*. It appears under *Saved routes*;
  click any saved route to redraw it on the map.
- **Export GPX:** with a saved route open, click *Export this route as GPX*.
- **Upload:** drop a `.gpx`/`.tcx` file under *Upload activity* — it's parsed
  server-side and folded into the heatmap. Try `samples/sample-run.gpx`.
- **Heatmap dates:** set From/To and *Apply* to filter the heatmap by activity date.

## Where data lives

SQLite file at `server/data/runmap.db` (gitignored). Delete it to reset; the
server re-seeds on next boot. Re-seed manually with `npm run seed`.

Tables: `routes`, `activities`, `track_points`, `elevation_cache`.

## Architecture

```
runmap/
  client/   React + TypeScript + Vite + MapLibre GL (react-map-gl) + Recharts
  server/   Fastify + TypeScript + node:sqlite
```

The Vite dev server proxies `/api/*` to the Fastify server on port 3001.

### External services (all keyless) — and how to swap them

Every external dependency sits behind a small interface and degrades gracefully
(the app keeps running and shows a message rather than crashing) if a public
endpoint is slow or down.

| Concern   | Default                      | Swap via                                           |
|-----------|------------------------------|----------------------------------------------------|
| Map tiles | OpenFreeMap `liberty` style  | `MAP_STYLE` constant in `client/src/components/MapView.tsx` |
| Routing   | **BRouter**, RunMap's `running` profile | `ROUTING_PROVIDER=osrm` env var (see note below)   |
| Elevation | **Open-Meteo Elevation API** | `ElevationProvider` in `server/src/providers/`     |

**Routing note (intentional deviation):** the OSRM *public demo* server only
hosts the **driving** profile, which snaps to drivable roads — wrong for running.
So the default routing provider is **BRouter** (`brouter.de`), which is also
keyless and follows sidewalks/trails. OSRM is still shipped behind the same
`RoutingProvider` interface; select it with `ROUTING_PROVIDER=osrm`, and point
`OSRM_URL` at a self-hosted *foot* instance for proper running routes. To swap
to a paid provider later (e.g. Mapbox), add another `RoutingProvider`
implementation in `server/src/providers/RoutingProvider.ts`.

**Running profile:** routes use `server/profiles/running.brf`, a copy of
BRouter's `hiking-beta` that doesn't avoid ordinary roads. `hiking-beta` made
runs detour through parking lots and footpaths, because OSM often has no
sidewalk tag on suburban roads and the hiking profile then charges up to 10×
for them. The server uploads the profile to BRouter on first use (that's how
brouter-web handles custom profiles too) and uploads it again if BRouter has
dropped it. Set `BROUTER_PROFILE` to a built-in profile such as `trekking` to
use that instead.

Useful env vars (all optional): `SERVER_PORT`, `ROUTING_PROVIDER`,
`BROUTER_PROFILE`, `OSRM_URL`, `ELEVATION_URL`, `SEED_RUNS`, `DB_PATH`.

## Known limitations

- **Public endpoints are rate-limited/best-effort.** Elevation results are
  cached in SQLite; if routing/elevation are unreachable the app still loads,
  the heatmap still renders (seed data is local), and the UI surfaces a clear
  "service unavailable" message.
- **Drag-to-reroute** is implemented as drag-a-waypoint-then-resnap rather than
  continuous live dragging, to avoid hammering the public routing API on every
  mouse-move.
- No authentication / multi-user — routes and activities are shared in one DB.

## Scripts

| Command           | What it does                                  |
|-------------------|-----------------------------------------------|
| `npm run dev`     | Run client + server together                  |
| `npm run seed`    | Insert synthetic Boston runs                  |
| `npm test`        | Run the server tests                          |
| `npm run build`   | Type-check + build both workspaces            |
