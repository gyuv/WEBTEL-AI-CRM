import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { ActionForm } from "@/components/action-form";
import { AdminOnly } from "@/components/settings-nav";
import { saveProductAction } from "@/app/actions/crm";
import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

type P = Awaited<ReturnType<typeof prisma.product.findMany>>[number];

function ProductFields({ p }: { p?: P }) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <Field label="Product Name *"><Input name="productName" required defaultValue={p?.productName} /></Field>
      <Field label="Category"><Input name="category" defaultValue={p?.category ?? ""} /></Field>
      <Field label="Price (₹)"><Input name="pricing" inputMode="decimal" defaultValue={p?.pricing?.toString() ?? ""} /></Field>
      <Field label="Pricing Type"><Input name="pricingType" defaultValue={p?.pricingType ?? ""} placeholder="Per user / month" /></Field>
      <Field label="Description" className="md:col-span-2"><Textarea name="description" rows={2} defaultValue={p?.description ?? ""} /></Field>
      <Field label="Target Customer" className="md:col-span-2"><Textarea name="targetCustomer" rows={2} defaultValue={p?.targetCustomer ?? ""} /></Field>
      <Field label="Key Features" className="md:col-span-2"><Textarea name="keyFeatures" rows={2} defaultValue={p?.keyFeatures ?? ""} /></Field>
      <Field label="Benefits" className="md:col-span-2"><Textarea name="benefits" rows={2} defaultValue={p?.benefits ?? ""} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Active</label>
    </div>
  );
}

export default async function ProductsPage() {
  const actor = await requirePageActor();
  if (actor.role !== "ADMIN") return <AdminOnly />;
  const products = await prisma.product.findMany({ orderBy: { productName: "asc" } });
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">The AI only recommends products listed here and only quotes the features/prices entered here.</p>
      <Card><CardHeader><CardTitle>Add Product</CardTitle></CardHeader><CardContent>
        <ActionForm action={saveProductAction.bind(null, null)} submitLabel="Add Product"><ProductFields /></ActionForm>
      </CardContent></Card>
      {products.map((p) => (
        <details key={p.id} className="rounded-lg border bg-white">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">{p.productName} <span className="text-muted-foreground">{p.category}</span> {!p.active && <Badge tone="LOST">Inactive</Badge>}</summary>
          <div className="border-t p-4">
            <ActionForm action={saveProductAction.bind(null, p.id)} resetOnSuccess={false}><ProductFields p={p} /></ActionForm>
          </div>
        </details>
      ))}
    </div>
  );
}
