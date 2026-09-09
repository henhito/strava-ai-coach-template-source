import React, { useState } from "react";
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Clock, Heart, Mountain, Zap, Activity, Bike, BrainCircuit, Loader2 } from "lucide-react";
import { useUnits } from "@/components/units/UnitsProvider";
import { createPageUrl } from '@/utils';
import GarminAttribution from '../common/GarminAttribution';
import { generateActivityComment } from "@/functions/generateActivityComment";
import { Activity as ActivityEntity } from "@/entities/Activity";

const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const getActivityColor = (type) => {
  const colors = {
    "Run": "bg-green-100 text-green-800 border-green-200",
    "Ride": "bg-blue-100 text-blue-800 border-blue-200",
    "Swim": "bg-cyan-100 text-cyan-800 border-cyan-200",
    "Walk": "bg-gray-100 text-gray-800 border-gray-200",
    "VirtualRide": "bg-blue-100 text-blue-800 border-blue-200",
    "EBikeRide": "bg-indigo-100 text-indigo-800 border-indigo-200",
  };
  return colors[type] || "bg-gray-100 text-gray-800 border-gray-200";
};

export default function ActivityCard({ activity, onCommentGenerated }) {
  const { formatDistance, formatElevation, formatPace, units } = useUnits();
  const [isGenerating, setIsGenerating] = useState(false);
  const [comment, setComment] = useState(activity.elite_coach_comment);

  const isCycling = ['Ride', 'VirtualRide', 'EBikeRide'].includes(activity.type);

  const formatSpeedOrPace = (avgSpeed) => {
    if (isCycling) {
      if (units === 'kilometers') {
        const kmh = avgSpeed * 3.6;
        return `${kmh.toFixed(1)} km/h`;
      } else {
        const mph = avgSpeed * 2.237;
        return `${mph.toFixed(1)} mph`;
      }
    } else {
      return formatPace(avgSpeed);
    }
  };

  const handleGenerateComment = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsGenerating(true);
    try {
      const response = await generateActivityComment({ activityId: activity.id });
      const data = response.data || response;
      
      if (data.success && data.comment) {
        setComment(data.comment);
        // Notify parent component if callback provided
        if (onCommentGenerated) {
          onCommentGenerated(activity.id, data.comment);
        }
      }
    } catch (error) {
      console.error('Error generating comment:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Link to={createPageUrl(`ActivityDetail?id=${activity.id}`)} className="block h-full">
      <Card className="hover:shadow-lg hover:border-orange-300 transition-all duration-200 cursor-pointer group h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg group-hover:text-orange-600 transition-colors">
                {activity.name}
              </CardTitle>
              <p className="text-sm text-gray-500">
                {format(new Date(activity.start_date), "EEEE, MMM d 'at' h:mm a")}
              </p>
              {activity.source_device_brand === 'Garmin' && (
                <div className="mt-2">
                  <GarminAttribution size="tiny" />
                </div>
              )}
            </div>
            <Badge variant="outline" className={getActivityColor(activity.type)}>
              {activity.type}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4 flex-1 flex flex-col">
          {/* Primary Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Activity className="w-4 h-4" />
                <span className="text-xs font-medium">Distance</span>
              </div>
              <p className="text-lg font-semibold">{formatDistance(activity.distance_m)}</p>
            </div>
            
            <div>
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium">Time</span>
              </div>
              <p className="text-lg font-semibold">{formatTime(activity.moving_time_s)}</p>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-100">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                {isCycling ? <Bike className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                <span className="text-xs">{isCycling ? 'Avg Speed' : 'Pace'}</span>
              </div>
              <p className="text-sm font-medium">
                {formatSpeedOrPace(activity.average_speed_mps)}
              </p>
            </div>
            
            {activity.average_heartrate && (
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                  <Heart className="w-3 h-3" />
                  <span className="text-xs">HR</span>
                </div>
                <p className="text-sm font-medium">{Math.round(activity.average_heartrate)}</p>
              </div>
            )}
            
            {activity.total_elevation_gain_m > 0 && (
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                  <Mountain className="w-3 h-3" />
                  <span className="text-xs">Elev</span>
                </div>
                <p className="text-sm font-medium">{formatElevation(activity.total_elevation_gain_m)}</p>
              </div>
            )}
            
            {activity.suffer_score && (
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                  <Zap className="w-3 h-3" />
                  <span className="text-xs">Effort</span>
                </div>
                <p className="text-sm font-medium">{activity.suffer_score}</p>
              </div>
            )}
          </div>

          {/* Elite Coach Comment Section */}
          <div className="mt-auto pt-3 border-t border-orange-100">
            {comment ? (
              <div className="bg-orange-50 rounded-lg p-3">
                <div className="flex items-start gap-2 mb-2">
                  <BrainCircuit className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">
                    {comment}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateComment}
                  disabled={isGenerating}
                  className="text-xs h-6 px-2 text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                >
                  {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refresh'}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateComment}
                disabled={isGenerating}
                className="w-full text-xs border-orange-200 text-orange-600 hover:bg-orange-50"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Getting coach insight...
                  </>
                ) : (
                  <>
                    <BrainCircuit className="w-3 h-3 mr-2" />
                    Get Elite Coach insight
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}