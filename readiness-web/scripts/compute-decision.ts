import { config } from "dotenv";
import { computeAndPersistDailyDecision } from "../lib/contracts/daily-decision";
import { todayIsoDate } from "../lib/time";

config({ path: ".env.local" });
config({ path: ".env" });

const date = parseDateArg() ?? todayIsoDate();

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

async function main() {
  const decision = await computeAndPersistDailyDecision(date);
  console.log(
    JSON.stringify(
      {
        date,
        decision: decision?.decision ?? null,
        priority: decision?.priority ?? null,
        rulesVersion: decision?.rulesVersion ?? null,
      },
      null,
      2,
    ),
  );
}

function parseDateArg() {
  const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
  if (!dateArg) return null;
  const value = dateArg.slice("--date=".length);
  if (!/^\d{8}$/u.test(value)) {
    throw new Error(`--date must be YYYYMMDD, got ${value}`);
  }
  return value;
}
