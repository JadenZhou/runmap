# Roadmap

**Goal:** a good, free route builder for running, cycling and hiking, on par with
Strava's route builder but without the subscription. Product quality comes first:
the routes should go where a runner or rider would actually go.

**How work gets picked:** plan real runs and rides with RunMap and open an issue
for every annoyance (the "Bad route" template). Your own routes are the test set.

## v0.1: route building that behaves (done)
- Running profile instead of BRouter's `hiking-beta`, which detoured through
  parking lots and footpaths to avoid roads with no sidewalk tag.
- Each leg is routed separately and cached, so edits only re-route what changed.
- Waypoints are drawn where they attach to the path network; "+" handles sit on
  the route line.
- Saved routes keep their waypoints and can be reopened for editing.

## v0.2: catch up with Strava's builder
- **Sport picker:** run, road bike, gravel, MTB, hike. Each maps to a BRouter profile
  (BRouter already ships `fastbike`, `trekking`, `gravel`, `mtb`), sent per request
  and saved with the route.
- **Route tools:** out-and-back, return to start, reverse.
- **Undo/redo** for every edit (today Undo only removes the last point).
- **Manual legs:** a straight line where snapping gets it wrong.
- **Place search** with a keyless geocoder.
- **Chart ↔ map:** hovering the elevation chart marks the spot on the map.
- **Estimated time** by sport and pace.
- **GPX import** to edit an existing route; **TCX export** for devices.
- **Saved routes:** update in place (saving an edit makes a copy today), and fit
  the map to a route when it's opened.

Cleanup:
- Move the request-state resets out of the route effect in `App.tsx` (the one
  `react-hooks/set-state-in-effect` exception).
- Update the dependencies `npm audit` flags before anything is deployed.

## v0.3: nicer than Strava's
- **Surface breakdown** (paved / unpaved, from BRouter's way tags) and **grade
  coloring** on the line and the chart.
- **Options:** avoid hills, prefer paths.
- **Phone:** a layout that works on small screens, installable as a web app (PWA).
- **Deploy** so it works away from the laptop, and self-host BRouter, which removes
  the public server's rate limits and expiring uploaded profiles.

## v0.4: route generator
"Give me a 40 km ride from home with under 300 m of climbing." Generate loops from
a start point, target distance and climbing limit, preferring roads and paths the
profile likes and avoiding repeats. This is a real search problem and the most
distinctive feature here. It may be a separate component (possibly Rust, compiled
to WebAssembly so it can run in the browser).

## Later / ideas
- Own routing engine over OpenStreetMap (graph + A*), probably in Rust.
- Heatmap from real activities (Strava or Garmin export) instead of synthetic seed
  data, or drop the heatmap. It's hidden behind `SHOW_HEATMAP` for now.
- Learn route preferences from past runs (inverse RL) and evaluate on held-out runs.
- App Store app (Capacitor around the same React code), only if something needs it:
  background GPS recording, offline maps, watch or Health sync.

## Open questions
- Mostly planning on a laptop or a phone? A phone moves the mobile layout and
  deploying up to v0.2.
- Which devices get the routes (Garmin, Wahoo, Apple Watch)? Decides export formats.

## Decisions
- **TypeScript everywhere.** The browser side has to be TypeScript, and the server
  mostly waits on the network, so a rewrite in Go or Rust gains nothing visible. Rust
  is the candidate for a CPU-heavy engine (v0.4 or later), as its own component.
- **Web app, not native.** A responsive site plus PWA covers phones; App Store only
  if one of the "later" needs shows up.
- **BRouter's public server for now,** with RunMap's own `running` profile.
