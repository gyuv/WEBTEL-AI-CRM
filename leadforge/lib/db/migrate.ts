import fs from "node:fs";
import path from "node:path";

export type SqlExec = { exec: (sql: string) => Promise<unknown> };

function migrationsDir() {
  return path.join(process.cwd(), "supabase", "migrations");
}

/** Minimal idempotent migrator: applies supabase/migrations/*.sql in order, tracked in _lf_migrations. */
export async function runMigrations(conn: SqlExec) {
  await conn.exec(`create table if not exists _lf_migrations (name text primary key, applied_at timestamptz default now())`);
  const files = fs.readdirSync(migrationsDir()).filter((f) => f.endsWith(".sql")).sort();
  const res = (await conn.exec(`select name from _lf_migrations`)) as unknown;
  const applied = new Set(extractRows(res).map((r) => String(r.name)));
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir(), f), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      if (stmt.trim()) await conn.exec(stmt);
    }
    await conn.exec(`insert into _lf_migrations (name) values ('${f.replace(/'/g, "")}')`);
  }
  // Supabase: enable RLS policies when the auth schema exists.
  const auth = extractRows(await conn.exec(`select 1 as ok from information_schema.schemata where schema_name = 'auth'`));
  if (auth.length) {
    await conn.exec(fs.readFileSync(path.join(process.cwd(), "supabase", "policies", "rls.sql"), "utf8"));
  }
}

function extractRows(res: unknown): Record<string, unknown>[] {
  if (Array.isArray(res)) {
    // postgres-js returns an array of rows; PGlite exec returns an array of results.
    if (res.length && typeof res[0] === "object" && res[0] && "rows" in (res[0] as object)) {
      return (res as { rows: Record<string, unknown>[] }[]).flatMap((r) => r.rows);
    }
    return res as Record<string, unknown>[];
  }
  return [];
}
