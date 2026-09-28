import { NextResponse } from "next/server";
import { ctx } from "@/lib/server/core";
import { importPeopleCsv } from "@/lib/server/people-import";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { userId } = await ctx();
  const form = await req.formData();
  const file = form.get("file");
  const text = file instanceof File ? await file.text() : String(form.get("text") ?? "");
  if (!text.trim()) return NextResponse.json({ error: "Empty file" }, { status: 400 });
  return NextResponse.json(await importPeopleCsv(userId, text));
}
