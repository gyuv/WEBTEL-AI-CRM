import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { ctx } from "@/lib/server/core";
import { toCsv } from "@/lib/outreach/render";

/** Converts an uploaded .xlsx into CSV text (first sheet) for the discovery pipeline. */
export async function POST(req: Request) {
  await ctx();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (10MB max)" }, { status: 400 });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const header: string[] = [];
  const out: Record<string, unknown>[] = [];
  ws.eachRow((row, i) => {
    const vals = (row.values as unknown[]).slice(1).map((v) => (v && typeof v === "object" && "text" in (v as object) ? (v as { text: string }).text : v ?? ""));
    if (i === 1) header.push(...vals.map(String));
    else out.push(Object.fromEntries(header.map((h, j) => [h, vals[j]])));
  });
  return NextResponse.json({ csv: toCsv(out), rows: out.length });
}
