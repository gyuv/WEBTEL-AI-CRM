import { NextResponse } from "next/server";
import { withActor } from "@/server/http";
import { runAssist } from "@/server/ai/assistant";

export const POST = withActor(async (actor, req: Request) => {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await runAssist(actor, body));
});
