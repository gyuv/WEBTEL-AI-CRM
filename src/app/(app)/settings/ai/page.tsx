import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { getSetting } from "@/server/services/settings";
import { aiConfigured } from "@/server/ai/assistant";
import { fmtDateTime } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { saveSettingAction } from "@/app/actions/crm";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const actor = await requirePageActor();
  const s = await getSetting("ai");
  const history = await prisma.aiInteraction.findMany({
    where: actor.role === "ADMIN" ? {} : { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true } }, lead: { select: { name: true } } },
  });
  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle>AI Configuration</CardTitle></CardHeader><CardContent>
        <p className="mb-3 text-sm">API key status: <b>{aiConfigured() ? "Configured on server" : "Not configured — set OPENAI_API_KEY in the server environment"}</b>. Keys are never sent to the browser.</p>
        {actor.role === "ADMIN" ? (
          <ActionForm action={saveSettingAction.bind(null, "ai")} resetOnSuccess={false}>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={s.enabled} /> AI features enabled</label>
              <Field label="Model override (blank = OPENAI_MODEL env)"><Input name="model" defaultValue={s.model} /></Field>
              <Field label="Temperature (0–1)"><Input name="temperature" inputMode="decimal" defaultValue={s.temperature} /></Field>
            </div>
          </ActionForm>
        ) : <p className="text-sm text-muted-foreground">Only admins can change AI settings.</p>}
      </CardContent></Card>
      <Card>
        <CardHeader><CardTitle>AI Usage History (audit)</CardTitle></CardHeader>
        <Table>
          <thead><tr><Th>When</Th><Th>User</Th><Th>Type</Th><Th>Lead</Th><Th>Model</Th><Th>Response</Th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}><Td className="whitespace-nowrap text-xs">{fmtDateTime(h.createdAt)}</Td><Td>{h.user.name}</Td><Td className="text-xs">{h.interactionType}</Td><Td>{h.lead?.name ?? "—"}</Td><Td className="text-xs">{h.model}</Td><Td className="max-w-md truncate text-xs">{h.response}</Td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
