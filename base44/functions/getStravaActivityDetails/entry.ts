import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

// Helper to refresh token, same as in other functions
async function refreshStravaToken(refreshToken, userId, base44) {
  const clientId = Deno.env.get('STRAVA_CLIENT_ID');
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error('Failed to refresh token');
  const tokenData = await response.json();
  await base44.entities.User.update(userId, {
    strava_access_token: tokenData.access_token,
    strava_refresh_token: tokenData.refresh_token,
    strava_expires_at: new Date(tokenData.expires_at * 1000).toISOString()
  });
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { activityId } = await req.json();
    if (!activityId) return Response.json({ error: 'activityId is required' }, { status: 400 });

    console.log('=== getStravaActivityDetails START ===');
    console.log('Activity ID:', activityId);
    console.log('User:', user.email);

    const userRecord = await base44.entities.User.get(user.id);
    if (!userRecord.strava_access_token) {
      return Response.json({ error: 'Strava not connected' }, { status: 400 });
    }

    let accessToken = userRecord.strava_access_token;
    if (new Date(userRecord.strava_expires_at) <= new Date()) {
      console.log('Token expired, refreshing...');
      accessToken = await refreshStravaToken(userRecord.strava_refresh_token, user.id, base44);
    }

    const headers = { 'Authorization': `Bearer ${accessToken}` };
    const streamKeys = ['time', 'distance', 'latlng', 'altitude', 'heartrate', 'velocity_smooth', 'cadence', 'watts', 'temp'];

    console.log('Fetching activity details and streams from Strava...');

    // Fetch both activity details and streams concurrently
    const [activityRes, streamsRes] = await Promise.all([
      fetch(`https://www.strava.com/api/v3/activities/${activityId}`, { headers }),
      fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${streamKeys.join(',')}`, { headers })
    ]);

    console.log('Activity response status:', activityRes.status);
    console.log('Streams response status:', streamsRes.status);

    // Check for rate limit
    if (activityRes.status === 429 || streamsRes.status === 429) {
      console.error('⚠️ STRAVA API RATE LIMIT HIT');
      return Response.json({ 
        error: '🚫 Strava API Rate Limit: Strava is reporting that the API rate limit has been exceeded. Please wait 15 minutes and try again.',
        isRateLimit: true
      }, { status: 429 });
    }

    if (!activityRes.ok) {
      const errorText = await activityRes.text();
      console.error('Strava API Error (activity):', activityRes.status, errorText);
      
      // Try to parse error for more details
      try {
        const errorJson = JSON.parse(errorText);
        return Response.json({ 
          error: `Strava Error: ${errorJson.message || 'Failed to fetch activity details'}`,
          stravaError: errorJson
        }, { status: activityRes.status });
      } catch (e) {
        return Response.json({ 
          error: `Strava returned error ${activityRes.status}: ${errorText}` 
        }, { status: activityRes.status });
      }
    }

    if (!streamsRes.ok) {
      const errorText = await streamsRes.text();
      console.error('Strava API Error (streams):', streamsRes.status, errorText);
      
      // Streams are optional - we can still return activity data without them
      console.log('Returning activity data without streams');
      const activityData = await activityRes.json();
      return Response.json({
        activity: activityData,
        streams: [],
        streamsUnavailable: true,
        streamsError: `Strava streams error: ${streamsRes.status}`
      });
    }

    const activityData = await activityRes.json();
    const streamsData = await streamsRes.json();

    console.log('✓ Successfully fetched activity and streams');

    // Strava reports running cadence as per-foot (half total spm). Double it for runs.
    const isRunning = activityData.type === 'Run';
    if (isRunning && activityData.average_cadence) {
      activityData.average_cadence = activityData.average_cadence * 2;
    }

    return Response.json({
      activity: activityData,
      streams: streamsData
    });

  } catch (error) {
    console.error('getStravaActivityDetails error:', error);
    return Response.json({ 
      error: error.message || 'Unknown error',
      details: error.stack 
    }, { status: 500 });
  }
});