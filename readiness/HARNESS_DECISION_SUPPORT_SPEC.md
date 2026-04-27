# Harness Decision Support Spec

## Purpose

Add a new product layer to the readiness system: **Decision Support**.

Today the app mostly answers:

- how recovered am I?
- what was my score?
- what is planned?

This feature should additionally answer:

- what should win today?
- what should I do next?
- why did the app choose that?

The target behavior is not just:

- `score 61, moderate`

But:

- `Yellow day, Achilles reactive, swap planned run for easy ride and do isometric calf loading`

This spec is scoped to the current `readiness` + `readiness-web` architecture:

- Python CLI remains the deterministic data pipeline
- Postgres remains the web app source of truth
- `/today` becomes the primary decision surface
- AI explains decisions but does not own the decision logic

---

## Product Shape

Feature name:

- `Harness Decision Support`

Alternative public name:

- `Injury-Aware Planning`

Three user-facing jobs:

1. **Assess**
   - how recovered are you?
   - how reactive is the tissue?
   - what is planned?

2. **Decide**
   - what should win today?
   - which decision bucket applies?

3. **Prescribe**
   - go as planned / reduce / swap / rehab only
   - exact modification
   - rehab block
   - red flags

---

## Scope

### In scope for phase 1

- single-user support
- one active issue at a time is enough to ship v1
- deterministic decision engine
- Achilles-first ruleset, specifically insertional Achilles
- `/today` UI output
- web check-in additions for injury state

### Out of scope for phase 1

- ML personalization
- free-form LLM planning as source of truth
- multi-issue optimization across many simultaneous injuries
- auto-classifying every completed activity perfectly
- generalized weekly planner UI

---

## Design Principles

1. **Rules decide**
   - versioned deterministic logic produces the decision.

2. **AI explains**
   - narrative, summary, and coaching language can be generated after the deterministic result exists.

3. **Pain is not fatigue**
   - injury-state inputs are separate from readiness-state inputs.

4. **Structured inputs beat free text**
   - use enums and bounded scales for the fields that drive decisions.

5. **Every recommendation should be inspectable**
   - store reason codes so the UI can say why a decision happened.

6. **Global harness, injury-specific modules**
   - the physio harness supplies shared decision principles, but each injury
     area owns its own deterministic tissue rules, risk tags, and rehab blocks.

7. **Prompts are guardrails, not decision engines**
   - AI prompts may include the physio harness so the explanation stays aligned,
     but the prompt must treat the stored deterministic decision as authoritative.

---

## Decision Architecture

The decision system must stay modular so new injuries can be added without
rewriting the whole planner or relying on free-form AI judgment.

Recommended shape:

```text
Global Harness Principles
  -> session classifier
  -> injury-specific module
  -> deterministic daily decision
  -> AI narrative layer
```

### Global Harness Principles

These rules apply to every injury area:

- pain is not fatigue
- rehab is part of training load, not an optional extra
- protect tissue before maintaining consistency
- maintain consistency before progressing training
- progress training before adding extras
- do not stack hard workout progression, aggressive rehab, poor sleep, high stress, and unresolved pain
- limp, compensation, or pain worsening during warm-up are red signals
- structured inputs and reason codes beat free-text interpretation

These principles should be present in AI explanation prompts as behavioral
guardrails, but they should also exist as deterministic rules in the code.

### Injury Modules

Each injury area should be implemented as a module behind a shared interface.
The module handles tissue interpretation and injury-specific risk, while the
global harness engine handles priority and final decision composition.

Conceptual interface:

```ts
type InjuryModule = {
  area: "achilles" | "patellar_tendon" | "hamstring" | "calf" | "back";
  classifyTissue(checkin: IssueCheckin | null): TissueBand;
  classifySessionRisk(session: SessionClassification): InjuryRisk;
  buildRehabPrescription(issue: ActiveIssue, band: TissueBand): RehabPrescription;
  redFlags(checkin: IssueCheckin | null): string[];
  reasonCodes(input: ModuleInput): string[];
};
```

### Injury-Specific Responsibility

The generic harness must not pretend that all injuries behave the same.
Examples:

- Achilles:
  - first-step pain, morning stiffness, hills, trail running, and impact matter
  - insertional Achilles should avoid aggressive dorsiflexion and heel drops off a step during calming phases
- Patellar tendon / knee:
  - stairs, squats, jumping, downhill running, and knee-flexion loading matter
- Hamstring:
  - sprinting, strides, hills, deadlifts, and lengthened loading matter
- Back:
  - neurological symptoms and radiating pain need special red-flag handling before any training recommendation

New injury modules must start conservative, ship with tests, and return a
deterministic decision even when AI is disabled.

### AI Prompt Use

AI may use the physio harness in every narrative prompt only if the prompt
keeps this boundary:

```text
The deterministic decision is authoritative. Use the physio harness principles
to explain the decision. Do not change the decision, diagnose, or prescribe
outside the provided rehab block.
```

AI input should include:

- readiness score and drivers
- persisted daily decision
- reason codes
- session classification
- active issue metadata
- issue check-in
- provided rehab block

AI output should include only narrative fields:

- summary
- decision explanation
- talking points
- session advice
- watchouts

AI output must not include a replacement score, replacement decision, diagnosis,
or new rehab prescription.

---

## Current System Mapping

Existing inputs already available:

- `readiness_scores`
- `sleep_records`
- `daily_metrics`
- `subjective_checkins`
- `planned_sessions`
- `strava_activities`
- `ai_insights`

Current gaps:

- no active issue model
- no injury-specific daily check-in
- no session risk metadata
- no decision engine output
- `/today` has summary data but not action-oriented prescribing

---

## Data Model

Add these Postgres tables in `readiness-web/lib/db/schema.ts`.

### 1. `active_issues`

One row per tracked issue.

Fields:

- `id` `bigserial` primary key
- `slug` `text` unique, optional stable UI handle
- `area` `text` not null
  - examples: `achilles`, `patellar_tendon`, `hamstring`
- `subtype` `text`
  - examples: `insertional`, `midportion`, `reactive`, `return_to_run`
- `label` `text` not null
  - user-facing name, e.g. `Left insertional Achilles`
- `side` `text`
  - `left`, `right`, `bilateral`, `unknown`
- `status` `text` not null
  - `active`, `monitoring`, `resolved`
- `stage` `text` not null
  - `calming`, `loading`, `capacity`, `return`
- `suspected_issue` `text`
- `trigger_movements_json` `jsonb`
- `aggravators_json` `jsonb`
- `relievers_json` `jsonb`
- `notes` `text`
- `started_at` `timestamptz` not null
- `resolved_at` `timestamptz`
- `updated_at` `timestamptz` not null

Indexes:

- `status`
- `area`
- partial-ish access path by `status='active'` if needed later

### 2. `issue_checkins`

One row per issue per date.

Fields:

- `issue_id` `bigint` not null
- `date` `text` not null
- `first_step_pain` `integer`
- `pain_walking` `integer`
- `pain_stairs` `integer`
- `pain_during_activity` `integer`
- `pain_after_activity` `integer`
- `morning_stiffness_minutes` `integer`
- `limp` `boolean`
- `warmup_response` `text`
  - `better`, `same`, `worse`
- `mechanics_changed` `boolean`
- `notes` `text`
- `created_at` `timestamptz` not null
- `updated_at` `timestamptz` not null

Primary key:

- `(issue_id, date)`

Indexes:

- `date`
- `issue_id`

### 3. `session_classifications`

Metadata for both planned and completed sessions.

Fields:

- `id` `bigserial` primary key
- `source_type` `text` not null
  - `planned_session`, `strava_activity`, `coros_activity`, `manual`
- `source_id` `text` not null
- `session_type` `text` not null
  - `endurance`, `intervals`, `strength`, `mobility`, `rehab`, `recovery`, `skill`
- `goal` `text` not null
  - `aerobic_maintenance`, `speed_endurance`, `restore_movement`, etc.
- `cost` `text` not null
  - `low`, `medium`, `high`
- `recovery_demand` `text` not null
  - `low`, `medium`, `high`
- `injury_risk` `text` not null
  - `low`, `medium`, `high`
- `tissue_tags_json` `jsonb` not null default `[]`
  - examples: `["achilles", "impact"]`
- `rules_version` `text` not null
- `raw_json` `jsonb`
- `updated_at` `timestamptz` not null

Unique key:

- `(source_type, source_id)`

Indexes:

- `source_type, source_id`
- `cost`
- `injury_risk`

### 4. `daily_decisions`

Versioned deterministic output for one date.

Fields:

- `date` `text` primary key
- `rules_version` `text` not null
- `readiness_band` `text`
  - `green`, `yellow`, `red`
- `tissue_band` `text`
  - `green`, `yellow`, `red`
- `primary_goal` `text`
  - `build_fitness`, `build_strength`, `restore_movement`, `reduce_pain`, `recover`
- `limiter` `text`
  - `tendon_pain`, `poor_sleep`, `cardio_fatigue`, etc.
- `priority` `text` not null
  - `protect_tissue`, `maintain_consistency`, `progress_training`
- `decision` `text` not null
  - `go_as_planned`, `reduce_load`, `swap_session`, `rehab_only`
- `reason_codes_json` `jsonb` not null
- `recommended_modification_json` `jsonb`
- `rehab_prescription_json` `jsonb`
- `red_flags_json` `jsonb`
- `created_at` `timestamptz` not null
- `updated_at` `timestamptz` not null

### 5. Optional later: `rehab_templates`

Store reusable prescriptions by issue + stage.

Fields:

- `id`
- `area`
- `subtype`
- `stage`
- `title`
- `prescription_json`
- `contraindications_json`
- `updated_at`

This can be deferred if code constants are easier initially.

---

## TypeScript Schema Additions

Add inferred types:

- `ActiveIssue`
- `IssueCheckin`
- `SessionClassification`
- `DailyDecision`

Update `TodaySummary` in `lib/contracts/types.ts` to include:

- `activeIssue: ActiveIssue | null`
- `issueCheckin: IssueCheckin | null`
- `plannedClassifications: SessionClassification[]`
- `stravaClassifications: SessionClassification[]`
- `decision: DailyDecision | null`

---

## Check-In Surface Changes

### Existing

Current daily check-in captures:

- energy
- mood
- soreness
- stress
- illness
- notes

### Add when an active issue exists

Dynamic injury section:

- first-step pain `/10`
- pain walking `/10`
- pain on stairs `/10`
- morning stiffness minutes
- limp yes/no
- warm-up better / same / worse
- optional notes

Recommendation:

- keep general recovery check-in in `subjective_checkins`
- store injury-specific fields in `issue_checkins`
- do not overload `subjective_checkins.notes` to carry structured pain state

---

## Session Risk Model

The app needs a deterministic way to classify planned and completed sessions.

### Initial implementation

Start with code-based heuristics in `readiness-web/lib/contracts` or a new `lib/decision-support/session-classify.ts`.

Inputs:

- planned session `type`
- planned session `name`
- planned session `description`
- completed activity sport type
- distance / duration if helpful

Outputs:

- `session_type`
- `goal`
- `cost`
- `recovery_demand`
- `injury_risk`
- `tissue_tags`

### Initial heuristics

#### Planned session examples

- `Slow Run`
  - `session_type`: `endurance`
  - `goal`: `aerobic_maintenance`
  - `cost`: `medium`
  - `recovery_demand`: `medium`
  - `injury_risk`: `medium_high`
  - `tissue_tags`: `["achilles", "impact"]`

- `Trail Run`
  - `injury_risk`: `high`
  - `tissue_tags`: `["achilles", "impact", "terrain"]`

- `Slow Ride`
  - `session_type`: `endurance`
  - `goal`: `aerobic_maintenance`
  - `cost`: `low`
  - `recovery_demand`: `low`
  - `injury_risk`: `low`
  - `tissue_tags`: `[]`

- `Swimming Drills`
  - `session_type`: `skill`
  - `goal`: `technique`
  - `cost`: `low`
  - `recovery_demand`: `low`
  - `injury_risk`: `low`

- `Calf Isometrics`
  - `session_type`: `rehab`
  - `goal`: `reduce_pain`
  - `cost`: `low`
  - `recovery_demand`: `low`
  - `injury_risk`: `low`
  - `tissue_tags`: `["achilles"]`

Store the classification result in `session_classifications` so later rules do not need to re-derive it every render.

---

## Daily Decision Engine

Create a new deterministic module in both stacks:

- TS read path for web rendering
- Python path later if we want local CLI recommendations to match exactly

Suggested initial file:

- `readiness-web/lib/decision-support/engine.ts`

Longer-term parity file:

- `readiness/health_readiness/decision_support.py`

### Inputs

- readiness score and component scores
- sleep / HRV / RHR / training load trend
- subjective check-in
- active issue
- issue check-in for the date
- planned sessions and classifications
- recent completed sessions and classifications

### Outputs

- readiness band
- tissue band
- primary goal
- limiter
- priority
- decision
- reason codes
- recommended modification
- rehab prescription
- red flags

### Decision buckets

- `go_as_planned`
- `reduce_load`
- `swap_session`
- `rehab_only`

### Priority values

- `protect_tissue`
- `maintain_consistency`
- `progress_training`

### First ruleset: insertional Achilles

Rules version:

- `achilles_v1`

Banding:

- readiness:
  - green: score `>= 75`
  - yellow: score `55-74`
  - red: score `< 55`

- tissue:
  - green:
    - first-step pain `<= 2`
    - no limp
    - warm-up `better` or `same`
  - yellow:
    - first-step pain `3-4`
    - or stiffness `> 0`
    - or warm-up `same`
  - red:
    - first-step pain `>= 5`
    - or limp true
    - or warm-up `worse`
    - or mechanics changed

Decision rules:

1. If no active issue:
   - return no decision or a generic readiness-only decision later

2. If active issue is insertional Achilles and tissue band is red:
   - `decision = rehab_only`
   - `priority = protect_tissue`
   - if planned session has `tissue_tags` including `achilles` or `impact`, block it

3. If active issue is insertional Achilles and readiness is yellow and planned session is run / impact:
   - `decision = swap_session`
   - `priority = protect_tissue`
   - recommend easy ride, swim, or walk + rehab

4. If tissue band is green and planned session is low-risk:
   - `decision = go_as_planned`

5. If tissue band is green, readiness is yellow, and planned session is medium or high cost:
   - `decision = reduce_load`

6. If next-day stiffness worsened after a recent run:
   - downgrade the next run exposure by one bucket

### Reason codes

Store explicit codes so the UI can explain the decision:

- `READINESS_YELLOW`
- `READINESS_RED`
- `ACHILLES_FIRST_STEP_PAIN_HIGH`
- `ACHILLES_LIMP_PRESENT`
- `ACHILLES_WARMUP_WORSE`
- `PLANNED_SESSION_IMPACT_RISK`
- `RECENT_ACHILLES_LOAD_STACK`
- `LOW_RISK_SESSION_ALLOWED`
- `NEXT_DAY_STIFFNESS_WORSE`

### Recommended modification payload

Example:

```json
{
  "replace_with": "easy_ride",
  "duration_minutes": 45,
  "intensity": "easy",
  "constraints": ["flat", "high_cadence", "low_torque"]
}
```

### Rehab prescription payload

Example:

```json
{
  "title": "Insertional Achilles calming block",
  "items": [
    "Isometric calf holds 4-5 x 30-45 sec",
    "Slow calf raises on flat ground 3 x 8",
    "Bent-knee calf raises 2 x 10"
  ],
  "avoid": [
    "heel drops off a step",
    "aggressive dorsiflexion stretching",
    "hills",
    "trail running"
  ]
}
```

---

## `/today` Contract Changes

Update `getTodaySummary(date)` in `lib/contracts/today.ts` to additionally load:

- latest active issue
- injury check-in for the date
- planned-session classifications
- relevant recent session classifications if needed for load stack
- latest `daily_decisions` row

If a `daily_decisions` row does not exist:

- compute it inline in code for v1
- optionally persist it as part of the render path or via a job later

Recommended helper modules:

- `lib/contracts/issue.ts`
- `lib/contracts/decision.ts`
- `lib/decision-support/engine.ts`
- `lib/decision-support/session-classify.ts`
- `lib/decision-support/rehab-prescriptions.ts`

---

## `/today` UI Changes

Add a new top-level section above or near the main summary cards.

### New card: Today’s Decision

Show:

- decision label
  - `Go as planned`
  - `Reduce load`
  - `Swap session`
  - `Rehab only`
- priority
  - `Protect tissue`
  - `Maintain consistency`
  - `Progress training`
- one-line explanation

### New card: Why

Show 3-4 bullets derived from `reason_codes_json`.

Examples:

- Achilles first-step pain is elevated this morning
- Planned session loads the Achilles directly
- Readiness is yellow today
- Training load is controlled, so an easy swap preserves consistency

### New card: Session Modification

If planned session exists and decision is not `go_as_planned`, show:

- original planned session
- approved replacement
- constraints

### New card: Rehab Today

Show:

- rehab title
- 3-5 concise bullets
- avoid list

### New card: Red Flags

Show only if populated:

- limp
- severe pain
- sharp pain / mechanics change
- worsening next-day stiffness

---

## API / Form Surface

### `check-in` page

Existing form:

- keep current readiness inputs

Add:

- injury section when active issue exists

Route behavior:

- current endpoint keeps writing `subjective_checkins`
- add a second upsert path for `issue_checkins`

If no active issue exists:

- hide injury form fields entirely

### New page: `/issues`

Initial version:

- list active issues
- show current stage
- show last 7 check-ins for the active issue
- allow editing current stage and notes
- allow marking issue resolved

This page does not need deep visual polish in phase 1.

---

## Python CLI Parity

The web app can ship phase 1 first, but long-term the Python CLI should expose the same decision support.

Suggested future commands:

- `python readiness/cli.py issue-today`
- `python readiness/cli.py issue-checkin ...`
- `python readiness/cli.py decision --date YYYYMMDD`

For now, phase 1 can leave this as a web-only decision layer if faster.

---

## Migration Plan

### Phase 1 — Active issue + injury check-in

Deliverables:

- new schema tables:
  - `active_issues`
  - `issue_checkins`
- web form support for injury metrics
- active issue query helpers

Success criteria:

- app can store daily Achilles-specific symptom data

### Phase 2 — Session classification

Deliverables:

- `session_classifications`
- initial classifier for planned sessions
- fallback classifier for recent run/ride/swim activities

Success criteria:

- app can classify at least common sessions:
  - slow run
  - trail run
  - slow ride
  - swim drills
  - rehab block

### Phase 3 — Daily decision engine

Deliverables:

- deterministic rules module
- `daily_decisions`
- Achilles v1 ruleset

Success criteria:

- app produces a daily recommendation bucket for active Achilles cases

### Phase 4 — `/today` decision UI

Deliverables:

- Today’s Decision card
- Why card
- Session Modification card
- Rehab Today card

Success criteria:

- `/today` gives a single clear recommended action

### Phase 5 — AI explanation

Deliverables:

- extend AI insight context with decision + issue state
- narrative explanation of deterministic output

Success criteria:

- AI output never contradicts deterministic recommendation

### Phase 6 — Weekly planner

Deliverables:

- weekly budget
- non-negotiables
- lighter day detection
- harness-style weekly planning page

Success criteria:

- user can review and adjust weekly structure around injury constraints

---

## Engineering Backlog

### Database

- add schema tables to `readiness-web/lib/db/schema.ts`
- create migration
- backfill none required for v1

### Contracts

- `lib/contracts/issue.ts`
- `lib/contracts/decision.ts`
- extend `lib/contracts/today.ts`
- extend `lib/contracts/types.ts`

### Decision Support Modules

- `lib/decision-support/session-classify.ts`
- `lib/decision-support/engine.ts`
- `lib/decision-support/reason-codes.ts`
- `lib/decision-support/rehab-prescriptions.ts`

### UI

- extend `app/check-in`
- add `app/issues/page.tsx`
- extend `app/today/page.tsx`

### Python parity later

- add issue models in Python repo layer
- add CLI commands
- add shared rules parity for local CLI

---

## Testing Strategy

### Unit tests

- classify common planned sessions correctly
- Achilles rules return the expected bucket for:
  - green / green
  - yellow readiness + impact session
  - red tissue state
  - worsening next-day stiffness

### Contract tests

- `/today` returns `decision` null when no active issue exists
- `/today` returns populated decision when issue + issue check-in exist

### Manual test cases

1. Active Achilles + planned `Slow Run` + yellow day
   - expect `swap_session`

2. Active Achilles + planned `Slow Ride` + yellow day
   - expect `go_as_planned` or `reduce_load`

3. Active Achilles + limp true
   - expect `rehab_only`

4. No active issue
   - no injury-specific decision card or a generic fallback only

---

## Open Questions

1. Should `daily_decisions` be computed on demand or persisted by a job?
   - recommendation: compute on demand first, persist later if needed

2. Should issue-specific check-ins be merged into the existing check-in form or split into a dedicated `/issues/today` form?
   - recommendation: same form, conditional injury section

3. Should completed activities also receive classifications immediately during sync?
   - recommendation: not in phase 1; classify on read or lazy-write

4. Should the decision engine live only in TS first?
   - recommendation: yes, ship faster on the web, then port to Python once stable

---

## First Concrete Slice

If implementing immediately, the smallest vertical slice is:

1. Add `active_issues` + `issue_checkins`
2. Add one active issue manually in DB: insertional Achilles
3. Add injury fields to `/check-in`
4. Add TS rules engine for Achilles only
5. Extend `/today` with:
   - Today’s Decision
   - Why
   - Rehab Today

That is enough to prove the product direction before generalizing.
