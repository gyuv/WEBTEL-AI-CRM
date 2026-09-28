"use client";

import { ActionForm } from "@/components/action-form";
import { createActivityAction, createFollowupAction, createMeetingAction, createOpportunityAction, createSaleAction } from "@/app/actions/crm";
import { activityTypeValues, opportunityStageValues, paymentStatusValues } from "@/lib/validators";
import { label } from "@/lib/format";
import { Field, Input, Select, Textarea } from "@/components/ui";

type Parent = { leadId?: string; customerId?: string };
function Hidden({ leadId, customerId }: Parent) {
  return (
    <>
      {leadId && <input type="hidden" name="leadId" value={leadId} />}
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
    </>
  );
}
const today = () => new Date().toISOString().slice(0, 10);

export function ActivityForm(p: Parent) {
  return (
    <ActionForm action={createActivityAction} submitLabel="Add Activity">
      <Hidden {...p} />
      <div className="grid gap-2 md:grid-cols-4">
        <Field label="Type"><Select name="activityType">{activityTypeValues.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
        <Field label="Subject *" className="md:col-span-2"><Input name="subject" required /></Field>
        <Field label="Date"><Input type="date" name="activityDate" defaultValue={today()} /></Field>
        <Field label="Status"><Select name="status"><option value="COMPLETED">Completed</option><option value="PLANNED">Planned</option></Select></Field>
        <Field label="Next Follow-up (creates reminder)"><Input type="date" name="nextFollowupDate" /></Field>
        <Field label="Description / Notes" className="md:col-span-2"><Textarea name="description" rows={2} /></Field>
      </div>
    </ActionForm>
  );
}

export function MeetingForm(p: Parent) {
  return (
    <ActionForm action={createMeetingAction} submitLabel="Save Meeting / Demo">
      <Hidden {...p} />
      <div className="grid gap-2 md:grid-cols-3">
        <Field label="Date & Time *"><Input type="datetime-local" name="meetingDate" required /></Field>
        <Field label="Type"><Select name="meetingType"><option>DEMO</option><option>IN_PERSON</option><option>ONLINE</option><option>PHONE</option><option>SITE_VISIT</option></Select></Field>
        <Field label="Follow-up Date"><Input type="date" name="followupDate" /></Field>
        <Field label="Customer Requirements"><Textarea name="customerRequirements" rows={2} /></Field>
        <Field label="Objections"><Textarea name="objections" rows={2} /></Field>
        <Field label="Products Discussed"><Textarea name="productsDiscussed" rows={2} /></Field>
        <Field label="Notes" className="md:col-span-2"><Textarea name="notes" rows={2} /></Field>
        <Field label="Next Steps"><Textarea name="nextSteps" rows={2} /></Field>
      </div>
    </ActionForm>
  );
}

export function FollowupForm(p: Parent & { defaultMessage?: string }) {
  return (
    <ActionForm action={createFollowupAction} submitLabel="Schedule Follow-up">
      <Hidden {...p} />
      <div className="grid gap-2 md:grid-cols-4">
        <Field label="Date *"><Input type="date" name="followupDate" required defaultValue={today()} /></Field>
        <Field label="Reminder Time"><Input type="time" name="reminderTime" /></Field>
        <Field label="Type"><Select name="followupType">{activityTypeValues.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
        <Field label="Message"><Input name="message" defaultValue={p.defaultMessage} /></Field>
      </div>
    </ActionForm>
  );
}

export function OpportunityForm(p: Parent & { products: { id: string; productName: string }[] }) {
  return (
    <ActionForm action={createOpportunityAction} submitLabel="Create Opportunity">
      <Hidden {...p} />
      <div className="grid gap-2 md:grid-cols-4">
        <Field label="Opportunity Name *" className="md:col-span-2"><Input name="opportunityName" required /></Field>
        <Field label="Estimated Amount (₹)"><Input name="estimatedAmount" inputMode="decimal" /></Field>
        <Field label="Probability %"><Input name="probability" type="number" min={0} max={100} defaultValue={20} /></Field>
        <Field label="Stage"><Select name="stage">{opportunityStageValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        <Field label="Expected Close"><Input type="date" name="expectedCloseDate" /></Field>
        <Field label="Competitor"><Input name="competitor" /></Field>
        <Field label="Next Action"><Input name="nextAction" /></Field>
        <Field label="Objections" className="md:col-span-2"><Input name="objections" /></Field>
        <Field label="Products" className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            {p.products.map((x) => <label key={x.id} className="flex items-center gap-1 text-xs"><input type="checkbox" name="productIds" value={x.id} />{x.productName}</label>)}
          </div>
        </Field>
      </div>
    </ActionForm>
  );
}

export function SaleForm(p: Parent & { products: { id: string; productName: string }[] }) {
  return (
    <ActionForm action={createSaleAction} submitLabel="Record Sale">
      <Hidden {...p} />
      <div className="grid gap-2 md:grid-cols-5">
        <Field label="Product"><Select name="productId"><option value="">—</option>{p.products.map((x) => <option key={x.id} value={x.id}>{x.productName}</option>)}</Select></Field>
        <Field label="Amount (₹) *"><Input name="amount" inputMode="decimal" required /></Field>
        <Field label="Sale Date"><Input type="date" name="saleDate" defaultValue={today()} /></Field>
        <Field label="Payment"><Select name="paymentStatus">{paymentStatusValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        <Field label="Notes"><Input name="notes" /></Field>
      </div>
    </ActionForm>
  );
}
