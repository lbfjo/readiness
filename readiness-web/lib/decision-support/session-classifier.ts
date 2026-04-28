import type { PlannedSession } from "@/lib/db/schema";
import type { SessionClassification } from "@/lib/contracts/types";

export function classifyPlannedSessions(planned: PlannedSession[]): SessionClassification {
  if (planned.length === 0) {
    return {
      sessionType: "none",
      goal: "recover",
      cost: "none",
      recoveryDemand: "none",
      injuryRisk: "none",
      tissueTags: [],
      reasonCodes: ["NO_PLANNED_SESSION"],
      label: "No planned session",
    };
  }

  const text = planned.map(sessionText).join("\n").toLowerCase();
  const reasonCodes: string[] = [];
  const tissueTags = new Set<string>();

  const hasRun = /\brun|running|trail|strides?|sprints?\b/u.test(text);
  const hasRide = /\bride|bike|cycling|virtualride\b/u.test(text);
  const hasSwim = /\bswim|swimming\b/u.test(text);
  const hasStrength = /\bstrength|gym|squat|deadlift|calf raise|weights?\b/u.test(text);
  const hasMobility = /\bmobility|stretch|yoga|activation|movement\b/u.test(text);
  const hasRehab = /\brehab|physio|isometric|tendon|calf holds?|pain\b/u.test(text);
  const hasIntervals = /\b(\d+\s*x|z4|z5|threshold|vo2|ftp test|interval|tempo|race|hard|sprint)\b/u.test(text);
  const hasRecovery = /\b(recovery|easy|z1|z2|slow|drills?|technique)\b/u.test(text);
  const hasLong = /\b(long|2h|3h|4h|90\s*min|120\s*min)\b/u.test(text);
  const hasHills = /\bhill|climb|trail|downhill\b/u.test(text);
  const hasSprint = /\bsprint|stride|acceleration|speed\b/u.test(text);
  const hasHamstringStrength = /\bdeadlift|rdl|nordic|hamstring\b/u.test(text);
  const hasKneeLoad = /\bknee|squat|lunge|downhill|stairs?\b/u.test(text);
  const hasCalfLoad = /\bcalf|toe|plyo|jump|hills?\b/u.test(text);
  const hasFootLoad = /\bfoot|ankle|jump|plyo|trail\b/u.test(text);
  const hasBackLoad = /\bback|deadlift|squat|hinge|row\b/u.test(text);
  const hasHipLoad = /\bhip|squat|lunge|deadlift|hinge\b/u.test(text);

  if (hasRun) {
    tissueTags.add("impact");
    tissueTags.add("achilles");
    reasonCodes.push("SESSION_IMPACT");
  }
  if (hasHills) {
    tissueTags.add("achilles");
    reasonCodes.push("SESSION_HILLS_OR_TRAIL");
  }
  if ((hasRun && (hasSprint || hasHills)) || hasHamstringStrength) {
    tissueTags.add("hamstring");
    reasonCodes.push("SESSION_HAMSTRING_RISK");
  }
  if (hasRun || hasKneeLoad) tissueTags.add("knee");
  if (hasRun || hasCalfLoad) tissueTags.add("calf");
  if (hasRun || hasFootLoad) tissueTags.add("foot");
  if (hasStrength || hasBackLoad) tissueTags.add("back");
  if (hasRun || hasStrength || hasHipLoad) tissueTags.add("hip");

  const sessionType = (() => {
    if (hasRehab) return "rehab";
    if (hasMobility) return "mobility";
    if (hasIntervals || hasLong) return "key_workout";
    if (hasRecovery || hasSwim) return hasSwim && !hasIntervals ? "skill" : "recovery";
    if (hasStrength) return "support_workout";
    if (hasRide || hasRun) return "support_workout";
    return "support_workout";
  })();

  const cost = (() => {
    if (hasIntervals || hasLong) return "high";
    if (hasStrength || hasRun) return "medium";
    return "low";
  })();

  const injuryRisk = (() => {
    if (hasRun && (hasIntervals || hasHills || hasSprint)) return "high";
    if (hasRun) return "high";
    if (hasStrength && text.includes("calf")) return "medium";
    if (hasRide || hasSwim || hasRecovery || hasMobility) return "low";
    return cost === "high" ? "medium" : "low";
  })();

  if (hasIntervals) reasonCodes.push("SESSION_INTENSITY");
  if (hasLong) reasonCodes.push("SESSION_LONG");
  if (hasRecovery) reasonCodes.push("SESSION_EASY_OR_TECHNIQUE");

  return {
    sessionType,
    goal: goalFor(sessionType),
    cost,
    recoveryDemand: cost,
    injuryRisk,
    tissueTags: [...tissueTags],
    reasonCodes,
    label: planned.map((p) => p.name).join(" + "),
  };
}

function sessionText(session: PlannedSession) {
  return `${session.type ?? ""} ${session.name} ${session.description ?? ""}`;
}

function goalFor(sessionType: SessionClassification["sessionType"]): SessionClassification["goal"] {
  if (sessionType === "rehab") return "reduce_pain";
  if (sessionType === "mobility") return "restore_movement";
  if (sessionType === "recovery") return "recover";
  if (sessionType === "skill") return "build_skill";
  if (sessionType === "key_workout") return "build_fitness";
  return "build_fitness";
}
