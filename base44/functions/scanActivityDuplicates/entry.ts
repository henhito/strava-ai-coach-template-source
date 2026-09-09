import { createClientFromRequest } from "npm:@base44/sdk";

type ActivityRecord = Record<string, unknown> & {
  id: string;
  athlete_id?: string | number | null;
  athleteId?: string | number | null;
  strava_id?: string | number | null;
  stravaId?: string | number | null;
  activity_id?: string | number | null;
  name?: string | null;
  start_date?: string | null;
  created_by?: string | null;
  created_date?: string | null;
  updated_date?: string | null;
};

const DEFAULT_ENTITY_NAME = "Activity";
const PAGE_SIZE = 5000;
const DEFAULT_SAMPLE_LIMIT = 100;

function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function duplicateKey(activity: ActivityRecord): string | null {
  const athleteId = asString(activity.athlete_id ?? activity.athleteId);
  const stravaId = asString(activity.strava_id ?? activity.stravaId ?? activity.activity_id);

  if (!athleteId || !stravaId) {
    return null;
  }

  return `${athleteId}:${stravaId}`;
}

function populatedFieldCount(activity: ActivityRecord): number {
  return Object.values(activity).filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }).length;
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(asString(value));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function compareKeepCandidate(a: ActivityRecord, b: ActivityRecord): number {
  const fieldDiff = populatedFieldCount(b) - populatedFieldCount(a);
  if (fieldDiff !== 0) return fieldDiff;

  const createdDiff = timestamp(a.created_date) - timestamp(b.created_date);
  if (createdDiff !== 0) return createdDiff;

  return asString(a.id).localeCompare(asString(b.id));
}

function publicActivity(activity: ActivityRecord) {
  return {
    id: activity.id,
    strava_id: asString(activity.strava_id ?? activity.stravaId ?? activity.activity_id),
    athlete_id: asString(activity.athlete_id ?? activity.athleteId),
    name: activity.name ?? null,
    start_date: activity.start_date ?? null,
    created_by: activity.created_by ?? null,
    created_date: activity.created_date ?? null,
  };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const entityName = asString(body.entityName) || DEFAULT_ENTITY_NAME;
    const sampleLimit = Math.max(1, Math.min(Number(body.sampleLimit ?? DEFAULT_SAMPLE_LIMIT), 1000));
    const entities = base44.asServiceRole.entities as Record<string, any>;
    const Activity = entities[entityName];

    if (!Activity) {
      return Response.json({ error: `Entity not found: ${entityName}` }, { status: 400 });
    }

    const groups = new Map<string, ActivityRecord[]>();
    let scanned = 0;
    let skippedMissingKey = 0;

    for (let skip = 0; ; skip += PAGE_SIZE) {
      const page = await Activity.list("-created_date", PAGE_SIZE, skip);
      scanned += page.length;

      for (const activity of page as ActivityRecord[]) {
        const key = duplicateKey(activity);

        if (!key) {
          skippedMissingKey += 1;
          continue;
        }

        const group = groups.get(key);
        if (group) {
          group.push(activity);
        } else {
          groups.set(key, [activity]);
        }
      }

      if (page.length < PAGE_SIZE) {
        break;
      }
    }

    const duplicateGroups = [...groups.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([key, group]) => {
        const sorted = [...group].sort(compareKeepCandidate);
        const keep = sorted[0];
        const deleteRecords = sorted.slice(1);

        return {
          key,
          activity_id: asString(keep.strava_id ?? keep.stravaId ?? keep.activity_id),
          athlete_id: asString(keep.athlete_id ?? keep.athleteId),
          count: group.length,
          keep: publicActivity(keep),
          delete_count: deleteRecords.length,
          delete_samples: deleteRecords.slice(0, 5).map(publicActivity),
          delete_ids: deleteRecords.map((activity) => activity.id),
        };
      })
      .sort((a, b) => b.delete_count - a.delete_count || a.key.localeCompare(b.key));

    const totalDeleteCount = duplicateGroups.reduce((sum, group) => sum + group.delete_count, 0);

    return Response.json({
      entity: entityName,
      scanned,
      unique_keys: groups.size,
      skipped_missing_key: skippedMissingKey,
      duplicate_group_count: duplicateGroups.length,
      total_duplicate_rows_to_delete: totalDeleteCount,
      duplicate_groups: duplicateGroups.slice(0, sampleLimit),
      truncated: duplicateGroups.length > sampleLimit,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    base44.cleanup?.();
  }
});
