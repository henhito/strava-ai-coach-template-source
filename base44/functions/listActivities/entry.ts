import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRecord = await base44.entities.User.get(user.id);
    const athleteId = userRecord.strava_athlete_id;

    if (!athleteId) {
      return Response.json({ 
        error: 'No Strava athlete ID found. Please connect your Strava account first.' 
      }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    
    let limit = parseInt(body.limit) || 30;
    limit = Math.max(1, Math.min(100, limit));
    
    const offset = Math.max(0, parseInt(body.offset) || 0);
    const typeFilter = body.type || 'all';
    const searchQuery = (body.q || '').trim();
    const minDistanceM = body.min_distance_m;
    const maxDistanceM = body.max_distance_m;
    const minElevationM = body.min_elevation_gain_m;
    const maxElevationM = body.max_elevation_gain_m;
    const startDateFrom = body.start_date_from;
    const startDateTo = body.start_date_to;

    console.log('=== LIST ACTIVITIES ===');
    console.log('User:', user.email);
    console.log('Athlete ID:', athleteId);
    console.log('Params:', { limit, offset, type: typeFilter, q: searchQuery });

    const filterQuery = { athlete_id: athleteId };
    
    const CYCLING_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'];
    if (typeFilter !== 'all') {
      if (typeFilter === 'Cycling') {
        filterQuery.type = { $in: CYCLING_TYPES };
      } else {
        filterQuery.type = typeFilter;
      }
    }

    const distanceFilter = {};
    if (minDistanceM) distanceFilter['$gte'] = minDistanceM;
    if (maxDistanceM) distanceFilter['$lte'] = maxDistanceM;
    if (Object.keys(distanceFilter).length > 0) {
      filterQuery.distance_m = distanceFilter;
    }

    const elevationFilter = {};
    if (minElevationM) elevationFilter['$gte'] = minElevationM;
    if (maxElevationM) elevationFilter['$lte'] = maxElevationM;
    if (Object.keys(elevationFilter).length > 0) {
      filterQuery.total_elevation_gain_m = elevationFilter;
    }

    const dateFilter = {};
    if (startDateFrom) dateFilter['$gte'] = new Date(startDateFrom).toISOString();
    if (startDateTo) {
      // Include the entire end day by pushing to end of day
      const to = new Date(startDateTo);
      to.setUTCHours(23, 59, 59, 999);
      dateFilter['$lte'] = to.toISOString();
    }
    if (Object.keys(dateFilter).length > 0) {
      filterQuery.start_date = dateFilter;
    }

    if (searchQuery) {
      const keywords = searchQuery.split(' ').filter(word => word.length > 0);
      if (keywords.length > 0) {
        const regexString = keywords
          .map(keyword => '(?=.*' + keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + ')')
          .join('');
        filterQuery.name = { $regex: regexString, $options: 'i' };
      }
    }

    let activities = await base44.entities.Activity.filter(
      filterQuery,
      '-start_date',
      limit,
      offset
    );

    if (!Array.isArray(activities)) {
      if (activities?.data) activities = activities.data;
      else if (activities?.items) activities = activities.items;
      else activities = [];
    }

    console.log('Fetched ' + activities.length + ' activities from database');

    const projectedItems = activities.map(activity => ({
      id: activity.id,
      strava_id: activity.strava_id,
      athlete_id: activity.athlete_id,
      name: activity.name,
      type: activity.type,
      start_date: activity.start_date,
      distance_m: activity.distance_m,
      moving_time_s: activity.moving_time_s,
      elapsed_time_s: activity.elapsed_time_s,
      total_elevation_gain_m: activity.total_elevation_gain_m,
      average_speed_mps: activity.average_speed_mps,
      max_speed_mps: activity.max_speed_mps,
      average_heartrate: activity.average_heartrate,
      max_heartrate: activity.max_heartrate,
      average_cadence: activity.average_cadence
        ? (activity.type === 'Run' ? activity.average_cadence * 2 : activity.average_cadence)
        : null,
      average_watts: activity.average_watts,
      suffer_score: activity.suffer_score,
      kudos_count: activity.kudos_count,
      source_device_brand: activity.source_device_brand,
      elite_coach_comment: activity.elite_coach_comment
    }));

    const hasMore = projectedItems.length === limit;
    const nextOffset = hasMore ? offset + limit : null;

    console.log('Returning ' + projectedItems.length + ' items');
    console.log('Next offset: ' + nextOffset + ', Has more: ' + hasMore);

    return Response.json({
      items: projectedItems,
      limit: limit,
      nextOffset: nextOffset,
      hasMore: hasMore
    });

  } catch (error) {
    console.error('listActivities error:', error);
    return Response.json({ 
      error: error.message || 'Unknown error' 
    }, { status: 500 });
  }
});