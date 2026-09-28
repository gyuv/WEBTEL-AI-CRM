import { config } from "dotenv";
import { vi } from "vitest";

config();
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
delete process.env.OPENAI_API_KEY; // tests never call the real AI API

// Session is supplied per test via globalThis.__testSession.
vi.mock("@/auth", () => ({
  auth: async () => (globalThis as { __testSession?: unknown }).__testSession ?? null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
