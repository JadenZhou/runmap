import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ElevationProfilePoint } from "../types";

interface Props {
  profile: ElevationProfilePoint[];
  degraded?: boolean;
}

export default function ElevationChart({ profile, degraded }: Props) {
  if (degraded || profile.length === 0) {
    return (
      <div className="elev-empty">
        Elevation data unavailable (service offline). Route still saved fine.
      </div>
    );
  }

  const data = profile.map((p) => ({
    km: +(p.dist_m / 1000).toFixed(2),
    ele: p.ele_m,
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
            dataKey="km"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${v}`}
            stroke="#888"
          />
          <YAxis tick={{ fontSize: 10 }} stroke="#888" width={36} unit="m" />
          <Tooltip
            formatter={(v: number) => [`${v} m`, "Elevation"]}
            labelFormatter={(l) => `${l} km`}
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
