import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { CalendarRange } from "lucide-react";
import { base44 } from "@/api/base44Client";

const RUN_TYPES = ["Run", "TrailRun", "VirtualRun"];

// Monday-based week start
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function WeeklyDistanceChart({ activities }) {
  const [weeklyTarget, setWeeklyTarget] = useState(null);

  // Pull an active distance goal (km) to use as a weekly target reference
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.entities.Goal.filter(
          { status: "active", type: "distance" },
          "-created_date",
          20
        );
        const list = Array.isArray(res) ? res : res?.data || res?.items || [];
        if (cancelled) return;
        const kmGoal = list.find(
          (g) => (g.target_unit || "").toLowerCase() === "km" && g.target_value > 0
        );
        setWeeklyTarget(kmGoal ? Number(kmGoal.target_value) : null);
      } catch {
        if (!cancelled) setWeeklyTarget(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const data = useMemo(() => {
    if (!activities?.length) return [];

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 35); // last ~5 weeks
    cutoff.setHours(0, 0, 0, 0);

    const runs = activities.filter(
      (a) => RUN_TYPES.includes(a.type) && a.distance_m > 0 && a.start_date && new Date(a.start_date) >= cutoff
    );
    if (!runs.length) return [];

    // Build up to 5 week buckets ending in the current week
    const buckets = [];
    const thisWeekStart = getWeekStart(now);
    for (let i = 4; i >= 0; i--) {
      const start = new Date(thisWeekStart);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      buckets.push({
        weekStart: start,
        weekEnd: end,
        label: start.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        distanceKm: 0,
        activities: 0,
        isCurrent: i === 0,
      });
    }

    for (const a of runs) {
      const d = getWeekStart(a.start_date);
      const bucket = buckets.find((b) => b.weekStart.getTime() === d.getTime());
      if (bucket) {
        bucket.distanceKm += a.distance_m / 1000;
        bucket.activities += 1;
      }
    }

    return buckets.map((b) => ({
      ...b,
      distanceKm: Math.round(b.distanceKm * 10) / 10,
    }));
  }, [activities]);

  const showTarget = weeklyTarget != null && weeklyTarget > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="w-4 h-4 text-orange-500" />
          Weekly Running Distance (Last Month)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data.length ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            No runs in the last month
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis unit=" km" fontSize={12} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "distanceKm") return [`${value} km`, "Distance"];
                  if (name === "activities") return [value, "Runs"];
                  return [value, name];
                }}
              />
              {showTarget && (
                <ReferenceLine
                  y={weeklyTarget}
                  stroke="#16a34a"
                  strokeDasharray="5 5"
                  label={{ value: `Target ${weeklyTarget} km`, position: "right", fill: "#16a34a", fontSize: 11 }}
                />
              )}
              <Bar
                dataKey="distanceKm"
                fill="#f97316"
                radius={[4, 4, 0, 0]}
                name="distanceKm"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
        {showTarget ? (
          <p className="text-xs text-gray-500 mt-2">
            Green line = your active distance goal ({weeklyTarget} km). Bars at or above it mean you hit your weekly target.
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-2">
            Set an active distance goal (in km) on your Goals to show a weekly target line here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}