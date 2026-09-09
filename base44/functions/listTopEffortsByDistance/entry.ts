import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/* ---------- utils ---------- */
function json(data, init = {}) {
  const h = new Headers(init.headers || {});
  if (!h.get('content-type')) h.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data, null, 2), { ...init, headers: h });
}
function norm(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp?.items) return resp.items;
  if (resp?.data) return resp.data;
  return [];
}
function lc(s) { return String(s || '').trim().toLowerCase(); }

const CYCLING_TYPES = [
  'Ride',
  'VirtualRide',
  'GravelRide',
  'MountainBikeRide',
  'EBikeRide',
  'EMountainBikeRide',
  'Velomobile',
];

const RUNNING_TYPES = [
  'Run',
  'VirtualRun',
  'TrailRun',
];

const LONG_RIDE_DISTANCE_M = 180000;

/* slug -> canonical DB name */
const SLUG_TO_CANON = {
  '400m': '400m',
  '800m': '800m',

  '1k': '1k',
  '5k': '5k',
  '10k': '10k',
  '15k': '15k',
  '20k': '20k',
  '30k': '30k',
  '40k': '40k',
  '50k': '50k',
  '100k': '100k',

  '0_5mi': '1/2 mile',
  '1mi': '1 mile',
  '2mi': '2 mile',
  '5mi': '5 mile',
  '10mi': '10 mile',

  'half': 'half marathon',
  'marathon': 'marathon',

  '80k': '80k',
  '90k': '90k',
  '50mi': '50 mile',
  '100mi': '100 mile',
  '160k': '100 mile',
  '180k': '180k',
  '180kplus': '180k+',
  '180k+': '180k+',
  '100kplus': '100k+',
  '100k+': '100k+'
};

/* distance name variants -> canonical DB name */
function nameToCanonical(nameRaw) {
  const n = lc(nameRaw);
  const map = {
    '1/2 mile':'1/2 mile','0.5 mi':'1/2 mile','0.5mi':'1/2 mile',
    '1 k':'1k','1km':'1k','1 km':'1k','1000m':'1k','1,000m':'1k',
    '1 mi':'1 mile','1mi':'1 mile',
    '2 mile':'2 mile','2 miles':'2 mile','2 mi':'2 mile','2mi':'2 mile',
    '5 k':'5k','5km':'5k','5 km':'5k',
    '5 mile':'5 mile','5 miles':'5 mile','5 mi':'5 mile','5mi':'5 mile',
    '10 k':'10k','10km':'10k','10 km':'10k',
    '15 k':'15k','15km':'15k','15 km':'15k',
    '10 mile':'10 mile','10 miles':'10 mile','10 mi':'10 mile','10mi':'10 mile',
    '20 k':'20k','20km':'20k','20 km':'20k',
    '30 k':'30k','30km':'30k','30 km':'30k',
    'half':'half marathon','half-marathon':'half marathon','half marathon':'half marathon',
    'marathon':'marathon',
    '40 k':'40k','40km':'40k','40 km':'40k',
    '50 k':'50k','50km':'50k','50 km':'50k',
    '80 k':'80k','80km':'80k','80 km':'80k',
    '90 k':'90k','90km':'90k','90 km':'90k',
    '100 k':'100k','100km':'100k','100 km':'100k',
    '50 mile':'50 mile','50 miles':'50 mile','50 mi':'50 mile','50mi':'50 mile',
    '100 mile':'100 mile','100 miles':'100 mile','100 mi':'100 mile','100mi':'100 mile',
    '160 k':'100 mile','160km':'100 mile','160 km':'100 mile',
    '180 k':'180k','180km':'180k','180 km':'180k',
    '180k+':'180k+','180 k+':'180k+','180km+':'180k+','180 km+':'180k+',
    '180k plus':'180k+','180 km plus':'180k+',
    '100k+':'100k+','100 k+':'100k+','100km+':'100k+','100 km+':'100k+',
    '100k plus':'100k+','100 km plus':'100k+'
  };
  if (map[n]) return map[n];
  // If it already matches canonical DB names, pass through:
  if (SLUG_TO_CANON[n]) return SLUG_TO_CANON[n];
  const passthroughs = new Set(Object.values(SLUG_TO_CANON));
  if (passthroughs.has(n)) return n;
  return null;
}

/* meters <-> slug helpers with tolerance */
const CANON_FROM_METERS = [
  ['400m', 400], ['800m', 800], ['1k', 1000], ['0_5mi', 804.7],
  ['1mi', 1609], ['2mi', 3219], ['5k', 5000], ['5mi', 8047], ['10k', 10000],
  ['15k', 15000], ['10mi', 16093], ['20k', 20000], ['30k', 30000],
  ['half', 21097], ['marathon', 42195], ['40k', 40000], ['50k', 50000],
  ['80k', 80000], ['90k', 90000], ['100k', 100000], ['50mi', 80467],
  ['100mi', 160934], ['180k', 180000],
];

function slugFromMeters(m, tolPct = 2.0) {
  const tol = Number(tolPct) / 100;
  for (const [slug, meters] of CANON_FROM_METERS) {
    if (Math.abs(m - meters) <= meters * tol) return slug;
  }
  return null;
}

function rowDistanceMeters(row) {
  const meters = Number(row?.distance_m ?? row?.distance_meters);
  return Number.isFinite(meters) ? meters : 0;
}

function isLongRideRow(row) {
  return CYCLING_TYPES.includes(row?.activity_type) && rowDistanceMeters(row) > LONG_RIDE_DISTANCE_M;
}

function rowDistanceCanonical(row, tolPct) {
  const fromNameFirst = nameToCanonical(row?.distance_name);
  if (fromNameFirst === '100k+' || fromNameFirst === '180k+') return fromNameFirst;

  if (isLongRideRow(row)) return '180k+';

  const fromCanonField = nameToCanonical(row?.distance_name_canon);
  if (fromCanonField) return fromCanonField;

  const fromName = nameToCanonical(row?.distance_name);
  if (fromName) return fromName;

  const meters = rowDistanceMeters(row);
  if (meters > 0) {
    const slug = slugFromMeters(meters, tolPct);
    if (slug) return SLUG_TO_CANON[slug];
  }

  return null;
}

function activityTypeMatches(rowType, requestedType) {
  if (requestedType === 'all') return true;
  if (requestedType === 'Run') return RUNNING_TYPES.includes(rowType);
  if (requestedType === 'Ride') return CYCLING_TYPES.includes(rowType);
  return rowType === requestedType;
}

function activityKey(row) {
  return String(row?.activity_id_norm || row?.activity_id || row?.strava_id || row?.id || '').trim();
}

function rowVisibleToUser(row, user) {
  const createdBy = String(row?.created_by || '').trim();
  const createdById = String(row?.created_by_id || '').trim();

  if (createdBy === user.email || createdBy === user.id) return true;
  if (createdById === user.email || createdById === user.id) return true;

  // Service-role-created rows (created_by is null/empty, created_by_id starts
  // with "service_") were made on behalf of the user. Treat them as visible.
  if (!createdBy && createdById.startsWith('service_')) return true;

  // Keep truly orphaned rows visible for old imports.
  return !createdBy && !createdById;
}

/* ---------- handler ---------- */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

    // Accept query or JSON body
    const url = new URL(req.url);
    let body = {};
    try { body = await req.json(); } catch { /* ok */ }

    // Inputs (very forgiving)
    const slugParam   = lc(url.searchParams.get('distance') ?? body.distance);
    const metersParam = Number(url.searchParams.get('distance_m') ?? body.distance_m);
    const nameParam   = lc(url.searchParams.get('distance_name') ?? body.distance_name);
    const tolPct      = Number(url.searchParams.get('tolerance_pct') ?? body.tolerance_pct ?? 2.0);
    const n           = Math.max(1, Math.min(20, Number(url.searchParams.get('limit') ?? body.limit ?? 5)));
    const type        = String(url.searchParams.get('type') ?? body.type ?? 'Run'); // 'Run' | 'Ride' | 'all'

    // Resolve to a canonical DB name
    let slug = slugParam && slugParam !== 'null' ? slugParam : '';
    let canonicalDistance = null;

    if (slug && SLUG_TO_CANON[slug]) {
      canonicalDistance = SLUG_TO_CANON[slug];
    }

    if (!canonicalDistance && Number.isFinite(metersParam)) {
      const s = slugFromMeters(metersParam, tolPct);
      if (s) canonicalDistance = SLUG_TO_CANON[s];
      slug = slug || s || '';
    }

    if (!canonicalDistance && nameParam) {
      const c = nameToCanonical(nameParam);
      if (c) canonicalDistance = c;
    }

    if (!canonicalDistance) {
      return json({
        success: false,
        error: 'Missing or unrecognized distance',
        debug: {
          received: { distance: slugParam, distance_m: url.searchParams.get('distance_m') ?? body.distance_m, distance_name: nameParam },
          hint: 'Provide one of: distance=10k | distance_m=10000 | distance_name=10K/10k/10 km/10000m',
          supported_slugs: Object.keys(SLUG_TO_CANON)
        }
      }, { status: 400 });
    }

    // Use user-scoped client so RLS handles ownership filtering automatically.
    // Also fetch via service role to catch orphaned/service-created records.
    const userBE = base44.entities.BestEffort;
    const serviceBE = base44.asServiceRole.entities.BestEffort;

    const [userRaw, serviceRaw] = await Promise.all([
      userBE.filter({}, '-activity_date', 10000),
      serviceBE.filter({}, '-activity_date', 10000),
    ]);

    const userRows = norm(userRaw);
    const serviceRows = norm(serviceRaw);

    // Merge: user-scoped rows first, then service rows not already present
    const seenIds = new Set(userRows.map(r => r.id));
    const merged = [...userRows];
    for (const r of serviceRows) {
      if (!seenIds.has(r.id)) {
        // Only include service-created or orphaned rows
        const cb = String(r?.created_by || '').trim();
        const cbId = String(r?.created_by_id || '').trim();
        if (!cb && (cbId.startsWith('service_') || !cbId)) {
          merged.push(r);
          seenIds.add(r.id);
        }
      }
    }

    let rows = merged;
    const totalLoaded = rows.length;
    const afterScope = rows.length;
    rows = rows.filter(r => {
      const distanceName = String(r?.distance_name || '');
      if (distanceName.startsWith('__import_complete')) return false;
      if (!activityTypeMatches(r?.activity_type, type)) return false;
      if ((Number(r?.elapsed_time_s) || 0) <= 0) return false;
      return rowDistanceCanonical(r, tolPct) === canonicalDistance;
    });
    const afterMatch = rows.length;

    // Sort standard efforts by fastest time. Sort 180k+ by longest ride distance.
    if (canonicalDistance === '180k+' || canonicalDistance === '100k+') {
      rows.sort((a, b) => rowDistanceMeters(b) - rowDistanceMeters(a));
    } else {
      rows.sort((a, b) => (Number(a?.elapsed_time_s) || Infinity) - (Number(b?.elapsed_time_s) || Infinity));
    }

    const uniqueRows = [];
    const seenActivities = new Set();
    for (const row of rows) {
      const key = activityKey(row);
      if (key && seenActivities.has(key)) continue;
      if (key) seenActivities.add(key);
      uniqueRows.push(row);
      if (uniqueRows.length >= n) break;
    }
    const top = uniqueRows;

    // Shape to what the Detail page expects
    const items = top.map(r => ({
      activity_id: r.activity_id ?? null,
      activity_name: r.activity_name ?? 'Activity',
      name: r.activity_name ?? 'Activity',
      activity_date: r.activity_date ?? null,
      start_date: r.activity_date ?? null,
      elapsed_time_s: Number(r.elapsed_time_s) || null,
      pace_s_per_km: Number(r.pace_s_per_km) || null,
      speed_kph: Number(r.speed_kph) || null,
      distance_m: rowDistanceMeters(r) || null,
      distance_name: r.distance_name ?? canonicalDistance,
      activity_type: r.activity_type ?? null
    }));

    return json({
      success: true,
      distance_slug: slug || null,
      distance_name: canonicalDistance,
      type,
      limit: n,
      total_loaded: totalLoaded,
      total_after_scope: afterScope,
      total_considered: afterMatch,
      unique_considered: uniqueRows.length,
      items
    });
  } catch (e) {
    return json({ success: false, error: e?.message || 'listTopEffortsByDistance failed' }, { status: 200 });
  }
});