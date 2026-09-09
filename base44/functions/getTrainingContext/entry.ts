import { createClientFromRequest } from 'npm:@base44/sdk@0.8.36';

const DAY_MS = 86400000;
const HARD_SUFFER_SCORE = 100;

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
function totals(arr) {
  let distance_m = 0, duration_s = 0, elevation_m = 0, suffer_score = 0, count = 0, hard_sessions = 0, longest_run_m = 0;
  for (const a of arr) {
    count++;
    distance_m += Number(a.distance_m || 0);
    duration_s += Number(a.moving_time_s || a.elapsed_time_s || 0);
    elevation_m += Number(a.total_elevation_gain_m || 0);
    suffer_score += Number(a.suffer_score || 0);
    if (Number(a.suffer_score || 0) >= HARD_SUFFER_SCORE) hard_sessions++;
    if (a.type === 'Run' && Number(a.distance_m || 0) > longest_run_m) longest_run_m = Number(a.distance_m);
  }
  return { count, distance_m, duration_s, elevation_m, suffer_score, hard_sessions, longest_run_m };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const userRecord = await base44.asServiceRole.entities.User.get(user.id);
    const athleteId = userRecord?.strava_athlete_id;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const twentyEightDaysAgo = new Date(now.getTime() - 28 * DAY_MS);

    const filterQuery = { start_date: { $gte: twentyEightDaysAgo.toISOString() } };
    if (athleteId) filterQuery.athlete_id = athleteId;
    const res = await base44.entities.Activity.filter(filterQuery, '-start_date', 500);
    const activities = normalizeArray(res).filter((a) => a.start_date && new Date(a.start_date) <= now);

    const last7 = activities.filter((a) => new Date(a.start_date) >= sevenDaysAgo);
    const last28 = activities;

    const acute7 = totals(last7);
    const chronic28 = totals(last28);

    // Workload based on suffer_score where available, else duration (minutes)
    const acuteLoad = acute7.suffer_score > 0 ? acute7.suffer_score : acute7.duration_s / 60;
    const chronicWeeklyLoad = chronic28.suffer_score > 0 ? chronic28.suffer_score / 4 : (chronic28.duration_s / 60) / 4;
    const hasEnoughHistory = activities.length >= 5 && last28.some((a) => new Date(a.start_date) <= new Date(now.getTime() - 14 * DAY_MS));
    const acwr = chronicWeeklyLoad > 0 && hasEnoughHistory ? Number((acuteLoad / chronicWeeklyLoad).toFixed(2)) : null;

    const data_quality = [];
    if (activities.length === 0) data_quality.push('No activities found in the last 28 days.');
    if (chronic28.suffer_score === 0) data_quality.push('No suffer score data; workload estimated from duration only.');
    if (!hasEnoughHistory) data_quality.push('Less than 14 days of history available; ACWR is not reported.');

    return json({
      window: { last_7_days: { from: sevenDaysAgo.toISOString(), to: now.toISOString() }, last_28_days: { from: twentyEightDaysAgo.toISOString(), to: now.toISOString() } },
      acute_7_day: acute7,
      chronic_28_day: chronic28,
      workload: {
        acute_load: Number(acuteLoad.toFixed(1)),
        chronic_weekly_load: Number(chronicWeeklyLoad.toFixed(1)),
        acwr,
        load_metric: chronic28.suffer_score > 0 ? 'suffer_score' : 'duration_minutes',
      },
      long_run: { longest_run_m: acute7.longest_run_m },
      data_quality,
    });
  } catch (error) {
    console.error('getTrainingContext error:', error);
    return json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});