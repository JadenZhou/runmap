import type { SavedRouteSummary } from "../types";

interface Props {
  routes: SavedRouteSummary[];
  activeId: number | null;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function SavedRoutesList({ routes, activeId, onOpen, onDelete }: Props) {
  return (
    <section className="panel">
      <h2>Saved routes ({routes.length})</h2>
      {routes.length === 0 && <p className="hint">No saved routes yet.</p>}
      <ul className="route-list">
        {routes.map((r) => (
          <li key={r.id} className={r.id === activeId ? "active" : ""}>
            <button className="route-open" onClick={() => onOpen(r.id)}>
              <strong>{r.name}</strong>
              <span className="hint">
                {(r.distance_m / 1000).toFixed(2)} km · {r.elevation_gain_m} m gain
              </span>
            </button>
            <button
              className="route-del"
              title="Delete"
              onClick={() => onDelete(r.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
