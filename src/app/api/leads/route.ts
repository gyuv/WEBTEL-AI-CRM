import { NextResponse } from "next/server";
import { withActor } from "@/server/http";
import { createLead, listLeads } from "@/server/services/leads";

export const GET = withActor(async (actor, req: Request) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return NextResponse.json(await listLeads(actor, params));
});

export const POST = withActor(async (actor, req: Request) => {
  const lead = await createLead(actor, await req.json());
  return NextResponse.json(lead, { status: 201 });
});
