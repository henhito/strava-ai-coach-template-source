import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun'];
const rows = (value) => Array.isArray(value) ? value : value?.items || value?.data || [];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req); const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { offset = 0, batch_size = 5 } = await req.json().catch(() => ({}));
    const activities = rows(await base44.entities.Activity.list('-start_date', Math.min(Number(batch_size) || 5, 10), Number(offset) || 0));
    const running = activities.filter((activity) => RUN_TYPES.includes(activity.type) && activity.strava_id);
    const result = { activities_checked: running.length, activities_updated: 0, efforts_created: 0, efforts_updated: 0, activities_skipped: 0, errors: [] };
    for (const activity of running) {
      try {
        const existing = rows(await base44.entities.ActivityBestEffort.filter({ activity_id: activity.id }, 'sort_order', 50, 0));
        const complete = existing.length > 0 && !existing.some((effort) => activity.updated_date && effort.synced_at < activity.updated_date);
        if (complete) { result.activities_skipped += 1; continue; }
        const sync = await base44.functions.invoke('syncActivityBestEfforts', { activityId: activity.id, force: true });
        const data = sync?.data || sync || {}; result.activities_updated += 1; result.efforts_created += Number(data.created || 0); result.efforts_updated += Number(data.updated || 0);
      } catch (error) { result.errors.push({ activity_id: activity.id, strava_id: activity.strava_id, error: error.message || String(error) }); }
    }
    return Response.json({ ...result, next_offset: Number(offset) + activities.length, has_more: activities.length === Math.min(Number(batch_size) || 5, 10) });
  } catch (error) { return Response.json({ error: error.message || 'Backfill failed' }, { status: 500 }); }
});