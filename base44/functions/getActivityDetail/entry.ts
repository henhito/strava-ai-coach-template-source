import { createClientFromRequest } from 'npm:@base44/sdk@0.8.36';

/* ---------- helpers ---------- */
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
function hasDetail(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  // Full Strava detail (include_all_efforts) adds laps/splits/best_efforts/segment_efforts.
  // map/start_latlng alone come from the summary list, so do not count as full detail.
  return raw.laps !== undefined || raw.splits_metric !== undefined ||
    raw.splits_standard !== undefined || raw.segment_efforts !== undefined ||
    raw.best_efforts !== undefined;
}
async function refreshStravaToken(base44, userRecord) {
  const clientId = Deno.env.get('STRAVA_CLIENT_ID');
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: userRecord.strava_refresh_token,
      grant_type: 'refresh_token',
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
  try { activity = await base44.entities.Activity.get(activityId); } catch { /* not a db id */ }
  if (!activity) {
    const numId = Number(activityId);
    const query = Number.isNaN(numId) ? { strava_id: activityId } : { strava_id: numId };
    try {
      const res = await base44.entities.Activity.filter(query, '-start_date', 5);
      activity = normalizeArray(res)[0] || null;
    } catch { /* ignore */ }
  }
  return activity;
}
function shapeActivity(activity) {
  const raw = activity?.raw_data && typeof activity.raw_data === 'object' && !Array.isArray(activity.raw_data)
    ? activity.raw_data : {};
  return {
    id: activity?.id,
    strava_id: activity?.strava_id,
    athlete_id: activity?.athlete_id,
    name: activity?.name,
    type: activity?.type,
    sport_type: raw.sport_type || activity?.type || null,
    start_date: activity?.start_date,
    distance_m: activity?.distance_m,
    moving_time_s: activity?.moving_time_s,
    elapsed_time_s: activity?.elapsed_time_s,
    total_elevation_gain_m: activity?.total_elevation_gain_m,
    average_speed_mps: activity?.average_speed_mps,
    max_speed_mps: activity?.max_speed_mps,
    average_heartrate: activity?.average_heartrate,
    max_heartrate: activity?.max_heartrate,
    average_cadence: activity?.average_cadence,
    average_watts: activity?.average_watts,
    suffer_score: activity?.suffer_score,
    average_temp: activity?.average_temp,
    kudos_count: activity?.kudos_count,
    source_device_brand: activity?.source_device_brand,
    athlete_note: activity?.athlete_note ?? null,
    elite_coach_comment: activity?.elite_coach_comment ?? null,
    start_latlng: raw.start_latlng || null,
    end_latlng: raw.end_latlng || null,
    map: raw.map || null,
    best_efforts: raw.best_efforts || null,
    splits_metric: raw.splits_metric || null,
    splits_standard: raw.splits_standard || null,
    laps: raw.laps || null,
    segment_efforts: raw.segment_efforts || null,
  };
}

/* ---------- handler ---------- */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { /* allow query param */ }
    const activityId = body.activityId || new URL(req.url).searchParams.get('activityId');
    if (!activityId) return json({ error: 'activityId is required' }, { status: 400 });

    const activity = await resolveActivity(base44, activityId);
    if (!activity) return json({ error: 'Activity not found' }, { status: 404 });

    const userRecord = await base44.asServiceRole.entities.User.get(user.id);
    const athleteId = userRecord?.strava_athlete_id;
    if (athleteId && activity.athlete_id && Number(activity.athlete_id) !== Number(athleteId)) {
      return json({ error: 'Activity does not belong to the current user' }, { status: 403 });
    }

    // If stored detail is incomplete, fetch from Strava and cache it.
    if (!hasDetail(activity.raw_data)) {
      const token = await getStravaAccessToken(base44, userRecord);
      if (token && activity.strava_id) {
        try {
          const res = await fetch(`https://www.strava.com/api/v3/activities/${activity.strava_id}?include_all_efforts=true`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 429) {
            return json({ error: 'Strava API rate limit reached. Please retry shortly.', isRateLimit: true }, { status: 429 });
          }
          if (res.ok) {
            const fullData = await res.json();
            const mergedRaw = { ...(activity.raw_data || {}), ...fullData };
            try { await base44.entities.Activity.update(activity.id, { raw_data: mergedRaw }); } catch { /* cache write best-effort */ }
            activity.raw_data = mergedRaw;
          }
        } catch (e) {
          console.warn('Strava detail fetch failed:', e.message);
        }
      }
    }

    return json({ activity: shapeActivity(activity) });
  } catch (error) {
    console.error('getActivityDetail error:', error);
    return json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});