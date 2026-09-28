import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateQuotation } from "@/lib/quotation-math";
import { quotationSchema, type QuotationInput } from "@/lib/validators";
import type { Actor } from "@/server/session";
import { assertParentAccess, childScope } from "./access";
import { bumpLeadStage } from "./leads";
import { getSetting } from "./settings";

export function financialYear(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

async function nextQuotationNumber(date: Date): Promise<string> {
  const { prefix } = await getSetting("quotation");
  const base = `${prefix}/${financialYear(date)}/`;
  const last = await prisma.quotation.findFirst({
    where: { quotationNumber: { startsWith: base } },
    orderBy: { quotationNumber: "desc" },
    select: { quotationNumber: true },
  });
  const n = last ? parseInt(last.quotationNumber.slice(base.length), 10) + 1 : 1;
  return `${base}${String(n).padStart(4, "0")}`;
}

function buildData(input: QuotationInput) {
  const totals = calculateQuotation(input.items, input.gstPercentage, input.discountAmount);
  return {
    totals,
    items: input.items.map((it, i) => ({
      productId: it.productId ?? null,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discount,
      total: totals.lines[i].total,
    })),
  };
}

async function validateProducts(input: QuotationInput) {
  const ids = input.items.map((i) => i.productId).filter((x): x is string => !!x);
  if (!ids.length) return;
  const count = await prisma.product.count({ where: { id: { in: ids } } });
  if (count !== new Set(ids).size) throw new Error("One or more products do not exist");
}

export async function createQuotation(actor: Actor, raw: unknown) {
  const input = quotationSchema.parse(raw);
  await assertParentAccess(actor, input);
  await validateProducts(input);
  let customerId = input.customerId;
  let leadId = input.leadId;
  if (leadId && !customerId) customerId = (await prisma.customer.findUnique({ where: { leadId } }))?.id;
  if (customerId && !leadId) leadId = (await prisma.customer.findUnique({ where: { id: customerId } }))?.leadId ?? undefined;
  const { totals, items } = buildData(input);
  const validUntil = input.validUntil ?? new Date(input.quotationDate.getTime() + (await getSetting("quotation")).validityDays * 86400000);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const q = await prisma.quotation.create({
        data: {
          leadId,
          customerId,
          quotationNumber: await nextQuotationNumber(input.quotationDate),
          quotationDate: input.quotationDate,
          validUntil,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          gstPercentage: totals.gstPercentage,
          gstAmount: totals.gstAmount,
          totalAmount: totals.totalAmount,
          status: input.status,
          termsAndConditions: input.termsAndConditions ?? (await getSetting("quotation")).terms,
          notes: input.notes,
          items: { create: items },
        },
      });
      if (leadId && input.status !== "DRAFT") await bumpLeadStage(leadId, "QUOTATION_SENT", actor.id);
      return q;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // number collision, retry
      throw e;
    }
  }
  throw new Error("Could not allocate a quotation number");
}

export async function updateQuotation(actor: Actor, id: string, raw: unknown) {
  const existing = await prisma.quotation.findFirst({ where: { id, ...childScope(actor) } });
  if (!existing) throw new Error("Quotation not found");
  const input = quotationSchema.parse(raw);
  await assertParentAccess(actor, input);
  await validateProducts(input);
  const { totals, items } = buildData(input);
  const q = await prisma.$transaction(async (tx) => {
    await tx.quotationItem.deleteMany({ where: { quotationId: id } });
    return tx.quotation.update({
      where: { id },
      data: {
        quotationDate: input.quotationDate,
        validUntil: input.validUntil,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        gstPercentage: totals.gstPercentage,
        gstAmount: totals.gstAmount,
        totalAmount: totals.totalAmount,
        status: input.status,
        termsAndConditions: input.termsAndConditions,
        notes: input.notes,
        items: { create: items },
      },
    });
  });
  if (q.leadId && input.status !== "DRAFT") await bumpLeadStage(q.leadId, "QUOTATION_SENT", actor.id);
  return q;
}

export async function setQuotationStatus(actor: Actor, id: string, status: QuotationInput["status"]) {
  const existing = await prisma.quotation.findFirst({ where: { id, ...childScope(actor) } });
  if (!existing) throw new Error("Quotation not found");
  const q = await prisma.quotation.update({ where: { id }, data: { status } });
  if (q.leadId && status === "SENT") await bumpLeadStage(q.leadId, "QUOTATION_SENT", actor.id);
  return q;
}

export async function getQuotation(actor: Actor, id: string) {
  return prisma.quotation.findFirst({
    where: { id, ...childScope(actor) },
    include: { items: { include: { product: true } }, lead: { include: { leadSource: true } }, customer: true },
  });
}
