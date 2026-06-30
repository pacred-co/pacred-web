/**
 * Import FREIGHT shipments (PACRED booking · June 2026 + May-if-complete) → freight_shipments.
 * Owner 2026-07-01: เดือน 6 + เดือน 5 ครบ · เนี๊ยบ · ห้ามเก็บเงินซ้ำ (this writes shipment RECORDS +
 * their SELL/status · billing/charging stays on the audited paths · no new charge created).
 * Resolve customer → profile_id (member_code if a real PR · else consignee name · else SKIP — profile_id
 * is NOT NULL). Idempotent by job_no. transport_mode ∈ sea_fcl|sea_lcl|truck|air.
 *   DRY-RUN: node --env-file=.env.local scripts/import-freight-shipments-2026-07-01.mjs
 *   APPLY:   node ... --apply
 */
import pg from "pg"; import fs from "fs";
const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const P = process.env.SUPABASE_DB_PASSWORD, REF = "yzljakczhwrpbxflnmco";
const SC = "/private/tmp/claude-501/-Users-dev-pacred-web--claude-worktrees-gifted-snyder-0a9cca/5af1ab1d-4a08-4ef2-a641-b90fc347ad66/scratchpad";
const ships = JSON.parse(fs.readFileSync(`${SC}/freight-shipments-jun.json`, "utf8"));
const cl = (s) => (s && s !== "-" && s !== "NONE") ? String(s).trim() : "";
const num = (s) => { const n = Number(String(s ?? "").replace(/[, ]/g, "")); return Number.isFinite(n) ? n : 0; };

// TYPE → transport_mode (4-value spine enum).
function transportMode(t, size) {
  const u = (t || "").toUpperCase();
  if (u.startsWith("SEA")) return /FCL|20'|40'|เต็มตู้/i.test(`${t} ${size}`) ? "sea_fcl" : "sea_lcl";
  if (u.startsWith("AIR")) return "air";
  return "truck"; // TRUCK · EK · ฝากสั่ง · ไปรษณีย์ · ใบขนขาออก · ขอคืนภาษี → truck spine
}
// STATUS (sheet) → main status + journey_status (pragmatic · common values · raw kept in notes).
// status ∈ draft|confirmed|in_progress|cleared|delivered|cancelled (DB check).
function statusMap(s) {
  const x = (s || "").trim();
  if (/ยกเลิก/.test(x)) return { status: "cancelled", journey: "CANCELLED" };
  if (/สำเร็จ|ปิดงาน|ส่งแล้ว|จัดส่งสำเร็จ/.test(x)) return { status: "delivered", journey: "DELIVERED" };
  if (/รอยิงใบขน|รอตรวจปล่อย|D\/O|ใบขน/.test(x)) return { status: "in_progress", journey: "TH_CUSTOMS" };
  if (/รอสินค้า|ผลิต|รอบุ๊ค|จอง/.test(x)) return { status: "draft", journey: "BOOKED" };
  if (x) return { status: "in_progress", journey: "IN_TRANSIT" };
  return { status: "draft", journey: "BOOKED" };
}
// service_key — valid catalog keys (mig 0232): freight_import | freight_export | import_cargo.
function serviceKey(t, dir) {
  if (/ฝากสั่ง/.test(t)) return "import_cargo";
  return dir === "export" ? "freight_export" : "freight_import";
}
const toDate = (s) => { const d = cl(s); return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null; };

async function main() {
  let c;
  for (const h of ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"]) {
    try { c = new Client({ connectionString: `postgresql://postgres.${REF}:${encodeURIComponent(P)}@${h}:5432/postgres`, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 }); await c.connect(); break; } catch { c = null; }
  }
  if (!c) { console.error("no DB"); process.exit(1); }

  const normName = (s) => (s || "").replace(/บริษัท|จำกัด|ห้างหุ้นส่วน|หจก|มหาชน|\(.*?\)|\s|\.|,/gi, "").toLowerCase();
  // profiles: member_code → id (for profile_id) + a NORMALIZED name index for fallback.
  const byMember = new Map(), byName = new Map();
  const pr = await c.query(`select id, member_code, coalesce(first_name,'')||coalesce(last_name,'') nm from profiles where member_code is not null`);
  for (const r of pr.rows) { byMember.set(r.member_code, r.id); const k = normName(r.nm); if (k.length >= 4 && !byName.has(k)) byName.set(k, r.id); }

  // existing job_no (idempotency).
  const ex = await c.query(`select job_no from freight_shipments where job_no is not null`);
  const haveJob = new Set(ex.rows.map((r) => r.job_no));

  const plan = [], skip = [];
  for (const s of ships) {
    if (s.jobno && haveJob.has(s.jobno)) { skip.push({ job: s.jobno, why: "มีอยู่แล้ว (idempotent)" }); continue; }
    // resolve customer → profile_id
    let pid = byMember.get(cl(s.member));
    let how = "member→PR";
    if (!pid) { const nm = normName(s.consignee); if (nm.length >= 4) for (const [k, v] of byName) { if (k.includes(nm) || nm.includes(k)) { pid = v; how = "name→PR"; break; } } }
    if (!pid) { skip.push({ job: s.jobno, consignee: s.consignee, member: s.member, why: "หาลูกค้าไม่เจอ (no profile_id)" }); continue; }
    const dir = /EX/i.test(s.exim) ? "export" : "import";
    const sm = statusMap(s.status);
    plan.push({
      job_no: s.jobno || null, profile_id: pid, how, transport_mode: transportMode(s.type, s.size),
      direction: dir, status: sm.status, journey_status: sm.journey, service_key: serviceKey(s.type, dir),
      port_discharge: cl(s.pod) || null, payment_term: cl(s.term) || null,
      commercial_value_thb: num(s.sellCargo) + num(s.sellCustoms) + num(s.sellDoc),
      created_at: toDate(s.date), confirmed_at: toDate(s.atd), delivered_at: toDate(s.delivered),
      cancelled_at: sm.status === "cancelled" ? (toDate(s.date) || new Date().toISOString().slice(0, 10)) : null,
      cancelled_reason: sm.status === "cancelled" ? `ยกเลิก (import จากชีต · STATUS:${cl(s.status)})` : null,
      notes: `freight import ${s.month} · สินค้า:${cl(s.product)} · ${cl(s.consignee)} · ${cl(s.size)} CTNS:${cl(s.ctns)} CBM:${cl(s.cbm)} KGM:${cl(s.kgm)} · QO:${cl(s.quotation)} INV:${cl(s.invoice)} · STATUS:${cl(s.status)} · เซล:${cl(s.sales)}`.slice(0, 1900),
    });
  }

  console.log(`\n=== FREIGHT SHIPMENT IMPORT (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`  source June+May: ${ships.length} · PLAN ${plan.length} · SKIP ${skip.length}`);
  const dist = (f) => { const m = {}; for (const p of plan) m[p[f]] = (m[p[f]] || 0) + 1; return JSON.stringify(m); };
  console.log(`  transport_mode: ${dist("transport_mode")}`);
  console.log(`  status: ${dist("status")}`);
  console.log(`  resolve: member→PR ${plan.filter(p=>p.how==="member→PR").length} · name→PR ${plan.filter(p=>p.how==="name→PR").length}`);
  console.log(`  Σ selling THB: ${plan.reduce((s,p)=>s+p.commercial_value_thb,0).toLocaleString()}`);
  if (skip.length) { console.log("  SKIP reasons:"); const sr={}; for(const s of skip)sr[s.why]=(sr[s.why]||0)+1; console.log("   ", JSON.stringify(sr));
    skip.filter(s=>s.why.includes("ไม่เจอ")).slice(0,6).forEach(s=>console.log(`    · ${s.job} member=${s.member} "${(s.consignee||'').slice(0,20)}"`)); }
  fs.writeFileSync(`${SC}/freight-shipment-plan.json`, JSON.stringify({ plan, skip }, null, 2));

  if (!APPLY) { console.log("\n(DRY-RUN · plan saved)"); await c.end(); return; }
  let ins = 0;
  for (const p of plan) {
    const { how, ...row } = p;
    const { error } = await c.query(
      `insert into freight_shipments (job_no,profile_id,status,transport_mode,direction,journey_status,service_key,port_discharge,payment_term,commercial_value_thb,created_at,confirmed_at,delivered_at,cancelled_at,cancelled_reason,notes,origin_country)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11::date,now()),$12,$13,$14,$15,$16,'CHINA')`,
      [row.job_no, row.profile_id, row.status, row.transport_mode, row.direction, row.journey_status, row.service_key, row.port_discharge, row.payment_term, row.commercial_value_thb, row.created_at, row.confirmed_at, row.delivered_at, row.cancelled_at, row.cancelled_reason, row.notes]
    );
    if (error) { console.log(`  ✗ ${row.job_no}: ${error.message.slice(0, 50)}`); continue; }
    ins++;
  }
  console.log(`\nAPPLIED: inserted ${ins}`);
  await c.end();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
