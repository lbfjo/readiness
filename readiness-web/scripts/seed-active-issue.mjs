import { config as loadDotenv } from "dotenv";
import { neon } from "@neondatabase/serverless";

loadDotenv({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set in readiness-web/.env.local");
  process.exit(1);
}

const sql = neon(databaseUrl);

const now = new Date().toISOString();
const slug = "left-insertional-achilles";

const existing = await sql`
  select id
  from active_issues
  where slug = ${slug}
  limit 1;
`;

let rows;

if (existing.length > 0) {
  rows = await sql`
    update active_issues
    set
      area = 'achilles',
      subtype = 'insertional',
      label = 'Left insertional Achilles',
      side = 'left',
      status = 'active',
      stage = 'calming',
      suspected_issue = 'Insertional Achilles pain',
      trigger_movements_json = ${JSON.stringify(["running", "stairs", "uphill"])},
      aggravators_json = ${JSON.stringify(["trail running", "hills", "deep dorsiflexion"])},
      relievers_json = ${JSON.stringify(["easy ride", "swim", "isometric calf loading"])},
      notes = 'Seeded from the readiness web phase-1 decision-support rollout.',
      updated_at = ${now}
    where id = ${existing[0].id}
    returning id, slug, label, status, stage;
  `;
} else {
  rows = await sql`
    insert into active_issues (
      slug,
      area,
      subtype,
      label,
      side,
      status,
      stage,
      suspected_issue,
      trigger_movements_json,
      aggravators_json,
      relievers_json,
      notes,
      started_at,
      resolved_at,
      updated_at
    )
    values (
      ${slug},
      'achilles',
      'insertional',
      'Left insertional Achilles',
      'left',
      'active',
      'calming',
      'Insertional Achilles pain',
      ${JSON.stringify(["running", "stairs", "uphill"])},
      ${JSON.stringify(["trail running", "hills", "deep dorsiflexion"])},
      ${JSON.stringify(["easy ride", "swim", "isometric calf loading"])},
      'Seeded from the readiness web phase-1 decision-support rollout.',
      ${now},
      null,
      ${now}
    )
    returning id, slug, label, status, stage;
  `;
}

console.log(JSON.stringify(rows[0], null, 2));
