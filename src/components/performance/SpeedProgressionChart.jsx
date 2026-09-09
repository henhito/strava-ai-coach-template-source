import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Zap } from "lucide-react";

export default function SpeedProgressionChart({ activities, activityType }) {
  const data = useMemo(() => {
    if (!activities?.length) return [];

    const typeFilter = activityType === "All"
      ? () => true
      : (a) => {
          if (activityType === "Ride") return ["Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide"].includes(a.type);
          return a.type === activityType;
        };

    return activities
      .filter(a => typeFilter(a) && a.average_speed_mps > 0 && a.distance_m > 500)
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      .map(a => ({
        date: a.start_date,
        speedKph: Number((a.average_speed_mps * 3.6).toFixed(1)),
        name: a.name,
        type: a.type,
        distKm: (a.distance_m / 1000).toFixed(1),
      }));
  }, [activities, activityType]);

  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4" /> Average Speed Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            No matching activities in this period
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="w-4 h-4 text-blue-500" />
          Average Speed Progression
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
            <YAxis domain={["auto", "auto"]} unit=" km/h" fontSize={12} />
            <Tooltip
              labelFormatter={v => new Date(v).toLocaleDateString()}
              formatter={(value, name, props) => [
                value + " km/h",
                props.payload.name || "Speed"
              ]}
            />
            <Line type="monotone" dataKey="speedKph" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}