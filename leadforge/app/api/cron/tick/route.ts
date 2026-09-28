import { NextResponse } from "next/server";
import { runJobs } from "@/lib/server/jobs";
import { detectCold } from "@/lib/server/inbox";
import { enqueue } from "@/lib/server/jobs";
import { getApiKey } from "@/lib/server/core";

export const maxDuration = 60;

/** Called by Vercel Cron / GitHub Actions / pg_cron. Protected by CRON_SECRET when set. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = "owner";
  if (await getApiKey("gmail_refresh", userId)) await enqueue(userId, "inbox_sync", {}, `inbox:${new Date().toISOString().slice(0, 13)}`);
  const cold = await detectCold(userId);
  const jobs = await runJobs(45000);
  return NextResponse.json({ ok: true, ...jobs, ...cold });
}
