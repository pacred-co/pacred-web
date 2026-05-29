/**
 * Wave 29 — prod status snapshot (ภูม 2026-05-30):
 *
 *   1. tb_forwarder GROUP BY fstatus (where is every cargo order right now?)
 *   2. tb_cnt status snapshot (container-payment ledger)
 *   3. momo_import_tracks — latest sync timestamp (ภูม "ดึงล่าสุดวันไหน")
 *   4. momo_sync_logs — last 5 sync run logs (success/error/count)
 *
 * Run: pnpm tsx --env-file=.env.local scripts/wave-29-prod-status.mts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

console.log("Target:", url);
console.log("Time  :", new Date().toISOString());
console.log("");

// ─────────────────────────────────────────────────────────────
// 1. tb_forwarder — where is every cargo order right now?
// ─────────────────────────────────────────────────────────────
console.log("═══ 1. tb_forwarder — current status distribution ═══");
const FSTATUS_LABEL: Record<string, string> = {
  "1":   "1 — รอเข้าโกดังจีน",
  "2":   "2 — ถึงโกดังจีนแล้ว",
  "3":   "3 — กำลังส่งมาไทย",
  "4":   "4 — ถึงไทยแล้ว",
  "5":   "5 — รอชำระเงิน",
  "6":   "6 — เตรียมส่ง",
  "6.1": "6.1 — กำลังจัดส่ง",
  "7":   "7 — ส่งแล้ว",
  "c":   "c — เครดิต",
  "p":   "p — สถานะพิเศษ",
  "99":  "99 — ยกเลิก",
};

for (const status of Object.keys(FSTATUS_LABEL)) {
  const { count, error } = await admin
    .from("tb_forwarder")
    .select("id", { count: "exact", head: true })
    .eq("fstatus", status);
  if (error) {
    console.log(`  ${FSTATUS_LABEL[status]}  → ERROR ${error.message}`);
  } else {
    console.log(`  ${FSTATUS_LABEL[status]}  → ${(count ?? 0).toLocaleString()}`);
  }
}

// Latest forwarder activity (max fdate)
const { data: latestFwd, error: latestFwdErr } = await admin
  .from("tb_forwarder")
  .select("id, ftrackingchn, userid, fstatus, fdate, fdatestatus2, fdatestatus3, fdatestatus4")
  .order("fdate", { ascending: false })
  .limit(3);
if (!latestFwdErr) {
  console.log("\n  Latest 3 forwarder rows by fdate:");
  for (const r of latestFwd ?? []) {
    console.log(`    #${r.id} ${r.ftrackingchn ?? "—"} · ${r.userid} · status=${r.fstatus} · fdate=${r.fdate?.slice(0,16)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 2. tb_cnt — container payment ledger
// ─────────────────────────────────────────────────────────────
console.log("\n═══ 2. tb_cnt — container-payment ledger ═══");
const { count: cntTotal } = await admin
  .from("tb_cnt")
  .select("cntID", { count: "exact", head: true });
console.log(`  Total tb_cnt rows: ${(cntTotal ?? 0).toLocaleString()}`);

const CNT_STATUS_LABEL: Record<string, string> = {
  "0": "0 — รออนุมัติ",
  "1": "1 — อนุมัติแล้ว",
  "2": "2 — ปฏิเสธ",
};
for (const s of Object.keys(CNT_STATUS_LABEL)) {
  const { count } = await admin
    .from("tb_cnt")
    .select("cntID", { count: "exact", head: true })
    .eq("cntStatus", s);
  console.log(`  ${CNT_STATUS_LABEL[s]} → ${(count ?? 0).toLocaleString()}`);
}

// Latest container payments
const { data: latestCnt } = await admin
  .from("tb_cnt")
  .select("cntID, cntAmount, cntStatus, date, adminIDCreate")
  .order("date", { ascending: false })
  .limit(3);
console.log("\n  Latest 3 container payments by date:");
for (const r of latestCnt ?? []) {
  console.log(`    cntID=${r.cntID} · ฿${Number(r.cntAmount ?? 0).toLocaleString()} · status=${r.cntStatus} · ${String(r.date).slice(0,16)} · admin=${r.adminIDCreate}`);
}

// ─────────────────────────────────────────────────────────────
// 3. momo_import_tracks — latest MOMO sync timestamp
// ─────────────────────────────────────────────────────────────
console.log("\n═══ 3. momo_import_tracks — MOMO sync state ═══");
const { count: momoTotal } = await admin
  .from("momo_import_tracks")
  .select("id", { count: "exact", head: true });
console.log(`  Total momo_import_tracks rows: ${(momoTotal ?? 0).toLocaleString()}`);

const { count: momoUncommitted } = await admin
  .from("momo_import_tracks")
  .select("id", { count: "exact", head: true })
  .is("committed_at", null);
console.log(`  Uncommitted (waiting at /review): ${(momoUncommitted ?? 0).toLocaleString()}`);

const { count: momoCommitted } = await admin
  .from("momo_import_tracks")
  .select("id", { count: "exact", head: true })
  .not("committed_at", "is", null);
console.log(`  Committed to tb_forwarder      : ${(momoCommitted ?? 0).toLocaleString()}`);

// Latest sync
const { data: latestMomo } = await admin
  .from("momo_import_tracks")
  .select("momo_tracking_no, momo_container_no, last_synced_at, momo_updated_at, committed_at")
  .order("last_synced_at", { ascending: false })
  .limit(5);
console.log("\n  Latest 5 MOMO rows by last_synced_at:");
for (const r of latestMomo ?? []) {
  console.log(`    ${(r.momo_tracking_no ?? "—").padEnd(15)} · cnt=${(r.momo_container_no ?? "—").padEnd(20)} · synced=${(r.last_synced_at ?? "—").slice(0, 19)} · MOMO updated=${(r.momo_updated_at ?? "—").slice(0, 19)} · committed=${(r.committed_at ?? "—").slice(0, 19)}`);
}

// Compute lag
if (latestMomo?.[0]) {
  const lastSync = new Date(latestMomo[0].last_synced_at ?? Date.now());
  const lagMin = Math.floor((Date.now() - lastSync.getTime()) / 60000);
  const lagHr = Math.floor(lagMin / 60);
  const lagDay = Math.floor(lagHr / 24);
  console.log(`\n  ⏰ TIME SINCE LATEST SYNC: ${lagDay}d ${lagHr % 24}h ${lagMin % 60}m  (${lagMin.toLocaleString()} min total)`);
}

// ─────────────────────────────────────────────────────────────
// 4. momo_sync_logs — last 5 sync runs
// ─────────────────────────────────────────────────────────────
console.log("\n═══ 4. momo_sync_logs — last 5 sync runs ═══");
const { data: syncLogs, error: syncLogErr } = await admin
  .from("momo_sync_logs")
  .select("id, sync_type, status, import_track_count, upserted_count, created_at, errors")
  .order("created_at", { ascending: false })
  .limit(5);
if (syncLogErr) {
  console.log(`  ERROR: ${syncLogErr.message}`);
} else if (!syncLogs?.length) {
  console.log("  (no sync logs found — table empty)");
} else {
  for (const r of syncLogs) {
    const errSummary = Array.isArray(r.errors) && r.errors.length > 0 ? ` · errors=${r.errors.length}` : "";
    console.log(`  #${r.id} · ${r.sync_type ?? "?"} · ${r.status ?? "?"} · in=${r.import_track_count ?? 0} upserted=${r.upserted_count ?? 0} · ${r.created_at?.slice(0, 19)}${errSummary}`);
  }
}

console.log("\n═══ DONE ═══");
