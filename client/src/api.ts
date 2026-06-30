import type {
  HeatmapData,
  LngLat,
  RoutePreview,
  SavedRoute,
  SavedRouteSummary,
} from "./types";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function previewRoute(waypoints: LngLat[]): Promise<RoutePreview> {
  const res = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ waypoints }),
  });
  return jsonOrThrow(res);
}

export async function saveRoute(input: {
  name: string;
  coordinates: LngLat[];
  distance_m: number;
  elevation_gain_m: number;
  elevation_profile: RoutePreview["elevation"]["profile"];
}): Promise<{ id: number }> {
  const res = await fetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow(res);
}

export async function listRoutes(): Promise<SavedRouteSummary[]> {
  return jsonOrThrow(await fetch("/api/routes"));
}

export async function getRoute(id: number): Promise<SavedRoute> {
  return jsonOrThrow(await fetch(`/api/routes/${id}`));
}

export async function deleteRoute(id: number): Promise<void> {
  const res = await fetch(`/api/routes/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Delete failed");
}

export function routeGpxUrl(id: number): string {
  return `/api/routes/${id}/gpx`;
}

export async function getHeatmap(from?: string, to?: string): Promise<HeatmapData> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return jsonOrThrow(await fetch(`/api/heatmap${qs ? `?${qs}` : ""}`));
}

export async function uploadActivity(file: File): Promise<{ tracks: number; points: number }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/activities/upload", { method: "POST", body: fd });
  return jsonOrThrow(res);
}
