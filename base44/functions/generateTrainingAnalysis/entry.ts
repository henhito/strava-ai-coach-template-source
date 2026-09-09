import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔍 Generating automatic training analysis for user:', user.email);

    // Load user record to check connection and get athlete_id
    const userRecord = await base44.entities.User.get(user.id);
    
    if (!userRecord.strava_access_token || !userRecord.strava_athlete_id) {
      return Response.json({ 
        error: 'Strava not connected',
        shouldConnect: true 
      }, { status: 400 });
    }

    // Load last 28 days of activities for comprehensive analysis
    const twentyEightDaysAgo = new Date();
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
    
    console.log('Loading activities from last 28 days...');
    
    let allActivities = await base44.entities.Activity.filter(
      { athlete_id: userRecord.strava_athlete_id },
      '-start_date',
      100
    );
    
    // Normalize response
    if (!Array.isArray(allActivities)) {
      if (allActivities?.data) allActivities = allActivities.data;
      else if (allActivities?.items) allActivities = allActivities.items;
      else allActivities = [];
    }
    
    // Filter to last 28 days
    const recentActivities = allActivities.filter(activity => 
      new Date(activity.start_date) >= twentyEightDaysAgo
    );
    
    console.log(`Found ${recentActivities.length} activities in last 28 days`);
    
    if (recentActivities.length === 0) {
      return Response.json({
        success: true,
        analysis: {
          message: "Welcome! I'll be analyzing your training once you have some activities synced. Connect your Strava account and sync your activities to get started with personalized coaching insights.",
          hasData: false
        }
      });
    }

    // Calculate key training metrics
    const metrics = calculateTrainingMetrics(recentActivities);
    
    console.log('Calculated metrics:', metrics);

    // Generate AI analysis using Elite Coach
    const analysisPrompt = `As Elite Coach, perform a comprehensive training analysis for this athlete based on their last 28 days of data.

**Training Summary:**
- Total Activities: ${metrics.totalActivities}
- Total Distance: ${(metrics.totalDistance / 1000).toFixed(1)} km
- Total Time: ${(metrics.totalTime / 3600).toFixed(1)} hours
- Average Weekly Volume: ${(metrics.avgWeeklyDistance / 1000).toFixed(1)} km
- Activity Breakdown: ${metrics.byType.map(t => `${t.type} (${t.count})`).join(', ')}

**Weekly Breakdown:**
${metrics.weeklyData.map((week, i) => 
  `Week ${i+1}: ${week.activities} activities, ${(week.distance/1000).toFixed(1)}km, ${(week.time/3600).toFixed(1)}h`
).join('\n')}

**Performance Metrics:**
- Activities with HR data: ${metrics.activitiesWithHR}
- Average Heart Rate: ${metrics.avgHeartRate ? Math.round(metrics.avgHeartRate) : 'N/A'} bpm
- Activities with Power: ${metrics.activitiesWithPower}
- Average Cadence: ${metrics.avgCadence ? Math.round(metrics.avgCadence) : 'N/A'}

**Load Analysis:**
- Acute Workload (last 7 days): ${(metrics.acuteLoad / 1000).toFixed(1)} km
- Chronic Workload (4-week avg): ${(metrics.chronicLoad / 1000).toFixed(1)} km
- ACWR: ${metrics.acwr.toFixed(2)} ${metrics.acwr > 1.5 ? '⚠️ HIGH RISK' : metrics.acwr < 0.8 ? '⚠️ DETRAINING' : '✓ SAFE ZONE'}

**Recent Activities Summary:**
${recentActivities.slice(0, 5).map(a => {
  const date = new Date(a.start_date).toLocaleDateString();
  const distance = (a.distance_m / 1000).toFixed(1);
  const pace = a.average_speed_mps > 0 
    ? (() => {
        const mps = a.average_speed_mps;
        const kmh = mps * 3.6;
        const minPerKm = 60 / kmh;
        const min = Math.floor(minPerKm);
        const sec = Math.round((minPerKm % 1) * 60);
        return `${min}:${sec.toString().padStart(2, '0')}/km`;
      })()
    : 'N/A';
  const hr = a.average_heartrate ? `${Math.round(a.average_heartrate)}bpm` : 'No HR';
  return `- ${a.name} (${date}): ${distance}km, ${pace}, ${hr}`;
}).join('\n')}

**Instructions:**
Provide a comprehensive training analysis covering:
1. Overall training load assessment (is volume appropriate? Any concerning spikes?)
2. Performance trends (improving, plateauing, declining?)
3. Training balance (too much intensity? Enough recovery?)
4. Key risks or concerns (overtraining signs, injury risk, poor recovery)
5. Specific actionable recommendations for the next 7-14 days

Be direct, use specific metrics, and explain the physiological reasoning behind your recommendations. Format your response as a well-structured coaching report.`;

    console.log('Sending analysis prompt to Elite Coach...');

    const aiAnalysis = await base44.integrations.Core.InvokeLLM({
      prompt: analysisPrompt
    });

    console.log('✅ Analysis generated successfully');

    return Response.json({
      success: true,
      analysis: {
        message: aiAnalysis,
        hasData: true,
        metrics: {
          totalActivities: metrics.totalActivities,
          totalDistance: (metrics.totalDistance / 1000).toFixed(1) + ' km',
          avgWeeklyVolume: (metrics.avgWeeklyDistance / 1000).toFixed(1) + ' km',
          acwr: metrics.acwr.toFixed(2),
          acwrStatus: metrics.acwr > 1.5 ? 'HIGH_RISK' : metrics.acwr < 0.8 ? 'DETRAINING' : 'SAFE'
        }
      }
    });

  } catch (error) {
    console.error('generateTrainingAnalysis error:', error);
    return Response.json({ 
      error: error.message || 'Unknown error' 
    }, { status: 500 });
  }
});

function calculateTrainingMetrics(activities) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Weekly breakdown (4 weeks)
  const weeks = [[], [], [], []];
  activities.forEach(activity => {
    const activityDate = new Date(activity.start_date);
    const daysAgo = Math.floor((now - activityDate) / (24 * 60 * 60 * 1000));
    const weekIndex = Math.floor(daysAgo / 7);
    if (weekIndex < 4) {
      weeks[weekIndex].push(activity);
    }
  });
  
  const weeklyData = weeks.map(weekActivities => ({
    activities: weekActivities.length,
    distance: weekActivities.reduce((sum, a) => sum + (a.distance_m || 0), 0),
    time: weekActivities.reduce((sum, a) => sum + (a.moving_time_s || 0), 0)
  }));
  
  // Acute vs Chronic Load
  const acuteActivities = activities.filter(a => new Date(a.start_date) >= sevenDaysAgo);
  const acuteLoad = acuteActivities.reduce((sum, a) => sum + (a.distance_m || 0), 0);
  const chronicLoad = activities.reduce((sum, a) => sum + (a.distance_m || 0), 0) / 4; // 4-week average
  const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : 0;
  
  // Activity type breakdown
  const typeMap = {};
  activities.forEach(a => {
    typeMap[a.type] = (typeMap[a.type] || 0) + 1;
  });
  const byType = Object.entries(typeMap).map(([type, count]) => ({ type, count }));
  
  // Heart rate metrics
  const hrActivities = activities.filter(a => a.average_heartrate);
  const avgHeartRate = hrActivities.length > 0
    ? hrActivities.reduce((sum, a) => sum + a.average_heartrate, 0) / hrActivities.length
    : null;
  
  // Power metrics
  const powerActivities = activities.filter(a => a.average_watts);
  
  // Cadence metrics
  const cadenceActivities = activities.filter(a => a.average_cadence);
  const avgCadence = cadenceActivities.length > 0
    ? cadenceActivities.reduce((sum, a) => sum + a.average_cadence, 0) / cadenceActivities.length
    : null;
  
  return {
    totalActivities: activities.length,
    totalDistance: activities.reduce((sum, a) => sum + (a.distance_m || 0), 0),
    totalTime: activities.reduce((sum, a) => sum + (a.moving_time_s || 0), 0),
    avgWeeklyDistance: activities.reduce((sum, a) => sum + (a.distance_m || 0), 0) / 4,
    weeklyData,
    byType,
    acuteLoad,
    chronicLoad,
    acwr,
    activitiesWithHR: hrActivities.length,
    avgHeartRate,
    activitiesWithPower: powerActivities.length,
    avgCadence
  };
}