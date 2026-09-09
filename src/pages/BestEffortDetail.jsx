import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Loader2, Trophy, ExternalLink } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';

import { listTopEffortsByDistance } from '@/functions/listTopEffortsByDistance';

/* ---------------- helpers ---------------- */

const DETAIL_LIMIT = 5;
const LONG_RIDE_LIMIT = 20;

const formatTime = (seconds) => {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return 'N/A';
  const s = Math.round(n);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
};

const formatPace = (paceSecsPerKm) => {
  const p = Number(paceSecsPerKm);
  if (!Number.isFinite(p) || p <= 0) return 'N/A';
  const min = Math.floor(p / 60);
  const sec = Math.round(p % 60);
  return `${min}:${String(sec).padStart(2, '0')}/km`;
};

const formatDistanceKm = (meters) => {
  const m = Number(meters);
  if (!Number.isFinite(m) || m <= 0) return '—';
  return `${(m / 1000).toFixed(1)} km`;
};

/* ---------------- distances ---------------- */

const DISTANCES = {
  '400m': { label: '400m' },
  '800m': { label: '800m' },
  '1k': { label: '1K' },
  '0_5mi': { label: '1/2 Mile' },
  '1mi': { label: '1 Mile' },
  '2mi': { label: '2 Mile' },
  '5k': { label: '5K' },
  '5mi': { label: '5 Mile' },
  '10k': { label: '10K' },
  '15k': { label: '15K' },
  '10mi': { label: '10 Mile' },
  '20k': { label: '20K' },
  '30k': { label: '30K' },
  'half': { label: 'Half-Marathon' },
  'marathon': { label: 'Marathon' },
  '40k': { label: '40K' },
  '50k': { label: '50K' },
  '80k': { label: '80K' },
  '90k': { label: '90K' },
  '100k': { label: '100K' },
  '50mi': { label: '50 Mile' },
  '100mi': { label: '100 Mile' },
  '180k': { label: '180K' },
  '180kplus': { label: '180K+' },
  '100kplus': { label: '100K+' }
};

/* ---------------- page ---------------- */

export default function BestEffortDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [distanceSlug, setDistanceSlug] = useState(null);
  const [activityType, setActivityType] = useState('Run');
  const [efforts, setEfforts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Parse slug and activity type
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const slug = params.get('distance');
    const typeParam = params.get('type') || 'Run';
    // Normalize type to correct case: run -> Run, ride -> Ride
    const type = typeParam.toLowerCase() === 'ride' ? 'Ride' : 'Run';
    if (slug && DISTANCES[slug]) {
      setDistanceSlug(slug);
      setActivityType(type);
      setError(null);
    } else {
      setDistanceSlug(null);
      setError('Invalid or missing distance.');
    }
  }, [location.search]);

  // Fetch efforts
  useEffect(() => {
    if (!distanceSlug) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const isLongRideCategory = (distanceSlug === '180kplus' || distanceSlug === '100kplus');
        const resp = await listTopEffortsByDistance({
          distance: distanceSlug,
          limit: isLongRideCategory ? LONG_RIDE_LIMIT : DETAIL_LIMIT,
          type: activityType
        });

        const data = resp?.data || resp;
        if (data?.error) throw new Error(data.error);

        if (!cancelled) {
          setEfforts(Array.isArray(data.items) ? data.items : []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load efforts');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [distanceSlug, activityType]);

  const handleDistanceChange = (newSlug) => {
    navigate(`${window.location.pathname}?distance=${newSlug}&type=${activityType}`);
  };

  if (!distanceSlug) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="p-12 text-center">
            <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{error}</p>
            <Button asChild>
              <Link to={createPageUrl('BestEfforts')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Link>
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const currentLabel = DISTANCES[distanceSlug].label;
  const activityLabel = activityType === 'Ride' ? 'Cycling' : 'Running';
  const isLongRideCategory = (distanceSlug === '180kplus' || distanceSlug === '100kplus');
  const longRideThresholdLabel = distanceSlug === '100kplus' ? '100K' : '180K';
  const heading = isLongRideCategory
    ? `Longest rides over ${longRideThresholdLabel} (${activityLabel})`
    : `Top ${DETAIL_LIMIT}: ${currentLabel} (${activityLabel})`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Trophy className="w-8 h-8 text-orange-500" />
            {heading}
          </h1>

          <Select value={distanceSlug} onValueChange={handleDistanceChange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DISTANCES).map(([slug, d]) => (
                <SelectItem key={slug} value={slug}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading && (
          <Card className="p-12 text-center">
            <Loader2 className="w-16 h-16 animate-spin mx-auto mb-4" />
            Loading…
          </Card>
        )}

        {!isLoading && error && (
          <Card className="p-12 text-center bg-red-50">
            {error}
          </Card>
        )}

        {!isLoading && !error && efforts.length === 0 && (
          <Card className="p-12 text-center">
            No {currentLabel} efforts found
          </Card>
        )}

        {!isLoading && !error && efforts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                {isLongRideCategory ? `Rides over ${longRideThresholdLabel} by distance` : `Fastest ${currentLabel} (${activityLabel})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Date</TableHead>
                    {isLongRideCategory && <TableHead>Distance</TableHead>}
                    <TableHead>Time</TableHead>
                    <TableHead>{activityType === 'Ride' ? 'Speed' : 'Pace'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {efforts.map((e, i) => {
                    const linkId = e.activity_id || e.strava_id || e.id;
                    return (
                      <TableRow key={`${linkId}-${i}`}>
                        <TableCell className="font-bold text-orange-600">#{i + 1}</TableCell>
                        <TableCell>
                          <Link
                            to={createPageUrl(`ActivityDetail?id=${linkId}`)}
                            className="flex items-center gap-2 text-blue-600 hover:underline"
                          >
                            {e.activity_name || e.name || 'Activity'}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </TableCell>
                        <TableCell>
                          {e.activity_date || e.start_date ? format(new Date(e.activity_date || e.start_date), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        {isLongRideCategory && (
                          <TableCell className="font-semibold text-orange-600">{formatDistanceKm(e.distance_m)}</TableCell>
                        )}
                        <TableCell className={isLongRideCategory ? '' : 'font-semibold text-orange-600'}>{formatTime(e.elapsed_time_s)}</TableCell>
                        <TableCell className="text-gray-600">
                          {activityType === 'Ride' 
                            ? (e.speed_kph ? `${Number(e.speed_kph).toFixed(1)} km/h` : '—')
                            : formatPace(e.pace_s_per_km)
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}