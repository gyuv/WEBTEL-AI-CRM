import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { verifyCredentials } from "@/server/credentials";
import { rateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        if (!rateLimit(`login:${parsed.data.email.toLowerCase()}`, 10, 15 * 60_000)) return null;
        return verifyCredentials(parsed.data.email, parsed.data.password);
      },
    }),
  ],
});
