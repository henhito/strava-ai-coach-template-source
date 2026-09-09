import { createClientFromRequest } from 'npm:@base44/sdk@0.8.36';

const ALL_STREAM_TYPES = ['time', 'distance', 'latlng', 'altitude', 'heartrate', 'velocity_smooth', 'cadence', 'watts', 'temp'];

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { /* */ }
    const activityId = body.activityId;
    if (!activityId) return json({ error: 'activityId is required' }, { status: 400 });

    const requestedTypes = (Array.isArray(body.streamTypes) ? body.streamTypes : ALL_STREAM_TYPES)
      .filter((t) => ALL_STREAM_TYPES.includes(t));
    if (requestedTypes.length === 0) return json({ error: 'No valid stream types requested' }, { status: 400 });

    const activity = await resolveActivity(base44, activityId);
    if (!activity) return json({ error: 'Activity not found' }, { status: 404 });

    const userRecord = await base44.asServiceRole.entities.User.get(user.id);
    const athleteId = userRecord?.strava_athlete_id;
    if (athleteId && activity.athlete_id && Number(activity.athlete_id) !== Number(athleteId)) {
      return json({ error: 'Activity does not belong to the current user' }, { status: 403 });
    }

    const stravaId = Number(activity.strava_id);
    const streams = {};

    // 1. Read from ActivityStream entity (user-scoped + service role)
    const [userStreamRes, serviceStreamRes] = await Promise.all([
      base44.entities.ActivityStream.filter({ activity_id: stravaId }, undefined, 100).catch(() => []),
      base44.asServiceRole.entities.ActivityStream.filter({ activity_id: stravaId }, undefined, 100).catch(() => []),
    ]);
    for (const row of [...normalizeArray(userStreamRes), ...normalizeArray(serviceStreamRes)]) {
      if (requestedTypes.includes(row.stream_type) && Array.isArray(row.data) && !streams[row.stream_type]) {
        streams[row.stream_type] = row.data;
      }
    }

    // 2. Fetch missing streams from Strava
    const missing = requestedTypes.filter((t) => !streams[t]);
    if (missing.length > 0) {
      const token = await getStravaAccessToken(base44, userRecord);
      if (token && stravaId) {
        try {
          const res = await fetch(`https://www.strava.com/api/v3/activities/${stravaId}/streams?keys=${missing.join(',')}&key_by_type=false`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 429) return json({ error: 'Strava API rate limit reached.', isRateLimit: true }, { status: 429 });
          if (res.ok) {
            const data = await res.json();
            for (const s of data) {
              if (s?.type && missing.includes(s.type) && Array.isArray(s.data)) streams[s.type] = s.data;
            }
          }
        } catch (e) {
          console.warn('Strava stream fetch failed:', e.message);
        }
      }
    }

    const result = {};
    for (const t of requestedTypes) if (streams[t]) result[t] = streams[t];

    return json({
      activity_id: stravaId,
      streams: result,
      requested_types: requestedTypes,
      available_types: Object.keys(result),
    });
  } catch (error) {
    console.error('getActivityStreams error:', error);
    return json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});