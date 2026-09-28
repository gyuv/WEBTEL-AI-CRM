import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
