/**
 * link-ttw-staged-to-forwarder-2026-07-25.ts — "อัพเดท" ฝั่งที่อัตโนมัติได้ (owner
 * 2026-07-25 "จับคู่ อัพเดทให้หน่อยครับ") สำหรับแถว staging 4 ตู้อี้อูใหม่ที่
 * **มี tb_forwarder อยู่แล้ว** (CS คีย์จากใบส่งของไปก่อนแล้ว).
 *
 * ทำ 3 อย่าง = logic เดียวกับปุ่ม "เอาเข้าระบบ" ของภูม (adminCreateForwarderFromTtwStaging
 * แขนง link-existing · 2026-07-25) — MONEY-FREE ทั้งหมด:
 *   1. ผูกเลขตู้จริง (ชื่อไฟล์ packing list) → fcabinetnumber เฉพาะแถวที่ **ว่าง + ไม่ล็อก**
 *      ผ่าน cabinetWriteGuard (กติกา cabinet-class — ทุก write path ต้องผ่าน)
 *   2. เลื่อนสถานะ 1/2 → 3 "กำลังส่งมาไทย" + stamp fdatestatus3 (ปิดตู้แล้ว = อยู่บนเรือ)
 *      — ไม่แตะแถว ≥4 (ถึงไทย/บิลแล้ว) · ไม่ถอยสถานะ · ครอบทั้ง base + box-split
 *   3. ttw_packing_line.committed_forwarder_id → ชี้แถวจริง (staging รู้ว่าเชื่อมแล้ว
 *      → หน้า TTW นับ "เข้าระบบแล้ว" ถูก · ปุ่มภูมไม่โผล่ซ้ำ)
 *
 * แถวที่ **ไม่มี** ใน tb_forwarder (PR269 · PR596 · PR10830) = ต้องสร้าง billable ใหม่
 * (auto-price = เงิน) → **ไม่ทำในสคริปต์** — DOC กดปุ่มบนหน้า TTW ตามโฟลว์ภูม
 * ("create จริง = ภูม/DOC กด · ยืนยัน CS ก่อน").
 *
 * RUN: SUPABASE_DB_PASSWORD='…' ./node_modules/.bin/tsx scripts/link-ttw-staged-to-forwarder-2026-07-25.ts [--apply]
 */
import { writeFileSync } from "node:fs";
import pg from "pg";
import { cabinetWriteGuard } from "../lib/forwarder/cabinet-class";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }

// รอบ 2 (audit ฝั่งอี้อู · owner "คีย์เข้าระบบกับแพคกิ้งยังแยกกัน"): ครอบ**ทุกตู้**ใน staging
// ไม่ใช่แค่ 4 ตู้ใหม่ — เจอ 8 แถวเก่าที่มีของจริงในระบบแล้วแต่ pointer ไม่เคยถูกผูก
// (คีย์ผ่านหน้า yiwu โดยตรง → หน้า TTW เลยโชว์ "ยังไม่เข้าระบบ" ทั้งที่เข้าแล้ว).
const CONTAINERS: string[] = []; // ว่าง = ทุกตู้ใน ttw_packing_line
const escLike = (s: string) => s.replace(/[%_\\]/g, "\\$&");

async function main() {
  const c = new pg.Client({
    connectionString: `postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(PW!)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await c.connect();

  // staging แถวที่จับคู่ PR แล้ว + ยังไม่เชื่อม (CONTAINERS ว่าง = ทุกตู้)
  const { rows: staged } = await c.query(
    `SELECT id, container_no, base_tracking, member_code
       FROM ttw_packing_line
      WHERE ($1::text[] = '{}' OR container_no = ANY($1))
        AND member_code IS NOT NULL AND committed_forwarder_id IS NULL
        AND coalesce(pr_source,'') <> 'hold_verify' -- 🚩 owner 2026-08-07: แถวปักธงรอตรวจ ห้ามเชื่อมอัตโนมัติ
      ORDER BY container_no, base_tracking`,
    [CONTAINERS],
  );

  type Plan = {
    stagingId: number; container: string; track: string; pr: string;
    fids: number[]; linkFid: number; cabinetFill: number; advance: number; note: string[];
  };
  const plans: Plan[] = [];
  const skipped: Array<{ แทรค: string; PR: string; เหตุ: string }> = [];

  for (const s of staged as Array<{ id: number; container_no: string; base_tracking: string; member_code: string }>) {
    const track = s.base_tracking.trim();
    const { rows: fam } = await c.query(
      `SELECT id, userid, fstatus, fcabinetnumber, fcabinet_locked
         FROM tb_forwarder
        WHERE ftrackingchn = $1 OR ftrackingchn LIKE $2
        ORDER BY id`,
      [track, `${escLike(track)}-%`],
    );
    if (fam.length === 0) {
      skipped.push({ แทรค: track, PR: s.member_code, เหตุ: "ยังไม่มีในระบบ → DOC กดสร้างบนหน้า TTW (auto-price = คนกด)" });
      continue;
    }
    const rows = fam as Array<{ id: number; userid: string | null; fstatus: string; fcabinetnumber: string; fcabinet_locked: boolean }>;
    // กันจับคู่ผิดคน: userid บนแถวจริงต้องตรง PR ที่ staging จับไว้
    const wrongOwner = rows.filter((r) => (r.userid ?? "").trim() !== s.member_code);
    if (wrongOwner.length) {
      skipped.push({ แทรค: track, PR: s.member_code, เหตุ: `userid แถวจริง (${wrongOwner[0]!.userid}) ไม่ตรง — ห้ามเดา ให้ CS ตรวจ` });
      continue;
    }
    const note: string[] = [];
    const guard = cabinetWriteGuard({ next: s.container_no, current: "" });
    let cabinetFill = 0;
    if (!guard.ok) note.push(`⛔ guard ตู้: ${guard.reason}`);
    else cabinetFill = rows.filter((r) => (r.fcabinetnumber ?? "").trim() === "" && !r.fcabinet_locked).length;
    const advance = rows.filter((r) => r.fstatus === "1" || r.fstatus === "2").length;
    const already = rows.filter((r) => Number(r.fstatus) >= 4).length;
    if (already) note.push(`${already} แถว fstatus≥4 — ไม่แตะ`);
    plans.push({
      stagingId: s.id, container: s.container_no, track, pr: s.member_code,
      fids: rows.map((r) => r.id), linkFid: rows[0]!.id, cabinetFill, advance, note,
    });
  }

  console.log(`\n━━ LINK PLAN — staging → tb_forwarder (${plans.length} แทรค · ${skipped.length} ข้าม) ━━`);
  console.table(plans.map((p) => ({
    ตู้: p.container, แทรค: p.track, PR: p.pr, แถวจริง: p.fids.join(","),
    ผูกตู้: p.cabinetFill, "เลื่อน→3": p.advance, หมายเหตุ: p.note.join(" · ") || "—",
  })));
  if (skipped.length) { console.log("ข้าม (ไม่แตะ):"); console.table(skipped); }

  if (!APPLY) { console.log("\n(dry-run — pass --apply)"); await c.end(); return; }

  // backup แถวจริงก่อนแตะ
  const allFids = plans.flatMap((p) => p.fids);
  const { rows: before } = await c.query(`SELECT * FROM tb_forwarder WHERE id = ANY($1)`, [allFids]);
  writeFileSync(`/tmp/backup-link-ttw-2026-07-25.json`, JSON.stringify(before, null, 2));
  console.log(`📦 backup ${before.length} แถว → /tmp/backup-link-ttw-2026-07-25.json`);

  const today = new Date().toISOString().slice(0, 10);
  await c.query("BEGIN");
  for (const p of plans) {
    if (p.cabinetFill > 0) {
      await c.query(
        `UPDATE tb_forwarder SET fcabinetnumber = $1
          WHERE id = ANY($2) AND coalesce(fcabinetnumber,'') = '' AND fcabinet_locked = false`,
        [p.container, p.fids],
      );
    }
    if (p.advance > 0) {
      await c.query(
        `UPDATE tb_forwarder SET fstatus = '3', fdatestatus3 = $1
          WHERE id = ANY($2) AND fstatus IN ('1','2')`,
        [today, p.fids],
      );
    }
    await c.query(
      `UPDATE ttw_packing_line SET committed_forwarder_id = $1, updated_at = now()
        WHERE id = $2 AND committed_forwarder_id IS NULL`,
      [p.linkFid, p.stagingId],
    );
  }
  await c.query("COMMIT");

  // verify
  const { rows: after } = await c.query(
    `SELECT id, ftrackingchn, userid, fstatus, fcabinetnumber, fdatestatus3 FROM tb_forwarder WHERE id = ANY($1) ORDER BY id`,
    [allFids],
  );
  console.log("\n✅ applied — สภาพหลังอัพเดท:");
  console.table(after);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
