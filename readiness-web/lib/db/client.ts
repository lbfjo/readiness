import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | null = null;

/**
 * Lazy Drizzle client. We don't connect (or even throw) at module-load time so
 * pages can degrade gracefully when `DATABASE_URL` isn't configured yet.
 */
export function getDb(): Database {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = neon(url);
  cached = drizzle(sql, { schema });
  return cached;
}

export { schema };
export type { Database };
