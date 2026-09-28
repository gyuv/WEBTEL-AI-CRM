import { requirePageActor } from "@/server/session";
import { CustomerForm } from "@/components/customer-form";
import { Card, PageHeader } from "@/components/ui";

export default async function NewCustomerPage() {
  await requirePageActor();
  return (
    <div className="max-w-5xl">
      <PageHeader title="New Customer" description="Tip: convert a lead from its page to preserve the original lead source." />
      <Card className="p-4"><CustomerForm /></Card>
    </div>
  );
}
