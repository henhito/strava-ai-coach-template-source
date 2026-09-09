import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  buildActivityRecord,
  normalizeRows,
  refreshStravaToken,
  setSyncState,
  upsertActivity,
} from '../../shared/stravaSync.ts';

async function syncUser(base44, userRecord) {
  const athleteId = userRecord.strava_athlete_id;
  const userEmail = userRecord.email;
  const result = { athlete_id: athleteId, email: userEmail, created: 0, updated: 0, failed: 0, error: null };

  if (!userRecord.strava_access_token || !athleteId) {
    result.error = 'Strava not connected';
    return result;
  }

  const syncStateEntity = base44.asServiceRole.entities.ActivitySyncState;
  const activityEntity = base44.asServiceRole.entities.Activity;
  const userEntity = base44.asServiceRole.entities.User;

  await setSyncState(syncStateEntity, athleteId, 'syncing');
  let accessToken = userRecord.strava_access_token;

  if (userRecord.strava_expires_at) {
    const expiresAt = new Date(userRecord.strava_expires_at);
    if (expiresAt <= new Date()) {
      try {
        accessToken = await refreshStravaToken(userRecord.strava_refresh_token, userRecord.id, userEntity);
      } catch (refreshError) {
        await setSyncState(syncStateEntity, athleteId, 'failed', refreshError.message);
        result.error = refreshError.message;
        return result;
      }
    }
  }

  const perPage = 25;
  const activitiesRes = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?page=1&per_page=${perPage}`,
    { headers: { Authorization: `Bearer ${accessToken}`, 'Accept-Encoding': 'gzip, deflate' } },
  );

  if (activitiesRes.status === 429) {
    await setSyncState(syncStateEntity, athleteId, 'partial', 'Strava rate limit reached.');
    result.error = 'rate_limit';
    return result;
  }

  if (!activitiesRes.ok) {
    await setSyncState(syncStateEntity, athleteId, 'failed', `Strava API error: ${activitiesRes.status}`);
    result.error = `Strava API error: ${activitiesRes.status}`;
    return result;
  }

  const activities = await activitiesRes.json();
  const validActivities = Array.isArray(activities) ? activities : [];

  for (const activity of validActivities) {
    const payload = buildActivityRecord(activity, userEmail, userRecord);
    try {
      const action = await upsertActivity([activityEntity], activityEntity, payload);
      if (action.action === 'created') result.created += 1;
      else result.updated += 1;
    } catch (_error) {
      result.failed += 1;
    }
  }

  await userEntity.update(userRecord.id, { last_activity_sync: new Date().toISOString() });
  const status = result.failed > 0 ? 'partial' : 'complete';
  await setSyncState(syncStateEntity, athleteId, status, result.failed > 0 ? `${result.failed} activity sync(s) failed.` : null);
  return result;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const users = await base44.asServiceRole.entities.User.list('-created_date', 100);
    const connected = normalizeRows(users).filter((u) => u && u.strava_access_token && u.strava_athlete_id);

    if (connected.length === 0) {
      return Response.json({ success: true, message: 'No connected Strava users.', synced: [] });
    }

    const synced = [];
    for (const userRecord of connected) {
      try {
        synced.push(await syncUser(base44, userRecord));
      } catch (error) {
        synced.push({
          athlete_id: userRecord.strava_athlete_id,
          email: userRecord.email,
          created: 0,
          updated: 0,
          failed: 0,
          error: error?.message || 'Unknown error',
        });
      }
    }

    return Response.json({
      success: true,
      run_at: new Date().toISOString(),
      users_synced: connected.length,
      results: synced,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unknown error' }, { status: 500 });
  }
}