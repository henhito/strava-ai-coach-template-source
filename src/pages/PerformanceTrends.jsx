import React, { useState, useEffect, useMemo } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Activity as ActivityIcon, AlertCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

import { base44 } from "@/api/base44Client";
import { checkStravaConnection } from "@/functions/checkStravaConnection";

import PerformanceStatsCards from "@/components/performance/PerformanceStatsCards";
import PaceTrendChart from "@/components/performance/PaceTrendChart";
import HRRecoveryChart from "@/components/performance/HRRecoveryChart";
import SpeedProgressionChart from "@/components/performance/SpeedProgressionChart";
import DistanceVolumeChart from "@/components/performance/DistanceVolumeChart";
import WeeklyDistanceChart from "@/components/performance/WeeklyDistanceChart";

const ACTIVITY_TYPES = ["All", "Run", "Ride"];
const TIME_RANGES = [
  { value: "90d", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last year" },
  { value: "2y", label: "Last 2 years" },
  { value: "all", label: "All time" },
];
const PACE_DISTANCES = ["1k", "5k", "10k", "Half Marathon", "Marathon"];

export default function PerformanceTrends() {
  const [allActivities, setAllActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const [timeRange, setTimeRange] = useState("1y");
  const [activityType, setActivityType] = useState("All");
  const [paceDistance, setPaceDistance] = useState("5k");

  // Load activities once
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const connRes = await checkStravaConnection();
        const connData = connRes?.data || connRes;
        if (!connData?.isConnected) {
          setIsConnected(false);
          return;
        }
        setIsConnected(true);

        const me = await base44.auth.me();
        if (!me?.strava_athlete_id) {
          setError("No Strava athlete ID found. Reconnect on the Settings page.");
          return;
        }

        const raw = await base44.entities.Activity.filter(
          { athlete_id: me.strava_athlete_id },
          "-start_date",
          10000
        );
        const list = Array.isArray(raw) ? raw : raw?.data || raw?.items || [];
        setAllActivities(list);
      } catch (err) {
        setError(err?.message || "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Filter by time range
  const filteredActivities = useMemo(() => {
    if (!allActivities.length) return [];
    if (timeRange === "all") return allActivities;

    const now = Date.now();
    const msMap = {
      "90d": 90 * 86400000,
      "6m": 182 * 86400000,
      "1y": 365 * 86400000,
      "2y": 730 * 86400000,
    };
    const cutoff = now - (msMap[timeRange] || 365 * 86400000);
    return allActivities.filter(a => a.start_date && new Date(a.start_date).getTime() >= cutoff);
  }, [allActivities, timeRange]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-orange-500 mx-auto mb-3 animate-spin" />
          <p className="text-gray-500">Loading performance data…</p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Performance Trends</h1>
          <Card className="text-center p-12">
            <AlertCircle className="w-14 h-14 text-orange-300 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Connect Strava</h3>
            <p className="text-gray-500 mb-4">Connect your Strava account to view performance trends.</p>
            <Button onClick={() => window.location.href = "/Settings"} className="bg-orange-500 hover:bg-orange-600">
              Go to Settings
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Performance Trends</h1>
          <Card className="text-center p-12">
            <AlertCircle className="w-14 h-14 text-red-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} className="bg-orange-500 hover:bg-orange-600">
              Retry
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Performance Trends</h1>
            <p className="text-sm text-gray-500">{filteredActivities.length} activities in period</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t === "All" ? "All Types" : t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={paceDistance} onValueChange={setPaceDistance}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PACE_DISTANCES.map(d => (
                  <SelectItem key={d} value={d}>{d} Pace</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats summary */}
        <PerformanceStatsCards activities={filteredActivities} activityType={activityType} />

        {/* Charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PaceTrendChart activities={filteredActivities} selectedDistance={paceDistance} />
          <HRRecoveryChart activities={filteredActivities} activityType={activityType} />
          <SpeedProgressionChart activities={filteredActivities} activityType={activityType} />
          <DistanceVolumeChart activities={filteredActivities} activityType={activityType} />
          <WeeklyDistanceChart activities={filteredActivities} />
        </div>
      </div>
    </div>
  );
}