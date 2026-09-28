import { NextResponse, after } from "next/server";
import { ctx } from "@/lib/server/core";
import { runJobs } from "@/lib/server/jobs";

export async function POST() {
  await ctx();
  after(() => runJobs(25000).catch(() => undefined));
  return NextResponse.json({ ok: true });
}
