import { createClientFromRequest } from 'npm:@base44/sdk@0.8.37';

function isNextWorkoutRequest(message) {
  return /recommend next workout|what should i do today|what is my next session|should i run today|what training should i do next|next workout/i.test(message);
}

function isTrainingStatusRequest(message) {
  return /training status|status review|weekly load|training load|recovery|fatigue|overtrain|how am i doing|what should i do tomorrow/i.test(message);
}

function isActivityAnalysisRequest(message) {
  return /(?:analy[zs]e|analysis of)\s+(?:my |this |the |your )?(?:latest |last |recent |previous )?(?:\d+(?:\.\d+)?\s*(?:k|km|mi|miles)?\s*)?(?:run|ride|parkrun|race|session|activity|long run|workout)|review my (?:\d+(?:\.\d+)?\s*(?:k|km)?\s*)?(?:run|ride|parkrun|race|session|activity)|how did i pace|did my (?:hr|heart rate) drift|was this (?:ride|run|session) too (?:easy|hard)|what should i learn from this (?:activity|run|ride|session)|analy[zs]e my/i.test(message);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversationId, message } = await req.json();
    if (!conversationId || !message) {
      return Response.json({ error: 'conversationId and message are required' }, { status: 400 });
    }

    const conversation = await base44.entities.Conversation.get(conversationId);
    if (!conversation) return Response.json({ error: 'Conversation not found' }, { status: 404 });

    const snapshotResponse = await base44.functions.invoke('getCoachSnapshot', {});
    const coachSnapshot = snapshotResponse?.data || snapshotResponse;
    if (coachSnapshot?.error) return Response.json({ error: coachSnapshot.error }, { status: 500 });

    if (message.trim() === 'Debug getCoachSnapshot only') {
      return Response.json({
        success: true,
        response: {
          tools_called: ['getCoachSnapshot'],
          data_source: coachSnapshot.data_source,
          generated_at: coachSnapshot.generated_at,
          date_range: coachSnapshot.date_range,
          sync_status: coachSnapshot.sync_status,
          activity_data_status: coachSnapshot.activity_data_status,
          analysis_confidence: coachSnapshot.analysis_confidence,
          load_model_status: coachSnapshot.load_model_status,
          activity_rows: coachSnapshot.activity_rows,
          unique_strava_ids: coachSnapshot.unique_strava_ids,
          null_strava_id_rows: coachSnapshot.null_strava_id_rows,
          duplicate_rows: coachSnapshot.duplicate_rows,
          summary: coachSnapshot.summary,
          weekly_by_sport: coachSnapshot.weekly_by_sport,
          acwr: coachSnapshot.acwr,
          data_quality_warnings: coachSnapshot.data_quality_warnings
        },
        conversationId
      });
    }

    if (isNextWorkoutRequest(message)) {
      const prompt = `You are Elite Coach. Create one clear, safe next-workout recommendation using only the live snapshot below. Do not use prior conversation data, cached reports, or assumptions. The current snapshot always wins. Do not calculate ACWR or cite an ACWR value when it is unavailable. Do not use mixed-sport kilometres as a training-load measure, mix running and cycling cadence, or interpret mixed-sport average heart rate. Do not prescribe exact heart-rate caps, cadence, pace, or power unless the snapshot includes athlete-specific targets. Only describe the sync as partial, syncing, failed, or unknown when the matching sync_status value says so. If sync_status is complete but acwr.available is false or load_model_status is limited, say: “Activity sync appears complete, but ACWR/load-model confidence is limited, so I will use sport-specific volume and moving time rather than ACWR.” In that case do not imply missing activities or a partial sync. When sync_status is partial, syncing, failed, or unknown, or activity_data_status is incomplete or unknown, the Training Status must be exactly Amber or Unknown unless multiple independent current warning signs support Red; never use any other status label. When analysis_confidence is moderate-low or low, set recommendation confidence to Moderate-low or Low. Choose one single sport and one single primary workout, not alternatives. Use effort-based intensity: RPE, conversational effort, finish feeling better, and stop if soreness, fatigue, or heaviness increases.\n\nReturn exactly these sections in this order. Recommended Next Workout and Sport must name one primary workout in one sport only; do not use “or”, “and/or”, or alternatives in either section. \n1. Training Status\n2. Recommended Next Workout\n3. Sport\n4. Purpose\n5. Duration or Distance\n6. Intensity\n7. Why This Session\n8. Avoid Today\n9. Adjustment If Tired, Sore, or Flat\n10. Missing Data\n11. Confidence\n\nLIVE COACH SNAPSHOT:\n${JSON.stringify(coachSnapshot, null, 2)}\n\nATHLETE QUESTION:\n${message}`;
      const response = await base44.integrations.Core.InvokeLLM({ prompt });
      return Response.json({ success: true, response, conversationId });
    }

    if (isActivityAnalysisRequest(message)) {
      const analysisResponse = await base44.functions.invoke('renderActivityAnalysis', { message });
      const analysis = analysisResponse?.data || analysisResponse;
      if (analysis?.error) return Response.json({ error: analysis.error }, { status: 500 });
      return Response.json({ success: true, response: analysis.markdown || analysis.analysis || analysis, conversationId });
    }

    if (isTrainingStatusRequest(message)) {
      const reviewResponse = await base44.functions.invoke('renderTrainingReview', {
        question: message,
        coach_snapshot: coachSnapshot
      });
      const review = reviewResponse?.data || reviewResponse;
      if (review?.error) return Response.json({ error: review.error }, { status: 500 });
      return Response.json({ success: true, response: review.review || review, conversationId });
    }

    const prompt = `You are Elite Coach, an evidence-led endurance coach. Answer the athlete's question using only the live coach snapshot below for numerical training facts. Never use values from previous conversation messages, cached reports, demo data, or assumptions. If data quality is limited, say so plainly. Do not calculate ACWR from distance; only report the ACWR field when it is marked available. Never interpret mixed-sport average heart rate or mix running cadence with cycling cadence. For running pace, always write minutes per kilometre using the pace_display value (for example, 4:21 min/km); never present pace_s_per_km as raw seconds.\n\nLIVE COACH SNAPSHOT:\n${JSON.stringify(coachSnapshot, null, 2)}\n\nATHLETE QUESTION:\n${message}\n\nGive practical, safe guidance. Cite the relevant snapshot fields in plain language and avoid unsupported numerical claims.`;
    const response = await base44.integrations.Core.InvokeLLM({ prompt });

    return Response.json({ success: true, response, conversationId });
  } catch (error) {
    console.error('chatWithEliteCoach error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});