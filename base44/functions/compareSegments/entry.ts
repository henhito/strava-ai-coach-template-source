import { createClientFromRequest } from 'npm:@base44/sdk@0.8.36';

function json(data, init = {}) {
  const h = new Headers(init.headers || {});
  if (!h.get('content-type')) h.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data, null, 2), { ...init, headers: h });
}
function normalizeArray(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp?.items) return resp.items;
  if (resp?.data) return resp.data;
  return [];
}
async function refreshStravaToken(base44, userRecord) {
  const clientId = Deno.env.get('STRAVA_CLIENT_ID');
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: userRecord.strava_refresh_token, grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error('Failed to refresh Strava token');
  const tokenData = await response.json();
  await base44.asServiceRole.entities.User.update(userRecord.id, {
    strava_access_token: tokenData.access_token,
    strava_refresh_token: tokenData.refresh_token,
    strava_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
  });
  return tokenData.access_token;
}
async function getStravaAccessToken(base44, userRecord) {
  if (!userRecord?.strava_access_token) return null;
  let token = userRecord.strava_access_token;
  if (userRecord.strava_expires_at && new Date(userRecord.strava_expires_at) <= new Date()) {
    token = await refreshStravaToken(base44, userRecord);
  }
  return token;
}
async function resolveActivity(base44, activityId) {
  let activity = null;
  try { activity = await base44.entities.Activity.get(activityId); } catch { /* */ }
  if (!activity) {
    const numId = Number(activityId);
    const query = Number.isNaN(numId) ? { strava_id: activityId } : { strava_id: numId };
    try {
      const res = await base44.entities.Activity.filter(query, '-start_date', 5);
      activity = normalizeArray(res)[0] || null;
    } catch { /* */ }
  }
  return activity;
}
async function ensureSegmentEfforts(base44, activity, userRecord) {
  const raw = activity?.raw_data && typeof activity.raw_data === 'object' ? activity.raw_data : {};
  if (Array.isArray(raw.segment_efforts)) return raw.segment_efforts;
  const token = await getStravaAccessToken(base44, userRecord);
  if (!token || !activity.strava_id) return null;
  try {
    const res = await fetch(`https://www.strava.com/api/v3/activities/${activity.strava_id}?include_all_efforts=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) return null;
    if (!res.ok) return null;
    const fullData = await res.json();
    const mergedRaw = { ...raw, ...fullData };
    try { await base44.entities.Activity.update(activity.id, { raw_data: mergedRaw }); } catch { /* */ }
    return Array.isArray(fullData.segment_efforts) ? fullData.segment_efforts : null;
  } catch { return null; }
}
function extractSegmentMap(efforts) {
  const map = new Map();
  if (!Array.isArray(efforts)) return map;
  for (const e of efforts) {
    const segId = e?.segment?.id;
    if (!segId) continue;
    map.set(String(segId), {
      segment_id: segId,
      segment_name: e.segment.name || e.name || null,
      elapsed_time_s: e.elapsed_time,
      average_speed_mps: e.average_speed ?? null,
      pr_rank: e.pr_rank ?? null,
      activity_id: e.activity?.id ?? null,
    });
  }
  return map;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { /* */ }
    const activityId = body.activityId;
    const comparisonActivityIds = Array.isArray(body.comparisonActivityIds) ? body.comparisonActivityIds : [];
    if (!activityId) return json({ error: 'activityId is required' }, { status: 400 });
    if (comparisonActivityIds.length === 0) return json({ error: 'comparisonActivityIds is required' }, { status: 400 });

    const userRecord = await base44.asServiceRole.entities.User.get(user.id);
    const athleteId = userRecord?.strava_athlete_id;

    const current = await resolveActivity(base44, activityId);
    if (!current) return json({ error: 'Activity not found' }, { status: 404 });
    if (athleteId && current.athlete_id && Number(current.athlete_id) !== Number(athleteId)) {
      return json({ error: 'Activity does not belong to the current user' }, { status: 403 });
    }

    const currentEfforts = await ensureSegmentEfforts(base44, current, userRecord);
    const currentMap = extractSegmentMap(currentEfforts);

    const comparisonMaps = [];
    for (const cmpId of comparisonActivityIds) {
      const cmp = await resolveActivity(base44, cmpId);
      if (!cmp) continue;
      if (athleteId && cmp.athlete_id && Number(cmp.athlete_id) !== Number(athleteId)) continue;
      const efforts = await ensureSegmentEfforts(base44, cmp, userRecord);
      comparisonMaps.push({ activity_id: cmp.id, strava_id: cmp.strava_id, name: cmp.name, start_date: cmp.start_date, map: extractSegmentMap(efforts) });
    }

    const matched = [];
    for (const [segId, currentEffort] of currentMap.entries()) {
      const comparisons = [];
      for (const cmp of comparisonMaps) {
        const eff = cmp.map.get(segId);
        if (!eff) continue;
        const elapsedTimeDelta = (currentEffort.elapsed_time_s != null && eff.elapsed_time_s != null)
          ? Number(currentEffort.elapsed_time_s) - Number(eff.elapsed_time_s) : null;
        const avgSpeedDelta = (currentEffort.average_speed_mps != null && eff.average_speed_mps != null)
          ? Number(currentEffort.average_speed_mps) - Number(eff.average_speed_mps) : null;
        comparisons.push({
          comparison_activity_id: cmp.activity_id,
          comparison_activity_name: cmp.name,
          comparison_elapsed_time_s: eff.elapsed_time_s,
          elapsed_time_delta_s: elapsedTimeDelta,
          average_speed_delta_mps: avgSpeedDelta,
          pr_rank: eff.pr_rank,
        });
      }
      if (comparisons.length === 0) continue;
      comparisons.sort((a, b) => Math.abs(b.elapsed_time_delta_s || 0) - Math.abs(a.elapsed_time_delta_s || 0));
      const meaningful = comparisons.filter((c) => c.elapsed_time_delta_s != null && Math.abs(c.elapsed_time_delta_s) >= 1);
      matched.push({
        segment_id: currentEffort.segment_id,
        segment_name: currentEffort.segment_name,
        current_elapsed_time_s: currentEffort.elapsed_time_s,
        current_average_speed_mps: currentEffort.average_speed_mps,
        current_pr_rank: currentEffort.pr_rank,
        comparisons: meaningful.length > 0 ? meaningful : comparisons,
      });
    }

    matched.sort((a, b) => (b.comparisons.length) - (a.comparisons.length));

    return json({
      activity_id: current.id,
      segments_compared: currentMap.size,
      matched_segments: matched.length,
      items: matched,
    });
  } catch (error) {
    console.error('compareSegments error:', error);
    return json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});