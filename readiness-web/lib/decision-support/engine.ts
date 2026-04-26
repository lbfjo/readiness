import type {
  ActiveIssue,
  IssueCheckin,
  PlannedSession,
  ReadinessScore,
  SubjectiveCheckin,
} from "@/lib/db/schema";
import type { DailyDecision } from "@/lib/contracts/types";

function readinessBand(score: number | null | undefined): "green" | "yellow" | "red" {
  if (score == null) return "yellow";
  if (score >= 75) return "green";
  if (score >= 55) return "yellow";
  return "red";
}

function tissueBand(issueCheckin: IssueCheckin | null): "green" | "yellow" | "red" {
  if (!issueCheckin) return "yellow";
  const hasMorningSymptoms =
    (issueCheckin.firstStepPain ?? 0) > 0 ||
    (issueCheckin.painWalking ?? 0) > 0 ||
    (issueCheckin.painStairs ?? 0) > 0 ||
    (issueCheckin.morningStiffnessMinutes ?? 0) > 0;

  if (
    (issueCheckin.firstStepPain ?? 0) >= 5 ||
    (issueCheckin.painWalking ?? 0) >= 5 ||
    (issueCheckin.painStairs ?? 0) >= 5 ||
    issueCheckin.limp ||
    issueCheckin.warmupResponse === "worse" ||
    issueCheckin.mechanicsChanged
  ) {
    return "red";
  }
  if (
    (issueCheckin.firstStepPain ?? 0) >= 3 ||
    (issueCheckin.painWalking ?? 0) >= 3 ||
    (issueCheckin.painStairs ?? 0) >= 3 ||
    (issueCheckin.morningStiffnessMinutes ?? 0) > 0 ||
    (hasMorningSymptoms && issueCheckin.warmupResponse === "same")
  ) {
    return "yellow";
  }
  return "green";
}

function plannedImpactRisk(planned: PlannedSession[]): "none" | "low" | "high" {
  if (planned.length === 0) return "none";
  const text = planned
    .map((session) => `${session.type ?? ""} ${session.name} ${session.description ?? ""}`.toLowerCase())
    .join("\n");
  if (text.includes("trail") || text.includes("run")) return "high";
  if (text.includes("walk")) return "low";
  return "low";
}

export function buildDailyDecision({
  issue,
  issueCheckin,
  planned,
  score,
  checkin,
}: {
  issue: ActiveIssue | null;
  issueCheckin: IssueCheckin | null;
  planned: PlannedSession[];
  score: ReadinessScore | null;
  checkin: SubjectiveCheckin | null;
}): DailyDecision | null {
  if (!issue || issue.status !== "active") return null;

  const issueArea = issue.area.toLowerCase();
  if (issueArea !== "achilles") return null;

  const rBand = readinessBand(score?.score);
  const tBand = tissueBand(issueCheckin);
  const impactRisk = plannedImpactRisk(planned);
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  const redFlags: string[] = [];

  if (tBand === "green") {
    reasons.push("Morning Achilles check-in is green: no pain, stiffness, limp, or compensation reported.");
    reasonCodes.push("ACHILLES_TISSUE_GREEN");
  }
  if ((issueCheckin?.firstStepPain ?? 0) >= 3) {
    reasons.push(`First-step pain is ${issueCheckin?.firstStepPain}/10 this morning.`);
    reasonCodes.push("ACHILLES_FIRST_STEP_PAIN_ELEVATED");
  }
  if (issueCheckin?.limp) {
    reasons.push("You reported a limp, which means mechanics are already changing.");
    reasonCodes.push("ACHILLES_LIMP_PRESENT");
    redFlags.push("Limp present");
  }
  if (issueCheckin?.warmupResponse === "worse") {
    reasons.push("Symptoms worsen during warm-up.");
    reasonCodes.push("ACHILLES_WARMUP_WORSE");
    redFlags.push("Warm-up worsens symptoms");
  }
  if (rBand === "yellow") {
    reasons.push("Readiness is yellow today, so progression should not be the priority.");
    reasonCodes.push("READINESS_YELLOW");
  } else if (rBand === "red") {
    reasons.push("Recovery is poor enough that training should be heavily downgraded.");
    reasonCodes.push("READINESS_RED");
  }
  if (impactRisk === "high") {
    reasons.push("Today's planned session directly loads the Achilles.");
    reasonCodes.push("PLANNED_SESSION_IMPACT_RISK");
  }
  if ((checkin?.soreness ?? 0) >= 4) {
    reasons.push("General soreness is elevated as well.");
    reasonCodes.push("SORENESS_ELEVATED");
  }

  const rehabToday = {
    title: "Insertional Achilles calming block",
    items: [
      "Isometric calf holds 4-5 x 30-45 sec",
      "Slow calf raises on flat ground 3 x 8",
      "Bent-knee calf raises 2 x 10",
    ],
    avoid: [
      "heel drops off a step",
      "aggressive dorsiflexion stretching",
      "hills",
      "trail running",
    ],
  };

  if (tBand === "red") {
    return {
      issueArea,
      issueLabel: issue.label,
      readinessBand: rBand,
      tissueBand: tBand,
      decision: "rehab_only",
      priority: "protect_tissue",
      title: "Rehab only",
      summary: "Tissue protection wins today. Skip impact work and keep the day focused on pain-calming rehab and easy recovery.",
      reasonCodes,
      reasons,
      recommendedModification: {
        replaceWith: "easy walk, easy spin, or full rest",
        intensity: "easy",
        constraints: ["no impact", "no hills", "no aggressive calf loading"],
      },
      rehabToday,
      redFlags,
    };
  }

  if (impactRisk === "high" && (rBand === "yellow" || tBand === "yellow")) {
    return {
      issueArea,
      issueLabel: issue.label,
      readinessBand: rBand,
      tissueBand: tBand,
      decision: "swap_session",
      priority: "protect_tissue",
      title: "Swap the planned session",
      summary: "This is a yellow Achilles day. Keep consistency, but move away from impact and use a lower-risk aerobic option.",
      reasonCodes,
      reasons,
      recommendedModification: {
        replaceWith: "easy ride or swim",
        durationMinutes: 45,
        intensity: "easy",
        constraints: ["flat", "high cadence", "low torque"],
      },
      rehabToday,
      redFlags,
    };
  }

  if (rBand === "yellow") {
    return {
      issueArea,
      issueLabel: issue.label,
      readinessBand: rBand,
      tissueBand: tBand,
      decision: "reduce_load",
      priority: "maintain_consistency",
      title: "Reduce load",
      summary: "You can train today, but keep it controlled and avoid unnecessary progression while the Achilles is being monitored.",
      reasonCodes,
      reasons,
      recommendedModification: {
        replaceWith: "keep the session easy",
        intensity: "easy",
        constraints: ["cut volume 20-30%", "avoid impact progression"],
      },
      rehabToday,
      redFlags,
    };
  }

  return {
    issueArea,
    issueLabel: issue.label,
    readinessBand: rBand,
    tissueBand: tBand,
    decision: "go_as_planned",
    priority: impactRisk === "high" ? "maintain_consistency" : "progress_training",
    title: "Go as planned",
    summary:
      impactRisk === "high"
        ? "The Achilles looks calm enough to proceed, but keep the run controlled and avoid adding hills, speed, or extra volume."
        : "The Achilles looks calm enough for the planned low-risk work. Keep the session controlled and continue rehab afterwards.",
    reasonCodes,
    reasons,
    recommendedModification: null,
    rehabToday,
    redFlags,
  };
}
