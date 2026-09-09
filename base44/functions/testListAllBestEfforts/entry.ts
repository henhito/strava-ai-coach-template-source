import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const normalizeArray = (resp) => {
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp.items)) return resp.items;
  if (resp && Array.isArray(resp.data)) return resp.data;
  return [];
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resp = await base44.asServiceRole.entities.BestEffort.list('-created_date', 5000);
    const rows = normalizeArray(resp);

    const ownerCounts = new Map();
    let withOwner = 0;
    let withoutOwner = 0;

    for (const row of rows) {
      const owner = row.created_by || row.created_by_id || null;
      if (row.created_by) withOwner += 1;
      else withoutOwner += 1;

      const key = owner || '(no owner)';
      ownerCounts.set(key, (ownerCounts.get(key) || 0) + 1);
    }

    const owners = Array.from(ownerCounts.entries())
      .map(([email, count]) => ({ email, count }))
      .sort((a, b) => b.count - a.count);

    return Response.json({
      success: true,
      summary: {
        total: rows.length,
        withOwner,
        withoutOwner,
        owners,
      },
      current_user: user.email,
      samples: rows.slice(0, 10).map((row) => ({
        id: row.id,
        created_by: row.created_by || null,
        created_by_id: row.created_by_id || null,
        activity_type: row.activity_type || null,
        distance_name: row.distance_name || null,
        elapsed_time_s: row.elapsed_time_s || null,
        activity_name: row.activity_name || null,
        activity_date: row.activity_date || null,
      })),
    });
  } catch (error) {
    console.error('testListAllBestEfforts error:', error);
    return Response.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
});