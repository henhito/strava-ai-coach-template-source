import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Scan settings
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

// Delete settings - conservative to avoid rate limits
const MINI_BATCH_SIZE = 3;
const MINI_BATCH_DELAY_MS = 200;
const MAX_DELETE_PER_CALL = 300;

function asString(value) {
  return value === null || value === undefined ? '' : String(value).trim();
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
  return asString(id) || null;
}

function getAthleteId(activity) {
  const raw = getRaw(activity);
  const id =
    activity?.athlete_id ??
    activity?.athleteId ??
    raw?.athlete?.id ??
    raw?.athlete_id ??
    null;
  return asString(id) || null;
}

function rowKey(activity) {
  return asString(activity?.id) || `${getAthleteId(activity) || 'unknown'}:${getActivityId(activity) || crypto.randomUUID()}`;
}

function normalizePage(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.items || payload.data || [];
}

function mergeRows(existingRows, newRows) {
  const byRowId = new Map(existingRows.map((row) => [rowKey(row), row]));
  for (const row of newRows || []) {
    byRowId.set(rowKey(row), row);
  }
  return Array.from(byRowId.values());
}

function populatedFieldCount(activity) {
  return Object.values(activity || {}).filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }).length;
}

function timestamp(value) {
  const parsed = Date.parse(asString(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareKeepCandidate(a, b) {
  const fieldDiff = populatedFieldCount(b) - populatedFieldCount(a);
  if (fieldDiff !== 0) return fieldDiff;
  const aTime = timestamp(a?.created_date || a?.start_date || getRaw(a)?.start_date);
  const bTime = timestamp(b?.created_date || b?.start_date || getRaw(b)?.start_date);
  const timeDiff = aTime - bTime;
  if (timeDiff !== 0) return timeDiff;
  return asString(a?.id).localeCompare(asString(b?.id));
}

function sample(activity) {
  return {
    id: activity?.id ?? null,
    strava_id: getActivityId(activity),
    athlete_id: getAthleteId(activity),
    name: activity?.name ?? getRaw(activity)?.name ?? null,
    start_date: activity?.start_date ?? getRaw(activity)?.start_date ?? null,
    created_by: activity?.created_by ?? null,
    created_date: activity?.created_date ?? null,
  };
}

async function fetchAllPages(entity, query, sort) {
  let rows = [];
  const seenSignatures = new Set();

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    let payload;
    try {
      payload = query
        ? await entity.filter(query, sort, PAGE_SIZE, offset)
        : await entity.list(sort, PAGE_SIZE, offset);
    } catch {
      try {
        payload = query
          ? await entity.filter(query, sort, PAGE_SIZE)
          : await entity.list(sort, PAGE_SIZE);
      } catch {
        break;
      }
    }

    const items = normalizePage(payload);
    if (!items.length) break;

    const sig = items.slice(0, 3).map((r) => r?.id || rowKey(r)).join('|');
    if (seenSignatures.has(sig)) break;
    seenSignatures.add(sig);

    rows = mergeRows(rows, items);
    if (items.length < PAGE_SIZE) break;
  }

  return rows;
}

async function scanAllRows(base44, athleteId, athleteKey) {
  const queries = [
    { entity: base44.asServiceRole.entities.Activity, query: { athlete_id: athleteId }, label: 'service+numericId' },
  ];

  if (typeof athleteId !== 'string') {
    queries.push({ entity: base44.asServiceRole.entities.Activity, query: { athlete_id: athleteKey }, label: 'service+stringId' });
  }

  queries.push({ entity: base44.entities.Activity, query: { athlete_id: athleteId }, label: 'user+numericId' });

  let allRows = [];
  const sourceStats = {};

  for (const { entity, query, label } of queries) {
    try {
      const rows = await fetchAllPages(entity, query, '-start_date');
      sourceStats[label] = rows.length;
      allRows = mergeRows(allRows, rows);
    } catch (err) {
      sourceStats[label] = `error: ${err?.message || String(err)}`;
    }
  }

  return { rows: allRows, sourceStats };
}

function buildDuplicatePlan(rows) {
  const groups = new Map();
  const seenRowIds = new Set();

  for (const activity of rows) {
    const key = rowKey(activity);
    if (seenRowIds.has(key)) continue;
    seenRowIds.add(key);

    const athleteId = getAthleteId(activity);
    const activityId = getActivityId(activity);
    if (!activityId) continue;

    const groupKey = `${athleteId || 'unknown'}:${activityId}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { activity_id: activityId, athlete_id: athleteId, rows: [] });
    }
    groups.get(groupKey).rows.push(activity);
  }

  const duplicateGroups = [];
  for (const group of groups.values()) {
    if (group.rows.length <= 1) continue;
    const sorted = [...group.rows].sort(compareKeepCandidate);
    const keep = sorted[0];
    const deleteRows = sorted.slice(1);
    duplicateGroups.push({
      activity_id: group.activity_id,
      athlete_id: group.athlete_id,
      count: group.rows.length,
      keep: sample(keep),
      delete_count: deleteRows.length,
      delete_ids: deleteRows.map((a) => a.id).filter(Boolean),
      delete_samples: deleteRows.slice(0, 3).map(sample),
    });
  }

  duplicateGroups.sort((a, b) => b.delete_count - a.delete_count);

  const totalDuplicateRows = duplicateGroups.reduce((sum, g) => sum + g.delete_count, 0);
  return { groups: duplicateGroups, totalDuplicateRows, uniqueActivities: groups.size, totalRows: rows.length };
}

async function deleteActivityRow(base44, id) {
  const attempts = [
    async () => { await base44.asServiceRole.entities.Activity.delete(id); },
    async () => { await base44.entities.Activity.delete(id); },
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      await attempt();
      return true;
    } catch (err) {
      errors.push(err?.message || String(err));
    }
  }
  throw new Error(errors.join(' | '));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deleteInBatches(items, batchSize, delayMs, mapper) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(mapper));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await sleep(delayMs);
    }
  }
  return results;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false;

    const authUser = await base44.auth.me().catch(() => null);
    if (!authUser) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await base44.entities.User.get(authUser.id).catch(() => null);
    const athleteId = user?.strava_athlete_id;
    if (!athleteId) {
      return Response.json({ success: false, error: 'No athlete_id found. Connect Strava first.' }, { status: 400 });
    }

    const athleteKey = String(athleteId);

    // MODE 1: Delete-only (IDs provided by caller — no re-scan needed)
    // The UI passes pre-scanned delete_ids to avoid the 90s scan on every click
    if (!dryRun && Array.isArray(body.delete_ids) && body.delete_ids.length > 0) {
      const idsToDelete = body.delete_ids.slice(0, MAX_DELETE_PER_CALL);

      const deleteResults = await deleteInBatches(idsToDelete, MINI_BATCH_SIZE, MINI_BATCH_DELAY_MS, async (id) => {
        try {
          await deleteActivityRow(base44, id);
          return { success: true, deleted_id: id };
        } catch (err) {
          return { success: false, id, error: err?.message || String(err) };
        }
      });

      const removed = deleteResults.filter((r) => r.success).length;
      const failed = deleteResults.filter((r) => !r.success);

      return Response.json({
        success: failed.length === 0,
        dry_run: false,
        mode: 'delete_by_ids',
        message: `Deleted ${removed} duplicate rows. ${failed.length} errors.`,
        duplicatesRemoved: removed,
        errors: failed.length,
        failedDetails: failed.slice(0, 10),
      });
    }

    // MODE 2: Scan (always) + optional delete
    const { rows, sourceStats } = await scanAllRows(base44, athleteId, athleteKey);
    const plan = buildDuplicatePlan(rows);

    if (dryRun || plan.totalDuplicateRows === 0) {
      // Return full list of delete_ids so the UI can pass them back for fast deletion
      const allDeleteIds = plan.groups.flatMap((g) => g.delete_ids);
      return Response.json({
        success: true,
        dry_run: true,
        message: plan.totalDuplicateRows === 0
          ? `No duplicates found. ${plan.uniqueActivities} unique activities across ${plan.totalRows} rows.`
          : `Found ${plan.totalDuplicateRows} duplicate rows across ${plan.groups.length} activity groups (out of ${plan.totalRows} total rows).`,
        athlete_id: athleteKey,
        totalRows: plan.totalRows,
        uniqueActivities: plan.uniqueActivities,
        duplicateRows: plan.totalDuplicateRows,
        duplicateGroups: plan.groups.length,
        all_delete_ids: allDeleteIds,  // Full list for UI to pass back
        sourceStats,
        samples: plan.groups.slice(0, 10),
      });
    }

    // MODE 3: Scan + immediate delete (legacy, limited to MAX_DELETE_PER_CALL)
    const deleteLimit = Math.min(Math.max(Number(body.delete_limit) || MAX_DELETE_PER_CALL, 1), MAX_DELETE_PER_CALL);
    const idsToDelete = [];
    for (const group of plan.groups) {
      for (const id of group.delete_ids) {
        if (idsToDelete.length >= deleteLimit) break;
        idsToDelete.push(id);
      }
      if (idsToDelete.length >= deleteLimit) break;
    }

    const deleteResults = await deleteInBatches(idsToDelete, MINI_BATCH_SIZE, MINI_BATCH_DELAY_MS, async (id) => {
      try {
        await deleteActivityRow(base44, id);
        return { success: true, deleted_id: id };
      } catch (err) {
        return { success: false, id, error: err?.message || String(err) };
      }
    });

    const removed = deleteResults.filter((r) => r.success).length;
    const failed = deleteResults.filter((r) => !r.success);
    const remainingDuplicates = Math.max(0, plan.totalDuplicateRows - removed);
    const allDeleteIds = plan.groups.flatMap((g) => g.delete_ids).slice(removed);

    return Response.json({
      success: failed.length === 0,
      dry_run: false,
      mode: 'scan_and_delete',
      message: remainingDuplicates > 0
        ? `Removed ${removed} duplicate rows. ${remainingDuplicates} duplicates still remain.`
        : `Removed ${removed} duplicate rows. Database is now clean!`,
      athlete_id: athleteKey,
      totalRowsScanned: plan.totalRows,
      uniqueActivities: plan.uniqueActivities,
      duplicateRowsFound: plan.totalDuplicateRows,
      duplicatesRemoved: removed,
      remainingDuplicates,
      hasMore: remainingDuplicates > 0,
      remaining_delete_ids: allDeleteIds.slice(0, 5000), // pass back remaining IDs
      errors: failed.length,
      sourceStats,
      failedDetails: failed.slice(0, 10),
    });
  } catch (error) {
    console.error('[removeDuplicateActivities] fatal', error);
    return Response.json(
      { success: false, error: error?.message || 'Unknown error during duplicate activity cleanup' },
      { status: 500 },
    );
  }
});