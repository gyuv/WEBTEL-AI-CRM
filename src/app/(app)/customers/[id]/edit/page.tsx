import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageActor } from "@/server/session";
import { customerScope } from "@/server/services/access";
import { CustomerForm } from "@/components/customer-form";
import { Card, PageHeader } from "@/components/ui";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const c = await prisma.customer.findFirst({ where: { id, ...customerScope(actor) } });
  if (!c) notFound();
  return (
    <div className="max-w-5xl">
      <PageHeader title={`Edit: ${c.customerName}`} />
      <Card className="p-4"><CustomerForm c={c} /></Card>
    </div>
  );
}
