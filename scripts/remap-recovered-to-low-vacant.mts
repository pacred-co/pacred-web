/**
 * Remap the 9 recently-recovered orphan profiles (currently PR20000–PR20008)
 * down to the LOWEST-VACANT PR<n> in the existing series.
 *
 * Per เดฟ 2026-05-23 night: the recovered customers should fill empty slots
 * in the existing 1..max(existing) range first, then the running counter
 * picks up from there. PR20000 was a safety floor while the trigger was
 * broken — now that we know what's going on, lower them back to where
 * they belong.
 *
 * member_code has a unique constraint but is not referenced as a FK
 * anywhere (verified per migration 0060 comment) — UPDATE-in-place is safe.
 * The generate_member_code trigger fires on INSERT only, so UPDATE doesn't
 * re-trigger any allocation.
 *
 * Run:
 *   pnpm exec tsx --env-file=.env.recovery-prod scripts/remap-recovered-to-low-vacant.mts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
console.log(`[remap] target: ${url}`);

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RECOVERY_CODES = [
  "PR20000", "PR20001", "PR20002", "PR20003", "PR20004",
  "PR20005", "PR20006", "PR20007", "PR20008",
];

// ── Pull ALL member_codes (paginated) — to find vacant slots + max ────
console.log("\n[1] Loading all member_codes (paginated)…");
const allCodes = new Set<string>();
let maxN = 0;
{
  let p = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await admin
      .from("profiles")
      .select("member_code")
      .range(p, p + pageSize - 1);
    if (error) {
      console.error("  select failed:", error);
      process.exit(1);
    }
    for (const r of data ?? []) {
      const mc = (r.member_code as string | null) ?? null;
      if (!mc) continue;
      allCodes.add(mc);
      const m = mc.match(/^PR(\d+)$/);
      if (m) {
        const n = parseInt(m[1]!, 10);
        // EXCLUDE the recovery range when computing max — we want the
        // "real" max of the legacy + recent population.
        if (n < 20000 && n > maxN) maxN = n;
      }
    }
    if ((data ?? []).length < pageSize) break;
    p += pageSize;
  }
}
console.log(`  member_codes loaded: ${allCodes.size}`);
console.log(`  max PR<n> (excluding 20000+ recovery range): ${maxN}`);

// ── Find the 9 lowest vacant PR<n> in 1..maxN ─────────────────────────
console.log("\n[2] Scanning for lowest 9 vacant…");
const vacant: number[] = [];
for (let n = 1; n <= maxN && vacant.length < 9; n++) {
  if (!allCodes.has(`PR${n}`)) vacant.push(n);
}
if (vacant.length < 9) {
  console.error(`  only found ${vacant.length} vacant in 1..${maxN} — series too dense`);
  process.exit(1);
}
console.log(`  lowest 9 vacant: ${vacant.join(", ")}`);

// ── Pull the 9 recovered profiles by code, sort oldest-first ──────────
console.log("\n[3] Pulling the 9 recovered profiles…");
const { data: recovered, error: recErr } = await admin
  .from("profiles")
  .select("id, member_code, first_name, last_name, phone, created_at")
  .in("member_code", RECOVERY_CODES)
  .order("member_code", { ascending: true });
if (recErr) {
  console.error("  select failed:", recErr);
  process.exit(1);
}
if (!recovered || recovered.length !== 9) {
  console.error(`  expected 9, got ${recovered?.length ?? 0}`);
  process.exit(1);
}

// ── Remap PR2000x → vacant[i] ─────────────────────────────────────────
console.log("\n[4] Remapping…");
let ok = 0;
let fail = 0;
for (let i = 0; i < 9; i++) {
  const r = recovered[i] as {
    id: string;
    member_code: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  };
  const newCode = `PR${vacant[i]}`;
  const { error } = await admin
    .from("profiles")
    .update({ member_code: newCode })
    .eq("id", r.id);
  if (error) {
    fail++;
    console.error(
      `  ✗ ${r.member_code} → ${newCode} (${r.first_name} ${r.last_name}, ${r.phone}): ${error.message}`,
    );
  } else {
    ok++;
    console.log(
      `  ✓ ${r.member_code} → ${newCode}   (${r.first_name ?? "—"} ${r.last_name ?? "—"}, ${r.phone ?? "—"})`,
    );
  }
}
console.log(`\nDone — remapped ${ok} / failed ${fail}`);
