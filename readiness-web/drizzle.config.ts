import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js convention: `.env.local` overrides `.env`. Drizzle-kit doesn't know
// about Next's loader, so we mirror it here.
config({ path: ".env" });
config({ path: ".env.local", override: true });

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is required to run drizzle-kit");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dbCredentials: { url },
  strict: false,
  verbose: true,
});
