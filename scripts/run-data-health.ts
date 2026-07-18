/**
 * CLI runner for the data-health invariant checks — the same checks the hourly
 * cron (/api/cron/data-health) + the /admin/data-health dashboard run. READ-ONLY.
 *
 * RUN (repo root · .env.local carries the prod service key):
 *   node_modules/.bin/tsx --env-file=.env.local scripts/run-data-health.ts
 */
import { createClient } from "@supabase/supabase-js";
import { runDataHealthChecks } from "../lib/admin/data-health/checks";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error("missing env"); process.exit(1); }
const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const report = await runDataHealthChecks(admin);
  console.log(`\n=== DATA HEALTH — ${report.ranAt} ===`);
  console.log(report.green ? "🟢 ON GREEN (no red)" : `🔴 red=${report.redCount}`, `· warn=${report.warnCount} · info=${report.infoCount}\n`);
  for (const r of report.results) {
    const mark = r.ok ? "✅" : r.severity === "red" ? "🔴" : r.severity === "warn" ? "🟠" : "🟡";
    console.log(`${mark} [${r.id}] ${r.title} — ${r.error ? `ERROR: ${r.error}` : `${r.count} รายการ`}`);
    if (!r.ok && r.sample.length > 0) {
      for (const s of r.sample.slice(0, 10)) console.log(`     ${JSON.stringify(s)}`);
    }
  }
  process.exit(report.green ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
