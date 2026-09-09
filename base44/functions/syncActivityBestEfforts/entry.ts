import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const TARGETS = [
  ['400m', 400], ['1/2 mile', 804.672], ['1K', 1000], ['1 mile', 1609.344], ['2 mile', 3218.688], ['5K', 5000], ['10K', 10000], ['15K', 15000], ['10 mile', 16093.44], ['20K', 20000], ['Half Marathon', 21097.5], ['30K', 30000], ['Marathon', 42195], ['50K', 50000]
];
const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun'];
const rows = (value) => Array.isArray(value) ? value : value?.items || value?.data || [];
const valid = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

async function refresh(base44, userRecord) {
  const res = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: Deno.env.get('STRAVA_CLIENT_ID') || '', client_secret: Deno.env.get('STRAVA_CLIENT_SECRET') || '', refresh_token: userRecord.strava_refresh_token, grant_type: 'refresh_token' }) });
  if (!res.ok) throw new Error('Failed to refresh Strava connection');
  const data = await res.json();
  await base44.entities.User.update(userRecord.id, { strava_access_token: data.access_token, strava_refresh_token: data.refresh_token, strava_expires_at: new Date(data.expires_at * 1000).toISOString() });
  return data.access_token;
}

async function stravaFetch(url, base44, userRecord) {
  let token = userRecord.strava_access_token;
  if (userRecord.strava_expires_at && new Date(userRecord.strava_expires_at) <= new Date()) token = await refresh(base44, userRecord);
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 && userRecord.strava_refresh_token) { token = await refresh(base44, userRecord); res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); }
  return res;
}

function targetFor(effort) {
  const name = String(effort.name || '').toLowerCase().replace(/\s/g, '');
  const meters = Number(effort.distance || 0);
  return TARGETS.find(([label, target]) => label.toLowerCase().replace(/\s/g, '') === name || Math.abs(target - meters) <= Math.max(15, target * 0.012));
}
function averageHr(data, start, end) {
  const values = (data || []).slice(start, end + 1).filter(valid).map(Number);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}
function streamValue(data, index) { const value = data?.[index]; return Number.isFinite(Number(value)) ? Number(value) : null; }
function normalizedStreams(raw) {
  if (Array.isArray(raw)) return Object.fromEntries(raw.filter((s) => s?.type).map((s) => [s.type, s.data]));
  return Object.fromEntries(Object.entries(raw || {}).map(([type, stream]) => [type, Array.isArray(stream) ? stream : stream?.data]));
}
function fallbackEfforts(streams, totalDistance) {
  const distance = streams.distance || []; const time = streams.time || []; const moving = streams.moving || [];
  if (!distance.length || !time.length) return [];
  return TARGETS.filter(([, target]) => target <= totalDistance).map(([display_name, target], sort_order) => {
    let best = null;
    for (let start = 0; start < distance.length - 1; start += 1) {
      const startDistance = Number(distance[start]); if (!Number.isFinite(startDistance)) continue;
      const targetDistance = startDistance + target;
      let end = start + 1; while (end < distance.length && Number(distance[end]) < targetDistance) end += 1;
      if (end >= distance.length) continue;
      const previousDistance = Number(distance[end - 1]); const nextDistance = Number(distance[end]); const fraction = nextDistance === previousDistance ? 1 : (targetDistance - previousDistance) / (nextDistance - previousDistance);
      const endTime = Number(time[end - 1]) + fraction * (Number(time[end]) - Number(time[end - 1]));
      const elapsed = Math.round(endTime - Number(time[start]));
      const movingSeconds = moving.length ? Math.round(time.slice(start, end).reduce((sum, point, i) => sum + (moving[start + i] ? Number(time[start + i + 1] || point) - Number(point) : 0), 0)) : elapsed;
      if (movingSeconds <= 0 || (best && movingSeconds >= best.moving_time)) continue;
      best = { name: display_name, distance: target, moving_time: movingSeconds, elapsed_time: elapsed, start_index: start, end_index: end };
    }
    return best;
  }).filter(Boolean);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req); const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { activityId, force = false } = await req.json().catch(() => ({}));
    const activity = await base44.entities.Activity.get(activityId);
    if (!activity || !RUN_TYPES.includes(activity.type) || !activity.strava_id) return Response.json({ error: 'A running activity with a Strava ID is required' }, { status: 400 });
    const existing = rows(await base44.entities.ActivityBestEffort.filter({ activity_id: activity.id }, 'sort_order', 50, 0));
    const latest = existing.reduce((date, effort) => effort.synced_at > date ? effort.synced_at : date, '');
    if (!force && existing.length && (!activity.updated_date || latest >= activity.updated_date)) return Response.json({ efforts: existing, cached: true });
    const userRecord = await base44.entities.User.get(user.id);
    if (!userRecord?.strava_access_token) return Response.json({ error: 'Distance best efforts could not be retrieved from Strava.' }, { status: 401 });
    const detailsRes = await stravaFetch(`https://www.strava.com/api/v3/activities/${activity.strava_id}?include_all_efforts=true`, base44, userRecord);
    if (!detailsRes.ok) { console.error('best-effort detail fetch', { strava_id: activity.strava_id, athlete_id: activity.athlete_id, status: detailsRes.status, synced_at: new Date().toISOString() }); return Response.json({ error: 'Distance best efforts could not be retrieved from Strava.' }, { status: detailsRes.status }); }
    const detail = await detailsRes.json(); let sourceEfforts = (detail.best_efforts || []).map((effort) => ({ ...effort, target: targetFor(effort) })).filter((effort) => effort.target && Number(effort.distance) <= Number(activity.distance_m || detail.distance || 0) + 20);
    let streams = {}; const needsStreams = sourceEfforts.some((e) => !valid(e.average_heartrate) || e.start_index == null || e.end_index == null);
    if (needsStreams || !sourceEfforts.length) {
      const streamRes = await stravaFetch(`https://www.strava.com/api/v3/activities/${activity.strava_id}/streams?keys=time,distance,heartrate,altitude,moving&key_by_type=true`, base44, userRecord);
      if (streamRes.ok) streams = normalizedStreams(await streamRes.json());
      if (!sourceEfforts.length) sourceEfforts = fallbackEfforts(streams, Number(activity.distance_m || detail.distance || 0)).map((effort) => ({ ...effort, target: targetFor(effort) }));
    }
    const now = new Date().toISOString(); let created = 0; let updated = 0; const saved = [];
    for (const effort of sourceEfforts) {
      const [display_name, targetDistance] = effort.target; const start = effort.start_index ?? null; const end = effort.end_index ?? null;
      const heartRate = valid(effort.average_heartrate) ? Math.round(Number(effort.average_heartrate)) : (start !== null && end !== null ? averageHr(streams.heartrate, start, end) : null);
      const startAltitude = start !== null ? streamValue(streams.altitude, start) : null; const endAltitude = end !== null ? streamValue(streams.altitude, end) : null;
      const elevation = startAltitude === null || endAltitude === null ? null : Math.round(endAltitude - startAltitude);
      const moving = Math.round(Number(effort.moving_time || effort.elapsed_time || 0)); if (!moving) continue;
      const payload = { activity_id: activity.id, strava_id: String(activity.strava_id), athlete_id: String(activity.athlete_id || ''), effort_name: effort.name || display_name, display_name, sort_order: TARGETS.findIndex(([name]) => name === display_name), distance_m: Number(effort.distance || targetDistance), moving_time_s: moving, elapsed_time_s: Number(effort.elapsed_time || moving), pace_s_per_km: Math.round(moving / (Number(effort.distance || targetDistance) / 1000)), average_heartrate: heartRate, elevation_difference_m: elevation, start_index: start, end_index: end, pr_rank: effort.pr_rank ?? null, source: detail.best_efforts?.length ? 'strava_best_effort' : 'calculated_stream', synced_at: now, unique_key: `${activity.strava_id}:${targetDistance}` };
      const matching = existing.find((item) => item.unique_key === payload.unique_key); const result = matching ? await base44.entities.ActivityBestEffort.update(matching.id, payload) : await base44.entities.ActivityBestEffort.create(payload); matching ? updated += 1 : created += 1; saved.push(result);
    }
    return Response.json({ efforts: saved, created, updated, cached: false });
  } catch (error) {
    console.error('best-effort sync error', { message: error.message, synced_at: new Date().toISOString() });
    return Response.json({ error: 'Distance best efforts could not be retrieved from Strava.' }, { status: 500 });
  }
});