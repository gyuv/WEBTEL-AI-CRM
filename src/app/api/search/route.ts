import { NextResponse } from "next/server";
import { withActor } from "@/server/http";
import { globalSearch } from "@/server/services/search";

export const GET = withActor(async (actor, req: Request) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ results: await globalSearch(actor, q) });
});
