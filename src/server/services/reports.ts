import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import type { LeadFilter } from "@/lib/validators";
import type { Actor } from "@/server/session";
import { buildLeadWhere } from "./leads";

export const REPORT_COLUMNS = [
  "Lead Name",
  "Company",
  "Phone",
  "Email",
  "Lead Source",
  "Source Details",
  "Campaign",
  "Status",
  "Priority",
  "Estimated Value",
  "Assigned User",
  "Created Date",
  "Last Activity",
  "Next Follow-up",
] as const;

export type ReportRow = Record<(typeof REPORT_COLUMNS)[number], string | number>;

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");

export async function leadReportRows(actor: Actor, f: Partial<LeadFilter>): Promise<ReportRow[]> {
  const leads = await prisma.lead.findMany({
    where: buildLeadWhere(actor, f),
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: {
      leadSource: true,
      assignedUser: { select: { name: true } },
      activities: { orderBy: { activityDate: "desc" }, take: 1, select: { activityDate: true } },
      followups: { where: { status: "PENDING" }, orderBy: { followupDate: "asc" }, take: 1, select: { followupDate: true } },
    },
  });
  return leads.map((l) => ({
    "Lead Name": l.name,
    Company: l.companyName ?? "",
    Phone: l.phone ?? "",
    Email: l.email ?? "",
    "Lead Source": l.leadSource.name,
    "Source Details": [l.leadSourceDetails, l.referralName].filter(Boolean).join(" | "),
    Campaign: l.campaignName ?? "",
    Status: l.status,
    Priority: l.priority,
    "Estimated Value": Number(l.estimatedValue),
    "Assigned User": l.assignedUser?.name ?? "",
    "Created Date": d(l.createdAt),
    "Last Activity": d(l.activities[0]?.activityDate),
    "Next Follow-up": d(l.followups[0]?.followupDate),
  }));
}

/** RFC 4180 CSV, with formula-injection protection for spreadsheet apps. */
export function toCsv(rows: ReportRow[]): string {
  const esc = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [REPORT_COLUMNS.join(",")];
  for (const r of rows) lines.push(REPORT_COLUMNS.map((c) => esc(r[c])).join(","));
  return "﻿" + lines.join("\r\n");
}

export async function toXlsx(rows: ReportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Webtel AI Sales Assistant";
  const ws = wb.addWorksheet("Leads");
  ws.columns = REPORT_COLUMNS.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 4) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.getColumn("Estimated Value").numFmt = "#,##0.00";
  return Buffer.from(await wb.xlsx.writeBuffer());
}
