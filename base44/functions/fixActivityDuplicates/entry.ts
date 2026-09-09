import { createClientFromRequest } from "npm:@base44/sdk";

type ActivityRecord = Record<string, unknown> & {
  id: string;
  athlete_id?: string | number | null;
  athleteId?: string | number | null;
  strava_id?: string | number | null;
  stravaId?: string | number | null;
  activity_id?: string | number | null;
  created_date?: string | null;
};

type DeleteResult = {
  id: string;
  success: boolean;
  error?: string;
};

const DEFAULT_ENTITY_NAME = "Activity";
const PAGE_SIZE = 5000;
const DEFAULT_MAX_DELETES = 500;
const MAX_DELETES_PER_RUN = 2000;
const DELETE_CONCURRENCY = 8;

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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const entityName = asString(body.entityName) || DEFAULT_ENTITY_NAME;
    const dryRun = body.dryRun !== false;
    const maxDeletes = Math.max(
      1,
      Math.min(Number(body.maxDeletes ?? DEFAULT_MAX_DELETES), MAX_DELETES_PER_RUN),
    );
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

    const deleteIds: string[] = [];

    for (const group of groups.values()) {
      if (group.length <= 1) {
        continue;
      }

      const sorted = [...group].sort(compareKeepCandidate);
      deleteIds.push(...sorted.slice(1).map((activity) => activity.id));
    }

    const limitedDeleteIds = deleteIds.slice(0, maxDeletes);

    let deleteResults: DeleteResult[] = [];

    if (!dryRun && limitedDeleteIds.length > 0) {
      deleteResults = await mapWithConcurrency(limitedDeleteIds, DELETE_CONCURRENCY, async (id) => {
        try {
          const result = await Activity.delete(id);
          return { id, success: Boolean(result?.success ?? true) };
        } catch (error) {
          return {
            id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });
    }

    const deleted = deleteResults.filter((result) => result.success).length;
    const failed = deleteResults.filter((result) => !result.success);
    const remainingEstimate = dryRun
      ? deleteIds.length
      : Math.max(0, deleteIds.length - deleted);

    return Response.json({
      entity: entityName,
      dry_run: dryRun,
      scanned,
      skipped_missing_key: skippedMissingKey,
      duplicate_rows_found: deleteIds.length,
      attempted_delete_count: dryRun ? 0 : limitedDeleteIds.length,
      deleted,
      failed_count: failed.length,
      failed: failed.slice(0, 20),
      max_deletes: maxDeletes,
      has_more: remainingEstimate > 0,
      remaining_estimate: remainingEstimate,
      next_action: dryRun
        ? "Call again with { \"dryRun\": false } to delete duplicates."
        : remainingEstimate > 0
          ? "Call this function again until has_more is false."
          : "Done. Run scanActivityDuplicates to confirm there are no duplicate groups left.",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    base44.cleanup?.();
  }
});
