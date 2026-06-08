#!/usr/bin/env node
/**
 * One-off fix (2026-06-08): complete + correct น้องมาย (ศรสวรรค์ เครื่องสินธุ์)
 * — added via /admin/admins/new with the WRONG email (missing the "admin_"
 * prefix) and an incomplete record. Make her a working CS admin like the others.
 *
 * Current state (probed):
 *   auth.users e803f396… email=mind@pacred.co.th (no admin_) · no phone
 *   profiles   email=mind@pacred.co.th · ศรสวรรค์ เครื่องสินธุ์ · PR063 · emp 690618
 *   admins     role=super but is_active=FALSE  (→ cannot log in)
 *   admin_contact_extras  section=CS · nickname=มายด์ · work_phone=0994359535
 *                         but legacy_admin_id=NULL  (→ rep bridge broken)
 *   tb_admin   NONE        (→ not in any pool · cannot be assigned CS work)
 *
 * Fix (→ mirror admin_ploy, the existing CS):
 *   1. auth.users.email  mind@pacred.co.th → admin_mind@pacred.co.th
 *   2. profiles.email    mind@pacred.co.th → admin_mind@pacred.co.th
 *   3. admins.is_active  false → true
 *   4. admin_contact_extras.legacy_admin_id  null → "admin_mind"
 *   5. tb_admin INSERT   adminID=admin_mind · adminStatusA='1' · adminStatusCS='1'
 *        (CS pool) · adminStatusSale='' (not sales) · name/nick/tel/email · adminPass
 *
 * Result: SALES pool stays 3 (toey/pee/may); CS pool → 2 (ploy + mind).
 *
 * DRY-RUN by default (prints the plan + a BEFORE backup). Pass --apply to execute.
 *   node scripts/fix-admin-mind-2026-06-08.mjs            # dry-run
 *   node scripts/fix-admin-mind-2026-06-08.mjs --apply    # execute
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const APPLY = process.argv.includes("--apply");
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

const UID = "e803f396-e5cc-4265-b120-a459609c4011";
const NEW_EMAIL = "admin_mind@pacred.co.th";
const ADMIN_ID = "admin_mind";

// passTam('123456') — legacy parity (login uses Supabase auth; this is the
// tb_admin.adminPass for the legacy bridge). Same scheme as lib/auth/pcs-legacy-password.ts.
function md5(s) { return createHash("md5").update(s, "utf8").digest("hex"); }
function passTam(p) { const a = md5(p); const b = a.slice(0, 15); return a.split("").reverse().join("") + b + md5(b); }
const LEGACY_PASS = passTam("123456");

const log = (...a) => console.log(...a);
log(`\n=== fix-admin-mind ${APPLY ? "APPLY ⚠️" : "DRY-RUN"} ===\n`);

// ── BEFORE snapshot (backup) ──
const { data: au } = await sb.auth.admin.getUserById(UID);
const { data: prof } = await sb.from("profiles").select("id,email,first_name,last_name,member_code,employee_code").eq("id", UID).maybeSingle();
const { data: roles } = await sb.from("admins").select("role,is_active").eq("profile_id", UID);
const { data: ex } = await sb.from("admin_contact_extras").select("profile_id,nickname,display_name,section,work_phone,legacy_admin_id").eq("profile_id", UID).maybeSingle();
const { data: tbExisting } = await sb.from("tb_admin").select("adminID").eq("adminID", ADMIN_ID).maybeSingle();
log("BEFORE backup:");
log("  auth.email :", au?.user?.email);
log("  profiles   :", JSON.stringify(prof));
log("  admins     :", JSON.stringify(roles));
log("  extras     :", JSON.stringify(ex));
log("  tb_admin   :", tbExisting ? "EXISTS (will UPSERT)" : "none (will INSERT)");

const nick = ex?.nickname || ex?.display_name || "มายด์";
const tel = ex?.work_phone || "0994359535";
const firstName = prof?.first_name || "ศรสวรรค์";
const lastName = prof?.last_name || "เครื่องสินธุ์";

const tbRow = {
  adminID: ADMIN_ID, adminStatusA: "1", adminPass: LEGACY_PASS,
  adminName: firstName, adminLastName: lastName, adminEmail: NEW_EMAIL, adminEmailOrg: 0,
  adminStatus: "", adminStatusSale: "", adminStatusCS: "1",       // ← CS pool, NOT sales
  adminPicture: "user.jpg", adminRegistered: new Date().toISOString(),
  adminTel: tel, adminType: "1", department: "0", section: "0", companyType: "1",
  adminDel: "", adminNickname: nick, adminTMP: "0", adminTelOrg: 0, salaryType: "2",
  adminIDCreate: "admin_dev", nationalIDCard: "", salary: 0, statusResetPass: "0",
  nationalIDCardFile: "", copyHouseRegistrationFile: "", resumeFile: "",
  religion: "", nationality: "", maritalStatus: "", adminLineTokenNotify: "", bearer_token: "",
};

log("\nPLANNED CHANGES:");
log(`  1. auth.email        ${au?.user?.email} → ${NEW_EMAIL}`);
log(`  2. profiles.email    ${prof?.email} → ${NEW_EMAIL}`);
log(`  3. admins.is_active  ${roles?.[0]?.is_active} → true  (role stays "${roles?.[0]?.role}")`);
log(`  4. extras.legacy_admin_id  ${ex?.legacy_admin_id ?? "null"} → "${ADMIN_ID}"`);
log(`  5. tb_admin ${tbExisting ? "UPSERT" : "INSERT"}  adminID=${ADMIN_ID} name="${firstName} ${lastName}" nick=${nick} tel=${tel} adminStatusA=1 adminStatusCS=1 adminStatusSale='' adminPass=passTam('123456')`);

if (!APPLY) { log("\n(dry-run — no writes. Re-run with --apply.)\n"); process.exit(0); }

// ── APPLY ──
log("\nApplying…");
const r1 = await sb.auth.admin.updateUserById(UID, { email: NEW_EMAIL, email_confirm: true });
log("  1. auth.email     ", r1.error ? "✗ " + r1.error.message : "✓");
const r2 = await sb.from("profiles").update({ email: NEW_EMAIL }).eq("id", UID);
log("  2. profiles.email ", r2.error ? "✗ " + r2.error.message : "✓");
const r3 = await sb.from("admins").update({ is_active: true }).eq("profile_id", UID);
log("  3. admins.active  ", r3.error ? "✗ " + r3.error.message : "✓");
const r4 = await sb.from("admin_contact_extras").update({ legacy_admin_id: ADMIN_ID }).eq("profile_id", UID);
log("  4. extras bridge  ", r4.error ? "✗ " + r4.error.message : "✓");
const r5 = await sb.from("tb_admin").upsert(tbRow, { onConflict: "adminID" });
log("  5. tb_admin       ", r5.error ? "✗ " + r5.error.message : "✓");

// ── RE-VERIFY ──
const { data: salesPool } = await sb.from("tb_admin").select("adminID,adminNickname").eq("adminStatusA", "1").eq("adminStatusSale", "1");
const { data: csPool } = await sb.from("tb_admin").select("adminID,adminNickname").eq("adminStatusA", "1").eq("adminStatusCS", "1");
const { data: auAfter } = await sb.auth.admin.getUserById(UID);
log("\nVERIFY:");
log("  auth.email :", auAfter?.user?.email);
log(`  SALES pool (${salesPool?.length}):`, JSON.stringify(salesPool?.map(r => r.adminNickname)));
log(`  CS pool    (${csPool?.length}):`, JSON.stringify(csPool?.map(r => r.adminNickname)));
log("\nDone.\n");
