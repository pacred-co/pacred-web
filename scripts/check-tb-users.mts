/**
 * Check if there's a `tb_users` table (D1 faithful-port mirror) and what
 * member_code values it has. Theory: the current trigger queries tb_users
 * instead of profiles → max comes out at 200 → PR201 collision loop.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
console.log("target:", url);

// Try tb_users
const { data: tu, error: tuErr, count } = await admin
  .from("tb_users")
  .select("member_code, userID", { count: "exact" })
  .order("userID", { ascending: false })
  .limit(10);
console.log("\ntb_users sample (top 10 by userID):");
if (tuErr) console.log("  error:", tuErr.message);
else {
  console.log("  count:", count);
  console.log("  rows:", tu);
}

// Try also looking at member_code distribution in tb_users
if (!tuErr) {
  const { data: top } = await admin
    .from("tb_users")
    .select("member_code")
    .ilike("member_code", "PR%")
    .order("member_code", { ascending: false })
    .limit(5);
  console.log("\n  top 5 PR member_codes in tb_users:", top);
}

// Same for profiles
const { data: pf } = await admin
  .from("profiles")
  .select("member_code")
  .ilike("member_code", "PR%")
  .order("member_code", { ascending: false })
  .limit(5);
console.log("\n  top 5 PR member_codes in profiles:", pf);

// Try other candidate mirror tables
for (const t of ["users_legacy", "pcs_users", "users", "member"]) {
  const { error } = await admin.from(t).select("*", { count: "exact", head: true });
  if (!error) console.log(`  table "${t}" EXISTS`);
}
