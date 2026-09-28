export const metadata = { title: "Privacy & opt-out" };

export default function Legal() {
  const company = process.env.NEXT_PUBLIC_LEGAL_COMPANY ?? "[Your Company Name]";
  const email = process.env.NEXT_PUBLIC_LEGAL_EMAIL ?? "[privacy@yourcompany.in]";
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <h1 className="mb-2 text-2xl font-semibold">Privacy notice & opt-out</h1>
      <p className="mb-6 text-muted-fg">Template — review with a lawyer and replace the placeholders before relying on it.</p>
      <h2 className="mt-6 font-semibold">Who we are</h2>
      <p>{company} (“we”) contacts businesses about products and services that may be relevant to them.</p>
      <h2 className="mt-6 font-semibold">What we collect</h2>
      <p>Business contact information only: company name, business address, business phone numbers, business email addresses, website, and the names and job titles of people in business roles, from publicly available sources (company websites, public maps and directories that permit it) or information you shared with us. We record where and when each item was collected.</p>
      <h2 className="mt-6 font-semibold">Why</h2>
      <p>To contact you about business offerings (legitimate use under India&apos;s Digital Personal Data Protection Act, 2023). We do not sell your data.</p>
      <h2 className="mt-6 font-semibold">Calls</h2>
      <p>We check numbers against the TRAI National Customer Preference Register (NCPR/DND) before promotional calls and honour any request not to be called.</p>
      <h2 className="mt-6 font-semibold">Your choices — opt out</h2>
      <p>Reply “STOP” to any email or message, or write to <b>{email}</b>. We will add your email, phone or domain to our do-not-contact list within 48 hours and will not contact you again. You may also ask us to delete all information we hold about you.</p>
      <h2 className="mt-6 font-semibold">Retention & security</h2>
      <p>Data is stored in access-controlled databases, encrypted in transit, and deleted when no longer needed or on request.</p>
      <h2 className="mt-6 font-semibold">Grievance officer</h2>
      <p>{email}</p>
    </main>
  );
}
