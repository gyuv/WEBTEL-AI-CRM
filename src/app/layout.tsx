import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Webtel AI Sales Assistant", description: "Personal CRM and AI sales assistant" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
