import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { Heart } from "lucide-react";

export default function HRRecoveryChart({ activities, activityType }) {
  const data = useMemo(() => {
    if (!activities?.length) return [];

    const typeFilter = activityType === "All"
      ? () => true
      : (a) => a.type === activityType;

    return activities
      .filter(a => typeFilter(a) && a.average_heartrate && a.max_heartrate && a.average_speed_mps > 0)
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      .map(a => {
        // Cardiac drift: difference between max HR and avg HR — lower is better recovery
        const hrReserveUsed = a.max_heartrate - a.average_heartrate;
        // Efficiency: speed per heartbeat
        const efficiency = ((a.average_speed_mps * 60) / a.average_heartrate).toFixed(2);
        return {
          date: a.start_date,
          avgHR: Math.round(a.average_heartrate),
          maxHR: Math.round(a.max_heartrate),
          hrDrift: Math.round(hrReserveUsed),
          efficiency: Number(efficiency),
          name: a.name,
          type: a.type,
        };
      });
  }, [activities, activityType]);

  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Heart className="w-4 h-4" /> Heart Rate Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            No activities with heart rate data in this period
          </div>
        </CardContent>
      </Card>
    );
  }

  const avgEfficiency = (data.reduce((s, d) => s + d.efficiency, 0) / data.length).toFixed(2);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Heart className="w-4 h-4 text-red-500" />
          Cardiac Efficiency Trend
          <span className="text-xs font-normal text-gray-500 ml-auto">{data.length} activities</span>
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
            <YAxis domain={["auto", "auto"]} fontSize={12} />
            <Tooltip
              labelFormatter={v => new Date(v).toLocaleDateString()}
              formatter={(value, name, props) => {
                if (name === "efficiency") return [value + " m/min/bpm", "Efficiency"];
                if (name === "avgHR") return [value + " bpm", "Avg HR"];
                return [value, name];
              }}
            />
            <ReferenceLine
              y={Number(avgEfficiency)}
              stroke="#9ca3af"
              strokeDasharray="4 4"
            />
            <Line type="monotone" dataKey="efficiency" stroke="#10b981" strokeWidth={2} dot={false} name="efficiency" />
            <Line type="monotone" dataKey="avgHR" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="avgHR" strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Green = cardiac efficiency (higher is fitter). Purple dashed = avg HR.
        </p>
      </CardContent>
    </Card>
  );
}