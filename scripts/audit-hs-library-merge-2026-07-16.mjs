// AUDIT-A — HS library unification (owner 2026-07-16: "รวมพิกัดที่เดียว · docbot เป็นพื้นฐาน").
// READ-ONLY. No writes. Answers:
//   1. exact hs_code format per source → the normalisation rule
//   2. overlap counts (canonical ∩ doc_bot · ใบขน ∩ doc_bot/canonical · brand-new)
//   3. per-ใบขน-code: distinct duty_rate (stable? modal), usage count, sample TH/EN
//   4. conflicts: canonical duty ≠ ใบขน-observed duty (top 10)
import pg from "pg";

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const H = (s) => console.log(`\n${"=".repeat(78)}\n${s}\n${"=".repeat(78)}`);

await c.connect();

// ── 0. SCHEMA + RLS ───────────────────────────────────────────────────────
H("0a. SCHEMA — doc_bot_hs_codes / hs_codes / doc_bot_hs_overrides");
for (const t of ["doc_bot_hs_codes", "hs_codes", "doc_bot_hs_overrides"]) {
  const r = await c.query(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns where table_schema='public' and table_name=$1
      order by ordinal_position`,
    [t],
  );
  console.log(`\n--- ${t} (${r.rows.length} cols) ---`);
  for (const x of r.rows)
    console.log(
      `  ${x.column_name.padEnd(20)} ${x.data_type.padEnd(28)} null=${x.is_nullable} def=${x.column_default ?? "-"}`,
    );
}

H("0b. RLS policies + indexes");
const pol = await c.query(
  `select tablename, policyname, cmd, qual, with_check from pg_policies
    where schemaname='public' and tablename in ('doc_bot_hs_codes','hs_codes','doc_bot_hs_overrides')
    order by tablename, policyname`,
);
console.log(`policies: ${pol.rows.length}`);
for (const p of pol.rows)
  console.log(`  ${p.tablename}.${p.policyname} cmd=${p.cmd} qual=${p.qual} check=${p.with_check}`);
const rls = await c.query(
  `select relname, relrowsecurity from pg_class
    where relname in ('doc_bot_hs_codes','hs_codes','doc_bot_hs_overrides','customs_declaration')`,
);
for (const r of rls.rows) console.log(`  rls ${r.relname} = ${r.relrowsecurity}`);
const idx = await c.query(
  `select tablename, indexname, indexdef from pg_indexes
    where schemaname='public' and tablename in ('doc_bot_hs_codes','hs_codes')
    order by tablename, indexname`,
);
for (const i of idx.rows) console.log(`  idx ${i.indexdef}`);

// ── 1. RAW FORMAT SAMPLES ─────────────────────────────────────────────────
H("1. hs_code FORMAT per source (raw samples)");

const db = await c.query(
  `select hs_code, th, en, fe, no, stat, note, source from doc_bot_hs_codes
    where hs_code is not null and hs_code<>'' order by random() limit 15`,
);
console.log("\n--- doc_bot_hs_codes.hs_code (15 random) ---");
for (const r of db.rows)
  console.log(
    `  [${r.hs_code}] len=${String(r.hs_code).length} src=${r.source} no=${r.no ?? "-"} fe=${r.fe ?? "-"} stat=${r.stat ?? "-"} th=${(r.th ?? "").slice(0, 30)}`,
  );

const dbFmt = await c.query(
  `select
     length(hs_code) as len,
     (hs_code ~ '^[0-9]+$') as all_digits,
     (hs_code like '%.%') as has_dot,
     (hs_code like '% %') as has_space,
     count(*) as n
   from doc_bot_hs_codes where hs_code is not null and hs_code<>''
   group by 1,2,3,4 order by n desc limit 20`,
);
console.log("\n--- doc_bot hs_code shape histogram ---");
for (const r of dbFmt.rows)
  console.log(`  len=${r.len} digits=${r.all_digits} dot=${r.has_dot} space=${r.has_space} → ${r.n}`);

const hc = await c.query(`select code, description, default_duty_pct, form_e_duty_pct, other_forms, unit, default_stat_code, is_active from hs_codes order by code limit 15`);
console.log("\n--- hs_codes.code (first 15) ---");
for (const r of hc.rows)
  console.log(
    `  [${r.code}] len=${r.code.length} duty=${r.default_duty_pct} fe=${r.form_e_duty_pct} forms=${JSON.stringify(r.other_forms)} unit=${r.unit} stat=${r.default_stat_code} active=${r.is_active} :: ${(r.description ?? "").slice(0, 30)}`,
  );

const hcFmt = await c.query(
  `select length(code) as len, (code ~ '^[0-9]+$') as all_digits, (code like '%.%') as has_dot, count(*) as n
     from hs_codes group by 1,2,3 order by n desc`,
);
console.log("\n--- hs_codes code shape histogram ---");
for (const r of hcFmt.rows)
  console.log(`  len=${r.len} digits=${r.all_digits} dot=${r.has_dot} → ${r.n}`);

const dl = await c.query(
  `select l->>'tariff_hs' as hs, l->>'desc_th' as th, l->>'desc_en' as en, l->>'duty_rate' as duty,
          l->>'priv' as priv, l->>'origin_country' as origin
     from customs_declaration, jsonb_array_elements(lines) l
    where l->>'tariff_hs' is not null and l->>'tariff_hs' <> ''
    order by random() limit 15`,
);
console.log("\n--- customs_declaration lines tariff_hs (15 random) ---");
for (const r of dl.rows)
  console.log(
    `  [${r.hs}] len=${String(r.hs).length} duty=${r.duty} priv=${r.priv} orig=${r.origin} th=${(r.th ?? "").slice(0, 24)} en=${(r.en ?? "").slice(0, 24)}`,
  );

const dlFmt = await c.query(
  `select length(l->>'tariff_hs') as len, ((l->>'tariff_hs') ~ '^[0-9]+$') as all_digits,
          ((l->>'tariff_hs') like '%.%') as has_dot, count(*) as n
     from customs_declaration, jsonb_array_elements(lines) l
    where l->>'tariff_hs' is not null and l->>'tariff_hs' <> ''
    group by 1,2,3 order by n desc limit 20`,
);
console.log("\n--- ใบขน tariff_hs shape histogram ---");
for (const r of dlFmt.rows)
  console.log(`  len=${r.len} digits=${r.all_digits} dot=${r.has_dot} → ${r.n}`);

// ── 2. NORMALISATION probe ────────────────────────────────────────────────
// candidate rule: strip non-digits; ใบขน is 12-digit zero-padded → the real code
// is the LAST 11 (HS8 + stat3)? or trailing 11 after stripping leading zeros?
H("2. NORMALISATION probe — what joins these?");

const probe = await c.query(`
  with dbn as (
    select hs_code raw, regexp_replace(hs_code,'[^0-9]','','g') d from doc_bot_hs_codes
     where hs_code is not null and hs_code<>''
  ), hcn as (
    select code raw, regexp_replace(code,'[^0-9]','','g') d from hs_codes
  ), dln as (
    select distinct l->>'tariff_hs' raw, regexp_replace(l->>'tariff_hs','[^0-9]','','g') d
      from customs_declaration, jsonb_array_elements(lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
  )
  select 'doc_bot' src, count(*) n, count(distinct d) uniq,
         min(length(d)) minlen, max(length(d)) maxlen from dbn
  union all select 'hs_codes', count(*), count(distinct d), min(length(d)), max(length(d)) from hcn
  union all select 'ใบขน', count(*), count(distinct d), min(length(d)), max(length(d)) from dln
`);
console.log("\n--- digits-only lengths per source ---");
for (const r of probe.rows)
  console.log(`  ${String(r.src).padEnd(10)} rows=${r.n} distinct=${r.uniq} len ${r.minlen}..${r.maxlen}`);

// is the ใบขน 12-digit ALWAYS zero-padded to >=4? (decides right(8) safety)
const pad = await c.query(`
  with dln as (select distinct regexp_replace(l->>'tariff_hs','[^0-9]','','g') d
                 from customs_declaration, jsonb_array_elements(lines) l
                where l->>'tariff_hs' is not null and l->>'tariff_hs'<>'')
  select count(*) total,
         count(*) filter (where left(d,4)='0000') pad4,
         count(*) filter (where left(d,3)='000' and left(d,4)<>'0000') pad3_only,
         count(*) filter (where left(d,2)='00'  and left(d,3)<>'000') pad2_only,
         count(*) filter (where left(d,1)='0'   and left(d,2)<>'00') pad1_only,
         count(*) filter (where left(d,1)<>'0') pad0
    from dln`);
console.log(`\n--- ใบขน 12-digit leading-zero padding ---\n  ${JSON.stringify(pad.rows[0])}`);

// hs_codes dotted: what is the LAST group? (decides left(8) safety)
const lastGrp = await c.query(`
  select (regexp_split_to_array(code,'\\.'))[array_length(regexp_split_to_array(code,'\\.'),1)] last_grp,
         array_length(regexp_split_to_array(code,'\\.'),1) groups,
         count(*) n
    from hs_codes group by 1,2 order by n desc limit 12`);
console.log("\n--- hs_codes dotted: last group / #groups ---");
for (const r of lastGrp.rows) console.log(`  groups=${r.groups} last="${r.last_grp}" → ${r.n}`);

// try several normalisers, count the join hit-rate against doc_bot
// NOTE: %%C%% = the column placeholder (must NOT collide with regexp_replace's letters)
const rules = {
  "digits-only (full)": `regexp_replace(%%C%%,'[^0-9]','','g')`,
  "digits, strip leading zeros": `ltrim(regexp_replace(%%C%%,'[^0-9]','','g'),'0')`,
  "HS8: right8 if len>8 else pad-right to 8": `rpad(case when length(regexp_replace(%%C%%,'[^0-9]','','g'))>8 then right(regexp_replace(%%C%%,'[^0-9]','','g'),8) else regexp_replace(%%C%%,'[^0-9]','','g') end,8,'0')`,
  "HS8: left8 of digits, pad-right 8": `rpad(left(regexp_replace(%%C%%,'[^0-9]','','g'),8),8,'0')`,
  "HS8 hybrid: ltrim0-to-8 then rpad8": `rpad(case when length(regexp_replace(%%C%%,'[^0-9]','','g'))>8 then right(regexp_replace(%%C%%,'[^0-9]','','g'),8) else left(regexp_replace(%%C%%,'[^0-9]','','g'),8) end,8,'0')`,
  "HS6 prefix (heading)": `left(rpad(case when length(regexp_replace(%%C%%,'[^0-9]','','g'))>8 then right(regexp_replace(%%C%%,'[^0-9]','','g'),8) else regexp_replace(%%C%%,'[^0-9]','','g') end,8,'0'),6)`,
};
const sub = (expr, col) => expr.split("%%C%%").join(col);
for (const [label, expr] of Object.entries(rules)) {
  const q = `
    with dbn as (select distinct ${sub(expr, "hs_code")} k from doc_bot_hs_codes where hs_code is not null and hs_code<>'' and regexp_replace(hs_code,'[^0-9]','','g')<>''),
         hcn as (select distinct ${sub(expr, "code")} k from hs_codes),
         dln as (select distinct ${sub(expr, "(l->>'tariff_hs')")} k
                   from customs_declaration, jsonb_array_elements(lines) l
                  where l->>'tariff_hs' is not null and l->>'tariff_hs'<>'')
    select (select count(*) from dbn) db, (select count(*) from hcn) hc, (select count(*) from dln) dl,
           (select count(*) from hcn join dbn using(k)) hc_in_db,
           (select count(*) from dln join dbn using(k)) dl_in_db,
           (select count(*) from dln join hcn using(k)) dl_in_hc`;
  const r = (await c.query(q)).rows[0];
  console.log(
    `\n  RULE "${label}"\n    distinct: db=${r.db} hc=${r.hc} ใบขน=${r.dl}\n    canonical∩docbot=${r.hc_in_db}/${r.hc}  ใบขน∩docbot=${r.dl_in_db}/${r.dl}  ใบขน∩canonical=${r.dl_in_hc}/${r.dl}`,
  );
}

// ── 2c. ★ SOURCE-AWARE normaliser (the results above say the rule must branch) ──
// ใบขน = 12-digit, 100% zero-padded-by-4 → the real HS8 is the RIGHT 8.
// hs_codes / doc_bot = dotted or bare, 6..10 digits → the real HS8 is the LEFT 8 (rpad).
H("2c. ★ SOURCE-AWARE normaliser: len12+pad4 → right(8) · else rpad(left(8),8,'0')");
const NORM = (col) => `
  rpad(
    case
      when length(regexp_replace(${col},'[^0-9]','','g')) = 12
       and left(regexp_replace(${col},'[^0-9]','','g'),4) = '0000'
        then right(regexp_replace(${col},'[^0-9]','','g'),8)
      else left(regexp_replace(${col},'[^0-9]','','g'),8)
    end, 8, '0')`;
const sa = await c.query(`
  with dbn as (select distinct ${NORM("hs_code")} k from doc_bot_hs_codes
                where hs_code is not null and hs_code<>'' and regexp_replace(hs_code,'[^0-9]','','g')<>''),
       hcn as (select distinct ${NORM("code")} k from hs_codes),
       dln as (select distinct ${NORM("(l->>'tariff_hs')")} k
                 from customs_declaration, jsonb_array_elements(lines) l
                where l->>'tariff_hs' is not null and l->>'tariff_hs'<>'')
  select (select count(*) from dbn) db, (select count(*) from hcn) hc, (select count(*) from dln) dl,
         (select count(*) from hcn join dbn using(k)) hc_in_db,
         (select count(*) from dln join dbn using(k)) dl_in_db,
         (select count(*) from dln join hcn using(k)) dl_in_hc`);
const s2 = sa.rows[0];
console.log(`  distinct HS8: doc_bot=${s2.db}  canonical=${s2.hc}  ใบขน=${s2.dl}`);
console.log(`  canonical ∩ doc_bot = ${s2.hc_in_db}/${s2.hc}`);
console.log(`  ใบขน      ∩ doc_bot = ${s2.dl_in_db}/${s2.dl}`);
console.log(`  ใบขน      ∩ canonical = ${s2.dl_in_hc}/${s2.dl}`);

// sanity: show the normaliser's output per source on real rows
const sane = await c.query(`
  (select 'ใบขน' src, (l->>'tariff_hs') raw, ${NORM("(l->>'tariff_hs')")} k
     from customs_declaration, jsonb_array_elements(lines) l
    where l->>'tariff_hs' is not null and l->>'tariff_hs'<>'' limit 4)
  union all
  (select 'hs_codes', code, ${NORM("code")} from hs_codes limit 4)
  union all
  (select 'doc_bot', hs_code, ${NORM("hs_code")} from doc_bot_hs_codes
    where hs_code is not null and hs_code<>'' and hs_code like '%.%' limit 3)
  union all
  (select 'doc_bot', hs_code, ${NORM("hs_code")} from doc_bot_hs_codes
    where hs_code ~ '^[0-9]{8}$' limit 3)`);
console.log("\n--- normaliser sanity (raw → key) ---");
for (const r of sane.rows) console.log(`  ${String(r.src).padEnd(9)} "${r.raw}" → ${r.k}`);

// ── 2b. 🔴 GRAIN — is doc_bot keyed by CODE or by PRODUCT? ────────────────
H("2b. 🔴 GRAIN CHECK — doc_bot rows vs distinct codes (duplication + duty anomaly)");
const grain = await c.query(`
  with dbn as (
    select rpad(case when length(regexp_replace(hs_code,'[^0-9]','','g'))>8
                     then right(regexp_replace(hs_code,'[^0-9]','','g'),8)
                     else regexp_replace(hs_code,'[^0-9]','','g') end,8,'0') k,
           nullif(substring(no from '[0-9]+(?:\.[0-9]+)?'),'')::numeric no_num,
           nullif(substring(fe from '[0-9]+(?:\.[0-9]+)?'),'')::numeric fe_num,
           th, en, source
      from doc_bot_hs_codes
     where hs_code is not null and hs_code<>'' and regexp_replace(hs_code,'[^0-9]','','g')<>''
  )
  select count(*) rows, count(distinct k) distinct_codes,
         round(count(*)::numeric / nullif(count(distinct k),0), 2) rows_per_code,
         (select count(*) from (select k from dbn group by k having count(distinct no_num) filter (where no_num is not null) > 1) t) codes_with_conflicting_duty,
         (select count(*) from (select k from dbn group by k having count(*) > 1) t) codes_with_multiple_rows
    from dbn`);
const g = grain.rows[0];
console.log(`  doc_bot rows (with a code)        : ${g.rows}`);
console.log(`  → distinct HS8 codes              : ${g.distinct_codes}`);
console.log(`  → avg rows per code               : ${g.rows_per_code}   ← ★ the grain`);
console.log(`  codes appearing on >1 row         : ${g.codes_with_multiple_rows}`);
console.log(`  🔴 codes whose rows DISAGREE on อากร: ${g.codes_with_conflicting_duty}`);

const anom = await c.query(`
  with dbn as (
    select rpad(case when length(regexp_replace(hs_code,'[^0-9]','','g'))>8
                     then right(regexp_replace(hs_code,'[^0-9]','','g'),8)
                     else regexp_replace(hs_code,'[^0-9]','','g') end,8,'0') k,
           hs_code raw, nullif(substring(no from '[0-9]+(?:\.[0-9]+)?'),'')::numeric no_num, th, source
      from doc_bot_hs_codes
     where hs_code is not null and hs_code<>'' and regexp_replace(hs_code,'[^0-9]','','g')<>''
  )
  select k, count(*) rows, array_agg(distinct no_num) filter (where no_num is not null) duties,
         (array_agg(th))[1:4] sample_products
    from dbn group by k
   having count(distinct no_num) filter (where no_num is not null) > 1
   order by count(*) desc limit 8`);
console.log("\n--- 🔴 same code, DIFFERENT อากร across its product rows (top 8) ---");
for (const r of anom.rows)
  console.log(`  [${r.k}] rows=${r.rows} duties=${JSON.stringify(r.duties)} products=${JSON.stringify(r.sample_products)}`);

// product-name grain: does one product map to several codes? (พิกัดหลัก/รอง)
const prod = await c.query(`
  with dbn as (
    select btrim(lower(th)) p,
           rpad(case when length(regexp_replace(hs_code,'[^0-9]','','g'))>8
                     then right(regexp_replace(hs_code,'[^0-9]','','g'),8)
                     else regexp_replace(hs_code,'[^0-9]','','g') end,8,'0') k
      from doc_bot_hs_codes
     where th is not null and btrim(th)<>'' and hs_code is not null and hs_code<>''
       and regexp_replace(hs_code,'[^0-9]','','g')<>''
  )
  select count(distinct p) distinct_products,
         (select count(*) from (select p from dbn group by p having count(distinct k)>1) t) products_with_multiple_codes
    from dbn`);
console.log(
  `\n--- product grain ---\n  distinct product names (th) : ${prod.rows[0].distinct_products}\n  🟠 products mapping to >1 code (พิกัดหลัก/รอง) : ${prod.rows[0].products_with_multiple_codes}`,
);

// ── 3. ใบขน per-code duty stability + usage ───────────────────────────────
H("3. ใบขน per-code: duty stability + usage count");

const stab = await c.query(`
  with lines as (
    select regexp_replace(l->>'tariff_hs','[^0-9]','','g') k,
           l->>'tariff_hs' raw, nullif(l->>'duty_rate','')::numeric duty,
           d.ref_no
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
  )
  select count(distinct k) codes,
         count(*) filter (where duty is null) null_duty_lines,
         (select count(*) from (select k from lines group by k having count(distinct duty)>1) t) multi_duty_codes
    from lines`);
console.log(
  `  distinct codes=${stab.rows[0].codes} · lines w/ NULL duty=${stab.rows[0].null_duty_lines} · codes with >1 distinct duty=${stab.rows[0].multi_duty_codes}`,
);

const top = await c.query(`
  with lines as (
    select regexp_replace(l->>'tariff_hs','[^0-9]','','g') k, l->>'tariff_hs' raw,
           nullif(l->>'duty_rate','')::numeric duty, l->>'desc_th' th, l->>'desc_en' en, d.ref_no
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
  ), agg as (
    select k, min(raw) raw, count(distinct ref_no) decl_count, count(*) line_count,
           count(distinct duty) duty_variants,
           (array_agg(duty order by duty))[1] min_duty, max(duty) max_duty,
           (array_agg(th) filter (where th is not null and th<>''))[1] th,
           (array_agg(en) filter (where en is not null and en<>''))[1] en
      from lines group by k
  )
  select * from agg order by decl_count desc limit 15`);
console.log("\n--- top 15 ใบขน codes by declaration usage ---");
for (const r of top.rows)
  console.log(
    `  [${r.raw}] ใบขน=${r.decl_count} lines=${r.line_count} dutyVariants=${r.duty_variants} duty ${r.min_duty}..${r.max_duty} :: ${(r.th ?? r.en ?? "").slice(0, 34)}`,
  );

const multi = await c.query(`
  with lines as (
    select regexp_replace(l->>'tariff_hs','[^0-9]','','g') k, l->>'tariff_hs' raw,
           nullif(l->>'duty_rate','')::numeric duty
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
  )
  select k, min(raw) raw, count(*) lines, array_agg(distinct duty order by duty) duties
    from lines group by k having count(distinct duty) > 1
    order by count(*) desc limit 10`);
console.log("\n--- codes whose ใบขน duty is NOT stable (top 10) ---");
if (!multi.rows.length) console.log("  (none — duty is stable per code)");
for (const r of multi.rows)
  console.log(`  [${r.raw}] lines=${r.lines} duties=${JSON.stringify(r.duties)}`);

// ── 4. OVERLAP with the chosen normaliser (digits-only) ───────────────────
H("4. OVERLAP counts (normaliser = digits-only, full)");

const ov = await c.query(`
  with dbn as (select distinct regexp_replace(hs_code,'[^0-9]','','g') k from doc_bot_hs_codes where hs_code is not null and hs_code<>''),
       hcn as (select distinct regexp_replace(code,'[^0-9]','','g') k from hs_codes),
       dln as (select distinct regexp_replace(l->>'tariff_hs','[^0-9]','','g') k
                 from customs_declaration, jsonb_array_elements(lines) l
                where l->>'tariff_hs' is not null and l->>'tariff_hs'<>'')
  select
    (select count(*) from hcn) canonical_total,
    (select count(*) from hcn where k in (select k from dbn)) canonical_in_docbot,
    (select count(*) from hcn where k not in (select k from dbn)) canonical_new_to_docbot,
    (select count(*) from dln) decl_total,
    (select count(*) from dln where k in (select k from dbn)) decl_in_docbot,
    (select count(*) from dln where k in (select k from hcn)) decl_in_canonical,
    (select count(*) from dln where k not in (select k from dbn) and k not in (select k from hcn)) decl_brand_new,
    (select count(*) from dbn) docbot_total
`);
const o = ov.rows[0];
console.log(`  doc_bot distinct codes         : ${o.docbot_total}`);
console.log(`  canonical hs_codes total       : ${o.canonical_total}`);
console.log(`    ├─ already in doc_bot        : ${o.canonical_in_docbot}`);
console.log(`    └─ NEW to doc_bot (insert)   : ${o.canonical_new_to_docbot}`);
console.log(`  ใบขน distinct codes            : ${o.decl_total}`);
console.log(`    ├─ in doc_bot                : ${o.decl_in_docbot}`);
console.log(`    ├─ in canonical              : ${o.decl_in_canonical}`);
console.log(`    └─ BRAND NEW (insert)        : ${o.decl_brand_new}`);

// ── 5. CONFLICTS canonical duty vs ใบขน-observed ──────────────────────────
H("5. CONFLICTS — canonical duty ≠ ใบขน-observed duty (top 10 by usage)");

const conf = await c.query(`
  with lines as (
    select regexp_replace(l->>'tariff_hs','[^0-9]','','g') k,
           nullif(l->>'duty_rate','')::numeric duty, d.ref_no
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
  ), modal as (
    select k, duty, count(distinct ref_no) n,
           row_number() over (partition by k order by count(*) desc, duty) rn,
           sum(count(distinct ref_no)) over (partition by k) total_decl
      from lines where duty is not null group by k, duty
  ), obs as (select k, duty obs_duty, total_decl from modal where rn=1),
     can as (select regexp_replace(code,'[^0-9]','','g') k, code, default_duty_pct, form_e_duty_pct, description from hs_codes)
  select can.code, can.default_duty_pct, can.form_e_duty_pct, obs.obs_duty, obs.total_decl, can.description
    from can join obs using(k)
   where can.default_duty_pct is distinct from obs.obs_duty
   order by obs.total_decl desc limit 10`);
console.log(`  conflicting codes shown: ${conf.rows.length}`);
for (const r of conf.rows)
  console.log(
    `  [${r.code}] canonical=${r.default_duty_pct}% (FE ${r.form_e_duty_pct}%) vs ใบขน-observed=${r.obs_duty}% · ${r.total_decl} ใบขน :: ${(r.description ?? "").slice(0, 30)}`,
  );

// ── 6. doc_bot duty columns — how parseable are `no` / `fe`? ──────────────
H("6. doc_bot `no` (อากรปกติ) / `fe` (Form-E) / `stat` — fill + parseability");
const dq = await c.query(`
  select
    count(*) total,
    count(*) filter (where hs_code is null or hs_code='') no_code,
    count(*) filter (where no is not null and no<>'') has_no,
    count(*) filter (where fe is not null and fe<>'') has_fe,
    count(*) filter (where stat is not null and stat<>'') has_stat,
    count(*) filter (where note is not null and note<>'') has_note,
    count(*) filter (where th is not null and th<>'') has_th,
    count(*) filter (where en is not null and en<>'') has_en
  from doc_bot_hs_codes`);
console.log(`  ${JSON.stringify(dq.rows[0], null, 2)}`);

const noSamp = await c.query(
  `select no, count(*) n from doc_bot_hs_codes where no is not null and no<>'' group by no order by n desc limit 15`,
);
console.log("\n--- distinct `no` (อากรปกติ) values, top 15 ---");
for (const r of noSamp.rows) console.log(`  "${r.no}" → ${r.n}`);
const feSamp = await c.query(
  `select fe, count(*) n from doc_bot_hs_codes where fe is not null and fe<>'' group by fe order by n desc limit 15`,
);
console.log("\n--- distinct `fe` (Form-E) values, top 15 ---");
for (const r of feSamp.rows) console.log(`  "${r.fe}" → ${r.n}`);
const statSamp = await c.query(
  `select stat, count(*) n from doc_bot_hs_codes where stat is not null and stat<>'' group by stat order by n desc limit 10`,
);
console.log("\n--- distinct `stat` values, top 10 ---");
for (const r of statSamp.rows) console.log(`  "${r.stat}" → ${r.n}`);

// ── 7. dup groups inside doc_bot (พิกัดหลัก/รอง) ──────────────────────────
H("7. doc_bot duplicate groups (same normalised code, multiple rows)");
const dup = await c.query(`
  with dbn as (select regexp_replace(hs_code,'[^0-9]','','g') k, * from doc_bot_hs_codes where hs_code is not null and hs_code<>'')
  select count(*) filter (where n>1) dup_groups, sum(n) filter (where n>1) dup_rows
    from (select k, count(*) n from dbn group by k) t`);
console.log(`  ${JSON.stringify(dup.rows[0])}`);
const dupEx = await c.query(`
  with dbn as (select regexp_replace(hs_code,'[^0-9]','','g') k, * from doc_bot_hs_codes where hs_code is not null and hs_code<>'')
  select k, count(*) n, array_agg(distinct source) srcs, (array_agg(th))[1] th
    from dbn group by k having count(*)>1 order by n desc limit 8`);
for (const r of dupEx.rows)
  console.log(`  [${r.k}] rows=${r.n} sources=${JSON.stringify(r.srcs)} :: ${(r.th ?? "").slice(0, 30)}`);

// ── 8. overrides ──────────────────────────────────────────────────────────
H("8. doc_bot_hs_overrides");
const ovr = await c.query(`select * from doc_bot_hs_overrides order by created_at nulls last limit 20`);
console.log(`  rows=${ovr.rows.length}`);
for (const r of ovr.rows)
  console.log(`  kw="${r.keyword}" → ${r.correct_hs} note=${r.note ?? "-"} user=${r.user_id ?? "-"}`);

await c.end();
console.log("\n✅ AUDIT-A read-only complete — no writes.\n");
