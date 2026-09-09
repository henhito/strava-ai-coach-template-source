import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const BATCH_SIZE = 200;
const STRAVA_API_LIMIT_15_MIN = 90; // Stay safely below 100

async function refreshStravaToken(refreshToken, userId, base44) {
    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Strava credentials not configured or refresh token missing.');
    }

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

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[Enrichment] Token refresh failed:', errorText);
        throw new Error(`Strava token refresh failed. Please reconnect your account.`);
    }

    const tokenData = await response.json();
    await base44.asServiceRole.entities.User.update(userId, {
        strava_access_token: tokenData.access_token,
        strava_refresh_token: tokenData.refresh_token,
        strava_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
    });
    return tokenData.access_token;
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    let stateIdToCleanOnError = null;

    try {
        const user = await base44.auth.me();
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        // 1. Load or create enrichment state
        let state;
        const existingStates = await base44.asServiceRole.entities.StravaEnrichmentState.filter({ created_by: user.email });
        state = (Array.isArray(existingStates) && existingStates.length > 0) ? existingStates[0] : null;

        if (!state) {
            state = await base44.asServiceRole.entities.StravaEnrichmentState.create({ status: 'idle', created_by: user.email });
        }
        stateIdToCleanOnError = state.id;

        // 2. Check status and rate limits
        if (state.status === 'running') {
            return Response.json({ status: 'running', message: 'Enrichment is already in progress.' });
        }
        if (state.next_allowed_run_at && new Date(state.next_allowed_run_at) > new Date()) {
            return Response.json({ status: 'paused', message: 'Rate limit active.', next_allowed_run_at: state.next_allowed_run_at });
        }

        // 3. Get user's Strava token
        const userRecord = await base44.asServiceRole.entities.User.get(user.id);
        if (!userRecord.strava_access_token) {
            throw new Error('Strava account not connected.');
        }
        let accessToken = userRecord.strava_access_token;
        if (userRecord.strava_expires_at && new Date(userRecord.strava_expires_at) <= new Date()) {
            accessToken = await refreshStravaToken(userRecord.strava_refresh_token, user.id, base44);
        }
        
        // 4. Activity Selection Logic
        await base44.asServiceRole.entities.StravaEnrichmentState.update(state.id, { status: 'running', last_run_at: new Date().toISOString() });

        const ENRICHABLE_TYPES = ['Run', 'Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];

        // Recalculate total whenever starting fresh (idle or completed)
        if (state.status === 'idle' || state.status === 'completed') {
            let totalToProcess = 0;
            let skip = 0;
            while (skip < 50000) {
                const batch = await base44.asServiceRole.entities.Activity.filter({ created_by: user.email }, 'id', 500, skip);
                if (!batch || batch.length === 0) break;
                totalToProcess += batch.length;
                skip += batch.length;
                if (batch.length < 500) break;
            }
            await base44.asServiceRole.entities.StravaEnrichmentState.update(state.id, { total_activities_to_process: totalToProcess, processed_count: 0, last_activity_id_processed: null });
            state.total_activities_to_process = totalToProcess;
            state.processed_count = 0;
            state.last_activity_id_processed = null;
        }

        const query = { created_by: user.email };
        if (state.last_activity_id_processed) {
            query.id = { '$gt': state.last_activity_id_processed };
        }

        const activities = await base44.asServiceRole.entities.Activity.filter(query, 'id', BATCH_SIZE);

        if (!activities || activities.length === 0) {
            await base44.asServiceRole.entities.StravaEnrichmentState.update(state.id, { status: 'completed', processed_count: state.total_activities_to_process });
            return Response.json({ status: 'completed', processed_in_run: 0 });
        }

        let scannedThisRun = 0;
        let enrichedThisRun = 0;
        let rateLimitHit = false;
        let lastId = state.last_activity_id_processed;

        for (const activity of activities) {
            lastId = activity.id;

            // Check if this activity needs enrichment (no raw_data, or Run/Ride missing best_efforts)
            const needsEnrichment = !activity.raw_data ||
                (ENRICHABLE_TYPES.includes(activity.type) &&
                 (!activity.raw_data.best_efforts || !Array.isArray(activity.raw_data.best_efforts) || activity.raw_data.best_efforts.length === 0));

            if (needsEnrichment) {
                if (enrichedThisRun >= STRAVA_API_LIMIT_15_MIN) {
                    rateLimitHit = true; break;
                }

                const res = await fetch(`https://www.strava.com/api/v3/activities/${activity.strava_id}?include_all_efforts=true`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });

                if (res.status === 429) {
                    rateLimitHit = true; break;
                }

                if (res.ok) {
                    const fullData = await res.json();
                    await base44.asServiceRole.entities.Activity.update(activity.id, { raw_data: fullData });
                }
                enrichedThisRun++;
            }

            scannedThisRun++;
        }

        const newProcessedCount = (state.processed_count || 0) + scannedThisRun;
        const isFullyScanned = !rateLimitHit && activities.length < BATCH_SIZE;
        const finalStatus = rateLimitHit ? 'paused' : (isFullyScanned ? 'completed' : 'idle');
        const nextRun = rateLimitHit ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

        await base44.asServiceRole.entities.StravaEnrichmentState.update(state.id, {
            status: finalStatus,
            processed_count: isFullyScanned ? state.total_activities_to_process : newProcessedCount,
            last_activity_id_processed: lastId,
            rate_limit_hit_at: rateLimitHit ? new Date().toISOString() : null,
            next_allowed_run_at: nextRun,
        });

        return Response.json({
            status: finalStatus,
            processed_in_run: enrichedThisRun,
            scanned_in_run: scannedThisRun,
            total_processed: newProcessedCount,
            total_activities_to_process: state.total_activities_to_process,
            rate_limit_reached: rateLimitHit,
            next_allowed_run_at: nextRun,
        });

    } catch (error) {
        console.error('[Enrichment] Fatal Error:', error.stack);
        if (stateIdToCleanOnError) {
            try {
                await base44.asServiceRole.entities.StravaEnrichmentState.update(stateIdToCleanOnError, { status: 'idle' });
            } catch (cleanupError) {
                console.error('[Enrichment] Failed to reset state to idle after error:', cleanupError);
            }
        }
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});