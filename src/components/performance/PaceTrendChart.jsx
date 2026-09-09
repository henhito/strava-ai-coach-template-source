import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { TrendingUp } from "lucide-react";

const DISTANCE_THRESHOLDS = {
  "1k": { min: 900, max: 1100, label: "1k" },
  "5k": { min: 4500, max: 5500, label: "5k" },
  "10k": { min: 9500, max: 10500, label: "10k" },
  "Half Marathon": { min: 20000, max: 22000, label: "Half Marathon" },
  "Marathon": { min: 40000, max: 44000, label: "Marathon" },
};

function formatPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return "N/A";
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export default function PaceTrendChart({ activities, selectedDistance }) {
  const threshold = DISTANCE_THRESHOLDS[selectedDistance];

  const data = useMemo(() => {
    if (!threshold || !activities?.length) return [];

    return activities
      .filter(a => {
        if (a.type !== "Run") return false;
        if (!a.distance_m || !a.moving_time_s || a.moving_time_s <= 0) return false;
        return a.distance_m >= threshold.min && a.distance_m <= threshold.max;
      })
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      .map(a => {
        const paceSecPerKm = a.moving_time_s / (a.distance_m / 1000);
        return {
          date: a.start_date,
          paceSecPerKm: Math.round(paceSecPerKm),
          paceLabel: formatPace(paceSecPerKm),
          name: a.name,
          distance: (a.distance_m / 1000).toFixed(2),
        };
      });
  }, [activities, threshold]);

  const avgPace = useMemo(() => {
    if (!data.length) return null;
    return Math.round(data.reduce((s, d) => s + d.paceSecPerKm, 0) / data.length);
  }, [data]);

  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4" /> {threshold?.label || selectedDistance} Pace Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            No matching {threshold?.label} runs found in this period
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="w-4 h-4 text-orange-500" />
          {threshold.label} Pace Evolution
          <span className="text-xs font-normal text-gray-500 ml-auto">{data.length} runs</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tickFormatter={v => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              minTickGap={40}
              fontSize={12}
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={v => formatPace(v)}
              fontSize={12}
              reversed
            />
            <Tooltip
              labelFormatter={v => new Date(v).toLocaleDateString()}
              formatter={(value, name, props) => [
                formatPace(value) + " /km",
                props.payload.name || "Pace"
              ]}
            />
            {avgPace && (
              <ReferenceLine
                y={avgPace}
                stroke="#9ca3af"
                strokeDasharray="4 4"
                label={{ value: `Avg ${formatPace(avgPace)}`, position: "right", fontSize: 11, fill: "#9ca3af" }}
              />
            )}
            <Line
              type="monotone"
              dataKey="paceSecPerKm"
              stroke="#f97316"
              strokeWidth={2}
              dot={{ r: 3, fill: "#f97316" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Lower = faster. Y-axis is pace per km (reversed so faster is higher).
        </p>
      </CardContent>
    </Card>
  );
}