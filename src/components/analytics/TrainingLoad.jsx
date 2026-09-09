import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Clock, Zap } from "lucide-react";

export default function TrainingLoad() {
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Training Load
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600">342</div>
          <p className="text-xs text-gray-500 mt-1">
            <span className="text-green-600">+12%</span> vs last week
          </p>
          <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
            <div className="bg-orange-500 h-2 rounded-full" style={{ width: '68%' }}></div>
          </div>
          <p className="text-xs text-gray-500 mt-1">68% of target load</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Weekly Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">4.2h</div>
          <p className="text-xs text-gray-500 mt-1">
            <span className="text-green-600">+18min</span> vs last week
          </p>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span>Easy runs</span>
              <span>3.1h</span>
            </div>
            <div className="flex justify-between">
              <span>Workouts</span>
              <span>1.1h</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Fitness Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">+8.5</div>
          <p className="text-xs text-gray-500 mt-1">Fitness score change</p>
          <div className="mt-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span>Current fitness</span>
              <span className="font-medium">67.2</span>
            </div>
            <div className="flex justify-between">
              <span>Fatigue</span>
              <span className="font-medium">23.8</span>
            </div>
            <div className="flex justify-between">
              <span>Form</span>
              <span className="font-medium text-green-600">43.4</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}