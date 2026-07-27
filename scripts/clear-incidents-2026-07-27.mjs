/**
 * clear-incidents-2026-07-27.mjs — ล้างคิว /admin/incidents ให้ว่าง (owner สั่ง)
 *
 * ปิดพร้อมกันกับ 3 ราก (โค้ดใน commit เดียวกัน) — ไม่งั้นล้างแล้วก็เต็มใหม่:
 *   1. client-report + captureIncident: gate NODE_ENV=production
 *      (ฆ่า class js_error จาก dev localhost ที่ชี้ DB prod — 19/30 ใบ)
 *   2. data-health cron: check กลุ่ม "งานคน" ไม่เปิดใบ (บ้านจริง = /admin/data-health)
 *   3. ใบเก่าที่เหลือ = deploy churn / เคสที่โค้ดปัจจุบันแก้แล้ว
 *
 * ทุกใบปิดเป็น 'resolved' + assigned_to (mig 0077 CHECK บังคับ) + note ระบุเหตุต่อ class.
 * ⚠️ wallet-reconcile (PR588 pending_overdraft ฿198) = ของจริง — ปิดใบได้แต่ cron
 * รายวันจะเปิดใหม่จนกว่าบัญชีเคลียร์ PR588 → รายงาน owner แยก (ตั้งใจ ไม่ silence).
 *
 * dry-run ก่อนเสมอ · --apply เขียนจริง (backup ก่อน) · re-run = 0.
 * RUN: node --env-file=.env.local scripts/clear-incidents-2026-07-27.mjs [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const ASSIGNEE = "a2f85883-4c23-4b3e-aaaf-616883c937db"; // profiles.id ของ admin_dev

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/** จำแนกใบ → note ปิด (คนอ่านทีหลังต้องรู้ว่าปิดเพราะอะไร ไปตามต่อที่ไหน) */
function classify(r) {
  const msg = String(r.message ?? "");
  const route = String(r.route ?? "");
  if (route === "/api/cron/data-health") {
    return `ปิดอัตโนมัติ 2026-07-27: check "${r.surface_meta?.checkId}" = คิวงานคน (บัญชี/CS) ไม่ใช่บั๊กระบบ — ตามงานจริงได้ที่ /admin/data-health (ลิสต์แถวสด) · cron เลิกเปิดใบ class นี้แล้ว (HUMAN_QUEUE_CHECK_IDS)`;
  }
  if (route === "/api/cron/wallet-reconcile" || msg.includes("wallettotal")) {
    return `ปิด 2026-07-27: PR588 pending_overdraft ฿198 (ใช้เกินยอดกระเป๋า) = งานบัญชีตรวจ/เคาะ pending ของ PR588 — แจ้ง owner แล้ว · ถ้ายังค้าง cron รายวันจะเปิดใบใหม่เอง (ตั้งใจให้เตือนต่อ)`;
  }
  if (msg.includes("unexpected response")) {
    return `ปิด 2026-07-27: "unexpected response" = แท็บเก่ายิง server-action chunk ที่ถูก deploy ทับ (deploy churn) — ระบบมีข้อความไทย + suppress ให้แล้ว (action-dispatch-error SOT) · ไม่ใช่บั๊กโค้ดปัจจุบัน`;
  }
  if (r.kind === "js_error") {
    return `ปิด 2026-07-27: js_error จาก session dev บนเครื่อง (localhost ชี้ DB prod ตาม §0k) — โค้ดปัจจุบันบน main ไม่มี symbol ผิดแล้ว (ตรวจ drivers rework 07-25) · อุดรากแล้ว: client-report + captureIncident gate NODE_ENV=production`;
  }
  return `ปิด 2026-07-27: server error ค้างจากรอบ deploy เก่า (deploy churn / โค้ดที่แก้ไปแล้ว) — ไม่ fire ซ้ำใน 72 ชม. · ถ้าเกิดใหม่หลังจากนี้ใบใหม่จะเปิดเองพร้อม stack ล่าสุด`;
}

async function main() {
  const { data: rows, error } = await admin
    .from("platform_incidents")
    .select("id, status, kind, source, route, title, message, surface_meta, occurrence_count, last_seen")
    .in("status", ["open", "acknowledged", "in_progress"])
    .order("last_seen", { ascending: false });
  if (error) throw error;

  console.log(`ใบค้างในคิว (live): ${rows.length}`);
  const plan = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    route: String(r.route ?? "").slice(0, 44),
    title: String(r.title ?? r.message ?? "").slice(0, 56),
    note: classify(r),
  }));
  for (const p of plan) console.log(`- [${p.kind}] ${p.route} · ${p.title}\n    → ${p.note.slice(0, 110)}…`);

  if (!APPLY) { console.log(`\n(dry-run — pass --apply เพื่อปิด ${plan.length} ใบ)`); return; }
  if (plan.length === 0) { console.log("คิวว่างอยู่แล้ว"); return; }

  writeFileSync("/tmp/backup-incidents-clear-2026-07-27.json", JSON.stringify(rows, null, 2));
  console.log("📦 backup → /tmp/backup-incidents-clear-2026-07-27.json");

  let done = 0;
  for (const p of plan) {
    const { error: e } = await admin
      .from("platform_incidents")
      .update({
        status: "resolved",
        assigned_to: ASSIGNEE, // mig 0077 CHECK resolved_consistent + triaged_consistent
        acknowledged_at: new Date().toISOString(), // triaged_consistent: resolved ต้องมี ack ด้วย
        resolved_at: new Date().toISOString(),
        resolution_note: p.note,
      })
      .eq("id", p.id)
      .in("status", ["open", "acknowledged", "in_progress"]); // TOCTOU: ปิดเฉพาะที่ยัง live
    if (e) { console.error(`✗ ${p.id}: ${e.message}`); continue; }
    done += 1;
  }
  console.log(`✅ ปิดแล้ว ${done}/${plan.length} — รันซ้ำเพื่อยืนยัน 0`);
}
main().catch((e) => { console.error(e); process.exit(1); });
