/**
 * dimension-audit.ts — READ-ONLY loader ของ "ประวัติการแก้ขนาด/คิว" ต่อแถว
 * (owner 2026-08-03: "เอา audit log ที่มีคนไปเปลี่ยนขนาดมาขึ้นบอกเลยครับ ใครและเมื่อไร
 *  จะได้ไปสอบถามกันถูกคนครับว่าเพราะอะไร แนะ กันทุจริต ได้ด้วยครับ").
 *
 * 🔒 อ่านอย่างเดียว 100% — ไม่มี insert/update/delete ทั้งไฟล์ ไม่แตะเงิน ไม่แตะสถานะ.
 * กฎการตัดสิน (เปลี่ยนจริง vs กดเซฟซ้ำ · severity · เงินที่ขาด) อยู่ที่
 * `dimension-audit-verdict.ts` (pure + เทสด้วยเลขจริง prod) — ที่นี่แค่ดึงข้อมูล.
 *
 * ─── แหล่งข้อมูล ────────────────────────────────────────────────────────────
 * `admin_audit_log` action **`tb_forwarder.update_dimensions`** (เขียนโดย
 * `actions/admin/forwarders-edit.ts:adminUpdateForwarderDimensions`):
 *   { fNo, before: { fweight, fwidth, flength, fheight, fvolume, … },
 *          after:  { fweight, fwidth, flength, fheight, fvolume, … }, pricing: {…} }
 *   · `admin_id`  = uuid → `profiles.id` (ชื่อ-สกุล)
 *                        + `admin_contact_extras.profile_id` (legacy_admin_id = ล็อกอิน)
 *   · `target_id` = **text** → ต้อง cast `String(fid)` ตอน query (คอลัมน์เป็น text
 *                   แต่ tb_forwarder.id เป็น bigint)
 *   · `created_at`= **UTC** → จอต้อง render ผ่าน `formatThaiDateTime` เท่านั้น
 *
 * เลข MOMO เทียบมาจาก `momo_import_tracks.cbm` ของแถวที่ `committed_forwarder_id = fid`
 * (convention เดียวกับ tb_forwarder.fvolume ตอน commit = ยอดรวมของแถว).
 * ⚠️ ห้ามใช้ `momo_box_detail` — ตารางนั้นปน 2 convention (per-box vs total)
 * จะได้เลขหลอกแล้วขึ้นป้ายกล่าวหาคนผิดๆ.
 *
 * fail-soft ทุกจุด: query พัง → log + คืน Map ว่าง (หน้าฟอร์มราคาต้องไม่ล้มเพราะ
 * ฟีเจอร์ตรวจสอบ).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  toDimensionAuditEntry,
  type DimensionAuditEntry,
} from "./dimension-audit-verdict";

/** action ที่ฟอร์ม "บันทึกขนาด" เขียนลง admin_audit_log */
const DIMENSION_ACTION = "tb_forwarder.update_dimensions";

/** ขนาด chunk ของ `.in(...)` — กัน URL ยาวเกินของ PostgREST */
const ID_CHUNK = 200;

type AuditLogRow = {
  id: number | string | null;
  admin_id: string | null;
  target_id: string | null;
  payload: unknown;
  created_at: string | null;
};

type SnapshotPayload = {
  fwidth?: unknown;
  flength?: unknown;
  fheight?: unknown;
  fvolume?: unknown;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeFids(fids: number[]): number[] {
  return [...new Set(fids.filter((n) => Number.isFinite(n) && n > 0))];
}

/** ดึง before/after ออกจาก payload — คืน null ถ้ารูปไม่ตรง (ข้ามแถวนั้น ไม่เดา) */
function readSnapshots(
  payload: unknown,
): { before: SnapshotPayload; after: SnapshotPayload } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { before?: unknown; after?: unknown };
  if (!p.before || typeof p.before !== "object") return null;
  if (!p.after || typeof p.after !== "object") return null;
  return { before: p.before as SnapshotPayload, after: p.after as SnapshotPayload };
}

/**
 * ชื่อ + ล็อกอิน ของผู้แก้ไข จาก admin_id (uuid) — batch ครั้งเดียวทั้งชุด.
 * ทั้งสอง query fail-soft: หาไม่เจอ = ปล่อยว่าง (ประวัติยังโชว์เวลา/ค่าที่เปลี่ยนได้).
 */
async function loadEditorLabels(
  admin: SupabaseClient,
  adminIds: string[],
): Promise<Map<string, { name: string; login: string }>> {
  const out = new Map<string, { name: string; login: string }>();
  const ids = [...new Set(adminIds.filter((s) => typeof s === "string" && s.trim() !== ""))];
  if (ids.length === 0) return out;

  for (const part of chunk(ids, ID_CHUNK)) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", part);
    if (error) {
      console.error("[loadEditorLabels profiles] failed", { code: error.code, message: error.message });
      continue; // fail-soft ต่อ chunk
    }
    for (const p of (data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
      out.set(p.id, { name, login: out.get(p.id)?.login ?? "" });
    }
  }

  for (const part of chunk(ids, ID_CHUNK)) {
    const { data, error } = await admin
      .from("admin_contact_extras")
      .select("profile_id, legacy_admin_id")
      .in("profile_id", part);
    if (error) {
      console.error("[loadEditorLabels admin_contact_extras] failed", { code: error.code, message: error.message });
      continue;
    }
    for (const e of (data ?? []) as { profile_id: string | null; legacy_admin_id: string | null }[]) {
      if (!e.profile_id) continue;
      const prev = out.get(e.profile_id);
      out.set(e.profile_id, {
        name: prev?.name ?? "",
        login: (e.legacy_admin_id ?? "").trim(),
      });
    }
  }

  return out;
}

/**
 * ประวัติการแก้ขนาด/คิว ต่อ tb_forwarder.id — เรียง **ใหม่→เก่า**.
 * แถวที่ไม่เคยถูกแก้จะไม่มี key ใน Map เลย (จอจะได้ไม่ต้องโชว์อะไรรก).
 *
 * @param fids tb_forwarder.id ของแถวที่จอกำลังแสดง (batch เดียว — ห้าม N+1)
 */
export async function loadDimensionAuditTrail(
  admin: SupabaseClient,
  fids: number[],
): Promise<Map<number, DimensionAuditEntry[]>> {
  const out = new Map<number, DimensionAuditEntry[]>();
  const ids = normalizeFids(fids);
  if (ids.length === 0) return out;

  const rows: AuditLogRow[] = [];
  for (const part of chunk(ids, ID_CHUNK)) {
    // 🔴 ต้องใช้ fetchAllRows — PostgREST ตัดที่ **1,000 แถวเสมอ** ไม่ว่าจะใส่
    // `.limit()` เท่าไร (กติกาโปรเจกต์ · CLAUDE.md 2026-07-29 "รายงานตู้หาย 6 ตู้").
    // 200 fid × 8 ครั้ง/แถว (prod เคสหนักสุด) = 1,600 แถว > cap ⇒ ถ้าใช้ .limit()
    // ประวัติเก่าจะหายเงียบ และร้ายกว่านั้นคือ `anyReduction` ใน verdict อาจพลิก
    // alert→watch = ป้ายเตือนหายทั้งที่ควรขึ้น.
    //
    // target_id เป็น text → ต้อง cast ฝั่งเราเอง (tb_forwarder.id เป็นตัวเลข).
    // `.order("id")` ต่อท้าย = tie-breaker ที่ unique — จำเป็นสำหรับการ paging
    // (created_at ซ้ำกันได้ · ไม่มี tie-breaker = หน้าซ้ำ/ข้ามแถว).
    const { data, error } = await fetchAllRows<AuditLogRow>(() =>
      admin
        .from("admin_audit_log")
        .select("id, admin_id, target_id, payload, created_at")
        .eq("action", DIMENSION_ACTION)
        .in("target_id", part.map(String))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
    );
    if (error) {
      console.error("[loadDimensionAuditTrail admin_audit_log] failed", {
        code: error.code, message: error.message, fidCount: part.length,
      });
      // fail-soft ต่อ chunk — บาง chunk พังไม่ควรกลบทั้งหน้า. fetchAllRows คืน
      // แถวที่ดึงได้ก่อนพังมาด้วย → เก็บไว้ (ประวัติบางส่วน ดีกว่าไม่มีเลย)
      rows.push(...(data ?? []));
      continue;
    }
    rows.push(...(data ?? []));
  }
  if (rows.length === 0) return out;

  const labels = await loadEditorLabels(
    admin,
    rows.map((r) => r.admin_id ?? "").filter((s) => s !== ""),
  );

  for (const r of rows) {
    const fid = Number(r.target_id);
    if (!Number.isFinite(fid) || fid <= 0) continue;
    const snap = readSnapshots(r.payload);
    if (!snap) continue; // payload รูปไม่ตรง = ข้าม (ห้ามเดาค่า)
    const label = r.admin_id ? labels.get(r.admin_id) : undefined;
    const entry = toDimensionAuditEntry({
      at: r.created_at ?? "",
      adminName: label?.name ?? "",
      adminLogin: label?.login ?? "",
      before: {
        width: snap.before.fwidth,
        length: snap.before.flength,
        height: snap.before.fheight,
        cbm: snap.before.fvolume,
      },
      after: {
        width: snap.after.fwidth,
        length: snap.after.flength,
        height: snap.after.fheight,
        cbm: snap.after.fvolume,
      },
    });
    const list = out.get(fid);
    if (list) list.push(entry);
    else out.set(fid, [entry]);
  }

  // ใหม่→เก่า (query สั่ง order ไว้แล้ว แต่ chunk/page หลายรอบทำให้ลำดับรวมไม่การันตี)
  for (const list of out.values()) {
    list.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }
  return out;
}

/**
 * คิวที่ MOMO วัด (ยอดรวมของแถว) ต่อ tb_forwarder.id — จาก staging ที่ backlink มา.
 *
 * ⚠️ ถ้ามี staging **มากกว่า 1 แถว** ชี้มาที่ forwarder เดียวกัน = ผิดปกติ (ปกติ 1:1)
 * → **ข้ามแถวนั้น** ไม่คืนเลข (ยอมไม่เตือน ดีกว่าเตือนผิดแล้วไปกล่าวหาคน).
 */
export async function loadMomoCbmByForwarderId(
  admin: SupabaseClient,
  fids: number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const ids = normalizeFids(fids);
  if (ids.length === 0) return out;

  const byFid = new Map<number, number[]>();
  for (const part of chunk(ids, ID_CHUNK)) {
    // fetchAllRows + `.order("id")` ตามกติกา 1,000-แถว (ปกติ backlink เป็น 1:1 จึง
    // ≤ จำนวน fid — แต่ถ้าข้อมูลผิดปกติจะได้ไม่ถูกตัดเงียบแล้วนับ "ซ้ำ" พลาด).
    const { data, error } = await fetchAllRows<{
      committed_forwarder_id: number | string | null;
      cbm: unknown;
    }>(() =>
      admin
        .from("momo_import_tracks")
        .select("id, committed_forwarder_id, cbm")
        .in("committed_forwarder_id", part)
        .order("id", { ascending: true }),
    );
    if (error) {
      console.error("[loadMomoCbmByForwarderId] failed", {
        code: error.code, message: error.message, fidCount: part.length,
      });
      continue; // fail-soft — ไม่มีเลข MOMO = verdict จะไม่ขึ้น alert เอง
    }
    for (const s of data ?? []) {
      const fid = Number(s.committed_forwarder_id);
      if (!Number.isFinite(fid) || fid <= 0) continue;
      const cbm = typeof s.cbm === "number" ? s.cbm : parseFloat(String(s.cbm ?? ""));
      const list = byFid.get(fid);
      if (list) list.push(Number.isFinite(cbm) ? cbm : 0);
      else byFid.set(fid, [Number.isFinite(cbm) ? cbm : 0]);
    }
  }

  for (const [fid, values] of byFid) {
    if (values.length !== 1) {
      console.warn("[loadMomoCbmByForwarderId] staging ชี้มาแถวเดียวกันหลายรายการ — ข้าม", {
        fid, count: values.length,
      });
      continue;
    }
    if (values[0] > 0) out.set(fid, values[0]);
  }
  return out;
}
