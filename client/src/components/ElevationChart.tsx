import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ElevationProfilePoint } from "../types";
import {
  distanceUnitLabel,
  distanceValue,
  elevationUnitLabel,
  elevationValue,
  type Units,
} from "../units";

interface Props {
  profile: ElevationProfilePoint[];
  degraded?: boolean;
  units: Units;
}

export default function ElevationChart({ profile, degraded, units }: Props) {
  if (degraded || profile.length === 0) {
    return (
      <div className="elev-empty">
        Elevation data unavailable (service offline). Route still saved fine.
      </div>
    );
  }

  const distUnit = distanceUnitLabel(units);
  const eleUnit = elevationUnitLabel(units);
  const data = profile.map((p) => ({
    dist: +distanceValue(p.dist_m, units).toFixed(2),
    ele: Math.round(elevationValue(p.ele_m, units)),
  }));

  return (
    <div style={{ width: "100%", height: 120 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff7a3d" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#ff7a3d" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="dist"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${v}`}
            stroke="#888"
          />
          <YAxis tick={{ fontSize: 10 }} stroke="#888" width={40} unit={eleUnit} />
          <Tooltip
            formatter={(v: number) => [`${v} ${eleUnit}`, "Elevation"]}
            labelFormatter={(l) => `${l} ${distUnit}`}
          />
          <Area
            type="monotone"
            dataKey="ele"
            stroke="#ff4d00"
            strokeWidth={2}
            fill="url(#elevFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
