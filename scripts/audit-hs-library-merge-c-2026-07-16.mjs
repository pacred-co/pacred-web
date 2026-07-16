// AUDIT-A part C — the last two questions the merge design hinges on:
//   (i)  the 9 canonical-vs-ใบขน conflicts: are they the mig-0030 DUMMY seed (9 demo rows)
//        or the mig-0224 CURATED Doc-team codes? ("canonical wins" is only right for curated.)
//   (ii) does doc_bot carry per-PRODUCT info (fe/stat/note) that varies within one code?
//        → decides whether product rows can collapse into a code-grain library losslessly.
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

// the 9 dummy codes seeded by mig 0030 (verbatim from the migration file)
const SEED0030 = ["8517.12.00","8504.40.90","6109.10.00","6204.62.00","9503.00.99","3924.10.00","6403.99.00","8473.30.20","9999.99.99"];

H("C1. canonical hs_codes provenance — mig-0030 DUMMY seed vs mig-0224 CURATED");
const prov = await c.query(
  `select count(*) total,
          count(*) filter (where code = any($1)) dummy_0030,
          count(*) filter (where code <> all($1)) curated_0224,
          count(*) filter (where code = any($1) and default_duty_pct > 0) dummy_with_duty
     from hs_codes`, [SEED0030]);
console.log(`  ${JSON.stringify(prov.rows[0], null, 2)}`);
const dummies = await c.query(
  `select code, description, default_duty_pct, created_at::date d from hs_codes where code = any($1) order by code`, [SEED0030]);
console.log("\n--- the mig-0030 demo-seed rows (duty = a PLACEHOLDER guess, not curated) ---");
for (const r of dummies.rows)
  console.log(`  [${r.code}] duty=${r.default_duty_pct}% created=${r.d} :: ${(r.description ?? "").slice(0, 40)}`);

H("C2. → are the 9 canonical-vs-ใบขน conflicts DUMMY or CURATED?");
const conf = await c.query(`
  with can as (select ${NORM("code")} k, code, default_duty_pct, description from hs_codes),
  lines as (
    select ${NORM("(l->>'tariff_hs')")} k, nullif(l->>'duty_rate','')::numeric duty,
           coalesce(nullif(l->>'priv',''),'') priv, d.ref_no
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
  ), dlm as (select k, duty, row_number() over (partition by k order by count(*) desc, duty desc) rn,
                    sum(count(distinct ref_no)) over (partition by k) decl_count
               from lines where duty is not null and priv='000' group by k, duty),
     dl1 as (select k, duty decl_duty, decl_count from dlm where rn=1)
  select can.code, (can.code = any($1)) is_dummy_seed, can.default_duty_pct, dl1.decl_duty, dl1.decl_count, can.description
    from can join dl1 using(k)
   where can.default_duty_pct is distinct from dl1.decl_duty
   order by dl1.decl_count desc`, [SEED0030]);
console.log("  code            seed?   canon   ใบขน   ใบขนN  desc");
for (const r of conf.rows)
  console.log(
    `  ${String(r.code).padEnd(14)} ${r.is_dummy_seed ? "DUMMY" : "curated"} ${String(r.default_duty_pct).padStart(6)}% ${String(r.decl_duty).padStart(5)}%  ${String(r.decl_count).padStart(4)}  ${(r.description ?? "").slice(0, 24)}`,
  );
const nDummy = conf.rows.filter((r) => r.is_dummy_seed).length;
console.log(`\n  → ${nDummy}/${conf.rows.length} conflicts are the mig-0030 DUMMY seed (canonical is NOT authoritative there)`);
console.log(`  → ${conf.rows.length - nDummy}/${conf.rows.length} are CURATED (real 'canonical wins' cases · owner/Doc must arbitrate)`);

H("C3. does doc_bot carry per-PRODUCT variance inside one code? (lossless-collapse test)");
const varr = await c.query(`
  with dbn as (
    select ${NORM("hs_code")} k, th, en,
           nullif(btrim(fe),'') fe, nullif(btrim(stat),'') stat, nullif(btrim(note),'') note, source
      from doc_bot_hs_codes
     where hs_code is not null and hs_code<>'' and regexp_replace(hs_code,'[^0-9]','','g')<>''
  )
  select count(distinct k) codes,
         (select count(*) from (select k from dbn group by k having count(distinct fe)   > 1) t) codes_fe_varies,
         (select count(*) from (select k from dbn group by k having count(distinct stat) > 1) t) codes_stat_varies,
         (select count(*) from (select k from dbn group by k having count(distinct note) > 1) t) codes_note_varies,
         (select count(*) from (select k from dbn group by k having count(distinct th)   > 1) t) codes_multi_product,
         (select count(*) from dbn where note is not null) rows_with_note
    from dbn`);
console.log(`  ${JSON.stringify(varr.rows[0], null, 2)}`);

const noteEx = await c.query(`
  with dbn as (
    select ${NORM("hs_code")} k, th, nullif(btrim(note),'') note from doc_bot_hs_codes
     where hs_code is not null and hs_code<>'' and regexp_replace(hs_code,'[^0-9]','','g')<>''
  )
  select k, count(*) rows, count(distinct note) notes,
         (array_agg(distinct note) filter (where note is not null))[1:3] sample_notes
    from dbn group by k having count(distinct note) > 1 order by count(distinct note) desc limit 6`);
console.log("\n--- codes where the per-product NOTE differs (product-level knowledge = real) ---");
for (const r of noteEx.rows)
  console.log(`  [${r.k}] rows=${r.rows} distinctNotes=${r.notes} :: ${JSON.stringify(r.sample_notes)}`);

H("C4. doc_bot rows with NO usable code (they'd be dropped by a code-keyed library)");
const noCode = await c.query(`
  select count(*) total,
         count(*) filter (where hs_code is null or btrim(hs_code)='') null_or_blank,
         count(*) filter (where hs_code is not null and hs_code<>'' and regexp_replace(hs_code,'[^0-9]','','g')='') non_numeric
    from doc_bot_hs_codes`);
console.log(`  ${JSON.stringify(noCode.rows[0], null, 2)}`);
const noCodeEx = await c.query(`
  select hs_code, th, en, source from doc_bot_hs_codes
   where hs_code is null or btrim(hs_code)='' or regexp_replace(hs_code,'[^0-9]','','g')=''
   limit 8`);
console.log("\n--- sample rows with no usable code (must NOT be lost) ---");
for (const r of noCodeEx.rows)
  console.log(`  code="${r.hs_code ?? "(null)"}" src=${r.source} th=${(r.th ?? "").slice(0, 32)} en=${(r.en ?? "").slice(0, 20)}`);

H("C5. fill-rate of the ใบขน TH/EN desc (can it fill doc_bot's empty th/en?)");
const fill = await c.query(`
  with lines as (
    select ${NORM("(l->>'tariff_hs')")} k, nullif(btrim(l->>'desc_th'),'') th, nullif(btrim(l->>'desc_en'),'') en
      from customs_declaration d, jsonb_array_elements(d.lines) l
     where l->>'tariff_hs' is not null and l->>'tariff_hs'<>''
  )
  select count(*) lines, count(*) filter (where th is not null) with_th,
         count(*) filter (where en is not null) with_en,
         count(distinct k) codes,
         (select count(*) from (select k from lines group by k having count(*) filter (where th is not null)>0) t) codes_with_any_th
    from lines`);
console.log(`  ${JSON.stringify(fill.rows[0], null, 2)}`);

await c.end();
console.log("\n✅ AUDIT-A part C read-only complete — no writes.\n");
