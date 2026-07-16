// WIDENED cross-ref for customs_importer_lead (owner 2026-07-16: "บางชื่อที่บอก
// ไม่มีในระบบ เราเห็นมีเต็มเลย เช่น อภิรัตน์ · ลูกค้าในใบขนอยู่ในไฟล์ booking เฟรท 99%").
//
// The first pass matched ONLY นิติ tax id → tb_corporate → tb_users, missing:
//   • a juristic customer with NO tb_corporate row (อภิรัตน์ อินดัสตรีส์ = PR225 ·
//     lives in tb_users with userCompany='1' · 17 ใบขน · was flagged "ใหม่")
//   • the whole freight-booking import (imported_leads · 891 · freight/Axelra/Pcs/Pacred)
//
// Match priority (first hit wins · records match_source):
//   1. tax        — tax id → tb_corporate.corporatenumber → tb_users (phone/sale)
//   2. name_corp  — normalised name → tb_corporate.corporatename → tb_users
//   3. name_user  — normalised name → tb_users."userName"
//   4. lead_freight — normalised name → imported_leads.name (the booking file · phone)
//
// Name normalisation strips the legal wrapper so "บริษัท อภิรัตน์อินดัสตรีส์ จำกัด"
// (ใบขน) === "อภิรัตน์ อินดัสตรีส์ จำกัด" (tb_users) → both → "อภิรัตน์อินดัสตรีส์".
//
//   dry:   node scripts/recross-customs-leads-2026-07-16.mjs
//   apply: node scripts/recross-customs-leads-2026-07-16.mjs --apply
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

/** Strip the legal wrapper + all separators → the comparable core name. */
function norm(s) {
  if (!s) return "";
  let t = String(s).toLowerCase();
  // Thai typo/unicode normalisation — "เเ" (two เ) is a very common mis-encoding of
  // "แ" (นิว เวิลด์ ... "ไทยเเลนด์" in tb_users vs "ไทยแลนด์" on the ใบขน).
  t = t.split("เเ").join("แ");
  // legal wrappers (TH + EN)
  for (const w of [
    "ห้างหุ้นส่วนจำกัด", "ห้างหุ้นส่วนสามัญนิติบุคคล", "ห้างหุ้นส่วนสามัญ", "บริษัทจำกัด", "บริษัท", "จำกัด",
    "หจก.", "หจก", "จก.", "(มหาชน)", "มหาชน", "(สำนักงานใหญ่)", "สำนักงานใหญ่", "(ประเทศไทย)", "ประเทศไทย",
    "co.,ltd.", "co., ltd.", "co.,ltd", "co., ltd", "co.ltd", "company limited", "limited", "ltd.", "ltd",
    "(thailand)", "thailand", "part.,ltd", "partnership", "public", "inc.", "inc",
  ]) t = t.split(w).join("");
  // separators / punctuation / spaces
  t = t.replace(/[\s.,\-_()/\\'"&·]+/g, "");
  return t.trim();
}

// ── load leads ──
const leads = (await c.query(`SELECT tax_id, name_th, name_en, decl_count FROM customs_importer_lead`)).rows;
console.log(`leads: ${leads.length}`);

// ── load the candidate customer pools ──
const corp = (await c.query(`SELECT regexp_replace(corporatenumber,'\\D','','g') AS tax, corporatename, userid FROM tb_corporate`)).rows;
const users = (await c.query(`SELECT "userID" AS userid, "userName" AS name, "userTel" AS tel, "adminIDSale" AS sale, "userCompany" AS company FROM tb_users WHERE "userName" IS NOT NULL AND "userName" <> ''`)).rows;
const ilead = (await c.query(`SELECT id, name, phone, source, assigned_admin_id FROM imported_leads WHERE name IS NOT NULL AND name <> ''`)).rows;
console.log(`pools: tb_corporate ${corp.length} · tb_users ${users.length} · imported_leads ${ilead.length}`);

const corpByTax = new Map(); for (const r of corp) if (r.tax && !corpByTax.has(r.tax)) corpByTax.set(r.tax, r);
const corpByName = new Map(); for (const r of corp) { const k = norm(r.corporatename); if (k && !corpByName.has(k)) corpByName.set(k, r); }
const userById = new Map(users.map((u) => [u.userid, u]));
const userByName = new Map(); for (const u of users) { const k = norm(u.name); if (k && !userByName.has(k)) userByName.set(k, u); }
const leadByName = new Map(); for (const l of ilead) { const k = norm(l.name); if (k && !leadByName.has(k)) leadByName.set(k, l); }

/** Dice bigram similarity 0..1 — catches a 1-2 char spelling drift the exact
 *  normaliser can't (ใบขน "โฮสดิ้งส์" vs tb_users "โฮลดิ้งส์" · "เทรดดดิ้ง" vs
 *  "เทรดดิ้ง"). Only used at a HIGH threshold, and the hit is tagged
 *  match_source='name_fuzzy' so the UI can ask sales to eyeball it. */
function bigrams(s) { const g = []; for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2)); return g; }
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const pool = new Map(); for (const g of B) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of A) { const n = pool.get(g) ?? 0; if (n > 0) { hit++; pool.set(g, n - 1); } }
  return (2 * hit) / (A.length + B.length);
}
const FUZZ_MIN = 0.85;   // conservative — a wrong phone in the call list is worse than a miss
/** Best fuzzy hit over a normalised-name → row map. */
function bestFuzzy(key, map) {
  if (!key || key.length < 6) return null; // too short → too easy to false-positive
  let best = null, bestScore = 0;
  for (const [k, row] of map) {
    if (Math.abs(k.length - key.length) > 6) continue; // cheap length prefilter
    const s = dice(key, k);
    if (s > bestScore) { bestScore = s; best = row; }
  }
  return bestScore >= FUZZ_MIN ? { row: best, score: bestScore } : null;
}

// ── match ──
const stats = { tax: 0, name_corp: 0, name_user: 0, lead_freight: 0, name_fuzzy: 0, none: 0 };
const updates = [];
for (const L of leads) {
  const tax = (L.tax_id || "").replace(/\D/g, "");
  const kTh = norm(L.name_th);
  const kEn = norm(L.name_en);
  let m = null;

  const corpTax = tax ? corpByTax.get(tax) : null;
  const corpName = corpByName.get(kTh) || (kEn ? corpByName.get(kEn) : null);
  const userName = userByName.get(kTh) || (kEn ? userByName.get(kEn) : null);
  const leadName = leadByName.get(kTh) || (kEn ? leadByName.get(kEn) : null);

  if (corpTax) {
    const u = userById.get(corpTax.userid);
    m = { src: "tax", userid: corpTax.userid, phone: u?.tel ?? null, name: u?.name ?? corpTax.corporatename, sale: u?.sale ?? null };
  } else if (corpName) {
    const u = userById.get(corpName.userid);
    m = { src: "name_corp", userid: corpName.userid, phone: u?.tel ?? null, name: u?.name ?? corpName.corporatename, sale: u?.sale ?? null };
  } else if (userName) {
    m = { src: "name_user", userid: userName.userid, phone: userName.tel ?? null, name: userName.name, sale: userName.sale ?? null };
  } else if (leadName) {
    m = { src: "lead_freight", userid: null, phone: leadName.phone ?? null, name: leadName.name, sale: leadName.assigned_admin_id ?? null, leadId: leadName.id, leadSource: leadName.source };
  } else {
    // 5. FUZZY — a 1-2 char spelling drift (โฮสดิ้งส์/โฮลดิ้งส์ · เทรดดดิ้ง/เทรดดิ้ง).
    //    tb_users first (a real account beats a booking-file row), then the booking file.
    const fu = bestFuzzy(kTh, userByName) || (kEn ? bestFuzzy(kEn, userByName) : null);
    const fl = fu ? null : (bestFuzzy(kTh, leadByName) || (kEn ? bestFuzzy(kEn, leadByName) : null));
    if (fu) {
      m = { src: "name_fuzzy", userid: fu.row.userid, phone: fu.row.tel ?? null, name: fu.row.name, sale: fu.row.sale ?? null, score: fu.score };
    } else if (fl) {
      m = { src: "name_fuzzy", userid: null, phone: fl.row.phone ?? null, name: fl.row.name, sale: fl.row.assigned_admin_id ?? null, leadId: fl.row.id, leadSource: fl.row.source, score: fl.score };
    }
  }

  if (m) stats[m.src]++; else stats.none++;
  updates.push({ tax_id: L.tax_id, name: L.name_th || L.name_en, decl: L.decl_count, m });
}

const matched = updates.filter((u) => u.m).length;
console.log(`\n════ WIDENED cross-ref ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`  🟢 matched (มีในระบบ): ${matched} / ${leads.length}   (เดิม tax-only = ${stats.tax})`);
console.log(`     · tax (นิติ→tb_corporate): ${stats.tax}`);
console.log(`     · name_corp (ชื่อ→tb_corporate): ${stats.name_corp}`);
console.log(`     · name_user (ชื่อ→tb_users): ${stats.name_user}   ← เคสอภิรัตน์`);
console.log(`     · lead_freight (ชื่อ→ไฟล์ booking): ${stats.lead_freight}`);
console.log(`     · name_fuzzy (ชื่อคล้าย ≥${FUZZ_MIN} · เซลเช็คก่อนโทร): ${stats.name_fuzzy}`);
console.log(`  🔵 ยังไม่เจอ: ${stats.none}`);
console.log(`\n── ตัวอย่างที่เพิ่งเจอเพิ่ม (ไม่ใช่ tax · เรียงตามใบขน) ──`);
updates.filter((u) => u.m && u.m.src !== "tax").sort((a, b) => b.decl - a.decl).slice(0, 20)
  .forEach((u) => console.log(`  ${String(u.decl).padStart(3)}ใบ · ${u.name} → ${u.m.userid || "(lead)"} ☎ ${u.m.phone || "-"} [${u.m.src}${u.m.leadSource ? ":" + u.m.leadSource : ""}]`));

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }

let n = 0;
for (const u of updates) {
  const m = u.m;
  await c.query(
    `UPDATE customs_importer_lead
        SET is_existing=$2, matched_userid=$3, matched_phone=$4, matched_name=$5, matched_sale=$6,
            match_source=$7, matched_lead_id=$8, matched_lead_source=$9, updated_at=now()
      WHERE tax_id=$1`,
    [u.tax_id, !!m, m?.userid ?? null, m?.phone ?? null, m?.name ?? null, m?.sale ?? null,
     m?.src ?? null, m?.leadId ?? null, m?.leadSource ?? null],
  );
  n++;
}
console.log(`\n✅ APPLIED · updated ${n} leads · 🟢 ${matched} มีในระบบ (เดิม ${stats.tax})`);
await c.end();
