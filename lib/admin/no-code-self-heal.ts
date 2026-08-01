/**
 * no-code-self-heal.ts — "MOMO อัพเดท PR ตามหลัง → งาน NO CODE ที่เข้าระบบแล้ว
 * กลับเข้า flow เอง" (owner 2026-08-02)
 *
 * owner (verbatim จากจอจริง): *"แล้วเวลา MOMO มีอัพเดทอะไร งานที่เราเอาเข้าระบบ
 * ไปแล้ว จะอัพเดทตามด้วยไหมเนี่ยครับ"* — เดิมคำตอบคือ "ไม่": แถว fstatus='99'
 * นำเข้าแล้วนอนรอคนกด "ใส่ PR → กลับเข้า flow" มือเดียวตลอดกาล แม้ MOMO จะเติม
 * รหัสลูกค้าให้ทีหลัง (cron sync refresh staging `raw`/`momo_user_*` + บอร์ด Live
 * `momo_box_detail.member_code` อยู่ทุกรอบอยู่แล้ว — แต่ไม่มีใครเอาค่าใหม่มาใช้).
 *
 * pass นี้ (รันใน cron momo-sync ทุกรอบ · best-effort):
 *   1. กวาดแถว tb_forwarder fstatus='99' ไร้เจ้าของ (แถวที่มี staging backlink)
 *   2. resolve PR ด้วย **สมองเดียวกับด่าน commit** (firstResolvableMomoPr):
 *      admin_patch → raw → คอลัมน์ momo_user_* → แถวหลักของชิปเม้น → บอร์ด Live
 *   3. เจอ PR จริง (^PR\d+$) → `activateNoCodeOwner` (ด่านเดิมครบ: tb_users ·
 *      เงินศูนย์ · TOCTOU · ตั้งราคา+แตกกล่องเครื่องเดิม)
 *   4. ไม่เจอ → ปล่อยไว้ในกองสถานะพิเศษตามเดิม (รอคน/รอ MOMO รอบถัดไป)
 *
 * fail-soft ทุกชั้น — พังแถวไหนข้ามแถวนั้น · pass พังทั้งก้อนห้ามล้ม cron.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { firstResolvableMomoPr, normalizeMomoPrCode } from "@/lib/admin/momo-raw-helpers";
import { baseOf as momoBaseOf } from "@/lib/integrations/momo-web/split-box-rows-plan";
import { activateNoCodeOwner } from "@/lib/admin/activate-no-code-owner";

type StagingIdentityRow = {
  id: string;
  momo_tracking_no: string;
  tracking_override: string | null;
  admin_patch: Record<string, unknown> | null;
  raw: unknown;
  momo_user_group: string | null;
  momo_user_code: string | null;
  committed_forwarder_id: number | null;
};

const IDENTITY_COLS =
  "id, momo_tracking_no, tracking_override, admin_patch, raw, momo_user_group, momo_user_code, committed_forwarder_id";

/** PR จากแหล่งบนแถว staging เอง — ลำดับเดียวกับด่าน commit ข้อ 1b เป๊ะ. */
function resolveFromStagingRow(row: Pick<StagingIdentityRow, "admin_patch" | "raw" | "momo_user_group" | "momo_user_code">): string | null {
  const ap = row.admin_patch && typeof row.admin_patch === "object" ? row.admin_patch : {};
  const rawObj = row.raw && typeof row.raw === "object" ? (row.raw as Record<string, unknown>) : {};
  return firstResolvableMomoPr([
    [ap.user_group, ap.user_code],
    [rawObj.user_group, rawObj.user_code],
    [row.momo_user_group, row.momo_user_code],
  ]);
}

export type NoCodeHealSummary = {
  scanned: number;
  resolved: number;
  activated: number;
  failed: number;
  perRow: Array<{ fId: number; tracking: string; pr?: string; source?: string; outcome: string }>;
};

export async function healNoCodeOwners(
  admin: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<NoCodeHealSummary> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const summary: NoCodeHealSummary = { scanned: 0, resolved: 0, activated: 0, failed: 0, perRow: [] };

  // 1) แถว 99 ไร้เจ้าของ (ใหม่สุดก่อน — ของใหม่คือของที่ MOMO ยังขยับข้อมูลอยู่)
  // กรอง "ไร้เจ้าของ" ใน JS — ค่าใน DB มีทั้ง null และ "" (PostgREST `.or` กับ
  // ค่าว่างเปล่าเปราะต่อ grammar · core ตรวจซ้ำก่อนเขียนอยู่แล้ว).
  const { data: fwds, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, ftrackingchn, userid")
    .eq("fstatus", "99")
    .order("id", { ascending: false })
    .limit(limit);
  if (fwdErr) {
    console.error("[healNoCodeOwners fwd scan] failed", { code: fwdErr.code, message: fwdErr.message });
    return summary;
  }
  const rows = ((fwds ?? []) as Array<{ id: number; ftrackingchn: string | null; userid: string | null }>)
    .filter((r) => !(r.userid ?? "").trim());
  summary.scanned = rows.length;
  if (rows.length === 0) return summary;

  // 2) staging ของแถวเหล่านั้น (backlink committed_forwarder_id)
  const stagingByFid = new Map<number, StagingIdentityRow>();
  for (let i = 0; i < rows.length; i += 100) {
    const part = rows.slice(i, i + 100).map((r) => r.id);
    const { data: st, error: stErr } = await admin
      .from("momo_import_tracks")
      .select(IDENTITY_COLS)
      .in("committed_forwarder_id", part);
    if (stErr) {
      console.error("[healNoCodeOwners staging scan] failed", { code: stErr.code, message: stErr.message });
      continue;
    }
    for (const s of (st ?? []) as StagingIdentityRow[]) {
      if (s.committed_forwarder_id != null) stagingByFid.set(s.committed_forwarder_id, s);
    }
  }

  // เตรียม base ต่อแถว (ยึดเลขที่ activate จะใช้จริง: override ก่อนเลขดิบ —
  // แถว tb_forwarder เก็บเลขสุดท้ายอยู่แล้วใน ftrackingchn จึงใช้ตัวนั้นเป็นหลัก)
  const baseOfFid = new Map<number, string>();
  for (const r of rows) {
    const st = stagingByFid.get(r.id);
    const tracking = (r.ftrackingchn ?? "").trim()
      || (st ? ((st.tracking_override ?? "").trim() || st.momo_tracking_no) : "");
    if (tracking) baseOfFid.set(r.id, momoBaseOf(tracking));
  }

  // 3) แหล่งเสริมระดับครอบครัว: แถวหลักของชิปเม้น + บอร์ด Live (batch ต่อ base)
  const bases = Array.from(new Set(baseOfFid.values()));
  const basePr = new Map<string, { pr: string; source: string }>();
  for (let i = 0; i < bases.length; i += 100) {
    const part = bases.slice(i, i + 100);
    const { data: baseRows, error: baseErr } = await admin
      .from("momo_import_tracks")
      .select(IDENTITY_COLS)
      .in("momo_tracking_no", part);
    if (baseErr) {
      console.error("[healNoCodeOwners base scan] failed", { code: baseErr.code, message: baseErr.message });
    } else {
      for (const b of (baseRows ?? []) as StagingIdentityRow[]) {
        const pr = resolveFromStagingRow(b);
        if (pr && !basePr.has(b.momo_tracking_no)) basePr.set(b.momo_tracking_no, { pr, source: "base_row" });
      }
    }
    const { data: liveRows, error: liveErr } = await admin
      .from("momo_box_detail")
      .select("base_tracking, member_code")
      .in("base_tracking", part);
    if (liveErr) {
      console.error("[healNoCodeOwners live scan] failed", { code: liveErr.code, message: liveErr.message });
    } else {
      for (const lv of (liveRows ?? []) as Array<{ base_tracking: string; member_code: string | null }>) {
        const pr = normalizeMomoPrCode(lv.member_code);
        if (pr && !basePr.has(lv.base_tracking)) basePr.set(lv.base_tracking, { pr, source: "live_board" });
      }
    }
  }

  // 4) resolve ต่อแถว → activate (ด่านเต็มอยู่ใน activateNoCodeOwner)
  for (const r of rows) {
    const st = stagingByFid.get(r.id);
    const tracking = (r.ftrackingchn ?? "").trim() || st?.momo_tracking_no || "";
    let pr: string | null = null;
    let source = "";
    if (st) {
      pr = resolveFromStagingRow(st);
      if (pr) source = "staging";
    }
    if (!pr) {
      const viaBase = basePr.get(baseOfFid.get(r.id) ?? "");
      if (viaBase) ({ pr, source } = viaBase);
    }
    if (!pr) continue; // NO CODE จริง — รอ MOMO/คน รอบถัดไป

    summary.resolved += 1;
    try {
      const res = await activateNoCodeOwner(admin, {
        fId: r.id,
        newUserId: pr,
        legacyAdminId: "momo-cron",
      });
      if (res.ok) {
        summary.activated += 1;
        summary.perRow.push({ fId: r.id, tracking, pr, source, outcome: `activated→${res.data.nextStatus}` });
        console.log(`[healNoCodeOwners] #${r.id} ${tracking} → ${pr} (${source}) กลับเข้า flow (fstatus=${res.data.nextStatus})`);
      } else {
        summary.failed += 1;
        summary.perRow.push({ fId: r.id, tracking, pr, source, outcome: `refused: ${res.error}` });
        console.error(`[healNoCodeOwners] #${r.id} ${tracking} → ${pr} refused`, { error: res.error });
      }
    } catch (error) {
      summary.failed += 1;
      summary.perRow.push({ fId: r.id, tracking, pr, source, outcome: "threw" });
      console.error("[healNoCodeOwners activate threw]", { fId: r.id, error });
    }
  }

  return summary;
}
