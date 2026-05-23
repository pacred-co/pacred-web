/**
 * Run AFTER เดฟ pastes the SQL from migrations/0090_lowest_vacant_member_code.sql
 * (or the emergency paste-block printed below) into Supabase Studio.
 *
 * Does 5 successive inserts via service-role + reports the assigned codes.
 * Expected: PR10, PR11, PR12, PR13, PR14  (or whichever 5 lowest vacant)
 *
 * Run:
 *   pnpm exec tsx --env-file=.env.recovery-prod scripts/verify-fix-and-probe.mts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
console.log("target:", url);

const ids: string[] = [];
const assigned: string[] = [];
const errors: string[] = [];

try {
  for (let i = 0; i < 5; i++) {
    const phone = `669999${(Date.now() + i).toString().slice(-6)}`;
    const email = `verify-${Date.now()}-${i}@test.pacred.invalid`;
    const { data: c, error: cErr } = await admin.auth.admin.createUser({
      phone, email, password: "Verify-Throwaway-2026",
      phone_confirm: true, email_confirm: true,
    });
    if (cErr || !c.user) { errors.push(`[${i}] createUser: ${cErr?.message}`); continue; }
    ids.push(c.user.id);

    const { error: iErr } = await admin.from("profiles").insert({
      id: c.user.id, account_type: "personal",
      first_name: `Verify${i}`, last_name: "Test",
      phone, email: null, services: [], status: "active",
    });
    if (iErr) {
      errors.push(`[${i}] insert: ${iErr.code} ${iErr.message} | details=${iErr.details}`);
    } else {
      const { data: row } = await admin
        .from("profiles").select("member_code").eq("id", c.user.id).maybeSingle();
      assigned.push(row?.member_code ?? "?");
      console.log(`  [${i}] ${row?.member_code}`);
    }
  }
} finally {
  console.log("\ncleanup…");
  for (const id of ids) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`  cleaned ${ids.length}`);
}

console.log("\n══════════════════════════════════════════════════════");
console.log("assigned codes :", assigned);
console.log("errors         :", errors);
console.log("══════════════════════════════════════════════════════");

if (errors.length > 0) {
  console.log("❌ STILL BROKEN — paste the SQL block again, then re-run this");
  process.exit(2);
}
const nums = assigned.map((c) => parseInt(c.replace(/^PR/, ""), 10));
const ascending = nums.every((n, i) => i === 0 || n > nums[i - 1]!);
const lowAndContiguous = nums[0]! < 1000 && (nums[4]! - nums[0]!) < 100;
if (ascending && lowAndContiguous) {
  console.log("✅ LOWEST-VACANT scanner working — low gaps being filled");
} else if (ascending && nums[0]! >= 10904) {
  console.log("🟡 simple nextval — continues from max+1, NOT filling low gaps");
} else {
  console.log("⚠️  unexpected pattern — review");
}
