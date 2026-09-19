/**
 * The only place in the web app that opens a database connection.
 *
 * Two rules this file exists to enforce:
 *
 *   1. The app uses the POOLED connection string. Every request to a serverless
 *      function is its own process; without Neon's pooler, a busy page opens
 *      more connections than the database will accept. `DATABASE_URL` (direct)
 *      is for ingestion and migrations and is deliberately not a fallback.
 *
 *   2. The connection string never appears in a log, an error, or a response.
 *      Anything that wants to name the database gets `safeHost()`.
 */

import { resolve } from "node:path";

import { config } from "dotenv";
import { Pool, type QueryResultRow } from "pg";

/** Hostname only — never the credential. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

/** Neon names the pooled endpoint `<endpoint>-pooler.<region>...`. */
export function isPooled(url: string): boolean {
  return hostOf(url).includes("-pooler");
}

/**
 * Read the pooled string, or fail with a message that names the variable and
 * quotes none of its value.
 */
export function requireUrl(env: Record<string, string | undefined>): string {
  const value = (env.DATABASE_URL_POOLED ?? "").trim();
  if (!value) {
    throw new Error(
      "DATABASE_URL_POOLED is empty. Locally it comes from the repo-root .env; " +
        "on Vercel it is a project environment variable.",
    );
  }
  return value;
}

// Next.js reloads modules on every edit in dev. Without this the pool is
// recreated on each reload and the old connections are never released.
const globalForPg = globalThis as unknown as { matchupPool?: Pool };

let loadedDotenv = false;

function loadLocalEnv(): void {
  // On Vercel the variable is already set, so this never runs. Locally it lets
  // the repo keep exactly one file containing a credential: the root .env.
  if (loadedDotenv || process.env.DATABASE_URL_POOLED) return;
  loadedDotenv = true;
  config({ path: resolve(process.cwd(), "..", ".env"), quiet: true });
}

export function getPool(): Pool {
  if (globalForPg.matchupPool) return globalForPg.matchupPool;
  loadLocalEnv();
  const connectionString = requireUrl(process.env);
  globalForPg.matchupPool = new Pool({
    connectionString,
    // A handful, not one. The matchup page issues four independent queries
    // through Promise.all; with max:1 they queued behind each other and the
    // page paid four sequential round trips to us-east-1 instead of one.
    // Neon's pooler is what protects Postgres from the connection count, so
    // the job here is only to let one request's own queries overlap.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return globalForPg.matchupPool;
}

/** Hostname of the database this process would talk to. Safe to print. */
export function safeHost(): string {
  loadLocalEnv();
  return hostOf(requireUrl(process.env));
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}
