import { NextResponse } from "next/server";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { runJobs } from "@/lib/server/jobs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId } = await ctx();
  const [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, userId)));
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (new URL(req.url).searchParams.get("run") && (job.status === "queued" || job.status === "running")) after(() => runJobs(20000).catch(() => undefined));
  return NextResponse.json({ status: job.status, progress: job.progress, progressMsg: job.progressMsg, error: job.error, result: job.result });
}
