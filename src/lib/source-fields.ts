export type SourceExtraField = "referralName" | "campaignName" | "leadSourceDetails";

/** Which source-specific field the lead form shows for a given lead source name. */
export function sourceDetailFieldFor(name: string | undefined): { field: SourceExtraField; label: string; placeholder?: string } | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n === "employee referral") return { field: "referralName", label: "Employee Name" };
  if (n === "referral") return { field: "referralName", label: "Referral Name", placeholder: "e.g. Mr. Kumar" };
  if (n.startsWith("exhibition")) return { field: "leadSourceDetails", label: "Event Name", placeholder: "e.g. CA Expo Chennai 2026" };
  if (n === "google ads") return { field: "campaignName", label: "Campaign Name", placeholder: "e.g. Cloud VM Campaign September 2026" };
  if (["linkedin", "facebook", "instagram"].includes(n)) return { field: "campaignName", label: "Campaign Name / Source Detail" };
  if (n.startsWith("partner")) return { field: "leadSourceDetails", label: "Partner Name" };
  if (n === "other") return { field: "leadSourceDetails", label: "Source Details" };
  return null;
}
