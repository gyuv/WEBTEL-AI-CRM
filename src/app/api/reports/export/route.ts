import { withActor } from "@/server/http";
import { leadFilterSchema } from "@/lib/validators";
import { leadReportRows, toCsv, toXlsx } from "@/server/services/reports";

export const GET = withActor(async (actor, req: Request) => {
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams);
  const filter = leadFilterSchema.parse(params);
  const rows = await leadReportRows(actor, filter);
  const stamp = new Date().toISOString().slice(0, 10);
  if (params.format === "xlsx") {
    const buf = await toXlsx(rows);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="lead-report-${stamp}.xlsx"`,
      },
    });
  }
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lead-report-${stamp}.csv"` },
  });
});
