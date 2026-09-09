import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Heart, Timer, Activity as ActivityIcon, Gauge } from "lucide-react";

function formatPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return "N/A";
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

export default function PerformanceStatsCards({ activities, activityType }) {
  const stats = useMemo(() => {
    if (!activities?.length) return null;

    const typeFilter = activityType === "All"
      ? () => true
      : (a) => {
          if (activityType === "Ride") return ["Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide"].includes(a.type);
          return a.type === activityType;
        };

    const filtered = activities.filter(a => typeFilter(a) && a.distance_m > 0);
    if (!filtered.length) return null;

    const sorted = [...filtered].sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    const midpoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midpoint || 1);
    const secondHalf = sorted.slice(midpoint);

    const avgSpeed = (arr) => arr.reduce((s, a) => s + (a.average_speed_mps || 0), 0) / arr.length;
    const avgHR = (arr) => {
      const withHR = arr.filter(a => a.average_heartrate);
      return withHR.length ? withHR.reduce((s, a) => s + a.average_heartrate, 0) / withHR.length : null;
    };

    const earlySpeed = avgSpeed(firstHalf);
    const recentSpeed = avgSpeed(secondHalf);
    const speedChange = earlySpeed > 0 ? ((recentSpeed - earlySpeed) / earlySpeed * 100).toFixed(1) : null;

    const earlyHR = avgHR(firstHalf);
    const recentHR = avgHR(secondHalf);
    const hrChange = earlyHR ? ((recentHR - earlyHR) / earlyHR * 100).toFixed(1) : null;

    const runs = filtered.filter(a => a.type === "Run" && a.moving_time_s > 0);
    const bestPace = runs.length
      ? Math.min(...runs.map(a => a.moving_time_s / (a.distance_m / 1000)))
      : null;

    const totalDist = filtered.reduce((s, a) => s + (a.distance_m || 0), 0);

    return {
      totalActivities: filtered.length,
      totalDistKm: (totalDist / 1000).toFixed(0),
      avgSpeedKph: (recentSpeed * 3.6).toFixed(1),
      speedChange,
      avgHR: recentHR ? Math.round(recentHR) : null,
      hrChange,
      bestPace,
    };
  }, [activities, activityType]);

  if (!stats) {
    return null;
  }

  const speedImproved = stats.speedChange && Number(stats.speedChange) > 0;
  const hrDecreased = stats.hrChange && Number(stats.hrChange) < 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <ActivityIcon className="w-3.5 h-3.5" /> Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalActivities}</div>
          <p className="text-xs text-gray-500">{stats.totalDistKm} km total</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" /> Avg Speed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.avgSpeedKph} <span className="text-sm font-normal">km/h</span></div>
          {stats.speedChange && (
            <p className={`text-xs flex items-center gap-1 ${speedImproved ? "text-green-600" : "text-red-500"}`}>
              {speedImproved ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {speedImproved ? "+" : ""}{stats.speedChange}% vs earlier
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5" /> Avg HR
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.avgHR || "N/A"} <span className="text-sm font-normal">{stats.avgHR ? "bpm" : ""}</span></div>
          {stats.hrChange && (
            <p className={`text-xs flex items-center gap-1 ${hrDecreased ? "text-green-600" : "text-orange-500"}`}>
              {hrDecreased ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {Number(stats.hrChange) > 0 ? "+" : ""}{stats.hrChange}% vs earlier
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5" /> Best Pace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.bestPace ? formatPace(stats.bestPace) : "N/A"}</div>
          <p className="text-xs text-gray-500">fastest run in period</p>
        </CardContent>
      </Card>
    </div>
  );
}