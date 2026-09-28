// Usage: npm run create-admin -- <email> <password> [name]
// Creates an ADMIN, or resets the password of an existing user (and re-enables it).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email, password, name = "Admin"] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error("Usage: npm run create-admin -- <email> <password (min 8 chars)> [name]");
  process.exit(1);
}
const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 12);
const u = await prisma.user.upsert({
  where: { email: email.toLowerCase() },
  create: { email: email.toLowerCase(), name, passwordHash, role: "ADMIN" },
  update: { passwordHash, active: true },
});
console.log(`OK: ${u.email} (${u.role}) can now sign in.`);
await prisma.$disconnect();
