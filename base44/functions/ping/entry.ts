// functions/testStravaStreams
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

function json(x, s = 200) {
  return new Response(JSON.stringify(x, null, 2), {
    status: s,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function refreshStravaToken(user, base44) {
  // You'll need your Strava app credentials
  const clientId = Deno.env.get('STRAVA_CLIENT_ID');
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error('STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET not set');
  }
  
  if (!user.strava_refresh_token) {
    throw new Error('No refresh token available');
  }
  
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: user.strava_refresh_token,
      grant_type: 'refresh_token'
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${errText}`);
  }
  
  const tokens = await response.json();
  
  // Update user with new tokens
  await base44.entities.User.update(user.id, {
    strava_access_token: tokens.access_token,
    strava_refresh_token: tokens.refresh_token,
    strava_token_expires_at: tokens.expires_at
  });
  
  return tokens.access_token;
}

Deno.serve(async (req) => {
  const debugLog = [];
  
  try {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

    debugLog.push('1. Creating base44 client');
    const base44 = createClientFromRequest(req);

    debugLog.push('2. Getting current user');
    const me = await base44.auth.me().catch((e) => {
      debugLog.push(`2a. auth.me() failed: ${e?.message || e}`);
      return null;
    });
    
    if (!me) return json({ error: 'unauthorized', debug: debugLog }, 401);
    debugLog.push(`3. User authenticated: ${me.email}`);

    debugLog.push('4. Getting full user record');
    let user;
    try {
      user = await base44.entities.User.get(me.id);
      debugLog.push(`5. User record retrieved`);
      debugLog.push(`5a. has access_token: ${!!user?.strava_access_token}`);
      debugLog.push(`5b. has refresh_token: ${!!user?.strava_refresh_token}`);
      debugLog.push(`5c. token_expires_at: ${user?.strava_token_expires_at}`);
    } catch (e) {
      debugLog.push(`4a. User.get failed: ${e?.message || e}`);
      return json({ error: 'Failed to get user', debug: debugLog }, 500);
    }

    if (!user?.strava_access_token && !user?.strava_refresh_token) {
      return json({ 
        error: 'No Strava tokens found', 
        debug: debugLog 
      }, 400);
    }

    // Check if token is expired and refresh if needed
    let accessToken = user.strava_access_token;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = user.strava_token_expires_at || 0;
    
    debugLog.push(`6. Token check: now=${now}, expires_at=${expiresAt}, expired=${now >= expiresAt}`);
    
    if (now >= expiresAt || !accessToken) {
      debugLog.push('7. Token expired, refreshing...');
      try {
        accessToken = await refreshStravaToken(user, base44);
        debugLog.push('8. Token refreshed successfully');
      } catch (e) {
        debugLog.push(`7a. Token refresh failed: ${e?.message || e}`);
        return json({ 
          error: 'Failed to refresh Strava token', 
          detail: e?.message,
          debug: debugLog 
        }, 400);
      }
    }

    // Fetch activities from Strava
    debugLog.push('9. Fetching activities from Strava API');
    
    const stravaActivitiesUrl = 'https://www.strava.com/api/v3/athlete/activities?per_page=30';
    const activitiesResponse = await fetch(stravaActivitiesUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    debugLog.push(`10. Strava activities response: ${activitiesResponse.status}`);
    
    if (!activitiesResponse.ok) {
      const errText = await activitiesResponse.text();
      return json({
        error: 'Strava API error fetching activities',
        status: activitiesResponse.status,
        response: errText.slice(0, 500),
        debug: debugLog
      }, 400);
    }
    
    const stravaActivities = await activitiesResponse.json();
    debugLog.push(`11. Got ${stravaActivities.length} activities from Strava`);
    
    // Show activity types available
    const typeCounts = {};
    for (const a of stravaActivities) {
      typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    }
    debugLog.push(`12. Activity types: ${JSON.stringify(typeCounts)}`);
    
    // Find a ride (or any activity if no rides)
    let testActivity = stravaActivities.find(a => a.type === 'Ride');
    
    if (!testActivity) {
      debugLog.push('13. No Rides found, using first activity');
      testActivity = stravaActivities[0];
    }
    
    if (!testActivity) {
      return json({
        error: 'No activities found in Strava',
        debug: debugLog
      }, 404);
    }
    
    debugLog.push(`14. Test activity: ${testActivity.id} - ${testActivity.name} (${testActivity.type})`);
    
    // Fetch streams for this activity
    const streamTypes = 'time,distance,watts,velocity_smooth,heartrate,cadence,altitude';
    const stravaUrl = `https://www.strava.com/api/v3/activities/${testActivity.id}/streams?keys=${streamTypes}&key_by_type=true`;
    
    debugLog.push('15. Fetching streams');
    
    const streamsResponse = await fetch(stravaUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    debugLog.push(`16. Streams response: ${streamsResponse.status}`);
    
    if (!streamsResponse.ok) {
      const errText = await streamsResponse.text();
      return json({
        error: 'Strava streams API error',
        status: streamsResponse.status,
        response: errText.slice(0, 500),
        activity: {
          id: testActivity.id,
          name: testActivity.name,
          type: testActivity.type
        },
        debug: debugLog
      }, 400);
    }
    
    const streamsData = await streamsResponse.json();
    debugLog.push(`17. Streams received: ${Object.keys(streamsData).join(', ')}`);
    
    // Build summary
    const summary = {};
    for (const [key, stream] of Object.entries(streamsData)) {
      summary[key] = {
        data_points: stream.data?.length || 0,
        sample: stream.data?.slice(0, 10)
      };
    }
    
    return json({
      ok: true,
      activity: {
        strava_id: testActivity.id,
        name: testActivity.name,
        type: testActivity.type,
        distance: testActivity.distance,
        moving_time: testActivity.moving_time,
        average_watts: testActivity.average_watts,
        device_watts: testActivity.device_watts,
        has_power_meter: testActivity.device_watts === true
      },
      streams_available: Object.keys(streamsData),
      streams_summary: summary,
      debug: debugLog
    });

  } catch (e) {
    debugLog.push(`UNCAUGHT: ${e?.message || e}`);
    return json({ 
      error: 'Uncaught exception', 
      message: e?.message || String(e),
      stack: e?.stack,
      debug: debugLog 
    }, 500);
  }
});