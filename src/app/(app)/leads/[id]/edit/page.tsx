import { notFound } from "next/navigation";
import { requirePageActor } from "@/server/session";
import { getLeadDetail } from "@/server/services/leads";
import { leadFormOptions } from "@/server/form-data";
import { LeadForm } from "@/components/lead-form";
import { PageHeader } from "@/components/ui";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const lead = await getLeadDetail(actor, id);
  if (!lead) notFound();
  const { sources, users, products } = await leadFormOptions();
  const s = (v: string | null) => v ?? "";
  return (
    <div className="max-w-5xl">
      <PageHeader title={`Edit: ${lead.name}`} />
      <LeadForm
        isAdmin={actor.role === "ADMIN"}
        sources={sources}
        users={users}
        products={products.map(({ id: pid, productName }) => ({ id: pid, productName }))}
        lead={{
          id: lead.id,
          name: lead.name,
          companyName: s(lead.companyName),
          phone: s(lead.phone),
          email: s(lead.email),
          city: s(lead.city),
          state: s(lead.state),
          industry: s(lead.industry),
          companySize: s(lead.companySize),
          leadSourceId: lead.leadSourceId,
          leadSourceDetails: s(lead.leadSourceDetails),
          campaignName: s(lead.campaignName),
          referralName: s(lead.referralName),
          assignedUserId: s(lead.assignedUserId),
          status: lead.status,
          priority: lead.priority,
          estimatedValue: lead.estimatedValue.toString(),
          notes: s(lead.notes),
          interestedProductIds: lead.interestedProducts.map((p) => p.id),
        }}
      />
    </div>
  );
}
