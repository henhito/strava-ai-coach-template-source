import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, Heart, TrendingUp } from "lucide-react";
import { useUnits } from "@/components/units/UnitsProvider";

export default function ActivityStats({ activities }) {
  const { formatDistance, formatElevation } = useUnits();

  const totalDistance = activities.reduce((sum, activity) => sum + (activity.distance_m || 0), 0);
  const totalTime = activities.reduce((sum, activity) => sum + (activity.moving_time_s || 0), 0);
  const avgHeartRate = activities.filter(a => a.average_heartrate).reduce((sum, activity, _, arr) => 
    sum + activity.average_heartrate / arr.length, 0);
  const totalElevation = activities.reduce((sum, activity) => sum + (activity.total_elevation_gain_m || 0), 0);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Total Distance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatDistance(totalDistance)}</div>
          <p className="text-xs text-gray-500 mt-1">{activities.length} activities</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Total Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatTime(totalTime)}</div>
          <p className="text-xs text-gray-500 mt-1">Moving time</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
            <Heart className="w-4 h-4" />
            Avg Heart Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{Math.round(avgHeartRate) || 0}</div>
          <p className="text-xs text-gray-500 mt-1">BPM</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Total Elevation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatElevation(totalElevation)}</div>
          <p className="text-xs text-gray-500 mt-1">Climbed</p>
        </CardContent>
      </Card>
    </>
  );
}