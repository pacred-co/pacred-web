// Ingest NetBay ใบขน (customs declaration) xlsx exports → customs_declaration +
// customs_importer_lead (owner 2026-07-16). Cross-refs importers to existing
// Pacred customers by นิติ tax id (tb_corporate → tb_users) to pull the phone.
//
//   dry:   node scripts/ingest-customs-declarations-2026-07-16.mjs <transport> <dir-of-xlsx>
//   apply: node scripts/ingest-customs-declarations-2026-07-16.mjs <transport> <dir-of-xlsx> --apply
//   <transport> = road | sea | air
//
// Idempotent: customs_declaration upsert on ref_no; customs_importer_lead
// RE-AGGREGATES from ALL customs_declaration rows for the tax id after insert,
// so re-running (or adding sea/air later) merges cleanly. Sales workflow fields
// (lead_status/call_note/assigned_sale/called_at) are PRESERVED on re-run.
import pg from "pg";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const TRANSPORT = process.argv[2];
const DIR = process.argv[3];
const APPLY = process.argv.includes("--apply");
if (!["road", "sea", "air"].includes(TRANSPORT) || !DIR) {
  console.error("usage: node ingest-customs-declarations-2026-07-16.mjs <road|sea|air> <dir> [--apply]");
  process.exit(1);
}

// column-letter → field (NetBay ใบขน header · verified)
const COL = {
  CF: "importer_tax_id", CG: "importer_branch", CH: "importer_name_th", C: "importer_code", D: "importer_name_en",
  CI: "addr_street", CJ: "addr_district", CK: "addr_subprovince", CL: "addr_province", CM: "addr_postcode",
  CP: "clearance_card", CQ: "clearance_name",
  CW: "transport_mode", CY: "vessel_name", EW: "voyage",
  DF: "release_port", DG: "discharge_port", CZ: "arrival_date",
  BZ: "payment_date", CA: "reference_date", CB: "send_date", CC: "recv_date",
  CE: "decl_type", BW: "decl_status",
  EK: "agent_code", EL: "agent_tax", EN: "agent_name_th",
  EJ: "job_no", BP: "ctrl_decl_no",
  EB: "total_tax", DT: "cif_total_baht", DR: "exchange_rate", DQ: "currency",
  FX: "supplier_code", FY: "supplier_name", FZ: "supplier_street", GB: "supplier_city", GC: "supplier_area", GE: "supplier_country", GF: "supplier_email", FT: "incoterm",
};
const LINE = { B: "item_no", AZ: "tariff_hs", F: "desc_en", J: "desc_th", BU: "brand",
  AO: "duty_rate", AQ: "duty_amt", AS: "vat_amt", AN: "cif_thb_line", AD: "qty", AE: "qty_unit", AF: "netweight", BV: "origin_country", AY: "priv" };

const dec = (s) => (s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#10;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const parseRow = (rowXml) => { const cells = {}; const re = /<c r="([A-Z]+)\d+"[^>]*>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g; let m; while ((m = re.exec(rowXml))) cells[m[1]] = dec(m[2]); return cells; };
const numOr = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : null; };

// ── parse ──
const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".xlsx"));
const decls = [];
let errN = 0;
for (const f of files) {
  try {
    const xml = execFileSync("unzip", ["-p", join(DIR, f), "xl/worksheets/sheet1.xml"], { maxBuffer: 200 * 1024 * 1024 }).toString("utf8");
    const rows = xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
    if (rows.length < 2) { errN++; continue; }
    const dataRows = rows.slice(1).map(parseRow);
    const h = dataRows[0];
    const d = { ref_no: f.replace(/\.xlsx$/i, ""), transport: TRANSPORT, source_file: f };
    for (const [c, k] of Object.entries(COL)) d[k] = h[c] ?? "";
    d.exchange_rate = numOr(d.exchange_rate); d.cif_total_baht = numOr(d.cif_total_baht); d.total_tax = numOr(d.total_tax);
    d.lines = dataRows.map((r) => { const li = {}; for (const [c, k] of Object.entries(LINE)) li[k] = r[c] ?? ""; return li; }).filter((li) => li.tariff_hs || li.desc_en || li.desc_th);
    decls.push(d);
  } catch (e) { errN++; console.error("PARSE ERR", f, e.message.slice(0, 60)); }
}
console.log(`\nparsed ${decls.length}/${files.length} ใบขน (${TRANSPORT}) · err ${errN}`);

const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

// ── cross-ref importers to existing customers by tax id ──
const AXELRA_TAX = "0105564077716"; // our own affiliate — not a lead to call
const taxes = [...new Set(decls.map((d) => (d.importer_tax_id || "").replace(/\D/g, "")).filter(Boolean))];
const corp = (await c.query(`SELECT regexp_replace(corporatenumber,'\\D','','g') AS tax, userid, corporatename FROM tb_corporate WHERE regexp_replace(corporatenumber,'\\D','','g') = ANY($1)`, [taxes])).rows;
const corpByTax = new Map(); for (const r of corp) if (!corpByTax.has(r.tax)) corpByTax.set(r.tax, r);
const userids = [...new Set(corp.map((r) => r.userid))];
const users = userids.length ? (await c.query(`SELECT "userID","userName","userTel","adminIDSale" FROM tb_users WHERE "userID" = ANY($1)`, [userids])).rows : [];
const userById = new Map(users.map((u) => [u.userID, u]));

const existing = taxes.filter((t) => corpByTax.has(t)).length;
console.log(`importers: ${taxes.length} · 🟢 existing ${existing} · 🔵 new ${taxes.length - existing}`);

if (!APPLY) {
  console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อลง DB\n`);
  await c.end();
  process.exit(0);
}

// ── 1. upsert customs_declaration ──
let dOk = 0;
for (const d of decls) {
  const cols = ["ref_no","transport","importer_tax_id","importer_name_th","importer_name_en","importer_code","addr_street","addr_district","addr_subprovince","addr_province","addr_postcode","clearance_name","clearance_card","agent_code","agent_tax","agent_name_th","job_no","ctrl_decl_no","transport_mode","vessel_name","voyage","release_port","discharge_port","arrival_date","payment_date","reference_date","recv_date","send_date","decl_type","decl_status","currency","exchange_rate","cif_total_baht","total_tax","supplier_code","supplier_name","supplier_street","supplier_city","supplier_area","supplier_country","supplier_email","incoterm","lines","source_file"];
  const vals = cols.map((k) => (k === "lines" ? JSON.stringify(d.lines) : (d[k] === "" ? null : d[k])));
  const ph = cols.map((_, i) => `$${i + 1}`).join(",");
  const upd = cols.filter((k) => k !== "ref_no").map((k) => `${k}=excluded.${k}`).join(",");
  await c.query(`INSERT INTO customs_declaration (${cols.join(",")}) VALUES (${ph}) ON CONFLICT (ref_no) DO UPDATE SET ${upd}, imported_at=now()`, vals);
  dOk++;
}
console.log(`\n✅ customs_declaration: upserted ${dOk}`);

// ── 2. re-aggregate customs_importer_lead from ALL declarations per tax (idempotent · preserves sales fields) ──
// ⚠️ count/cif/tax are PER-DECLARATION (decl CTE · NO line unnest); hs_codes are
// PER-LINE (hs CTE · unnest) — unnesting in the decl grouping would multiply the
// count by the line count (100 ใบ × 42 บรรทัด = 4252 · CIF ×42 · the double-count trap).
const agg = (await c.query(`
  WITH decl AS (
    SELECT regexp_replace(importer_tax_id,'\\D','','g') AS tax,
           max(importer_name_th) AS name_th, max(importer_name_en) AS name_en,
           max(addr_province) AS province, max(addr_postcode) AS postcode,
           max(trim(concat_ws(' ', addr_street, addr_district, addr_subprovince, addr_province, addr_postcode))) AS address,
           array_agg(distinct transport) AS transports,
           count(*)::int AS decl_count,
           coalesce(sum(cif_total_baht),0) AS total_cif, coalesce(sum(total_tax),0) AS total_tax,
           min(coalesce(recv_date,payment_date,reference_date)) AS first_date,
           max(coalesce(recv_date,payment_date,reference_date)) AS last_date,
           jsonb_agg(distinct supplier_name) FILTER (WHERE supplier_name is not null AND supplier_name <> '') AS suppliers
      FROM customs_declaration
     WHERE importer_tax_id is not null AND regexp_replace(importer_tax_id,'\\D','','g') <> ''
     GROUP BY 1
  ), hs AS (
    SELECT regexp_replace(importer_tax_id,'\\D','','g') AS tax,
           jsonb_agg(distinct l->>'tariff_hs') FILTER (WHERE l->>'tariff_hs' <> '') AS hs_codes
      FROM customs_declaration, jsonb_array_elements(lines) l
     WHERE importer_tax_id is not null AND regexp_replace(importer_tax_id,'\\D','','g') <> ''
     GROUP BY 1
  )
  SELECT d.*, coalesce(h.hs_codes,'[]'::jsonb) AS hs_codes
    FROM decl d LEFT JOIN hs h USING (tax)`)).rows;

// GLOBAL cross-ref — the re-aggregate covers ALL importers (road+sea+air already
// in customs_declaration), so match against EVERY importer's tax, not just this
// run's files. (Bug: a run-scoped map wiped matched_phone/is_existing for other
// modes' importers on a later run.)
const allTaxes = [...new Set(agg.map((a) => a.tax).filter(Boolean))];
const corpAll = (await c.query(`SELECT regexp_replace(corporatenumber,'\\D','','g') AS tax, userid, corporatename FROM tb_corporate WHERE regexp_replace(corporatenumber,'\\D','','g') = ANY($1)`, [allTaxes])).rows;
const corpAllByTax = new Map(); for (const r of corpAll) if (!corpAllByTax.has(r.tax)) corpAllByTax.set(r.tax, r);
const uids = [...new Set(corpAll.map((r) => r.userid))];
const usersAll = uids.length ? (await c.query(`SELECT "userID","userName","userTel","adminIDSale" FROM tb_users WHERE "userID" = ANY($1)`, [uids])).rows : [];
const userAllById = new Map(usersAll.map((u) => [u.userID, u]));

let lOk = 0;
for (const a of agg) {
  const corpM = corpAllByTax.get(a.tax); const u = corpM ? userAllById.get(corpM.userid) : null;
  const isExisting = !!corpM;
  const isOurs = a.tax === AXELRA_TAX;
  await c.query(`
    INSERT INTO customs_importer_lead
      (tax_id,name_th,name_en,address,province,postcode,transports,decl_count,total_cif,total_tax,
       first_decl_date,last_decl_date,hs_codes,suppliers,matched_userid,matched_phone,matched_name,matched_sale,
       is_existing,lead_status,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now())
    ON CONFLICT (tax_id) DO UPDATE SET
      name_th=excluded.name_th, name_en=excluded.name_en, address=excluded.address, province=excluded.province, postcode=excluded.postcode,
      transports=excluded.transports, decl_count=excluded.decl_count, total_cif=excluded.total_cif, total_tax=excluded.total_tax,
      first_decl_date=excluded.first_decl_date, last_decl_date=excluded.last_decl_date, hs_codes=excluded.hs_codes, suppliers=excluded.suppliers,
      matched_userid=excluded.matched_userid, matched_phone=excluded.matched_phone, matched_name=excluded.matched_name, matched_sale=excluded.matched_sale,
      is_existing=excluded.is_existing, updated_at=now()
      -- NOTE: lead_status / call_note / assigned_sale / called_at are PRESERVED (not in the SET) except the one-time our_own tag below
  `, [a.tax, a.name_th, a.name_en, a.address, a.province, a.postcode, a.transports, a.decl_count, a.total_cif, a.total_tax,
      a.first_date, a.last_date, JSON.stringify(a.hs_codes || []), JSON.stringify(a.suppliers || []),
      corpM ? corpM.userid : null, u ? u.userTel : null, u ? u.userName : null, u ? u.adminIDSale : null,
      isExisting, isOurs ? "our_own" : "new"]);
  lOk++;
}
// tag AXELRA (our own affiliate) as our_own so it never lands in the call queue.
await c.query(`UPDATE customs_importer_lead SET lead_status='our_own' WHERE tax_id=$1 AND lead_status='new'`, [AXELRA_TAX]);
console.log(`✅ customs_importer_lead: upserted ${lOk} importers (sales workflow fields preserved on re-run)`);

const summary = (await c.query(`SELECT is_existing, lead_status, count(*) FROM customs_importer_lead GROUP BY 1,2 ORDER BY 1 DESC,2`)).rows;
console.log(`\n── lead queue summary ──`);
summary.forEach((s) => console.log(`  existing=${s.is_existing} · ${s.lead_status}: ${s.count}`));
await c.end();
