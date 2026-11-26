export type LngLat = [number, number];

export interface ElevationProfilePoint {
  dist_m: number;
  ele_m: number;
}

export interface RouteLeg {
  distance_m: number;
  /** Halfway along the leg's path. */
  midpoint: LngLat;
}

export interface RoutePreview {
  coordinates: LngLat[];
  distance_m: number;
  provider: string;
  /** Where each waypoint attached to the path network, one per waypoint. */
  snapped: LngLat[];
  /** One per pair of consecutive waypoints. */
  legs: RouteLeg[];
  elevation: {
    profile: ElevationProfilePoint[];
    gain_m: number;
    degraded: boolean;
  };
}

export interface SavedRouteSummary {
  id: number;
  name: string;
  distance_m: number;
  elevation_gain_m: number;
  created_at: string;
}

export interface SavedRoute extends SavedRouteSummary {
  coordinates: LngLat[];
  elevation_profile: ElevationProfilePoint[];
}

export interface HeatmapFeature {
  type: "Feature";
  properties: { weight: number };
  geometry: { type: "Point"; coordinates: LngLat };
}

export interface HeatmapData {
  type: "FeatureCollection";
  maxWeight: number;
  cells: number;
  features: HeatmapFeature[];
}
