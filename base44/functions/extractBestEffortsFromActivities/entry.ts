import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LONG_RIDE_DISTANCE_M = 180000;
const LONG_RIDE_100K_DISTANCE_M = 100000;
const BEST_EFFORTS_PER_DISTANCE = 20;
const STRAVA_FETCH_LIMIT = 80;
const DISTANCE_TOLERANCE = 0.02;
const TARGETED_ACTIVITY_LOOKUP_LIMIT = 250;

const CYCLING_TYPES = [
  'Ride',
  'VirtualRide',
  'GravelRide',
  'MountainBikeRide',
  'EBikeRide',
  'EMountainBikeRide',
  'Velomobile',
];

const SHORT_CYCLING_DISTANCES = [
  { name: '5 mile', meters: 8047 },
  { name: '10k', meters: 10000 },
  { name: '10 mile', meters: 16093 },
];

const STANDARD_DISTANCES = {
  Run: [
    { name: '400m', meters: 400, tolerance: DISTANCE_TOLERANCE },
    { name: '800m', meters: 800, tolerance: DISTANCE_TOLERANCE },
    { name: '1k', meters: 1000, tolerance: DISTANCE_TOLERANCE },
    { name: '1/2 mile', meters: 805, tolerance: DISTANCE_TOLERANCE },
    { name: '1 mile', meters: 1609, tolerance: DISTANCE_TOLERANCE },
    { name: '2 mile', meters: 3219, tolerance: DISTANCE_TOLERANCE },
    { name: '5k', meters: 5000, tolerance: DISTANCE_TOLERANCE },
    { name: '10k', meters: 10000, tolerance: DISTANCE_TOLERANCE },
    { name: '15k', meters: 15000, tolerance: DISTANCE_TOLERANCE },
    { name: '10 mile', meters: 16093, tolerance: DISTANCE_TOLERANCE },
    { name: '20k', meters: 20000, tolerance: DISTANCE_TOLERANCE },
    { name: 'half marathon', meters: 21097, tolerance: DISTANCE_TOLERANCE },
    { name: '30k', meters: 30000, tolerance: DISTANCE_TOLERANCE },
    { name: 'marathon', meters: 42195, tolerance: DISTANCE_TOLERANCE },
    { name: '50k', meters: 50000, tolerance: DISTANCE_TOLERANCE },
    { name: '100k', meters: 100000, tolerance: DISTANCE_TOLERANCE },
  ],
  Ride: [
    ...SHORT_CYCLING_DISTANCES.map((d) => ({ ...d, tolerance: DISTANCE_TOLERANCE })),
    { name: '20k', meters: 20000, tolerance: DISTANCE_TOLERANCE },
    { name: '30k', meters: 30000, tolerance: DISTANCE_TOLERANCE },
    { name: '40k', meters: 40000, tolerance: DISTANCE_TOLERANCE },
    { name: '50k', meters: 50000, tolerance: DISTANCE_TOLERANCE },
    { name: '80k', meters: 80000, tolerance: DISTANCE_TOLERANCE },
    { name: '50 mile', meters: 80467, tolerance: DISTANCE_TOLERANCE },
    { name: '90k', meters: 90000, tolerance: DISTANCE_TOLERANCE },
    { name: '100k', meters: 100000, tolerance: DISTANCE_TOLERANCE },
    { name: '100 mile', meters: 160934, tolerance: DISTANCE_TOLERANCE },
    { name: '180k', meters: 180000, tolerance: DISTANCE_TOLERANCE },
  ],
};

const TRACKED_ACTIVITY_IDS = [
  '5512398401', '4837622177', '4905781465', '5383834577', '6533010795',
  '6742436222', '6777698256', '7033135274', '7638561663', '8586599971',
  '8819170529', '10082913822', '10198404471', '10988016648', '11393482004',
  '11393518764', '11447825071', '11609050837', '11127729148', '13503972305',
  '13689607929', '13817133604', '14098067172', '13896501759', '14563129681',
  '15962860357', '14516554763', '14659911831', '15807047327', '15571663875',
  '15731710353', '15934260953',
];

async function getStravaToken(base44, user) {
  const userRecord = await base44.asServiceRole.entities.User.get(user.id);
  if (!userRecord?.strava_access_token) return null;

  let accessToken = userRecord.strava_access_token;
  if (userRecord.strava_expires_at && new Date(userRecord.strava_expires_at) <= new Date()) {
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
    if (!response.ok) throw new Error('Strava token refresh failed');

    const tokenData = await response.json();
    await base44.asServiceRole.entities.User.update(user.id, {
      strava_access_token: tokenData.access_token,
      strava_refresh_token: tokenData.refresh_token,
      strava_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
    });
    accessToken = tokenData.access_token;
  }

  return accessToken;
}

const canonicalName = (name) => {
  const nameStr = String(name || '').trim().toLowerCase();
  const canonicalMap = {
    '400m': '400m', '800m': '800m', '1k': '1k',
    '1/2 mile': '1/2 mile', '0.5 mi': '1/2 mile',
    '1 mile': '1 mile', '1 mi': '1 mile', '1mile': '1 mile',
    '2 miles': '2 mile', '2 mile': '2 mile', '2 mi': '2 mile', '2mile': '2 mile',
    '5k': '5k', '5km': '5k', '5 km': '5k',
    '5 miles': '5 mile', '5 mile': '5 mile', '5 mi': '5 mile', '5mi': '5 mile', '5mile': '5 mile',
    '10k': '10k', '10km': '10k', '10 km': '10k',
    '15k': '15k', '15km': '15k', '15 km': '15k',
    '10 miles': '10 mile', '10 mile': '10 mile', '10 mi': '10 mile', '10mi': '10 mile', '10mile': '10 mile',
    '20k': '20k', '20km': '20k', '20 km': '20k',
    'half marathon': 'half marathon', 'half-marathon': 'half marathon',
    '30k': '30k', '30km': '30k', '30 km': '30k',
    'marathon': 'marathon', 'full marathon': 'marathon',
    '40k': '40k', '40km': '40k', '40 km': '40k',
    '50k': '50k', '50km': '50k', '50 km': '50k',
    '80k': '80k', '80km': '80k', '80 km': '80k',
    '50 miles': '50 mile', '50 mile': '50 mile', '50 mi': '50 mile', '50mi': '50 mile', '50mile': '50 mile',
    '90k': '90k', '90km': '90k', '90 km': '90k',
    '100k': '100k', '100km': '100k', '100 km': '100k',
    '100 miles': '100 mile', '100 mile': '100 mile', '100 mi': '100 mile', '100mi': '100 mile', '100mile': '100 mile',
    '160k': '100 mile', '160km': '100 mile', '160 k': '100 mile', '160 km': '100 mile',
    '180k': '180k', '180km': '180k', '180 km': '180k',
    '180k+': '180k+', '180km+': '180k+', '180 k+': '180k+', '180 km+': '180k+',
    '180k plus': '180k+', '180 km plus': '180k+',
    '100k+': '100k+', '100km+': '100k+', '100 k+': '100k+', '100 km+': '100k+',
    '100k plus': '100k+', '100 km plus': '100k+',
  };
  return canonicalMap[nameStr] || nameStr;
};

const normalizeArray = (resp) => {
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp.items)) return resp.items;
  if (resp && Array.isArray(resp.data)) return resp.data;
  return [];
};

const normalizeActivityId = (value) => String(value || '').trim();

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const getRawActivity = (activity) => {
  const raw = activity?.raw_data || activity?.raw || activity?.data || null;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
};

const hasUsableBestEfforts = (activity) =>
  (Array.isArray(activity?.raw_data?.best_efforts) && activity.raw_data.best_efforts.length > 0) ||
  (Array.isArray(activity?.best_efforts) && activity.best_efforts.length > 0);

const normalizeActivity = (activity) => {
  const raw = getRawActivity(activity);
  const stravaId = normalizeActivityId(activity?.strava_id || activity?.activity_id || raw?.id);
  const type = String(activity?.type || activity?.activity_type || activity?.sport_type || raw?.type || raw?.sport_type || '').trim();
  const distanceM = toNumber(activity?.distance_m ?? activity?.distance_meters ?? activity?.distance ?? raw?.distance);
  const movingTimeS = toNumber(activity?.moving_time_s ?? activity?.moving_time ?? raw?.moving_time);
  const elapsedTimeS = toNumber(activity?.elapsed_time_s ?? activity?.elapsed_time ?? raw?.elapsed_time ?? movingTimeS);

  return {
    ...activity,
    raw_data: Object.keys(raw).length > 0 ? raw : activity?.raw_data,
    strava_id: stravaId,
    type,
    distance_m: distanceM,
    moving_time_s: movingTimeS,
    elapsed_time_s: elapsedTimeS,
    name: activity?.name || activity?.activity_name || raw?.name || '',
    start_date: activity?.start_date || activity?.activity_date || raw?.start_date || raw?.start_date_local || '',
  };
};

const activityFromStravaDetail = (fullData, existing = {}, athleteId = null) => {
  const stravaId = normalizeActivityId(fullData?.id || existing?.strava_id || existing?.activity_id);
  return {
    ...existing,
    raw_data: fullData,
    strava_id: stravaId,
    activity_id: stravaId,
    athlete_id: normalizeActivityId(fullData?.athlete?.id || existing?.athlete_id || athleteId),
    type: fullData?.type || fullData?.sport_type || existing?.type || existing?.activity_type || '',
    sport_type: fullData?.sport_type || existing?.sport_type || '',
    distance_m: toNumber(fullData?.distance ?? existing?.distance_m ?? existing?.distance),
    moving_time_s: toNumber(fullData?.moving_time ?? existing?.moving_time_s ?? existing?.moving_time),
    elapsed_time_s: toNumber(fullData?.elapsed_time ?? existing?.elapsed_time_s ?? existing?.elapsed_time),
    name: fullData?.name || existing?.name || existing?.activity_name || '',
    start_date: fullData?.start_date || fullData?.start_date_local || existing?.start_date || existing?.activity_date || '',
  };
};

const activityCompletenessScore = (activity) => {
  const raw = getRawActivity(activity);
  let score = 0;
  if (normalizeActivityId(activity?.strava_id || activity?.activity_id || raw?.id)) score += 10;
  if (activity?.athlete_id || raw?.athlete?.id || raw?.athlete_id) score += 10;
  if (activity?.distance_m || activity?.distance || raw?.distance) score += 5;
  if (activity?.elapsed_time_s || activity?.elapsed_time || raw?.elapsed_time) score += 5;
  if (activity?.moving_time_s || activity?.moving_time || raw?.moving_time) score += 3;
  if (activity?.type || activity?.sport_type || raw?.type || raw?.sport_type) score += 3;
  if (activity?.start_date || raw?.start_date || raw?.start_date_local) score += 2;
  if (hasUsableBestEfforts({ ...activity, raw_data: raw })) score += 20;
  if (Object.keys(raw).length > 0) score += Math.min(20, Object.keys(raw).length);
  return score;
};

const getActivityMergeKey = (activity) => {
  const raw = getRawActivity(activity);
  return normalizeActivityId(activity?.strava_id || activity?.activity_id || raw?.id || activity?.id);
};

const createBestEffortRow = (userEmail, effort) => {
  const distanceName = canonicalName(effort.distance_name);
  const distanceM = Number(effort.distance_m || 0);
  const elapsedS = Number(effort.elapsed_time_s || 0);
  const pace = Number.isFinite(Number(effort.pace_s_per_km)) && Number(effort.pace_s_per_km) > 0
    ? Number(effort.pace_s_per_km)
    : distanceM > 0 && elapsedS > 0
      ? elapsedS / (distanceM / 1000)
      : null;
  const speed = Number.isFinite(Number(effort.speed_kph)) && Number(effort.speed_kph) > 0
    ? Number(effort.speed_kph)
    : distanceM > 0 && elapsedS > 0
      ? (distanceM / elapsedS) * 3.6
      : null;

  return {
    created_by: userEmail,
    source: 'strava',
    activity_type: effort.activity_type,
    activity_id: String(effort.activity_id || ''),
    activity_name: String(effort.activity_name || ''),
    activity_date: String(effort.activity_date || '').slice(0, 10),
    distance_name: distanceName,
    distance_m: distanceM,
    elapsed_time_s: elapsedS,
    pace_s_per_km: pace,
    speed_kph: effort.activity_type === 'Ride' ? speed : null,
    rank: Number.isFinite(Number(effort.rank)) ? Number(effort.rank) : 999,
    distance_name_canon: distanceName,
    activity_id_norm: String(effort.activity_id || ''),
  };
};

const aggregatePBs = (efforts, { topN = 3 } = {}) => {
  const grouped = new Map();
  for (const effort of efforts || []) {
    if (!effort?.distance_name || !effort?.activity_type) continue;
    const key = `${effort.activity_type}:${canonicalName(effort.distance_name)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(effort);
  }

  for (const [key, group] of grouped.entries()) {
    const isLongRideGroup = key.endsWith(':180k+') || key.endsWith(':100k+');
    group.sort((a, b) => {
      if (isLongRideGroup) {
        const distanceDiff = (Number(b.distance_m) || 0) - (Number(a.distance_m) || 0);
        if (distanceDiff !== 0) return distanceDiff;
      }
      const timeA = a.elapsed_time_s ?? Infinity;
      const timeB = b.elapsed_time_s ?? Infinity;
      if (timeA === timeB) return new Date(b.activity_date || 0).getTime() - new Date(a.activity_date || 0).getTime();
      return timeA - timeB;
    });

    const seenActivityIds = new Set();
    const deduped = [];
    for (const effort of group) {
      const aid = normalizeActivityId(effort.activity_id);
      if (aid && seenActivityIds.has(aid)) continue;
      if (aid) seenActivityIds.add(aid);
      deduped.push(effort);
      if (deduped.length >= topN) break;
    }
    grouped.set(key, deduped);
  }

  return grouped;
};

const interpolateTimeAtDistance = (distanceA, timeA, distanceB, timeB, targetDistance) => {
  if (distanceB === distanceA) return timeB;
  const ratio = (targetDistance - distanceA) / (distanceB - distanceA);
  return timeA + ratio * (timeB - timeA);
};

const getStreamData = (streams, type) => {
  if (Array.isArray(streams)) {
    return streams.find((stream) => stream?.type === type)?.data || [];
  }

  if (streams && typeof streams === 'object') {
    const direct = streams[type];
    if (Array.isArray(direct)) return direct;
    if (Array.isArray(direct?.data)) return direct.data;

    for (const [key, stream] of Object.entries(streams)) {
      if (key === type && Array.isArray(stream?.data)) return stream.data;
      if (stream?.type === type && Array.isArray(stream?.data)) return stream.data;
    }
  }

  return [];
};

const fastestStreamEffort = (activity, streams, target) => {
  const distanceStream = getStreamData(streams, 'distance');
  const timeStream = getStreamData(streams, 'time');
  if (distanceStream.length < 2 || timeStream.length !== distanceStream.length) return null;
  if ((distanceStream[distanceStream.length - 1] || 0) < target.meters) return null;

  let bestElapsed = Infinity;
  let end = 1;

  for (let start = 0; start < distanceStream.length - 1; start++) {
    const startDistance = Number(distanceStream[start]);
    const startTime = Number(timeStream[start]);
    const targetDistance = startDistance + target.meters;

    while (end < distanceStream.length && Number(distanceStream[end]) < targetDistance) end++;
    if (end >= distanceStream.length) break;

    const endDistance = Number(distanceStream[end]);
    const endTime = Number(timeStream[end]);
    const prevDistance = Number(distanceStream[end - 1]);
    const prevTime = Number(timeStream[end - 1]);
    const exactEndTime = interpolateTimeAtDistance(prevDistance, prevTime, endDistance, endTime, targetDistance);
    const elapsed = exactEndTime - startTime;

    if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < bestElapsed) bestElapsed = elapsed;
  }

  if (!Number.isFinite(bestElapsed)) return null;

  return {
    activity_type: 'Ride',
    distance_name: target.name,
    elapsed_time_s: Math.round(bestElapsed),
    activity_id: activity.strava_id || activity.id,
    activity_name: activity.name,
    activity_date: activity.start_date,
    distance_m: target.meters,
    pace_s_per_km: bestElapsed / (target.meters / 1000),
    speed_kph: (target.meters / bestElapsed) * 3.6,
    rank: 999,
  };
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userRecord = await base44.asServiceRole.entities.User.get(user.id);
    const athleteId = userRecord?.strava_athlete_id;
    if (!athleteId) {
      return Response.json({
        success: false,
        error: 'No Strava athlete ID found. Please connect your Strava account first.',
        activitiesProcessed: 0,
        bestEffortsExtracted: 0,
      });
    }

    const activitiesByKey = new Map();
    const trackedFetchDebug = {};
    let stravaFetchCount = 0;
    let stravaStreamFetchCount = 0;
    let accessToken = null;
    let tokenChecked = false;

    const ensureStravaToken = async () => {
      if (!tokenChecked) {
        tokenChecked = true;
        accessToken = await getStravaToken(base44, user);
      }
      return accessToken;
    };

    const rememberActivity = (item) => {
      const key = getActivityMergeKey(item);
      if (!key) return false;
      const existing = activitiesByKey.get(key);
      if (!existing || activityCompletenessScore(item) > activityCompletenessScore(existing)) {
        activitiesByKey.set(key, item);
      }
      return !existing;
    };

    const fetchStravaActivityDetail = async (activityId) => {
      if (stravaFetchCount >= STRAVA_FETCH_LIMIT) return { ok: false, skipped: 'fetch_limit' };
      const token = await ensureStravaToken();
      if (!token) return { ok: false, skipped: 'no_token' };

      const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}?include_all_efforts=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 429) return { ok: false, status: res.status, rate_limited: true };

      stravaFetchCount++;
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, status: res.status, fullData: await res.json() };
    };

    const fetchStravaStreams = async (activityId) => {
      if (stravaFetchCount >= STRAVA_FETCH_LIMIT) return { ok: false, skipped: 'fetch_limit' };
      const token = await ensureStravaToken();
      if (!token) return { ok: false, skipped: 'no_token' };

      const url = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=distance,time&key_by_type=false`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429) return { ok: false, status: res.status, rate_limited: true };

      stravaFetchCount++;
      stravaStreamFetchCount++;
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, streams: await res.json() };
    };

    const persistStravaDetail = async (activity, fullData) => {
      if (!activity?.id) return false;
      try {
        await base44.entities.Activity.update(activity.id, { raw_data: fullData });
        return true;
      } catch {
        try {
          await base44.asServiceRole.entities.Activity.update(activity.id, { raw_data: fullData });
          return true;
        } catch (error) {
          console.warn(`Failed to persist raw_data for ${activity?.strava_id || activity?.activity_id || activity?.id}:`, error.message);
          return false;
        }
      }
    };

    async function fetchAll(client, label, query) {
      const pageSize = 500;
      const maxPagesPerDir = 8;
      let count = 0;
      for (const sortDir of ['-start_date', 'start_date']) {
        let skip = 0;
        let pages = 0;
        while (pages < maxPagesPerDir) {
          const batch = await client.entities.Activity.filter(query, sortDir, pageSize, skip);
          const items = normalizeArray(batch);
          if (items.length === 0) break;
          for (const item of items) if (rememberActivity(item)) count++;
          skip += pageSize;
          pages++;
          if (items.length < pageSize) break;
        }
      }
      console.log(`${label}: added ${count} unique activities`);
    }

    await fetchAll(base44, 'user-scoped athlete_id', { athlete_id: athleteId });
    await fetchAll(base44.asServiceRole, 'service-role athlete_id', { athlete_id: athleteId });
    await fetchAll(base44.asServiceRole, 'service-role created_by', { created_by: user.email });

    for (const trackedId of TRACKED_ACTIVITY_IDS) {
      const before = activitiesByKey.has(trackedId);
      for (const query of [{ strava_id: trackedId }, { activity_id: trackedId }]) {
        for (const client of [base44, base44.asServiceRole]) {
          try {
            const resp = await client.entities.Activity.filter(query, '-start_date', TARGETED_ACTIVITY_LOOKUP_LIMIT);
            for (const item of normalizeArray(resp)) rememberActivity(item);
          } catch {
            // Some fields may not be filterable in all environments.
          }
        }
      }
      trackedFetchDebug[trackedId] = {
        found_before_targeted_fetch: before,
        found_after_targeted_fetch: activitiesByKey.has(trackedId),
      };
    }

    const allActivities = Array.from(activitiesByKey.values());
    if (allActivities.length === 0) {
      return Response.json({
        success: false,
        error: 'No activities found in your database. Please sync your Strava activities first.',
        activitiesProcessed: 0,
        bestEffortsExtracted: 0,
      });
    }

    const normalizedActivities = allActivities.map(normalizeActivity);
    const activityTypeCounts = normalizedActivities.reduce((acc, activity) => {
      const key = activity.type || '(blank)';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const activitiesWithDistance = normalizedActivities.filter((a) => a.distance_m > 0).length;
    const activitiesWithTime = normalizedActivities.filter((a) => a.elapsed_time_s > 0 || a.moving_time_s > 0).length;

    const runsAndRides = normalizedActivities.filter((a) =>
      (a.type === 'Run' || CYCLING_TYPES.includes(a.type)) &&
      a.distance_m > 0 &&
      (a.elapsed_time_s > 0 || a.moving_time_s > 0)
    );

    const activitiesNeedingDetail = runsAndRides
      .filter((a) => !hasUsableBestEfforts(a))
      .sort((a, b) => {
        const distanceDiff = Number(b.distance_m || 0) - Number(a.distance_m || 0);
        if (distanceDiff !== 0) return distanceDiff;
        return new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime();
      });

    if (activitiesNeedingDetail.length > 0) {
      accessToken = await ensureStravaToken();
      if (!accessToken) console.warn('No Strava token available, skipping detailed fetch');
    }

    if (accessToken && activitiesNeedingDetail.length > 0) {
      for (const activity of activitiesNeedingDetail) {
        if (stravaFetchCount >= STRAVA_FETCH_LIMIT) break;
        if (!activity.strava_id) continue;

        const detail = await fetchStravaActivityDetail(activity.strava_id);
        if (detail.rate_limited) break;
        if (detail.ok) {
          const merged = activityFromStravaDetail(detail.fullData, activity, athleteId);
          Object.assign(activity, merged);
          rememberActivity(merged);
          await persistStravaDetail(activity, detail.fullData);
        }
      }
    }

    const candidateEfforts = [];
    const streamCalculatedKeys = new Set();

    for (const activity of runsAndRides) {
      const activityType = CYCLING_TYPES.includes(activity.type) ? 'Ride' : activity.type;
      const standardDists = STANDARD_DISTANCES[activityType] || [];
      const stravaIdForEffort = String(activity.strava_id || '');

      if (activityType === 'Ride' && activity.distance_m > LONG_RIDE_DISTANCE_M) {
        const timeSecs = activity.elapsed_time_s || activity.moving_time_s;
        candidateEfforts.push({
          activity_type: activityType,
          distance_name: '180k+',
          elapsed_time_s: timeSecs,
          activity_id: stravaIdForEffort || activity.id,
          activity_name: activity.name,
          activity_date: activity.start_date,
          distance_m: activity.distance_m,
          pace_s_per_km: timeSecs / (activity.distance_m / 1000),
          speed_kph: (activity.distance_m / 1000) / (timeSecs / 3600),
          rank: 999,
        });
      }

      if (activityType === 'Ride' && activity.distance_m > LONG_RIDE_100K_DISTANCE_M) {
        const timeSecs100k = activity.elapsed_time_s || activity.moving_time_s;
        candidateEfforts.push({
          activity_type: activityType,
          distance_name: '100k+',
          elapsed_time_s: timeSecs100k,
          activity_id: stravaIdForEffort || activity.id,
          activity_name: activity.name,
          activity_date: activity.start_date,
          distance_m: activity.distance_m,
          pace_s_per_km: timeSecs100k / (activity.distance_m / 1000),
          speed_kph: (activity.distance_m / 1000) / (timeSecs100k / 3600),
          rank: 999,
        });
      }

      for (const stdDistance of standardDists) {
        const minDist = stdDistance.meters * (1 - stdDistance.tolerance);
        const maxDist = stdDistance.meters * (1 + stdDistance.tolerance);
        if (activity.distance_m >= minDist && activity.distance_m <= maxDist) {
          const timeSecs = activity.elapsed_time_s || activity.moving_time_s;
          candidateEfforts.push({
            activity_type: activityType,
            distance_name: stdDistance.name,
            elapsed_time_s: timeSecs,
            activity_id: stravaIdForEffort || activity.id,
            activity_name: activity.name,
            activity_date: activity.start_date,
            distance_m: activity.distance_m,
            pace_s_per_km: timeSecs / (activity.distance_m / 1000),
            speed_kph: activityType === 'Ride' ? (activity.distance_m / 1000) / (timeSecs / 3600) : null,
            rank: 999,
          });
        }
      }

      const embeddedBestEfforts = activity.raw_data?.best_efforts || activity.best_efforts || [];
      if ((activityType === 'Run' || activityType === 'Ride') && Array.isArray(embeddedBestEfforts)) {
        for (const effort of embeddedBestEfforts) {
          if (!effort.name || !effort.elapsed_time) continue;
          const distanceName = canonicalName(effort.name);
          candidateEfforts.push({
            activity_type: activityType,
            distance_name: distanceName,
            elapsed_time_s: effort.elapsed_time,
            activity_id: stravaIdForEffort || activity.id,
            activity_name: activity.name,
            activity_date: activity.start_date,
            distance_m: effort.distance,
            pace_s_per_km: effort.distance > 0 ? effort.elapsed_time / (effort.distance / 1000) : null,
            speed_kph: effort.distance > 0 && effort.elapsed_time > 0 ? (effort.distance / effort.elapsed_time) * 3.6 : null,
            rank: Number.isFinite(effort.pr_rank) && effort.pr_rank !== null ? Number(effort.pr_rank) : 999,
          });
          if (activityType === 'Ride') streamCalculatedKeys.add(`${stravaIdForEffort || activity.id}:${distanceName}`);
        }
      }
    }

    const minShortCyclingDistance = Math.min(...SHORT_CYCLING_DISTANCES.map((d) => d.meters));
    const ridesForStreamEfforts = runsAndRides
      .filter((a) => CYCLING_TYPES.includes(a.type) && a.strava_id && a.distance_m >= minShortCyclingDistance)
      .sort((a, b) => Number(b.distance_m || 0) - Number(a.distance_m || 0));

    if (ridesForStreamEfforts.length > 0) {
      accessToken = await ensureStravaToken();
    }

    if (accessToken) {
      for (const ride of ridesForStreamEfforts) {
        if (stravaFetchCount >= STRAVA_FETCH_LIMIT) break;
        const rideId = ride.strava_id || ride.id;
        const missingShortTargets = SHORT_CYCLING_DISTANCES.filter((target) =>
          ride.distance_m >= target.meters && !streamCalculatedKeys.has(`${rideId}:${target.name}`)
        );
        if (missingShortTargets.length === 0) continue;

        const streamResp = await fetchStravaStreams(ride.strava_id);
        if (streamResp.rate_limited) break;
        if (!streamResp.ok) continue;

        for (const target of missingShortTargets) {
          const effort = fastestStreamEffort(ride, streamResp.streams, target);
          if (effort) {
            candidateEfforts.push(effort);
            streamCalculatedKeys.add(`${rideId}:${target.name}`);
          }
        }
      }
    }

    const bestEffortsMap = aggregatePBs(candidateEfforts, { topN: BEST_EFFORTS_PER_DISTANCE });

    const existingBests = await base44.asServiceRole.entities.BestEffort.filter({}, '-created_date', 10000);
    const existingIds = normalizeArray(existingBests)
      .filter((effort) => effort.created_by === user.email || effort.created_by_id === user.id)
      .map((e) => e.id);

    for (const id of existingIds) {
      try {
        await base44.asServiceRole.entities.BestEffort.delete(id);
      } catch (err) {
        console.error(`Failed to delete best effort ${id}:`, err.message);
      }
    }

    const toCreate = [];
    for (const [, efforts] of bestEffortsMap.entries()) {
      for (const effort of efforts) if (effort) toCreate.push(createBestEffortRow(user.email, effort));
    }

    let insertedCount = 0;
    if (toCreate.length > 0) {
      try {
        await base44.entities.BestEffort.bulkCreate(toCreate);
        insertedCount = toCreate.length;
      } catch (bulkErr) {
        console.warn('Bulk create failed, falling back to individual creates:', bulkErr.message);
        for (const row of toCreate) {
          try {
            await base44.entities.BestEffort.create(row);
            insertedCount++;
          } catch (err) {
            console.error('Individual create failed for:', row.distance_name, err.message);
          }
        }
      }
    }

    const shortCyclingRows = toCreate.filter((row) =>
      row.activity_type === 'Ride' && SHORT_CYCLING_DISTANCES.some((d) => d.name === row.distance_name)
    ).length;

    return Response.json({
      success: true,
      activitiesProcessed: runsAndRides.length,
      bestEffortsExtracted: insertedCount,
      activitiesFetched: allActivities.length,
      activitiesWithDistance,
      activitiesWithTime,
      activityTypeCounts,
      activitiesNeedingDetail: activitiesNeedingDetail.length,
      stravaDetailsFetched: stravaFetchCount,
      stravaStreamFetches: stravaStreamFetchCount,
      candidateEffortsFound: candidateEfforts.length,
      uniqueBestEffortsFound: bestEffortsMap.size,
      shortCyclingBestEffortsExtracted: shortCyclingRows,
      trackedFetchDebug,
      message: `Successfully extracted ${insertedCount} best efforts from ${runsAndRides.length} activities.`,
    });
  } catch (error) {
    console.error('Extract best efforts error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Unknown error during extraction',
    }, { status: 500 });
  }
});