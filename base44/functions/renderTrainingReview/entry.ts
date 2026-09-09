import { createClientFromRequest } from 'npm:@base44/sdk@0.8.36';

const REQUIRED_KEYS = [
  "summary",
  "training_status",
  "evidence_used",
  "current_load",
  "fitness_signs",
  "watchouts",
  "next_7_days_priority",
  "suggested_next_7_days",
  "questions_for_athlete",
  "data_limitations"
];

const ARRAY_KEYS = new Set([
  "evidence_used",
  "fitness_signs",
  "watchouts",
  "suggested_next_7_days",
  "questions_for_athlete",
  "data_limitations"
]);

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "object",
      properties: {
        available: { type: "boolean" },
        text: { type: "string" }
      },
      additionalProperties: true
    },
    training_status: {
      type: "object",
      properties: {
        available: { type: "boolean" },
        label: { type: "string", enum: ["Green", "Amber", "Red", "Unknown"] },
        reason: { type: "string" }
      },
      additionalProperties: true
    },
    evidence_used: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tool: { type: "string" },
          fact: { type: "string" },
          source: { type: "string" }
        },
        required: ["tool", "fact", "source"]
      }
    },
    current_load: {
      type: "object",
      properties: {
        available: { type: "boolean" }
      },
      additionalProperties: true
    },
    fitness_signs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sign: { type: "string" },
          source: { type: "string" }
        },
        required: ["sign", "source"]
      }
    },
    watchouts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          watchout: { type: "string" },
          source: { type: "string" }
        },
        required: ["watchout", "source"]
      }
    },
    next_7_days_priority: {
      type: "object",
      properties: {
        available: { type: "boolean" }
      },
      additionalProperties: true
    },
    suggested_next_7_days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sport: { type: "string" },
          purpose: { type: "string" },
          intensity: { type: "string" },
          duration_or_distance: { type: "string" },
          evidence: { type: "string" }
        },
        required: ["sport", "purpose", "intensity", "duration_or_distance", "evidence"]
      }
    },
    questions_for_athlete: {
      type: "array",
      items: { type: "string" }
    },
    data_limitations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          limitation: { type: "string" },
          affected_metric: { type: "string" }
        },
        required: ["limitation", "affected_metric"]
      }
    }
  },
  required: REQUIRED_KEYS
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const question = (body.question || '').toString().trim();
    const coachSnapshot = body.coach_snapshot ?? null;

    const evidenceBlock = JSON.stringify({
      coach_snapshot: coachSnapshot
    }, null, 2);

    const prompt = `You are Elite Coach producing a STRICT JSON training-status review. Use ONLY the evidence below (already retrieved by tools). Do not invent metrics, figures, PBs, or comparisons that are not present in the evidence.

ATHLETE QUESTION:
${question}

LIVE COACH SNAPSHOT (the only permitted numerical source for this request):
${evidenceBlock}

RULES (follow all):
0. Use ONLY coach_snapshot values from this current request. Never reuse values from conversation history, cached reports, monthly summaries, or other tool outputs. For completed-activity counts, use unique_strava_ids only. activity_rows is the raw database-row count and may only be mentioned as a data-quality diagnostic alongside duplicate_rows; never present it as the athlete's completed activities. If generated_at is missing/current-date invalid, or the date range is not current, set training_status to Unknown. If sync_status is not complete or activity_data_status is not complete, reduce confidence and avoid strong fatigue, injury-risk, ACWR, or fitness-trend claims. If sync_status is complete but load_model_status is limited or acwr.available is false, state that activity sync appears complete and use sport-specific volume and moving time rather than ACWR; do not describe the sync as partial. If null_strava_id_rows is greater than zero, do not report ACWR.
1. ACWR: never calculate ACWR yourself. Use the acwr object from coach_snapshot when acwr.available is true. It is a running-only ratio (run distance): acute_load_km = running distance in the last 7 days, chronic_load_km = 28-day running weekly average, value = acute / chronic. When you mention ACWR, EXPLAIN it in context — do not just state the number: state the acute and chronic loads, what the ratio means for current training load, and the practical implication. If value is 0 or very low, explain this reflects a recent rest gap (no or little running in the last 7 days) relative to the 28-day running baseline, and guide a gradual return rather than flatly labelling it "undertrained". If acwr.available is false, do not mention an ACWR value; use sport-specific volume and moving time instead. Never calculate ACWR from mixed-sport distance totals. Never use alarmist wording ("dangerously high", "major red flag") from ACWR alone.
2. Cadence: never combine running and cycling cadence. Running cadence = steps/min; cycling cadence = rpm. If sports are mixed, return separate sport-specific summaries or state a combined interpretation is unavailable.
3. Low average HR on a long endurance ride is NOT evidence the athlete under-trained unless activity-level evidence supports it. Consider duration, stops, descents, coasting, terrain, HR stream, power, intended session type. State uncertainty where those fields are unavailable.
4. Do not ask for goals, target races, HR zones, injuries, or training-plan info unless the evidence shows it is absent or incomplete. At most two focused questions.
5. Recommendations must be internally consistent: if recovery is the priority, do not also prescribe tempo work plus a long session. Every prescription must identify sport, purpose, intensity, duration or distance, and the evidence. Do not convert time-based sessions into weekly kilometres without a sport-specific pace/speed source. Validate numerical comparisons before output (never describe 250-350 km as lower than a 231.5 km average).
6. Every metric must include either a source (tool that returned it) or a data-limitation note. Never state an exact figure a tool did not return.
7. Separate explicitly: retrieved facts, calculated values, coaching interpretation, and missing data/confidence.
8. training_status MUST include a label field set to exactly one of "Green", "Amber", "Red", or "Unknown", and a short reason field explaining the choice. Set available to true whenever you produce a label. Use "Unknown" only when there is not enough reliable current activity data to classify. Green = training can continue as planned. Amber = continue with reduced volume/intensity/complexity. Red = no hard training; requires multiple independent current warning signs, never ACWR alone.

OUTPUT: a single JSON object with exactly these top-level keys, all present: summary, training_status, evidence_used, current_load, fitness_signs, watchouts, next_7_days_priority, suggested_next_7_days, questions_for_athlete, data_limitations. Use null, empty arrays, or {"available": false} where evidence is missing. No prose, no markdown, no text outside the JSON.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: RESPONSE_SCHEMA
    });

    let obj = (typeof result === 'string') ? null : result;
    if (obj === null && typeof result === 'string') {
      try { obj = JSON.parse(result); } catch (_) { obj = null; }
    }
    const safe = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    for (const k of REQUIRED_KEYS) {
      if (!(k in safe) || safe[k] === undefined) {
        safe[k] = ARRAY_KEYS.has(k) ? [] : { available: false };
      }
    }

    return Response.json({ review: safe });
  } catch (error) {
    console.error('renderTrainingReview error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});