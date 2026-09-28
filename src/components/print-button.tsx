"use client";

import { Button } from "@/components/ui";

export function PrintButton() {
  return <Button variant="outline" size="sm" onClick={() => window.print()}>Print / Save PDF</Button>;
}
