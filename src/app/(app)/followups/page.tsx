import Link from "next/link";
import { requirePageActor } from "@/server/session";
import { listFollowups, type FollowupBucket } from "@/server/services/crm";
import { fmtDate, label } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { setFollowupStatusAction } from "@/app/actions/crm";
import { Badge, buttonVariants, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";
const BUCKETS: FollowupBucket[] = ["today", "overdue", "upcoming", "completed", "all"];

export default async function FollowupsPage({ searchParams }: { searchParams: Promise<{ bucket?: string }> }) {
  const actor = await requirePageActor();
  const { bucket: b } = await searchParams;
  const bucket = (BUCKETS.includes(b as FollowupBucket) ? b : "today") as FollowupBucket;
  const rows = await listFollowups(actor, bucket);
  return (
    <div>
      <PageHeader title="Follow-ups" description="Schedule follow-ups from a lead or customer page" />
      <div className="mb-3 flex flex-wrap gap-2">
        {BUCKETS.map((x) => (
          <Link key={x} href={`/followups?bucket=${x}`} className={buttonVariants({ variant: x === bucket ? "default" : "outline", size: "sm" })}>{label(x)}</Link>
        ))}
      </div>
      <Card>
        <Table>
          <thead><tr><Th>Date</Th><Th>Time</Th><Th>Type</Th><Th>Lead / Customer</Th><Th>Message</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <Td className="whitespace-nowrap">{fmtDate(f.followupDate)}</Td>
                <Td>{f.reminderTime}</Td>
                <Td><Badge>{f.followupType}</Badge></Td>
                <Td>
                  {f.lead ? <Link className="text-primary hover:underline" href={`/leads/${f.lead.id}`}>{f.lead.name}</Link> : f.customer && <Link className="text-primary hover:underline" href={`/customers/${f.customer.id}`}>{f.customer.customerName}</Link>}
                  <div className="text-xs text-muted-foreground">{f.lead?.companyName ?? f.customer?.companyName} {f.lead?.phone}</div>
                </Td>
                <Td>{f.message}</Td>
                <Td><Badge>{f.status}</Badge></Td>
                <Td>
                  {f.status === "PENDING" && (
                    <div className="flex gap-1">
                      <ActionForm action={setFollowupStatusAction.bind(null, f.id, "COMPLETED")} submitLabel="Done" />
                      <ActionForm action={setFollowupStatusAction.bind(null, f.id, "CANCELLED")} submitLabel="Cancel" />
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!rows.length && <Empty>No follow-ups in this view.</Empty>}
      </Card>
    </div>
  );
}
