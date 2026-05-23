/**
 * One-off — recover orphan auth.users that have no `profiles` row.
 *
 * Context: registerPersonal / registerJuristicStep1 created the Supabase
 * auth.user, then the profiles INSERT failed for some reason (the opaque
 * "profile_failed" path — commit 94e0274 now surfaces the reason, but a
 * pile of orphans accumulated BEFORE that fix landed). The orphans block
 * the same phone from re-registering, so customers are lost.
 *
 * This script:
 *   1. Lists every auth.users row.
 *   2. Finds those without a matching profiles.id.
 *   3. Attempts profile insert for the FIRST orphan as a diagnostic — if
 *      it fails, prints the full PostgrestError and exits (so the root
 *      cause is visible before we touch the rest).
 *   4. If the first insert succeeds, bulk-recovers the remaining orphans,
 *      reporting ok/fail per row.
 *
 * Run:
 *   pnpm exec tsx --env-file=.env.recovery-prod scripts/recover-orphan-profiles.ts
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Service-role key bypasses RLS — point at the right project ONLY.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
console.log(`[recover] target: ${url}`);

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 1. List every auth user (paginate) ────────────────────────────
console.log("\n[1] Listing auth.users…");
type AuthUser = {
  id: string;
  phone?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  created_at: string;
};
const allUsers: AuthUser[] = [];
let page = 1;
const perPage = 1000;
while (true) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
  if (error) {
    console.error("  listUsers failed:", error);
    process.exit(1);
  }
  allUsers.push(...(data.users as unknown as AuthUser[]));
  if (data.users.length < perPage) break;
  page++;
}
console.log(`  total auth.users: ${allUsers.length}`);

// ── 2. Fetch every profile id in one shot, set-diff for orphans ───
console.log("\n[2] Loading existing profile ids (paginated)…");
const profIds = new Set<string>();
{
  let pFrom = 0;
  const pSize = 1000;
  while (true) {
    const { data: pg, error: pgErr } = await admin
      .from("profiles")
      .select("id")
      .range(pFrom, pFrom + pSize - 1);
    if (pgErr) {
      console.error("  profiles select failed:", pgErr);
      process.exit(1);
    }
    for (const row of pg ?? []) profIds.add(row.id as string);
    if ((pg ?? []).length < pSize) break;
    pFrom += pSize;
  }
}
console.log(`  existing profiles: ${profIds.size}`);

const orphans = allUsers.filter((u) => !profIds.has(u.id));
console.log(`  orphans (auth.user with no profile): ${orphans.length}`);

if (orphans.length === 0) {
  console.log("\nNo orphans — exiting.");
  process.exit(0);
}

// Show the first few for sanity
console.log("\n  first 5 orphans:");
for (const u of orphans.slice(0, 5)) {
  const meta = u.user_metadata ?? {};
  console.log(
    `    ${u.id} | phone=${u.phone ?? "—"} | name=${(meta.first_name as string) ?? ""} ${
      (meta.last_name as string) ?? ""
    } | created=${u.created_at}`,
  );
}

// ── 3. Diagnostic insert for the first orphan ─────────────────────
console.log("\n[3] Attempting profile insert for first orphan (diagnostic)…");
const first = orphans[0]!;
const meta1 = (first.user_metadata ?? {}) as Record<string, unknown>;
const buildInsert = (u: AuthUser, m: Record<string, unknown>) => ({
  id: u.id,
  account_type: "personal" as const,
  first_name: (m.first_name as string | undefined) ?? null,
  last_name: (m.last_name as string | undefined) ?? null,
  phone: u.phone ?? null,
  email: u.email ?? null,
  services: [] as string[],
  status: "active" as const,
});
const firstInsert = buildInsert(first, meta1);
console.log("  payload:", firstInsert);
const { error: insErr } = await admin.from("profiles").insert(firstInsert);
if (insErr) {
  console.error("\n[3] ❌ INSERT FAILED — root cause:");
  console.error("  message:", insErr.message);
  console.error("  code:   ", insErr.code);
  console.error("  details:", insErr.details);
  console.error("  hint:   ", insErr.hint);
  console.error("\n→ Fix the underlying schema/code, then re-run this script.");
  process.exit(2);
}
console.log("  ✓ first orphan recovered");

// ── 4. Bulk recover the rest ──────────────────────────────────────
console.log(`\n[4] Bulk-recovering remaining ${orphans.length - 1} orphans…`);
let ok = 1;       // we already recovered the first
let fail = 0;
const failures: Array<{ id: string; phone: string | undefined; reason: string }> = [];
for (const u of orphans.slice(1)) {
  const m = (u.user_metadata ?? {}) as Record<string, unknown>;
  const { error } = await admin.from("profiles").insert(buildInsert(u, m));
  if (error) {
    fail++;
    failures.push({ id: u.id, phone: u.phone, reason: error.message });
    if (fail <= 5) {
      console.error(`  ✗ ${u.id} (phone=${u.phone}): ${error.code} — ${error.message}`);
    }
  } else {
    ok++;
  }
}

console.log(`\n[4] DONE — recovered ${ok} / failed ${fail} / total ${orphans.length}`);
if (fail > 0) {
  console.log("\nFailure summary (first 10):");
  for (const f of failures.slice(0, 10)) {
    console.log(`  ${f.id} | phone=${f.phone} | ${f.reason}`);
  }
}
