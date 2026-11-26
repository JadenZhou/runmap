import { DOMParser } from "@xmldom/xmldom";
import { gpx as gpxToGeoJSON, tcx as tcxToGeoJSON } from "@tmcw/togeojson";

export interface ParsedPoint {
  lon: number;
  lat: number;
  ele: number | null;
  t: string | null;
}

export interface ParsedTrack {
  name: string;
  startTime: string | null;
  points: ParsedPoint[];
}

/**
 * Parse a GPX or TCX document into tracks. Auto-detects the format from the
 * XML root element so a single /upload endpoint handles both.
 */
export function parseTrackFile(xml: string, filename = "upload"): ParsedTrack[] {
  // xmldom's Document stands in for the DOM Document togeojson expects; the
  // server has no DOM lib so we treat it structurally.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  const doc = new DOMParser().parseFromString(xml, "text/xml") as any;
  const root: string = doc.documentElement?.nodeName?.toLowerCase() ?? "";
  const isTcx = root.includes("trainingcenterdatabase") || /\.tcx$/i.test(filename);

  const fc = isTcx ? tcxToGeoJSON(doc) : gpxToGeoJSON(doc);
  const tracks: ParsedTrack[] = [];

  for (const feature of fc.features) {
    const geom = feature.geometry;
    if (!geom) continue;

    // togeojson stores per-point timestamps in properties.coordinateProperties.times
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const coordProps = (props.coordinateProperties ?? {}) as Record<string, unknown>;
    const segName =
      (typeof props.name === "string" && props.name) || filename.replace(/\.(gpx|tcx)$/i, "");

    const lineStrings: number[][][] =
      geom.type === "LineString"
        ? [geom.coordinates as number[][]]
        : geom.type === "MultiLineString"
          ? (geom.coordinates as number[][][])
          : [];

    // Flatten times to match the flattened coordinate order.
    const rawTimes = coordProps.times;
    const times: (string | null)[] = Array.isArray(rawTimes)
      ? (rawTimes.flat() as (string | null)[])
      : [];

    const points: ParsedPoint[] = [];
    let idx = 0;
    for (const ls of lineStrings) {
      for (const c of ls) {
        points.push({
          lon: c[0],
          lat: c[1],
          ele: typeof c[2] === "number" ? c[2] : null,
          t: typeof times[idx] === "string" ? (times[idx] as string) : null,
        });
        idx++;
      }
    }

    if (points.length >= 2) {
      tracks.push({
        name: segName,
        startTime: points.find((p) => p.t)?.t ?? null,
        points,
      });
    }
  }

  return tracks;
}

/** Build a GPX 1.1 document string from a [lon,lat] line + optional elevations. */
export function buildGpx(
  name: string,
  coords: number[][],
  elevations: (number | null)[] = [],
): string {
  const pts = coords
    .map((c, i) => {
      const ele = elevations[i];
      const eleTag = typeof ele === "number" ? `<ele>${ele.toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${c[1]}" lon="${c[0]}">${eleTag}</trkpt>`;
    })
    .join("\n");

  const safeName = name.replace(/[<>&]/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RunMap" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${safeName}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}
