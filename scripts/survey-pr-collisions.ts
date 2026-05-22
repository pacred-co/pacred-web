/**
 * For each PR-code collision, print the matching profile row + tb_users row
 * side-by-side so ภูม can tell whether they're the same person (migrated
 * customer who later re-signed up) or genuinely different people who happen
 * to share a number.
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

const COLLIDING = ["PR1", "PR7", "PR120", "PR121", "PR122", "PR124"];

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`PR-code collisions — same-person? side-by-side comparison\n`);

  for (const code of COLLIDING) {
    console.log(`════════════════════════════════════════`);
    console.log(`${code}`);

    const { data: p } = await sb
      .from("profiles")
      .select("id, member_code, phone, email, first_name, last_name, created_at")
      .eq("member_code", code)
      .maybeSingle();
    if (p) {
      console.log(`  profiles row:`);
      console.log(`    id:         ${p.id}`);
      console.log(`    phone:      ${p.phone ?? "—"}`);
      console.log(`    email:      ${p.email ?? "—"}`);
      console.log(`    name:       ${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
      console.log(`    created:    ${p.created_at}`);
    } else {
      console.log(`  profiles:   (none)`);
    }

    const { data: u } = await sb
      .from("tb_users")
      .select("userid, usertel, useremail, username, userlastname, userregistered, userstatus")
      .eq("userid", code)
      .maybeSingle();
    if (u) {
      console.log(`  tb_users row:`);
      console.log(`    userid:     ${u.userid}`);
      console.log(`    usertel:    ${u.usertel ?? "—"}`);
      console.log(`    useremail:  ${u.useremail ?? "—"}`);
      console.log(`    name:       ${u.username ?? ""} ${u.userlastname ?? ""}`.trim());
      console.log(`    registered: ${u.userregistered ?? "—"}`);
      console.log(`    status:     ${u.userstatus}`);
    } else {
      console.log(`  tb_users:   (none)`);
    }

    // Same-person hint — match by phone or email
    if (p && u) {
      const samePhone = p.phone && u.usertel && p.phone === u.usertel;
      const sameEmail = p.email && u.useremail && p.email === u.useremail;
      if (samePhone || sameEmail) {
        console.log(`  ⇒ MATCH: same person (${[samePhone && "phone", sameEmail && "email"].filter(Boolean).join(" + ")})`);
      } else {
        console.log(`  ⇒ DIFFERENT people (different phone/email)`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
