import { useState } from "react";
import ElevationChart from "./ElevationChart";
import { routeGpxUrl } from "../api";
import type { ElevationProfilePoint } from "../types";

interface Props {
  buildMode: boolean;
  onToggleBuildMode: () => void;
  waypointCount: number;
  loading: boolean;
  error: string | null;
  distanceM: number | null;
  elevationGainM: number | null;
  profile: ElevationProfilePoint[];
  elevationDegraded: boolean;
  provider?: string;
  savedRouteId: number | null;
  canSave: boolean;
  onUndo: () => void;
  onClear: () => void;
  onSave: (name: string) => void;
}

function fmtKm(m: number | null): string {
  if (m == null) return "—";
  return `${(m / 1000).toFixed(2)} km`;
}

export default function RouteBuilderPanel(props: Props) {
  const [name, setName] = useState("");

  function handleSave() {
    const n = name.trim() || `Route ${new Date().toLocaleString()}`;
    props.onSave(n);
    setName("");
  }

  return (
    <section className="panel">
      <h2>Route builder</h2>

      <label className="switch">
        <input
          type="checkbox"
          checked={props.buildMode}
          onChange={props.onToggleBuildMode}
        />
        Build mode {props.buildMode ? "(click map to add points)" : "(panning)"}
      </label>

      <div className="stats">
        <div>
          <span className="stat-label">Distance</span>
          <span className="stat-value">{fmtKm(props.distanceM)}</span>
        </div>
        <div>
          <span className="stat-label">Elevation gain</span>
          <span className="stat-value">
            {props.elevationGainM == null ? "—" : `${props.elevationGainM} m`}
          </span>
        </div>
      </div>

      {props.loading && <p className="hint">Snapping route…</p>}
      {props.error && <p className="error">{props.error}</p>}
      {props.provider && !props.error && (
        <p className="hint">snapped via {props.provider}</p>
      )}

      <ElevationChart profile={props.profile} degraded={props.elevationDegraded} />

      <div className="btn-row">
        <button onClick={props.onUndo} disabled={props.waypointCount === 0}>
          Undo
        </button>
        <button onClick={props.onClear} disabled={props.waypointCount === 0 && !props.savedRouteId}>
          Clear
        </button>
      </div>

      <div className="save-row">
        <input
          type="text"
          placeholder="Route name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button onClick={handleSave} disabled={!props.canSave}>
          Save
        </button>
      </div>

      {props.savedRouteId != null && (
        <a className="export-link" href={routeGpxUrl(props.savedRouteId)}>
          ⬇ Export this route as GPX
        </a>
      )}
    </section>
  );
}
