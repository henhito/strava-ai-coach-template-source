
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Heart, Zap, Calendar, CheckCircle, AlertCircle, Target } from "lucide-react";
import GarminAttribution from '../common/GarminAttribution';

export default function CoachingResponse({ data, activity }) {
  // Parse JSON if it's a string
  let coaching;
  try {
    coaching = typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    // If not valid JSON, just show as text
    return (
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <p className="text-gray-700 whitespace-pre-wrap">{data}</p>
      </div>
    );
  }

  // Check if this is a coaching response (has expected structure)
  if (!coaching.summary && !coaching.insights && !coaching.coach_note) {
    return (
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <p className="text-gray-700 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</p>
      </div>
    );
  }

  const { summary, insights, metrics, recommendation_next_run, data_gaps, coach_note } = coaching;

  return (
    <div className="space-y-4">
      {/* Coach Note - Primary Message */}
      {coach_note && (
        <Card className="bg-gradient-to-br from-orange-50 to-white border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-gray-800 leading-relaxed">{coach_note}</p>
                {/* Garmin Attribution if activity is from Garmin */}
                {activity && activity.source_device_brand === 'Garmin' && (
                  <div className="mt-3 pt-3 border-t border-orange-100">
                    <GarminAttribution size="small" />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Summary */}
      {summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-500" />
              Activity Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500">Type</p>
                <Badge variant="outline" className="mt-1">{summary.workout_type}</Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500">Distance</p>
                <p className="font-semibold">{summary.distance_km} km</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Duration</p>
                <p className="font-semibold">{summary.duration_min} min</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Avg Pace</p>
                <p className="font-semibold">{summary.avg_pace_min_per_km}/km</p>
              </div>
              {summary.avg_hr_bpm && (
                <div>
                  <p className="text-xs text-gray-500">Avg HR</p>
                  <p className="font-semibold">{summary.avg_hr_bpm} bpm</p>
                </div>
              )}
              {summary.elev_gain_m && (
                <div>
                  <p className="text-xs text-gray-500">Elevation</p>
                  <p className="font-semibold">{summary.elev_gain_m} m</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insights */}
      {insights && (
        <div className="grid md:grid-cols-2 gap-4">
          {insights.strengths && insights.strengths.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-4 h-4" />
                  Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {insights.strengths.map((strength, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{strength}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {insights.opportunities && insights.opportunities.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                  <AlertCircle className="w-4 h-4" />
                  Areas to Improve
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {insights.opportunities.map((opp, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <TrendingDown className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{opp}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Metrics */}
      {metrics && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-500" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {metrics.hr_zone_pct && Object.keys(metrics.hr_zone_pct).length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">HR Zones</p>
                  <div className="space-y-1">
                    {Object.entries(metrics.hr_zone_pct).map(([zone, pct]) => (
                      pct > 0 && (
                        <div key={zone} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{zone}</span>
                          <span className="font-semibold">{pct}%</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
              {metrics.pace_cv_pct !== null && metrics.pace_cv_pct !== undefined && (
                <div>
                  <p className="text-xs text-gray-500">Pace Variability</p>
                  <p className="font-semibold">{metrics.pace_cv_pct}%</p>
                </div>
              )}
              {metrics.aerobic_decoupling_pct !== null && metrics.aerobic_decoupling_pct !== undefined && (
                <div>
                  <p className="text-xs text-gray-500">Aerobic Decoupling</p>
                  <p className="font-semibold">{metrics.aerobic_decoupling_pct}%</p>
                </div>
              )}
              {metrics.cadence_spm_avg && (
                <div>
                  <p className="text-xs text-gray-500">Avg Cadence</p>
                  <p className="font-semibold">{metrics.cadence_spm_avg} spm</p>
                </div>
              )}
              {metrics.split_pattern && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Split Pattern</p>
                  <p className="font-semibold text-sm">{metrics.split_pattern}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Run Recommendation */}
      {recommendation_next_run && (
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-blue-700">
              <Target className="w-4 h-4" />
              Next Run Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-600">Type</p>
                  <Badge className="mt-1 bg-blue-600">{recommendation_next_run.type}</Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Duration</p>
                  <p className="font-semibold">{recommendation_next_run.duration_min} min</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Intensity</p>
                  <p className="font-semibold text-sm">{recommendation_next_run.intensity}</p>
                </div>
              </div>
              <div className="bg-white/50 rounded-lg p-3 border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Focus Cue</p>
                <p className="text-sm font-medium text-gray-800">{recommendation_next_run.focus_cue}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Gaps */}
      {data_gaps && data_gaps.length > 0 && (
        <div className="text-xs text-gray-500 italic">
          Note: {data_gaps.join(', ')}
        </div>
      )}
    </div>
  );
}
