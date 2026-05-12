/**
 * One-off script: promote a profile to super admin.
 *
 * Usage:
 *   pnpm tsx scripts/promote-admin.ts              # lists all profiles
 *   pnpm tsx scripts/promote-admin.ts <uuid>       # promotes that profile
 *   pnpm tsx scripts/promote-admin.ts <phone>      # auto-resolves by phone
 *
 * Reads service-role key from .env.local. Uses the same Supabase
 * connection the app uses — no separate config needed.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Load .env.local manually (no Next.js context here)
const env = Object.fromEntries(
  readFileSync(join(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "")];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    // List all profiles to help pick
    const { data, error } = await supabase
      .from("profiles")
      .select("id, member_code, first_name, last_name, phone, email, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) { console.error(error); process.exit(1); }
    console.log("Recent profiles (most recent first):");
    console.log("─".repeat(110));
    for (const p of data ?? []) {
      console.log(
        `${p.id}  ${(p.member_code ?? "—").padEnd(8)}  ` +
        `${`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim().padEnd(28)}  ` +
        `${(p.phone ?? "—").padEnd(13)}  ${p.email ?? "—"}`,
      );
    }
    console.log("─".repeat(110));
    console.log("\nUsage: pnpm tsx scripts/promote-admin.ts <uuid-or-phone>");
    return;
  }

  // Resolve arg → uuid (either it IS a uuid, or it's a phone we look up)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg);

  let profileId: string;
  let display: string;

  if (isUuid) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, member_code, first_name, last_name, phone")
      .eq("id", arg)
      .maybeSingle();
    if (error || !data) { console.error("Profile not found:", arg); process.exit(1); }
    profileId = data.id;
    display = `${data.member_code} · ${data.first_name ?? ""} ${data.last_name ?? ""} · ${data.phone ?? ""}`;
  } else {
    // try as phone
    const { data, error } = await supabase
      .from("profiles")
      .select("id, member_code, first_name, last_name, phone")
      .eq("phone", arg)
      .maybeSingle();
    if (error || !data) { console.error("Profile not found for phone:", arg); process.exit(1); }
    profileId = data.id;
    display = `${data.member_code} · ${data.first_name ?? ""} ${data.last_name ?? ""} · ${data.phone ?? ""}`;
  }

  // Insert (or do nothing if already exists)
  const { error: insertErr } = await supabase
    .from("admins")
    .upsert(
      { profile_id: profileId, role: "super", is_active: true },
      { onConflict: "profile_id,role", ignoreDuplicates: false },
    );

  if (insertErr) {
    console.error("Insert failed:", insertErr.message);
    if (insertErr.message.includes("relation") || insertErr.message.includes("does not exist")) {
      console.error("\n→ Migration 0015_admin_rbac.sql isn't applied. Run it in Supabase SQL editor first.");
    }
    process.exit(1);
  }

  console.log(`✓ Promoted to super admin:`);
  console.log(`  ${display}`);
  console.log(`  ${profileId}`);
  console.log(`\nReload /admin in the browser — should now load.`);
}

main();
