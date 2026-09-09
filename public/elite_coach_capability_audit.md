# Elite Coach Agent — Capability Audit

> Generated: 2026-07-07
> Scope: `activity_analysis_agent` and `elite_coach` agent configurations in the Elite Coach Strava app.

---

## 0. Agent Configuration Summary

There are **two** agent config files:

| Agent name | Config file | Model | Tool permissions |
|---|---|---|---|
| `activity_analysis_agent` | `base44/agents/activity_analysis_agent.jsonc` | automatic | `analyzeActivity`, `listActivities`, `getActivityDetail` *(phantom)*, `listTopEffortsByDistance` |
| `elite_coach` | `base44/agents/elite_coach.jsonc` | automatic | `listActivities`, `getActivityDetail` *(phantom)*, `getActivityStreams` *(phantom)*, `getBestEfforts` *(phantom)* |

**Neither agent has any direct entity permissions** — all data access flows through the functions listed in `tool_configs`.

---

## 1. Entities the Agent Can Access (via functions only)

No entity-level permissions are granted. The agents access data indirectly through their backend functions.

| Entity | Fields available | Agent access path | Notes |
|---|---|---|---|
| **Activity** | `strava_id, athlete_id, name, type, start_date, distance_m, moving_time_s, elapsed_time_s, total_elevation_gain_m, average_speed_mps, max_speed_mps, average_heartrate, max_heartrate, average_cadence, average_watts, suffer_score, average_temp, kudos_count, source_device_brand, elite_coach_comment, raw_data` (full Strava JSON) | `listActivities` (summary fields only), `analyzeActivity` (full record via `.get()`) | `raw_data` contains polyline, splits, laps, segment_efforts, best_efforts — but **no function exposes these to the agent** |
| **ActivityStream** | `activity_id, stream_type, data[]` | None — no assigned function reads this entity | Streams are stored but inaccessible to the agent |
| **BestEffort** | `activity_type, distance_name, elapsed_time_s, activity_id, activity_name, activity_date, distance_m, pace_s_per_km, speed_kph, rank` | `listTopEffortsByDistance` (activity_analysis_agent only) | `elite_coach` agent has NO access to BestEffort data |
| **User** | `strava_athlete_id, age, hr_zones (zone1_max–zone5_max), strava_access_token, strava_refresh_token, strava_expires_at, strava_pb_*` | Read internally by functions; agent never sees token fields | No goals, injuries, target races, or recovery notes fields exist |
| **TrainingPlan** | `target_distance, plan_length_weeks, plan_overview, pace_guide, weekly_plan[]` | None — no assigned function reads this entity | Agent cannot retrieve the athlete's training plan |
| **Conversation** | `title, description, last_activity, is_active, message_count, agent_conversation_id, analysis_generated` | `chatWithEliteCoach` (not assigned to either agent) | — |
| **Message** | `conversation_id, role, content, timestamp, table_data, insights` | `chatWithEliteCoach` (not assigned) | — |
| **Athlete** | `strava_id, username, firstname, lastname, access_token, refresh_token, token_expires_at` | None | Token storage entity; not needed by agent directly |
| **StravaEnrichmentState** | `status, processed_count, total_activities_to_process, last_run_at, rate_limit_hit_at, next_allowed_run_at, error_message` | None | Enrichment job tracking; not coaching-relevant |
| **Cache** | `cache_key, value, expires_at` | None | Internal job cache |
| **CleanupJob** | `job_type, status, request_stop, total_duplicates, deleted_count, error_message, started_at, completed_at` | None | Internal cleanup job |

### Entities that do NOT exist
Checked `base44/entities/` directory — none of these are defined:

- ❌ Segment entity
- ❌ Goal entity
- ❌ Injury entity
- ❌ Race / TargetRace entity
- ❌ CoachingAnalysis entity (analysis results are not persisted)
- ❌ Workout / Session entity

---

## 2. Backend Functions Available to the Agents

### 2a. Functions assigned to `activity_analysis_agent`

| Function | Exists? | Reads Strava? | External APIs? | Inputs | Outputs | What it actually does |
|---|---|---|---|---|---|---|
| `analyzeActivity` | ✅ | No | No (returns hardcoded data) | `{ activityId }` | `{ comparison_summary, performance_delta, coach_interpretation, elite_coach_summary, actionable_advice }` | Fetches the activity from DB, finds similar activities by distance (±10%) and elevation (±15%), then returns **MOCKED** analysis — `pace_delta: -15, hr_delta: -2, cadence_delta: +1` are hardcoded regardless of actual data. Route matching is always `"distance_only"`. No real comparison logic. |
| `listActivities` | ✅ | No (DB only) | No | `{ limit, offset, type, q, min_distance_m, max_distance_m, min_elevation_gain_m, max_elevation_gain_m }` | `{ items[], limit, nextOffset, hasMore }` — summary fields only (no raw_data, no splits/laps/polyline) | Queries the Activity entity filtered by athlete_id. Running cadence doubled to total spm. |
| `getActivityDetail` | ❌ **Does not exist** | — | — | — | — | **Phantom reference.** No backend function with this name exists. The closest existing function is `getStravaActivityDetails`, which is NOT assigned. |
| `listTopEffortsByDistance` | ✅ | No (DB only) | No | `{ distance, distance_m, distance_name, limit, type, tolerance_pct }` | `{ success, items[], distance_name, type, limit, ... }` | Queries BestEffort entity (user + service role merge), returns top efforts for a given distance. |

### 2b. Functions assigned to `elite_coach`

| Function | Exists? | Reads Strava? | External APIs? | Inputs | Outputs | What it actually does |
|---|---|---|---|---|---|---|
| `listActivities` | ✅ | No (DB only) | No | (same as above) | (same as above) | (same as above) |
| `getActivityDetail` | ❌ **Does not exist** | — | — | — | — | **Phantom reference.** |
| `getActivityStreams` | ❌ **Does not exist** | — | — | — | — | **Phantom reference.** No function fetches ActivityStream entity data for the agent. |
| `getBestEfforts` | ❌ **Does not exist** | — | — | — | — | **Phantom reference.** `listTopEffortsByDistance` exists but is not assigned to this agent. |

### 2c. Functions that exist but are NOT assigned to either agent

| Function | Reads Strava? | External APIs? | Relevance to activity analysis |
|---|---|---|---|
| `getStravaActivityDetails` | ✅ Yes — fetches activity detail + 9 stream types (time, distance, latlng, altitude, heartrate, velocity_smooth, cadence, watts, temp) directly from Strava API | Strava only | **Critical gap** — this is the function that retrieves splits, laps, segment_efforts, polyline, and streams. Not assigned to any agent. |
| `generateActivityComment` | No | InvokeLLM | Generates a 2–3 sentence coaching comment and saves to `elite_coach_comment`. Not assigned. |
| `generateTrainingAnalysis` | No | InvokeLLM | Training analysis generation. Not assigned. |
| `generateTrainingPlan` | No | InvokeLLM | Training plan generation. Not assigned. |
| `calculateHRZones` | No | No | HR zone calculation. Not assigned. |
| `chatWithEliteCoach` | No | InvokeLLM | Chat handler. Not assigned. |
| `generatePerformanceReport` | No | InvokeLLM | Report generation. Not assigned. |

### Data each function can retrieve

| Function | Activity detail | Best efforts | Segments | Activity streams | Route/polyline | Splits | Laps | Heart-rate data | Weather | Elevation | Training load | Historical comparisons |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `analyzeActivity` | ✅ (mocked) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ (mocked) |
| `listActivities` | Summary only | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (avg/max only) | ❌ | ✅ | ❌ | ✅ (list) |
| `listTopEffortsByDistance` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (by distance) |
| `getStravaActivityDetails` (not assigned) | ✅ | ✅ (in raw_data) | ✅ (in raw_data) | ✅ (9 types) | ✅ (in raw_data) | ✅ (in raw_data) | ✅ (in raw_data) | ✅ (stream + avg/max) | ✅ (temp stream) | ✅ (altitude stream) | ❌ | ❌ |

---

## 3. Capability Assessment

| # | Capability | Currently available? | Tool/entity/function used | Gap | Recommended action |
|---|---|---|---|---|---|
| 3.1 | Retrieve the completed activity being analysed | ⚠️ Partial | `analyzeActivity` calls `Activity.get(activityId)` internally but returns **mocked** data, not the real activity. `listActivities` returns summary fields only. | Agent never receives the actual activity metrics — it gets hardcoded deltas. | Fix `analyzeActivity` to return real activity data, or assign `getStravaActivityDetails` to the agent. |
| 3.2 | Retrieve the athlete's previous activities | ✅ Yes (limited) | `listActivities` — DB only, summary fields, filterable by type/distance/elevation/date | No raw_data, no splits, no laps, no polyline in the response. | Acceptable for list view; detail retrieval needs a separate function. |
| 3.3 | Retrieve the athlete's BestEffort table | ⚠️ Partial | `listTopEffortsByDistance` (activity_analysis_agent only). `getBestEfforts` referenced by elite_coach **does not exist**. | elite_coach agent has zero BestEffort access. | Assign `listTopEffortsByDistance` to elite_coach agent, or create a `getBestEfforts` wrapper. |
| 3.4 | Compare similar runs by distance, elevation, terrain, pace, HR, cadence, and route | ❌ No | `analyzeActivity` has a `findSimilarActivities` helper that filters by distance (±10%) and elevation (±15%), but route matching always returns `"distance_only"` and the comparison output is **hardcoded**. | No real metric comparison. No terrain, route, or HR/cadence comparison logic. | Rewrite `analyzeActivity` to compute real deltas from matched activities. |
| 3.5 | Identify activities on the same route or substantially overlapping route | ❌ No | `analyzeActivity.findSimilarActivities` — distance + elevation filter only, `routeMatchType` is always `"distance_only"`. No geometry comparison. | No polyline/latlng comparison. No start-location proximity check. No route overlap algorithm. | Add a route-matching function using `raw_data.map.summary_polyline` decoding + start-point proximity + route overlap. |
| 3.6 | Compare Strava segments between activities | ❌ No | No function reads `raw_data.segment_efforts`. No Segment entity exists. | Segment data exists in `raw_data` but is never extracted or compared. | Create a function to extract and compare segment efforts across activities. |
| 3.7 | Retrieve Strava activity detail directly | ❌ No (not assigned) | `getStravaActivityDetails` exists and fetches full detail + streams from Strava, but is **not assigned** to either agent. `getActivityDetail` referenced by agents **does not exist**. | Agents cannot retrieve Strava detail. | Assign `getStravaActivityDetails` to both agents (read-only). |
| 3.8 | Retrieve Strava streams, splits, laps, segment efforts, or route polylines | ❌ No | `getStravaActivityDetails` fetches streams (time, distance, latlng, altitude, heartrate, velocity_smooth, cadence, watts, temp) but is not assigned. `ActivityStream` entity stores some streams but no function exposes them. Splits/laps/segment_efforts exist in `raw_data` but no function extracts them. | All stream/split/lap/segment data is inaccessible to the agent. | Create `getActivityStreams` function (reads ActivityStream entity + Strava streams), and extend activity detail to include splits/laps/segments from `raw_data`. |
| 3.9 | Retrieve athlete goals, target races, injury notes, training plan, recent workload, and recovery context | ❌ No | No Goal, Injury, Race, or CoachingAnalysis entities exist. `TrainingPlan` entity exists but no function exposes it to the agent. No workload/recovery calculation function is assigned. | Zero context about goals, injuries, target races, training plan, or recovery. | Create Goal, Injury, TargetRace, and CoachingAnalysis entities; create read functions; assign to agent. |
| 3.10 | Call external resources such as weather APIs | ❌ No | No function calls a weather API. `average_temp` is stored on Activity but historical weather at activity time/location is not available. | Agent cannot factor weather into analysis. | Create a `getWeatherForActivity` function using a weather API (e.g. Open-Meteo) keyed on `start_date` + latlng from `raw_data`. |

---

## 4. Key Gaps Preventing a Useful Coaching Review

1. **Three phantom functions** — `getActivityDetail`, `getActivityStreams`, and `getBestEfforts` are referenced by the agents but do not exist as backend functions. Every call to these fails.

2. **`analyzeActivity` returns hardcoded mock data** — pace delta (-15 s/km), HR delta (-2 bpm), and cadence delta (+1 spm) are fixed strings. The function never computes real comparisons, making every "analysis" identical regardless of the activity.

3. **No route/geometry comparison** — "similar activities" are matched by distance (±10%) and elevation (±15%) only. No polyline decoding, no start-location proximity, no route overlap, no segment comparison. The agent's instructions ask for same-route comparison but no tool can provide it.

4. **`getStravaActivityDetails` exists but is not assigned** — this function already fetches full Strava detail (splits, laps, segment_efforts, polyline, 9 stream types) but neither agent can call it.

5. **No coaching context entities** — there are no Goal, Injury, TargetRace, or CoachingAnalysis entities. The agent cannot factor in what the athlete is training for, whether they're injured, or what their target race is.

6. **TrainingPlan is inaccessible** — the entity exists but no function exposes it to the agent.

7. **No weather data** — `average_temp` is stored but there's no function to retrieve historical weather, preventing environmental context.

8. **`elite_coach` agent has no BestEffort access** — `listTopEffortsByDistance` is assigned only to `activity_analysis_agent`, not `elite_coach`.

9. **Analysis results are not persisted** — no CoachingAnalysis entity exists, so the agent cannot recall previous analyses or track coaching recommendations over time.

10. **No workload/recovery calculation** — no function computes acute:chronic workload ratio, training stress, or recovery metrics despite the agent instructions referencing these.

---

## 5. Minimum Recommended New Backend Functions and Data Fields

### 5a. New entities (all read-only for the agent)

| Entity | Fields | Purpose |
|---|---|---|
| **Goal** | `title, type (distance/time/event), target_value, target_unit, deadline, status (active/achieved/abandoned), created_date` | Store athlete goals (e.g. "Sub-20 5k by October") |
| **Injury** | `body_part, severity (low/medium/high), started_date, status (active/recovering/resolved), notes, created_date` | Track injuries for safer coaching |
| **TargetRace** | `name, date, distance_m, location, goal_time_s, priority, created_date` | Upcoming races for periodization context |
| **CoachingAnalysis** | `activity_id, analysis_json, coach_summary, risk_flags[], recommendations[], created_date` | Persist analysis results for historical tracking |

### 5b. New backend functions (read-only, Strava tokens kept server-side)

| Function | Reads Strava? | Inputs | Outputs | Purpose |
|---|---|---|---|---|
| **`getActivityDetail`** | Yes (falls back to DB) | `{ activityId }` | Activity summary + `raw_data` (splits, laps, segment_efforts, polyline) + best_efforts | Replaces the phantom function. Uses existing `getStravaActivityDetails` logic but shapes output for the agent. |
| **`getActivityStreams`** | Yes (Strava streams API) | `{ activityId }` | Array of `{ stream_type, data[] }` | Replaces the phantom function. Reads from ActivityStream entity first, falls back to Strava API. |
| **`getBestEfforts`** | No (DB only) | `{ type, limit }` or `{ distance, type, limit }` | Array of BestEffort rows | Replaces the phantom function. Wraps `listTopEffortsByDistance` or returns all best efforts for the athlete. |
| **`findSimilarActivities`** | No (DB only) | `{ activityId, tolerance_pct }` | Array of similar activities with similarity score + route_match_type | Real route matching: decode `raw_data.map.summary_polyline`, compare start-point proximity (Haversine < 500m), route overlap (Frechet/Hausdorff distance), distance (±10%), elevation (±15%). Returns match type: `exact / partial / distance_only / none`. |
| **`compareActivities`** | No | `{ activityIdA, activityIdB }` | `{ pace_delta, hr_delta, cadence_delta, power_delta, elevation_delta, route_overlap_pct }` | Computes real metric deltas between two activities. |
| **`getTrainingContext`** | No (DB only) | `{}` | `{ training_plan, recent_workload { acute_load, chronic_load, acwr }, recovery_indicators }` | Aggregates TrainingPlan, computes 7-day acute / 28-day chronic workload from Activity.suffer_score, returns ACWR. |
| **`getAthleteContext`** | No (DB only) | `{}` | `{ age, hr_zones, goals[], injuries[], target_races[] }` | Returns athlete context from User + new Goal/Injury/TargetRace entities. |
| **`getWeatherForActivity`** | No (external weather API) | `{ activityId }` | `{ temp_c, wind_kph, wind_dir, humidity, precipitation_mm, conditions }` | Fetches historical weather using `raw_data.start_date` + `raw_data.start_latlng` via a free weather API (e.g. Open-Meteo archive). |

### 5c. New User fields

| Field | Type | Purpose |
|---|---|---|
| `preferred_units` | `string` (miles/kilometers) | Referenced by `generateActivityComment` but missing from User schema — add it |

### 5d. Permission assignments

| Agent | Functions to assign | Entity permissions (read-only) |
|---|---|---|
| `activity_analysis_agent` | `getActivityDetail`, `getActivityStreams`, `getBestEfforts`, `findSimilarActivities`, `compareActivities`, `getTrainingContext`, `getAthleteContext`, `getWeatherForActivity` | `Goal` (read), `Injury` (read), `TargetRace` (read), `CoachingAnalysis` (read), `TrainingPlan` (read) |
| `elite_coach` | `getActivityDetail`, `getActivityStreams`, `getBestEfforts`, `listTopEffortsByDistance`, `getTrainingContext`, `getAthleteContext` | Same read-only entity permissions |

All entity permissions should be **read-only**. Strava tokens and API calls stay inside backend functions — never exposed to the agent prompt or frontend.

---

## Summary of Priorities

**Immediate fixes (unblocks the agent today):**
1. Assign the existing `getStravaActivityDetails` to both agents (or create a `getActivityDetail` wrapper).
2. Replace the three phantom function references (`getActivityDetail`, `getActivityStreams`, `getBestEfforts`) with real implementations.
3. Rewrite `analyzeActivity` to compute real metric deltas instead of returning hardcoded data.

**Short-term (enables evidence-based coaching):**
4. Implement route matching using polyline geometry + start-point proximity.
5. Create `getTrainingContext` for workload/ACWR calculation.
6. Create `getAthleteContext` for goals/injuries/races.

**Medium-term (completes the coaching picture):**
7. Create Goal, Injury, TargetRace, and CoachingAnalysis entities.
8. Add `getWeatherForActivity` for environmental context.
9. Implement segment comparison across activities.
