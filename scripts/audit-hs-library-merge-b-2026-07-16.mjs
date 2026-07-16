// AUDIT-A part B — the two things part A surfaced that change the merge design:
//   (i)  ใบขน `priv` splits NORMAL duty from Form-E/ACFTA duty (the "214 unstable codes"
//        are probably not unstable at all — they're 000 vs ACN).
//   (ii) doc_bot `no` mixes PERCENT (10) and FRACTION (0.1) and garbage (1668) →
//        a naive merge would serve 0.1% where the truth is 10% = a 100× under-declare.
// READ-ONLY. No writes.
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
const NORM = (col) => `
  rpad(case when length(regexp_replace(${col},'[^0-9]','','g')) = 12
             and left(regexp_replace(${col},'[^0-9]','','g'),4) = '0000'
              then right(regexp_replace(${col},'[^0-9]','','g'),8)
            else left(regexp_replace(${col},'[^0-9]','','g'),8) end, 8, '0')`;

await c.connect();

// ── (i) priv ──────────────────────────────────────────────────────────────
H("B1. ใบขน `priv` — what are the values? (does it split normal vs Form-E?)");
const priv = await c.query(`
  select coalesce(nullif(l->>'priv',''),'(empty)') priv, count(*) lines,
         count(distinct ${NORM("(l->>'tariff_hs')")}) codes,
         round(avg(nullif(l->>'duty_rate','')::numeric),3) avg_duty,
         count(*) filter (where nullif(l->>'duty_rate','')::numeric = 0) zero_duty_lines
    from customs_declaration, jsonb_array_elements(lines) l
   where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
   group by 1 order by lines desc`);
for (const r of priv.rows)
  console.log(
    `  priv="${r.priv}".padEnd → lines=${r.lines} codes=${r.codes} avgDuty=${r.avg_duty} zeroDutyLines=${r.zero_duty_lines}`,
  );

H("B2. Is duty STABLE once split by priv? (the 214 'unstable' codes re-checked)");
const stab = await c.query(`
  with lines as (
    select ${NORM("(l->>'tariff_hs')")} k, coalesce(nullif(l->>'priv',''),'(empty)') priv,
           nullif(l->>'duty_rate','')::numeric duty
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
  )
  select
    (select count(*) from (select k from lines group by k having count(distinct duty)>1) t) unstable_ignoring_priv,
    (select count(*) from (select k,priv from lines group by k,priv having count(distinct duty)>1) t) unstable_within_priv,
    (select count(distinct k) from lines) total_codes,
    (select count(distinct k) from lines where priv='000') codes_with_normal,
    (select count(distinct k) from lines where priv='ACN') codes_with_acn`);
const s = stab.rows[0];
console.log(`  total distinct codes                    : ${s.total_codes}`);
console.log(`  codes with a priv='000' (normal) line    : ${s.codes_with_normal}`);
console.log(`  codes with a priv='ACN' (Form-E) line    : ${s.codes_with_acn}`);
console.log(`  ⚠ codes 'unstable' when priv IGNORED     : ${s.unstable_ignoring_priv}`);
console.log(`  ★ codes still unstable WITHIN a priv      : ${s.unstable_within_priv}   ← the real instability`);

H("B3. per-code NORMAL (priv=000) vs Form-E (priv=ACN) observed duty — top 12");
const split = await c.query(`
  with lines as (
    select ${NORM("(l->>'tariff_hs')")} k, coalesce(nullif(l->>'priv',''),'(empty)') priv,
           nullif(l->>'duty_rate','')::numeric duty, d.ref_no,
           nullif(l->>'desc_th','') th, nullif(l->>'desc_en','') en
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
  ), modal as (
    select k, priv, duty, count(*) n,
           row_number() over (partition by k,priv order by count(*) desc, duty desc) rn
      from lines where duty is not null group by k,priv,duty
  ), usage as (select k, count(distinct ref_no) decl_count from lines group by k),
     nm as (select k, duty from modal where priv='000' and rn=1),
     ac as (select k, duty from modal where priv='ACN' and rn=1),
     ds as (select k, (array_agg(th) filter (where th is not null))[1] th from lines group by k)
  select u.k, u.decl_count, nm.duty normal_duty, ac.duty acn_duty, ds.th
    from usage u left join nm using(k) left join ac using(k) left join ds using(k)
   order by u.decl_count desc limit 12`);
console.log("  code      ใบขน  อากรปกติ(000)  Form-E(ACN)  product");
for (const r of split.rows)
  console.log(
    `  ${r.k}  ${String(r.decl_count).padStart(4)}   ${String(r.normal_duty ?? "-").padStart(8)}%   ${String(r.acn_duty ?? "-").padStart(8)}%   ${(r.th ?? "").slice(0, 28)}`,
  );

H("B4. codes STILL unstable within priv='000' (top 8) — is the modal safe?");
const unst = await c.query(`
  with lines as (
    select ${NORM("(l->>'tariff_hs')")} k, nullif(l->>'duty_rate','')::numeric duty, d.ref_no
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>'' and coalesce(nullif(l->>'priv',''),'')='000'
  )
  select k, count(*) lines, array_agg(distinct duty order by duty) duties
    from lines group by k having count(distinct duty)>1 order by count(*) desc limit 8`);
if (!unst.rows.length) console.log("  (none — priv='000' duty is perfectly stable per code)");
for (const r of unst.rows) console.log(`  [${r.k}] lines=${r.lines} duties=${JSON.stringify(r.duties)}`);

// ── (ii) doc_bot duty unit chaos ──────────────────────────────────────────
H("B5. 🔴 doc_bot `no` (อากรปกติ) UNIT CHAOS — percent vs fraction vs garbage");
const unit = await c.query(`
  with p as (
    select nullif(substring(no from '[0-9]+(?:\\.[0-9]+)?'),'')::numeric v, no raw
      from doc_bot_hs_codes where no is not null and no<>''
  )
  select count(*) parsed,
         count(*) filter (where v > 0 and v < 1)   fraction_encoded,
         count(*) filter (where v = 0)             zero,
         count(*) filter (where v >= 1 and v <= 100) percent_range,
         count(*) filter (where v > 100)           garbage_over_100
    from p`);
console.log(`  ${JSON.stringify(unit.rows[0], null, 2)}`);
const frac = await c.query(`
  select no, count(*) n from doc_bot_hs_codes
   where nullif(substring(no from '[0-9]+(?:\\.[0-9]+)?'),'')::numeric > 0
     and nullif(substring(no from '[0-9]+(?:\\.[0-9]+)?'),'')::numeric < 1
   group by no order by n desc limit 10`);
console.log("\n--- FRACTION-encoded `no` values (0.1 = 10%?) ---");
for (const r of frac.rows) console.log(`  "${r.no}" → ${r.n} rows`);
const over = await c.query(`
  select no, count(*) n from doc_bot_hs_codes
   where nullif(substring(no from '[0-9]+(?:\\.[0-9]+)?'),'')::numeric > 100
   group by no order by n desc limit 10`);
console.log("\n--- GARBAGE `no` values (>100%) ---");
for (const r of over.rows) console.log(`  "${r.no}" → ${r.n} rows`);
const rawNo = await c.query(`
  select no, count(*) n from doc_bot_hs_codes
   where no is not null and no<>'' and substring(no from '[0-9]+(?:\\.[0-9]+)?') is null
   group by no order by n desc limit 10`);
console.log("\n--- NON-NUMERIC `no` values (unparseable) ---");
for (const r of rawNo.rows) console.log(`  "${r.no}" → ${r.n} rows`);

H("B6. 🔴 Does doc_bot `no` AGREE with the ใบขน-observed normal duty? (the trust test)");
const agree = await c.query(`
  with dbn as (
    select ${NORM("hs_code")} k,
           nullif(substring(no from '[0-9]+(?:\\.[0-9]+)?'),'')::numeric v
      from doc_bot_hs_codes
     where hs_code is not null and hs_code<>'' and regexp_replace(hs_code,'[^0-9]','','g')<>''
       and no is not null and no<>''
  ), dbm as (   -- modal doc_bot duty per code
    select k, v, row_number() over (partition by k order by count(*) desc, v desc) rn
      from dbn where v is not null group by k, v
  ), db1 as (select k, v db_duty from dbm where rn=1),
  lines as (
    select ${NORM("(l->>'tariff_hs')")} k, nullif(l->>'duty_rate','')::numeric duty, d.ref_no
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>'' and coalesce(nullif(l->>'priv',''),'')='000'
  ), dlm as (
    select k, duty, row_number() over (partition by k order by count(*) desc, duty desc) rn,
           sum(count(distinct ref_no)) over (partition by k) decl_count
      from lines where duty is not null group by k, duty
  ), dl1 as (select k, duty decl_duty, decl_count from dlm where rn=1)
  select count(*) compared,
         count(*) filter (where db_duty = decl_duty) agree,
         count(*) filter (where db_duty <> decl_duty) disagree,
         count(*) filter (where db_duty < 1 and db_duty > 0 and decl_duty = db_duty*100) fraction_off_by_100x
    from db1 join dl1 using(k)`);
console.log(`  ${JSON.stringify(agree.rows[0], null, 2)}`);

const disag = await c.query(`
  with dbn as (
    select ${NORM("hs_code")} k, nullif(substring(no from '[0-9]+(?:\\.[0-9]+)?'),'')::numeric v, th
      from doc_bot_hs_codes
     where hs_code is not null and hs_code<>'' and regexp_replace(hs_code,'[^0-9]','','g')<>''
       and no is not null and no<>''
  ), dbm as (select k, v, (array_agg(th))[1] th, row_number() over (partition by k order by count(*) desc, v desc) rn
               from dbn where v is not null group by k, v),
     db1 as (select k, v db_duty, th from dbm where rn=1),
  lines as (
    select ${NORM("(l->>'tariff_hs')")} k, nullif(l->>'duty_rate','')::numeric duty, d.ref_no
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>'' and coalesce(nullif(l->>'priv',''),'')='000'
  ), dlm as (select k, duty, row_number() over (partition by k order by count(*) desc, duty desc) rn,
                    sum(count(distinct ref_no)) over (partition by k) decl_count
               from lines where duty is not null group by k, duty),
     dl1 as (select k, duty decl_duty, decl_count from dlm where rn=1)
  select k, db_duty, decl_duty, decl_count, th from db1 join dl1 using(k)
   where db_duty <> decl_duty order by decl_count desc limit 12`);
console.log("\n--- doc_bot duty ≠ ใบขน-observed normal duty (top 12 by usage) ---");
console.log("  code       docbot   ใบขน    ใบขนN  product");
for (const r of disag.rows)
  console.log(
    `  ${r.k}  ${String(r.db_duty).padStart(7)}% ${String(r.decl_duty).padStart(6)}%  ${String(r.decl_count).padStart(4)}  ${(r.th ?? "").slice(0, 26)}`,
  );

H("B7. canonical hs_codes duty vs ใบขน-observed normal duty (source-aware norm)");
const conf = await c.query(`
  with can as (select ${NORM("code")} k, code, default_duty_pct, form_e_duty_pct, description from hs_codes),
  lines as (
    select ${NORM("(l->>'tariff_hs')")} k, nullif(l->>'duty_rate','')::numeric duty,
           coalesce(nullif(l->>'priv',''),'') priv, d.ref_no
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
  ), dlm as (select k, duty, row_number() over (partition by k order by count(*) desc, duty desc) rn,
                    sum(count(distinct ref_no)) over (partition by k) decl_count
               from lines where duty is not null and priv='000' group by k, duty),
     dl1 as (select k, duty decl_duty, decl_count from dlm where rn=1)
  select can.code, can.default_duty_pct, can.form_e_duty_pct, dl1.decl_duty, dl1.decl_count, can.description
    from can join dl1 using(k)
   where can.default_duty_pct is distinct from dl1.decl_duty
   order by dl1.decl_count desc limit 12`);
console.log(`  conflicting canonical codes: ${conf.rows.length}`);
console.log("  code             canon   ใบขน   ใบขนN  desc");
for (const r of conf.rows)
  console.log(
    `  ${String(r.code).padEnd(14)} ${String(r.default_duty_pct).padStart(6)}% ${String(r.decl_duty).padStart(5)}%  ${String(r.decl_count).padStart(4)}  ${(r.description ?? "").slice(0, 26)}`,
  );

H("B8. FINAL merge counts (source-aware normaliser)");
const fin = await c.query(`
  with dbn as (select distinct ${NORM("hs_code")} k from doc_bot_hs_codes
                where hs_code is not null and hs_code<>'' and regexp_replace(hs_code,'[^0-9]','','g')<>''),
       hcn as (select distinct ${NORM("code")} k from hs_codes),
       dln as (select distinct ${NORM("(l->>'tariff_hs')")} k
                 from customs_declaration, jsonb_array_elements(lines) l
                where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''),
       allk as (select k from dbn union select k from hcn union select k from dln)
  select (select count(*) from dbn) docbot,
         (select count(*) from hcn) canonical,
         (select count(*) from dln) decl,
         (select count(*) from hcn where k not in (select k from dbn)) canonical_new,
         (select count(*) from dln where k not in (select k from dbn)) decl_new_vs_docbot,
         (select count(*) from dln where k not in (select k from dbn) and k not in (select k from hcn)) decl_brand_new,
         (select count(*) from allk) unified_total`);
const f = fin.rows[0];
console.log(`  doc_bot distinct HS8            : ${f.docbot}`);
console.log(`  canonical distinct HS8          : ${f.canonical}   (new to doc_bot: ${f.canonical_new})`);
console.log(`  ใบขน distinct HS8               : ${f.decl}   (new to doc_bot: ${f.decl_new_vs_docbot} · brand-new to both: ${f.decl_brand_new})`);
console.log(`  ★ UNIFIED library size (HS8)    : ${f.unified_total}`);

await c.end();
console.log("\n✅ AUDIT-A part B read-only complete — no writes.\n");
