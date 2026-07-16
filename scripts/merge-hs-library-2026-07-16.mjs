/**
 * ════════════════════════════════════════════════════════════════════
 * merge-hs-library-2026-07-16 — fold doc_bot + ใบขน into the ONE library
 * ════════════════════════════════════════════════════════════════════
 * Owner 2026-07-16: "ยุบทิ้ง ให้มารวมกันอยู่ทีเดียว · ใช้ docbot เป็นพื้นฐาน
 * แล้วต่อยอดเป็น คลัง HS CODE LIBRARY ตัวเต็ม"
 *
 * ANCHOR = hs_codes (see 0258's header for the 3 verified reasons: 5 FKs
 * RESTRICT · every duty consumer reads it · doc_bot is product-grain).
 * doc_bot_hs_codes is NOT collapsed — it stays product-grain (5,335 rows /
 * 2,771 products / พิกัดหลัก-รอง / conflict groups / เลี่ยงพิกัด intel).
 * This script only READS it. Nothing is lost.
 *
 * 🔴 MONEY SAFETY. No bill/invoice reads this library, BUT default_duty_pct
 * feeds cargo-declaration-from-items.ts:74 + customs-declarations.ts:214 +
 * addHsLine (snapshots duty_pct_used), which PERSIST duty_thb / vat_thb. So:
 *   · a ใบขน-observed rate NEVER overwrites a curated duty
 *   · an observed rate ALWAYS also lands in its own decl_duty_pct column
 *   · any unconfirmed duty is FLAGGED (duty_confirmed=false), never presented
 *     as a confirmed 0% (0 reads as "ยกเว้น" to every consumer)
 *
 * PRECEDENCE LADDER — first match wins for default_duty_pct / form_e_duty_pct:
 *   1. curated_0224 (existing, non-dummy) → KEEP UNCHANGED · duty_confirmed=true
 *      ★ "canonical wins" only arbitrates ~74 rows — canonical is 8% of the library.
 *   2. ใบขน-observed (modal @ priv='000') → for a NEW code, or to REPLACE a
 *      dummy_0030 guess · duty_confirmed=true · provenance='decl'
 *   3. dummy_0030 with no ใบขน evidence → keep the number · duty_confirmed=FALSE
 *   4. doc_bot `no`, fraction-fixed + stable → duty_confirmed=FALSE (a bot guess)
 *   5. else 0 · duty_confirmed=FALSE ("unknown", NOT "exempt")
 * decl_count / decl_duty_pct / decl_form_e_pct / decl_duty_stable ALWAYS land
 * for every code seen on a ใบขน, whichever rung won, so the page can show
 * canonical-vs-reality side by side and badge ⚠ on disagreement.
 *
 * Idempotent (re-run = no-op). Dry-run DEFAULT. Backup written before any write.
 *
 *   node scripts/merge-hs-library-2026-07-16.mjs               # dry-run PROD
 *   node scripts/merge-hs-library-2026-07-16.mjs --dev         # dry-run DEV
 *   node scripts/merge-hs-library-2026-07-16.mjs --apply       # execute PROD
 * ════════════════════════════════════════════════════════════════════
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const DEV = process.argv.includes("--dev");

const CONN = DEV
  ? { user: "postgres.lozntlidlqqzzcaathnm", password: "n61OKDy28QcrB1ZJ", label: "DEV" }
  : { user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", label: "PROD" };

// mig 0030's literal seed ("seed a few common HS codes so the picker isn't
// empty") = placeholder guesses, not curated data.
const DUMMY_0030 = new Set([
  "8517.12.00", "8504.40.90", "6109.10.00", "6204.62.00", "9503.00.99",
  "3924.10.00", "6403.99.00", "8473.30.20", "9999.99.99",
]);

// ── helpers ─────────────────────────────────────────────────────────
const clean = (v) => (v ?? "").toString().trim();
const digitsOf = (v) => clean(v).replace(/[^0-9]/g, "");

/** Dotted house style for an exact-8 digit code: 7320.10.11 */
const dot8 = (d) => `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;

/**
 * Parse a doc_bot `no` / `fe` duty cell. TEXT column with real garbage:
 * '10' · '10%' · '0' · '-' · 'ติด สมอ.' · '1668' · '5797029195' ·
 * '8441.10.20 *ไม่ใช้ไฟฟ้า' · and the ×100 FRACTION BUG ('0.1' meaning 10%).
 *
 * 🔴 The fraction fix is PROVEN, not guessed. Measured on prod: joining the
 * doc_bot codes that also appear on a real ใบขน (priv=000 modal), 140 codes
 * satisfy `v < 1 AND v*100 == observed duty` (0.1↔10 · 0.3↔30 · 0.05↔5).
 * Landing 0.1 as 0.1% where the truth is 10% UNDERSTATES duty 100× on a column
 * that gets snapshotted into a persisted duty_thb/vat_thb.
 * Returns null when the cell is not a usable number.
 */
function parseBotDuty(raw) {
  const s = clean(raw).replace(/%/g, "").trim();
  if (!s) return null;
  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) return null; // '-', 'ติด สมอ.', '8441.10.20 *…'
  let v = Number(s);
  if (!Number.isFinite(v)) return null;
  if (v > 0 && v < 1) v = v * 100;   // the fraction bug (v=0 stays 0)
  if (v < 0 || v > 100) return null; // '1668' / '5797029195' are not duty rates
  return Math.round(v * 1000) / 1000;
}

/** The /bot page's completeness scorer — kept byte-identical so the library's
 *  representative row is the SAME row the alias view calls พิกัดหลัก. */
const completeness = (r) =>
  (clean(r.hs_code) ? 8 : 0) + (clean(r.no) ? 4 : 0) + (clean(r.fe) ? 2 : 0) + (clean(r.stat) ? 1 : 0);

/** Modal of a Map<value, count>: most frequent, tie-break the HIGHER duty
 *  (conservative — never understate). Returns {value, distinct}. */
function modal(counts) {
  let best = null, bestN = -1;
  for (const [v, n] of counts) {
    if (n > bestN || (n === bestN && v > best)) { best = v; bestN = n; }
  }
  return { value: best, distinct: counts.size };
}

// ── main ────────────────────────────────────────────────────────────
const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432, user: CONN.user, password: CONN.password,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
console.log(`\n════ merge-hs-library · ${CONN.label} · ${APPLY ? "APPLY" : "DRY-RUN"} ════\n`);

// Guard: 0258 must be applied (hs8_key is the whole basis of this merge).
const guard = await c.query(`
  select count(*) n from information_schema.columns
  where table_name='hs_codes' and column_name in ('hs8_key','duty_confirmed','decl_count','provenance')`);
if (Number(guard.rows[0].n) < 4) {
  console.error("❌ migration 0258 is NOT applied on this env — run scripts/apply-migration-0258.mjs --apply first.");
  await c.end();
  process.exit(1);
}

// ── 1. existing library (the arbitration ground truth) ──────────────
const { rows: existing } = await c.query(`
  select code, hs8_key, hs8_is_padded, provenance, is_canonical, duty_confirmed,
         description, description_en, default_duty_pct, form_e_duty_pct,
         unit, default_stat_code, hs_note, source
  from hs_codes`);

// ── 1b. BACKUP before any write ─────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `scripts/_backup-hs-library-${CONN.label.toLowerCase()}-${stamp}.json`;
writeFileSync(backupPath, JSON.stringify(existing, null, 1));
console.log(`backup: ${backupPath} (${existing.length} rows)\n`);

const byKey = new Map();
for (const r of existing) if (r.hs8_key) byKey.set(r.hs8_key, r);

// ── 2. doc_bot → the backbone (product-grain → best row per code) ───
const { rows: botRows } = await c.query(`
  select hs8_key, hs_code, th, en, fe, no, stat, note, imported_at, source
  from doc_bot_hs_codes where hs8_key is not null`);

const bot = new Map(); // hs8_key → { best, dutySet, feSet, rows }
for (const r of botRows) {
  let g = bot.get(r.hs8_key);
  if (!g) { g = { best: r, dutyCounts: new Map(), feCounts: new Map(), rawDuty: new Set(), rows: 0 }; bot.set(r.hs8_key, g); }
  g.rows++;
  const cb = completeness(g.best), cr = completeness(r);
  if (cr > cb || (cr === cb && clean(r.imported_at) >= clean(g.best.imported_at))) g.best = r;
  const d = parseBotDuty(r.no);
  if (d !== null) g.dutyCounts.set(d, (g.dutyCounts.get(d) ?? 0) + 1);
  const f = parseBotDuty(r.fe);
  if (f !== null) g.feCounts.set(f, (g.feCounts.get(f) ?? 0) + 1);
  // Track the RAW cell too — the delta between raw-distinct and fixed-distinct
  // is an independent proof of the ×100 rule (see the report).
  const rawNo = clean(r.no).replace(/%/g, "");
  if (/^[0-9]+(\.[0-9]+)?$/.test(rawNo)) g.rawDuty.add(rawNo);
}

// ── 3. ใบขน → the reality layer (SPLIT BY priv — see below) ─────────
// 🔴 A modal across ALL privs is WRONG. Measured on prod:
//   priv=000 → 7,753 lines / 792 codes / avg 10.209%   (อากรปกติ)
//   priv=ACN → 2,518 lines / 393 codes / avg  0.274%, 96% zero  (Form-E)
//   priv=999 → 160 / 11 / 16.813%   ·   priv=R1C → 4 / 1 / 0%
// Blending 000 with ACN mixes a normal 10% with a Form-E 0%. Proof the split is
// the right axis: ignoring priv, 214/936 codes look "unstable"; splitting by
// priv leaves only 14 → the priv split explains 200 of the 214.
const { rows: declRows } = await c.query(`
  with l as (
    select ref_no, imported_at, jsonb_array_elements(lines) ln
    from customs_declaration where lines is not null
  )
  select
    case
      when length(regexp_replace(ln->>'tariff_hs','[^0-9]','','g')) = 12
       and left(regexp_replace(ln->>'tariff_hs','[^0-9]','','g'),4) = '0000'
        then right(regexp_replace(ln->>'tariff_hs','[^0-9]','','g'),8)
      else rpad(left(regexp_replace(ln->>'tariff_hs','[^0-9]','','g'),8),8,'0')
    end                                        as k,
    regexp_replace(ln->>'tariff_hs','[^0-9]','','g') as raw_digits,
    ref_no, imported_at,
    ln->>'priv'                                as priv,
    (ln->>'duty_rate')::numeric                as duty,
    nullif(trim(coalesce(ln->>'desc_th','')),'') as th,
    nullif(trim(coalesce(ln->>'desc_en','')),'') as en
  from l
  where coalesce(ln->>'tariff_hs','') <> ''
    and regexp_replace(ln->>'tariff_hs','[^0-9]','','g') <> ''`);

const decl = new Map();
for (const r of declRows) {
  let g = decl.get(r.k);
  if (!g) {
    g = {
      refs: new Set(), normal: new Map(), acn: new Map(),
      th: new Map(), en: new Map(), lastRef: "", lastAt: "", digits: r.raw_digits,
    };
    decl.set(r.k, g);
  }
  g.refs.add(r.ref_no);
  const duty = Number(r.duty);
  if (r.priv === "000") g.normal.set(duty, (g.normal.get(duty) ?? 0) + 1);
  else if (r.priv === "ACN") g.acn.set(duty, (g.acn.get(duty) ?? 0) + 1);
  if (r.th) g.th.set(r.th, (g.th.get(r.th) ?? 0) + 1);
  if (r.en) g.en.set(r.en, (g.en.get(r.en) ?? 0) + 1);
  const at = clean(r.imported_at);
  if (at >= g.lastAt) { g.lastAt = at; g.lastRef = r.ref_no; }
}

// ── 4. build the plan ───────────────────────────────────────────────
const allKeys = new Set([...byKey.keys(), ...bot.keys(), ...decl.keys()]);
const inserts = [], updates = [];
const stats = {
  rung1_curated_kept: 0, rung2_decl: 0, rung2_fixed_dummy: 0, rung3_dummy_unconfirmed: 0,
  rung4_bot_guess: 0, rung5_unknown: 0,
  botDisagreeTotal: 0, botDisagreeQuarantined: 0, botDisagreeRaw: 0,
  declUnstable: 0, x100Fixed: 0, padCollision: [], conflicts: [], descFilled: 0,
};

// How many doc_bot codes have rows that disagree with EACH OTHER on อากร (the
// product-grain update anomaly). Counted over the whole set — most never reach
// rung 4 because the ใบขน (rung 2) outrank them, but the anomaly is real and
// the honest number to report is the total, not just the quarantined slice.
for (const g of bot.values()) {
  if (g.dutyCounts.size > 1) stats.botDisagreeTotal++;
  if (g.rawDuty.size > 1) stats.botDisagreeRaw++;
}

for (const k of allKeys) {
  const ex = byKey.get(k);
  const b = bot.get(k);
  const d = decl.get(k);

  // ── the ใบขน reality layer (always computed, always lands) ──
  let declCount = 0, declDuty = null, declFe = null, declStable = null, declLast = null;
  if (d) {
    declCount = d.refs.size;
    if (d.normal.size) {
      const m = modal(d.normal);
      declDuty = m.value;
      declStable = m.distinct <= 1;
      if (!declStable) stats.declUnstable++;
    }
    if (d.acn.size) declFe = modal(d.acn).value;
    declLast = d.lastRef || null;
  }

  // ── the duty ladder ──
  let duty = null, formE = null, confirmed = false, provenance = null, source = null;

  if (ex && ex.provenance === "curated_0224") {
    // RUNG 1 — curated wins. Never touched.
    stats.rung1_curated_kept++;
    duty = null; // signal: do not write duty
    confirmed = true;
    if (d && declDuty !== null && Number(ex.default_duty_pct) !== declDuty) {
      stats.conflicts.push({
        code: ex.code, canon: Number(ex.default_duty_pct), decl: declDuty, lines: declCount,
      });
    }
  } else if (d && declDuty !== null) {
    // RUNG 2 — real customs filings. New code, or replaces a dummy_0030 guess.
    duty = declDuty;
    formE = declFe;
    confirmed = true;
    provenance = "decl";
    source = ex?.source ?? "ใบขน";
    if (ex && ex.provenance === "dummy_0030") stats.rung2_fixed_dummy++;
    else stats.rung2_decl++;
  } else if (ex && ex.provenance === "dummy_0030") {
    // RUNG 3 — a placeholder with no ใบขน evidence: keep the number, flag it.
    stats.rung3_dummy_unconfirmed++;
    duty = null;
    confirmed = false;
  } else if (b && b.dutyCounts.size) {
    // RUNG 4 — a doc-bot guess. Never confirmed.
    const m = modal(b.dutyCounts);
    if (m.distinct > 1) stats.botDisagreeQuarantined++;
    duty = m.value;
    formE = b.feCounts.size ? modal(b.feCounts).value : null;
    confirmed = false;
    provenance = "doc_bot";
    source = clean(b.best.source) || "doc_bot";
    stats.rung4_bot_guess++;
  } else {
    // RUNG 5 — unknown. 0 is NOT exempt.
    duty = ex ? null : 0;
    confirmed = false;
    provenance = ex?.provenance ?? (b ? "doc_bot" : "decl");
    source = ex?.source ?? (b ? clean(b.best.source) || "doc_bot" : "ใบขน");
    if (!ex) stats.rung5_unknown++;
  }

  if (ex) {
    // ── UPDATE an existing row ──
    const set = {
      decl_count: declCount, decl_duty_pct: declDuty, decl_form_e_pct: declFe,
      decl_duty_stable: declStable, decl_last_used: declLast,
    };
    // duty only moves for a dummy_0030 that the ใบขน disprove (rung 2).
    if (duty !== null && ex.provenance === "dummy_0030") {
      set.default_duty_pct = duty;
      set.duty_confirmed = true;
      set.provenance = "decl";
      if (formE !== null) set.form_e_duty_pct = formE;
    }
    // Fill a BLANK description from the ใบขน — never overwrite a curated one.
    if (!clean(ex.description_en) && d && d.en.size) {
      set.description_en = modal(d.en).value;
      stats.descFilled++;
    }
    // A padded-key collision is ONLY real when the curated row is a <8-digit
    // HEADING and the doc_bot row is an EXACT-8 subheading — then rpad() claimed
    // a precision the curated source never gave (4202.29 → 4202.2900). If the
    // bot row is ALSO <8 digits both sides are the same heading = no collision.
    if (b && ex.hs8_is_padded && digitsOf(b.best.hs_code).length === 8) {
      stats.padCollision.push({ hs: ex.code, bot: clean(b.best.hs_code) });
    }
    updates.push({ code: ex.code, set });
  } else {
    // ── INSERT a new row ──
    // Display code: exact-8 → dotted house style (7320.10.11); otherwise the raw
    // source form verbatim (a 6-digit heading must NOT be dressed up as a
    // subheading — hs8_is_padded flags that assumption).
    let code;
    if (b) {
      const dg = digitsOf(b.best.hs_code);
      code = dg.length === 8 ? dot8(dg) : clean(b.best.hs_code);
    } else {
      code = dot8(k); // ใบขน are always 12-digit 0000+HS8 → the HS8 is exact
    }
    const th = b ? clean(b.best.th) : "";
    const en = b ? clean(b.best.en) : "";
    const dTh = d && d.th.size ? modal(d.th).value : "";
    const dEn = d && d.en.size ? modal(d.en).value : "";
    const description = th || dTh || en || dEn || `(ไม่ระบุชื่อ · ${code})`;
    const description_en = en || dEn || null;

    if (b && parseBotDuty(b.best.no) !== null) {
      const raw = clean(b.best.no).replace(/%/g, "");
      if (/^0\.[0-9]+$/.test(raw) && Number(raw) > 0) stats.x100Fixed++;
    }

    inserts.push({
      code,
      description,
      description_en,
      default_duty_pct: duty ?? 0,
      form_e_duty_pct: formE ?? 0,
      unit: null,
      default_stat_code: b ? clean(b.best.stat) || null : null,
      hs_note: b ? clean(b.best.note) || null : null,
      is_active: true,
      source, provenance,
      is_canonical: false,
      duty_confirmed: confirmed,
      decl_count: declCount, decl_duty_pct: declDuty, decl_form_e_pct: declFe,
      decl_duty_stable: declStable, decl_last_used: declLast,
    });
  }
}

// ── 5. report ───────────────────────────────────────────────────────
console.log("── PLAN ────────────────────────────────────────────");
console.log(`existing library : ${existing.length}`);
console.log(`doc_bot keys     : ${bot.size}   (from ${botRows.length} product-grain rows)`);
console.log(`ใบขน keys        : ${decl.size}   (from ${declRows.length} lines)`);
console.log(`unified target   : ${allKeys.size}`);
console.log(`  → INSERT       : ${inserts.length}`);
console.log(`  → UPDATE       : ${updates.length}`);
console.log("");
console.log("── DUTY LADDER ─────────────────────────────────────");
console.log(`1. curated kept unchanged     : ${stats.rung1_curated_kept}`);
console.log(`2. ใบขน-observed (new code)    : ${stats.rung2_decl}`);
console.log(`2. ใบขน fixes a dummy_0030     : ${stats.rung2_fixed_dummy}`);
console.log(`3. dummy_0030 → unconfirmed   : ${stats.rung3_dummy_unconfirmed}`);
console.log(`4. doc_bot guess → unconfirmed: ${stats.rung4_bot_guess}`);
console.log(`5. unknown (0, NOT exempt)    : ${stats.rung5_unknown}`);
console.log("");
console.log("── DATA-QUALITY FLAGS ──────────────────────────────");
console.log(`×100 fraction bug fixed (new rows) : ${stats.x100Fixed}`);
console.log(`doc_bot codes disagreeing RAW      : ${stats.botDisagreeRaw}  ('0.1' vs '10' read as 2 different duties)`);
console.log(`   └ still disagreeing AFTER the ×100 fix: ${stats.botDisagreeTotal}`);
console.log(`      → the fraction rule RECONCILES ${stats.botDisagreeRaw - stats.botDisagreeTotal} of them = independent proof it is correct`);
console.log(`doc_bot codes disagreeing on อากร   : ${stats.botDisagreeTotal} total (the product-grain update anomaly)`);
console.log(`   └ of those, decided BY a bot guess: ${stats.botDisagreeQuarantined}  → duty_confirmed=false + review filter`);
console.log(`      (the rest are outranked by ใบขน evidence — rung 2)`);
console.log(`ใบขน unstable within priv=000       : ${stats.declUnstable}  → decl_duty_stable=false (⚠ badge)`);
console.log(`description_en filled from ใบขน     : ${stats.descFilled}`);
console.log(`padded-key collisions (hs<8 ↔ bot8): ${stats.padCollision.length}  (rpad claimed a precision the curated source never gave)`);
for (const p of stats.padCollision) console.log(`   ⚠ ${p.hs}  ↔  doc_bot ${p.bot}`);
console.log("");
console.log(`── 🔴 ARBITRATION LIST — curated ≠ ใบขน (${stats.conflicts.length}) ──`);
console.log("   NOT auto-resolved: canonical wins (rung 1). Owner/Doc must decide.");
console.table(stats.conflicts.sort((a, b) => b.lines - a.lines));

if (!APPLY) {
  console.log("\nDRY-RUN — nothing written. Pass --apply to execute.");
  await c.end();
  process.exit(0);
}

// ── 6. apply ────────────────────────────────────────────────────────
let ins = 0, upd = 0;
try {
  await c.query("begin");

  for (const r of inserts) {
    await c.query(
      `insert into hs_codes (code, description, description_en, default_duty_pct, form_e_duty_pct,
         other_forms, unit, default_stat_code, hs_note, is_active, source, provenance, is_canonical,
         duty_confirmed, decl_count, decl_duty_pct, decl_form_e_pct, decl_duty_stable, decl_last_used,
         updated_by, updated_at)
       values ($1,$2,$3,$4,$5,'{}'::jsonb,$6,$7,$8,true,$9,$10,false,$11,$12,$13,$14,$15,$16,'merge-2026-07-16',now())
       on conflict (code) do nothing`,
      [r.code, r.description, r.description_en, r.default_duty_pct, r.form_e_duty_pct,
       r.unit, r.default_stat_code, r.hs_note, r.source, r.provenance, r.duty_confirmed,
       r.decl_count, r.decl_duty_pct, r.decl_form_e_pct, r.decl_duty_stable, r.decl_last_used],
    );
    ins++;
  }

  for (const u of updates) {
    const keys = Object.keys(u.set);
    if (!keys.length) continue;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    await c.query(
      `update hs_codes set ${sets}, updated_by='merge-2026-07-16', updated_at=now() where code = $1`,
      [u.code, ...keys.map((k) => u.set[k])],
    );
    upd++;
  }

  await c.query("commit");
  console.log(`\napplied ✓  inserted ${ins} · updated ${upd}`);
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error(`\n❌ FAILED (rolled back): ${e.message}`);
  await c.end();
  process.exit(1);
}

// ── 7. verify ───────────────────────────────────────────────────────
const v = await c.query(`
  select
    (select count(*) from hs_codes) total,
    (select count(*) from hs_codes where duty_confirmed and default_duty_pct is null) bad_null_duty,
    (select count(*) from hs_codes where default_duty_pct > 0 and default_duty_pct < 1) suspicious_fraction,
    (select count(*) from hs_codes where decl_count > 0) with_decl,
    (select count(*) from hs_codes where duty_confirmed) confirmed,
    (select count(*) from hs_codes where is_canonical) canonical`);
const arb = await c.query(`
  select code, default_duty_pct, decl_duty_pct from hs_codes
  where provenance='curated_0224' and decl_duty_pct is not null and default_duty_pct <> decl_duty_pct
  order by decl_count desc`);
console.log("\n── VERIFY ──");
console.table(v.rows);
console.log(`arbitration rows preserved unchanged: ${arb.rows.length}`);
console.table(arb.rows);
if (Number(v.rows[0].bad_null_duty) > 0) { console.error("❌ confirmed duty with NULL value"); process.exitCode = 1; }
if (Number(v.rows[0].suspicious_fraction) > 0) console.warn("⚠ rows with 0 < duty < 1 — check the fraction fix");

await c.end();
