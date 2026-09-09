
import React, { useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useUnits } from '@/components/units/UnitsProvider';
import { TrendingUp, Bike, Zap } from 'lucide-react';

export default function ActivityDetailSplits({ streams, activity }) {
  const { units, formatPace } = useUnits();
  
  const isCycling = activity && ['Ride', 'VirtualRide', 'EBikeRide'].includes(activity.type);

  const formatSpeedOrPace = useCallback((avgSpeed) => {
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
  }, [isCycling, units, formatPace]);

  const getHeaderUnit = () => {
    if (isCycling) {
      return units === 'kilometers' ? 'km/h' : 'mph';
    }
    return units === 'kilometers' ? '/km' : '/mi';
  };

  const splits = useMemo(() => {
    const timeStream = streams.find(s => s.type === 'time')?.data || [];
    const distStream = streams.find(s => s.type === 'distance')?.data || [];

    if (distStream.length === 0) return [];

    const splitDistance = units === 'kilometers' ? 1000 : 1609.34; // Meters per km/mile
    const calculatedSplits = [];
    let lastSplitIndex = 0;
    let lastSplitTime = 0;

    for (let i = 1; i < distStream.length; i++) {
      const distanceCovered = distStream[i];
      if (distanceCovered >= calculatedSplits.length * splitDistance + splitDistance) {
        const splitTime = timeStream[i] - lastSplitTime;
        const avgSpeed = (distStream[i] - distStream[lastSplitIndex]) / splitTime;
        
        calculatedSplits.push({
          split: calculatedSplits.length + 1,
          time: splitTime,
          speedOrPace: formatSpeedOrPace(avgSpeed)
        });
        
        lastSplitIndex = i;
        lastSplitTime = timeStream[i];
      }
    }
    return calculatedSplits;
  }, [streams, units, formatSpeedOrPace]);

  if (splits.length === 0) return null;
  
  const formatSplitTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5"/>
            Splits
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Split ({units === 'kilometers' ? 'km' : 'mi'})</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="flex items-center gap-1">
                {isCycling ? <Bike className="w-4 h-4"/> : <Zap className="w-4 h-4"/>}
                {isCycling ? 'Avg Speed' : 'Pace'} ({getHeaderUnit()})
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {splits.map(split => (
              <TableRow key={split.split}>
                <TableCell>{split.split}</TableCell>
                <TableCell>{formatSplitTime(split.time)}</TableCell>
                <TableCell>{split.speedOrPace}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
