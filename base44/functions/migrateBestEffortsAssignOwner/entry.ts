import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Distance to meters mapping
const DISTANCE_TO_METERS = {
  '400m': 400, '800m': 800, '1/2 mile': 805, '0.5 mi': 805,
  '1k': 1000, '1 mile': 1609, '1 mi': 1609,
  '2 mile': 3219, '2 mi': 3219,
  '5k': 5000, '5K': 5000,
  '10k': 10000, '10K': 10000,
  '15k': 15000, '15K': 15000,
  '10 mile': 16093, '10 mi': 16093,
  '20k': 20000, '20K': 20000,
  'half marathon': 21097, 'Half-Marathon': 21097, 'half-marathon': 21097,
  'marathon': 42195, 'Marathon': 42195,
  '30k': 30000, '30K': 30000,
  '40k': 40000, '40K': 40000,
  '50k': 50000, '50K': 50000,
  '100k': 100000, '100K': 100000,
  '50 mile': 80467, '50 mi': 80467,
  '100 mile': 160934, '100 mi': 160934
};

// Normalize distance name
const normalizeDistanceName = (name) => {
  const nameStr = String(name || '').trim();
  // Map variants to canonical form
  const canonicalMap = {
    '5K': '5k', '10K': '10k', '15K': '15k', '20K': '20k', '30K': '30k',
    '40K': '40k', '50K': '50k', '100K': '100k',
    'Half-Marathon': 'half marathon', 'half-marathon': 'half marathon',
    'Marathon': 'marathon',
    '1 mi': '1 mile', '2 mi': '2 mile', '10 mi': '10 mile',
    '50 mi': '50 mile', '100 mi': '100 mile',
    '0.5 mi': '1/2 mile'
  };
  return canonicalMap[nameStr] || nameStr.toLowerCase();
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('=== MIGRATE BEST EFFORTS - ASSIGN OWNER ===');
    
    // Get owner from query params, default to current user
    const url = new URL(req.url);
    const ownerEmail = url.searchParams.get('owner') || user.email;
    
    console.log('Owner email:', ownerEmail);
    console.log('Current user:', user.email);

    // Load all BestEffort rows (service role to see everything)
    console.log('Loading all BestEffort rows...');
    const allBests = await base44.asServiceRole.entities.BestEffort.list('-activity_date', 5000);
    const allArray = Array.isArray(allBests) ? allBests : (allBests?.items || allBests?.data || []);
    
    console.log(`Total rows: ${allArray.length}`);
    
    // Find rows that are not visible through normal user-scoped reads.
    const nullOwnerRows = allArray.filter(row => !row.created_by);
    console.log(`Rows with created_by IS NULL: ${nullOwnerRows.length}`);
    
    if (nullOwnerRows.length === 0) {
      return Response.json({
        success: true,
        message: 'No rows with created_by=null found. Migration not needed.',
        examined: allArray.length,
        replaced: 0,
        created: 0,
        deleted: 0,
        errors: 0
      });
    }

    // Process each null row
    let created = 0;
    let deleted = 0;
    let errors = 0;
    const samples = [];
    
    for (const oldRow of nullOwnerRows) {
      try {
        // Normalize distance name
        const normalizedName = normalizeDistanceName(oldRow.distance_name);
        
        // Backfill distance_m if missing
        let distanceM = oldRow.distance_m;
        if (!distanceM && oldRow.distance_name) {
          distanceM = DISTANCE_TO_METERS[oldRow.distance_name] || 
                      DISTANCE_TO_METERS[normalizedName];
        }
        
        // Backfill pace if missing
        let pacePerKm = oldRow.pace_s_per_km;
        if (!pacePerKm && oldRow.elapsed_time_s && distanceM) {
          pacePerKm = oldRow.elapsed_time_s / (distanceM / 1000);
        }
        
        const elapsedTime = Number(oldRow.elapsed_time_s || 0);
        const speedKph = oldRow.speed_kph ||
          (oldRow.activity_type === 'Ride' && distanceM && elapsedTime
            ? (Number(distanceM) / elapsedTime) * 3.6
            : null);

        // Create through user-scoped entity access so Base44 assigns the
        // authenticated user as the row owner instead of the service account.
        const newRow = {
          created_by: ownerEmail,
          source: oldRow.source || 'strava',
          activity_type: oldRow.activity_type,
          distance_name: normalizedName,
          elapsed_time_s: elapsedTime,
          activity_id: String(oldRow.activity_id || ''),
          activity_name: oldRow.activity_name,
          activity_date: oldRow.activity_date,
          distance_m: distanceM,
          pace_s_per_km: pacePerKm,
          speed_kph: speedKph,
          rank: Number.isFinite(Number(oldRow.rank)) ? Number(oldRow.rank) : 999,
          distance_name_canon: oldRow.distance_name_canon || normalizedName,
          activity_id_norm: oldRow.activity_id_norm || String(oldRow.activity_id || '')
        };
        
        await base44.entities.BestEffort.create(newRow);
        created++;
        
        // Delete old row
        await base44.asServiceRole.entities.BestEffort.delete(oldRow.id);
        deleted++;
        
        if (samples.length < 5) {
          samples.push({
            old_id: oldRow.id,
            distance: normalizedName,
            had_distance_m: !!oldRow.distance_m,
            had_pace: !!oldRow.pace_s_per_km,
            backfilled_distance_m: !oldRow.distance_m && !!distanceM,
            backfilled_pace: !oldRow.pace_s_per_km && !!pacePerKm
          });
        }
        
        console.log(`✓ Migrated: ${normalizedName} (${oldRow.activity_type})`);
        
      } catch (err) {
        errors++;
        console.error(`✗ Failed to migrate row ${oldRow.id}:`, err.message);
      }
    }

    console.log('=== MIGRATION COMPLETE ===');
    console.log(`Created: ${created}, Deleted: ${deleted}, Errors: ${errors}`);

    return Response.json({
      success: true,
      message: `Migrated ${created} best efforts to owner: ${ownerEmail}`,
      examined: allArray.length,
      replaced: nullOwnerRows.length,
      created: created,
      deleted: deleted,
      errors: errors,
      samples: samples
    });

  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({
      error: error.message || 'Migration failed',
      stack: error.stack
    }, { status: 500 });
  }
});
