// Shared Strava sync helpers used by both the user-triggered sync
// (syncStravaActivities) and the scheduled background sync (scheduledStravaSync).

export function detectDeviceBrand(activityData) {
  try {
    if (activityData?.device_name) {
      const deviceName = activityData.device_name.toLowerCase();
      if (deviceName.includes('garmin')) return 'Garmin';
      if (deviceName.includes('wahoo')) return 'Wahoo';
      if (deviceName.includes('apple')) return 'Apple';
      if (deviceName.includes('polar')) return 'Polar';
      if (deviceName.includes('suunto')) return 'Suunto';
      if (deviceName.includes('coros')) return 'COROS';
    }
    return null;
  } catch (_error) {
    return null;
  }
}

export function asString(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function buildDedupeKey(athleteId, stravaActivityId) {
  return `${asString(athleteId)}:${asString(stravaActivityId)}`;
}

export function buildActivityRecord(activity, userEmail, userRecord) {
  const athleteId = Number(userRecord.strava_athlete_id);
  const stravaId = Number(activity.id);

  return {
    created_by_id: userRecord?.id || null,
    dedupe_key: buildDedupeKey(athleteId, stravaId),
    strava_id: stravaId,
    activity_id: stravaId,
    athlete_id: athleteId,
    name: activity.name,
    type: activity.type,
    start_date: activity.start_date,
    distance_m: activity.distance || 0,
    moving_time_s: activity.moving_time || 0,
    elapsed_time_s: activity.elapsed_time || 0,
    total_elevation_gain_m: activity.total_elevation_gain || 0,
    average_speed_mps: activity.average_speed || 0,
    max_speed_mps: activity.max_speed || 0,
    average_heartrate: activity.average_heartrate ?? null,
    max_heartrate: activity.max_heartrate ?? null,
    suffer_score: activity.suffer_score ?? null,
    kudos_count: activity.kudos_count || 0,
    is_private: activity.private || false,
    average_cadence: activity.average_cadence ?? null,
    average_watts: activity.average_watts ?? null,
    average_temp: activity.average_temp ?? null,
    source_device_brand: detectDeviceBrand(activity),
    raw_data: activity,
  };
}

export function normalizeRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.items || payload.data || [];
}

export async function firstMatch(entity, query) {
  const payload = await entity.filter(query, '-created_date', 1, 0).catch(() => []);
  return normalizeRows(payload)[0] || null;
}

export async function refreshStravaToken(refreshToken, userId, userEntity) {
  const clientId = Deno.env.get('STRAVA_CLIENT_ID');
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error(
      'Strava credentials not configured. Please set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in Settings -> Environment Variables.',
    );
  }

  if (!refreshToken) {
    throw new Error('No refresh token available. Please reconnect your Strava account.');
  }

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(`Strava token refresh failed: ${errorJson.message || errorJson.error || 'Unknown error'}`);
    } catch (_error) {
      throw new Error(
        `Strava token refresh failed with status ${response.status}. Please reconnect your Strava account in Settings.`,
      );
    }
  }

  const tokenData = await response.json();

  await userEntity.update(userId, {
    strava_access_token: tokenData.access_token,
    strava_refresh_token: tokenData.refresh_token,
    strava_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
  });

  return tokenData.access_token;
}

export async function setSyncState(syncStateEntity, athleteId, status, errorMessage = null) {
  const existing = await firstMatch(syncStateEntity, { athlete_id: String(athleteId) });
  const now = new Date().toISOString();
  const data = {
    athlete_id: String(athleteId),
    status,
    error_message: errorMessage,
    ...(status === 'syncing' ? { started_at: now, completed_at: null } : { completed_at: now }),
  };
  return existing ? syncStateEntity.update(existing.id, data) : syncStateEntity.create(data);
}

// activityEntities: ordered list of entity clients to probe for an existing row.
export async function findExistingActivity(activityEntities, payload) {
  const queries = [
    { dedupe_key: payload.dedupe_key },
    { athlete_id: payload.athlete_id, strava_id: payload.strava_id },
    { athlete_id: String(payload.athlete_id), strava_id: String(payload.strava_id) },
    { athlete_id: payload.athlete_id, activity_id: String(payload.activity_id) },
  ];

  for (const query of queries) {
    for (const entity of activityEntities) {
      const row = await firstMatch(entity, query);
      if (row) return { row, entity };
    }
  }
  return null;
}

// activityEntities: ordered list of entity clients to probe for an existing row.
// createEntity: entity client used to create new rows.
export async function upsertActivity(activityEntities, createEntity, payload) {
  const existing = await findExistingActivity(activityEntities, payload);

  if (existing?.row?.id) {
    await existing.entity.update(existing.row.id, payload);
    return { action: 'updated', id: existing.row.id };
  }

  const created = await createEntity.create(payload);
  return { action: 'created', id: created?.id || null };
}