import { planGpsBackfill } from "../src/gps/gps-backfill-plan";

try {
  const args = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--(from|to|imeis)=(.+)$/.exec(arg);
    if (!match || args.has(match[1])) throw new Error("Use --from=ISO --to=ISO --imeis=123,456. Only dry-run planning is supported; no --apply option exists.");
    args.set(match[1], match[2]);
  }
  console.log(JSON.stringify(planGpsBackfill((args.get("imeis") || "").split(","), args.get("from") || "", args.get("to") || ""), null, 2));
} catch (error) { console.error(error instanceof Error ? error.message : "Invalid plan."); process.exitCode = 1; }
