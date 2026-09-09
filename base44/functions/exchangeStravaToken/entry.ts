import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { code, state } = await req.json();

    if (!state) {
      throw new Error("State parameter is missing from the request.");
    }
    const { userId, appOrigin } = JSON.parse(state);
    if (!userId || !appOrigin) {
      throw new Error("Invalid state: missing userId or appOrigin.");
    }

    if (!code) {
      return Response.json({ ok: false, error: 'Missing authorization code' }, { status: 400 });
    }

    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new Error("Server configuration error: missing Strava credentials.");
    }
    
    // The redirect_uri must exactly match the one used in the initial auth request.
    const redirectUri = `${appOrigin}/StravaCallback`;

    console.log('--- Exchanging Token (POST) ---');
    console.log('Using redirect_uri for validation:', redirectUri);

    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error('Token exchange with Strava failed. Response:', tokenData);
      throw new Error(tokenData.message || 'Token exchange failed with Strava.');
    }

    const updateData = {
      strava_access_token: tokenData.access_token,
      strava_refresh_token: tokenData.refresh_token,
      strava_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
      strava_athlete_id: Number(tokenData.athlete?.id),
    };

    await base44.asServiceRole.entities.User.update(userId, updateData);
    
    console.log('Successfully updated user record.');
    return Response.json({ ok: true });
  } catch (e) {
    console.error('FATAL: exchangeStravaToken error:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
});