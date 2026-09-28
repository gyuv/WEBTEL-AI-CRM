import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { toCsv } from "@/lib/outreach/render";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const kind = url.searchParams.get("kind") ?? "leads";
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  const { db, userId } = await ctx();
  let rows: Record<string, unknown>[] = [];
  if (kind === "json") {
    const dump: Record<string, unknown> = {};
    for (const [k, t] of Object.entries({ leads: schema.leads, lead_phones: schema.leadPhones, lead_emails: schema.leadEmails, lead_people: schema.leadPeople, lead_insights: schema.leadInsights, products: schema.products, templates: schema.templates, call_logs: schema.callLogs, outreach_log: schema.outreachLog, messages: schema.messages, notes: schema.notes, tasks: schema.tasks, status_history: schema.statusHistory, suppression_list: schema.suppressionList, source_records: schema.sourceRecords })) {
      dump[k] = await db.select().from(t).where(eq((t as typeof schema.leads).userId, userId));
    }
    return new NextResponse(JSON.stringify(dump, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="leadforge-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
  }
  const where = ids.length ? and(eq(schema.leads.userId, userId), inArray(schema.leads.id, ids)) : eq(schema.leads.userId, userId);
  const leads = await db.select().from(schema.leads).where(where);
  const lids = leads.map((l) => l.id);
  const [phones, emails, people] = lids.length ? await Promise.all([
    db.select().from(schema.leadPhones).where(inArray(schema.leadPhones.leadId, lids)),
    db.select().from(schema.leadEmails).where(inArray(schema.leadEmails.leadId, lids)),
    db.select().from(schema.leadPeople).where(inArray(schema.leadPeople.leadId, lids)),
  ]) : [[], [], []];
  if (kind === "mailmerge") {
    // One row per person (or company) for Gmail/Outlook mail-merge. Excludes guessed emails unless nothing else exists; labels them.
    const sup = new Set((await db.select().from(schema.suppressionList).where(eq(schema.suppressionList.userId, userId))).map((s) => s.value));
    for (const l of leads) {
      const found = emails.filter((e) => e.leadId === l.id && !sup.has(e.email));
      const best = found.find((e) => e.kind === "found") ?? found[0];
      const ppl = people.filter((p) => p.leadId === l.id).sort((a, b) => b.dmScore - a.dmScore);
      const top = ppl[0];
      if (!best && !top?.guessedEmail) continue;
      rows.push({ email: best?.email ?? top?.guessedEmail, email_type: best ? best.kind : "guessed", first_name: top?.fullName.split(" ")[0] ?? "", full_name: top?.fullName ?? "", title: top?.title ?? "", company: l.name, category: l.category, city: l.city, area: l.area });
    }
  } else {
    rows = leads.map((l) => ({
      name: l.name, status: l.status, score: l.score, category: l.category, area: l.area, city: l.city, pincode: l.pincode, address: l.address, website: l.website,
      phones: phones.filter((p) => p.leadId === l.id).map((p) => `${p.e164} (${p.kind})`).join("; "),
      emails: emails.filter((e) => e.leadId === l.id).map((e) => `${e.email} (${e.kind === "guessed" ? `guessed ${e.confidence}%` : "found"})`).join("; "),
      people: people.filter((p) => p.leadId === l.id).map((p) => `${p.fullName} - ${p.title ?? ""}`).join("; "),
      rating: l.rating, reviews: l.reviewsCount, source: l.primarySource, dnd_checked: l.dndChecked, do_not_call: l.doNotCall, created_at: l.createdAt.toISOString(),
    }));
  }
  const name = `leadforge-${kind}-${new Date().toISOString().slice(0, 10)}`;
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(kind);
    const cols = rows[0] ? Object.keys(rows[0]) : ["name"];
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 4)) }));
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as ArrayBuffer, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}.xlsx"` } });
  }
  return new NextResponse(toCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"` } });
}
