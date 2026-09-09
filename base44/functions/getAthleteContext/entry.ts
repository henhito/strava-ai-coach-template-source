import { createClientFromRequest } from 'npm:@base44/sdk@0.8.36';

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
function safeGoal(g) {
  return { id: g.id, title: g.title, type: g.type, target_value: g.target_value, target_unit: g.target_unit, deadline: g.deadline, status: g.status, notes: g.notes };
}
function safeInjury(i) {
  return { id: i.id, body_part: i.body_part, severity: i.severity, started_date: i.started_date, status: i.status, notes: i.notes };
}
function safeRace(r) {
  return { id: r.id, name: r.name, date: r.date, distance_m: r.distance_m, location: r.location, goal_time_s: r.goal_time_s, priority: r.priority, notes: r.notes };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const userRecord = await base44.asServiceRole.entities.User.get(user.id);

    const athlete = {
      age: userRecord?.age ?? null,
      hr_zones: userRecord?.hr_zones ?? null,
      preferred_units: userRecord?.preferred_units || 'miles',
      strava_athlete_id: userRecord?.strava_athlete_id ?? null,
    };

    // Latest training plan
    let trainingPlan = null;
    try {
      const plans = await base44.entities.TrainingPlan.filter({}, '-created_date', 1);
      trainingPlan = normalizeArray(plans)[0] || null;
    } catch { /* TrainingPlan may have no RLS / no rows */ }

    // Coaching context entities (user-scoped)
    const [goalsRes, injuriesRes, racesRes] = await Promise.all([
      base44.entities.Goal.filter({}, '-created_date', 50).catch(() => []),
      base44.entities.Injury.filter({}, '-created_date', 50).catch(() => []),
      base44.entities.TargetRace.filter({}, 'date', 50).catch(() => []),
    ]);
    const goals = normalizeArray(goalsRes).map(safeGoal);
    const injuries = normalizeArray(injuriesRes).filter((i) => i.status !== 'resolved').map(safeInjury);
    const upcomingRaces = normalizeArray(racesRes)
      .filter((r) => !r.date || new Date(r.date) >= new Date(Date.now() - DAY_MS)).map(safeRace);

    return json({
      athlete,
      training_plan: trainingPlan,
      goals,
      active_injuries: injuries,
      target_races: upcomingRaces,
    });
  } catch (error) {
    console.error('getAthleteContext error:', error);
    return json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});