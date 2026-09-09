import { createClientFromRequest } from 'npm:@base44/sdk@0.8.36';

const CYCLING_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];
const COMPARISON_WINDOW_DAYS = 84; // 12 weeks

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
function typeMatches(aType, bType) {
  const isCycling = (t) => CYCLING_TYPES.includes(t);
  if (isCycling(aType) && isCycling(bType)) return true;
  return aType === bType;
}
function median(arr) {
  const sorted = arr.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function paceSperKm(a) {
  const d = Number(a.distance_m || 0);
  const t = Number(a.elapsed_time_s || a.moving_time_s || 0);
  if (d > 0 && t > 0) return t / (d / 1000);
  return null;
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

    const current = await resolveActivity(base44, activityId);
    if (!current) return json({ error: 'Activity not found' }, { status: 404 });

    const userRecord = await base44.asServiceRole.entities.User.get(user.id);
    const athleteId = userRecord?.strava_athlete_id;
    if (athleteId && current.athlete_id && Number(current.athlete_id) !== Number(athleteId)) {
      return json({ error: 'Activity does not belong to the current user' }, { status: 403 });
    }

    const currentDistance = Number(current.distance_m || 0);
    const currentElevation = Number(current.total_elevation_gain_m || 0);
    const currentType = current.type;
    if (!currentDistance || !currentType) {
      return json({ error: 'Activity is missing distance or type data required for comparison.' }, { status: 400 });
    }

    // Fetch candidate comparable activities (distance +/-20%)
    const minDist = currentDistance * 0.8;
    const maxDist = currentDistance * 1.2;
    const filterQuery = { distance_m: { $gte: minDist, $lte: maxDist } };
    if (athleteId) filterQuery.athlete_id = athleteId;
    const candidatesRes = await base44.entities.Activity.filter(filterQuery, '-start_date', 200);
    let candidates = normalizeArray(candidatesRes);

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - COMPARISON_WINDOW_DAYS);

    candidates = candidates.filter((a) => {
      if (a.id === current.id || String(a.strava_id) === String(current.strava_id)) return false;
      if (!typeMatches(a.type, currentType)) return false;
      if (currentElevation > 0) {
        const elev = Number(a.total_elevation_gain_m || 0);
        if (elev < currentElevation * 0.8 || elev > currentElevation * 1.2) return false;
      }
      return true;
    });

    const recent = candidates.filter((a) => new Date(a.start_date || 0) >= windowStart);
    const comparable = recent.length >= 3 ? recent : candidates;

    // Current metrics
    const currentPace = paceSperKm(current);
    const currentHR = Number(current.average_heartrate) || null;
    const currentCadence = Number(current.average_cadence) || null;
    const currentPower = Number(current.average_watts) || null;
    const currentDuration = Number(current.elapsed_time_s || current.moving_time_s) || null;

    if (comparable.length === 0) {
      return json({
        comparison_summary: {
          matched_activities: 0,
          comparison_sample_size: 0,
          route_match_type: 'distance_elevation_only',
          window_days: COMPARISON_WINDOW_DAYS,
        },
        current_metrics: {
          activity_id: current.id, strava_id: current.strava_id, name: current.name,
          type: current.type, start_date: current.start_date, distance_m: currentDistance,
          elapsed_time_s: currentDuration, pace_s_per_km: currentPace,
          average_heartrate: currentHR, average_cadence: currentCadence,
          average_watts: currentPower, total_elevation_gain_m: currentElevation,
        },
        performance_delta: {},
        coach_interpretation: {
          fitness_trend: 'unknown',
          primary_factor: 'Insufficient comparable activities to determine a trend.',
          risk_flag: 'none',
        },
        elite_coach_summary: 'Not enough comparable historical activities were found to produce a meaningful comparison. Continue building your training history.',
        actionable_advice: ['Keep logging consistent activities so future comparisons become possible.'],
        comparison_activity_ids: [],
      });
    }

    // Best 3 (fastest pace) and most recent 3
    const withPace = comparable.map((a) => ({ a, pace: paceSperKm(a) })).filter((x) => x.pace != null);
    const best3 = [...withPace].sort((x, y) => x.pace - y.pace).slice(0, 3).map((x) => x.a);
    const recent3 = [...comparable].sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0)).slice(0, 3);
    const refSet = best3.length >= 3 ? best3 : (recent3.length >= 3 ? recent3 : comparable.slice(0, Math.min(3, comparable.length)));
    const comparison_basis = best3.length >= 3 ? 'best_3' : 'recent_3';

    function delta(field, transform) {
      const vals = refSet.map(transform).filter((v) => v != null && Number.isFinite(v));
      if (vals.length === 0) return null;
      const med = median(vals);
      if (med == null) return null;
      return Number((field - med).toFixed(2));
    }

    const performance_delta = {};
    if (currentPace != null) {
      const d = delta(currentPace, (a) => paceSperKm(a));
      if (d != null) performance_delta.pace_s_per_km = d;
    }
    if (currentHR != null) {
      const d = delta(currentHR, (a) => Number(a.average_heartrate) || null);
      if (d != null) performance_delta.avg_hr_bpm = d;
    }
    if (currentCadence != null) {
      const d = delta(currentCadence, (a) => Number(a.average_cadence) || null);
      if (d != null) performance_delta.cadence_spm = d;
    }
    if (currentPower != null) {
      const d = delta(currentPower, (a) => Number(a.average_watts) || null);
      if (d != null) performance_delta.avg_power_w = d;
    }
    if (currentDuration != null) {
      const d = delta(currentDuration, (a) => Number(a.elapsed_time_s || a.moving_time_s) || null);
      if (d != null) performance_delta.duration_s = d;
    }
    const dDist = delta(currentDistance, (a) => Number(a.distance_m) || null);
    if (dDist != null) performance_delta.distance_m = dDist;
    const dElev = delta(currentElevation, (a) => Number(a.total_elevation_gain_m) || null);
    if (dElev != null) performance_delta.elevation_m = dElev;

    let fitness_trend = 'stable';
    let primary_factor = 'Comparable performance across similar activities.';
    if (performance_delta.pace_s_per_km != null) {
      if (performance_delta.pace_s_per_km < -3) { fitness_trend = 'improving'; primary_factor = 'Faster pace at comparable distance and elevation.'; }
      else if (performance_delta.pace_s_per_km > 3) { fitness_trend = 'declining'; primary_factor = 'Slower pace at comparable distance and elevation.'; }
    }

    const pacePhrase = performance_delta.pace_s_per_km != null
      ? (performance_delta.pace_s_per_km < 0
        ? `was ${Math.abs(performance_delta.pace_s_per_km).toFixed(1)} s/km faster`
        : `was ${performance_delta.pace_s_per_km.toFixed(1)} s/km slower`)
      : 'could not be compared for pace';
    const hrPhrase = performance_delta.avg_hr_bpm != null
      ? (performance_delta.avg_hr_bpm < 0 ? ' at a lower average heart rate' : ' at a higher average heart rate')
      : '';
    const summary = `Compared to ${refSet.length} similar ${currentType} activities (${comparison_basis}), your pace ${pacePhrase}${hrPhrase}. Route matching is currently distance/elevation only.`;

    return json({
      comparison_summary: {
        matched_activities: comparable.length,
        comparison_sample_size: refSet.length,
        comparison_basis,
        route_match_type: 'distance_elevation_only',
        window_days: COMPARISON_WINDOW_DAYS,
      },
      current_metrics: {
        activity_id: current.id, strava_id: current.strava_id, name: current.name,
        type: current.type, start_date: current.start_date, distance_m: currentDistance,
        elapsed_time_s: currentDuration, pace_s_per_km: currentPace,
        average_heartrate: currentHR, average_cadence: currentCadence,
        average_watts: currentPower, total_elevation_gain_m: currentElevation,
      },
      performance_delta,
      coach_interpretation: { fitness_trend, primary_factor, risk_flag: 'none' },
      elite_coach_summary: summary,
      actionable_advice: [],
      comparison_activity_ids: refSet.map((a) => a.id),
    });
  } catch (error) {
    console.error('analyzeActivity error:', error);
    return json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});