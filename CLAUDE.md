# RunMap

A free route builder for running and cycling, like Strava's but without the
subscription. Click the map to place waypoints; the route snaps to paths, with
distance, elevation and GPX export. No API keys or paid services.

## Layout
- `client/` — React + TypeScript + Vite, MapLibre (react-map-gl), Recharts.
- `server/` — Fastify + TypeScript, SQLite through Node's built-in `node:sqlite`.
  - `src/providers/` — every external service sits behind an interface here
    (routing: BRouter or OSRM; elevation: Open-Meteo).
  - `src/lib/legs.ts` — routes each leg (waypoint i to i+1) separately and caches it.
  - `profiles/running.brf` — RunMap's BRouter profile, uploaded on first use.
  - `data/runmap.db` — saved routes and activities (gitignored).

## Requirements
Node 22.13 or newer (`node:sqlite`). Run `nvm use` first; the default system
node on this machine is older and won't start the server.

## Commands
- `npm run dev` — server on :3001, app on http://localhost:5173.
- `npm run check` — lint, format check, types, tests and build. Run before every commit.
- `npm test` — server tests (`node:test` via tsx), files named `*.test.ts`.

## Rules
- **Privacy:** `server/data/` holds the user's real saved routes, some near their
  home. Never commit it, and never copy coordinates from it (or from the user's
  real routes) into tests, docs, issues, commit messages or fixtures. Use public
  Boston landmarks for test data.
- **Keyless:** no API keys, signups or paid services. A new external service goes
  behind an interface in `server/src/providers/` and must degrade gracefully
  (the app keeps working and shows a message) when the service is down.
- **Routing quality is checked on real routes.** For a profile or routing change,
  compare before/after on a few real routes and quote the distances in the PR.
  Changes to `profiles/running.brf` go in its header comment too.
- **Check UI changes in a browser** before saying they work: click through the
  change and look at a screenshot.
- Saved routes made before waypoints were stored have `waypoints: null` and open
  view-only. Keep that working.

## Workflow
Follow `CONTRIBUTING.md`: branch from `main`, use Conventional Commits, open a PR
that links its issue, and never push to `main`.

## Plans
Work is tracked in GitHub issues and milestones (`gh issue list`). The plan is in
`ROADMAP.md`. Read the relevant section before starting feature work, and link the
issue in your PR (`Closes #N`).
