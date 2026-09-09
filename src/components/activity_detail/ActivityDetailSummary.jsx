import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useUnits } from '@/components/units/UnitsProvider';
import { format } from 'date-fns';
import { Activity, Clock, Mountain, Heart, Zap, Award, Footprints, Bolt, Thermometer } from 'lucide-react';
import GarminAttribution from '../common/GarminAttribution';

const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export default function ActivityDetailSummary({ activity }) {
    const { formatDistance, formatPace, units } = useUnits();

    // The activity object comes already transformed from ActivityDetail page
    // It should have: distance, moving_time, average_speed, total_elevation_gain, etc.
    
    // Check if it's a cycling activity
    const isCycling = ['Ride', 'VirtualRide', 'EBikeRide'].includes(activity.type);
    
    // Format speed for cycling or pace for running
    const formatSpeedOrPace = (avgSpeed) => {
        if (isCycling) {
            // Show speed for cycling
            if (units === 'kilometers') {
                const kmh = avgSpeed * 3.6;
                return `${kmh.toFixed(1)} km/h`;
            } else {
                const mph = avgSpeed * 2.237;
                return `${mph.toFixed(1)} mph`;
            }
        } else {
            // Show pace for running
            return formatPace(avgSpeed);
        }
    };

    const formatTemperature = (celsius) => {
        if (celsius === null || celsius === undefined) return 'N/A';
        if (units === 'kilometers') { // Metric: Celsius
            return `${celsius.toFixed(0)}°C`;
        } else { // Imperial: Fahrenheit
            const fahrenheit = (celsius * 9/5) + 32;
            return `${fahrenheit.toFixed(0)}°F`;
        }
    };
    
    const stats = [
        { icon: Activity, label: 'Distance', value: formatDistance(activity.distance) },
        { icon: Clock, label: 'Moving Time', value: formatTime(activity.moving_time) },
        { icon: Zap, label: isCycling ? 'Avg Speed' : 'Pace', value: formatSpeedOrPace(activity.average_speed) },
        { icon: Mountain, label: 'Elevation', value: units === 'kilometers' ? `${Math.round(activity.total_elevation_gain)} m` : `${Math.round(activity.total_elevation_gain * 3.28)} ft` },
        { icon: Heart, label: 'Avg HR', value: activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : 'N/A' },
        { icon: Award, label: 'Effort', value: activity.suffer_score || 'N/A' },
    ];
    
    // Conditionally add new stats if they exist
    if (activity.average_cadence) {
        // For cycling, cadence is RPM. For running, it's SPM (often stored as half-cadence in Strava)
        const cadence = Math.round(activity.average_cadence * (isCycling ? 1 : 2));
        const unit = isCycling ? 'rpm' : 'spm';
        stats.push({ icon: Footprints, label: 'Avg Cadence', value: `${cadence} ${unit}` });
    }
    
    if (activity.average_watts) {
        stats.push({ icon: Bolt, label: 'Avg Power', value: `${Math.round(activity.average_watts)} W` });
    }
    
    if (activity.average_temp) {
        stats.push({ icon: Thermometer, label: 'Avg Temp', value: formatTemperature(activity.average_temp) });
    }

    // --- Advanced Analysis Helpers ---

    const estimateVO2Max = () => {
        // Very rough estimation based on HR vs Speed/Power efficiency
        // Real VO2 Max requires max effort, but we can estimate "Effective VO2"
        // Run: Cooper test logic-ish or Jack Daniels VDOT approximation from pace
        // Cycle: Power/HR ratio
        
        if (!activity.average_heartrate) return null;

        if (isCycling && activity.average_watts) {
            // Cycling: Power / HR * constant? 
            // Better: (Avg Power / Weight) ... we don't have weight here easily.
            // Simple proxy: Efficiency Factor (EF) = Normalized Power / Avg HR
            // We'll return EF instead of VO2 Max for cycling if we can't do full VO2
            const ef = (activity.average_watts / activity.average_heartrate).toFixed(2);
            return { label: 'Efficiency Factor', value: ef, unit: 'W/bpm' };
        } else if (!isCycling && activity.average_speed) {
            // Running: VDOT estimation from pace (very rough)
            // VDOT ~ Speed (m/min) ...
            // Using specific formula: VO2 = -4.60 + 0.182258 * vel + 0.000104 * vel^2 (ACSM)
            const speedMinKm = 1000 / (activity.average_speed * 60); // min/km
            const speedMph = activity.average_speed * 2.237;
            // Simple estimation: VO2 Max approx = 15.3 * (MHR/RHR).
            // Let's use a lookup-like approximation for "Performance Level"
            // Actually, let's output Efficiency Factor for running too: Speed (m/min) / HR
            const speedMetersPerMin = activity.average_speed * 60;
            const ef = (speedMetersPerMin / activity.average_heartrate).toFixed(2);
            return { label: 'Efficiency Factor', value: ef, unit: 'm/min/bpm' };
        }
        return null;
    };

    const advancedMetric = estimateVO2Max();

    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-gray-500">
                        {format(new Date(activity.start_date_local || activity.start_date), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                    </p>
                    {/* Garmin Attribution */}
                    {activity.source_device_brand === 'Garmin' && (
                        <GarminAttribution size="small" />
                    )}
                </div>
                
                {/* Primary Stats Grid */}
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-9 gap-4 mb-6">
                    {stats.map(stat => (
                        <div key={stat.label} className="flex flex-col items-center text-center p-2 rounded-lg bg-gray-50">
                           <stat.icon className="w-6 h-6 text-orange-500 mb-2"/>
                           <p className="text-xs text-gray-500">{stat.label}</p>
                           <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Advanced Analysis Section */}
                <div className="border-t border-gray-100 pt-4 mt-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Award className="w-4 h-4 text-orange-500" />
                        Performance Analysis
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         {/* Comparison (Mocked/Logic-based) */}
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <p className="text-xs text-blue-600 font-medium mb-1">Relative Effort</p>
                            <p className="text-sm text-blue-900">
                                {activity.suffer_score > 50 ? "Harder than usual" : "Recovery / Light effort"}
                            </p>
                            <p className="text-xs text-blue-700 mt-1">
                                Based on Suffer Score
                            </p>
                        </div>

                        {/* Efficiency / VO2 Proxy */}
                        {advancedMetric && (
                            <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                                <p className="text-xs text-green-600 font-medium mb-1">{advancedMetric.label}</p>
                                <div className="flex items-baseline gap-1">
                                    <p className="text-lg font-bold text-green-900">{advancedMetric.value}</p>
                                    <p className="text-xs text-green-700">{advancedMetric.unit}</p>
                                </div>
                                <p className="text-xs text-green-700 mt-1">
                                    Higher is better (Output vs HR)
                                </p>
                            </div>
                        )}

                        {/* Intensity Distribution */}
                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                            <p className="text-xs text-purple-600 font-medium mb-1">Intensity Focus</p>
                            <p className="text-sm text-purple-900 font-medium">
                                {activity.average_heartrate > 150 ? "High Intensity" : activity.average_heartrate > 130 ? "Aerobic / Tempo" : "Base / Recovery"}
                            </p>
                             <p className="text-xs text-purple-700 mt-1">
                                Estimated from Avg HR
                            </p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}