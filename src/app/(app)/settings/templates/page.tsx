import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { ActionForm } from "@/components/action-form";
import { saveTemplateAction } from "@/app/actions/crm";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const actor = await requirePageActor();
  const templates = await prisma.messageTemplate.findMany({ orderBy: { name: "asc" } });
  const isAdmin = actor.role === "ADMIN";
  const fields = (t?: (typeof templates)[number]) => (
    <div className="grid gap-2 md:grid-cols-3">
      <Field label="Name"><Input name="name" defaultValue={t?.name} required disabled={!isAdmin} /></Field>
      <Field label="Channel"><Select name="channel" defaultValue={t?.channel ?? "WHATSAPP"} disabled={!isAdmin}><option>WHATSAPP</option><option>EMAIL</option></Select></Field>
      <Field label="Body ({{name}}, {{date}}, {{me}} placeholders)" className="md:col-span-3"><Textarea name="body" rows={3} defaultValue={t?.body} required disabled={!isAdmin} /></Field>
    </div>
  );
  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card><CardHeader><CardTitle>New Template</CardTitle></CardHeader><CardContent>
          <ActionForm action={saveTemplateAction.bind(null, null)} submitLabel="Add Template">{fields()}</ActionForm>
        </CardContent></Card>
      )}
      {templates.map((t) => (
        <Card key={t.id} className="p-4">
          {isAdmin ? <ActionForm action={saveTemplateAction.bind(null, t.id)} resetOnSuccess={false}>{fields(t)}</ActionForm> : fields(t)}
        </Card>
      ))}
    </div>
  );
}
