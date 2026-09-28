"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function loginAction(_prev: string | null, fd: FormData): Promise<string | null> {
  try {
    await signIn("credentials", { email: fd.get("email"), password: fd.get("password"), redirectTo: "/" });
    return null;
  } catch (e) {
    if (e instanceof AuthError) {
      if ((await prisma.user.count()) === 0) return "NO_USERS";
      return "Invalid email or password";
    }
    throw e; // NEXT_REDIRECT on success
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
