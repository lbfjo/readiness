import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { stravaActivities, type StravaActivity } from "@/lib/db/schema";

export async function getStravaActivity(activityId: string): Promise<StravaActivity | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(stravaActivities)
    .where(eq(stravaActivities.activityId, activityId))
    .limit(1);
  return rows[0] ?? null;
}
