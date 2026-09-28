import Link from "next/link";

const links = [
  ["/settings", "Profile"],
  ["/settings/company", "Company Details"],
  ["/settings/quotation", "GST & Quotation"],
  ["/settings/lead-sources", "Lead Sources"],
  ["/settings/products", "Products"],
  ["/settings/users", "Users"],
  ["/settings/ai", "AI Settings"],
  ["/settings/templates", "Message Templates"],
];

export function SettingsNav() {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b pb-2 text-sm">
      {links.map(([href, l]) => <Link key={href} href={href} className="rounded px-2 py-1 hover:bg-muted">{l}</Link>)}
    </div>
  );
}

export function AdminOnly() {
  return <p className="text-sm text-muted-foreground">Only administrators can manage this section.</p>;
}
