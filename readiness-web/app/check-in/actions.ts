"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { upsertCheckin } from "@/lib/contracts/checkin";
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
