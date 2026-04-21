import { NextResponse } from "next/server";
import { z } from "zod";
import {
  JOB_KINDS,
  enqueueJob,
  getLatestJob,
  type JobKind,
} from "@/lib/contracts/jobs";

/**
 * Job queue entrypoint.
 *
 * POST /api/jobs        → enqueue a job, returns the newly-created row.
 * GET  /api/jobs?kind=.. → latest job (optionally filtered by kind).
 *
 * Authorisation piggy-backs on the existing `app_access` cookie gate in
 * `proxy.ts`, so these handlers only run for authenticated single-user
 * requests in production.
 */

export const dynamic = "force-dynamic";

const EnqueueSchema = z.object({
  kind: z.enum(JOB_KINDS),
  payload: z.record(z.string(), z.unknown()).optional(),
  requestedBy: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = EnqueueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const row = await enqueueJob(parsed.data);
    return NextResponse.json({ job: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "enqueue failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL not configured" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const kindsParam = url.searchParams.getAll("kind");
  const kinds = kindsParam.length > 0 ? (kindsParam as JobKind[]) : null;
  if (kinds && kinds.some((k) => !JOB_KINDS.includes(k))) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }

  try {
    const job = await getLatestJob(kinds);
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "lookup failed" },
      { status: 500 },
    );
  }
}
