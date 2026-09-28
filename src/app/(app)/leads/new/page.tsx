import { requirePageActor } from "@/server/session";
import { leadFormOptions } from "@/server/form-data";
import { LeadForm } from "@/components/lead-form";
import { PageHeader } from "@/components/ui";

export default async function NewLeadPage() {
  const actor = await requirePageActor();
  const { sources, users, products } = await leadFormOptions();
  return (
    <div className="max-w-5xl">
      <PageHeader title="New Lead" />
      <LeadForm sources={sources} users={users} products={products.map(({ id, productName }) => ({ id, productName }))} isAdmin={actor.role === "ADMIN"} />
    </div>
  );
}
