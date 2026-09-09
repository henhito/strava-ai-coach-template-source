import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Placeholder for logic
const validationRules = {
  '5k': { min: 8, max: 10 },
  '10k': { min: 8, max: 12 },
  '15k': { min: 10, max: 12 },
  'half_marathon': { min: 10, max: 12 },
  'marathon': { min: 12, max: 16 }
};

// ... more complex logic for fitness estimation and plan generation would go here.
// This is a simplified example.

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

    const { target_distance, plan_length_weeks, training_days_per_week, finish_time_goal } = await req.json();

    // 1. Validation
    const rules = validationRules[target_distance];
    if (!rules || plan_length_weeks < rules.min || plan_length_weeks > rules.max) {
      return Response.json({ 
        error: `Invalid plan length for ${target_distance}.`,
        recommendation: `Please choose between ${rules?.min || 'N/A'} and ${rules?.max || 'N/A'} weeks.`
      }, { status: 400 });
    }

    // 2. Fitness Estimation (mocked)
    const athlete_snapshot = {
      estimated_5k: "00:25:00",
      estimated_10k: "00:52:00",
      estimated_half_marathon: "01:55:00",
      estimated_marathon: "04:05:00"
    };

    // 3. Goal Proximity (mocked)
    const plan_overview = {
      goal_proximity: "realistic_reach",
      summary: `A ${plan_length_weeks}-week plan to prepare for your ${target_distance}. The goal is a realistic reach.`
    };
    
    // 4. Pace Guide (mocked)
    const pace_guide = {
      easy: "6:30-7:00 /km",
      marathon: "5:45 /km",
      threshold: "5:15 /km",
      interval: "4:45 /km",
      repetition: "4:20 /km"
    };

    // 5. Weekly Plan Generation (mocked)
    const weekly_plan = Array.from({ length: plan_length_weeks }, (_, i) => ({
      week: i + 1,
      focus: `Building aerobic base and introducing some intensity.`,
      days: [
        { day: 'Monday', type: 'Rest', description: 'Rest or cross-train' },
        { day: 'Tuesday', type: 'Easy Run', description: '5 km at easy pace', distance_km: 5 },
        { day: 'Wednesday', type: 'Key Session', description: '6x400m intervals' },
        { day: 'Thursday', type: 'Easy Run', description: '5 km at easy pace', distance_km: 5 },
        { day: 'Friday', type: 'Rest', description: 'Rest' },
        { day: 'Saturday', type: 'Long Run', description: `${10 + i} km at easy pace`, distance_km: 10 + i },
        { day: 'Sunday', type: 'Rest', description: 'Rest or active recovery' },
      ].slice(0, training_days_per_week + 2)
    }));

    // 6. Finish Time Outlook (mocked)
    const finish_time_outlook = {
      projected_finish_time: finish_time_goal || "03:55:00",
      confidence: "Medium",
      commentary: "With consistent training, the goal is achievable. Focus on the long runs and key sessions."
    };

    const trainingPlan = {
      target_distance,
      plan_length_weeks,
      training_days_per_week,
      finish_time_goal,
      athlete_snapshot,
      plan_overview,
      pace_guide,
      weekly_plan,
      finish_time_outlook
    };

    const savedPlan = await base44.entities.TrainingPlan.create(trainingPlan);

    return Response.json(savedPlan);

  } catch (error) {
    console.error('generateTrainingPlan error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});