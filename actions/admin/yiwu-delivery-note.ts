"use server";

/**
 * Admin > อี้อู (Yiwu) > "ใบส่งของ" — create BOX-SPLIT tb_forwarder rows from a
 * Yiwu delivery-note (2026-07-16 · ภูม · Phase 3).
 *
 * THE FLOW
 * ────────
 * Yiwu warehouse has NO API. When goods arrive at the China warehouse it sends a
 * ใบส่งของ (delivery-note) IMAGE. Staff OCR-read it (staff corrects the grid), then
 * commit → this action. Each ใบส่งของ row is a box-GROUP with its OWN dims; because a
 * box-group's price = max(actual, volumetric) per group, groups with different dims
 * MUST become SEPARATE tb_forwarder rows (`<单号>-i/N`) — the owner's rule (2026-07-16).
 * The customer (PR) is read STRAIGHT off the note's "Customer ID" column → no mark→PR
 * guessing. Status lands at "2" = ถึงโกดังจีน (no container yet — the real GZS cabinet
 * + advance to "กำลังส่งมาไทย" come later at the packing-list upload-2 reconcile).
 *
 * WHY THIS MIRRORS createMissingMomoForwarderRow
 * ──────────────────────────────────────────────
 * That is the money-safe "insert a tb_forwarder row from partial facts" primitive
 * (GUARD 1 dedup + GUARD 2 member-validate + the canonical NOT-NULL field set +
 * best-effort auto-price, never a silent ฿0). We clone its EXACT field set with the
 * Yiwu deltas below so a Yiwu row is byte-identical to a MOMO one except where it must
 * differ. The lead reviews this field set line-by-line.
 *
 *   Yiwu deltas vs the MOMO closed-container primitive:
 *     - fstatus "2" (ถึงโกดังจีน) — NOT "3"; fcabinetnumber "" (no container yet);
 *       fdatecontainerclose/fdatestatus3/fdatetothai OMITTED (nullable — same as the
 *       quick-add adminCreateForwarder no-container path).
 *     - fwarehousechina "2" = อี้อู → drives the อี้อู RATE CARD (customer-rate-tables:
 *       อี้อู รถ 5,500 / เรือ 2,900 per CBM). fwarehousename "9" = อี้อู (display label).
 *     - BOX-SPLIT: one ใบส่งของ 单号 with N rows → N siblings `<单号>-i/N`, each carrying
 *       its OWN famount/fweight/dims/fvolume so each prices by its own basis.
 *     - fcover = the stored ใบส่งของ image (shown from ถึงโกดังจีน onward).
 *
 * MONEY-SAFETY (the lead reviews this):
 *   - GUARD 1 (dedup) — abort if the base 单号 already exists in tb_forwarder (bare OR
 *     `base-%` split children) → no duplicate billable shipment. Read-then-insert (no
 *     UNIQUE on ftrackingchn) — same posture as the MOMO manual-add.
 *   - GUARD 2 (member-validate) — the PR MUST exist in tb_users → abort otherwise
 *     (drives fusercompany). No mark→PR guessing — PR is off the note.
 *   - Each row lands frefrate/frefprice/ftotalprice = 0, then a BEST-EFFORT auto-price
 *     (computeAndFillForwarderImportRate) prices it via the SAME money-isolated engine
 *     the MOMO commit uses. A rate miss never fails the create + never writes ฿0.
 *   - NO wallet / credit / commission / invoice write here. The real bill is at
 *     billing-run. This is the ถึงโกดังจีน arrival record only.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";
import { uploadToBucket } from "@/lib/storage/upload";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import {
  yiwuDeliveryNoteBulkSchema,
  type YiwuDeliveryNoteInput,
} from "@/lib/validators/yiwu-delivery-note";

const YIWU_ROLES = ["super", "ops", "warehouse", "accounting"] as const;

/**
 * Store the ใบส่งของ (delivery-note) IMAGE → return its bucket KEY (not a URL).
 * The key goes into the create schema's `imageUrl` → written to tb_forwarder.fcover
 * (the same key convention every other cover uses; the display resolves it to a
 * signed/legacy URL). Bucket `forwarder-covers` · prefix `admin/yiwu`. Gated.
 */
export async function uploadYiwuDeliveryImage(
  formData: FormData,
): Promise<AdminActionResult<{ key: string }>> {
  return withAdmin<{ key: string }>([...YIWU_ROLES], async () => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "กรุณาเลือกไฟล์รูปใบส่งของ" };
    }
    const up = await uploadToBucket(file, "forwarder-covers", "admin/yiwu");
    if (!up.ok) return { ok: false, error: up.error };
    return { ok: true, data: { key: up.filename } };
  });
}

// ── local helpers (copied byte-for-byte from momo-add-missing.ts — those are
//    module-private + a "use server" file can't export sync fns) ─────────────
function escapeLike(base: string): string {
  return base.replace(/[%_,\\]/g, "\\$&");
}
function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}
/** Map the signed-in admin to the legacy varchar(10) tb_admin id (never the uuid). */
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error("[yiwu getUser] failed", { message: error.message });
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: lookupErr } = await admin
    .from("tb_admin").select("adminID").eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (lookupErr) console.error("[yiwu tb_admin lookup] failed", { message: lookupErr.message });
  return data?.adminID ?? email.slice(0, 10);
}

export type YiwuShipmentResult = {
  orderNo: string;
  ok: boolean;
  error?: string;
  skipped?: boolean;   // GUARD-1 dup → "ข้าม"
  fids?: number[];     // the N created sibling ids
};
export type YiwuCreateSummary = {
  results: YiwuShipmentResult[];
  added: number;       // shipments created
  rowsCreated: number; // total box-split rows created
  skipped: number;
  failed: number;
};

const ALREADY_EXISTS_PREFIX = "ออเดอร์นี้มีในระบบแล้ว";
const YIWU_WAREHOUSE_CHINA = "2"; // อี้อู (drives the rate card)
const YIWU_WAREHOUSE_NAME = "9";  // อี้อู (display label · see WAREHOUSE_LABEL maps)

/**
 * Create the N box-split forwarder rows for ONE ใบส่งของ 单号. GUARDed + money-safe.
 * Returns the created sibling ids, or a skip/fail. Does NOT open its own auth — the
 * caller (withAdmin) already gated it + supplies the legacy admin id.
 */
async function createYiwuShipmentImpl(
  d: YiwuDeliveryNoteInput,
  legacyAdminId: string,
  adminId: string,
): Promise<YiwuShipmentResult> {
  const admin = createAdminClient();
  const orderNo = d.orderNo.trim();
  const userID = d.memberCode.toUpperCase();

  // ── GUARD 1 — dedup the base 单号 (bare OR "-%" split children) · fail-closed ──
  const escBase = escapeLike(orderNo);
  const { data: dupRows, error: dupErr } = await admin
    .from("tb_forwarder")
    .select("id, ftrackingchn")
    .or(`ftrackingchn.eq.${orderNo},ftrackingchn.like.${escBase}-%`)
    .limit(50);
  if (dupErr) {
    console.error("[yiwu dup-check] failed", { code: dupErr.code, message: dupErr.message });
    return { orderNo, ok: false, error: `ตรวจสอบรายการซ้ำไม่สำเร็จ: ${dupErr.message}` };
  }
  const dup = (dupRows ?? []).find((r) => {
    const t = ((r as { ftrackingchn: string | null }).ftrackingchn ?? "").trim();
    return t === orderNo || t.startsWith(`${orderNo}-`);
  }) as { id: number } | undefined;
  if (dup) return { orderNo, ok: false, error: `${ALREADY_EXISTS_PREFIX} (#${dup.id})`, skipped: true };

  // ── GUARD 2 — validate the PR (drives fusercompany) ──────────────────────────
  const { data: customer, error: custErr } = await admin
    .from("tb_users").select("userID, coID, userCompany").eq("userID", userID)
    .maybeSingle<{ userID: string; coID: string | null; userCompany: string | null }>();
  if (custErr) {
    console.error("[yiwu tb_users lookup] failed", { code: custErr.code, message: custErr.message });
    return { orderNo, ok: false, error: `db_error:${custErr.code ?? "unknown"}` };
  }
  if (!customer) return { orderNo, ok: false, error: `ไม่พบรหัสลูกค้า ${userID} ในระบบ` };

  const fUserCompany = customer.userCompany === "1" ? "" : "0"; // "" company · "0" individual
  const nowIso = new Date().toISOString();
  const arrivalIso =
    d.arrivalDate && /^\d{4}-\d{2}-\d{2}/.test(d.arrivalDate.trim())
      ? d.arrivalDate.trim().slice(0, 10)
      : nowIso.slice(0, 10);
  const fCover = d.imageUrl?.trim() || "";
  const N = d.rows.length;

  // ── BOX-SPLIT: one INSERT per ใบส่งของ row → `<单号>-i/N` ──────────────────────
  const createdFids: number[] = [];
  for (let i = 0; i < N; i++) {
    const row = d.rows[i]!;
    const suffixedTracking = N > 1 ? `${orderNo}-${i + 1}/${N}` : orderNo;
    const fIDorCO = `YW${orderNo}`.slice(0, 30);

    const { data: ins, error: insErr } = await admin
      .from("tb_forwarder")
      .insert({
        // ── core identity ─────────────────────────────────
        ftrackingchn:          suffixedTracking,
        famount:               row.boxCount,
        fdate:                 nowIso,
        userid:                customer.userID,
        fshipby:               "",                     // เซล/ลูกค้าเลือกขนส่งไทยภายหลัง
        ftransporttype:        "2",                    // เรือ default (อี้อู = GZS · packing ยืนยันตอน upload-2)
        adminidcreator:        legacyAdminId,
        subuserid:             "",
        paymethod:             "1",                    // ต้นทาง (default)
        fusercompany:          fUserCompany,
        priceother:            0,
        fwarehousename:        YIWU_WAREHOUSE_NAME,     // "9" = อี้อู
        fdatestatus2:          arrivalIso,             // ถึงโกดังจีน (from the ใบส่งของ)
        fcosttotalpricesheet:  0,
        fstatus:               "2",                    // ถึงโกดังจีน (no container yet)

        // ── address (EMPTY — sales/customer fills later) ──
        faddressname:          "", faddresslastname:  "", faddressno:  "",
        faddresssubdistrict:   "", faddressdistrict:  "", faddressprovince: "",
        faddresszipcode:       "", faddressnote:      "", faddresstel: "", faddresstel2: "",

        // ── package metrics (per-box-group from the ใบส่งของ · staff-confirmed) ──
        fweight:               roundTo(row.weightKg, 2),
        fwidth:                roundTo(row.widthCm, 2),
        flength:               roundTo(row.lengthCm, 2),
        fheight:               roundTo(row.heightCm, 2),
        fvolume:               roundTo(row.cbm, 6),
        ftransportprice:       0,
        fwarehousechina:       YIWU_WAREHOUSE_CHINA,    // "2" = อี้อู (drives the rate card)
        fproductstype:         "1",                    // ทั่วไป default (admin edits)
        fdiscount:             0,

        // ── cabinet + cost defaults (no container yet) ────
        fcabinetnumber:        "",                     // ตู้จริงมาที่ packing upload-2
        fidorco:               fIDorCO,
        famountcount:          1,
        smpcs:                 "",
        crate:                 "2",                    // ไม่ตีลังไม้ default
        pricecrate:            0,
        ftransportpricechnthb: 0,
        pricemore:             "0",
        customrate:            "0",
        frefrate:              0,
        frefprice:             "0",
        ftotalprice:           0,
        customratekg:          0,
        customratecbm:         0,

        // ── safe defaults for other NOT NULL cols (mirror the primitive) ──
        fdetail:               (row.productType ?? "").slice(0, 200),
        paydeposit:            "0",
        ftrackingth:           "-",
        ffreeshipping:         "0",
        // ใบส่งของ "เลขที่ตู้/Packing ID" ต้นทาง (SEA…YW) เก็บเป็นอ้างอิงใน fnote — ไม่ใช่ตู้จริง
        // (ตู้จริง fcabinetnumber มาตอน packing upload-2). null ถ้าไม่ได้กรอก (คงพฤติกรรมเดิม).
        fnote:                 d.packingId?.trim() ? `Packing ID (อี้อู): ${d.packingId.trim().slice(0, 60)}` : null,
        fnoteuser:             "0",
        fnoteuserread:         "0",
        fcover:                fCover,                  // ใบส่งของ image (shown from ถึงโกดังจีน)
        fphotoend:             "",
        fcostrefrate:          0,
        fpriceupdate:          0,
        fcosttotalprice:       0,
        fprofittransportchn:   0,
        fprofitpriceupdate:    0,
        fprofittotal:          0,
        faddresslatitude:      0,
        faddresslongitude:     0,
        adminid:               legacyAdminId,
        adminidkey:            "",
        adminidupdate:         legacyAdminId,
        session:               "admin-yiwu-delivery-note",
        reforder:              "",
        fcredit:               "0",
        fsendsms1day:          "0",
        fsendsms3day:          "0",
        fsendsms3eday:         "0",
        fqc:                   "0",
        fqcprice:              0,
        linkapiorder:          "0",
        fstatuscaron:          "0",
        fstatuscaradminon:     "",
        fstatuscaroff:         "0",
        fstatuscaradminoff:    "",
        printstatus1:          "0",
        printstatus2:          "0",
        printstatus3:          "0",
        printstatus4:          "0",
        fshippingservice:      "0",
      })
      .select("id")
      .single<{ id: number }>();

    if (insErr || !ins) {
      console.error("[yiwu insert] failed", { orderNo, i, code: insErr?.code, message: insErr?.message });
      // Best-effort rollback of the siblings already created for THIS shipment so a
      // partial box-split never bills half a shipment.
      if (createdFids.length > 0) {
        const { error: rbErr } = await admin.from("tb_forwarder").delete().in("id", createdFids);
        if (rbErr) console.error("[yiwu insert rollback] failed", { fids: createdFids, message: rbErr.message });
      }
      return { orderNo, ok: false, error: insErr?.message ?? "insert failed" };
    }
    createdFids.push(ins.id);
  }

  // ── best-effort auto-price each sibling (never a silent ฿0) ──────────────────
  for (const fid of createdFids) {
    try {
      const rate = await computeAndFillForwarderImportRate(admin, fid);
      if (!rate.ok) console.error("[yiwu auto-rate] unresolved", { fid, reason: rate.reason });
    } catch (e) {
      console.error("[yiwu auto-rate] threw AFTER insert", { fid, error: e instanceof Error ? e.message : String(e) });
    }
  }

  await logAdminAction(adminId, "forwarder.yiwu_delivery_note.create", "tb_forwarder", String(createdFids[0] ?? ""), {
    order_no: orderNo, userid: customer.userID, box_rows: N, fids: createdFids,
    arrival: arrivalIso, warehouse: "yiwu",
  });
  return { orderNo, ok: true, fids: createdFids };
}

/**
 * Commit an OCR-reviewed Yiwu ใบส่งของ → create the box-split arrival rows for every
 * shipment on it. Serial + per-shipment try/catch so one bad/duplicate 单号 never
 * aborts the batch or double-writes (GUARD-1 dup surfaces as `skipped`, not a failure).
 * Gated ops/super/warehouse/accounting (+ god via withAdmin). Idempotent + audit-logged.
 */
export async function addYiwuDeliveryNoteShipments(
  rawInput: unknown,
): Promise<AdminActionResult<YiwuCreateSummary>> {
  return withAdmin<YiwuCreateSummary>(
    [...YIWU_ROLES],
    async ({ adminId }) => {
      const parsed = yiwuDeliveryNoteBulkSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
      }
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

      const results: YiwuShipmentResult[] = [];
      let added = 0, rowsCreated = 0, skipped = 0, failed = 0;
      for (const d of parsed.data) {
        try {
          const res = await createYiwuShipmentImpl(d, legacyAdminId, adminId);
          results.push(res);
          if (res.ok) { added += 1; rowsCreated += res.fids?.length ?? 0; }
          else if (res.skipped) skipped += 1;
          else failed += 1;
        } catch (e) {
          console.error("[yiwu shipment] threw", { orderNo: d.orderNo, error: e });
          results.push({ orderNo: d.orderNo, ok: false, error: e instanceof Error ? e.message : "error" });
          failed += 1;
        }
      }

      try { bustAdminChrome(); } catch (e) { console.error("[yiwu bustAdminChrome] best-effort", e); }

      return { ok: true, data: { results, added, rowsCreated, skipped, failed } };
    },
  );
}
