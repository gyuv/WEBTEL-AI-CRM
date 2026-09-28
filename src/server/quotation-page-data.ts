import { prisma } from "@/lib/prisma";

export async function quotationProducts() {
  const products = await prisma.product.findMany({ where: { active: true }, orderBy: { productName: "asc" } });
  return products.map((p) => ({ id: p.id, productName: p.productName, pricing: p.pricing != null ? Number(p.pricing) : null, description: p.description }));
}
