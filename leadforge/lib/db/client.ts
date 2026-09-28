import "server-only";
import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { runMigrations, type SqlExec } from "./migrate";

type DB = ReturnType<typeof drizzlePg<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __lfDb: Promise<{ db: DB; mode: "postgres" | "pglite" }> | undefined;
}

async function init(): Promise<{ db: DB; mode: "postgres" | "pglite" }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { prepare: false, max: 5 });
    const db = drizzlePg(client, { schema });
    if (process.env.AUTO_MIGRATE !== "false") {
      await runMigrations({ exec: (q) => client.unsafe(q) as unknown as Promise<unknown> } satisfies SqlExec);
    }
    const { ensureSeed } = await import("../seed");
    if (process.env.SEED_DEMO !== "false") await ensureSeed(db as never);
    return { db, mode: "postgres" };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  // Serverless hosts have a read-only filesystem except /tmp.
  const dir = process.env.PGLITE_DIR ?? (process.env.VERCEL ? "/tmp/leadforge-pglite" : path.join(process.cwd(), ".data", "pglite"));
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await runMigrations({ exec: (q) => client.exec(q) });
  const db = drizzleLite(client, { schema }) as unknown as DB;
  const { ensureSeed } = await import("../seed");
  if (process.env.SEED_DEMO !== "false") await ensureSeed(db as never);
  return { db, mode: "pglite" };
}

export function getDbWithMode() {
  globalThis.__lfDb ??= init().catch((e) => {
    globalThis.__lfDb = undefined;
    throw e;
  });
  return globalThis.__lfDb;
}

export async function getDb(): Promise<DB> {
  return (await getDbWithMode()).db;
}

export type { DB };
export { schema };
