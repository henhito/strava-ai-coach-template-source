import { createClientFromRequest } from 'npm:@base44/sdk@0.8.36';

const CYCLING_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];

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
function rowVisibleToUser(row, user) {
  const cb = String(row?.created_by || '').trim();
  const cbId = String(row?.created_by_id || '').trim();
  if (cb === user.email || cb === user.id) return true;
  if (cbId === user.email || cbId === user.id) return true;
  if (!cb && (cbId.startsWith('service_') || !cbId)) return true;
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { /* */ }
    const typeFilter = body.type || 'all';
    const limit = Math.max(1, Math.min(100, Number(body.limit) || 20));
    const distanceName = body.distance_name ? String(body.distance_name).trim() : null;
    const distanceM = body.distance_m ? Number(body.distance_m) : null;

    const [userRes, serviceRes] = await Promise.all([
      base44.entities.BestEffort.filter({}, '-activity_date', 10000),
      base44.asServiceRole.entities.BestEffort.filter({}, '-activity_date', 10000),
    ]);
    let rows = [...normalizeArray(userRes)];
    const seen = new Set(rows.map((r) => r.id));
    for (const r of normalizeArray(serviceRes)) {
      if (r.id && !seen.has(r.id)) { rows.push(r); seen.add(r.id); }
    }

    rows = rows.filter((r) => rowVisibleToUser(r, user));

    if (typeFilter !== 'all') {
      rows = rows.filter((r) => {
        if (typeFilter === 'Ride') return CYCLING_TYPES.includes(r.activity_type);
        if (typeFilter === 'Run') return r.activity_type === 'Run';
        return r.activity_type === typeFilter;
      });
    }
    if (distanceName) {
      const dn = distanceName.toLowerCase();
      rows = rows.filter((r) => String(r.distance_name || '').trim().toLowerCase() === dn);
    }
    if (distanceM && Number.isFinite(distanceM)) {
      rows = rows.filter((r) => Math.abs(Number(r.distance_m || 0) - distanceM) <= distanceM * 0.02);
    }

    const isLongCategory = distanceName && distanceName.includes('+');
    if (!isLongCategory) {
      rows.sort((a, b) => (Number(a.elapsed_time_s) || Infinity) - (Number(b.elapsed_time_s) || Infinity));
    } else {
      rows.sort((a, b) => (Number(b.distance_m) || 0) - (Number(a.distance_m) || 0));
    }

    const unique = [];
    const seenAct = new Set();
    for (const r of rows) {
      const key = String(r.activity_id || r.activity_id_norm || r.id || '');
      if (key && seenAct.has(key)) continue;
      if (key) seenAct.add(key);
      unique.push(r);
      if (unique.length >= limit) break;
    }

    return json({
      items: unique.map((r) => ({
        id: r.id,
        activity_type: r.activity_type,
        distance_name: r.distance_name,
        elapsed_time_s: r.elapsed_time_s,
        activity_id: r.activity_id,
        activity_name: r.activity_name,
        activity_date: r.activity_date,
        distance_m: r.distance_m,
        pace_s_per_km: r.pace_s_per_km,
        speed_kph: r.speed_kph,
        rank: r.rank,
      })),
      count: unique.length,
    });
  } catch (error) {
    console.error('getBestEfforts error:', error);
    return json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});