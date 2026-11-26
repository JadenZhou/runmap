import { useCallback, useEffect, useRef, useState } from "react";
import MapView, { type InsertHandle } from "./components/MapView";
import RouteBuilderPanel from "./components/RouteBuilderPanel";
import HeatmapControls from "./components/HeatmapControls";
import SavedRoutesList from "./components/SavedRoutesList";
import UploadButton from "./components/UploadButton";
import { deleteRoute, getHeatmap, getRoute, listRoutes, previewRoute, saveRoute } from "./api";
import type { HeatmapData, LngLat, RoutePreview, SavedRoute, SavedRouteSummary } from "./types";
import type { Units } from "./units";

// Heatmap is stashed for now — flip to true to bring its panel, upload, and
// map layer back. Back-end (/api/heatmap, /api/activities/upload) is untouched.
const SHOW_HEATMAP = false;

export default function App() {
  // --- route builder state ---
  const [waypoints, setWaypoints] = useState<LngLat[]>([]);
  const [buildMode, setBuildMode] = useState(true);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  // The waypoints `preview` was computed for.
  const [previewFor, setPreviewFor] = useState<LngLat[] | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [loadedRoute, setLoadedRoute] = useState<SavedRoute | null>(null);
  const [currentSavedId, setCurrentSavedId] = useState<number | null>(null);
  const reqId = useRef(0);

  // --- saved routes ---
  const [saved, setSaved] = useState<SavedRouteSummary[]>([]);

  // --- units (persisted) ---
  const [units, setUnits] = useState<Units>(
    () => (localStorage.getItem("runmap-units") as Units) || "imperial",
  );
  useEffect(() => {
    localStorage.setItem("runmap-units", units);
  }, [units]);

  // --- heatmap (stashed; see SHOW_HEATMAP) ---
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [heatmapVisible, setHeatmapVisible] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const refreshSaved = useCallback(() => {
    listRoutes()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);

  const refreshHeatmap = useCallback((f?: string, t?: string) => {
    getHeatmap(f || undefined, t || undefined)
      .then(setHeatmap)
      .catch((e) => console.error("heatmap load failed", e));
  }, []);

  useEffect(() => {
    refreshSaved();
    if (SHOW_HEATMAP) refreshHeatmap();
  }, [refreshSaved, refreshHeatmap]);

  // Snap the route whenever the waypoints change (>= 2).
  useEffect(() => {
    if (waypoints.length < 2) {
      // Resetting request state from this effect is deliberate for now; moving
      // it out is tracked in an issue (see ROADMAP.md, "Cleanup").
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      setRouteError(null);
      return;
    }
    const id = ++reqId.current;
    setLoadingRoute(true);
    setRouteError(null);
    const handle = setTimeout(() => {
      previewRoute(waypoints)
        .then((res) => {
          if (id !== reqId.current) return; // stale
          setPreview(res);
          setPreviewFor(waypoints);
        })
        .catch((err) => {
          if (id !== reqId.current) return;
          setRouteError(err instanceof Error ? err.message : "Routing failed");
          setPreview(null);
        })
        .finally(() => {
          if (id === reqId.current) setLoadingRoute(false);
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [waypoints]);

  // Adding/moving a waypoint means we're editing a fresh (unsaved) route.
  const addWaypoint = (p: LngLat) => {
    setLoadedRoute(null);
    setCurrentSavedId(null);
    setWaypoints((w) => [...w, p]);
  };
  const moveWaypoint = (i: number, p: LngLat) => {
    setLoadedRoute(null);
    setCurrentSavedId(null);
    setWaypoints((w) => w.map((wp, idx) => (idx === i ? p : wp)));
  };
  const deleteWaypoint = (i: number) => {
    setLoadedRoute(null);
    setCurrentSavedId(null);
    setWaypoints((w) => w.filter((_, idx) => idx !== i));
  };
  const insertWaypoint = (i: number, p: LngLat) => {
    setLoadedRoute(null);
    setCurrentSavedId(null);
    setWaypoints((w) => [...w.slice(0, i), p, ...w.slice(i)]);
  };
  const undo = () => {
    setLoadedRoute(null);
    setCurrentSavedId(null);
    setWaypoints((w) => w.slice(0, -1));
  };
  const clear = () => {
    setWaypoints([]);
    setPreview(null);
    setLoadedRoute(null);
    setCurrentSavedId(null);
    setRouteError(null);
  };

  async function handleSave(name: string) {
    if (!preview) return;
    try {
      const { id } = await saveRoute({
        name,
        coordinates: preview.coordinates,
        distance_m: preview.distance_m,
        elevation_gain_m: preview.elevation.gain_m,
        elevation_profile: preview.elevation.profile,
        // Where the waypoints attached, so reopening reproduces this route.
        waypoints: preview.snapped,
      });
      setCurrentSavedId(id);
      refreshSaved();
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function openRoute(id: number) {
    try {
      const r = await getRoute(id);
      // The saved line shows until the first edit. Setting the waypoints also
      // re-routes them in the background, which brings up the "+" handles and
      // makes the first edit fast.
      setWaypoints(r.waypoints ?? []);
      setPreview(null);
      setRouteError(null);
      setLoadedRoute(r);
      setCurrentSavedId(id);
      setBuildMode(false);
    } catch (err) {
      console.error(err);
    }
  }

  async function removeRoute(id: number) {
    await deleteRoute(id);
    if (currentSavedId === id) clear();
    refreshSaved();
  }

  // Draw each waypoint where it attached to the path network, and the "+"
  // handles halfway along each leg's path. Until the next preview arrives, a
  // waypoint that changed is drawn where it was placed, and the handles next
  // to it are hidden.
  const fresh = (i: number) => !!preview && !!previewFor && samePoint(previewFor[i], waypoints[i]);
  const markerPositions = waypoints.map((wp, i) =>
    fresh(i) && preview?.snapped[i] ? preview.snapped[i] : wp,
  );
  const insertHandles: InsertHandle[] = waypoints.slice(1).flatMap((_, i) => {
    const leg = preview?.legs[i];
    return leg && fresh(i) && fresh(i + 1) ? [{ index: i + 1, position: leg.midpoint }] : [];
  });

  // Unified display source: a loaded saved route, else the live preview.
  const display = loadedRoute
    ? {
        coords: loadedRoute.coordinates,
        distance: loadedRoute.distance_m,
        gain: loadedRoute.elevation_gain_m,
        profile: loadedRoute.elevation_profile,
        degraded: false,
        provider: undefined as string | undefined,
      }
    : preview
      ? {
          coords: preview.coordinates,
          distance: preview.distance_m,
          gain: preview.elevation.gain_m,
          profile: preview.elevation.profile,
          degraded: preview.elevation.degraded,
          provider: preview.provider,
        }
      : {
          coords: null,
          distance: null,
          gain: null,
          profile: [],
          degraded: false,
          provider: undefined,
        };

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="brand">
          <h1>🏃 RunMap</h1>
          <p>Build running routes · click to place, drag to move</p>
        </header>

        <RouteBuilderPanel
          buildMode={buildMode}
          onToggleBuildMode={() => setBuildMode((b) => !b)}
          waypointCount={waypoints.length}
          loading={loadingRoute}
          error={routeError}
          distanceM={display.distance}
          elevationGainM={display.gain}
          profile={display.profile}
          elevationDegraded={display.degraded}
          provider={display.provider}
          savedRouteId={currentSavedId}
          canSave={!!preview && !loadingRoute}
          units={units}
          onToggleUnits={() => setUnits((u) => (u === "imperial" ? "metric" : "imperial"))}
          onUndo={undo}
          onClear={clear}
          onSave={handleSave}
        />

        {SHOW_HEATMAP && (
          <>
            <HeatmapControls
              visible={heatmapVisible}
              onToggle={() => setHeatmapVisible((v) => !v)}
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
              onApply={() => refreshHeatmap(from, to)}
              onReset={() => {
                setFrom("");
                setTo("");
                refreshHeatmap();
              }}
              cells={heatmap?.cells ?? null}
            />
            <UploadButton onUploaded={() => refreshHeatmap(from, to)} />
          </>
        )}

        <SavedRoutesList
          routes={saved}
          activeId={currentSavedId}
          units={units}
          onOpen={openRoute}
          onDelete={removeRoute}
        />
      </aside>

      <main className="map-area">
        <MapView
          waypoints={markerPositions}
          insertHandles={insertHandles}
          routeCoordinates={display.coords}
          heatmap={SHOW_HEATMAP ? heatmap : null}
          heatmapVisible={heatmapVisible}
          buildMode={buildMode}
          onAddWaypoint={addWaypoint}
          onMoveWaypoint={moveWaypoint}
          onDeleteWaypoint={deleteWaypoint}
          onInsertWaypoint={insertWaypoint}
        />
      </main>
    </div>
  );
}

function samePoint(a: LngLat | undefined, b: LngLat | undefined): boolean {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}
