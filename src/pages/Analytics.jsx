"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  TrendingUp,
  Heart,
  Zap,
  Download,
  Activity as ActivityIcon,
  AlertCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ParallaxBackground from "@/components/common/ParallaxBackground";
import ReportGeneratorDialog from "@/components/analytics/ReportGeneratorDialog";

import { Activity } from "@/entities/Activity";
import { User } from "@/entities/User";
import { checkStravaConnection } from "@/functions/checkStravaConnection";

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("30d");
  const [allActivities, setAllActivities] = useState([]);
  const [filteredActivities, setFilteredActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
const [showReportDialog, setShowReportDialog] = useState(false);

  // Load all activities & check Strava connection
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1) Check Strava connection
        const connectionRes = await checkStravaConnection();
        const connectionData = connectionRes?.data || connectionRes;

        if (!connectionData || !connectionData.isConnected) {
          setIsConnected(false);
          return;
        }

        setIsConnected(true);
        const me = await User.me();

        if (!me || !me.strava_athlete_id) {
          setError("Could not retrieve your Strava athlete ID. Please try reconnecting on the Settings page.");
          return;
        }

        // 2) Load activities from DB
        const activitiesData = await Activity.filter({ athlete_id: me.strava_athlete_id }, "-start_date", 10000);

        // Normalise into a flat array
        const normalized =
          Array.isArray(activitiesData)
            ? activitiesData
            : activitiesData?.data ||
              activitiesData?.items ||
              [];

        console.log("Analytics – raw Activity.filter result:", activitiesData);
        console.log(
          "Analytics – normalized activities length:",
          normalized.length
        );

        setAllActivities(normalized);
      } catch (err) {
        console.error("Analytics load error:", err);
        setError(err?.message || "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Filter activities whenever time range / master list change
  useEffect(() => {
    if (!allActivities || allActivities.length === 0) {
      setFilteredActivities([]);
      return;
    }

    if (timeRange === "all") {
      setFilteredActivities(allActivities);
      return;
    }

    const now = new Date();
    let startDate;

    switch (timeRange) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const startTs = startDate.getTime();

    const filtered = allActivities.filter((activity) => {
      if (!activity || !activity.start_date) return false;
      const ts = new Date(activity.start_date).getTime();
      if (Number.isNaN(ts)) return false;
      return ts >= startTs;
    });

    console.log(
      `Analytics – timeRange=${timeRange}, all=${allActivities.length}, filtered=${filtered.length}`
    );

    setFilteredActivities(filtered);
  }, [timeRange, allActivities]);

  // Last 4 weeks snapshot (always from allActivities)
  const weeklyData = useMemo(() => {
    if (!allActivities || allActivities.length === 0) return [];

    const now = new Date();
    const weeks = [];

    for (let i = 3; i >= 0; i--) {
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - i * 7);
      weekEnd.setHours(23, 59, 59, 999);

      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);

      const weekActivities = allActivities.filter((activity) => {
        if (!activity || !activity.start_date) return false;
        const d = new Date(activity.start_date);
        if (Number.isNaN(d.getTime())) return false;
        return d >= weekStart && d <= weekEnd;
      });

      const totalDistanceM = weekActivities.reduce(
        (sum, a) => sum + (a.distance_m || 0),
        0
      );
      const totalTimeS = weekActivities.reduce(
        (sum, a) => sum + (a.moving_time_s || 0),
        0
      );

      const startMonth = weekStart.toLocaleString("default", { month: "short" });
      const weekLabel = `${startMonth} ${weekStart.getDate()}`;

      weeks.push({
        week: weekLabel,
        distance: Number((totalDistanceM * 0.000621371).toFixed(1)), // m → mi
        time: Math.round(totalTimeS / 60), // s → min
        activities: weekActivities.length,
        _startDate: weekStart.getTime(),
      });
    }

    return weeks.sort((a, b) => a._startDate - b._startDate);
  }, [allActivities]);

  // Efficiency chart data (derived from filteredActivities)
  const efficiencyData = useMemo(() => {
    return filteredActivities
      .filter(
        (a) =>
          a &&
          a.average_heartrate &&
          a.average_speed_mps &&
          a.average_speed_mps > 0
      )
      .map((a) => {
        const efficiency =
          (a.average_speed_mps * 60) / a.average_heartrate; // m/min per bpm
        return {
          ...a,
          efficiency: Number(efficiency.toFixed(2)),
        };
      })
      .slice()
      .reverse();
  }, [filteredActivities]);

  // HR trend chart data (derived from filteredActivities)
  const hrTrendData = useMemo(() => {
    return filteredActivities
      .filter((a) => a && a.average_heartrate)
      .slice()
      .reverse();
  }, [filteredActivities]);

  // Loading / error / not-connected states
  if (isLoading) {
    return (
      <div className="relative min-h-screen bg-gray-50 p-6 flex items-center justify-center overflow-hidden">
        
        <div className="relative z-10 text-center">
          <ActivityIcon className="w-12 h-12 text-orange-500 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="relative min-h-screen bg-gray-50 p-6 overflow-hidden">
        
        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics</h1>
            <p className="text-gray-600">
              Deep insights into your training performance
            </p>
          </div>

          <Card className="text-center p-12 bg-white/80 backdrop-blur-sm">
            <AlertCircle className="w-16 h-16 text-orange-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Connect Strava for Analytics
            </h3>
            <p className="text-gray-500 mb-4">
              Analytics require your Strava data to show real training insights and
              performance trends.
            </p>
            <Button
              onClick={() => {
                window.location.href = "/Chat";
              }}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Connect Strava
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative min-h-screen bg-gray-50 p-6 overflow-hidden">
        
        <div className="relative z-10 max-w-7xl mx-auto">
          <Card className="text-center p-12 bg-white/80 backdrop-blur-sm">
            <AlertCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Error Loading Analytics
            </h3>
            <p className="text-gray-500 mb-4">{error}</p>
            <Button
              onClick={() => window.location.reload()}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Try Again
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Metrics from filteredActivities (selected period only)
  const activitiesWithHeartRate = filteredActivities.filter(
    (a) => a && a.average_heartrate
  );
  const avgHeartRate =
    activitiesWithHeartRate.length > 0
      ? Math.round(
          activitiesWithHeartRate.reduce(
            (sum, a) => sum + a.average_heartrate,
            0
          ) / activitiesWithHeartRate.length
        )
      : "N/A";

  const totalDistanceSelectedMi = (
    filteredActivities.reduce(
      (sum, a) => sum + (a.distance_m || 0),
      0
    ) * 0.000621371
  ).toFixed(1);

  return (
    <div className="relative min-h-screen bg-gray-50 p-6 overflow-hidden">
      
      <ReportGeneratorDialog open={showReportDialog} onOpenChange={setShowReportDialog} />
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics</h1>
            <p className="text-gray-600">
              Deep insights into your training performance
            </p>
          </div>

          <div className="flex gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 3 months</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" className="gap-2" onClick={() => setShowReportDialog(true)}>
                        <Download className="w-4 h-4" />
                        Generate Report
                      </Button>
          </div>
        </div>

        {allActivities.length === 0 ? (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No activities found. Start recording workouts on Strava to see
              analytics here.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Training Load Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
              <Card className="bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                    <ActivityIcon className="w-4 h-4" />
                    Total Activities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {filteredActivities.length}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    in selected period
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Total Distance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {totalDistanceSelectedMi} mi
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    in selected period
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                    <Heart className="w-4 h-4" />
                    Avg Heart Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{avgHeartRate}</div>
                  <p className="text-xs text-gray-500 mt-1">BPM</p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    This Week
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {weeklyData[weeklyData.length - 1]?.activities || 0}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Activities</p>
                </CardContent>
              </Card>
            </div>

            {/* Weekly Volume Chart */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Weekly Training Volume
                </CardTitle>
              </CardHeader>
              <CardContent>
                {weeklyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" />
                      <YAxis />
                      <Tooltip />
                      <Bar
                        dataKey="distance"
                        name="Distance (mi)"
                        fill="#f97316"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-500">
                    <p>Need more activity data for weekly trends</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fitness & Efficiency Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Efficiency Factor Trend */}
              <Card className="bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Zap className="w-4 h-4" />
                    Efficiency Factor Trend (Speed/HR)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={efficiencyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="start_date"
                          tickFormatter={(val) =>
                            new Date(val).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })
                          }
                          minTickGap={30}
                        />
                        <YAxis domain={["auto", "auto"]} />
                        <Tooltip
                          labelFormatter={(val) =>
                            new Date(val).toLocaleDateString()
                          }
                          formatter={(value) => [
                            value,
                            "Efficiency (m/min/bpm)",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="efficiency"
                          stroke="#f97316"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Higher is better. Shows speed per heartbeat (aerobic fitness
                    proxy).
                  </p>
                </CardContent>
              </Card>

              {/* Heart Rate Trend */}
              <Card className="bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Heart className="w-4 h-4" />
                    Avg Heart Rate Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={hrTrendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="start_date"
                          tickFormatter={(val) =>
                            new Date(val).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })
                          }
                          minTickGap={30}
                        />
                        <YAxis domain={["auto", "auto"]} />
                        <Tooltip
                          labelFormatter={(val) =>
                            new Date(val).toLocaleDateString()
                          }
                          formatter={(value) => [`${value} bpm`, "Avg HR"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="average_heartrate"
                          stroke="#8884d8"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Trend of average heart rate across activities.
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}