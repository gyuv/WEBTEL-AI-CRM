import { requirePageActor } from "@/server/session";
import { getSetting } from "@/server/services/settings";
import { ActionForm } from "@/components/action-form";
import { AdminOnly } from "@/components/settings-nav";
import { saveSettingAction } from "@/app/actions/crm";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea } from "@/components/ui";

export default async function QuotationSettingsPage() {
  const actor = await requirePageActor();
  if (actor.role !== "ADMIN") return <AdminOnly />;
  const [gst, q] = await Promise.all([getSetting("gst"), getSetting("quotation")]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>GST</CardTitle></CardHeader><CardContent>
        <ActionForm action={saveSettingAction.bind(null, "gst")} resetOnSuccess={false}>
          <Field label="Default GST %"><Input name="defaultPercentage" inputMode="decimal" defaultValue={gst.defaultPercentage} /></Field>
        </ActionForm>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Quotation</CardTitle></CardHeader><CardContent>
        <ActionForm action={saveSettingAction.bind(null, "quotation")} resetOnSuccess={false}>
          <Field label="Number prefix (e.g. WT/Q → WT/Q/2026-27/0001)"><Input name="prefix" defaultValue={q.prefix} /></Field>
          <Field label="Validity (days)" className="mt-2"><Input name="validityDays" type="number" defaultValue={q.validityDays} /></Field>
          <Field label="Default terms & conditions" className="mt-2"><Textarea rows={5} name="terms" defaultValue={q.terms} /></Field>
        </ActionForm>
      </CardContent></Card>
    </div>
  );
}
