import type {
  ActiveIssue,
  IssueCheckin,
  PlannedSession,
  ReadinessScore,
  SubjectiveCheckin,
} from "@/lib/db/schema";
import type { DailyDecision, SessionClassification } from "@/lib/contracts/types";
import { classifyPlannedSessions } from "./session-classifier";

const RULES_VERSION = "harness-v1";

type Band = "green" | "yellow" | "red";
type InjuryRisk = "none" | "low" | "medium" | "high";

type InjuryModule = {
  area: string;
  classifyTissue(checkin: IssueCheckin | null): Band;
  classifySessionRisk(session: SessionClassification): InjuryRisk;
  rehabPrescription(issue: ActiveIssue, band: Band): NonNullable<DailyDecision["rehabToday"]>;
  redFlags(checkin: IssueCheckin | null): string[];
  tissueReasons(checkin: IssueCheckin | null, band: Band): { reasons: string[]; codes: string[] };
};

const achillesModule: InjuryModule = {
  area: "achilles",
  classifyTissue(checkin) {
    if (!checkin) return "yellow";
    const hasMorningSymptoms =
      (checkin.firstStepPain ?? 0) > 0 ||
      (checkin.painWalking ?? 0) > 0 ||
      (checkin.painStairs ?? 0) > 0 ||
      (checkin.morningStiffnessMinutes ?? 0) > 0;

    if (
      (checkin.firstStepPain ?? 0) >= 5 ||
      (checkin.painWalking ?? 0) >= 5 ||
      (checkin.painStairs ?? 0) >= 5 ||
      (checkin.painDuringActivity ?? 0) >= 5 ||
      (checkin.painAfterActivity ?? 0) >= 5 ||
      checkin.limp ||
      checkin.warmupResponse === "worse" ||
      checkin.mechanicsChanged
    ) {
      return "red";
    }

    if (
      (checkin.firstStepPain ?? 0) >= 3 ||
      (checkin.painWalking ?? 0) >= 3 ||
      (checkin.painStairs ?? 0) >= 3 ||
      (checkin.painDuringActivity ?? 0) >= 3 ||
      (checkin.painAfterActivity ?? 0) >= 3 ||
      (checkin.morningStiffnessMinutes ?? 0) > 0 ||
      (hasMorningSymptoms && checkin.warmupResponse === "same")
    ) {
      return "yellow";
    }

    return "green";
  },
  classifySessionRisk(session) {
    if (session.injuryRisk === "none") return "none";
    if (session.tissueTags.includes("achilles") && session.injuryRisk === "high") return "high";
    if (session.tissueTags.includes("achilles")) return "medium";
    return session.injuryRisk;
  },
  rehabPrescription(issue, band) {
    return {
      title:
        band === "red"
          ? `${issue.label} calming block`
          : `${issue.label} maintenance block`,
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
  },
  redFlags(checkin) {
    const flags: string[] = [];
    if (checkin?.limp) flags.push("Limp present");
    if (checkin?.mechanicsChanged) flags.push("Mechanics changed");
    if (checkin?.warmupResponse === "worse") flags.push("Warm-up worsens symptoms");
    return flags;
  },
  tissueReasons(checkin, band) {
    const reasons: string[] = [];
    const codes: string[] = [];
    if (!checkin) {
      reasons.push("No injury-specific check-in was recorded, so tissue status stays conservative.");
      codes.push("ISSUE_CHECKIN_MISSING");
      return { reasons, codes };
    }
    if (band === "green") {
      reasons.push("Morning Achilles check-in is green: no pain, stiffness, limp, or compensation reported.");
      codes.push("ACHILLES_TISSUE_GREEN");
    }
    if ((checkin?.firstStepPain ?? 0) >= 3) {
      reasons.push(`First-step pain is ${checkin?.firstStepPain}/10 this morning.`);
      codes.push("ACHILLES_FIRST_STEP_PAIN_ELEVATED");
    }
    if ((checkin?.painWalking ?? 0) >= 3 || (checkin?.painStairs ?? 0) >= 3) {
      reasons.push("Walking or stairs are provoking Achilles symptoms.");
      codes.push("ACHILLES_DAILY_LOADING_PAIN");
    }
    if ((checkin?.morningStiffnessMinutes ?? 0) > 0) {
      reasons.push(`Morning stiffness lasted ${checkin?.morningStiffnessMinutes} minutes.`);
      codes.push("ACHILLES_MORNING_STIFFNESS");
    }
    if (checkin?.limp) {
      reasons.push("You reported a limp, which means mechanics are already changing.");
      codes.push("ACHILLES_LIMP_PRESENT");
    }
    if (checkin?.warmupResponse === "worse") {
      reasons.push("Symptoms worsen during warm-up.");
      codes.push("ACHILLES_WARMUP_WORSE");
    }
    return { reasons, codes };
  },
};

const hamstringModule: InjuryModule = {
  area: "hamstring",
  classifyTissue(checkin) {
    if (!checkin) return "yellow";
    if (
      (checkin.painDuringActivity ?? 0) >= 5 ||
      (checkin.painAfterActivity ?? 0) >= 5 ||
      checkin.limp ||
      checkin.warmupResponse === "worse" ||
      checkin.mechanicsChanged
    ) {
      return "red";
    }
    if (
      (checkin.painDuringActivity ?? 0) >= 3 ||
      (checkin.painAfterActivity ?? 0) >= 3 ||
      (checkin.painWalking ?? 0) >= 3 ||
      checkin.warmupResponse === "same"
    ) {
      return "yellow";
    }
    return "green";
  },
  classifySessionRisk(session) {
    if (session.injuryRisk === "none") return "none";
    if (session.tissueTags.includes("hamstring") && session.injuryRisk === "high") return "high";
    if (session.tissueTags.includes("hamstring")) return "medium";
    return session.injuryRisk === "high" ? "medium" : session.injuryRisk;
  },
  rehabPrescription(issue, band) {
    return {
      title:
        band === "red"
          ? `${issue.label} calming block`
          : `${issue.label} control block`,
      items: [
        "Bridge isometric holds 4 x 30 sec",
        "Hamstring sliders 2-3 x 6 controlled reps",
        "Hip hinge patterning 2 x 8 easy reps",
      ],
      avoid: [
        "sprinting",
        "strides",
        "fast hills",
        "heavy lengthened hamstring loading",
      ],
    };
  },
  redFlags(checkin) {
    const flags: string[] = [];
    if (checkin?.limp) flags.push("Limp present");
    if (checkin?.mechanicsChanged) flags.push("Mechanics changed");
    if (checkin?.warmupResponse === "worse") flags.push("Warm-up worsens symptoms");
    return flags;
  },
  tissueReasons(checkin, band) {
    const reasons: string[] = [];
    const codes: string[] = [];
    if (!checkin) {
      reasons.push("No hamstring-specific check-in was recorded, so tissue status stays conservative.");
      codes.push("ISSUE_CHECKIN_MISSING");
      return { reasons, codes };
    }
    if (band === "green") {
      reasons.push("Hamstring check-in is green: no pain, limp, compensation, or warm-up regression reported.");
      codes.push("HAMSTRING_TISSUE_GREEN");
    }
    if ((checkin.painDuringActivity ?? 0) >= 3 || (checkin.painAfterActivity ?? 0) >= 3) {
      reasons.push("Hamstring pain during or after activity is elevated.");
      codes.push("HAMSTRING_ACTIVITY_PAIN_ELEVATED");
    }
    if (checkin.limp) {
      reasons.push("You reported a limp, which means mechanics are already changing.");
      codes.push("HAMSTRING_LIMP_PRESENT");
    }
    if (checkin.warmupResponse === "worse") {
      reasons.push("Symptoms worsen during warm-up.");
      codes.push("HAMSTRING_WARMUP_WORSE");
    }
    return { reasons, codes };
  },
};

const INJURY_MODULES: Record<string, InjuryModule> = {
  achilles: achillesModule,
  hamstring: hamstringModule,
};

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

  const injuryModule = INJURY_MODULES[issue.area.toLowerCase()] ?? genericModule(issue.area.toLowerCase());

  const session = classifyPlannedSessions(planned);
  const rBand = readinessBand(score?.score);
  const tBand = injuryModule.classifyTissue(issueCheckin);
  const sessionRisk = injuryModule.classifySessionRisk(session);
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  const redFlags = injuryModule.redFlags(issueCheckin);

  const tissue = injuryModule.tissueReasons(issueCheckin, tBand);
  reasons.push(...tissue.reasons);
  reasonCodes.push(...tissue.codes);

  if (rBand === "yellow") {
    reasons.push("Readiness is yellow today, so progression should not be the priority.");
    reasonCodes.push("READINESS_YELLOW");
  } else if (rBand === "red") {
    reasons.push("Recovery is poor enough that training should be heavily downgraded.");
    reasonCodes.push("READINESS_RED");
  }

  if (sessionRisk === "high") {
    reasons.push("Today's planned session directly loads the active issue.");
    reasonCodes.push("PLANNED_SESSION_INJURY_RISK_HIGH");
  }
  if ((checkin?.soreness ?? 0) >= 4) {
    reasons.push("General soreness is elevated as well.");
    reasonCodes.push("SORENESS_ELEVATED");
  }
  if ((checkin?.stress ?? 0) >= 4) {
    reasons.push("Stress is elevated, so the day should not stack extra load.");
    reasonCodes.push("STRESS_ELEVATED");
  }

  const limiter = limiterFor({ tBand, rBand, checkin, sessionRisk });
  const oneHardGoal = oneHardGoalConflict({ session, tBand, rBand, checkin });
  if (oneHardGoal) {
    reasons.push(oneHardGoal.reason);
    reasonCodes.push(oneHardGoal.code);
  }

  const rehabToday = injuryModule.rehabPrescription(issue, tBand);
  const decision = decide({ tBand, rBand, sessionRisk, session, oneHardGoal: Boolean(oneHardGoal) });
  const priority = priorityFor(decision, sessionRisk);

  return {
    rulesVersion: RULES_VERSION,
    issueArea: injuryModule.area,
    issueLabel: issue.label,
    readinessBand: rBand,
    tissueBand: tBand,
    decision,
    priority,
    primaryGoal: primaryGoalFor(decision, session),
    limiter,
    session,
    title: titleFor(decision),
    summary: summaryFor(decision, injuryModule.area),
    reasonCodes: [...new Set([...reasonCodes, ...session.reasonCodes])],
    reasons,
    recommendedModification: modificationFor(decision),
    rehabToday,
    redFlags,
  };
}

function genericModule(area: string): InjuryModule {
  return {
    area,
    classifyTissue(checkin) {
      if (!checkin) return "yellow";
      const maxPain = Math.max(
        checkin.firstStepPain ?? 0,
        checkin.painWalking ?? 0,
        checkin.painStairs ?? 0,
        checkin.painDuringActivity ?? 0,
        checkin.painAfterActivity ?? 0,
      );
      if (maxPain >= 5 || checkin.limp || checkin.mechanicsChanged || checkin.warmupResponse === "worse") {
        return "red";
      }
      if (maxPain >= 3 || (checkin.morningStiffnessMinutes ?? 0) > 0 || checkin.warmupResponse === "same") {
        return "yellow";
      }
      return "green";
    },
    classifySessionRisk(session) {
      if (session.injuryRisk === "none") return "none";
      if (session.tissueTags.includes(area) && session.injuryRisk === "high") return "high";
      if (session.tissueTags.includes(area)) return "medium";
      if (lowerLimbArea(area) && session.tissueTags.includes("impact")) return session.injuryRisk;
      return session.injuryRisk === "high" ? "medium" : session.injuryRisk;
    },
    rehabPrescription(issue, band) {
      return {
        title:
          band === "red"
            ? `${issue.label} calming block`
            : `${issue.label} control block`,
        items: [
          "Pain-free range isometrics 4 x 30 sec",
          "Easy mobility in a comfortable range 2 x 8",
          "Low-load control work 2 x 8",
        ],
        avoid: [
          "painful loading",
          "speed work",
          "large range under fatigue",
          "new high-impact work",
        ],
      };
    },
    redFlags(checkin) {
      const flags: string[] = [];
      if (checkin?.limp) flags.push("Limp present");
      if (checkin?.mechanicsChanged) flags.push("Mechanics changed");
      if (checkin?.warmupResponse === "worse") flags.push("Warm-up worsens symptoms");
      return flags;
    },
    tissueReasons(checkin, band) {
      const reasons: string[] = [];
      const codes: string[] = [];
      const label = area.replaceAll("_", " ");
      if (!checkin) {
        reasons.push(`No ${label} check-in was recorded, so tissue status stays conservative.`);
        codes.push("ISSUE_CHECKIN_MISSING");
        return { reasons, codes };
      }
      if (band === "green") {
        reasons.push(`${titleCase(label)} check-in is green: no meaningful pain, stiffness, limp, or compensation reported.`);
        codes.push("ISSUE_TISSUE_GREEN");
      }
      if (
        (checkin.firstStepPain ?? 0) >= 3 ||
        (checkin.painWalking ?? 0) >= 3 ||
        (checkin.painStairs ?? 0) >= 3 ||
        (checkin.painDuringActivity ?? 0) >= 3 ||
        (checkin.painAfterActivity ?? 0) >= 3
      ) {
        reasons.push(`${titleCase(label)} symptoms are elevated today.`);
        codes.push("ISSUE_PAIN_ELEVATED");
      }
      if ((checkin.morningStiffnessMinutes ?? 0) > 0) {
        reasons.push(`Morning stiffness lasted ${checkin.morningStiffnessMinutes} minutes.`);
        codes.push("ISSUE_MORNING_STIFFNESS");
      }
      if (checkin.limp || checkin.mechanicsChanged) {
        reasons.push("You reported changed mechanics, so tissue loading risk is higher.");
        codes.push("ISSUE_MECHANICS_CHANGED");
      }
      return { reasons, codes };
    },
  };
}

function lowerLimbArea(area: string): boolean {
  return ["achilles", "calf", "foot", "ankle", "knee", "hamstring", "hip"].includes(area);
}

function titleCase(value: string): string {
  return value.replace(/\b\w/gu, (char) => char.toUpperCase());
}

function readinessBand(score: number | null | undefined): Band {
  if (score == null) return "yellow";
  if (score >= 75) return "green";
  if (score >= 55) return "yellow";
  return "red";
}

function decide({
  tBand,
  rBand,
  sessionRisk,
  session,
  oneHardGoal,
}: {
  tBand: Band;
  rBand: Band;
  sessionRisk: InjuryRisk;
  session: SessionClassification;
  oneHardGoal: boolean;
}): DailyDecision["decision"] {
  if (tBand === "red") return "rehab_only";
  if (rBand === "red" && (session.cost === "high" || sessionRisk === "high")) return "rehab_only";
  if (sessionRisk === "high" && (rBand === "yellow" || tBand === "yellow")) return "swap_session";
  if (oneHardGoal && sessionRisk !== "none") return sessionRisk === "high" ? "swap_session" : "reduce_load";
  if (rBand === "yellow") return "reduce_load";
  return "go_as_planned";
}

function oneHardGoalConflict({
  session,
  tBand,
  rBand,
  checkin,
}: {
  session: SessionClassification;
  tBand: Band;
  rBand: Band;
  checkin: SubjectiveCheckin | null;
}): { code: string; reason: string } | null {
  const hardSession = session.cost === "high" || session.recoveryDemand === "high";
  if (!hardSession) return null;
  if (tBand !== "green") {
    return {
      code: "ONE_HARD_GOAL_TISSUE_LIMIT",
      reason: "The plan stacks a hard session on top of non-green tissue status.",
    };
  }
  if (rBand !== "green") {
    return {
      code: "ONE_HARD_GOAL_READINESS_LIMIT",
      reason: "The plan stacks a hard session on top of reduced readiness.",
    };
  }
  if ((checkin?.stress ?? 0) >= 4 || (checkin?.soreness ?? 0) >= 4) {
    return {
      code: "ONE_HARD_GOAL_SUBJECTIVE_LIMIT",
      reason: "The plan stacks a hard session on top of elevated stress or soreness.",
    };
  }
  return null;
}

function limiterFor({
  tBand,
  rBand,
  checkin,
  sessionRisk,
}: {
  tBand: Band;
  rBand: Band;
  checkin: SubjectiveCheckin | null;
  sessionRisk: InjuryRisk;
}): DailyDecision["limiter"] {
  if (tBand !== "green" || sessionRisk === "high") return "tendon_pain";
  if ((checkin?.soreness ?? 0) >= 4) return "muscle_fatigue";
  if ((checkin?.stress ?? 0) >= 4) return "high_stress";
  if (rBand === "red") return "poor_sleep";
  if (rBand === "yellow") return "cardio_fatigue";
  return "none";
}

function priorityFor(
  decision: DailyDecision["decision"],
  sessionRisk: InjuryRisk,
): DailyDecision["priority"] {
  if (decision === "rehab_only" || decision === "swap_session") return "protect_tissue";
  if (decision === "reduce_load" || sessionRisk === "high") return "maintain_consistency";
  return "progress_training";
}

function primaryGoalFor(
  decision: DailyDecision["decision"],
  session: SessionClassification,
): DailyDecision["primaryGoal"] {
  if (decision === "rehab_only") return "reduce_pain";
  if (decision === "swap_session") return "recover";
  if (decision === "reduce_load") return "recover";
  return session.goal;
}

function titleFor(decision: DailyDecision["decision"]) {
  if (decision === "rehab_only") return "Rehab only";
  if (decision === "swap_session") return "Swap the planned session";
  if (decision === "reduce_load") return "Reduce load";
  return "Go as planned";
}

function summaryFor(decision: DailyDecision["decision"], area: string) {
  if (decision === "rehab_only") {
    return "Tissue protection wins today. Skip hard work and keep the day focused on pain-calming rehab and easy recovery.";
  }
  if (decision === "swap_session") {
    return `This is a yellow ${area} day. Keep consistency, but move away from higher-risk loading and use a lower-risk aerobic option.`;
  }
  if (decision === "reduce_load") {
    return `You can train today, but keep it controlled and avoid unnecessary progression while the ${area} is being monitored.`;
  }
  return `The ${area} looks calm enough for the planned work. Keep the session controlled and continue rehab afterwards.`;
}

function modificationFor(decision: DailyDecision["decision"]): DailyDecision["recommendedModification"] {
  if (decision === "rehab_only") {
    return {
      replaceWith: "easy walk, easy spin, or full rest",
      intensity: "easy",
      constraints: ["no impact", "no hills", "no aggressive tissue loading"],
    };
  }
  if (decision === "swap_session") {
    return {
      replaceWith: "easy ride or swim",
      durationMinutes: 45,
      intensity: "easy",
      constraints: ["flat", "high cadence", "low torque"],
    };
  }
  if (decision === "reduce_load") {
    return {
      replaceWith: "keep the session easy",
      intensity: "easy",
      constraints: ["cut volume 20-30%", "avoid impact progression"],
    };
  }
  return null;
}
