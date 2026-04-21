import { NextResponse } from "next/server";
import { getJob } from "@/lib/contracts/jobs";

/**
 * Per-job status endpoint used by the `/today` refresh button for polling.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL not configured" },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  const jobId = Number.parseInt(id, 10);
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "lookup failed" },
      { status: 500 },
    );
  }
}
