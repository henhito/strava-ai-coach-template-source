import { createClientFromRequest } from 'npm:@base44/sdk@0.8.37';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function rows(value) {
  if (Array.isArray(value)) return value;
  return value?.items || value?.data || [];
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function formatPace(secondsPerKm) {
  const seconds = Math.round(Number(secondsPerKm));
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} min/km`;
}

function weekStart(date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const mondayOffset = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - mondayOffset);
  return dateOnly(utc);
}

function aggregate(activities) {
  const withHr = activities.filter((activity) => Number.isFinite(Number(activity.average_heartrate)) && Number(activity.average_heartrate) > 0);
  return {
    activities: activities.length,
    distance_km: round(activities.reduce((sum, activity) => sum + Number(activity.distance_m || 0), 0) / 1000),
    moving_time_hours: round(activities.reduce((sum, activity) => sum + Number(activity.moving_time_s || 0), 0) / 3600),
    average_hr_bpm: withHr.length ? Math.round(withHr.reduce((sum, activity) => sum + Number(activity.average_heartrate), 0) / withHr.length) : null,
    elevation_m: Math.round(activities.reduce((sum, activity) => sum + Number(activity.total_elevation_gain_m || 0), 0))
  };
}

async function loadActivities(base44, filter) {
  const all = [];
  let offset = 0;
  while (true) {
    const page = rows(await base44.entities.Activity.filter(filter, '-start_date', 500, offset));
    all.push(...page);
    if (page.length < 500) return all;
    offset += 500;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const days = Number.isInteger(body.days) && body.days > 0 && body.days <= 90 ? body.days : 28;
    const now = new Date();
    const start = new Date(now.getTime() - days * DAY_MS);
    const userRecord = await base44.entities.User.get(user.id);
    const activities = (await loadActivities(base44, { start_date: { $gte: start.toISOString() } }))
      .filter((activity) => activity.start_date && new Date(activity.start_date) <= now);
    const personalRecords = rows(await base44.entities.BestEffort.filter({ rank: 1 }, '-activity_date', 12, 0)).map((effort) => ({
      sport: effort.activity_type,
      distance_name: effort.distance_name,
      elapsed_time_s: effort.elapsed_time_s,
      pace_s_per_km: effort.pace_s_per_km ?? null,
      pace_display: formatPace(effort.pace_s_per_km),
      speed_kph: effort.speed_kph ?? null,
      activity_date: effort.activity_date,
      activity_id: effort.activity_id,
      source: 'best_effort_records'
    }));

    const validRows = activities.filter((activity) => activity.strava_id !== null && activity.strava_id !== undefined && String(activity.strava_id).trim() !== '');
    const nullRows = activities.length - validRows.length;
    const dedupedByStrava = new Map();
    for (const activity of validRows) {
      const key = String(activity.strava_id);
      const prior = dedupedByStrava.get(key);
      const currentUpdated = new Date(activity.updated_date || activity.created_date || 0).getTime();
      const priorUpdated = new Date(prior?.updated_date || prior?.created_date || 0).getTime();
      if (!prior || currentUpdated >= priorUpdated) dedupedByStrava.set(key, activity);
    }
    const deduped = [...dedupedByStrava.values()];
    const duplicateRows = validRows.length - deduped.length;
    const warnings = [];

    if (!deduped.length) warnings.push('No deduplicated Strava activities were found in the requested date range.');
    if (nullRows > 0) warnings.push(`${nullRows} activity row(s) have no strava_id and are excluded from coaching totals and ACWR.`);
    if (duplicateRows > 0) warnings.push(`${duplicateRows} duplicate activity row(s) were excluded using the most recently updated strava_id record.`);

    let syncState = null;
    try {
      const states = rows(await base44.entities.ActivitySyncState.filter({ athlete_id: String(userRecord?.strava_athlete_id || '') }, '-updated_date', 1, 0));
      syncState = states[0] || null;
    } catch (_) {}
    let syncStatus = ['complete', 'syncing', 'partial', 'failed'].includes(syncState?.status) ? syncState.status : 'unknown';
    const syncStartedAt = new Date(syncState?.started_at || 0).getTime();
    if (syncStatus === 'syncing' && (!Number.isFinite(syncStartedAt) || now.getTime() - syncStartedAt > 10 * 60 * 1000)) {
      syncStatus = 'failed';
      if (syncState?.id) {
        await base44.entities.ActivitySyncState.update(syncState.id, {
          status: 'failed',
          completed_at: now.toISOString(),
          error_message: 'A previous sync did not record a completion status.'
        });
      }
      warnings.push('A previous sync was marked as running but did not complete; it has been marked failed.');
    }
    const latestSavedActivityAt = activities.reduce((latest, activity) => {
      const timestamp = new Date(activity.start_date || 0).getTime();
      return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
    }, 0);
    const hasFreshActivityData = latestSavedActivityAt > 0 && now.getTime() - latestSavedActivityAt <= 36 * 60 * 60 * 1000;
    if (syncStatus === 'failed' && syncState?.error_message === 'A previous sync did not record a completion status.' && hasFreshActivityData) {
      syncStatus = 'complete';
      await base44.entities.ActivitySyncState.update(syncState.id, {
        status: 'complete',
        completed_at: now.toISOString(),
        error_message: null
      });
    }
    if (syncStatus === 'partial' && !syncState?.error_message && deduped.length > 0) {
      syncStatus = 'complete';
    }
    const activityDataStatus = syncStatus === 'unknown'
      ? 'unknown'
      : syncStatus === 'complete' && deduped.length > 0
        ? 'complete'
        : 'incomplete';
    if (syncStatus !== 'complete') warnings.push(`Activity sync status is ${syncStatus}; coaching confidence should be reduced.`);
    if (activityDataStatus === 'incomplete') warnings.push('Activity data completeness could not be confirmed for the requested date range.');

    const summaryTotals = aggregate(deduped);
    const summary = {
      total_distance_km: summaryTotals.distance_km,
      total_moving_time_hours: summaryTotals.moving_time_hours,
      average_hr_bpm: summaryTotals.average_hr_bpm,
      total_elevation_m: summaryTotals.elevation_m
    };

    const sportGroups = new Map();
    const weeklyGroups = new Map();
    for (const activity of deduped) {
      const sport = activity.type || 'Other';
      if (!sportGroups.has(sport)) sportGroups.set(sport, []);
      sportGroups.get(sport).push(activity);
      const key = `${weekStart(new Date(activity.start_date))}|${sport}`;
      if (!weeklyGroups.has(key)) weeklyGroups.set(key, []);
      weeklyGroups.get(key).push(activity);
    }
    const bySport = [...sportGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sport, sportActivities]) => ({ sport, ...aggregate(sportActivities) }));
    const weeklyBySport = [...weeklyGroups.entries()].map(([key, weekActivities]) => {
      const [week_start, sport] = key.split('|');
      return { week_start, sport, ...aggregate(weekActivities) };
    }).sort((a, b) => b.week_start.localeCompare(a.week_start) || a.sport.localeCompare(b.sport));

    const recentLongSessions = [...deduped].sort((a, b) => Number(b.moving_time_s || 0) - Number(a.moving_time_s || 0)).slice(0, 3).map((activity) => ({
      strava_id: activity.strava_id,
      sport: activity.type,
      start_date: activity.start_date,
      distance_km: round(Number(activity.distance_m || 0) / 1000),
      moving_time_hours: round(Number(activity.moving_time_s || 0) / 3600),
      source: 'live_activity_table'
    }));
    const recentHardSessions = deduped.filter((activity) => Number(activity.suffer_score || 0) > 0).sort((a, b) => Number(b.suffer_score) - Number(a.suffer_score)).slice(0, 3).map((activity) => ({
      strava_id: activity.strava_id,
      sport: activity.type,
      start_date: activity.start_date,
      suffer_score: Number(activity.suffer_score),
      source: 'live_activity_table'
    }));

    const chronology = [...deduped].sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    const recoveryNotes = [];
    if (chronology.length >= 2) {
      const gapHours = round((new Date(chronology[0].start_date) - new Date(chronology[1].start_date)) / 3600000);
      recoveryNotes.push(`Most recent activity spacing: ${gapHours} hours between the two latest deduplicated activities.`);
    }

    // Running-only ACWR: acute = last 7 days run distance, chronic = 28-day running weekly average.
    // Mixing run km with ride km is misleading, so this ratio is run-only.
    const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun'];
    const runActivities = deduped.filter((activity) => RUN_TYPES.includes(activity.type));
    let loadModelStatus = deduped.length > 0 ? 'limited' : 'unavailable';
    let acwr;
    if (days >= 28 && runActivities.length > 0) {
      const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
      const acuteDistanceKm = runActivities
        .filter((a) => new Date(a.start_date) >= sevenDaysAgo)
        .reduce((sum, a) => sum + Number(a.distance_m || 0), 0) / 1000;
      const chronicDistanceKm = runActivities.reduce((sum, a) => sum + Number(a.distance_m || 0), 0) / 1000;
      const chronicWeeklyKm = chronicDistanceKm / (days / 7);
      if (chronicWeeklyKm > 0) {
        const ratio = round(acuteDistanceKm / chronicWeeklyKm, 2);
        const interpretation = ratio < 0.8 ? 'undertrained' : ratio <= 1.3 ? 'optimal' : ratio <= 1.5 ? 'elevated' : 'high-risk';
        loadModelStatus = 'running_only_distance';
        acwr = {
          available: true,
          value: ratio,
          method: 'running_distance',
          acute_window_days: 7,
          chronic_window_days: 28,
          acute_load_km: round(acuteDistanceKm, 1),
          chronic_load_km: round(chronicWeeklyKm, 1),
          interpretation,
          reason: null
        };
      } else {
        acwr = { available: false, value: null, method: null, reason: 'No running distance recorded in the chronic window.' };
      }
    } else {
      acwr = {
        available: false,
        value: null,
        method: null,
        reason: days < 28 ? 'ACWR requires at least 28 days of activity data.' : 'No running activities found in the requested window.'
      };
    }
    if (acwr.available) {
      warnings.push(`Running-only ACWR available: ${acwr.value} (${acwr.interpretation}). Acute ${acwr.acute_load_km} km vs chronic ${acwr.chronic_load_km} km/week.`);
    } else if (loadModelStatus === 'limited') {
      warnings.push('ACWR unavailable; load interpretation uses sport-specific summaries and moving time.');
    } else {
      warnings.push('No valid workload model is available because no deduplicated activities were found.');
    }
    const analysisConfidence = syncStatus === 'failed' || syncStatus === 'unknown' || !deduped.length
      ? 'low'
      : activityDataStatus === 'incomplete' || syncStatus === 'syncing' || syncStatus === 'partial' || !personalRecords.length
        ? 'moderate-low'
        : 'moderate';

    return Response.json({
      generated_at: now.toISOString(),
      data_source: 'live_activity_table',
      date_range: { start: dateOnly(start), end: dateOnly(now), days },
      sync_status: syncStatus,
      activity_data_status: activityDataStatus,
      analysis_confidence: analysisConfidence,
      load_model_status: loadModelStatus,
      activity_rows: activities.length,
      unique_strava_ids: deduped.length,
      duplicate_rows: duplicateRows,
      null_strava_id_rows: nullRows,
      latest_activity_start_date: chronology[0]?.start_date || null,
      oldest_activity_start_date: chronology[chronology.length - 1]?.start_date || null,
      summary,
      by_sport: bySport,
      weekly_by_sport: weeklyBySport,
      recent_long_sessions: recentLongSessions,
      recent_hard_sessions: recentHardSessions,
      recovery_spacing: { available: recoveryNotes.length > 0, notes: recoveryNotes },
      best_efforts: { available: personalRecords.length > 0, items: personalRecords },
      acwr,
      data_quality_warnings: warnings
    });
  } catch (error) {
    console.error('getCoachSnapshot error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});