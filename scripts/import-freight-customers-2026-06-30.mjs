/**
 * Import FREIGHT customers (AXELRA/NNB/PACRED booking sheets) → auth + profiles + tb_users.
 * Owner 2026-06-30: resolve by PHONE not the sheet PR · phone-in-DB → LINK (keep PR/pw) ·
 * phone-not-in-DB → CREATE-NEW (PR=lowest-vacant via generate_member_code trigger · login=phone ·
 * password=123456 · userActive='1') · no phone → SKIP (chase list). Sales: Mayjang/MAY→admin_may ·
 * Pupu→admin_pupu · Pee→admin_pee · else→admin_center. CS→admin_ploy (central fallback).
 * Replicates insertLegacyTbUserRow's payload inline (can't import — it pulls server-only).
 * Idempotent: a phone already in tb_users → LINK (never double-creates).
 *
 *   DRY-RUN: node --env-file=.env.local scripts/import-freight-customers-2026-06-30.mjs
 *   APPLY:   node --env-file=.env.local scripts/import-freight-customers-2026-06-30.mjs --apply
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const SC = "/private/tmp/claude-501/-Users-dev-pacred-web--claude-worktrees-gifted-snyder-0a9cca/5af1ab1d-4a08-4ef2-a641-b90fc347ad66/scratchpad";
const rows = JSON.parse(fs.readFileSync(`${SC}/freight-customers.json`, "utf8"));
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("FATAL: SUPABASE env missing"); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const normPhone = (p) => { let d = (p || "").replace(/\D/g, ""); if (d.startsWith("66") && d.length > 9) d = "0" + d.slice(2); return d.length >= 9 && d.length <= 10 ? d : ""; };
const salesRep = (s) => { const k = (s || "").trim().toLowerCase(); if (k === "mayjang" || k === "may") return "admin_may"; if (k === "pupu") return "admin_pupu"; if (k === "pee") return "admin_pee"; return "admin_center"; };
const isJuristic = (n) => /บริษัท|จำกัด|ห้างหุ้นส่วน|หจก|มหาชน|co\.,?\s*ltd|company/i.test(n || "");

async function main() {
  // Page through ALL tb_users (supabase-js caps .select() at 1000 rows — without
  // pagination the phone map is incomplete → existing customers get DUPLICATED).
  const allUsers = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("tb_users").select('userID,userName,userTel').neq("userStatus", "0").range(from, from + 999);
    if (error) { console.error("tb_users load:", error.message); process.exit(1); }
    allUsers.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  console.log(`  loaded tb_users: ${allUsers.length}`);
  const byPhone = new Map();
  for (const r of allUsers) { const n = normPhone(r.userTel ?? ""); if (n && !byPhone.has(n)) byPhone.set(n, { userID: r.userID, userName: r.userName }); }
  console.log(`  phone map: ${byPhone.size}`);

  const seen = new Set(), distinct = [];
  for (const x of rows) { const ph = normPhone(x.phone); if (!ph) { distinct.push({ ...x, phone: "" }); continue; } if (seen.has(ph)) continue; seen.add(ph); distinct.push({ ...x, phone: ph }); }

  const linked = [], created = [], noPhone = [], failed = [];
  const nowIso = new Date().toISOString();

  for (const x of distinct) {
    if (!x.phone) { noPhone.push({ name: x.name, member: x.member, taxid: x.taxid, email: x.email, line: x.line ?? "", addr: x.addr, src: x.src }); continue; }
    const hit = byPhone.get(x.phone);
    if (hit) { linked.push({ phone: x.phone, pr: hit.userID, tbName: hit.userName ?? "", sheetName: x.name, sheetMember: x.member, src: x.src }); continue; }
    if (!APPLY) { created.push({ phone: x.phone, pr: "(จะสร้าง)", sheetName: x.name, src: x.src, sale: salesRep(x.sale) }); continue; }
    try {
      const { data: cu, error: cErr } = await sb.auth.admin.createUser({ phone: `+66${x.phone.replace(/^0/, "")}`, password: "123456", phone_confirm: true, user_metadata: { first_name: x.name, freight_import: true } });
      if (cErr || !cu?.user) { failed.push({ phone: x.phone, name: x.name, reason: `auth:${cErr?.message ?? "no user"}` }); continue; }
      const acct = isJuristic(x.name) ? "juristic" : "personal";
      const { data: prof, error: pErr } = await sb.from("profiles").insert({ id: cu.user.id, account_type: acct, first_name: x.name, last_name: "", phone: x.phone, email: x.email || null, status: "active" }).select("member_code").single();
      if (pErr || !prof?.member_code) { await sb.auth.admin.deleteUser(cu.user.id); failed.push({ phone: x.phone, name: x.name, reason: `profile:${pErr?.message}` }); continue; }
      const pr = prof.member_code;
      const payload = {
        userID: pr, userTel: x.phone, userStatus: "1", userActive: "1", userPass: "",
        userName: x.name, userLastName: "", userEmail: x.email || null, userRegistered: nowIso,
        userPicture: "user.jpg", coID: "PR", userLineNotify: "", userCompany: acct === "juristic" ? "1" : "0",
        userComparison: "0", userComparisonValue: 0, userCredit: "0", userCreditValue: 0, userCreditDate: 0,
        shopUser: "1", channel: "", userRecom: "", userAddressID: "", userTransportType: "", userShipBy: "",
        userPayMethod: "", userLineIDOA: "", companyCustomer: "0",
        // tb_users has no tax column — keep the tax-id in the note (sales/CS move juristic to tb_corporate later).
        userNote: `freight import 2026-06 (sheet ${x.src}/${x.member})${x.taxid ? ` · TAX:${x.taxid}` : ""}`,
        adminIDSale: salesRep(x.sale), adminIDCS: "admin_ploy",
      };
      const { error: tErr } = await sb.from("tb_users").insert(payload);
      if (tErr) { await sb.from("profiles").delete().eq("id", cu.user.id); await sb.auth.admin.deleteUser(cu.user.id); failed.push({ phone: x.phone, name: x.name, reason: `tb_users:${tErr.message.slice(0,40)}` }); continue; }
      await sb.from("tb_wallet").insert({ userid: pr }).then(() => {}, () => {});
      await sb.from("tb_cash_back").insert({ userid: pr }).then(() => {}, () => {});
      created.push({ phone: x.phone, pr, sheetName: x.name, src: x.src, sale: salesRep(x.sale) });
      byPhone.set(x.phone, { userID: pr, userName: x.name });
    } catch (e) { failed.push({ phone: x.phone, name: x.name, reason: String(e).slice(0, 50) }); }
  }

  console.log(`\n=== FREIGHT CUSTOMER IMPORT (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`  distinct: ${distinct.length} · LINK ${linked.length} · CREATE ${created.length} · NO-PHONE ${noPhone.length} · FAILED ${failed.length}`);
  if (failed.length) { console.log("  failures (first 8):"); failed.slice(0, 8).forEach((f) => console.log(`   ✗ ${f.phone} ${(f.name||"").slice(0, 16)} — ${f.reason}`)); }
  fs.writeFileSync(`${SC}/freight-customer-result.json`, JSON.stringify({ linked, created, noPhone, failed }, null, 2));
  console.log(`  → saved freight-customer-result.json`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
