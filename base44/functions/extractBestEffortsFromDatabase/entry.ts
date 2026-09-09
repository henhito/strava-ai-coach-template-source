import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const PAGE_SIZE = 250;
const TOLERANCE = 0.02;
const CYCLING_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];
const DISTANCES = {
  Run: [
    ['400m', 400], ['800m', 800], ['1k', 1000], ['1/2 mile', 805], ['1 mile', 1609], ['2 mile', 3219], ['5k', 5000], ['10k', 10000], ['15k', 15000], ['10 mile', 16093], ['20k', 20000], ['half marathon', 21097], ['30k', 30000], ['marathon', 42195], ['50k', 50000], ['100k', 100000]
  ],
  Ride: [
    ['5 mile', 8047], ['10k', 10000], ['10 mile', 16093], ['20k', 20000], ['30k', 30000], ['40k', 40000], ['50k', 50000], ['80k', 80000], ['50 mile', 80467], ['90k', 90000], ['100k', 100000], ['100 mile', 160934], ['180k', 180000]
  ]
};

function rows(value) {
  return Array.isArray(value) ? value : value?.items || value?.data || [];
}

function normalizedSport(activity) {
  if (activity.type === 'Run') return 'Run';
  return CYCLING_TYPES.includes(activity.type) ? 'Ride' : null;
}

function candidateFromActivity(activity, sport, name, meters) {
  const elapsed = Number(activity.elapsed_time_s || activity.moving_time_s || 0);
  const distance = Number(activity.distance_m || 0);
  if (!elapsed || distance < meters * (1 - TOLERANCE) || distance > meters * (1 + TOLERANCE)) return null;
  const activityId = String(activity.strava_id || activity.activity_id || activity.id);
  return {
    activity_type: sport,
    distance_name: name,
    distance_name_canon: name,
    activity_id: activityId,
    activity_id_norm: activityId,
    activity_distance_key: `${activityId}|${name}`,
    activity_name: activity.name || 'Activity',
    activity_date: activity.start_date || null,
    distance_m: distance,
    elapsed_time_s: elapsed,
    pace_s_per_km: elapsed / (distance / 1000),
    speed_kph: sport === 'Ride' ? (distance / elapsed) * 3.6 : null,
    source: 'database_scan',
    rank: 1
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'start';
    const jobs = rows(await base44.entities.BestEffortScanJob.filter({ job_type: 'database_best_efforts' }, '-created_date', 1, 0));
    let job = jobs[0] || null;

    if (action === 'status') return Response.json({ success: true, job });
    if (action === 'stop' && job?.status === 'running') {
      job = await base44.entities.BestEffortScanJob.update(job.id, { status: 'stopped' });
      return Response.json({ success: true, hasMore: false, job });
    }

    if (!job || ['completed', 'error', 'stopped'].includes(job.status)) {
      const allActivities = rows(await base44.entities.Activity.list('-start_date', 1, 0));
      job = await base44.entities.BestEffortScanJob.create({
        job_type: 'database_best_efforts', status: 'running', processed_count: 0, created_count: 0,
        total_activities: allActivities.length, next_offset: 0, started_at: new Date().toISOString(), error_message: null
      });
    }

    const activities = rows(await base44.entities.Activity.list(
      '-start_date', PAGE_SIZE, Number(job.next_offset || 0)
    ));
    const candidates = new Map();
    for (const activity of activities) {
      const sport = normalizedSport(activity);
      if (!sport) continue;
      for (const [name, meters] of DISTANCES[sport]) {
        const candidate = candidateFromActivity(activity, sport, name, meters);
        if (!candidate) continue;
        const key = `${sport}|${name}`;
        const current = candidates.get(key);
        if (!current || candidate.elapsed_time_s < current.elapsed_time_s) candidates.set(key, candidate);
      }
    }

    const currentRecords = rows(await base44.entities.BestEffort.filter({ rank: 1 }, '-activity_date', 500, 0));
    const currentByKey = new Map(currentRecords.map((record) => [`${record.activity_type}|${record.distance_name_canon || record.distance_name}`, record]));
    let created = 0;
    for (const [key, candidate] of candidates) {
      const current = currentByKey.get(key);
      if (current && Number(current.elapsed_time_s || Infinity) <= candidate.elapsed_time_s) continue;
      if (current) await base44.entities.BestEffort.update(current.id, { rank: 2 });
      await base44.entities.BestEffort.create(candidate);
      created += 1;
    }

    const processed = Number(job.processed_count || 0) + activities.length;
    const isComplete = activities.length < PAGE_SIZE;
    job = await base44.entities.BestEffortScanJob.update(job.id, {
      status: isComplete ? 'completed' : 'running', processed_count: processed,
      created_count: Number(job.created_count || 0) + created, next_offset: Number(job.next_offset || 0) + activities.length,
      ...(isComplete ? { completed_at: new Date().toISOString() } : {})
    });

    return Response.json({
      success: true, hasMore: !isComplete, job,
      message: isComplete ? `Database scan complete. Saved ${job.created_count} personal records.` : `Scanning saved activities: ${job.processed_count} processed.`
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message || 'Database scan failed' }, { status: 500 });
  }
});