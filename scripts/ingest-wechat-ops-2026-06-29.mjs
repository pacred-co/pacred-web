#!/usr/bin/env node
/**
 * Ingest decrypted WeChat cargo-ops messages → public.wechat_ops_message (mig 0228).
 * Source JSON = scratchpad/wx_records.json: array of [chat, "YYYY-MM-DD HH:MM", sender, text].
 * Idempotent via content_hash UNIQUE (md5 of chat|sender|sent_at|content).
 *
 *   PROJECT_REF=<ref> SUPABASE_DB_PASSWORD=<pw> WX_JSON=<path> node scripts/ingest-wechat-ops-2026-06-29.mjs [--apply]
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const REF = process.env.PROJECT_REF || "yzljakczhwrpbxflnmco";
const PW = process.env.SUPABASE_DB_PASSWORD;
const JSONP = process.env.WX_JSON;
const ACCT = process.env.WX_ACCOUNT || "wxid_a47v4a2twg3e22_62d2";
if (!PW || !JSONP) { console.error("need SUPABASE_DB_PASSWORD + WX_JSON"); process.exit(1); }

const recs = JSON.parse(readFileSync(JSONP, "utf-8"));
console.log(`source records: ${recs.length} · ref=${REF} · ${APPLY ? "APPLY" : "DRY-RUN"}`);
const rows = recs.map(([chat, dt, sender, content]) => {
  const sent_at = dt && /^\d{4}-\d{2}-\d{2}/.test(dt) ? dt + ":00+07" : null;
  const content_hash = createHash("md5").update(`${chat}|${sender}|${dt}|${content}`).digest("hex");
  return { chat, sent_at, sender, content, content_hash };
});
// de-dup within batch by hash
const seen = new Set(); const uniq = [];
for (const r of rows) { if (!seen.has(r.content_hash)) { seen.add(r.content_hash); uniq.push(r); } }
console.log(`unique to upsert: ${uniq.length}`);
if (!APPLY) { console.log("dry-run — re-run with --apply"); process.exit(0); }

const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
let client;
for (const host of HOSTS) {
  try {
    client = new Client({ host, port: 5432, user: `postgres.${REF}`, password: PW,
      database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
    await client.connect(); console.log("connected", host); break;
  } catch (e) { console.error(host, e.message); client = null; }
}
if (!client) process.exit(1);

let ins = 0;
const B = 500;
for (let i = 0; i < uniq.length; i += B) {
  const chunk = uniq.slice(i, i + B);
  const vals = []; const ph = [];
  chunk.forEach((r, j) => {
    const o = j * 6;
    ph.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6})`);
    vals.push(ACCT, r.chat, r.sender, r.sent_at, r.content, r.content_hash);
  });
  const sql = `insert into public.wechat_ops_message
    (source_account, chat_name, sender, sent_at, content, content_hash)
    values ${ph.join(",")} on conflict (content_hash) do nothing`;
  const res = await client.query(sql, vals);
  ins += res.rowCount;
  if (i % 5000 === 0) console.log(`  ${i}/${uniq.length}…`);
}
const { rows: cnt } = await client.query("select count(*)::int n from public.wechat_ops_message");
console.log(`✓ inserted ${ins} new · table now ${cnt[0].n} rows`);
await client.end();
