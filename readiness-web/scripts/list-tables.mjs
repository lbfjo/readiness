import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
  order by table_name
`;
console.log(rows.map((r) => r.table_name).join("\n"));
