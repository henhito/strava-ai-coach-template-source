import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    if (!clientId) {
      console.error('getStravaAuthUrl: Missing STRAVA_CLIENT_ID env var');
      return Response.json({ error: 'Missing STRAVA_CLIENT_ID env var' }, { status: 500 });
    }

    const origin = req.headers.get('origin');
    if (!origin) {
      console.error('FATAL: Could not determine origin from request headers.');
      return Response.json({ error: 'Could not determine app origin' }, { status: 500 });
    }
    
    // MODIFIED: Point to the new frontend page, not the backend function
    const redirectUri = `${origin}/StravaCallback`;

    const state = JSON.stringify({ userId: user.id, appOrigin: origin });
    
    console.log('--- Generating Strava Auth URL (Client-Side Callback) ---');
    console.log('Using Redirect URI:', redirectUri);
    console.log('Using State:', state);
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'force',
      scope: 'read,activity:read_all',
      state: state,
    });

    const authUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`;

    return Response.json({ authUrl });
  } catch (error) {
    console.error('getStravaAuthUrl error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});