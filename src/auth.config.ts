import type { NextAuthConfig } from "next-auth";
import { loginRequired } from "@/lib/login-mode";

/** Edge-safe config shared by middleware and the full Auth.js instance. */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      if (!loginRequired()) {
        // Personal mode: no login page; the server acts as the built-in owner account.
        if (pathname.startsWith("/login")) return Response.redirect(new URL("/", request.nextUrl));
        return true;
      }
      if (pathname.startsWith("/login")) return true;
      if (!isLoggedIn && pathname.startsWith("/api/")) return Response.json({ error: "Not authenticated" }, { status: 401 });
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: "USER" | "ADMIN" }).role ?? "USER";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
