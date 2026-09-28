import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ctx } from "@/lib/server/core";

/**
 * Brochure/image upload. Uses Supabase Storage (free 1 GB) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
 * otherwise saves under .data/uploads (local mode). Also returns extracted text for PDFs (for AI auto-fill).
 */
export async function POST(req: Request) {
  const { userId } = await ctx();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Max 15MB" }, { status: 400 });
  if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(file.type)) return NextResponse.json({ error: "Only PDF, PNG, JPG, WEBP" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "bin";
  const key = `${userId}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  let url: string;
  const sb = process.env.SUPABASE_URL, sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (sb && sk) {
    const r = await fetch(`${sb}/storage/v1/object/brochures/${key}`, { method: "POST", headers: { authorization: `Bearer ${sk}`, "content-type": file.type, "x-upsert": "true" }, body: buf });
    if (!r.ok) return NextResponse.json({ error: `Supabase Storage: ${r.status} ${(await r.text()).slice(0, 120)}. Create a public bucket named 'brochures'.` }, { status: 500 });
    url = `${sb}/storage/v1/object/public/brochures/${key}`;
  } else if (process.env.VERCEL) {
    url = "";
  } else {
    const dir = path.join(process.cwd(), "public", "uploads", userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(process.cwd(), "public", "uploads", key), buf);
    url = `/uploads/${key}`;
  }
  let text: string | null = null;
  if (file.type === "application/pdf") {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const r = await extractText(pdf, { mergePages: true });
      text = String(r.text).slice(0, 20000);
    } catch { text = null; }
  }
  return NextResponse.json({ url, text, stored: Boolean(url) });
}
