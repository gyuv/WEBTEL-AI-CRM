import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/client";

export const metadata: Metadata = {
  title: { default: "LeadForge", template: "%s · LeadForge" },
  description: "Free lead intelligence and sales assistant for solo sellers.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "LeadForge", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fcfcfd" }, { media: "(prefers-color-scheme: dark)", color: "#0c0c10" }],
  width: "device-width", initialScale: 1, viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}` }} />
      </body>
    </html>
  );
}
