import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Heart, Mountain, Zap, Thermometer, Footprints, Bolt } from 'lucide-react';
import { useUnits } from '@/components/units/UnitsProvider';
import { User } from '@/entities/User'; // Corrected import path

export default function ActivityDetailCharts({ streams, activity }) {
  const { formatDistance, units } = useUnits();
  const [userHRZones, setUserHRZones] = useState(null);

  // Load user's custom HR zones
  useEffect(() => {
    const loadUserZones = async () => {
      try {
        const user = await User.me(); // This will now work correctly
        if (user && user.hr_zones) {
          setUserHRZones(user.hr_zones);
        }
      } catch (error) {
        console.error('Could not load user HR zones:', error);
      }
    };
    loadUserZones();
  }, []); // Empty dependency array means this effect runs once on mount

  const chartData = useMemo(() => {
    const timeStream = streams.find(s => s.type === 'time')?.data || [];
    const distStream = streams.find(s => s.type === 'distance')?.data || [];
    const altStream = streams.find(s => s.type === 'altitude')?.data || [];
    const hrStream = streams.find(s => s.type === 'heartrate')?.data || [];
    const veloStream = streams.find(s => s.type === 'velocity_smooth')?.data || [];
    const tempStream = streams.find(s => s.type === 'temp')?.data || [];
    const cadenceStream = streams.find(s => s.type === 'cadence')?.data || [];
    const wattsStream = streams.find(s => s.type === 'watts')?.data || [];

    if (timeStream.length === 0) return [];
    
    const activityType = activity?.type || 'Run';
    const isCycling = ['Ride', 'VirtualRide', 'EBikeRide'].includes(activityType);

    return timeStream.map((time, i) => ({
      time,
      distance: distStream[i] || 0,
      altitude: altStream[i] || null,
      heartrate: hrStream[i] || null,
      speed: veloStream[i] || null, // velocity_smooth is in m/s
      temperature: tempStream[i] || null,
      cadence: isCycling ? (cadenceStream[i] || null) : ((cadenceStream[i] || 0) * 2), // Double for running
      watts: wattsStream[i] || null,
    }));
  }, [streams, activity]);

  // Calculate stats for each chart
  const speedStats = useMemo(() => {
    const speeds = chartData.filter(d => d.speed !== null && d.speed > 0).map(d => d.speed);
    if (speeds.length === 0) return { avg: 'N/A', max: 'N/A' };
    
    const avgSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length; // avg speed in m/s
    const maxSpeed = Math.max(...speeds); // max speed in m/s
    
    const activityType = activity?.type || 'Run';
    const isCycling = ['Ride', 'VirtualRide', 'EBikeRide'].includes(activityType);
    
    const formatPaceValue = (minutesPerUnit) => {
      if (isNaN(minutesPerUnit) || !isFinite(minutesPerUnit)) return '0:00';
      const minutes = Math.floor(minutesPerUnit);
      const seconds = Math.round((minutesPerUnit % 1) * 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    if (isCycling) {
      // For cycling, show as km/h or mph
      if (units === 'kilometers') {
        return { 
          avg: `${(avgSpeed * 3.6).toFixed(1)} km/h`, 
          max: `${(maxSpeed * 3.6).toFixed(1)} km/h` 
        };
      } else {
        return { 
          avg: `${(avgSpeed * 2.237).toFixed(1)} mph`, 
          max: `${(maxSpeed * 2.237).toFixed(1)} mph` 
        };
      }
    } else {
      // For running, show as pace (minutes per km/mile)
      // Convert m/s to km/h or mph first, then calculate pace
      const avgPaceMinutesPerUnit = (units === 'kilometers') 
        ? (avgSpeed > 0 ? 60 / (avgSpeed * 3.6) : Infinity) // min/km
        : (avgSpeed > 0 ? 60 / (avgSpeed * 2.237) : Infinity); // min/mile
      
      const maxPaceMinutesPerUnit = (units === 'kilometers') 
        ? (maxSpeed > 0 ? 60 / (maxSpeed * 3.6) : Infinity) // min/km (for max speed = fastest pace)
        : (maxSpeed > 0 ? 60 / (maxSpeed * 2.237) : Infinity); // min/mile (for max speed = fastest pace)
      
      const unitLabel = units === 'kilometers' ? '/km' : '/mi';
      return {
        avg: `${formatPaceValue(avgPaceMinutesPerUnit)}${unitLabel}`,
        // max speed results in the fastest pace (lowest minutes per unit)
        max: `${formatPaceValue(maxPaceMinutesPerUnit)}${unitLabel}` 
      };
    }
  }, [chartData, activity, units]);

  const hrStats = useMemo(() => {
    const hrs = chartData.filter(d => d.heartrate !== null).map(d => d.heartrate);
    if (hrs.length === 0) return { avg: 'N/A', max: 'N/A' };
    
    const avg = Math.round(hrs.reduce((sum, hr) => sum + hr, 0) / hrs.length);
    const max = Math.round(Math.max(...hrs));
    
    return { avg: `${avg} bpm`, max: `${max} bpm` };
  }, [chartData]);

  const elevationStats = useMemo(() => {
    const elevations = chartData.filter(d => d.altitude !== null).map(d => d.altitude); // altitude is in meters
    if (elevations.length === 0) return { min: 'N/A', max: 'N/A' };
    
    const minMeters = Math.min(...elevations);
    const maxMeters = Math.max(...elevations);

    if (units === 'kilometers') { // Use meters for metric units
      return { min: `${Math.round(minMeters)} m`, max: `${Math.round(maxMeters)} m` };
    } else { // Use feet for imperial units
      return { min: `${Math.round(minMeters * 3.28084)} ft`, max: `${Math.round(maxMeters * 3.28084)} ft` };
    }
  }, [chartData, units]);
  
  const cadenceStats = useMemo(() => {
    const cadences = chartData.filter(d => d.cadence !== null && d.cadence > 0).map(d => d.cadence);
    if (cadences.length === 0) return { avg: 'N/A', max: 'N/A' };
    
    const avg = Math.round(cadences.reduce((sum, c) => sum + c, 0) / cadences.length);
    const max = Math.round(Math.max(...cadences));
    
    return { avg, max };
  }, [chartData]);

  const powerStats = useMemo(() => {
    const watts = chartData.filter(d => d.watts !== null).map(d => d.watts);
    if (watts.length === 0) return { avg: 'N/A', max: 'N/A' };
    
    const avg = Math.round(watts.reduce((sum, w) => sum + w, 0) / watts.length);
    const max = Math.round(Math.max(...watts));
    
    return { avg, max };
  }, [chartData]);

    const formatZoneTime = (seconds) => {
    if (seconds === 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Heart Rate Zones
  const hrZones = useMemo(() => {
    const timeStream = streams.find(s => s.type === 'time')?.data || [];
    const hrStream = streams.find(s => s.type === 'heartrate')?.data || [];
    
    if (hrStream.length === 0 || timeStream.length === 0) return [];
    
    let zones;
    
    if (userHRZones && userHRZones.zone1_max) {
      zones = [
        { name: 'Zone 1', range: [0, userHRZones.zone1_max], color: '#64748b', timeSeconds: 0 },
        { name: 'Zone 2', range: [userHRZones.zone1_max, userHRZones.zone2_max], color: '#3b82f6', timeSeconds: 0 },
        { name: 'Zone 3', range: [userHRZones.zone2_max, userHRZones.zone3_max], color: '#10b981', timeSeconds: 0 },
        { name: 'Zone 4', range: [userHRZones.zone3_max, userHRZones.zone4_max], color: '#f59e0b', timeSeconds: 0 },
        { name: 'Zone 5', range: [userHRZones.zone4_max, userHRZones.zone5_max || Infinity], color: '#ef4444', timeSeconds: 0 }
      ];
    } else {
      const recordedMaxHR = Math.max(...hrStream.filter(hr => hr > 0));
      const maxHR = activity.max_heartrate || recordedMaxHR || 190;
      zones = [
        { name: 'Zone 1', range: [0, 0.6 * maxHR], color: '#64748b', timeSeconds: 0 },
        { name: 'Zone 2', range: [0.6 * maxHR, 0.7 * maxHR], color: '#3b82f6', timeSeconds: 0 },
        { name: 'Zone 3', range: [0.7 * maxHR, 0.8 * maxHR], color: '#10b981', timeSeconds: 0 },
        { name: 'Zone 4', range: [0.8 * maxHR, 0.9 * maxHR], color: '#f59e0b', timeSeconds: 0 },
        { name: 'Zone 5', range: [0.9 * maxHR, Infinity], color: '#ef4444', timeSeconds: 0 }
      ];
    }
    
    for (let i = 0; i < hrStream.length - 1; i++) {
      const hr = hrStream[i];
      if (!hr || hr <= 0) continue;
      const timeInterval = timeStream[i + 1] - timeStream[i];
      const zone = zones.find(z => hr >= z.range[0] && hr < z.range[1]);
      if (zone) zone.timeSeconds += timeInterval;
    }
    
    const totalTimeSeconds = zones.reduce((sum, zone) => sum + zone.timeSeconds, 0);
    
    return zones.map(zone => ({
      ...zone,
      timeFormatted: formatZoneTime(zone.timeSeconds),
      percentage: totalTimeSeconds > 0 ? Math.round((zone.timeSeconds / totalTimeSeconds) * 100) : 0,
      label: `${Math.round(zone.range[0])}-${zone.range[1] === Infinity ? '+' : Math.round(zone.range[1])} bpm`
    }));
  }, [streams, activity, userHRZones]);

  // Power Zones
  const powerZones = useMemo(() => {
    const timeStream = streams.find(s => s.type === 'time')?.data || [];
    const wattsStream = streams.find(s => s.type === 'watts')?.data || [];
    
    if (wattsStream.length === 0 || timeStream.length === 0) return [];
    
    // Use FTP if available, else estimate from Max Avg Power (95% of 20m max or similar). 
    // For now, simplified: use avg power as base or 200W default
    const avgPower = wattsStream.reduce((a, b) => a + b, 0) / wattsStream.length;
    const estimatedFTP = avgPower * 1.3; // Rough estimate if no FTP setting
    
    const zones = [
      { name: 'Active Recovery', range: [0, 0.55 * estimatedFTP], color: '#9ca3af', timeSeconds: 0 },
      { name: 'Endurance', range: [0.55 * estimatedFTP, 0.75 * estimatedFTP], color: '#3b82f6', timeSeconds: 0 },
      { name: 'Tempo', range: [0.75 * estimatedFTP, 0.90 * estimatedFTP], color: '#10b981', timeSeconds: 0 },
      { name: 'Threshold', range: [0.90 * estimatedFTP, 1.05 * estimatedFTP], color: '#f59e0b', timeSeconds: 0 },
      { name: 'VO2 Max', range: [1.05 * estimatedFTP, 1.20 * estimatedFTP], color: '#ef4444', timeSeconds: 0 },
      { name: 'Anaerobic', range: [1.20 * estimatedFTP, Infinity], color: '#7f1d1d', timeSeconds: 0 }
    ];

    for (let i = 0; i < wattsStream.length - 1; i++) {
      const w = wattsStream[i];
      if (w < 0) continue;
      const timeInterval = timeStream[i + 1] - timeStream[i];
      const zone = zones.find(z => w >= z.range[0] && w < z.range[1]);
      if (zone) zone.timeSeconds += timeInterval;
    }

    const totalTimeSeconds = zones.reduce((sum, zone) => sum + zone.timeSeconds, 0);

    return zones.map(zone => ({
      ...zone,
      timeFormatted: formatZoneTime(zone.timeSeconds),
      percentage: totalTimeSeconds > 0 ? Math.round((zone.timeSeconds / totalTimeSeconds) * 100) : 0,
      label: `${Math.round(zone.range[0])}-${zone.range[1] === Infinity ? '+' : Math.round(zone.range[1])} W`
    }));
  }, [streams]);

  // Pace Zones (for Running)
  const paceZones = useMemo(() => {
    if (activity?.type !== 'Run') return [];
    const timeStream = streams.find(s => s.type === 'time')?.data || [];
    const veloStream = streams.find(s => s.type === 'velocity_smooth')?.data || [];
    
    if (veloStream.length === 0 || timeStream.length === 0) return [];

    // Calculate average speed (ignoring stops)
    const movingSpeeds = veloStream.filter(v => v > 0.5); // Ignore very slow speeds
    if (movingSpeeds.length === 0) return [];
    const avgSpeed = movingSpeeds.reduce((a, b) => a + b, 0) / movingSpeeds.length;
    
    // Define zones based on average speed
    const zones = [
      { name: 'Recovery', range: [0, avgSpeed * 0.8], color: '#9ca3af', timeSeconds: 0 },
      { name: 'Easy', range: [avgSpeed * 0.8, avgSpeed * 0.95], color: '#3b82f6', timeSeconds: 0 },
      { name: 'Moderate', range: [avgSpeed * 0.95, avgSpeed * 1.05], color: '#10b981', timeSeconds: 0 },
      { name: 'Tempo', range: [avgSpeed * 1.05, avgSpeed * 1.15], color: '#f59e0b', timeSeconds: 0 },
      { name: 'Speed', range: [avgSpeed * 1.15, Infinity], color: '#ef4444', timeSeconds: 0 }
    ];

    for (let i = 0; i < veloStream.length - 1; i++) {
      const v = veloStream[i];
      if (v < 0.1) continue;
      const timeInterval = timeStream[i + 1] - timeStream[i];
      const zone = zones.find(z => v >= z.range[0] && v < z.range[1]);
      if (zone) zone.timeSeconds += timeInterval;
    }

    const totalTimeSeconds = zones.reduce((sum, zone) => sum + zone.timeSeconds, 0);

    // Helper to format pace label (min/km or min/mi)
    const formatPaceLabel = (mps) => {
      if (mps === 0 || mps === Infinity) return '';
      if (units === 'kilometers') {
        const minPerKm = 60 / (mps * 3.6);
        const min = Math.floor(minPerKm);
        const sec = Math.round((minPerKm % 1) * 60);
        return `${min}:${sec.toString().padStart(2, '0')}/km`;
      } else {
        const minPerMi = 60 / (mps * 2.237);
        const min = Math.floor(minPerMi);
        const sec = Math.round((minPerMi % 1) * 60);
        return `${min}:${sec.toString().padStart(2, '0')}/mi`;
      }
    };

    return zones.map(zone => ({
      ...zone,
      timeFormatted: formatZoneTime(zone.timeSeconds),
      percentage: totalTimeSeconds > 0 ? Math.round((zone.timeSeconds / totalTimeSeconds) * 100) : 0,
      label: zone.range[1] === Infinity 
        ? `< ${formatPaceLabel(zone.range[0])}` 
        : `${formatPaceLabel(zone.range[0])} - ${formatPaceLabel(zone.range[1])}`
    }));
  }, [streams, activity, units]);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSpeedValue = (metersPerSecond) => {
    if (!metersPerSecond || metersPerSecond === 0) return 'N/A';
    
    const activityType = activity?.type || 'Run';
    
    // For cycling activities, show speed in km/h or mph
    if (['Ride', 'VirtualRide', 'EBikeRide'].includes(activityType)) {
      if (units === 'kilometers') {
        const kmh = metersPerSecond * 3.6;
        return `${kmh.toFixed(1)} km/h`;
      } else {
        const mph = metersPerSecond * 2.237;
        return `${mph.toFixed(1)} mph`;
      }
    }
    
    // For running activities, show pace
    if (units === 'kilometers') {
      const kmPerHour = metersPerSecond * 3.6;
      const minutesPerKm = kmPerHour > 0 ? 60 / kmPerHour : Infinity;
      const minutes = Math.floor(minutesPerKm);
      const seconds = Math.round((minutesPerKm % 1) * 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
    } else {
      const milesPerHour = metersPerSecond * 2.237;
      const minutesPerMile = milesPerHour > 0 ? 60 / milesPerHour : Infinity;
      const minutes = Math.floor(minutesPerMile);
      const seconds = Math.round((minutesPerMile % 1) * 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
    }
  };

  const formatSpeedForYAxis = (metersPerSecond) => {
    if (!metersPerSecond || metersPerSecond === 0) return '';
    
    const activityType = activity?.type || 'Run';
    
    // For cycling activities, show speed in km/h or mph
    if (['Ride', 'VirtualRide', 'EBikeRide'].includes(activityType)) {
      if (units === 'kilometers') {
        const kmh = metersPerSecond * 3.6;
        return Math.round(kmh);
      } else {
        const mph = metersPerSecond * 2.237;
        return Math.round(mph);
      }
    }
    
    // For running activities, show pace (but simplified for Y-axis)
    // Here we're still returning pace as a string, but the actual plotting uses m/s
    if (units === 'kilometers') {
      const kmPerHour = metersPerSecond * 3.6;
      const minutesPerKm = kmPerHour > 0 ? 60 / kmPerHour : Infinity;
      const minutes = Math.floor(minutesPerKm);
      const seconds = Math.round((minutesPerKm % 1) * 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
      const milesPerHour = metersPerSecond * 2.237;
      const minutesPerMile = milesPerHour > 0 ? 60 / milesPerHour : Infinity;
      const minutes = Math.floor(minutesPerMile);
      const seconds = Math.round((minutesPerMile % 1) * 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };

  const getSpeedChartTitle = () => {
    const activityType = activity?.type || 'Run';
    if (['Ride', 'VirtualRide', 'EBikeRide'].includes(activityType)) {
      return 'Speed';
    }
    return 'Pace';
  };

  const getSpeedUnit = () => {
    const activityType = activity?.type || 'Run';
    if (['Ride', 'VirtualRide', 'EBikeRide'].includes(activityType)) {
      return units === 'kilometers' ? 'km/h' : 'mph';
    }
    return units === 'kilometers' ? '/km' : '/mi';
  };

  const formatAltitudeValue = (meters) => {
    if (meters === null) return 'N/A';
    return units === 'kilometers' ? `${Math.round(meters)} m` : `${Math.round(meters * 3.28084)} ft`;
  };

  const formatAltitudeForYAxis = (meters) => {
    if (meters === null) return '';
    return units === 'kilometers' ? Math.round(meters) : Math.round(meters * 3.28084);
  };

  const getAltitudeUnit = () => {
    return units === 'kilometers' ? 'm' : 'ft';
  };

  const formatTemperatureValue = (celsius) => {
    if (celsius === null) return 'N/A';
    if (units === 'kilometers') { // Metric: Celsius
      return `${celsius.toFixed(1)} °C`;
    } else { // Imperial: Fahrenheit
      const fahrenheit = (celsius * 9/5) + 32;
      return `${fahrenheit.toFixed(1)} °F`;
    }
  };

  const formatTemperatureForYAxis = (celsius) => {
    if (celsius === null) return '';
    if (units === 'kilometers') { // Metric: Celsius
      return Math.round(celsius);
    } else { // Imperial: Fahrenheit
      const fahrenheit = (celsius * 9/5) + 32;
      return Math.round(fahrenheit);
    }
  };

  const getTemperatureUnit = () => {
    return units === 'kilometers' ? '°C' : '°F';
  };


  const SharedTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dataPoint = chartData.find(d => d.time === label);
      if (!dataPoint) return null;

      const activityType = activity?.type || 'Run';

      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
          <p className="font-semibold text-gray-900 mb-2">
            Time: {formatTime(dataPoint.time)}
          </p>
          <p className="text-gray-700">
            Distance: {formatDistance(dataPoint.distance)}
          </p>
          {payload.map((entry, i) => {
            let valueToDisplay;
            if (entry.dataKey === 'speed') {
              valueToDisplay = formatSpeedValue(entry.value);
            } else if (entry.dataKey === 'altitude') {
              valueToDisplay = formatAltitudeValue(entry.value);
            } else if (entry.dataKey === 'temperature') {
              valueToDisplay = formatTemperatureValue(entry.value);
            } else if (entry.dataKey === 'watts') {
              valueToDisplay = `${Math.round(entry.value)} W`;
            } else if (entry.dataKey === 'cadence') {
              const unit = ['Ride', 'VirtualRide', 'EBikeRide'].includes(activityType) ? 'rpm' : 'spm';
              valueToDisplay = `${Math.round(entry.value)} ${unit}`;
            } else {
              valueToDisplay = `${entry.value} ${entry.unit || ''}`;
            }

            return (
              <p key={i} style={{ color: entry.stroke || entry.color }} className="font-medium">
                {entry.name}: {valueToDisplay}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const hasSpeed = chartData.some(d => d.speed !== null);
  const hasHeartrate = chartData.some(d => d.heartrate !== null);
  const hasAltitude = chartData.some(d => d.altitude !== null);
  const hasTemperature = chartData.some(d => d.temperature !== null);
  const hasCadence = chartData.some(d => d.cadence !== null && d.cadence > 0);
  const hasPower = chartData.some(d => d.watts !== null);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="h-64 flex items-center justify-center text-gray-500">
          No chart data available for this activity.
        </CardContent>
      </Card>
    );
  }

  const commonTooltipProps = {
    cursor: { stroke: '#666', strokeDasharray: '2 2' },
    content: <SharedTooltip />,
    isAnimationActive: false // Important for performance
  };

  const isRunning = !['Ride', 'VirtualRide', 'EBikeRide'].includes(activity?.type || 'Run');
  const activityType = activity?.type || 'Run';

  return (
    <div className="space-y-6">
      {/* Speed/Pace Chart */}
      {hasSpeed && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-500" /> 
                {getSpeedChartTitle()}
              </div>
              <div className="flex gap-4 text-sm text-gray-600">
                <span>Avg: <strong>{speedStats.avg}</strong></span>
                <span>{isRunning ? 'Fastest' : 'Max'}: <strong>{speedStats.max}</strong></span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart 
                data={chartData} 
                syncId="activityCharts"
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTime}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickFormatter={formatSpeedForYAxis}
                  reversed={false} // Setting to false ensures higher speed (m/s) values are at the top, which means faster pace/speed
                  domain={['auto', 'auto']}
                />
                <Tooltip {...commonTooltipProps} />
                <Line 
                  type="monotone" 
                  dataKey="speed" 
                  name={getSpeedChartTitle()} 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                  unit={getSpeedUnit()}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Heart Rate Chart */}
      {hasHeartrate && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-500" /> 
                Heart Rate
              </div>
              <div className="flex gap-4 text-sm text-gray-600">
                <span>Avg: <strong>{hrStats.avg}</strong></span>
                <span>Max: <strong>{hrStats.max}</strong></span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart 
                data={chartData}
                syncId="activityCharts"
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTime}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickFormatter={(val) => Math.round(val)}
                />
                <Tooltip {...commonTooltipProps} />
                <Line 
                  type="monotone" 
                  dataKey="heartrate" 
                  name="Heart Rate" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#ef4444' }}
                  unit="bpm"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Power Chart */}
      {hasPower && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bolt className="w-5 h-5 text-yellow-500" /> 
                Power
              </div>
              <div className="flex gap-4 text-sm text-gray-600">
                <span>Avg: <strong>{powerStats.avg} W</strong></span>
                <span>Max: <strong>{powerStats.max} W</strong></span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart 
                data={chartData}
                syncId="activityCharts"
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTime}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickFormatter={(val) => Math.round(val)}
                />
                <Tooltip {...commonTooltipProps} />
                <Line 
                  type="monotone" 
                  dataKey="watts" 
                  name="Power" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#f59e0b' }}
                  unit="W"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      
      {/* Cadence Chart */}
      {hasCadence && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Footprints className="w-5 h-5 text-green-500" /> 
                Cadence
              </div>
              <div className="flex gap-4 text-sm text-gray-600">
                <span>Avg: <strong>{cadenceStats.avg}</strong></span>
                <span>Max: <strong>{cadenceStats.max}</strong></span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart 
                data={chartData}
                syncId="activityCharts"
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTime}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickFormatter={(val) => Math.round(val)}
                />
                <Tooltip {...commonTooltipProps} />
                <Line 
                  type="monotone" 
                  dataKey="cadence" 
                  name="Cadence" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981' }}
                  unit={['Ride', 'VirtualRide', 'EBikeRide'].includes(activityType) ? 'rpm' : 'spm'}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Elevation Profile (Area Chart) */}
      {hasAltitude && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mountain className="w-5 h-5 text-gray-500" /> 
                Elevation Profile
              </div>
              <div className="flex gap-4 text-sm text-gray-600">
                <span>Min: <strong>{elevationStats.min}</strong></span>
                <span>Max: <strong>{elevationStats.max}</strong></span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart 
                data={chartData}
                syncId="activityCharts"
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="colorAltitude" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6b7280" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6b7280" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTime}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <YAxis 
                  tickFormatter={formatAltitudeForYAxis}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <Tooltip {...commonTooltipProps} />
                <Area 
                  type="monotone" 
                  dataKey="altitude" 
                  name="Elevation" 
                  stroke="#4b5563" 
                  fillOpacity={1} 
                  fill="url(#colorAltitude)" 
                  unit={getAltitudeUnit()}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Temperature Chart */}
      {hasTemperature && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Thermometer className="w-5 h-5 text-cyan-500" /> 
              Temperature
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart 
                data={chartData}
                syncId="activityCharts"
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={formatTime}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickFormatter={formatTemperatureForYAxis}
                />
                <Tooltip {...commonTooltipProps} />
                <Line 
                  type="monotone" 
                  dataKey="temperature" 
                  name="Temperature" 
                  stroke="#06b6d4" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#06b6d4' }}
                  unit={getTemperatureUnit()}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Zone Analysis Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Heart Rate Zones */}
        {hasHeartrate && hrZones.some(zone => zone.timeSeconds > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Heart className="w-5 h-5 text-red-500" /> 
                Heart Rate Zones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {hrZones.slice().reverse().map((zone, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-gray-700">{zone.name}</span>
                      <span className="text-gray-500">{zone.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ 
                            width: `${zone.percentage}%`, 
                            backgroundColor: zone.color 
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium w-12 text-right">{zone.percentage}%</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{zone.timeFormatted}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Power Zones */}
        {hasPower && powerZones.some(zone => zone.timeSeconds > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bolt className="w-5 h-5 text-yellow-500" /> 
                Power Zones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {powerZones.slice().reverse().map((zone, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-gray-700">{zone.name}</span>
                      <span className="text-gray-500">{zone.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ 
                            width: `${zone.percentage}%`, 
                            backgroundColor: zone.color 
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium w-12 text-right">{zone.percentage}%</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{zone.timeFormatted}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pace Zones */}
        {!hasPower && paceZones.some(zone => zone.timeSeconds > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="w-5 h-5 text-blue-500" /> 
                Pace Zones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {paceZones.slice().reverse().map((zone, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-gray-700">{zone.name}</span>
                      <span className="text-gray-500">{zone.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ 
                            width: `${zone.percentage}%`, 
                            backgroundColor: zone.color 
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium w-12 text-right">{zone.percentage}%</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{zone.timeFormatted}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}