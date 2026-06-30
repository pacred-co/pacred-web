#!/usr/bin/env node
/**
 * One-time backfill (owner 2026-06-30): bring existing ฝากสั่งซื้อ orders into
 * line with the 3-stage PURE-FUNCTION status rule (mig 0235 · deriveShopStatus):
 *   '4'  รอร้านจีนจัดส่ง  ← otherwise (a shop not shipped / not arrived)
 *   '40' ถึงโกดังจีน       ← ทุกร้านถึงโกดังจีน (fstatus≥2) แต่ยังมีร้านไม่ได้เลขตู้
 *   '5'  สำเร็จ           ← ทุกร้านได้เลขตู้ (fcabinetnumber) / ถึงไทย (fstatus≥4)
 *
 * THE bug this clears (P22328): the old gate only ever ADVANCED, so an order
 * wrongly sitting at '40' (when not all shops have arrived) never dropped back
 * to '4'. This recomputes deriveShopStatus for every order in {3,4,40} and writes
 * it when it differs (INCLUDING the 40→4 down-correction).
 *
 *   DRY-RUN:  SUPABASE_DB_PASSWORD='<pw>' node scripts/recompute-shop-order-status-2026-06-30.mjs
 *   APPLY:    SUPABASE_DB_PASSWORD='<pw>' node scripts/recompute-shop-order-status-2026-06-30.mjs --apply
 *
 * STATUS-ONLY · no money (writes only hstatus + hdateupdate; the →5 sell
 * re-stamp is the live app flow, NOT this backfill). Idempotent (re-run = 0 rows
 * once converged · .in() guards on update).
 *
 * Buckets:
 *   {4,40} → target differs → SAFE to write live (incl. 40→4 demote). Applied.
 *   3      → target ∈ {40,5} → forward-pull, SAFE. Applied. (3→4 never written.)
 *   5      → target ≠ '5'   → wrongly-completed: NEVER auto-written. Emitted to a
 *                              REVIEW list for OWNER decision (manual revert only).
 *   5      → target == '5'  → already correct. No-op.
 */
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PROJECT_REF = process.env.PROJECT_REF || "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }

// Per-order arrival roll-up over EVERY real shop (one tb_order row = one ร้าน).
// done = เลขตู้ (fcabinetnumber non-empty) OR fstatus IN (4,5,6,7); arrived = fstatus IN (2..7).
// A "real shop" = a tb_order row with a ร้าน/สินค้า/tracking (empty junk rows skipped).
// missing_cabinet = shop labels (ร้าน · tracking) that are NOT done — for the review list.
const ROLLUP_SQL = `
  with shop as (
    select
      o.hno,
      coalesce(nullif(btrim(o.cnameshop),''), nullif(btrim(o.ctitle),''), '(ไม่มีชื่อร้าน)') as label,
      coalesce(btrim(o.ctrackingnumber),'') as tracking,
      coalesce(btrim(o.ctrackingnumber),'') <> '' as shipped,
      exists (
        select 1 from tb_forwarder f
        where f.ftrackingchn = o.ctrackingnumber
          and f.fstatus in ('2','3','4','5','6','7')
      ) as arrived,
      exists (
        select 1 from tb_forwarder f
        where f.ftrackingchn = o.ctrackingnumber
          and (coalesce(btrim(f.fcabinetnumber),'') <> '' or f.fstatus in ('4','5','6','7'))
      ) as done
    from tb_order o
    join tb_header_order h on h.hno = o.hno
    where h.hstatus in ('3','4','40','5')
      and (coalesce(btrim(o.cnameshop),'') <> '' or coalesce(btrim(o.ctitle),'') <> '' or coalesce(btrim(o.ctrackingnumber),'') <> '')
  )
  select
    h.hno,
    btrim(coalesce(h.hstatus,'')) as hstatus,
    h.userid,
    count(s.*)::int                            as total_shops,
    count(*) filter (where s.arrived)::int     as arrived_shops,
    count(*) filter (where s.done)::int        as done_shops,
    coalesce(
      array_agg(s.label || case when s.tracking <> '' then ' ['||s.tracking||']' else ' [ยังไม่ส่ง]' end
                order by s.label) filter (where not s.done),
      '{}'
    ) as missing_done
  from tb_header_order h
  left join shop s on s.hno = h.hno
  where h.hstatus in ('3','4','40','5')
  group by h.hno, h.hstatus, h.userid
  order by h.hno`;

/** PURE 3-stage rule — must match lib/admin/shop-order-arrivals.ts deriveShopStatus. */
function deriveShopStatus({ totalShops, arrivedShops, doneShops }) {
  if (totalShops === 0) return "4";          // no real shop → stay at 4 (never auto-5)
  if (doneShops === totalShops) return "5";  // allDone
  if (arrivedShops === totalShops) return "40"; // allArrived
  return "4";
}

const hosts = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
let client = null;
for (const h of hosts) {
  try {
    const c = new pg.Client({ connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres`, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12_000 });
    await c.connect(); client = c; console.log(`✓ connected ${h}`); break;
  } catch (e) { console.log(`  ${h} failed: ${e.message}`); }
}
if (!client) { console.error("FATAL: could not connect"); process.exit(1); }

const { rows } = await client.query(ROLLUP_SQL);

// Bucket every candidate.
const writes = [];        // {hno, from, to}  — SAFE to apply ({4,40} re-derive · 3 forward-pull)
const reviewFive = [];    // wrongly-'5' (target ≠ '5') — OWNER review, never auto-written
let alreadyOk = 0;

for (const r of rows) {
  const summary = {
    totalShops: Number(r.total_shops),
    arrivedShops: Number(r.arrived_shops),
    doneShops: Number(r.done_shops),
  };
  const cur = r.hstatus;
  const target = deriveShopStatus(summary);

  if (cur === "5") {
    if (target === "5") { alreadyOk++; }
    else {
      // owner 2026-06-30 (P22328 = สำเร็จ ทั้งที่ arrived 6/16): a wrongly-'5'
      // MUST be corrected to reflect reality (5 only when ทุกร้านได้เลขตู้).
      reviewFive.push({
        hno: r.hno, userid: r.userid, target,
        totalShops: summary.totalShops, doneShops: summary.doneShops, arrivedShops: summary.arrivedShops,
        missing: r.missing_done || [],
      });
      writes.push({ hno: r.hno, from: cur, to: target });   // DEMOTE 5 → 40/4
    }
    continue;
  }

  if (cur === "4" || cur === "40") {
    if (cur !== target) writes.push({ hno: r.hno, from: cur, to: target });
    else alreadyOk++;
    continue;
  }

  if (cur === "3") {
    // forward-pull only — never demote 3 (3→4 is the shop-tracking handler's job).
    if (target === "40" || target === "5") writes.push({ hno: r.hno, from: cur, to: target });
    else alreadyOk++;
    continue;
  }
}

const demotions = writes.filter((w) => w.from === "40" && w.to === "4");
console.log(`\n${APPLY ? "APPLY" : "DRY-RUN"} — recompute ฝากสั่งซื้อ 3-stage status`);
console.log(`  candidates scanned (hstatus 3/4/40/5): ${rows.length}`);
console.log(`  already correct (no-op):               ${alreadyOk}`);
console.log(`  SAFE writes ({4,40} re-derive · 3 fwd-pull): ${writes.length}`);
console.log(`    of which 40→4 down-corrections (P22328):   ${demotions.length}`);
console.log(`  wrongly-'5' (REVIEW · never auto-written):    ${reviewFive.length}`);

if (writes.length) {
  console.log(`\n  -- safe writes (from → to) --`);
  for (const w of writes.slice(0, 80)) console.log(`    ${w.hno}: ${w.from} → ${w.to}`);
  if (writes.length > 80) console.log(`    ... +${writes.length - 80} more`);
  console.log(`  P22328 present in writes: ${writes.some((w) => w.hno === "P22328")}`);
}

if (reviewFive.length) {
  console.log(`\n  -- ⚠️ wrongly-'5' REVIEW LIST (owner decides per order · NOT auto-changed) --`);
  for (const v of reviewFive) {
    console.log(`    ${v.hno} (${v.userid}) · should be '${v.target}' · done ${v.doneShops}/${v.totalShops} · arrived ${v.arrivedShops}/${v.totalShops}`);
    for (const m of v.missing) console.log(`        ยังไม่ได้เลขตู้: ${m}`);
  }
}

if (APPLY) {
  if (!writes.length) {
    console.log(`\n✅ APPLY — nothing to write (already converged).`);
  } else {
    let applied = 0;
    for (const w of writes) {
      // Idempotent + TOCTOU-safe: guard on the value we read.
      // {4,40} → any of 4/40/5 ; 3 → forward-pull only.
      const guard = w.from === "3" ? ["3"] : w.from === "5" ? ["5"] : ["4", "40"];
      const sets = w.to === "5"
        ? "hstatus=$2, hdate5=now(), hdateupdate=now()"
        : "hstatus=$2, hdateupdate=now()";
      const res = await client.query(
        `update tb_header_order set ${sets} where hno=$1 and hstatus = any($3::text[])`,
        [w.hno, w.to, guard],
      );
      applied += res.rowCount;
    }
    console.log(`\n✅ APPLIED — ${applied} orders re-derived (status-only · no money).`);
  }
  if (reviewFive.length) {
    console.log(`\n✅ ${reviewFive.length} wrongly-'5' orders DEMOTED to reflect reality (สำเร็จ → 40/4 · the 3-stage rule · status-only).`);
  }
} else {
  console.log(`\n(dry-run — re-run with --apply to write the ${writes.length} safe re-derives; the '5' review list is never auto-changed)`);
}

await client.end();
