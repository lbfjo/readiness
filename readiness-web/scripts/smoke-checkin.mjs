// Smoke test: write a check-in straight to Neon with fresh values + updated_at
// so the Python reverse-sync (`checkin_sync.py`) will pick it up on the next
// `cli.py score` run. Mimics what the server action writes.
//
// Run with: node scripts/smoke-checkin.mjs

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

try {
  const contents = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of contents.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/u);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing. Populate .env.local first.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

function todayYYYYMMDD(tz = process.env.APP_TIMEZONE || "Europe/London") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}${m}${d}`;
}

const date = todayYYYYMMDD();
const now = new Date().toISOString();
const payload = {
  energy: 5,
  mood: 5,
  soreness: 1,
  stress: 1,
  illness: 0,
  notes: `smoke-test ${now}`,
};

console.log(`Upserting check-in for ${date}`, payload);

await sql`
  INSERT INTO subjective_checkins
    (date, energy, mood, soreness, stress, illness, notes, created_at, updated_at)
  VALUES
    (${date}, ${payload.energy}, ${payload.mood}, ${payload.soreness},
     ${payload.stress}, ${payload.illness}, ${payload.notes}, ${now}, ${now})
  ON CONFLICT (date) DO UPDATE SET
    energy = EXCLUDED.energy,
    mood = EXCLUDED.mood,
    soreness = EXCLUDED.soreness,
    stress = EXCLUDED.stress,
    illness = EXCLUDED.illness,
    notes = EXCLUDED.notes,
    updated_at = EXCLUDED.updated_at
`;

const [row] = await sql`
  SELECT date, energy, mood, soreness, stress, illness, notes, updated_at
  FROM subjective_checkins
  WHERE date = ${date}
`;
console.log("Readback:", row);
