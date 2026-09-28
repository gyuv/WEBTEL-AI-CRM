import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-5xl">
      <h1 className="mb-2 text-xl font-semibold">Settings</h1>
      <SettingsNav />
      {children}
    </div>
  );
}
