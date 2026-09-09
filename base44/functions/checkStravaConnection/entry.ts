import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const me = await base44.auth.me().catch(() => null);
  if (!me) {
    return new Response(JSON.stringify({ isConnected: false, error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }
  const u = await base44.entities.User.get(me.id);
  return new Response(JSON.stringify({
    isConnected: Boolean(u?.strava_access_token && u?.strava_expires_at),
    athlete_id: u?.strava_athlete_id ?? null,
    expires_at: u?.strava_expires_at ?? null,
  }), { headers: { 'Content-Type': 'application/json' }});
});