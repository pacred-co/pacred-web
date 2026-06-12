/**
 * fill-customs-fx-peak-gl-2026-06-12.mjs — owner data-fill (2026-06-12)
 *
 * Fills the two DORMANT accounting config rows from the owner's authoritative
 * source files, then flips their `pending` flag to false:
 *
 *  1. business_config `customs.fx_rates` — from `customs rate 06-69.pdf`
 *     (กรมศุลกากร อัตราแลกเปลี่ยน ของวันที่ 12 มิถุนายน 2569 · customs.go.th).
 *     We use the IMPORT column (การนำเข้า) because the ใบขน declared value on an
 *     import is converted at the customs IMPORT rate. Per-100 / per-1000 quoted
 *     currencies (JPY=เยน(100)) are NORMALISED to THB-per-1-unit, which is the
 *     shape lib/admin/customs-fx.ts → fxRateMap consumes
 *     (declared_value_thb = declared_amount_ccy × rate).
 *
 *  2. business_config `peak.gl_accounts` — from the PEAK general-ledger export
 *     (รายงานบัญชีแยกประเภท · 2026-06-12). selling = 410101 รายได้จากการขายสินค้า,
 *     cost = 510103 ต้นทุนขายสินค้า (1:1 HS sub-accounts with 410101),
 *     declared = "" (memo-only — no GL posting by design · peak-export.ts L106).
 *
 * SAFE: default DRY-RUN (prints current → proposed). `--apply` writes via the
 * service-role client, with a BEFORE backup printed to a gitignored .tmp file.
 * Idempotent: re-running with the same values is a no-op diff.
 *
 * Usage:
 *   node --env-file=.env.local scripts/fill-customs-fx-peak-gl-2026-06-12.mjs            # dry-run (default)
 *   node --env-file=.env.local scripts/fill-customs-fx-peak-gl-2026-06-12.mjs --apply    # write to the project in .env.local
 *
 * The env file's NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY pick the
 * target project (prod by default). To also fill DEV, point a dev .env at it.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");

// ── The values, derived from the owner's source files ───────────────────────
// กรมศุล 12 มิ.ย. 2569 — IMPORT column (การนำเข้า), normalised to THB / 1 unit.
const CUSTOMS_FX = {
  USD: 32.7768, // ดอลลาร์สหรัฐ
  CNY: 4.8408, //  เรนมินบิ (จีน — เลนหลัก)
  JPY: 0.208312, // เยน (กรมศุลquote ต่อ 100 → 20.8312 / 100)
  EUR: 38.2224, // ยูโร
  HKD: 4.2016, //  ดอลลาร์ฮ่องกง
  KRW: 0.0218, //  วอน (เกาหลีใต้)
  TWD: 1.0377, //  ดอลลาร์ไต้หวัน
  SGD: 25.7574, // ดอลลาร์สิงคโปร์
  MYR: 8.3413, //  ริงกิต (มาเลเซีย)
  pending: false,
};

// PEAK chart of accounts (รายงานบัญชีแยกประเภท 2026-06-12).
const PEAK_GL = {
  selling: "410101", //  รายได้จากการขายสินค้า
  cost: "510103", //     ต้นทุนขายสินค้า
  declared: "", //       memo-only — no GL posting (peak-export.ts L106)
  pending: false,
};

const TARGETS = [
  { key: "customs.fx_rates", value: CUSTOMS_FX },
  { key: "peak.gl_accounts", value: PEAK_GL },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}
const projectRef = url.replace(/^https?:\/\//, "").split(".")[0];
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function fmt(v) {
  return JSON.stringify(v);
}

async function main() {
  console.log(`\n[fill-customs-fx-peak-gl] target project = ${projectRef}  mode = ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const before = {};
  for (const { key, value } of TARGETS) {
    const { data, error } = await supabase
      .from("business_config")
      .select("key, value, value_type, category")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.error(`  ✗ ${key} — read error: ${error.message}`);
      process.exit(1);
    }
    if (!data) {
      console.error(`  ✗ ${key} — row does NOT exist (seed migration not applied?). Aborting.`);
      process.exit(1);
    }
    before[key] = data.value;
    console.log(`── ${key} (${data.category}) ──`);
    console.log(`   BEFORE: ${fmt(data.value)}`);
    console.log(`   AFTER : ${fmt(value)}`);
    console.log("");
  }

  if (!APPLY) {
    console.log("DRY-RUN — nothing written. Re-run with --apply to commit.\n");
    return;
  }

  // Backup the BEFORE-image to a gitignored temp (config, not PII — still good practice).
  const backupPath = `.tmp-config-backup-${projectRef}-2026-06-12.json`;
  writeFileSync(backupPath, JSON.stringify(before, null, 2), "utf8");
  console.log(`Backup written: ${backupPath}\n`);

  for (const { key, value } of TARGETS) {
    const { error } = await supabase
      .from("business_config")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) {
      console.error(`  ✗ ${key} — write error: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✓ ${key} updated.`);
  }

  // Verify-after read.
  console.log("\nVerify-after:");
  for (const { key } of TARGETS) {
    const { data } = await supabase.from("business_config").select("value").eq("key", key).maybeSingle();
    console.log(`  ${key} = ${fmt(data?.value)}`);
  }
  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
