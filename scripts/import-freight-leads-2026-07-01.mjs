/**
 * Import FREIGHT customers → imported_leads (the sales call-tracking CRM)
 * — owner 2026-07-01: "เอาลูกค้าฝั่งเฟรท ไปใส่ไว้ใน sales โทรตามลูกค้า · เพิ่ม source tab
 *   freight · 86 ไม่มีเบอร์ → tab แยก 'งานฝั่ง freight รอตามลูกค้า (ไม่มีเบอร์)'".
 *
 * TWO sources written into public.imported_leads:
 *   source='freight'           — the ~369 freight customers ALREADY in tb_users
 *                                (the 2026-06-30 freight merge LINK 118 + CREATE 251).
 *                                Identified by the stable userNote marker `FREIGHT[`
 *                                that the merge stamped on every freight customer.
 *                                Carries real PR + phone + email + sales rep →
 *                                assigned_admin_id = the customer's adminIDSale so the
 *                                lead lands in THAT rep's "ลูกค้าของฉัน".
 *   source='freight_no_phone'  — the 86 freight prospects with NO callable phone
 *                                (couldn't be created in tb_users). Read from the
 *                                canonical CSV report (richest contact data: LINE/FB,
 *                                email, tax-id). phone='' → they live ONLY in the
 *                                dedicated "ไม่มีเบอร์" chase tab.
 *
 * IDEMPOTENT — embeds a stable marker in imported_leads.note and SKIPS a row whose
 * marker already exists, so re-running never double-inserts:
 *   with-phone  marker = [FREIGHT:<PR>]            (PR is unique per freight customer)
 *   no-phone    marker = [FREIGHT-NP:<key>]        (key = sha1(name|line|email|tax))
 *
 * MONEY: zero. imported_leads is an isolated CRM table (no FK, no tb_* money path).
 * This does NOT touch tb_users / wallets / orders — it only mirrors prospects into
 * the call-queue. The freight customers themselves were already created/linked by
 * scripts/import-freight-customers-2026-06-30.mjs (this is the call-tracking layer).
 *
 *   DRY-RUN: node --env-file=.env.local scripts/import-freight-leads-2026-07-01.mjs
 *   APPLY:   node --env-file=.env.local scripts/import-freight-leads-2026-07-01.mjs --apply
 */
import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const CSV_PATH = "/Users/dev/Desktop/freight-customer-report-2026-07-01.csv";
const FREIGHT_SOURCE = "freight";
const NO_PHONE_SOURCE = "freight_no_phone";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("FATAL: SUPABASE env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// ── helpers ──────────────────────────────────────────────────────────────────
const normPhone = (p) => { let d = (p || "").replace(/\D/g, ""); if (d.startsWith("66") && d.length > 9) d = "0" + d.slice(2); return d.length >= 9 && d.length <= 10 ? d : ""; };
const clean = (s) => (s ?? "").toString().trim();
const sha1short = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

/** Minimal RFC-4180-ish CSV parser (quoted fields, escaped quotes, embedded newlines, CRLF). */
function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}

/** Pull a labelled field out of the FREIGHT[...] userNote the merge stamped.
 *  Notes look like: "...|| FREIGHT[PACRED/PR10368]: LINE/FB:กิตติยา · Email:x@y · เบอร์/ติดต่อ:...". */
function noteField(note, label) {
  const m = (note || "").match(new RegExp(`${label}:([^·]*)`));
  return m ? clean(m[1]) : "";
}

/**
 * Map a legacy adminID (tb_users.adminIDSale e.g. "admin_may", or the CSV sale label
 * resolved to one) → the rep's profiles.id (UUID). imported_leads.assigned_admin_id
 * is keyed on the PROFILE_ID (that's what the "ลูกค้าของฉัน" scope + repName resolve
 * on) — NOT the legacy adminID. An unresolved id (incl. the "admin_center" central
 * placeholder, which is NOT a real profile) → '' (unassigned) so ultra distributes it,
 * rather than stranding the lead under a profile_id nobody owns.
 */
async function loadRepProfileMap() {
  const wanted = ["admin_may", "admin_pee", "admin_pupu", "admin_toey", "admin_ploy", "admin_center"];
  const { data, error } = await sb.from("profiles").select("id, admin_login_id").in("admin_login_id", wanted);
  if (error) { console.error("profiles map:", error.message); process.exit(1); }
  const m = new Map();
  for (const p of (data ?? [])) if (p.admin_login_id) m.set(p.admin_login_id, p.id);
  return m; // admin_center will simply be absent unless it's a real profile
}

async function loadWithPhoneFreight() {
  // Every freight customer (LINK + CREATE) carries the `FREIGHT[` marker in userNote.
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("tb_users")
      .select("userID,userName,userTel,userEmail,userLineIDOA,adminIDSale,userNote")
      .ilike("userNote", "%FREIGHT[%")
      .neq("userStatus", "0")
      .range(from, from + 999);
    if (error) { console.error("tb_users load:", error.message); process.exit(1); }
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

function csvNoPhoneRows() {
  if (!fs.existsSync(CSV_PATH)) { console.error(`FATAL: CSV not found: ${CSV_PATH}`); process.exit(1); }
  const txt = fs.readFileSync(CSV_PATH, "utf8").replace(/^﻿/, "");
  const rows = parseCsv(txt);
  // cols: 0 หมวด, 1 PR, 2 ชื่อ, 3 เบอร์, 4 เซล, 5 เลขนิติ/บัตร, 6 LINE/FB, 7 Email, 8 ที่อยู่, 9 หมายเหตุชีต, 10 ชีต
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (normPhone(r[3])) continue; // has a phone → it's in the with-phone set, skip here
    out.push({
      member: clean(r[1]), name: clean(r[2]), sale: clean(r[4]), taxid: clean(r[5]),
      line: clean(r[6]), email: clean(r[7]), addr: clean(r[8]), sheetNote: clean(r[9]), sheet: clean(r[10]),
    });
  }
  return out;
}

// map the CSV sale label → the same rep adminID convention the customer import used.
const salesRepFromLabel = (s) => {
  const k = clean(s).toLowerCase();
  if (k === "mayjang" || k === "may") return "admin_may";
  if (k === "pupu") return "admin_pupu";
  if (k === "pee") return "admin_pee";
  if (k === "ploy") return "admin_ploy";
  if (!k) return ""; // unassigned → ultra distributes later
  return "admin_center"; // other / off-boarded sales → central pool
};

async function main() {
  console.log(`\n=== FREIGHT → imported_leads (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);

  // 1) existing imported_leads markers (idempotency) — page through all rows.
  const existingMarkers = new Set();
  let existingTotal = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("imported_leads").select("note, source").range(from, from + 999);
    if (error) { console.error("imported_leads load:", error.message); process.exit(1); }
    for (const r of (data ?? [])) {
      existingTotal++;
      const mWP = (r.note || "").match(/\[FREIGHT:([^\]]+)\]/);
      if (mWP) existingMarkers.add(`WP:${mWP[1]}`);
      const mNP = (r.note || "").match(/\[FREIGHT-NP:([^\]]+)\]/);
      if (mNP) existingMarkers.add(`NP:${mNP[1]}`);
    }
    if (!data || data.length < 1000) break;
  }
  console.log(`  imported_leads existing rows: ${existingTotal} · freight markers already present: ${existingMarkers.size}`);

  // rep legacy adminID → profile_id (the key imported_leads.assigned_admin_id uses).
  const repMap = await loadRepProfileMap();
  const toProfileId = (legacyAdminId) => repMap.get(clean(legacyAdminId)) ?? ""; // unresolved → unassigned
  let unmappedCount = 0;
  const noteUnmapped = (legacyId) => { if (clean(legacyId) && !repMap.has(clean(legacyId))) unmappedCount++; };

  // 2) WITH-PHONE freight (from tb_users · the canonical, already-applied set).
  const tbFreight = await loadWithPhoneFreight();
  const wpPlan = [];      // rows to insert
  const wpSkipExisting = [];
  const wpSkipNoPhone = [];
  const seenPr = new Set();
  for (const u of tbFreight) {
    const pr = clean(u.userID);
    if (!pr || seenPr.has(pr)) continue;
    seenPr.add(pr);
    const phone = normPhone(u.userTel);
    if (!phone) { wpSkipNoPhone.push(pr); continue; } // shouldn't happen (all had phones) — guard anyway
    const marker = `WP:${pr}`;
    if (existingMarkers.has(marker)) { wpSkipExisting.push(pr); continue; }
    const note = u.userNote || "";
    const line = noteField(note, "LINE/FB") || clean(u.userLineIDOA);
    const email = clean(u.userEmail) || noteField(note, "Email");
    const sheet = (note.match(/FREIGHT\[([^/]+)\//) || [])[1] || "";
    noteUnmapped(u.adminIDSale);
    wpPlan.push({
      name: clean(u.userName),
      address: "",
      phone,
      line_facebook: line,
      email,
      service: "", // CARGO/FCL etc. — left for the rep to set (matches the import-form default)
      source: FREIGHT_SOURCE,
      // → the rep's profile_id so the lead lands in THAT rep's "ลูกค้าของฉัน".
      // admin_center (central pool · 224 customers) is not a real profile → '' = ultra distributes.
      assigned_admin_id: toProfileId(u.adminIDSale),
      // note carries: PR (the closed-deal member code), the source sheet, + the idempotency marker.
      note: `ลูกค้าฝั่ง freight · รหัส ${pr}${sheet ? ` · ชีต ${sheet}` : ""} [FREIGHT:${pr}]`,
      pr_code: pr,
    });
  }

  // 3) NO-PHONE freight (from the canonical CSV · the chase tab).
  const npRows = csvNoPhoneRows();
  const npPlan = [];
  const npSkipExisting = [];
  const npSkipEmpty = [];
  const seenNpKey = new Set();
  for (const r of npRows) {
    // A row with NO name AND no contact-of-any-kind is pure noise (e.g. blank
    // placeholder / "-" rows) — nothing to chase → skip it (not actionable).
    const nameOk = r.name && r.name !== "-";
    const hasContact = r.line || r.email || r.taxid;
    if (!nameOk && !hasContact) { npSkipEmpty.push(r.name || "(ว่าง)"); continue; }
    // stable key from the identifying contact fields (no phone to key on).
    const keySrc = `${r.name}|${r.line}|${r.email}|${r.taxid}|${r.member}`;
    const key = sha1short(keySrc);
    if (seenNpKey.has(key)) continue; // de-dupe within the CSV
    seenNpKey.add(key);
    const marker = `NP:${key}`;
    if (existingMarkers.has(marker)) { npSkipExisting.push(r.name || key); continue; }
    const noteBits = [
      "ลูกค้าฝั่ง freight (ไม่มีเบอร์ · รอตามเบอร์)",
      r.member && r.member !== "PR000" ? `รหัสชีต ${r.member}` : "",
      r.taxid ? `เลขนิติ/บัตร:${r.taxid}` : "",
      r.sheetNote ? `หมายเหตุชีต:${r.sheetNote}` : "",
      r.sheet ? `ชีต:${r.sheet}` : "",
      r.addr ? `ที่อยู่:${r.addr}` : "",
    ].filter(Boolean);
    const repLegacy = salesRepFromLabel(r.sale);
    noteUnmapped(repLegacy);
    npPlan.push({
      name: r.name,
      address: r.addr,
      phone: "", // the whole point — no callable number → the "ไม่มีเบอร์" tab
      line_facebook: r.line,
      email: r.email,
      service: "",
      source: NO_PHONE_SOURCE,
      // resolve to profile_id (admin_center / unresolved → '' = ultra distributes).
      assigned_admin_id: toProfileId(repLegacy),
      note: `${noteBits.join(" · ")} [FREIGHT-NP:${key}]`,
      pr_code: "",
    });
  }

  // ── report ──
  // profile_id → "admin_xxx (name)" for a readable rep breakdown.
  const idToLabel = new Map();
  for (const [legacy, pid] of repMap) idToLabel.set(pid, legacy);
  const repLabel = (pid) => (pid ? `${idToLabel.get(pid) ?? pid}` : "(ยังไม่มอบหมาย · ultra แจกต่อ)");

  console.log(`\n  WITH-PHONE (source='${FREIGHT_SOURCE}'):`);
  console.log(`    tb_users freight customers found: ${tbFreight.length} (distinct PR: ${seenPr.size}) · ⚠️ userStatus='0' soft-deleted excluded`);
  console.log(`    → INSERT ${wpPlan.length} · skip-already-imported ${wpSkipExisting.length} · skip-no-phone ${wpSkipNoPhone.length}`);
  const wpByRep = {};
  for (const p of wpPlan) { const k = repLabel(p.assigned_admin_id); wpByRep[k] = (wpByRep[k] || 0) + 1; }
  console.log(`    by sales rep:`, JSON.stringify(wpByRep));
  console.log(`    samples:`);
  wpPlan.slice(0, 3).forEach((p) => console.log(`      • ${p.phone} ${(p.name || "—").slice(0, 24)} → ${p.assigned_admin_id || "(none)"} · ${p.note}`));

  console.log(`\n  NO-PHONE (source='${NO_PHONE_SOURCE}'):`);
  console.log(`    CSV no-phone rows: ${npRows.length} (distinct: ${seenNpKey.size})`);
  console.log(`    → INSERT ${npPlan.length} · skip-already-imported ${npSkipExisting.length} · skip-empty/placeholder ${npSkipEmpty.length}`);
  const withContact = npPlan.filter((p) => p.line_facebook || p.email).length;
  console.log(`    of those, with a LINE/email contact: ${withContact}`);
  console.log(`    samples:`);
  npPlan.slice(0, 3).forEach((p) => console.log(`      • ${(p.name || "—").slice(0, 24)} · LINE:${p.line_facebook || "—"} · ${p.note.slice(0, 80)}`));

  const total = wpPlan.length + npPlan.length;
  console.log(`\n  resolved reps: ${[...repMap.keys()].filter((k) => repMap.get(k)).join(", ")}`);
  console.log(`  unmapped sales labels (incl. admin_center central pool) → left UNASSIGNED (ultra distributes): ${unmappedCount} leads`);
  console.log(`\n  TOTAL TO INSERT: ${total} (freight ${wpPlan.length} + freight_no_phone ${npPlan.length})`);

  if (!APPLY) {
    console.log(`\n  DRY-RUN — nothing written. Re-run with --apply to insert.`);
    return;
  }

  // ── apply (chunked inserts) ──
  const rows = [...wpPlan, ...npPlan];
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { data, error } = await sb.from("imported_leads").insert(chunk).select("id");
    if (error) { console.error(`  INSERT failed at chunk ${i}:`, error.message); process.exit(1); }
    inserted += data?.length ?? 0;
  }
  console.log(`\n  ✅ APPLIED — inserted ${inserted} rows into imported_leads.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
