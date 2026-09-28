import { NextResponse } from "next/server";
import { withActor } from "@/server/http";
import { listFollowups } from "@/server/services/crm";

/** Follow-up reminders: overdue + due today. */
export const GET = withActor(async (actor) => {
  const [overdue, today] = await Promise.all([listFollowups(actor, "overdue"), listFollowups(actor, "today")]);
  return NextResponse.json({
    count: overdue.length + today.length,
    items: [...overdue, ...today].slice(0, 20).map((f) => ({
      id: f.id,
      date: f.followupDate,
      type: f.followupType,
      message: f.message,
      overdue: overdue.includes(f),
      name: f.lead?.name ?? f.customer?.customerName ?? "",
      href: f.leadId ? `/leads/${f.leadId}` : `/customers/${f.customerId}`,
    })),
  });
});
