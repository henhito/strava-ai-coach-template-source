import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, TrendingUp, TrendingDown } from "lucide-react";

export default function PaceAnalysis() {
  const paceZones = [
    { zone: "Easy", pace: "7:45-8:30", percentage: 75, trend: "up", color: "bg-green-100 text-green-800" },
    { zone: "Tempo", pace: "7:00-7:20", percentage: 15, trend: "stable", color: "bg-blue-100 text-blue-800" },
    { zone: "Threshold", pace: "6:30-6:50", percentage: 8, trend: "up", color: "bg-orange-100 text-orange-800" },
    { zone: "VO2 Max", pace: "6:00-6:20", percentage: 2, trend: "down", color: "bg-red-100 text-red-800" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Pace Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {paceZones.map((zone) => (
            <div key={zone.zone} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={zone.color}>
                  {zone.zone}
                </Badge>
                <div>
                  <p className="font-medium text-sm">{zone.pace}/mi</p>
                  <p className="text-xs text-gray-500">{zone.percentage}% of training</p>
                </div>
              </div>
              
              <div className="flex items-center gap-1 text-sm">
                {zone.trend === "up" && <TrendingUp className="w-4 h-4 text-green-500" />}
                {zone.trend === "down" && <TrendingDown className="w-4 h-4 text-red-500" />}
                <span className={zone.trend === "up" ? "text-green-600" : zone.trend === "down" ? "text-red-600" : "text-gray-500"}>
                  {zone.trend}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}