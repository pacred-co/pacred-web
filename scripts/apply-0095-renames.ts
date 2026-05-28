/**
 * Apply migration 0095 step 1/2 — rename the 4 colliding profiles.
 *
 * The DML (UPDATE) part runs via supabase-js with the service-role key.
 * The DDL (ALTER SEQUENCE + CREATE FUNCTION) part can't go through
 * PostgREST — that needs ภูม to paste the SQL into Supabase Dashboard
 * → SQL Editor. The script prints the exact SQL at the end as a copy-
 * paste convenience.
 *
 * Idempotent — UPDATE has a `member_code = '<old>'` guard so re-running
 * after a successful apply is a no-op.
 *
 * Usage: pnpm tsx scripts/apply-0095-renames.ts
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

interface Rename {
  id:      string;
  oldCode: string;
  newCode: string;
  label:   string;
}

const RENAMES: Rename[] = [
  { id: "057858c4-1b13-4f3f-b5c6-355d2e12dabb", oldCode: "PR124", newCode: "PR10900", label: "อรยา แซ่เต็ง" },
  { id: "0af06d3b-251e-47b2-9d69-324e24677c71", oldCode: "PR122", newCode: "PR10901", label: "TEST PASSOTP" },
  { id: "ec4c8c03-80a5-465f-a827-fcb3e59c47fa", oldCode: "PR121", newCode: "PR10902", label: "พิสิฏฐ์ กุมมลลือ" },
  { id: "4ea48414-070c-4c6b-ad00-e2226af79d27", oldCode: "PR120", newCode: "PR10903", label: "Chitmg" },
];

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`Migration 0095 step 1/2 — rename 4 colliding profiles\n`);

  for (const r of RENAMES) {
    const { data, error } = await sb
      .from("profiles")
      .update({ member_code: r.newCode })
      .eq("id", r.id)
      .eq("member_code", r.oldCode)
      .select("id, member_code")
      .maybeSingle();

    if (error) {
      console.error(`  ✘ ${r.oldCode} → ${r.newCode}  (${r.label}): ${error.message}`);
      continue;
    }
    if (!data) {
      console.log(`  ⤵ ${r.oldCode} → ${r.newCode}  (${r.label}): no row (already migrated or wrong id)`);
      continue;
    }
    console.log(`  ✓ ${r.oldCode} → ${data.member_code}  (${r.label})`);
  }

  console.log(`
────────────────────────────────────────
Step 2/2 — DDL (must run in Supabase Dashboard → SQL Editor):

-- A) shift the sequence past the legacy MAX (PR10899) + buffer
alter sequence public.member_code_seq restart with 11000;

-- B) replace the generator with a collision-safe version
create or replace function public.generate_member_code() returns trigger as $$
declare
  next_num int;
  candidate text;
  retries int := 0;
begin
  if new.member_code is not null then
    return new;
  end if;
  loop
    next_num := nextval('public.member_code_seq');
    candidate := 'PR' || lpad(next_num::text, 3, '0');
    if not exists (select 1 from public.tb_users where userid = candidate)
       and not exists (select 1 from public.profiles where member_code = candidate) then
      new.member_code := candidate;
      return new;
    end if;
    retries := retries + 1;
    if retries > 10 then
      raise exception 'generate_member_code: could not find a free PR-code after 10 retries (last candidate %)', candidate;
    end if;
  end loop;
end;
$$ language plpgsql;

-- C) Sanity-check (should print 0 rows)
select count(*) as remaining_collisions
from public.profiles p join public.tb_users u on u.userid = p.member_code;

────────────────────────────────────────
The full migration file is at:
  supabase/migrations/0095_pr_sequence_shift_collision_fix.sql

Paste it into Dashboard → SQL Editor, run, then close this loop.
`);
}

main().catch((e) => { console.error(e); process.exit(1); });
