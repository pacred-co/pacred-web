#!/usr/bin/env node
/**
 * audit-migrations-applied.mjs — the "งานน้องหาย?" guard.
 *
 * THE RECURRING FRICTION (owner 2026-07-03): a teammate adds a migration FILE +
 * a feature that reads its columns, the file gets merged, but the migration is
 * never APPLIED to the prod/dev database → the feature silently no-ops ("ของหาย").
 * `ls supabase/migrations | tail` only proves the FILE exists, not that the DB
 * has the objects.
 *
 * This script parses every migration for the objects it creates (tables /
 * triggers / functions / added columns) and checks they actually exist in BOTH
 * prod AND dev — so an unapplied teammate migration is caught at integration
 * time, not by an angry teammate.
 *
 * RUN (read-only · needs the two DB passwords in env · NEVER hardcode them):
 *   PROD_PW='<prod>' DEV_PW='<dev>' node scripts/audit-migrations-applied.mjs
 *
 * A migration whose objects are all present on both = applied. A ⚠ row = a real
 * gap to investigate (unapplied, OR a later migration renamed/dropped the object
 * — verify before applying). prod≠dev = drift to reconcile.
 */
import pg from "pg";
import fs from "fs";

const DIR = "supabase/migrations";
// SQL keywords the crude regex can accidentally capture as an "object name".
const NOISE = new Set(["if", "not", "exists", "is", "by", "are", "or", "and", "on", "as", "to", "the", "a"]);

// one regex per object kind, run over the "if not exists"/"or replace"-stripped text
function parse(sql) {
  const clean = sql.replace(/if\s+not\s+exists/gi, " ").replace(/or\s+replace/gi, " ");
  const grab = (re) => [...new Set([...clean.matchAll(re)].map((m) => m[1].toLowerCase()).filter((n) => n && !NOISE.has(n)))];
  return {
    tables: grab(/create\s+table\s+(?:public\.)?["']?(\w+)/gi),
    trigs: grab(/create\s+trigger\s+["']?(\w+)/gi),
    fns: grab(/create\s+function\s+(?:public\.)?["']?(\w+)/gi),
    cols: [...new Set(
      [...clean.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?["']?(\w+)["']?\s+add\s+column\s+["']?(\w+)/gi)]
        .map((m) => `${m[1].toLowerCase()}.${m[2].toLowerCase()}`),
    )],
  };
}

async function snapshot(ref, pw) {
  const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}`, database: "postgres", password: pw, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const one = async (sql) => new Set((await c.query(sql)).rows.map((r) => r.n));
  const snap = {
    tables: await one("SELECT lower(table_name) n FROM information_schema.tables WHERE table_schema='public'"),
    trigs: await one("SELECT lower(tgname) n FROM pg_trigger WHERE NOT tgisinternal"),
    fns: await one("SELECT lower(p.proname) n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public'"),
    cols: await one("SELECT lower(table_name)||'.'||lower(column_name) n FROM information_schema.columns WHERE table_schema='public'"),
  };
  await c.end();
  return snap;
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const parsed = files.map((f) => ({ f, ...parse(fs.readFileSync(`${DIR}/${f}`, "utf8")) }));

const targets = [
  ["PROD", "yzljakczhwrpbxflnmco", process.env.PROD_PW],
  ["DEV", "lozntlidlqqzzcaathnm", process.env.DEV_PW],
].filter((t) => t[2]);

if (targets.length === 0) {
  console.error("Set PROD_PW and/or DEV_PW in env (read-only DB check). Aborting.");
  process.exit(1);
}

let anyGap = false;
for (const [label, ref, pw] of targets) {
  const s = await snapshot(ref, pw);
  console.log(`\n===== ${label} (tables=${s.tables.size} triggers=${s.trigs.size} funcs=${s.fns.size}) =====`);
  let gaps = 0;
  for (const p of parsed) {
    const miss = {
      tables: p.tables.filter((x) => !s.tables.has(x)),
      triggers: p.trigs.filter((x) => !s.trigs.has(x)),
      funcs: p.fns.filter((x) => !s.fns.has(x)),
      cols: p.cols.filter((x) => !s.cols.has(x)),
    };
    const total = miss.tables.length + miss.triggers.length + miss.funcs.length + miss.cols.length;
    if (total) {
      gaps++; anyGap = true;
      console.log(`⚠ ${p.f}`);
      for (const k of ["tables", "triggers", "funcs", "cols"]) if (miss[k].length) console.log(`    ${k}: ${miss[k].join(", ")}`);
    }
  }
  console.log(`${label}: ${gaps} migration(s) with missing objects (of ${parsed.length}).`);
}
console.log(anyGap ? "\n⚠ Investigate each ⚠ (unapplied, or a later migration renamed/dropped the object — verify from source before applying)." : "\n✓ All migration objects present on all checked DBs.");
