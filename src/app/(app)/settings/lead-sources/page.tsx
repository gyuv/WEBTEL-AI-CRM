import Link from "next/link";
import { requirePageActor } from "@/server/session";
import { listLeadSources } from "@/server/services/lead-sources";
import { sourcePerformance } from "@/server/services/analytics";
import { inr } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { AdminOnly } from "@/components/settings-nav";
import { deleteLeadSourceAction, saveLeadSourceAction, toggleLeadSourceAction } from "@/app/actions/crm";
import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LeadSourcesPage() {
  const actor = await requirePageActor();
  if (actor.role !== "ADMIN") return <AdminOnly />;
  const [sources, perf] = await Promise.all([listLeadSources(), sourcePerformance(actor)]);
  const perfMap = new Map(perf.map((p) => [p.id, p]));
  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle>Add Lead Source</CardTitle></CardHeader><CardContent>
        <ActionForm action={saveLeadSourceAction.bind(null, null)} submitLabel="Add Source">
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Name *"><Input name="name" required /></Field>
            <Field label="Description"><Input name="description" /></Field>
          </div>
        </ActionForm>
      </CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Lead Sources ({sources.length})</CardTitle><Link href="/analytics/sources" className="text-xs text-primary">Full source analytics →</Link></CardHeader>
        <Table>
          <thead><tr><Th>Name / Description</Th><Th>Status</Th><Th className="text-right">Usage (leads)</Th><Th className="text-right">Won</Th><Th className="text-right">Sales</Th><Th className="text-right">Conv.</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {sources.map((s) => {
              const p = perfMap.get(s.id);
              return (
                <tr key={s.id}>
                  <Td>
                    <ActionForm action={saveLeadSourceAction.bind(null, s.id)} submitLabel="Save" resetOnSuccess={false} className="flex flex-wrap items-end gap-1">
                      <Input name="name" defaultValue={s.name} className="h-8 w-44" />
                      <Input name="description" defaultValue={s.description ?? ""} className="h-8 w-52" placeholder="Description" />
                      <input type="hidden" name="active" value={String(s.active)} />
                    </ActionForm>
                  </Td>
                  <Td><Badge tone={s.active ? "COMPLETED" : "LOST"}>{s.active ? "Active" : "Disabled"}</Badge></Td>
                  <Td className="text-right">{s._count.leads}</Td>
                  <Td className="text-right">{p?.won ?? 0}</Td>
                  <Td className="text-right">{inr(p?.totalSales ?? 0)}</Td>
                  <Td className="text-right">{p?.conversionRate ?? 0}%</Td>
                  <Td>
                    <div className="flex gap-1">
                      <ActionForm action={toggleLeadSourceAction.bind(null, s.id, !s.active)} submitLabel={s.active ? "Disable" : "Enable"} />
                      {s._count.leads === 0 && <ActionForm action={deleteLeadSourceAction.bind(null, s.id)} submitLabel="Delete" confirm={`Delete "${s.name}"?`} />}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="p-3 text-xs text-muted-foreground">Sources already used by leads cannot be deleted — disable them to hide them from new leads while keeping history intact.</p>
      </Card>
    </div>
  );
}
