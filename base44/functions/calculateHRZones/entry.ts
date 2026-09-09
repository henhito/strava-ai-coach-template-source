import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { age } = await req.json();
    if (!age || age < 15 || age > 100) {
      return Response.json({ error: 'Valid age (15-100) is required' }, { status: 400 });
    }

    // Use the InvokeLLM integration to calculate HR zones
    const prompt = `You are a sports science expert. Calculate heart rate training zones for a ${age}-year-old athlete.

Please provide the maximum heart rate for each of the 5 training zones based on current sports science research:

Zone 1 (Active Recovery): 50-60% of max HR
Zone 2 (Aerobic Base): 60-70% of max HR  
Zone 3 (Aerobic): 70-80% of max HR
Zone 4 (Lactate Threshold): 80-90% of max HR
Zone 5 (Neuromuscular Power): 90-100% of max HR

Use the most accurate age-based formula and provide specific BPM values for each zone maximum.`;

    const llmResponse = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      response_json_schema: {
        type: "object",
        properties: {
          max_hr: {
            type: "number",
            description: "Calculated maximum heart rate"
          },
          zone1_max: {
            type: "number", 
            description: "Maximum BPM for Zone 1"
          },
          zone2_max: {
            type: "number",
            description: "Maximum BPM for Zone 2"
          },
          zone3_max: {
            type: "number",
            description: "Maximum BPM for Zone 3"
          },
          zone4_max: {
            type: "number",
            description: "Maximum BPM for Zone 4"
          },
          zone5_max: {
            type: "number",
            description: "Maximum BPM for Zone 5"
          },
          formula_used: {
            type: "string",
            description: "Which formula was used for calculation"
          }
        }
      }
    });

    return Response.json({ 
      zones: llmResponse,
      success: true 
    });

  } catch (error) {
    console.error('calculateHRZones error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});