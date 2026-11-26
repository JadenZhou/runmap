import { useMemo, useRef } from "react";
import Map, { Source, Layer, Marker, NavigationControl } from "react-map-gl/maplibre";
import type { LayerProps, MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { HeatmapData, LngLat } from "../types";

// OpenFreeMap "liberty" style — keyless, no signup, no token.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const BOSTON = { longitude: -71.0589, latitude: 42.3601, zoom: 12 };

interface Props {
  waypoints: LngLat[];
  routeCoordinates: LngLat[] | null;
  heatmap: HeatmapData | null;
  heatmapVisible: boolean;
  buildMode: boolean;
  onAddWaypoint: (lngLat: LngLat) => void;
  onMoveWaypoint: (index: number, lngLat: LngLat) => void;
  onDeleteWaypoint: (index: number) => void;
  onInsertWaypoint: (index: number, lngLat: LngLat) => void;
}

export default function MapView({
  waypoints,
  routeCoordinates,
  heatmap,
  heatmapVisible,
  buildMode,
  onAddWaypoint,
  onMoveWaypoint,
  onDeleteWaypoint,
  onInsertWaypoint,
}: Props) {
  const maxWeight = heatmap?.maxWeight ?? 1;
  // Distinguishes a real click (delete) from the click that fires at the end
  // of a drag (move) on the same marker.
  const draggedRef = useRef(false);

  // Geometric midpoints between consecutive waypoints, used for "+" insert handles.
  const midpoints = useMemo(() => {
    const out: { index: number; lng: number; lat: number }[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      out.push({ index: i + 1, lng: (a[0] + b[0]) / 2, lat: (a[1] + b[1]) / 2 });
    }
    return out;
  }, [waypoints]);

  const heatLayer: LayerProps = useMemo(
    () => ({
      id: "heat",
      type: "heatmap",
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, maxWeight, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 3],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 14, 18, 16, 26],
        "heatmap-opacity": 0.75,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(0,0,255,0)",
          0.2, "rgba(0,128,255,0.6)",
          0.4, "rgba(0,255,170,0.7)",
          0.6, "rgba(180,255,0,0.8)",
          0.8, "rgba(255,150,0,0.9)",
          1, "rgba(255,40,0,1)",
        ],
      },
    }),
    [maxWeight],
  );

  const routeGeoJSON = useMemo(
    () =>
      routeCoordinates && routeCoordinates.length > 1
        ? {
            type: "Feature" as const,
            properties: {},
            geometry: { type: "LineString" as const, coordinates: routeCoordinates },
          }
        : null,
    [routeCoordinates],
  );

  function handleClick(e: MapLayerMouseEvent) {
    if (!buildMode) return;
    onAddWaypoint([e.lngLat.lng, e.lngLat.lat]);
  }

  return (
    <Map
      initialViewState={BOSTON}
      mapStyle={MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
      onClick={handleClick}
      cursor={buildMode ? "crosshair" : "grab"}
    >
      <NavigationControl position="top-right" />

      {heatmap && heatmapVisible && (
        <Source id="heat-src" type="geojson" data={heatmap as never}>
          <Layer {...heatLayer} />
        </Source>
      )}

      {routeGeoJSON && (
        <Source id="route-src" type="geojson" data={routeGeoJSON as never}>
          <Layer
            id="route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": "#ff4d00", "line-width": 4, "line-opacity": 0.9 }}
          />
        </Source>
      )}

      {/* Midpoint "+" handles: drag to bend, click to insert at the midpoint. */}
      {buildMode &&
        midpoints.map((mp) => (
          <Marker
            key={`mid-${mp.index}`}
            longitude={mp.lng}
            latitude={mp.lat}
            draggable
            onDragStart={() => {
              draggedRef.current = true;
            }}
            onDragEnd={(e) => {
              onInsertWaypoint(mp.index, [e.lngLat.lng, e.lngLat.lat]);
              setTimeout(() => (draggedRef.current = false), 0);
            }}
            onClick={(e) => {
              // Marker clicks bubble to maplibre's canvas click, which would
              // also drop a waypoint via the map's onClick — stop it.
              e.originalEvent.stopPropagation();
              if (draggedRef.current) {
                draggedRef.current = false;
                return;
              }
              onInsertWaypoint(mp.index, [mp.lng, mp.lat]);
            }}
          >
            <div className="midpoint" title="Drag to bend · click to insert">
              +
            </div>
          </Marker>
        ))}

      {waypoints.map((wp, i) => (
        <Marker
          key={i}
          longitude={wp[0]}
          latitude={wp[1]}
          draggable
          onDragEnd={(e) => onMoveWaypoint(i, [e.lngLat.lng, e.lngLat.lat])}
          // clicking a waypoint shouldn't also drop a new point via the map
          onClick={(e) => e.originalEvent.stopPropagation()}
        >
          <div
            className={`waypoint ${i === 0 ? "start" : ""}`}
            title="Drag to move"
          >
            {i + 1}
            <button
              type="button"
              className="wp-delete"
              title="Delete this point"
              aria-label={`Delete waypoint ${i + 1}`}
              // stop the marker from starting a drag when grabbing the ×
              onMouseDown={(ev) => ev.stopPropagation()}
              onTouchStart={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.stopPropagation();
                onDeleteWaypoint(i);
              }}
            >
              ×
            </button>
          </div>
        </Marker>
      ))}
    </Map>
  );
}
