"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { appendStatusLog } from "@/lib/notifications/status-flip-helper";
import { resolveProfileIdForLegacyUserid } from "@/lib/auth/tb-users-resolver";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";

// ─────────────────────────────────────────────────────────────────────────────
// adminBarcodeScan — barcode scanner endpoint behind /admin/barcode/scan-form.tsx
// ─────────────────────────────────────────────────────────────────────────────
//
// 🚨 Tier-A "silent dead-write" fix (2026-06-02 · master-fidelity #1 pattern):
//   Prior implementation looked up + wrote `.from("forwarders")` (REBUILT,
//   EMPTY on prod) and `.from("service_orders")` (REBUILT, EMPTY on prod).
//   Every barcode scan at the warehouse / driver truck returned "ไม่พบรายการ"
//   or worked once (when a stray rebuilt row existed) then never again.
//   Real cargo state lives in `tb_forwarder` (47k+ rows) + `tb_header_order`
//   (21,950 rows).
//
// Fix: pivot the lookup + write to tb_forwarder / tb_header_order with the
//   legacy column names + legacy single-char status enum. Mirrors the
//   canonical writer pattern from `actions/admin/barcode-import.ts` (intake
//   scanner) — same `tb_log_forwarder_status` append on flip + same per-role
//   `canAnyRoleFlipFstatus` matrix gate.
//
// Legacy `gateway.php` semantics:
//   - lookup mode = read-only dispatch (gateway.php?type=all / ?type=from)
//   - intake      = pcs-admin/barcode-c-import.php arrival flow → fstatus '4'
//   - prepare     = pcs-admin/barcode-d-prepare.php → fstatus '6' (เตรียมส่ง)
//   - driver      = pcs-admin/barcode-d-driver.php → fstatus '7' (ส่งสำเร็จ)
//                   (also handles '6' if currently '7' → 'undeliver' edge)
//
// service_order (tb_header_order) semantics:
//   - intake  = hstatus '4' (รอร้านจีนจัดส่ง · awaiting_chn_dispatch)
//   - prepare/driver = hstatus '5' (สำเร็จ · completed)
//
// `lookup` = the legacy `barcode-c-all` / `barcode-c-from` "search-only"
// modes. Returns ref info + current status, makes no state change.
// `intake` / `prepare` / `driver` = the legacy `barcode-c-import` flow that
// flips fStatus (4 / 6 / 7 in legacy → arrived_thailand / out_for_delivery /
// delivered here).
const scanSchema = z.object({
  mode: z.enum(["lookup", "intake", "prepare", "driver"]),
  code: z.string().trim().min(1).max(200),
});

const STATUS_LABEL: Record<string, string> = {
  pending_payment:       "รอชำระเงิน",
  shipped_china:         "สินค้าออกจากจีน",
  in_transit:            "ขนส่งกลางทาง",
  arrived_thailand:      "เข้าโกดังไทยแล้ว",
  out_for_delivery:      "กำลังจัดส่ง",
  delivered:             "ส่งสำเร็จ",
  cancelled:             "ยกเลิก",
  awaiting_chn_dispatch: "รอจัดส่งจากจีน",
  completed:             "สำเร็จ",
};

// ── Legacy fstatus → rebuilt label (for the UI message + before/after fields) ──
const TB_FSTATUS_LABEL: Record<string, string> = {
  "1":  "รอเข้าโกดังจีน",
  "2":  "ถึงโกดังจีน",
  "3":  "ขนส่งกลางทาง",
  "4":  "ถึงไทยแล้ว",
  "5":  "รอชำระเงิน",
  "6":  "เตรียมส่ง",
  "7":  "ส่งสำเร็จ",
  "99": "สถานะพิเศษ",
};
const TB_HSTATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้า",
  "4": "รอร้านจีนจัดส่ง",
  "5": "สำเร็จ",
  "6": "ยกเลิกออเดอร์",
};
// Map tb fstatus → rebuilt label key (for backward-compatible BarcodeScanResult)
const TB_FSTATUS_TO_REBUILT: Record<string, string> = {
  "1":  "pending_payment",
  "2":  "shipped_china",
  "3":  "in_transit",
  "4":  "arrived_thailand",
  "5":  "pending_payment",     // legacy "รอชำระเงิน" maps to rebuilt pending_payment label
  "6":  "out_for_delivery",
  "7":  "delivered",
  "99": "cancelled",
};
const TB_HSTATUS_TO_REBUILT: Record<string, string> = {
  "1": "pending",
  "2": "awaiting_payment",
  "3": "ordered",
  "4": "awaiting_chn_dispatch",
  "5": "completed",
  "6": "cancelled",
};

export type BarcodeScanResult = {
  message: string;
  ref_type: "forwarder" | "service_order";
  ref_no: string;
  member_code: string | null;
  customer_name: string | null;
  before_status: string;
  after_status: string;
};

export async function adminBarcodeScan(
  input: z.infer<typeof scanSchema>,
): Promise<AdminActionResult<BarcodeScanResult>> {
  const parsed = scanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { mode, code } = parsed.data;

  // Warehouse staff scan at intake / prepare (legacy `Cargo/Warehouse`
  // role); driver staff scan at the truck. Super covers everything.
  // Accounting + ops kept for back-office mis-scan recovery.
  return withAdmin(
    ["ops", "warehouse", "driver", "accounting", "super"],
    async ({ adminId }): Promise<AdminActionResult<BarcodeScanResult>> => {
    const admin = createAdminClient();
    const adminIdSafe = safeLegacyAdminId(adminId, 10);

    // ── Try tb_forwarder ──────────────────────────────────────────────────
    // Legacy lookup matches against: fidorco (the f_no equivalent),
    // ftrackingchn, ftrackingth, fcabinetnumber.
    // PostgREST .or() takes a comma-separated string with `field.eq.value`.
    // Code is trimmed already (Zod). We escape commas (rare) by wrapping
    // in encodeURIComponent — but simpler is the literal eq series.
    // Code may contain reserved chars; tb_forwarder.fidorco / tracking
    // columns are simple ASCII so a raw .or() is safe.
    const orFilter =
      `fidorco.eq.${code},ftrackingchn.eq.${code},ftrackingth.eq.${code},fcabinetnumber.eq.${code}`;
    const { data: f, error: fErr } = await admin
      .from("tb_forwarder")
      .select("id, fidorco, userid, fstatus")
      .or(orFilter)
      .limit(1)
      .maybeSingle<{
        id: number;
        fidorco: string | null;
        userid: string;
        fstatus: string;
      }>();
    if (fErr) {
      console.error(`[tb_forwarder barcode lookup] failed`, {
        code: fErr.code, message: fErr.message, scanCode: code,
      });
    }

    if (f) {
      const fNoDisplay = f.fidorco ?? String(f.id);

      // Pull profile / customer info — resolveProfileIdForLegacyUserid
      // gets us the profile_id for the notification dispatch + a separate
      // profiles read gives us the display fields.
      const profileId = await resolveProfileIdForLegacyUserid(f.userid).catch((err) => {
        console.error(`[tb_users resolver] failed in barcode scan`, {
          error: err instanceof Error ? err.message : String(err), userid: f.userid,
        });
        return null;
      });
      let memberCode: string | null = null;
      let customerName: string | null = null;
      if (profileId) {
        const { data: profile, error: profileErr } = await admin
          .from("profiles")
          .select("member_code, first_name, last_name")
          .eq("id", profileId)
          .maybeSingle<{ member_code: string | null; first_name: string | null; last_name: string | null }>();
        if (profileErr) {
          console.error(`[profiles] barcode scan profile read failed`, {
            code: profileErr.code, message: profileErr.message, profileId,
          });
        }
        memberCode   = profile?.member_code ?? null;
        customerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null;
      }

      // Lookup mode — no state change, just return the current ref.
      if (mode === "lookup") {
        const beforeLabel = TB_FSTATUS_TO_REBUILT[f.fstatus] ?? f.fstatus;
        return {
          ok: true,
          data: {
            message:       `${fNoDisplay} — ${TB_FSTATUS_LABEL[f.fstatus] ?? f.fstatus}`,
            ref_type:      "forwarder",
            ref_no:        fNoDisplay,
            member_code:   memberCode,
            customer_name: customerName,
            before_status: beforeLabel,
            after_status:  beforeLabel,
          },
        };
      }

      // Decide the target legacy fstatus.
      //   intake  → '4' (ถึงไทยแล้ว)
      //   prepare → '6' (เตรียมส่ง)
      //   driver  → '7' (ส่งสำเร็จ) if currently '6'; else '6' (legacy un-deliver edge)
      const newFstatus =
        mode === "intake"  ? "4" :
        mode === "prepare" ? "6" :
        (f.fstatus === "6" ? "7" : "6");

      // Skip if already at target status
      if (f.fstatus === newFstatus) {
        return {
          ok: false,
          error: `${fNoDisplay} อยู่ที่สถานะ "${TB_FSTATUS_LABEL[newFstatus] ?? newFstatus}" แล้ว`,
        };
      }

      // Per-row role gate — barcode scan is one of the most permissive flows
      // (warehouse owns 3→4 / 4→3 etc · driver owns 6→7) but a mistake here
      // is expensive (mass-flip from a scanner glitch). canAnyRoleFlipFstatus
      // enforces the legacy matrix.
      const callerRoles = (await getAdminRoles()) ?? [];
      if (!canAnyRoleFlipFstatus(callerRoles, f.fstatus, newFstatus)) {
        return {
          ok: false,
          error: `forbidden_transition: บัญชีของคุณไม่มีสิทธิ์เปลี่ยนสถานะ ${f.fstatus}→${newFstatus} — ติดต่อผู้ดูแลระบบ`,
        };
      }

      const nowIso = new Date().toISOString();
      const update: Record<string, unknown> = {
        fstatus:          newFstatus,
        fdateadminstatus: nowIso,
        adminidupdate:    adminIdSafe,
      };
      if (newFstatus === "4") update.fdatestatus4 = nowIso;
      if (newFstatus === "6") update.fdatestatus6 = nowIso;
      if (newFstatus === "7") update.fdatestatus7 = nowIso;

      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update(update)
        .eq("id", f.id);
      if (updErr) {
        console.error(`[tb_forwarder barcode UPDATE] failed`, {
          code: updErr.code, message: updErr.message, id: f.id, newFstatus,
        });
        return { ok: false, error: updErr.message };
      }

      // Best-effort status-log row (legacy parity — every fstatus flip
      // appends to tb_log_forwarder_status). A log insert failure does NOT
      // roll back the UPDATE that already succeeded.
      await appendStatusLog(admin, f.id, f.fstatus, newFstatus, adminIdSafe);

      await logAdminAction(adminId, `barcode.${mode}`, "tb_forwarder", String(f.id), {
        code, before_fstatus: f.fstatus, after_fstatus: newFstatus,
      });

      // Customer notification — best-effort, profileId may be null when
      // the legacy customer never bridged into profiles (~150 of 8898).
      if (profileId) {
        const afterRebuilt = TB_FSTATUS_TO_REBUILT[newFstatus] ?? newFstatus;
        void sendNotification(profileId, {
          category:       "forwarder",
          severity:       newFstatus === "7" ? "success" : "info",
          title:          `ฝากนำเข้า ${fNoDisplay} อัพเดทแล้ว`,
          body:           `สถานะ: ${TB_FSTATUS_LABEL[newFstatus] ?? newFstatus}`,
          link_href:      `/service-import/${fNoDisplay}`,
          reference_type: "forwarder",
          reference_id:   String(f.id),
        });
        void afterRebuilt; // unused in current payload but kept for future template hook
      }

      revalidatePath("/admin/forwarders");
      revalidatePath("/admin/barcode");

      const beforeLabel = TB_FSTATUS_TO_REBUILT[f.fstatus] ?? f.fstatus;
      const afterLabel  = TB_FSTATUS_TO_REBUILT[newFstatus] ?? newFstatus;
      return {
        ok: true,
        data: {
          message:       `${fNoDisplay} → ${TB_FSTATUS_LABEL[newFstatus] ?? newFstatus}`,
          ref_type:      "forwarder",
          ref_no:        fNoDisplay,
          member_code:   memberCode,
          customer_name: customerName,
          before_status: beforeLabel,
          after_status:  afterLabel,
        },
      };
    }

    // ── Try tb_header_order ────────────────────────────────────────────────
    // Service-order side: lookup by hno (the h_no equivalent). Legacy
    // barcode flow uses h_no scans on the cart/shop-order completion lane.
    const { data: so, error: soErr } = await admin
      .from("tb_header_order")
      .select("id, hno, userid, hstatus")
      .eq("hno", code)
      .limit(1)
      .maybeSingle<{
        id: number;
        hno: string;
        userid: string;
        hstatus: string | null;
      }>();
    if (soErr) {
      console.error(`[tb_header_order barcode lookup] failed`, {
        code: soErr.code, message: soErr.message, scanCode: code,
      });
    }

    if (so) {
      const currHstatus = so.hstatus ?? "1";
      const profileId = await resolveProfileIdForLegacyUserid(so.userid).catch((err) => {
        console.error(`[tb_users resolver] failed in barcode scan SO`, {
          error: err instanceof Error ? err.message : String(err), userid: so.userid,
        });
        return null;
      });
      let memberCode: string | null = null;
      let customerName: string | null = null;
      if (profileId) {
        const { data: profile, error: profileErr } = await admin
          .from("profiles")
          .select("member_code, first_name, last_name")
          .eq("id", profileId)
          .maybeSingle<{ member_code: string | null; first_name: string | null; last_name: string | null }>();
        if (profileErr) {
          console.error(`[profiles] barcode scan SO profile read failed`, {
            code: profileErr.code, message: profileErr.message, profileId,
          });
        }
        memberCode   = profile?.member_code ?? null;
        customerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null;
      }

      if (mode === "lookup") {
        const beforeLabel = TB_HSTATUS_TO_REBUILT[currHstatus] ?? currHstatus;
        return {
          ok: true,
          data: {
            message:       `${so.hno} — ${TB_HSTATUS_LABEL[currHstatus] ?? currHstatus}`,
            ref_type:      "service_order",
            ref_no:        so.hno,
            member_code:   memberCode,
            customer_name: customerName,
            before_status: beforeLabel,
            after_status:  beforeLabel,
          },
        };
      }

      const newHstatus = mode === "intake" ? "4" : "5";
      if (currHstatus === newHstatus) {
        return {
          ok: false,
          error: `${so.hno} อยู่ที่สถานะ "${TB_HSTATUS_LABEL[newHstatus] ?? newHstatus}" แล้ว`,
        };
      }

      const nowIso = new Date().toISOString();
      const update: Record<string, unknown> = {
        hstatus:       newHstatus,
        hdateupdate:   nowIso,
        adminidupdate: adminIdSafe,
      };
      if (newHstatus === "4") update.hdate4 = nowIso;
      if (newHstatus === "5") update.hdate5 = nowIso;

      const { error: updErr } = await admin
        .from("tb_header_order")
        .update(update)
        .eq("id", so.id);
      if (updErr) {
        console.error(`[tb_header_order barcode UPDATE] failed`, {
          code: updErr.code, message: updErr.message, id: so.id, newHstatus,
        });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, `barcode.${mode}`, "tb_header_order", String(so.id), {
        code, before_hstatus: currHstatus, after_hstatus: newHstatus,
      });

      if (profileId) {
        void sendNotification(profileId, {
          category:       "order",
          severity:       "info",
          title:          `ฝากสั่ง ${so.hno} อัพเดทแล้ว`,
          body:           `สถานะ: ${TB_HSTATUS_LABEL[newHstatus] ?? newHstatus}`,
          link_href:      `/service-order/${so.hno}`,
          reference_type: "service_order",
          reference_id:   String(so.id),
        });
      }

      revalidatePath("/admin/service-orders");
      revalidatePath("/admin/barcode");

      const beforeLabel = TB_HSTATUS_TO_REBUILT[currHstatus] ?? currHstatus;
      const afterLabel  = TB_HSTATUS_TO_REBUILT[newHstatus]  ?? newHstatus;
      return {
        ok: true,
        data: {
          message:       `${so.hno} → ${TB_HSTATUS_LABEL[newHstatus] ?? newHstatus}`,
          ref_type:      "service_order",
          ref_no:        so.hno,
          member_code:   memberCode,
          customer_name: customerName,
          before_status: beforeLabel,
          after_status:  afterLabel,
        },
      };
    }

    return { ok: false, error: "ไม่พบรายการนี้ (ลอง f_no / h_no / tracking CN / tracking TH)" };
  },
  );
}

// Reference: STATUS_LABEL kept as an unused export for backward compat —
// future template hook may consume the rebuilt-string labels for UI text.
void STATUS_LABEL;
