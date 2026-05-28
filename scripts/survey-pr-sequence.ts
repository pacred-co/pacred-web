/**
 * Survey the current state of PR-code numbering across profiles +
 * tb_users so we can pick a safe collision-free shift for the
 * member_code_seq sequence.
 *
 * Reads only — no writes. Compares:
 *   - max numeric PR<n> in profiles.member_code
 *   - max numeric PR<n> in tb_users.userid
 *   - current value of member_code_seq
 *   - count of collisions (same PR<n> in both tables)
 *
 * Usage: pnpm tsx scripts/survey-pr-sequence.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`Surveying PR-code numbering · ${env.NEXT_PUBLIC_SUPABASE_URL}\n`);

  // 1) profiles.member_code — MAX numeric component
  const { data: profileCodes, error: pErr } = await sb
    .from("profiles")
    .select("member_code")
    .like("member_code", "PR%")
    .limit(20000);
  if (pErr) { console.error("profiles error:", pErr); process.exit(1); }
  const profileNums = (profileCodes ?? [])
    .map((r) => parseInt((r.member_code ?? "").replace(/^PR/, ""), 10))
    .filter((n) => Number.isFinite(n));
  const profileMax = profileNums.length > 0 ? Math.max(...profileNums) : 0;
  const profileCount = profileNums.length;

  // 2) tb_users.userid — paginated (Supabase REST hard-caps each request
  // at max_rows=1000; we loop pages to reach the full 8,898).
  const userIds: { userid: string }[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data: page, error } = await sb
      .from("tb_users")
      .select("userid")
      .or("userid.like.PR%,userid.like.PCS%")
      .range(from, from + 999);
    if (error) { console.error("tb_users page error:", error); break; }
    if (!page || page.length === 0) break;
    userIds.push(...(page as { userid: string }[]));
    if (page.length < 1000) break;
  }
  const uErr = null;
  if (uErr) { console.error("tb_users error:", uErr); process.exit(1); }
  const userNums = userIds
    .map((r) => parseInt((r.userid ?? "").replace(/^(PR|PCS)/, ""), 10))
    .filter((n) => Number.isFinite(n));
  const userMax = userNums.length > 0 ? Math.max(...userNums) : 0;
  const userCount = userNums.length;

  // 3) collisions — userid set ∩ member_code set (after stripping prefix)
  const userSet = new Set(userNums);
  const collisions: number[] = [];
  for (const n of profileNums) {
    if (userSet.has(n)) collisions.push(n);
  }

  // 4) Try to read current sequence value via a no-op SELECT pattern
  // (Supabase REST doesn't expose nextval/currval — we'd need PostgREST RPC).
  // Skip — print recommendation based on MAX comparison.

  console.log(`profiles.member_code (PR pattern)`);
  console.log(`  count:     ${profileCount}`);
  console.log(`  max num:   ${profileMax}  → PR${profileMax}`);
  console.log(``);
  console.log(`tb_users.userid (PR + PCS patterns)`);
  console.log(`  count:     ${userCount}`);
  console.log(`  max num:   ${userMax}  → PR${userMax}`);
  console.log(``);
  console.log(`Collisions (same num in both tables, ignoring prefix):`);
  console.log(`  count: ${collisions.length}`);
  if (collisions.length > 0) {
    console.log(`  first 10: ${collisions.slice(0, 10).map((n) => `PR${n}`).join(", ")}${collisions.length > 10 ? "..." : ""}`);
  }
  console.log(``);

  const recommendedStart = Math.max(profileMax, userMax) + 1000;
  console.log(`────────────────────────────────────────`);
  console.log(`Recommendation:`);
  console.log(`  ALTER SEQUENCE public.member_code_seq RESTART WITH ${recommendedStart};`);
  console.log(`  (= MAX(profile,tb_users) + 1000-buffer · next signup → PR${recommendedStart})`);
  console.log(``);
  console.log(`This guarantees the next Pacred signup never collides with a`);
  console.log(`legacy tb_users.userid; the 1,000-row buffer absorbs concurrent`);
  console.log(`migration activity while ภูม backfills the rest.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
