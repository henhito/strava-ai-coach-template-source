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
function typeMatches(aType, bType) {
  const isCycling = (t) => CYCLING_TYPES.includes(t);
  if (isCycling(aType) && isCycling(bType)) return true;
  return aType === bType;
}
function decodePolyline(str, precision = 5) {
  if (!str || typeof str !== 'string') return null;
  let index = 0, lat = 0, lng = 0;
  const coordinates = [];
  const factor = Math.pow(10, precision);
  while (index < str.length) {
    let result = 1, shift = 0, b;
    do { b = str.charCodeAt(index++) - 63 - 1; result += b << shift; shift += 5; } while (b >= 0x1f);
    lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
    result = 1; shift = 0;
    do { b = str.charCodeAt(index++) - 63 - 1; result += b << shift; shift += 5; } while (b >= 0x1f);
    lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function routeOverlap(pointsA, pointsB, thresholdM = 50) {
  if (!pointsA?.length || !pointsB?.length) return 0;
  const step = Math.max(1, Math.floor(pointsA.length / 60));
  let matched = 0, total = 0;
  for (let i = 0; i < pointsA.length; i += step) {
    const [la, ln] = pointsA[i];
    let minD = Infinity;
    for (const p of pointsB) {
      const d = haversine(la, ln, p[0], p[1]);
      if (d < minD) { minD = d; if (minD < thresholdM) break; }
    }
    if (minD < thresholdM) matched++;
    total++;
  }
  return total > 0 ? matched / total : 0;
}
function getPolyline(activity) {
  const raw = activity?.raw_data && typeof activity.raw_data === 'object' ? activity.raw_data : {};
  const poly = raw?.map?.summary_polyline;
  if (!poly) return null;
  return decodePolyline(poly) || null;
}
function getStartLatLng(activity) {
  const raw = activity?.raw_data && typeof activity.raw_data === 'object' ? activity.raw_data : {};
  if (Array.isArray(raw.start_latlng) && raw.start_latlng.length === 2) return raw.start_latlng;
  const poly = getPolyline(activity);
  return poly && poly.length > 0 ? poly[0] : null;
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
    const limit = Math.max(1, Math.min(50, Number(body.limit) || 10));
    if (!activityId) return json({ error: 'activityId is required' }, { status: 400 });

    const current = await resolveActivity(base44, activityId);
    if (!current) return json({ error: 'Activity not found' }, { status: 404 });

    const userRecord = await base44.asServiceRole.entities.User.get(user.id);
    const athleteId = userRecord?.strava_athlete_id;
    if (athleteId && current.athlete_id && Number(current.athlete_id) !== Number(athleteId)) {
      return json({ error: 'Activity does not belong to the current user' }, { status: 403 });
    }

    const currentPoly = getPolyline(current);
    const currentStart = getStartLatLng(current);
    const currentDistance = Number(current.distance_m || 0);
    const currentElevation = Number(current.total_elevation_gain_m || 0);

    const minDist = currentDistance * 0.7;
    const maxDist = currentDistance * 1.3;
    const filterQuery = { distance_m: { $gte: minDist, $lte: maxDist } };
    if (athleteId) filterQuery.athlete_id = athleteId;
    const candidatesRes = await base44.entities.Activity.filter(filterQuery, '-start_date', 300);
    const candidates = normalizeArray(candidatesRes).filter((a) =>
      a.id !== current.id && String(a.strava_id) !== String(current.strava_id) && typeMatches(a.type, current.type)
    );

    const results = candidates.map((a) => {
      const aStart = getStartLatLng(a);
      const aPoly = getPolyline(a);
      let startDist = null;
      if (currentStart && aStart) startDist = haversine(currentStart[0], currentStart[1], aStart[0], aStart[1]);
      const overlap = currentPoly && aPoly ? routeOverlap(currentPoly, aPoly) : 0;

      let route_match_type = 'distance_elevation_only';
      if (overlap >= 0.85 && (startDist == null || startDist < 100)) route_match_type = 'exact_route';
      else if (overlap >= 0.5) route_match_type = 'substantial_overlap';
      else if (startDist != null && startDist < 500) route_match_type = 'same_start_area';

      const distSim = currentDistance > 0 ? 1 - Math.min(1, Math.abs(Number(a.distance_m || 0) - currentDistance) / currentDistance) : 0;
      const elevSim = currentElevation > 0 ? 1 - Math.min(1, Math.abs(Number(a.total_elevation_gain_m || 0) - currentElevation) / currentElevation) : 1;
      const overlapSim = currentPoly && aPoly ? overlap : 0;
      const startSim = startDist != null ? Math.max(0, 1 - startDist / 1000) : 0;
      const similarity_score = Number((0.4 * overlapSim + 0.25 * startSim + 0.2 * distSim + 0.15 * elevSim).toFixed(3));

      return {
        activity_id: a.id,
        strava_id: a.strava_id,
        name: a.name,
        type: a.type,
        start_date: a.start_date,
        distance_m: a.distance_m,
        total_elevation_gain_m: a.total_elevation_gain_m,
        start_point_distance_m: startDist != null ? Number(startDist.toFixed(1)) : null,
        route_overlap_pct: currentPoly && aPoly ? Number((overlap * 100).toFixed(1)) : null,
        route_match_type,
        distance_similarity: Number(distSim.toFixed(3)),
        elevation_similarity: Number(elevSim.toFixed(3)),
        similarity_score,
      };
    });

    results.sort((a, b) => b.similarity_score - a.similarity_score);

    return json({
      activity_id: current.id,
      route_geometry_available: !!currentPoly,
      items: results.slice(0, limit),
    });
  } catch (error) {
    console.error('findSimilarActivities error:', error);
    return json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});