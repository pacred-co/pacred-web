/**
 * diag-scan-shortfall-2026-07-22.mjs  (READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────
 * owner/ภูม 2026-07-22: 5 ตู้บนแท็บ "สำเร็จ" (report-cnt?page=succeed) ยังแดง =
 * "ยิงรับเข้าโกดังไทยไม่ครบ" (SUM tb_forwarder_import2.fi2amount < tb_forwarder.famount)
 * ทั้งที่งานจบไปแล้ว (fstatus ไปไกล). ดูสถานะจริงก่อน backfill.
 *
 * ดัมพ์ทุกแถวต่อตู้ + ยอดสแกน เพื่อระบุแถวที่ขาด + แยกหัวบิล MOMO (bare zero-weight
 * + ฿0 + มี -N sibling) ด้วยตา ก่อนตัดสินใจ backfill (READ-ONLY · ไม่เขียนอะไร).
 */
import pg from "pg";

const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("ต้องส่ง SUPABASE_DB_PASSWORD"); process.exit(1); }
const CABS = ["GZS260606-1", "GZS260528-1", "GZS260525-2", "GZS260618-1", "GZS260617-1"];

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// base = strip a trailing "-N" or "-N/M" box suffix; suffix N (0 = bare/no suffix)
const suffixRe = /-(\d+)(?:\/\d+)?$/;
const baseOf = (t) => (t ?? "").replace(suffixRe, "");
const suffixOf = (t) => { const m = (t ?? "").match(suffixRe); return m ? Number(m[1]) : 0; };

for (const cab of CABS) {
  const { rows: fwds } = await c.query(
    `select id, ftrackingchn, coalesce(famount,0)::int famount, coalesce(fweight,0)::float fweight,
            coalesce(ftotalprice,0)::float ftotalprice, userid, fstatus, coalesce(famountcount,'') famountcount
     from tb_forwarder where fcabinetnumber = $1 order by ftrackingchn, id`, [cab]);
  const ids = fwds.map((f) => Number(f.id));
  const scans = ids.length
    ? (await c.query(`select fid, coalesce(fi2amount,0)::int fi2amount, id from tb_forwarder_import2 where fid = any($1)`, [ids])).rows
    : [];
  const scanSum = new Map();  // fid -> total fi2amount
  const scanRows = new Map(); // fid -> count of import2 rows
  for (const s of scans) {
    const fid = Number(s.fid);
    scanSum.set(fid, (scanSum.get(fid) ?? 0) + Math.max(0, Number(s.fi2amount)));
    scanRows.set(fid, (scanRows.get(fid) ?? 0) + 1);
  }
  // which (base::userid) groups have a box-suffixed sibling
  const groupHasBox = new Set();
  for (const f of fwds) if (suffixOf(f.ftrackingchn) > 0) groupHasBox.add(`${baseOf(f.ftrackingchn)}::${f.userid ?? ""}`);
  const isHeader = (f) => suffixOf(f.ftrackingchn) === 0
    && groupHasBox.has(`${baseOf(f.ftrackingchn)}::${f.userid ?? ""}`)
    && Number(f.ftotalprice) <= 0;  // money = sole keep-signal

  let expected = 0, scanned = 0;
  const lines = [];
  for (const f of fwds) {
    const fid = Number(f.id);
    const got = scanSum.get(fid) ?? 0;
    const header = isHeader(f);
    if (!header) { expected += f.famount; scanned += got; }
    const short = !header && got < f.famount;
    lines.push(`  ${short ? "🔴SHORT" : header ? "  hdr " : "  ok  "} #${fid} ${f.ftrackingchn} ${f.userid} · famount=${f.famount} ยิง=${got} (${scanRows.get(fid) ?? 0} แถว) · ฿${f.ftotalprice} wt=${f.fweight} · fstatus=${f.fstatus} · cnt=${f.famountcount}`);
  }
  console.log(`\n=== ${cab} === แถว ${fwds.length} · countable expected=${expected} scanned=${scanned} · ${expected > scanned ? `🔴 ขาด ${expected - scanned}` : "✅ ครบ"}`);
  for (const l of lines) console.log(l);
}
await c.end();
