import React from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, TrendingUp } from "lucide-react";

export default function ActivityTable({ activities }) {
  // DEFENSIVE: Handle invalid input
  if (!activities || !Array.isArray(activities) || activities.length === 0) {
    return null;
  }

  const formatDistance = (meters) => {
    if (!meters || typeof meters !== 'number') return 'N/A';
    const miles = (meters * 0.000621371).toFixed(2);
    return `${miles} mi`;
  };

  const formatTime = (seconds) => {
    if (!seconds || typeof seconds !== 'number') return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Activity</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Distance</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((activity, index) => (
            <TableRow key={activity.id || index}>
              <TableCell className="font-medium">{activity.name || 'Unnamed Activity'}</TableCell>
              <TableCell>
                <Badge variant="outline">{activity.type || 'Unknown'}</Badge>
              </TableCell>
              <TableCell>{formatDistance(activity.distance_m)}</TableCell>
              <TableCell>{formatTime(activity.moving_time_s)}</TableCell>
              <TableCell>{formatDate(activity.start_date)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}