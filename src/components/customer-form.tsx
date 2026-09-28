"use client";

import { ActionForm } from "@/components/action-form";
import { saveCustomerAction } from "@/app/actions/crm";
import { Field, Input, Textarea } from "@/components/ui";

export interface CustomerValues {
  id?: string;
  customerName?: string;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  industry?: string | null;
  numberOfUsers?: number | null;
  currentSoftware?: string | null;
  currentServer?: string | null;
  currentCloudProvider?: string | null;
  painPoints?: string | null;
  requirements?: string | null;
  notes?: string | null;
}

export function CustomerForm({ c = {} }: { c?: CustomerValues }) {
  const v = (x: string | number | null | undefined) => (x ?? "") as string;
  return (
    <ActionForm action={saveCustomerAction.bind(null, c.id ?? null)} submitLabel={c.id ? "Update Customer" : "Create Customer"} resetOnSuccess={false}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Customer Name *"><Input name="customerName" required defaultValue={v(c.customerName)} /></Field>
        <Field label="Company"><Input name="companyName" defaultValue={v(c.companyName)} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={v(c.phone)} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={v(c.email)} /></Field>
        <Field label="City"><Input name="city" defaultValue={v(c.city)} /></Field>
        <Field label="Industry"><Input name="industry" defaultValue={v(c.industry)} /></Field>
        <Field label="Number of Users"><Input name="numberOfUsers" type="number" min={0} defaultValue={v(c.numberOfUsers)} /></Field>
        <Field label="Current Software"><Input name="currentSoftware" defaultValue={v(c.currentSoftware)} /></Field>
        <Field label="Current Server"><Input name="currentServer" defaultValue={v(c.currentServer)} /></Field>
        <Field label="Current Cloud Provider"><Input name="currentCloudProvider" defaultValue={v(c.currentCloudProvider)} /></Field>
        <Field label="Address" className="md:col-span-2"><Input name="address" defaultValue={v(c.address)} /></Field>
        <Field label="Pain Points"><Textarea name="painPoints" defaultValue={v(c.painPoints)} /></Field>
        <Field label="Requirements"><Textarea name="requirements" defaultValue={v(c.requirements)} /></Field>
        <Field label="Notes"><Textarea name="notes" defaultValue={v(c.notes)} /></Field>
      </div>
    </ActionForm>
  );
}
