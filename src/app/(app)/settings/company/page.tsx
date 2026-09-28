import { requirePageActor } from "@/server/session";
import { getSetting } from "@/server/services/settings";
import { ActionForm } from "@/components/action-form";
import { AdminOnly } from "@/components/settings-nav";
import { saveSettingAction } from "@/app/actions/crm";
import { Card, Field, Input, Textarea } from "@/components/ui";

export default async function CompanyPage() {
  const actor = await requirePageActor();
  const c = await getSetting("company");
  if (actor.role !== "ADMIN") return <AdminOnly />;
  return (
    <Card className="p-4">
      <ActionForm action={saveSettingAction.bind(null, "company")} resetOnSuccess={false}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Company Name"><Input name="name" defaultValue={c.name} /></Field>
          <Field label="GSTIN"><Input name="gstin" defaultValue={c.gstin} /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={c.phone} /></Field>
          <Field label="Email"><Input name="email" defaultValue={c.email} /></Field>
          <Field label="Website"><Input name="website" defaultValue={c.website} /></Field>
          <Field label="Address"><Textarea name="address" defaultValue={c.address} /></Field>
        </div>
      </ActionForm>
    </Card>
  );
}
