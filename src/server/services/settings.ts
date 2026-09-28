import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAdmin, type Actor } from "@/server/session";

export const settingSchemas = {
  company: z.object({
    name: z.string().max(200).default("Webtel Electrosoft Pvt. Ltd."),
    address: z.string().max(1000).default(""),
    phone: z.string().max(50).default(""),
    email: z.string().max(200).default(""),
    website: z.string().max(200).default(""),
    gstin: z.string().max(20).default(""),
  }),
  gst: z.object({ defaultPercentage: z.coerce.number().min(0).max(100).default(18) }),
  quotation: z.object({
    prefix: z.string().max(20).default("WT/Q"),
    validityDays: z.coerce.number().int().min(1).max(365).default(30),
    terms: z
      .string()
      .max(5000)
      .default("1. Prices are exclusive of GST unless stated.\n2. Payment: 100% advance.\n3. Validity as mentioned above."),
  }),
  ai: z.object({
    enabled: z.boolean().default(true),
    model: z.string().max(100).default(""),
    temperature: z.coerce.number().min(0).max(1).default(0.3),
  }),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const parsed = settingSchemas[key].safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : settingSchemas[key].parse({})) as SettingValue<K>;
}

export async function saveSetting<K extends SettingKey>(actor: Actor, key: K, raw: unknown) {
  assertAdmin(actor);
  const value = settingSchemas[key].parse(raw);
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  return value;
}
