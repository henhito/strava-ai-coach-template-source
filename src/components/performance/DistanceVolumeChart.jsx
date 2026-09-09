import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { BarChart3 } from "lucide-react";

export default function DistanceVolumeChart({ activities, activityType }) {
  const data = useMemo(() => {
    if (!activities?.length) return [];

    const typeFilter = activityType === "All"
      ? () => true
      : (a) => {
          if (activityType === "Ride") return ["Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide"].includes(a.type);
          return a.type === activityType;
        };

    const filtered = activities.filter(a => typeFilter(a) && a.distance_m > 0 && a.start_date);

    // Group by month
    const monthMap = {};
    for (const a of filtered) {
      const d = new Date(a.start_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap[key]) monthMap[key] = { distanceKm: 0, count: 0, timeMin: 0 };
      monthMap[key].distanceKm += a.distance_m / 1000;
      monthMap[key].count += 1;
      monthMap[key].timeMin += (a.moving_time_s || 0) / 60;
    }

    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => {
        const [y, m] = key.split("-");
        const label = new Date(Number(y), Number(m) - 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
        return {
          month: label,
          distanceKm: Math.round(val.distanceKm),
          activities: val.count,
          hoursTraining: (val.timeMin / 60).toFixed(1),
        };
      });
  }, [activities, activityType]);

  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-4 h-4" /> Monthly Volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="w-4 h-4 text-orange-500" />
          Monthly Training Volume
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis unit=" km" fontSize={12} />
            <Tooltip
              formatter={(value, name) => {
                if (name === "distanceKm") return [value + " km", "Distance"];
                if (name === "activities") return [value, "Activities"];
                return [value, name];
              }}
            />
            <Bar dataKey="distanceKm" fill="#f97316" radius={[4, 4, 0, 0]} name="distanceKm" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}