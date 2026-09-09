import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const PAGE_SIZE = 1000;
const MAX_PAGES = 150;
const KNOWN_ACTIVITY_IDS = ['11127729148'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalizePage(payload) {
  if (!payload) return { items: [], next: null };
  if (Array.isArray(payload)) return { items: payload, next: null };
  return {
    items: payload.items || payload.data || [],
    next: payload.next || payload.next_page || payload.next_page_token || null,
  };
}

function getRaw(activity) {
  return activity?.raw_data || activity?.raw || {};
}

function getActivityId(activity) {
  const raw = getRaw(activity);
  const id =
    activity?.strava_id ??
    activity?.activity_id ??
    activity?.strava_activity_id ??
    raw?.id ??
    raw?.activity_id ??
    null;

  return id == null ? null : String(id);
}

function getAthleteId(activity) {
  const raw = getRaw(activity);
  const id =
    activity?.athlete_id ??
    raw?.athlete?.id ??
    raw?.athlete_id ??
    null;

  return id == null ? null : String(id);
}

function getUniqueKey(activity) {
  const athleteId = getAthleteId(activity);
  const activityId = getActivityId(activity);
  if (athleteId && activityId) return `${athleteId}:${activityId}`;
  if (activityId) return `unknown-athlete:${activityId}`;
  return `row:${activity?.id ?? crypto.randomUUID()}`;
}

function getSortTimestamp(activity) {
  return new Date(
    activity?.updated_date ||
      activity?.updated_at ||
      activity?.created_date ||
      activity?.created_at ||
      activity?.start_date ||
      0,
  ).getTime();
}

function makeSample(activity) {
  return {
    id: activity?.id ?? null,
    strava_id: getActivityId(activity),
    athlete_id: getAthleteId(activity),
    created_by: activity?.created_by ?? null,
    start_date: activity?.start_date ?? getRaw(activity)?.start_date ?? null,
    name: activity?.name ?? getRaw(activity)?.name ?? null,
  };
}

function mergeRows(existingRows, newRows) {
  const byRowId = new Map(existingRows.map((row) => [String(row.id ?? getUniqueKey(row)), row]));
  for (const row of newRows) {
    byRowId.set(String(row.id ?? getUniqueKey(row)), row);
  }
  return Array.from(byRowId.values());
}

async function fetchPage(entity, query, sort, limit, offset) {
  if (query) {
    try {
      return await entity.filter(query, sort, limit, offset);
    } catch {
      return await entity.filter(query, sort, limit);
    }
  }

  try {
    return await entity.list(sort, limit, offset);
  } catch {
    return await entity.list(sort, limit);
  }
}

async function scanActivities(entity, query = null, { sort = '-start_date', limit = PAGE_SIZE } = {}) {
  let rows = [];
  const seenPageSignatures = new Set();

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * limit;
    const payload = await fetchPage(entity, query, sort, limit, offset);
    const { items } = normalizePage(payload);

    if (!Array.isArray(items) || items.length === 0) break;

    const signature = items
      .slice(0, 5)
      .map((item) => item?.id || getUniqueKey(item))
      .join('|');

    if (seenPageSignatures.has(signature)) {
      break;
    }
    seenPageSignatures.add(signature);

    rows = mergeRows(rows, items);
    if (items.length < limit) break;
  }

  return rows;
}

function buildUniqueStats(rows, athleteId) {
  const athleteKey = String(athleteId);
  const unique = new Map();
  const groups = new Map();
  const byAthleteId = {};
  let missingAthleteId = 0;

  for (const row of rows) {
    const normalizedAthleteId = getAthleteId(row);
    const uniqueKey = getUniqueKey(row);

    if (!normalizedAthleteId) {
      missingAthleteId += 1;
    } else {
      byAthleteId[normalizedAthleteId] = (byAthleteId[normalizedAthleteId] || 0) + 1;
    }

    if (!groups.has(uniqueKey)) groups.set(uniqueKey, []);
    groups.get(uniqueKey).push(row);

    const existing = unique.get(uniqueKey);
    if (!existing || getSortTimestamp(row) >= getSortTimestamp(existing)) {
      unique.set(uniqueKey, row);
    }
  }

  const currentAthleteRows = rows.filter((row) => getAthleteId(row) === athleteKey);
  const currentAthleteUnique = Array.from(unique.values()).filter(
    (row) => getAthleteId(row) === athleteKey,
  );
  const duplicateGroups = Array.from(groups.entries())
    .filter(([key, group]) => key.startsWith(`${athleteKey}:`) && group.length > 1)
    .map(([key, group]) => ({
      key,
      activity_id: getActivityId(group[0]),
      athlete_id: getAthleteId(group[0]),
      count: group.length,
      samples: group.slice(0, 3).map(makeSample),
    }))
    .sort((a, b) => b.count - a.count);

  const trackedActivities = {};
  for (const id of KNOWN_ACTIVITY_IDS) {
    const matches = rows.filter(
      (row) => getAthleteId(row) === athleteKey && getActivityId(row) === id,
    );
    trackedActivities[id] = {
      found: matches.length > 0,
      rows: matches.length,
      unique: matches.length > 0 ? 1 : 0,
      samples: matches.slice(0, 3).map(makeSample),
    };
  }

  return {
    totalRowsScanned: rows.length,
    totalUniqueActivities: unique.size,
    totalActivities: currentAthleteUnique.length,
    yourActivitiesByAthleteId: currentAthleteUnique.length,
    yourUniqueActivitiesByAthleteId: currentAthleteUnique.length,
    rawRowsForAthlete: currentAthleteRows.length,
    duplicatesRemoved: currentAthleteRows.length - currentAthleteUnique.length,
    duplicateRowsForAthlete: currentAthleteRows.length - currentAthleteUnique.length,
    duplicateGroupsForAthlete: duplicateGroups.length,
    byAthleteId,
    missingAthleteId,
    duplicateSamples: duplicateGroups.slice(0, 10),
    trackedActivities,
    samples: currentAthleteUnique.slice(0, 5).map(makeSample),
  };
}

Deno.serve(async (req) => {
  try {
    console.log('[diagnosticSync] invoked', req.method, new Date().toISOString());
    if (req.method !== 'POST') {
      return json({ error: 'Method Not Allowed: use POST to /functions/diagnosticSync' }, 405);
    }

    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return json({ error: 'Unauthorized' }, 401);

    const user = await base44.entities.User.get(me.id).catch(() => null);
    const athleteId = user?.strava_athlete_id ?? null;
    if (!athleteId) {
      return json({ success: false, error: 'No athlete_id found. Connect Strava first.' }, 400);
    }

    const athleteKey = String(athleteId);
    console.log('[diagnosticSync] scanning Activity rows for athlete', athleteKey);

    const allServiceRows = await scanActivities(
      base44.asServiceRole.entities.Activity,
      null,
      { sort: '-start_date', limit: PAGE_SIZE },
    );
    const serviceRows = await scanActivities(
      base44.asServiceRole.entities.Activity,
      { athlete_id: athleteId },
      { sort: '-start_date', limit: PAGE_SIZE },
    );
    const serviceRowsByStringId =
      typeof athleteId === 'string'
        ? []
        : await scanActivities(
            base44.asServiceRole.entities.Activity,
            { athlete_id: athleteKey },
            { sort: '-start_date', limit: PAGE_SIZE },
          );
    const userVisibleRows = await scanActivities(
      base44.entities.Activity,
      { athlete_id: athleteId },
      { sort: '-start_date', limit: PAGE_SIZE },
    ).catch(() => []);

    const allRows = mergeRows(
      mergeRows(mergeRows(allServiceRows, serviceRows), serviceRowsByStringId),
      userVisibleRows,
    );
    const databaseStats = buildUniqueStats(allRows, athleteKey);

    let stravaTotal = null;
    let stravaError = null;
    if (user?.strava_access_token) {
      try {
        const response = await fetch(`https://www.strava.com/api/v3/athletes/${athleteKey}/stats`, {
          headers: { Authorization: `Bearer ${user.strava_access_token}` },
        });
        if (response.ok) {
          const stats = await response.json();
          stravaTotal =
            (stats.all_run_totals?.count ?? 0) +
            (stats.all_ride_totals?.count ?? 0) +
            (stats.all_swim_totals?.count ?? 0);
        } else {
          stravaError = `Strava ${response.status} ${await response.text()}`;
        }
      } catch (error) {
        stravaError = String(error?.message || error);
      }
    } else {
      stravaError = 'Missing Strava access token';
    }

    const dbTotal = databaseStats.yourUniqueActivitiesByAthleteId;
    const missing = stravaTotal == null ? 0 : Math.max(0, stravaTotal - dbTotal);
    const diagnosis =
      stravaTotal == null
        ? `Database has ${dbTotal} unique activities for athlete_id ${athleteKey}. Could not compare with Strava: ${stravaError}`
        : missing > 0
          ? `You have ${stravaTotal} on Strava but ${dbTotal} unique activities in the database for athlete_id ${athleteKey}. Missing ${missing}.`
          : `Database has ${dbTotal} unique activities for athlete_id ${athleteKey}, matching Strava's ${stravaTotal}.`;

    return json({
      success: true,
      user: { email: me.email },
      athleteId: athleteKey,
      database: databaseStats,
      strava: { totalActivities: stravaTotal, error: stravaError },
      missing,
      diagnosis,
    });
  } catch (error) {
    console.error('[diagnosticSync] fatal', error);
    return json({ error: String(error?.message || error) }, 500);
  }
});
