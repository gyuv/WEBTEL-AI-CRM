import { desc, eq } from "drizzle-orm";
import { Bell } from "lucide-react";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { Card, EmptyState, PageHeader, Badge } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { markNotificationsRead } from "@/app/actions";
import { timeAgo } from "@/lib/utils";

export default async function Notifications() {
  const { db, userId } = await ctx();
  const items = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt)).limit(100);
  return (
    <>
      <PageHeader title="Notifications" actions={<ActionButton action={markNotificationsRead} success="Marked as read">Mark all read</ActionButton>} />
      {items.length ? (
        <Card className="divide-y divide-border">
          {items.map((n) => (
            <a key={n.id} href={n.leadId ? `/leads/${n.leadId}` : "#"} className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/50 ${n.readAt ? "opacity-60" : ""}`}>
              <Badge tone={n.kind === "error" ? "danger" : n.kind === "status" || n.kind === "reply" ? "success" : "default"}>{n.kind}</Badge>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{n.title}</p>{n.body && <p className="text-xs text-muted-fg">{n.body}</p>}</div>
              <span className="text-[11px] text-muted-fg">{timeAgo(n.createdAt)}</span>
            </a>
          ))}
        </Card>
      ) : <EmptyState icon={<Bell />} title="No notifications" />}
    </>
  );
}
