"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { saveLeadAction } from "@/app/actions/crm";
import { leadStatusValues, priorityValues } from "@/lib/validators";
import { label } from "@/lib/format";
import { sourceDetailFieldFor } from "@/lib/source-fields";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  companyName: z.string().optional(),
  phone: z.string().regex(/^$|^[+0-9 ()-]{6,20}$/, "Invalid phone").optional(),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  leadSourceId: z.string().min(1, "Lead source is required"),
  leadSourceDetails: z.string().optional(),
  campaignName: z.string().optional(),
  referralName: z.string().optional(),
  assignedUserId: z.string().optional(),
  status: z.enum(leadStatusValues),
  priority: z.enum(priorityValues),
  estimatedValue: z.string().regex(/^$|^\d+(\.\d{1,2})?$/, "Enter a valid amount").optional(),
  notes: z.string().optional(),
  interestedProductIds: z.array(z.string()),
});
type FormValues = z.infer<typeof formSchema>;

export function LeadForm({
  lead,
  sources,
  users,
  products,
  isAdmin,
}: {
  lead?: Partial<FormValues> & { id: string };
  sources: { id: string; name: string; active: boolean }[];
  users: { id: string; name: string }[];
  products: { id: string; productName: string }[];
  isAdmin: boolean;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      status: "NEW",
      priority: "MEDIUM",
      interestedProductIds: [],
      ...lead,
    },
  });
  const sourceId = watch("leadSourceId");
  const sourceName = sources.find((s) => s.id === sourceId)?.name;
  const extra = sourceDetailFieldFor(sourceName);
  // Disabled sources are hidden for new leads, but an existing lead keeps its historical source.
  const selectable = sources.filter((s) => s.active || s.id === lead?.leadSourceId);

  const onSubmit = (v: FormValues) =>
    start(async () => {
      setServerError(null);
      const res = await saveLeadAction(lead?.id ?? null, v);
      if (!res.ok) setServerError(res.error);
      else if (res.redirect) window.location.href = res.redirect;
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <Field label="Contact Name *" error={errors.name?.message}><Input {...register("name")} /></Field>
        <Field label="Company Name"><Input {...register("companyName")} /></Field>
        <Field label="Phone" error={errors.phone?.message}><Input {...register("phone")} /></Field>
        <Field label="Email" error={errors.email?.message}><Input type="email" {...register("email")} /></Field>
        <Field label="City"><Input {...register("city")} /></Field>
        <Field label="State"><Input {...register("state")} /></Field>
        <Field label="Industry"><Input {...register("industry")} /></Field>
        <Field label="Company Size (employees / users)"><Input {...register("companySize")} /></Field>
      </Card>

      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <Field label="Lead Source *" error={errors.leadSourceId?.message}>
          <Select {...register("leadSourceId")}>
            <option value="">Select source…</option>
            {selectable.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (disabled)"}</option>)}
          </Select>
        </Field>
        {extra && (
          <Field label={extra.label}>
            <Input {...register(extra.field)} placeholder={extra.placeholder} />
          </Field>
        )}
        {extra?.field !== "campaignName" && (
          <Field label="Campaign Name (optional)"><Input {...register("campaignName")} /></Field>
        )}
        {extra?.field !== "leadSourceDetails" && (
          <Field label="Additional Source Details (optional)"><Input {...register("leadSourceDetails")} /></Field>
        )}
      </Card>

      <Card className="grid gap-3 p-4 md:grid-cols-4">
        <Field label="Status">
          <Select {...register("status")}>{leadStatusValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
        </Field>
        <Field label="Priority">
          <Select {...register("priority")}>{priorityValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
        </Field>
        <Field label="Estimated Value (₹)" error={errors.estimatedValue?.message}><Input inputMode="decimal" {...register("estimatedValue")} /></Field>
        <Field label="Assigned To">
          <Select {...register("assignedUserId")} disabled={!isAdmin}>
            <option value="">{isAdmin ? "Unassigned" : "Me"}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Products of Interest" className="md:col-span-4">
          <div className="flex flex-wrap gap-3">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" value={p.id} {...register("interestedProductIds")} /> {p.productName}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Notes" className="md:col-span-4"><Textarea rows={3} {...register("notes")} /></Field>
      </Card>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : lead ? "Update Lead" : "Create Lead"}</Button>
    </form>
  );
}
