import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "./product-form";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId } = await ctx();
  let product = null;
  if (id !== "new") {
    [product] = await db.select().from(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.userId, userId)));
    if (!product) notFound();
  }
  return (
    <>
      <PageHeader title={product ? product.name : "New product"} description="Tip: paste your website URL or brochure text and let AI fill the form." />
      <ProductForm product={product ? { ...product, createdAt: undefined, updatedAt: undefined, userId: undefined } : null} />
    </>
  );
}
