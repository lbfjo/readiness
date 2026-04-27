import { strict as assert } from "node:assert";
import { buildDailyDecision } from "../lib/decision-support/engine";
import type {
  ActiveIssue,
  IssueCheckin,
  PlannedSession,
  ReadinessScore,
  SubjectiveCheckin,
} from "../lib/db/schema";

const achilles = issue("achilles", "Left insertional Achilles");
const hamstring = issue("hamstring", "Right hamstring");

assert.equal(
  buildDailyDecision({
    issue: achilles,
    issueCheckin: issueCheckin({ firstStepPain: 0, warmupResponse: "better" }),
    planned: [planned("Ride", "Easy Z2 Ride", "60 min Z2")],
    score: score(82),
    checkin: checkin({ soreness: 2, stress: 2 }),
  })?.decision,
  "go_as_planned",
);

assert.equal(
  buildDailyDecision({
    issue: achilles,
    issueCheckin: issueCheckin({ firstStepPain: 3, morningStiffnessMinutes: 10 }),
    planned: [planned("Run", "3x 1km", "z4 intervals")],
    score: score(70),
    checkin: checkin({ soreness: 2, stress: 2 }),
  })?.decision,
  "swap_session",
);

assert.equal(
  buildDailyDecision({
    issue: achilles,
    issueCheckin: issueCheckin({ limp: true }),
    planned: [planned("Ride", "Slow Ride", "Z1")],
    score: score(80),
    checkin: checkin({ soreness: 2, stress: 2 }),
  })?.decision,
  "rehab_only",
);

assert.equal(
  buildDailyDecision({
    issue: achilles,
    issueCheckin: issueCheckin({ warmupResponse: "worse" }),
    planned: [planned("Swim", "Drills", "easy technique")],
    score: score(80),
    checkin: checkin({ soreness: 2, stress: 2 }),
  })?.decision,
  "rehab_only",
);

const stacked = buildDailyDecision({
  issue: hamstring,
  issueCheckin: issueCheckin({ painDuringActivity: 0, warmupResponse: "better" }),
  planned: [planned("Run", "Sprint hills", "8 x 20 sec speed hill sprints")],
  score: score(82),
  checkin: checkin({ soreness: 4, stress: 4 }),
});
assert.equal(stacked?.decision, "swap_session");
assert.ok(stacked?.reasonCodes.includes("ONE_HARD_GOAL_SUBJECTIVE_LIMIT"));

console.log("decision-support checks passed");

function issue(area: string, label: string): ActiveIssue {
  return {
    id: 1,
    slug: area,
    area,
    subtype: null,
    label,
    side: null,
    status: "active",
    stage: "calming",
    suspectedIssue: null,
    triggerMovementsJson: null,
    aggravatorsJson: null,
    relieversJson: null,
    notes: null,
    startedAt: new Date(),
    resolvedAt: null,
    updatedAt: new Date(),
  };
}

function issueCheckin(payload: Partial<IssueCheckin>): IssueCheckin {
  return {
    issueId: 1,
    date: "20260426",
    firstStepPain: null,
    painWalking: null,
    painStairs: null,
    painDuringActivity: null,
    painAfterActivity: null,
    morningStiffnessMinutes: null,
    limp: false,
    warmupResponse: null,
    mechanicsChanged: false,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...payload,
  };
}

function planned(type: string, name: string, description: string): PlannedSession {
  return {
    eventId: `${type}-${name}`,
    date: "20260426",
    startDateLocal: null,
    type,
    name,
    description,
    rawJson: {},
    updatedAt: new Date(),
  };
}

function score(value: number): ReadinessScore {
  return {
    date: "20260426",
    modelVersion: "v2",
    score: value,
    status: "test",
    recommendation: "test",
    confidence: "high",
    componentScoresJson: {},
    positiveDriversJson: [],
    cautionDriversJson: [],
    computedAt: new Date(),
  };
}

function checkin(payload: Partial<SubjectiveCheckin>): SubjectiveCheckin {
  return {
    date: "20260426",
    energy: null,
    mood: null,
    soreness: null,
    stress: null,
    illness: 0,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...payload,
  };
}
