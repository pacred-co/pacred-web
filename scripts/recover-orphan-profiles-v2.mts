/**
 * V2 — recover the 9 orphan profiles with EXPLICIT member_codes (PR20000+).
 *
 * V1 used the trigger's nextval path which is broken on prod — the
 * trigger function carries a custom retry loop that probes PR100..PR109
 * (origin unknown — possibly a manual edit during the 2026-05-20
 * dev→prod project switch). Setting member_code explicitly bypasses the
 * trigger's generation branch entirely (the function only generates
 * when NEW.member_code IS NULL).
 *
 * Recovery range PR20000+ leaves a safe gap above the current max
 * (sequence reports 10903) so when เดฟ fixes the trigger + bumps the
 * sequence past 20100, future signups via the app cannot collide with
 * these recovered rows.
 *
 * Run:
 *   pnpm exec tsx --env-file=.env.recovery-prod scripts/recover-orphan-profiles-v2.mts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
console.log(`[recover-v2] target: ${url}`);

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── auth.users (paginated) ───────────────────────────────────────
type AuthUser = {
  id: string;
  phone?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  created_at: string;
};
const allUsers: AuthUser[] = [];
{
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("listUsers failed:", error);
      process.exit(1);
    }
    allUsers.push(...(data.users as unknown as AuthUser[]));
    if (data.users.length < 1000) break;
    page++;
  }
}
console.log(`auth.users: ${allUsers.length}`);

// ── existing profiles (paginated) ────────────────────────────────
const profIds = new Set<string>();
{
  let p = 0;
  while (true) {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .range(p, p + 999);
    if (error) {
      console.error("profiles select failed:", error);
      process.exit(1);
    }
    for (const r of data ?? []) profIds.add(r.id as string);
    if ((data ?? []).length < 1000) break;
    p += 1000;
  }
}
console.log(`profiles: ${profIds.size}`);

// ── orphans, sorted oldest-first ─────────────────────────────────
const orphans = allUsers.filter((u) => !profIds.has(u.id));
orphans.sort((a, b) => a.created_at.localeCompare(b.created_at));
console.log(`orphans: ${orphans.length}`);
if (orphans.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

// ── recover with explicit member_code PR20000+ ───────────────────
let codeNum = 20000;
let ok = 0;
let fail = 0;
for (const u of orphans) {
  const m = (u.user_metadata ?? {}) as Record<string, unknown>;
  const memberCode = `PR${codeNum}`;
  const firstName = (m.first_name as string | undefined) ?? null;
  const lastName = (m.last_name as string | undefined) ?? null;
  const { error } = await admin.from("profiles").insert({
    id:           u.id,
    member_code:  memberCode,  // explicit → bypass trigger's broken retry loop
    account_type: "personal",
    first_name:   firstName,
    last_name:    lastName,
    phone:        u.phone && u.phone.length > 0 ? u.phone : null,
    email:        u.email && u.email.length > 0 ? u.email : null,
    services:     [],
    status:       "active",
  });
  if (error) {
    fail++;
    console.error(
      `✗ ${memberCode} ← ${u.id} (phone=${u.phone ?? "—"}, name=${firstName} ${lastName}): ${error.code} ${error.message}`,
    );
  } else {
    ok++;
    console.log(`✓ ${memberCode} ← ${u.id} (phone=${u.phone ?? "—"}, ${firstName} ${lastName})`);
    codeNum++;
  }
}
console.log(`\nDone — recovered ${ok} / failed ${fail} / total ${orphans.length}`);
