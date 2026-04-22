"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { upsertCheckin } from "@/lib/contracts/checkin";
import { upsertIssueCheckin } from "@/lib/contracts/issue";
import { todayIsoDate } from "@/lib/time";

/**
 * Server action for the check-in form. We keep validation strict (1-5 Likert,
 * illness boolean, notes trimmed) so garbage never reaches Postgres. On
 * success we revalidate `/today` and `/check-in` so both pages reflect the
 * new row without a hard refresh.
 */

const OptionalLikert = z
  .union([z.string().length(0), z.coerce.number().int().min(1).max(5)])
  .optional()
  .transform((v) => (typeof v === "number" ? v : null));

const OptionalPain = z
  .union([z.string().length(0), z.coerce.number().int().min(0).max(10)])
  .optional()
  .transform((v) => (typeof v === "number" ? v : null));

const OptionalInteger = z
  .union([z.string().length(0), z.coerce.number().int().min(0).max(180)])
  .optional()
  .transform((v) => (typeof v === "number" ? v : null));

const Schema = z.object({
  date: z
    .string()
    .regex(/^\d{8}$/u, "date must be YYYYMMDD")
    .default(() => todayIsoDate()),
  energy: OptionalLikert,
  mood: OptionalLikert,
  soreness: OptionalLikert,
  stress: OptionalLikert,
  illness: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
    .optional()
    .transform((v) => (v === "on" || v === "true" || v === "1" ? 1 : 0)),
  notes: z
    .string()
    .max(2000, "notes too long")
    .optional()
    .transform((v) => {
      const trimmed = v?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    }),
  issueId: z
    .union([z.string().length(0), z.coerce.number().int().positive()])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  firstStepPain: OptionalPain,
  painWalking: OptionalPain,
  painStairs: OptionalPain,
  morningStiffnessMinutes: OptionalInteger,
  limp: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === "1"),
  warmupResponse: z
    .union([z.literal(""), z.literal("better"), z.literal("same"), z.literal("worse")])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  issueNotes: z
    .string()
    .max(1000, "issue notes too long")
    .optional()
    .transform((v) => {
      const trimmed = v?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    }),
});

export type CheckinActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  date?: string;
  fieldErrors?: Record<string, string>;
};

export async function saveCheckin(
  _prev: CheckinActionState,
  formData: FormData,
): Promise<CheckinActionState> {
  const raw = {
    date: formData.get("date")?.toString() || todayIsoDate(),
    energy: formData.get("energy")?.toString() || undefined,
    mood: formData.get("mood")?.toString() || undefined,
    soreness: formData.get("soreness")?.toString() || undefined,
    stress: formData.get("stress")?.toString() || undefined,
    illness: formData.get("illness")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined,
    issueId: formData.get("issueId")?.toString() || undefined,
    firstStepPain: formData.get("firstStepPain")?.toString() || undefined,
    painWalking: formData.get("painWalking")?.toString() || undefined,
    painStairs: formData.get("painStairs")?.toString() || undefined,
    morningStiffnessMinutes:
      formData.get("morningStiffnessMinutes")?.toString() || undefined,
    limp: formData.get("limp")?.toString() || undefined,
    warmupResponse: formData.get("warmupResponse")?.toString() || undefined,
    issueNotes: formData.get("issueNotes")?.toString() || undefined,
  };

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      status: "error",
      message: "Couldn't save check-in. Check the highlighted fields.",
      fieldErrors,
    };
  }

  if (!process.env.DATABASE_URL) {
    return {
      status: "error",
      message: "Database not configured. Set DATABASE_URL in .env.local.",
    };
  }

  try {
    const row = await upsertCheckin({
      date: parsed.data.date,
      energy: parsed.data.energy ?? undefined,
      mood: parsed.data.mood ?? undefined,
      soreness: parsed.data.soreness ?? undefined,
      stress: parsed.data.stress ?? undefined,
      illness: parsed.data.illness,
      notes: parsed.data.notes ?? undefined,
    });

    if (parsed.data.issueId) {
      await upsertIssueCheckin({
        issueId: parsed.data.issueId,
        date: parsed.data.date,
        firstStepPain: parsed.data.firstStepPain,
        painWalking: parsed.data.painWalking,
        painStairs: parsed.data.painStairs,
        morningStiffnessMinutes: parsed.data.morningStiffnessMinutes,
        limp: parsed.data.limp,
        warmupResponse: parsed.data.warmupResponse,
        notes: parsed.data.issueNotes,
      });
    }

    revalidatePath("/check-in");
    revalidatePath("/today");

    return {
      status: "success",
      message: "Check-in saved. Next score refresh will pick it up.",
      date: row.date,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Failed to save check-in",
    };
  }
}
