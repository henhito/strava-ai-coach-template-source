import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activityId } = await req.json();
    if (!activityId) {
      return Response.json({ error: 'activityId is required' }, { status: 400 });
    }

    console.log('Generating Elite Coach comment for activity:', activityId);

    // Load the activity from database
    const activity = await base44.entities.Activity.get(activityId);
    if (!activity) {
      return Response.json({ error: 'Activity not found' }, { status: 404 });
    }

    // Get user's preferred units
    const userRecord = await base44.entities.User.get(user.id);
    const preferredUnits = userRecord.preferred_units || 'miles';
    const useMetric = preferredUnits === 'kilometers';

    // Format activity data for the agent
    const distanceUnit = useMetric ? 'km' : 'miles';
    const distance = useMetric 
      ? (activity.distance_m / 1000).toFixed(1)
      : (activity.distance_m * 0.000621371).toFixed(1);
    
    const movingTimeMin = Math.round(activity.moving_time_s / 60);
    
    // Format speed/pace based on activity type
    let speedInfo = '';
    if (activity.average_speed_mps > 0) {
      if (activity.type === 'Ride') {
        // For cycling, show speed in km/h or mph
        if (useMetric) {
          const kmPerHour = activity.average_speed_mps * 3.6;
          speedInfo = `Average Speed: ${kmPerHour.toFixed(1)} km/h`;
        } else {
          const milesPerHour = activity.average_speed_mps * 2.237;
          speedInfo = `Average Speed: ${milesPerHour.toFixed(1)} mph`;
        }
      } else {
        // For running, show pace
        if (useMetric) {
          const kmPerHour = activity.average_speed_mps * 3.6;
          const minutesPerKm = 60 / kmPerHour;
          const minutes = Math.floor(minutesPerKm);
          const seconds = Math.round((minutesPerKm % 1) * 60);
          speedInfo = `Pace: ${minutes}:${seconds.toString().padStart(2, '0')}/km`;
        } else {
          const milesPerHour = activity.average_speed_mps * 2.237;
          const minutesPerMile = 60 / milesPerHour;
          const minutes = Math.floor(minutesPerMile);
          const seconds = Math.round((minutesPerMile % 1) * 60);
          speedInfo = `Pace: ${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
        }
      }
    }

    // Build activity-specific prompt
    const isCycling = activity.type === 'Ride';
    const activityMetrics = `Activity: ${activity.name}
Type: ${activity.type}
Date: ${new Date(activity.start_date).toLocaleDateString()}
Distance: ${distance} ${distanceUnit}
Time: ${movingTimeMin} minutes
${speedInfo}
${activity.average_heartrate ? `Avg HR: ${Math.round(activity.average_heartrate)} bpm` : ''}
${activity.average_watts ? `Avg Power: ${Math.round(activity.average_watts)}W` : ''}
${activity.average_cadence ? `Avg Cadence: ${Math.round(isCycling ? activity.average_cadence : activity.average_cadence * 2)} ${isCycling ? 'rpm' : 'spm (total steps per minute)'}` : ''}
${activity.total_elevation_gain_m ? `Elevation: ${Math.round(activity.total_elevation_gain_m)}m` : ''}
${activity.suffer_score ? `Effort Score: ${activity.suffer_score}` : ''}`;

    const prompt = isCycling
      ? `Provide a brief 2-3 sentence cycling-focused coaching comment for this ride. Focus on cycling-specific metrics like power, cadence, speed, and elevation. Be encouraging but specific about cycling performance.

${activityMetrics}

Consider: power output, cadence efficiency (ideal 80-100 rpm for cycling), climbing performance, speed consistency. Keep it conversational and actionable for a cyclist.`
      : `Provide a brief 2-3 sentence coaching comment for this workout. Be encouraging but specific. Use ${distanceUnit} for distances and minutes per ${distanceUnit.slice(0, -1)} for pace.

${activityMetrics}

IMPORTANT cadence guidance for running: optimal running cadence is 170-180 spm (total steps per minute). Below 170 spm is considered low and inefficient — the runner should work on increasing turnover. Above 180 spm is excellent. Do NOT praise cadence below 170 spm as "good" or "excellent".

Keep it conversational and actionable.`;

    // Get response from LLM using the InvokeLLM integration
    const comment = await base44.integrations.Core.InvokeLLM({
      prompt: prompt
    });

    // Save the comment to the activity
    await base44.entities.Activity.update(activityId, {
      elite_coach_comment: comment
    });

    console.log('Elite Coach comment generated and saved');

    return Response.json({
      success: true,
      comment: comment
    });

  } catch (error) {
    console.error('generateActivityComment error:', error);
    return Response.json({ 
      error: error.message || 'Unknown error' 
    }, { status: 500 });
  }
});