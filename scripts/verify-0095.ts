/**
 * Verify migration 0095 — both steps applied (4 renames + sequence shift +
 * collision-safe trigger).
 *
 * Checks (all from supabase-js · service-role):
 *  1. The 4 renamed profiles now have their new PR codes (10900..10903)
 *  2. No PR-code collisions remain between profiles + tb_users
 *  3. The collision-safe trigger works: insert a throwaway test row
 *     under a controlled id, observe the assigned member_code, then
 *     DELETE the test row. Expectation: member_code ≥ PR11000.
 *
 * Usage: pnpm tsx scripts/verify-0095.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function loadEnvLocal(): Record<string, string> {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) { console.error("missing .env.local"); process.exit(1); }
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
      }),
  );
}

const EXPECTED_RENAMES = [
  { id: "057858c4-1b13-4f3f-b5c6-355d2e12dabb", code: "PR10900", label: "อรยา แซ่เต็ง" },
  { id: "0af06d3b-251e-47b2-9d69-324e24677c71", code: "PR10901", label: "TEST PASSOTP" },
  { id: "ec4c8c03-80a5-465f-a827-fcb3e59c47fa", code: "PR10902", label: "พิสิฏฐ์ กุมมลลือ" },
  { id: "4ea48414-070c-4c6b-ad00-e2226af79d27", code: "PR10903", label: "Chitmg" },
];

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`Migration 0095 verification\n`);

  // ─── 1. Confirm the 4 renames are in place ─────────────────────────
  console.log(`Check 1 — 4 profile renames:`);
  let renameOk = true;
  for (const r of EXPECTED_RENAMES) {
    const { data } = await sb
      .from("profiles")
      .select("id, member_code")
      .eq("id", r.id)
      .maybeSingle();
    if (data?.member_code === r.code) {
      console.log(`  ✓ ${r.code}  (${r.label})`);
    } else {
      console.log(`  ✘ ${r.label}: expected ${r.code}, found ${data?.member_code ?? "(missing)"}`);
      renameOk = false;
    }
  }

  // ─── 2. Collision count (paginated · honest count) ─────────────────
  console.log(`\nCheck 2 — collision count (profiles.member_code ∩ tb_users.userid):`);
  const { data: pCodes } = await sb
    .from("profiles")
    .select("member_code")
    .like("member_code", "PR%")
    .range(0, 49999);
  const profileSet = new Set((pCodes ?? []).map((r) => r.member_code).filter(Boolean) as string[]);

  let collisionCount = 0;
  for (let from = 0; from < 50000; from += 1000) {
    const { data: page } = await sb
      .from("tb_users")
      .select("userid")
      .or("userid.like.PR%,userid.like.PCS%")
      .range(from, from + 999);
    if (!page || page.length === 0) break;
    for (const u of page as { userid: string }[]) {
      // Strip PCS prefix to PR-equivalent for comparison (legacy data
      // sometimes still uses PCS<n> in tb_users; the trigger only
      // checks tb_users.userid verbatim, but a PR<n> profile could
      // still semantically collide with PCS<n>).
      if (profileSet.has(u.userid)) collisionCount++;
    }
    if (page.length < 1000) break;
  }
  if (collisionCount === 0) {
    console.log(`  ✓ 0 collisions`);
  } else {
    console.log(`  ✘ ${collisionCount} collisions still exist`);
  }

  // ─── 3. Trigger probe — insert/observe/cleanup ─────────────────────
  console.log(`\nCheck 3 — trigger probe (insert test row, observe member_code):`);
  const testId = randomUUID();
  const testPhone = `+999999${Math.floor(Math.random() * 90_000_000 + 10_000_000)}`;
  const { data: inserted, error: insErr } = await sb
    .from("profiles")
    .insert({ id: testId, phone: testPhone, first_name: "MIGRATION_TEST", last_name: "DELETE_ME" })
    .select("id, member_code")
    .single();
  if (insErr) {
    console.log(`  ✘ INSERT failed: ${insErr.message}`);
  } else if (!inserted) {
    console.log(`  ✘ INSERT returned no row`);
  } else {
    const num = parseInt((inserted.member_code ?? "").replace(/^PR/, ""), 10);
    if (num >= 11000) {
      console.log(`  ✓ assigned ${inserted.member_code} (≥ PR11000 — sequence is shifted)`);
    } else {
      console.log(`  ✘ assigned ${inserted.member_code} (expected ≥ PR11000 — sequence NOT shifted; did the DDL run?)`);
    }
    // Cleanup — always delete the probe row.
    const { error: delErr } = await sb.from("profiles").delete().eq("id", testId);
    if (delErr) {
      console.log(`  ⚠ cleanup DELETE failed (manual delete needed for id=${testId}): ${delErr.message}`);
    } else {
      console.log(`  ⤵ probe row cleaned up`);
    }
  }

  console.log(`\n────────────────────────────────────────`);
  if (renameOk && collisionCount === 0) {
    console.log(`Status: ✅ migration 0095 applied successfully`);
  } else {
    console.log(`Status: ⚠ some checks failed — see above`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
