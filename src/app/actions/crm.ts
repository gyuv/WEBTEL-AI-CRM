"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireActor, assertAdmin } from "@/server/session";
import * as leads from "@/server/services/leads";
import * as crm from "@/server/services/crm";
import * as sources from "@/server/services/lead-sources";
import * as quotes from "@/server/services/quotations";
import { saveSetting, type SettingKey } from "@/server/services/settings";
import { passwordChangeSchema, userCreateSchema, leadStatusValues, opportunityStageValues, quotationStatusValues } from "@/lib/validators";
import { formToObject, toActionError, type ActionResult } from "./result";
import { z } from "zod";

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    return toActionError(e);
  }
}

// ----- Leads -----
export async function saveLeadAction(id: string | null, data: unknown): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActor();
    const lead = id ? await leads.updateLead(actor, id, data) : await leads.createLead(actor, data);
    revalidatePath("/leads");
    return { ok: true, redirect: `/leads/${lead.id}`, id: lead.id };
  });
}

export async function deleteLeadAction(id: string, _p: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await leads.deleteLead(await requireActor(), id);
    revalidatePath("/leads");
    return { ok: true, redirect: "/leads" };
  });
}

export async function setLeadStatusAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const status = z.enum(leadStatusValues).parse(fd.get("status"));
    await leads.setLeadStatus(await requireActor(), id, status);
    return { ok: true, message: "Status updated" };
  });
}

export async function assignLeadAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const userId = (fd.get("assignedUserId") as string) || null;
    await leads.assignLead(await requireActor(), id, userId);
    return { ok: true, message: "Lead assigned" };
  });
}

export async function convertLeadAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const extra = z
      .object({ address: z.string().max(500).optional(), numberOfUsers: z.coerce.number().int().min(0).optional(), requirements: z.string().max(3000).optional() })
      .parse({
        address: fd.get("address") || undefined,
        numberOfUsers: fd.get("numberOfUsers") || undefined,
        requirements: fd.get("requirements") || undefined,
      });
    const c = await leads.convertLeadToCustomer(await requireActor(), id, extra);
    revalidatePath("/customers");
    return { ok: true, redirect: `/customers/${c.id}` };
  });
}

// ----- Generic child records -----
export async function createActivityAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await crm.createActivity(await requireActor(), formToObject(fd));
    return { ok: true, message: "Activity added" };
  });
}
export async function createMeetingAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await crm.createMeeting(await requireActor(), formToObject(fd));
    return { ok: true, message: "Meeting saved" };
  });
}
export async function createFollowupAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await crm.createFollowup(await requireActor(), formToObject(fd));
    revalidatePath("/followups");
    return { ok: true, message: "Follow-up scheduled" };
  });
}
export async function setFollowupStatusAction(id: string, status: "COMPLETED" | "CANCELLED" | "PENDING", _p: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await crm.setFollowupStatus(await requireActor(), id, status);
    revalidatePath("/followups");
    return { ok: true };
  });
}
export async function createOpportunityAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await crm.createOpportunity(await requireActor(), formToObject(fd, ["productIds"]));
    revalidatePath("/opportunities");
    return { ok: true, message: "Opportunity created" };
  });
}
export async function setOpportunityStageAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await crm.setOpportunityStage(await requireActor(), id, z.enum(opportunityStageValues).parse(fd.get("stage")));
    revalidatePath("/opportunities");
    return { ok: true };
  });
}
export async function createSaleAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await crm.createSale(await requireActor(), formToObject(fd));
    revalidatePath("/sales");
    return { ok: true, message: "Sale recorded" };
  });
}

// ----- Customers -----
export async function saveCustomerAction(id: string | null, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActor();
    const data = formToObject(fd);
    const c = id ? await crm.updateCustomer(actor, id, data) : await crm.createCustomer(actor, data);
    revalidatePath("/customers");
    return { ok: true, redirect: `/customers/${c.id}` };
  });
}

// ----- Quotations -----
export async function saveQuotationAction(id: string | null, data: unknown): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActor();
    const q = id ? await quotes.updateQuotation(actor, id, data) : await quotes.createQuotation(actor, data);
    revalidatePath("/quotations");
    return { ok: true, redirect: `/quotations/${q.id}`, id: q.id };
  });
}
export async function setQuotationStatusAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await quotes.setQuotationStatus(await requireActor(), id, z.enum(quotationStatusValues).parse(fd.get("status")));
    revalidatePath(`/quotations/${id}`);
    return { ok: true, message: "Status updated" };
  });
}

// ----- Lead sources (admin) -----
export async function saveLeadSourceAction(id: string | null, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActor();
    const data = { name: fd.get("name"), description: fd.get("description"), active: fd.get("active") !== "off" && fd.get("active") !== "false" };
    if (id) await sources.updateLeadSource(actor, id, data);
    else await sources.createLeadSource(actor, data);
    revalidatePath("/settings/lead-sources");
    return { ok: true, message: "Saved" };
  });
}
export async function toggleLeadSourceAction(id: string, active: boolean, _p: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await sources.setLeadSourceActive(await requireActor(), id, active);
    revalidatePath("/settings/lead-sources");
    return { ok: true };
  });
}
export async function deleteLeadSourceAction(id: string, _p: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await sources.deleteLeadSource(await requireActor(), id);
    revalidatePath("/settings/lead-sources");
    return { ok: true };
  });
}

// ----- Products (admin) -----
export async function saveProductAction(id: string | null, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActor();
    const data = formToObject(fd, [], ["active"]);
    if (id) await crm.updateProduct(actor, id, data);
    else await crm.createProduct(actor, data);
    revalidatePath("/settings/products");
    return { ok: true, message: "Product saved" };
  });
}

// ----- Settings -----
export async function saveSettingAction(key: SettingKey, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const data = formToObject(fd, [], key === "ai" ? ["enabled"] : []);
    await saveSetting(await requireActor(), key, data);
    revalidatePath("/settings");
    return { ok: true, message: "Settings saved" };
  });
}

export async function saveTemplateAction(id: string | null, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    assertAdmin(await requireActor());
    const data = z
      .object({ name: z.string().trim().min(1).max(100), channel: z.enum(["WHATSAPP", "EMAIL"]), body: z.string().trim().min(1).max(5000) })
      .parse(formToObject(fd));
    if (id) await prisma.messageTemplate.update({ where: { id }, data });
    else await prisma.messageTemplate.create({ data });
    revalidatePath("/settings/templates");
    return { ok: true, message: "Template saved" };
  });
}

// ----- Users -----
export async function createUserAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    assertAdmin(await requireActor());
    const d = userCreateSchema.parse(formToObject(fd));
    await prisma.user.create({ data: { name: d.name, email: d.email, role: d.role, passwordHash: await bcrypt.hash(d.password, 12) } });
    revalidatePath("/settings/users");
    return { ok: true, message: "User created" };
  });
}
export async function toggleUserAction(id: string, active: boolean, _p: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActor();
    assertAdmin(actor);
    if (id === actor.id) throw new Error("You cannot disable your own account");
    await prisma.user.update({ where: { id }, data: { active } });
    revalidatePath("/settings/users");
    return { ok: true };
  });
}
export async function updateProfileAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActor();
    const name = z.string().trim().min(1).max(100).parse(fd.get("name"));
    await prisma.user.update({ where: { id: actor.id }, data: { name } });
    return { ok: true, message: "Profile updated" };
  });
}
export async function changePasswordAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireActor();
    const d = passwordChangeSchema.parse(formToObject(fd));
    const u = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await bcrypt.compare(d.currentPassword, u.passwordHash))) throw new Error("Current password is incorrect");
    await prisma.user.update({ where: { id: actor.id }, data: { passwordHash: await bcrypt.hash(d.newPassword, 12) } });
    return { ok: true, message: "Password changed" };
  });
}
