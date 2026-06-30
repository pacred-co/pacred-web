/**
 * Capture ALL extra freight-customer data (เมล · เบอร์สำรอง/ติดต่อ · เลขนิติ/บัตรปชช./passport ·
 * LINE/FB · ที่อยู่ · หมายเหตุชีต) into each imported customer (owner 2026-07-01).
 * Put it in the admin note (tb_users.userNote) + fill empty proper fields (userEmail/userLineIDOA).
 *   - CREATED (251): overwrite userNote with the rich note.
 *   - LINKED (118 existing): APPEND a `|| FREIGHT[..]` segment (never overwrite their data).
 * Idempotent: strips any prior `|| FREIGHT[` segment before re-appending.
 *   DRY-RUN: node --env-file=.env.local scripts/freight-customer-capture-notes-2026-07-01.mjs
 *   APPLY:   node ... --apply
 */
import pg from "pg"; import fs from "fs";
const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const P = process.env.SUPABASE_DB_PASSWORD, REF = "yzljakczhwrpbxflnmco";
const SC = "/private/tmp/claude-501/-Users-dev-pacred-web--claude-worktrees-gifted-snyder-0a9cca/5af1ab1d-4a08-4ef2-a641-b90fc347ad66/scratchpad";
const full = JSON.parse(fs.readFileSync(`${SC}/freight-customers-full.json`, "utf8"));
const fin = JSON.parse(fs.readFileSync(`${SC}/freight-customer-final.json`, "utf8"));

const normPhone = (p) => { let d = (p || "").replace(/\D/g, ""); if (d.startsWith("66") && d.length > 9) d = "0" + d.slice(2); return d.length >= 9 && d.length <= 10 ? d : ""; };
const clean = (s) => (s && s !== "-" && s !== "NONE") ? s.trim() : "";
// phone → {pr, kind}
const prByPhone = new Map();
for (const x of fin.linked) prByPhone.set(x.phone, { pr: x.pr, kind: "linked" });
for (const x of fin.created) prByPhone.set(x.phone, { pr: x.pr, kind: "created" });

function richExtras(x) {
  const parts = [];
  if (clean(x.tax)) parts.push(`เลขนิติ/บัตร/passport:${clean(x.tax)}`);
  if (clean(x.linefb)) parts.push(`LINE/FB:${clean(x.linefb)}`);
  if (clean(x.email)) parts.push(`Email:${clean(x.email)}`);
  if (clean(x.phoneRaw) && /\/|,| /.test(x.phoneRaw.trim())) parts.push(`เบอร์/ติดต่อ:${clean(x.phoneRaw)}`); // multi-phone / contact name
  if (clean(x.addr)) parts.push(`ที่อยู่:${clean(x.addr)}`);
  if (clean(x.note)) parts.push(`หมายเหตุชีต:${clean(x.note)}`);
  return parts.join(" · ");
}

async function main() {
  let c;
  for (const h of ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"]) {
    try { c = new Client({ connectionString: `postgresql://postgres.${REF}:${encodeURIComponent(P)}@${h}:5432/postgres`, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 }); await c.connect(); break; } catch { c = null; }
  }
  if (!c) { console.error("no DB"); process.exit(1); }

  // dedupe full rows by phone (first with-data wins · merge non-empty)
  const byPhone = new Map();
  for (const x of full) { const ph = normPhone(x.phoneRaw); if (!ph) continue; const e = byPhone.get(ph); if (!e) byPhone.set(ph, x); else for (const k of ["tax", "linefb", "email", "addr", "note"]) if (!clean(e[k]) && clean(x[k])) e[k] = x[k]; }

  let updCreated = 0, updLinked = 0, skipped = 0, fieldFills = 0;
  for (const [ph, x] of byPhone) {
    const hit = prByPhone.get(ph);
    if (!hit) { skipped++; continue; }
    const extras = richExtras(x);
    const tag = `FREIGHT[${x.src}/${x.member}]`;
    if (!APPLY) { hit.kind === "created" ? updCreated++ : updLinked++; continue; }
    if (hit.kind === "created") {
      const note = `freight import 2026-06 ${tag}${extras ? " · " + extras : ""}`;
      await c.query(`update tb_users set "userNote"=$1 where "userID"=$2`, [note, hit.pr]);
      // fill empty proper fields
      const sets = [], vals = []; let i = 1;
      if (clean(x.email) && /@/.test(x.email)) { sets.push(`"userEmail"=coalesce(nullif("userEmail",''),$${i++})`); vals.push(clean(x.email)); }
      if (clean(x.linefb)) { sets.push(`"userLineIDOA"=coalesce(nullif("userLineIDOA",''),$${i++})`); vals.push(clean(x.linefb)); }
      if (sets.length) { await c.query(`update tb_users set ${sets.join(",")} where "userID"=$${i}`, [...vals, hit.pr]); fieldFills++; }
      updCreated++;
    } else {
      // linked: read existing note, strip prior FREIGHT segment, append fresh (preserve their data)
      const cur = await c.query(`select "userNote" from tb_users where "userID"=$1`, [hit.pr]);
      let base = (cur.rows[0]?.userNote || "").replace(/\s*\|\|\s*FREIGHT\[.*$/s, "").trim();
      const note = `${base}${base ? " " : ""}|| ${tag}${extras ? ": " + extras : ""}`;
      await c.query(`update tb_users set "userNote"=$1 where "userID"=$2`, [note.slice(0, 1900), hit.pr]);
      updLinked++;
    }
  }
  console.log(`\n=== FREIGHT capture-notes (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`  updated CREATED ${updCreated} · LINKED ${updLinked} · field-fills ${fieldFills} · skipped(no-PR) ${skipped}`);
  await c.end();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
