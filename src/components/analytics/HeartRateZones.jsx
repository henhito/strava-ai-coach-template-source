import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart } from "lucide-react";

export default function HeartRateZones() {
  const zones = [
    { zone: 1, range: "120-140", color: "bg-green-500", percentage: 32 },
    { zone: 2, range: "140-155", color: "bg-blue-500", percentage: 41 },
    { zone: 3, range: "155-170", color: "bg-yellow-500", percentage: 18 },
    { zone: 4, range: "170-185", color: "bg-orange-500", percentage: 7 },
    { zone: 5, range: "185+", color: "bg-red-500", percentage: 2 }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="w-5 h-5" />
          HR Zone Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {zones.map((zone) => (
            <div key={zone.zone} className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-20">
                <div className={`w-3 h-3 rounded-full ${zone.color}`} />
                <span className="text-sm font-medium">Zone {zone.zone}</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-gray-600">{zone.range} bpm</span>
                  <span className="text-sm font-medium">{zone.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${zone.color}`}
                    style={{ width: `${zone.percentage}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Recommendation:</strong> You're spending good time in Zone 2 (aerobic base). 
            Consider adding more Zone 1 recovery work.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}