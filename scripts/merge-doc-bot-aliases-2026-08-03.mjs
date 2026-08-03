// ════════════════════════════════════════════════════════════════════
// merge-doc-bot-aliases-2026-08-03 — ยุบ product-grain เข้าตารางเดียว
// ════════════════════════════════════════════════════════════════════
// Owner 2026-08-03: "รวมกันทั้งหน้าตาการใช้งาน และ DB · table เดียวกัน"
//
// Copies doc_bot_hs_codes (product→code rows) + doc_bot_hs_overrides
// (keyword→correct_hs corrections) ONTO hs_codes.product_aliases (mig 0285).
// Join = hs8_key (the 0258 source-aware generated key, identical on both
// tables). After this the doc_bot_* tables are ARCHIVE (no reader).
//
//   node --env-file=.env.local scripts/merge-doc-bot-aliases-2026-08-03.mjs           # dry-run
//   node --env-file=.env.local scripts/merge-doc-bot-aliases-2026-08-03.mjs --apply
//
// Idempotent: aliases dedupe by lowercase(th|en) — re-running adds nothing.
// READ hs_codes/doc_bot_* · WRITE only hs_codes.product_aliases. No money.
// ════════════════════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("missing env"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const clean = (v) => (v ?? "").toString().trim();

async function fetchAll(table, select) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const hs = await fetchAll("hs_codes", "code, hs8_key, description, description_en, product_aliases");
const bot = await fetchAll("doc_bot_hs_codes", "id, hs_code, hs8_key, th, en, note, source");
const ovr = await fetchAll("doc_bot_hs_overrides", "id, keyword, correct_hs, note");
console.log(`hs_codes=${hs.length} · doc_bot=${bot.length} · overrides=${ovr.length}`);

// hs8_key → hs_codes row (exact-digit code match wins when several share a key)
const byKey = new Map();
for (const r of hs) {
  if (!r.hs8_key) continue;
  const arr = byKey.get(r.hs8_key);
  if (arr) arr.push(r); else byKey.set(r.hs8_key, [r]);
}
const digitsOf = (v) => clean(v).replace(/[^0-9]/g, "");
function targetFor(rawCode, hs8key) {
  const cands = byKey.get(hs8key);
  if (!cands || cands.length === 0) return null;
  const d = digitsOf(rawCode);
  return cands.find((c) => digitsOf(c.code) === d) ?? cands[0];
}
const hs8Of = (raw) => {
  const d = digitsOf(raw);
  return d ? d.slice(0, 8).padEnd(8, "0") : null;
};

// build per-target alias additions
const plan = new Map(); // code -> {row, add:[{th,en,note,src}]}
let matched = 0, noKey = 0, noTarget = 0, dupSkipped = 0;
const noTargetSamples = [];

function planAdd(target, alias) {
  const th = clean(alias.th), en = clean(alias.en);
  const label = (th || en).toLowerCase();
  if (!label) return;
  // dedupe vs the row's own names + already-stored aliases + this plan
  const p = plan.get(target.code) ?? {
    row: target,
    seen: new Set(
      [clean(target.description), clean(target.description_en),
       ...((Array.isArray(target.product_aliases) ? target.product_aliases : [])
         .flatMap((a) => [clean(a.th), clean(a.en)]))]
        .filter(Boolean).map((x) => x.toLowerCase()),
    ),
    add: [],
  };
  const keys = [th.toLowerCase(), en.toLowerCase()].filter(Boolean);
  if (keys.some((k) => p.seen.has(k))) { dupSkipped++; plan.set(target.code, p); return; }
  for (const k of keys) p.seen.add(k);
  const entry = { th: th || null, en: en || null };
  if (clean(alias.note)) entry.note = clean(alias.note);
  entry.src = alias.src;
  p.add.push(entry);
  plan.set(target.code, p);
}

for (const b of bot) {
  const k = b.hs8_key ?? hs8Of(b.hs_code);
  if (!k) { noKey++; continue; }
  const t = targetFor(b.hs_code, k);
  if (!t) { noTarget++; if (noTargetSamples.length < 10) noTargetSamples.push(`${b.hs_code} · ${clean(b.th) || clean(b.en)}`); continue; }
  matched++;
  planAdd(t, { th: b.th, en: b.en, note: b.note, src: clean(b.source).startsWith("ไฟล์") ? "file" : "bot" });
}
for (const o of ovr) {
  const k = hs8Of(o.correct_hs);
  if (!k) { noKey++; continue; }
  const t = targetFor(o.correct_hs, k);
  if (!t) { noTarget++; continue; }
  matched++;
  planAdd(t, { th: o.keyword, en: null, note: `DOC override${clean(o.note) ? ` — ${clean(o.note)}` : ""}`, src: "override" });
}

const targets = [...plan.values()].filter((p) => p.add.length > 0);
const totalAliases = targets.reduce((n, p) => n + p.add.length, 0);
console.log(`matched=${matched} · no-key=${noKey} (ยังไม่มีพิกัด — คงไว้ใน archive) · no-target=${noTarget} · dup-skipped=${dupSkipped}`);
if (noTargetSamples.length) console.log("no-target ตัวอย่าง:", noTargetSamples);
console.log(`จะเขียน ${targets.length} พิกัด · เพิ่มชื่อสินค้ารวม ${totalAliases} ชื่อ`);
for (const p of targets.slice(0, 8)) {
  console.log(`  ${p.row.code} +${p.add.length}: ${p.add.slice(0, 3).map((a) => a.th || a.en).join(" · ")}${p.add.length > 3 ? " …" : ""}`);
}

if (!APPLY) { console.log("\nDRY-RUN — รันซ้ำด้วย --apply เพื่อเขียนจริง"); process.exit(0); }

// backup existing aliases of the rows we touch
const backup = targets.map((p) => ({ code: p.row.code, product_aliases: p.row.product_aliases ?? [] }));
const bfile = `/tmp/backup-hs-aliases-${Date.now()}.json`;
fs.writeFileSync(bfile, JSON.stringify(backup));
console.log("backup:", bfile);

let written = 0, failed = 0;
for (const p of targets) {
  const existing = Array.isArray(p.row.product_aliases) ? p.row.product_aliases : [];
  const { error } = await db.from("hs_codes")
    .update({ product_aliases: [...existing, ...p.add] })
    .eq("code", p.row.code);
  if (error) { failed++; console.error(`  ✗ ${p.row.code}: ${error.message}`); }
  else written++;
}
console.log(`APPLIED: ${written} พิกัด · failed=${failed}`);
