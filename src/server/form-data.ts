import { prisma } from "@/lib/prisma";

export async function leadFormOptions() {
  const [sources, users, products] = await Promise.all([
    prisma.leadSource.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, active: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { active: true }, orderBy: { productName: "asc" }, select: { id: true, productName: true, pricing: true, description: true } }),
  ]);
  return { sources, users, products };
}
