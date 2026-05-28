/**
 * Survey 01 · How many tb_users rows have NO matching profiles row?
 *
 * Wave 16 follow-up A · 2026-05-23
 *
 * Context: `actions/admin/forwarder-check.ts` `adminCallPriceUser` (and
 * `actions/admin/tb-bulk.ts`) need to push LINE OA + email notifications to
 * customers. The Pacred sender lives in `lib/notifications/index.ts` and
 * takes a `profiles.id` (uuid). The legacy queries we run hand us a
 * `tb_users.userid` (text · `PR1234`). To send notifications we need every
 * legacy customer to have a matching `profiles` row so we can resolve
 * uuid → id.
 *
 * Today (per pcs-legacy-bridge.ts ensureLegacyProfile()) a `profiles` row
 * is created **lazily on the customer's first sign-in via the legacy
 * bridge**. Customers who have not logged in since the Phase A migration
 * have no profile → no uuid → notifications silently drop. This script
 * measures that gap.
 *
 * Matching rule (per pcs-legacy-bridge.ts L221 + 0083_pcs_legacy_member_seq):
 *   profiles.member_code == tb_users.userid (both are `PR<n>` after the
 *   PCS→PR rebrand in the Phase A load).
 *
 * Output:
 *   total tb_users rows
 *   total profiles rows (and how many already have member_code set)
 *   orphan count (tb_users WHERE userid NOT IN (profiles.member_code))
 *   sample 20 orphan rows for sanity check
 *
 * Usage:
 *   pnpm tsx scripts/survey/01-tb-users-vs-profiles.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── ENV LOADER ─────────────────────────────────────────────────────────────
function loadEnvLocal(): Record<string, string> {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error(`ERROR: .env.local not found at ${envPath}`);
    process.exit(1);
  }
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [
          l.slice(0, idx).trim(),
          l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

interface TbUserRow {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
  useremail: string | null;
  userstatus: string;
  userregistered: string | null;
}

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`  Survey 01 · tb_users vs profiles — orphan analysis`);
  console.log(`  Target: ${url}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  // 1) Total tb_users
  const { count: tbCount, error: tbErr } = await sb
    .from("tb_users")
    .select("*", { count: "exact", head: true });
  if (tbErr) { console.error("tb_users count error:", tbErr); process.exit(1); }
  console.log(`tb_users rows total                 : ${tbCount}`);

  // 2) Total profiles
  const { count: prCount, error: prErr } = await sb
    .from("profiles")
    .select("*", { count: "exact", head: true });
  if (prErr) { console.error("profiles count error:", prErr); process.exit(1); }
  console.log(`profiles rows total                 : ${prCount}`);

  // 2b) Profiles with a member_code
  const { count: prWithCode } = await sb
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .not("member_code", "is", null);
  console.log(`profiles rows with member_code      : ${prWithCode}`);

  // 3) Collect every profile.member_code into a Set (in batches — supabase
  //    select() caps at 1000 unless you page).
  const codeSet = new Set<string>();
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from("profiles")
        .select("member_code")
        .not("member_code", "is", null)
        .range(from, from + PAGE - 1)
        .returns<{ member_code: string }[]>();
      if (error) { console.error("profiles select error:", error); process.exit(1); }
      if (!data || data.length === 0) break;
      for (const r of data) codeSet.add(r.member_code);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`distinct profile member_codes loaded: ${codeSet.size}\n`);

  // 4) Walk tb_users in batches; count orphans + collect first 20 samples.
  let orphanCount = 0;
  const sample: TbUserRow[] = [];
  const HAS_PHONE = { count: 0 };
  const HAS_EMAIL = { count: 0 };
  const HAS_BOTH = { count: 0 };
  const HAS_NEITHER = { count: 0 };
  const ACTIVE_ORPHAN = { count: 0 };  // userstatus='1' AND orphan
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from("tb_users")
        .select("userid, username, userlastname, usertel, useremail, userstatus, userregistered")
        .order("userid", { ascending: true })
        .range(from, from + PAGE - 1)
        .returns<TbUserRow[]>();
      if (error) { console.error("tb_users select error:", error); process.exit(1); }
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (codeSet.has(r.userid)) continue;
        orphanCount++;
        const hasPhone = !!(r.usertel && r.usertel.trim().length >= 9);
        const hasEmail = !!(r.useremail && r.useremail.trim().includes("@"));
        if (hasPhone && hasEmail) HAS_BOTH.count++;
        else if (hasPhone) HAS_PHONE.count++;
        else if (hasEmail) HAS_EMAIL.count++;
        else HAS_NEITHER.count++;
        if (r.userstatus === "1") ACTIVE_ORPHAN.count++;
        if (sample.length < 20) sample.push(r);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`  RESULTS`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`Total tb_users orphans (no matching profile.member_code): ${orphanCount}`);
  console.log(`  • active (userstatus='1') orphans       : ${ACTIVE_ORPHAN.count}`);
  console.log(`  • orphans WITH phone only               : ${HAS_PHONE.count}`);
  console.log(`  • orphans WITH email only               : ${HAS_EMAIL.count}`);
  console.log(`  • orphans WITH both phone + email       : ${HAS_BOTH.count}`);
  console.log(`  • orphans WITH neither (cannot contact) : ${HAS_NEITHER.count}`);
  console.log();

  console.log(`Sample (first 20 orphans):`);
  console.log(`────────────────────────────────────────────────────────────────`);
  for (const r of sample) {
    const name = `${r.username ?? ""} ${r.userlastname ?? ""}`.trim() || "—";
    const phone = r.usertel ?? "—";
    const email = r.useremail ?? "—";
    const status = r.userstatus === "1" ? "active" : `status=${r.userstatus}`;
    console.log(`  ${r.userid.padEnd(10)} ${status.padEnd(11)} ${name.padEnd(35).slice(0, 35)} ${phone.padEnd(15)} ${email}`);
  }
  console.log();

  if (orphanCount === 0) {
    console.log(`✅ No orphans — every tb_users row already has a profile. No-op.`);
  } else {
    console.log(`▶ Next step: run scripts/data/02-provision-profiles-for-tb-users.ts`);
    console.log(`  to provision profiles + auth.users for ${orphanCount} legacy customers.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
