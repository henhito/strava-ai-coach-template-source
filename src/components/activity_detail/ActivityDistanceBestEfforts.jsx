import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActivityBestEffort } from '@/entities/ActivityBestEffort';
import { syncActivityBestEfforts } from '@/functions/syncActivityBestEfforts';

const formatTime = (seconds) => {
  const total = Math.round(seconds || 0); const hours = Math.floor(total / 3600); const minutes = Math.floor((total % 3600) / 60); const secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
};
const formatPace = (seconds) => { const total = Math.round(seconds || 0); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/km`; };
const formatElevation = (value) => value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${Math.round(value)} m`;

export default function ActivityDistanceBestEfforts({ activity }) {
  const [efforts, setEfforts] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [updatedAt, setUpdatedAt] = useState(null);
  const load = async (force = false) => {
    setLoading(true); setError(false);
    try {
      let cached = await ActivityBestEffort.filter({ activity_id: activity.id }, 'sort_order', 50);
      const stale = cached.some((item) => activity.updated_date && item.synced_at < activity.updated_date);
      if (force || !cached.length || stale) {
        const response = await syncActivityBestEfforts({ activityId: activity.id, force }); const data = response.data || response; cached = data.efforts || cached;
      }
      setEfforts(cached.sort((a, b) => a.sort_order - b.sort_order)); setUpdatedAt(cached[0]?.synced_at || null);
    } catch { setError(true); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [activity.id]);
  return <section className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
    <div className="flex items-start justify-between px-5 pt-5 pb-3"><div><h2 className="text-2xl font-bold text-foreground">Distance</h2>{updatedAt && <p className="mt-1 text-xs text-muted-foreground">Updated {new Date(updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}</div><Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></div>
    <div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Distance</th><th className="px-5 py-3 font-medium">Time</th><th className="px-5 py-3 font-medium">Pace</th><th className="px-5 py-3 font-medium">Heart Rate</th><th className="px-5 py-3 font-medium">Elev</th></tr></thead><tbody>{loading ? [1, 2, 3, 4].map((row) => <tr key={row} className="border-t border-border"><td colSpan="5" className="px-5 py-4"><div className="h-4 w-full animate-pulse rounded bg-muted" /></td></tr>) : efforts.map((effort) => <tr key={effort.id} className="border-t border-border"><td className="px-5 py-4 font-medium">{effort.display_name}</td><td className="px-5 py-4">{formatTime(effort.moving_time_s)}</td><td className="px-5 py-4">{formatPace(effort.pace_s_per_km)}</td><td className="px-5 py-4">{effort.average_heartrate ? `${Math.round(effort.average_heartrate)} bpm` : '—'}</td><td className="px-5 py-4">{formatElevation(effort.elevation_difference_m)}</td></tr>)}</tbody></table></div>
    {!loading && !efforts.length && <p className="px-5 py-5 text-sm text-muted-foreground">{error ? 'Distance best efforts could not be retrieved from Strava.' : 'No distance best efforts are available for this activity.'}</p>}
  </section>;
}