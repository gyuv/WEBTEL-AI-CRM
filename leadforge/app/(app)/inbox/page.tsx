import { desc, eq } from "drizzle-orm";
import { Inbox } from "lucide-react";
import { ctx, getApiKey } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { PasteReply, MessageRow, SyncButton } from "./inbox-client";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const { db, userId } = await ctx();
  const gmail = Boolean(await getApiKey("gmail_refresh", userId));
  const msgs = await db.select({ m: schema.messages, lead: { id: schema.leads.id, name: schema.leads.name, status: schema.leads.status } })
    .from(schema.messages).leftJoin(schema.leads, eq(schema.leads.id, schema.messages.leadId)).where(eq(schema.messages.userId, userId)).orderBy(desc(schema.messages.receivedAt)).limit(100);
  const leads = await db.select({ id: schema.leads.id, name: schema.leads.name }).from(schema.leads).where(eq(schema.leads.userId, userId)).orderBy(schema.leads.name).limit(2000);
  return (
    <>
      <PageHeader title="Inbox & replies" description={gmail ? "Gmail connected (read-only). Replies sync automatically via cron." : "No Gmail connected — paste replies below. Connect Gmail in Settings for auto-sync."} actions={gmail ? <SyncButton /> : <Badge>Paste mode</Badge>} />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit"><CardHeader title="Paste a reply" description="AI classifies it, updates the lead status and drafts replies." /><PasteReply leads={leads} /></Card>
        <div className="space-y-3">
          {msgs.length ? msgs.map(({ m, lead }) => <MessageRow key={m.id} m={{ id: m.id, from: m.fromAddress, subject: m.subject, body: m.body, classification: m.classification, confidence: m.confidence, summary: m.summary, source: m.source, receivedAt: m.receivedAt.toISOString() }} lead={lead?.id ? lead : null} />)
            : <EmptyState icon={<Inbox />} title="No replies yet" description="When prospects reply, paste the text here (or connect Gmail) to classify and track them." />}
        </div>
      </div>
    </>
  );
}
