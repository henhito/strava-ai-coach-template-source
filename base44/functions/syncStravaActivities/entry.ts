import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  buildActivityRecord,
  refreshStravaToken,
  setSyncState,
  upsertActivity,
} from '../../shared/stravaSync.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let syncAthleteId = null;

  try {
    const body = await req.json().catch(() => ({}));
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRecord = await base44.entities.User.get(user.id);
    syncAthleteId = userRecord.strava_athlete_id;

    if (!userRecord.strava_access_token) {
      return Response.json({ error: 'Strava not connected' }, { status: 400 });
    }

    if (!userRecord.strava_athlete_id) {
      return Response.json({ error: 'Strava athlete ID missing' }, { status: 400 });
    }

    await setSyncState(base44.entities.ActivitySyncState, syncAthleteId, 'syncing');
    let accessToken = userRecord.strava_access_token;

    if (userRecord.strava_expires_at) {
      const expiresAt = new Date(userRecord.strava_expires_at);
      if (expiresAt <= new Date()) {
        if (!userRecord.strava_refresh_token) {
          await setSyncState(base44.entities.ActivitySyncState, syncAthleteId, 'failed', 'Token expired and no refresh token available.');
          return Response.json(
            { error: 'Token expired and no refresh token available. Please reconnect Strava in Settings.' },
            { status: 400 },
          );
        }

        try {
          accessToken = await refreshStravaToken(userRecord.strava_refresh_token, user.id, base44.entities.User);
        } catch (refreshError) {
          await setSyncState(base44.entities.ActivitySyncState, syncAthleteId, 'failed', refreshError.message || 'Failed to refresh Strava token.');
          return Response.json(
            {
              error: refreshError.message || 'Failed to refresh Strava token. Please reconnect in Settings.',
              isTokenError: true,
            },
            { status: 400 },
          );
        }
      }
    }

    const perPage = 25;
    const page = typeof body.page === 'number' && body.page > 0 ? body.page : 1;
    let created = 0;
    let updated = 0;
    let failed = 0;
    const failures = [];

    const activitiesRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Accept-Encoding': 'gzip, deflate' } },
    );

    if (activitiesRes.status === 429) {
      await setSyncState(base44.entities.ActivitySyncState, syncAthleteId, 'partial', 'Strava rate limit reached while syncing activities.');
      return Response.json({ error: 'Strava rate limit reached while syncing activities. Wait 15 minutes.', isRateLimit: true }, { status: 429 });
    }

    if (!activitiesRes.ok) {
      await setSyncState(base44.entities.ActivitySyncState, syncAthleteId, 'failed', `Strava API error: ${activitiesRes.status}`);
      return Response.json({ error: `Strava API error: ${activitiesRes.status}` }, { status: activitiesRes.status });
    }

    const activities = await activitiesRes.json();
    const validActivities = Array.isArray(activities) ? activities : [];
    const activityEntities = [base44.entities.Activity, base44.asServiceRole.entities.Activity];

    for (const activity of validActivities) {
      const payload = buildActivityRecord(activity, user.email, userRecord);
      try {
        const result = await upsertActivity(activityEntities, base44.entities.Activity, payload);
        if (result.action === 'created') created += 1;
        else updated += 1;
      } catch (error) {
        failed += 1;
        if (failures.length < 20) failures.push({ strava_id: payload.strava_id, error: error?.message || String(error) });
      }
    }

    const hasMore = validActivities.length === perPage;
    await base44.entities.User.update(user.id, { last_activity_sync: new Date().toISOString() });
    const status = failed > 0 || hasMore ? 'partial' : 'complete';
    const message = failed > 0
      ? `Page ${page} finished with ${failed} failed activities.`
      : hasMore
        ? `Page ${page} synced. Continue to sync older activities.`
        : `Sync complete. Added ${created} new activities and updated ${updated}.`;

    await setSyncState(base44.entities.ActivitySyncState, syncAthleteId, status, failed > 0 ? `${failed} activity sync operation(s) failed.` : null);
    return Response.json({
      success: failed === 0,
      hasMore,
      page,
      nextPage: hasMore ? page + 1 : null,
      newActivities: created,
      updatedActivities: updated,
      failedActivities: failed,
      failures,
      apiCallsMade: 1,
      stravaTotal: validActivities.length,
      message,
    });
  } catch (error) {
    if (syncAthleteId) await setSyncState(base44.entities.ActivitySyncState, syncAthleteId, 'failed', (error && error.message) || 'Unknown error');
    return Response.json(
      { error: (error && error.message) || 'Unknown error' },
      { status: 500 },
    );
  } finally {
    base44.cleanup?.();
  }
});