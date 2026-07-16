// 🧹 /admin/incidents queue cleanup (owner 2026-07-16 "แก้บัคในหน้านี้ให้หมด").
// Closes the 17 OPEN incidents by root cause. The CODE fixes (this same commit)
// stop each class from RECURRING; this clears the stale/fixed backlog so the
// live queue reflects only real, current, actionable issues.
//
//   NOISE → 'ignored' (not a code bug · CHECK-safe: status+resolution_note):
//     • chunk-load deploy-churn  (title LIKE 'Failed to load chunk%' / 'Loading chunk%')
//     • transient abort          (title IN 'Load failed','Error in input stream' · pre-filter historical)
//     • NEXT control-flow        (message LIKE '%NEXT_HTTP_ERROR_FALLBACK%' etc.)
//     • wallet-reconcile dups    (route '/api/cron/wallet-reconcile' · known PR130 accounting item · cron now dedupes)
//   FIXED → 'resolved' (real bug · client-compress this deploy · CHECK needs
//     resolved_at+note+acknowledged_at+assigned_to):
//     • upload bodySizeLimit     (title 'An unexpected response was received from the server')
//
// Only touches status IN ('open','acknowledged','in_progress'). Idempotent.
//   dry:   node scripts/cleanup-incidents-queue-2026-07-16.mjs
//   apply: node scripts/cleanup-incidents-queue-2026-07-16.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const nowIso = new Date().toISOString();
const ASSIGNEE = "a2f85883-4c23-4b3e-aaaf-616883c937db"; // AD003 (active admin) — for the resolved CHECK

const LIVE = ["open", "acknowledged", "in_progress"];
// Ordered: each row falls into the FIRST matching bucket.
const IGNORE_PREDICATES = [
  { name: "chunk-load (deploy churn)", where: `(title LIKE 'Failed to load chunk%' OR title LIKE 'Loading chunk%' OR title LIKE '%error loading dynamically imported module%')` },
  { name: "transient abort (historical)", where: `(lower(title) IN ('load failed','error in input stream','failed to fetch','connection closed.'))` },
  { name: "NEXT control-flow", where: `(message LIKE '%NEXT_HTTP_ERROR_FALLBACK%' OR message LIKE '%NEXT_NOT_FOUND%' OR message LIKE '%NEXT_REDIRECT%')` },
  { name: "wallet-reconcile dup (known PR130)", where: `(route = '/api/cron/wallet-reconcile')` },
];
const RESOLVE_WHERE = `(title LIKE 'An unexpected response was received from the server%')`;

const IGNORE_NOTE = {
  "chunk-load (deploy churn)": "ปิดอัตโนมัติ: chunk-load = deploy churn (แท็บเก่าตอน deploy ใหม่) ไม่ใช่บัค · capture suppress + auto-reload แล้ว (this deploy)",
  "transient abort (historical)": "ปิดอัตโนมัติ: transient network abort (historical ก่อน filter) · client-report skip แล้ว",
  "NEXT control-flow": "ปิดอัตโนมัติ: Next control-flow (notFound/redirect) ไม่ใช่ error · withObservability re-throw ไม่ capture แล้ว (this deploy)",
  "wallet-reconcile dup (known PR130)": "ปิดอัตโนมัติ: negative wallet = known accounting item (PR130 −646) · cron dedup fixed (this deploy → future runs รวมเป็น 1) · reconcile ที่ /admin/wallet",
};
const RESOLVE_NOTE = "แก้แล้ว: อัปโหลดรูปเกิน bodySizeLimit → เพิ่ม client-compress ก่อนส่ง (this deploy · driver self-pickup + forwarder exception)";

const snapshot = (await c.query(
  `SELECT id, status, source, kind, title, route FROM platform_incidents WHERE status = ANY($1) ORDER BY id`, [LIVE])).rows;

console.log(`\n════ /admin/incidents cleanup · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`live (open/ack/in_progress) ก่อนแก้: ${snapshot.length}\n`);

// classify (dry preview) — count per bucket
for (const p of IGNORE_PREDICATES) {
  const { rows } = await c.query(`SELECT count(*) n FROM platform_incidents WHERE status = ANY($1) AND ${p.where}`, [LIVE]);
  console.log(`  → ignored [${p.name}]: ${rows[0].n}`);
}
{
  const { rows } = await c.query(`SELECT count(*) n FROM platform_incidents WHERE status = ANY($1) AND ${RESOLVE_WHERE}`, [LIVE]);
  console.log(`  → resolved [upload bodySizeLimit]: ${rows[0].n}`);
}
// anything left unmatched?
const matchedWhere = IGNORE_PREDICATES.map((p) => p.where).concat(RESOLVE_WHERE).join(" OR ");
const { rows: leftover } = await c.query(
  `SELECT id, title, route FROM platform_incidents WHERE status = ANY($1) AND NOT (${matchedWhere}) ORDER BY id`, [LIVE]);
console.log(`\n  ⚠️ UNMATCHED (จะไม่ถูกปิด · ต้องดูเอง): ${leftover.length}`);
leftover.forEach((r) => console.log(`     #${r.id} ${r.title} (${r.route || "-"})`));

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อปิดจริง\n`); await c.end(); process.exit(0); }

writeFileSync("scripts/cleanup-incidents-backup-2026-07-16.json", JSON.stringify({ snapshot }, null, 2));
await c.query("begin");
try {
  let ignored = 0;
  for (const p of IGNORE_PREDICATES) {
    const { rowCount } = await c.query(
      `UPDATE platform_incidents SET status='ignored', resolution_note=$2
         WHERE status = ANY($1) AND ${p.where}`, [LIVE, IGNORE_NOTE[p.name]]);
    ignored += rowCount;
  }
  const { rowCount: resolved } = await c.query(
    `UPDATE platform_incidents
        SET status='resolved', resolved_at=$2, acknowledged_at=COALESCE(acknowledged_at,$2),
            assigned_to=COALESCE(assigned_to,$3), resolution_note=$4
      WHERE status = ANY($1) AND ${RESOLVE_WHERE}`, [LIVE, nowIso, ASSIGNEE, RESOLVE_NOTE]);
  await c.query("commit");
  console.log(`\n✅ APPLIED · ignored ${ignored} · resolved ${resolved} · live queue เหลือ ${leftover.length}`);
} catch (e) { await c.query("rollback"); console.error("❌ ROLLED BACK:", e.message); }
await c.end();
