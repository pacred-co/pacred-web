"use client";

/**
 * Inline toggle-to-edit fields for the ฝากนำเข้า /edit page — the
 * "✏️ แก้ไข" links beside each header attribute, mirroring the working
 * pattern on /admin/service-orders/[hNo] (inline-edits.tsx · L42-L72
 * EditableRow + L102 OrderInlineEdits).
 *
 * ภูม flag (2026-06-04 evening): these inline edits MUST live on the
 * /edit page (faithful to PCS legacy update.php · single edit page with all
 * inline [แก้ไข] buttons inside). Earlier wave put them on the detail page —
 * wrong shape: detail = READ-ONLY always; /edit = all inline edits + status
 * pipeline + payment.
 *
 * Fields wired here (mirror service-orders inline-edits.tsx + PCS legacy
 * update.php 13 inline-edit handlers + the bill-to Pacred extension):
 *   - userid (PCS L1469)         → adminReassignForwarderOwner       (TYPE-CONFIRM)
 *   - fpallet (PCS L2417)        → adminUpdateForwarderPallet        (warehouse location no.)
 *   - ftransporttype (PCS L1458) → adminUpdateForwarderTransportType (1 รถ · 2 เรือ · 3 อากาศ)
 *   - crate (PCS L2439)          → adminUpdateForwarderCrate         (1 ตี · 2 ไม่ตี)
 *   - paymethod (PCS L2428)      → adminUpdateForwarderPayMethod     (1 ต้นทาง · 2 ปลายทาง)
 *   - fshipby (PCS L1579)        → adminUpdateForwarderShipBy        (PCS/PCSF/PCSE preset + free-text other)
 *   - ftrackingchn (PCS L1562)   → adminUpdateForwarderTrackingChn   (gated fstatus<7)
 *   - fdatecontainerclose +
 *     fdatetothai (PCS L1541)    → adminUpdateForwarderDateToThai    (+5d truck / +12d sea)
 *   - famountcount (PCS L2450)   → adminUpdateForwarderAmountCount   (รวมกล่อง / ไม่รวม)
 *   - fbilltoname (Pacred ext)   → adminSetForwarderBillToOverride   (free-text · invoice name)
 *
 * Faithful WORKFLOW (same fields, same options, same target tb_forwarder),
 * Pacred UI (Tailwind · Lucide pencil · click-to-edit row · บันทึก/ยกเลิก,
 * no Bootstrap-4 modal). Each writer reuses an existing or sister server
 * action; tb_forwarder.id is the row identity.
 *
 * Address re-pick and the cost-adjust matrix stay as their own panels on
 * /edit — they need the saved-addresses dropdown and the 3-input money form,
 * both too large for an inline row. Driver assignment also stays as a panel
 * on /edit (combobox + status gates).
 *
 * Owner-reassign (userid): the legacy red note says
 * "การแก้ไขต้องเช็คข้อมูลสถานะรายการ บริษัทขนส่ง ที่อยู่จัดส่ง เรทราคา การหัก ณ ที่จ่าย" —
 * we surface that as a TYPE-CONFIRM modal (type "ยืนยัน") so the operator
 * acknowledges the cascading impact before reassigning.
 */

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Pencil, AlertTriangle, Camera, Trash2 } from "lucide-react";
import {
  adminUpdateForwarderTransportType,
  adminUpdateForwarderCrate,
  adminUpdateForwarderCratePrice,
  adminUpdateForwarderShipBy,
  adminUpdateForwarderPayMethod,
  adminUpdateForwarderThShipping,
  adminUpdateForwarderAmountCount,
  adminUpdateForwarderPallet,
  adminUpdateForwarderTrackingChn,
  adminUpdateForwarderCabinet,
  adminUpdateForwarderDateToThai,
  adminReassignForwarderOwner,
  adminAddForwarderImage,
  adminRemoveForwarderImage,
  adminUpdateForwarderTaxDocMode,
  adminPickForwarderAddress,
} from "@/actions/admin/forwarders-field-edits";
import { Link } from "@/i18n/navigation";
import { adminSetForwarderBillToOverride } from "@/actions/admin/forwarders";
import { StyledFileInput } from "@/components/ui/styled-file-input";
import { confirm } from "@/components/ui/confirm";
import { nameShipBy, carrierLabel } from "@/lib/freight/shipping-methods";
import {
  THAI_PROVINCES,
  carriersForProvince,
  canonicalProvince,
} from "@/lib/forwarder/carrier-province-coverage";
import { deriveContainerCloseDate } from "@/lib/admin/forwarder-status";
import {
  TAX_DOC_MODES,
  TAX_DOC_MODE_META,
  modeFromPref,
  type TaxDocMode,
} from "@/lib/tax/tax-doc-mode";
import { TaxDocBadge } from "@/components/admin/tax-doc-badge";
import { CustomerAddressPicker } from "@/components/admin/customer-address-picker";
import type { CustomerAddressRow } from "@/lib/legacy/customer-address-options";

type ActionResult = { ok: true; data?: unknown } | { ok: false; error?: string };

const selectCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const btnSave =
  "rounded-md bg-primary-500 px-3 py-1 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50";
const btnCancel =
  "rounded-md border border-border px-3 py-1 text-xs hover:bg-surface-alt disabled:opacity-50";

/**
 * Shared "display + แก้ไข" → editor toggle row.
 *
 * 2026-06-04 ภูม UX F1 follow-up: pass `compact` to render in InfoLine
 * shape (label : value [แก้ไข] on a single row) — used when the field lives
 * INSIDE an existing data block (the 2-col "ลูกค้า · ที่อยู่ · การขนส่ง" +
 * "ตู้ · Tracking · สินค้า" sections on /edit) instead of inside a
 * standalone inline-edits panel.
 *
 * Default (non-compact) shape — label stacked above value — kept for
 * back-compat with the standalone ForwarderInlineEdits panel.
 */
function EditableRow({
  label,
  display,
  children,
  editing,
  setEditing,
  compact = false,
}: {
  label: string;
  display: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  editing: boolean;
  setEditing: (v: boolean) => void;
  compact?: boolean;
}) {
  if (compact) {
    // 2026-06-10 (ปอน) — customer-page 1:1 format: "<b>label : </b>value [แก้ไข]"
    // (the same shape as /service-import/[fNo]). The แก้ไข link is sky-blue like
    // the customer page; the inline form is always left-aligned even when the
    // row sits in a md:text-right column.
    return (
      <div className="text-sm text-foreground">
        <p>
          <b className="font-semibold">{label} : </b>
          {editing ? null : (
            <>
              <span className="break-words">{display}</span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="ml-1.5 text-xs font-medium text-sky-600 hover:underline"
              >
                แก้ไข
              </button>
            </>
          )}
        </p>
        {editing && <div className="mt-2 space-y-2 text-left">{children(() => setEditing(false))}</div>}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:underline"
          >
            <Pencil className="h-3 w-3" /> แก้ไข
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">{children(() => setEditing(false))}</div>
      ) : (
        <div className="text-sm">{display}</div>
      )}
    </div>
  );
}

function useEditor() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  function run(fn: () => Promise<ActionResult>, onOk: () => void) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        onOk();
        router.refresh();
      } else {
        setErr(res.error ?? "บันทึกไม่สำเร็จ");
      }
    });
  }
  return { pending, err, run };
}

const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 ทางรถ",
  "2": "🚢 ทางเรือ",
  "3": "✈️ ทางอากาศ",
};
const CRATE_LABEL: Record<string, string> = { "1": "ตีลังไม้", "2": "ไม่ตีลังไม้" };
const PAY_LABEL: Record<string, string> = { "1": "ต้นทาง", "2": "ปลายทาง" };
const AMOUNT_COUNT_LABEL: Record<string, string> = { "1": "รวมกล่อง", "2": "ไม่รวมกล่อง" };

// In-house ship-by preset CODES (stored verbatim in tb_forwarder.fshipby +
// consumed by the pricing engine — DO NOT rename the codes, only the labels;
// scrubbing the codes/API is gated on ก๊อต's switchover · AGENTS.md §3).
const SHIPBY_PRESETS = ["PCS", "PCSF", "PCSE"] as const;
// carrierLabel (Pacred rebrand → full legacy nameShipBy → raw) now lives in
// lib/freight/shipping-methods.ts as the SINGLE display SOT shared with the
// report-cnt container detail (ภูม 2026-07-21: they disagreed — report-cnt showed
// a raw "13" for ธนามัย ขนส่งด่วน). Imported above.

type Props = {
  fId:            number;            // tb_forwarder.id — primary key for all writers
  userid:         string;            // tb_forwarder.userid (customer code, e.g. PR12345)
  fpallet:        number | null;     // warehouse pallet number (legacy fpallet INT)
  ftransporttype: string | null;     // "1" | "2" | "3"
  crate:          string | null;     // "1" ตี · "2" ไม่ตี
  fshipby:        string | null;     // PCS/PCSF/PCSE preset or external carrier name
  paymethod:      string | null;     // "1" ต้นทาง · "2" ปลายทาง
  ftrackingchn:   string | null;     // China tracking number (locked when fstatus=7)
  fstatus:        string | null;     // current fstatus — used to gate ftrackingchn editor UX
  fdatecontainerclose: string | null; // ISO date string (YYYY-MM-DD) or null
  famountcount:   string | null;     // "1" รวมกล่อง · "2" ไม่รวม
  fbilltoname:    string | null;     // bill-to override (free-text, NULL = use default)
  defaultBillTo:  string;            // shown when fbilltoname empty (faddressname + lastname)
};

export function ForwarderInlineEdits(p: Props) {
  const { pending, err, run } = useEditor();

  // Per-row "is the editor open?" booleans.
  const [editUserId, setEditUserId] = useState(false);
  const [editPallet, setEditPallet] = useState(false);
  const [editTransport, setEditTransport] = useState(false);
  const [editCrate, setEditCrate] = useState(false);
  const [editShipBy, setEditShipBy] = useState(false);
  const [editPay, setEditPay] = useState(false);
  const [editTrackingChn, setEditTrackingChn] = useState(false);
  const [editDateClose, setEditDateClose] = useState(false);
  const [editAmountCount, setEditAmountCount] = useState(false);
  const [editBillTo, setEditBillTo] = useState(false);

  // Per-row draft values.
  const initialTransport = (["1", "2", "3"].includes(p.ftransporttype ?? "") ? p.ftransporttype : "1") as "1" | "2" | "3";
  const initialCrate = (p.crate === "2" ? "2" : "1") as "1" | "2";
  const initialPay = (p.paymethod === "2" ? "2" : "1") as "1" | "2";
  const initialAmountCount = (p.famountcount === "1" ? "1" : "2") as "1" | "2";
  const isPresetShipBy = SHIPBY_PRESETS.includes((p.fshipby ?? "") as (typeof SHIPBY_PRESETS)[number]);
  const initialShipByMode = isPresetShipBy
    ? (p.fshipby as (typeof SHIPBY_PRESETS)[number])
    : (p.fshipby && p.fshipby.trim() !== "" ? p.fshipby.trim() : "PCS");

  const [userIdVal, setUserIdVal] = useState<string>(p.userid);
  const [userIdConfirm, setUserIdConfirm] = useState<string>("");
  const [palletVal, setPalletVal] = useState<string>(p.fpallet !== null ? String(p.fpallet) : "");
  const [transportVal, setTransportVal] = useState<"1" | "2" | "3">(initialTransport);
  const [crateVal, setCrateVal] = useState<"1" | "2">(initialCrate);
  const [shipByMode, setShipByMode] = useState<string>(initialShipByMode);
  const [payVal, setPayVal] = useState<"1" | "2">(initialPay);
  const [trackingChnVal, setTrackingChnVal] = useState<string>(p.ftrackingchn ?? "");
  const [dateCloseVal, setDateCloseVal] = useState<string>(
    p.fdatecontainerclose && /^\d{4}-\d{2}-\d{2}/.test(p.fdatecontainerclose)
      ? p.fdatecontainerclose.slice(0, 10)
      : "",
  );
  const [amountCountVal, setAmountCountVal] = useState<"1" | "2">(initialAmountCount);
  const [billToVal, setBillToVal] = useState<string>(p.fbilltoname ?? "");

  // The carrier code actually sent — an own-fleet preset only (the free-text escape hatch was
  // removed 2026-07-14; ขนส่งเอกชน is picked province-filtered on the detail page).
  const effectiveShipBy = SHIPBY_PRESETS.includes(shipByMode as (typeof SHIPBY_PRESETS)[number])
    ? shipByMode
    : "";

  // ftrackingchn is locked once delivered (legacy update.php L730 — only editable while fstatus<7).
  const trackingLocked = (p.fstatus ?? "") === "7";

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">⚠ {err}</div>
      )}

      {/* รหัสสมาชิก / Customer reassignment (TYPE-CONFIRM · PCS L1469-1478 update_fUserID).
          Owner-reassignment is a CASCADING change — legacy red note:
          "การแก้ไขต้องเช็คข้อมูลสถานะรายการ บริษัทขนส่ง ที่อยู่จัดส่ง เรทราคา การหัก ณ ที่จ่าย".
          We surface that as a type-"ยืนยัน" confirm gate before save. */}
      <EditableRow
        label="รหัสสมาชิก (Customer)"
        editing={editUserId}
        setEditing={setEditUserId}
        display={<span className="font-mono">{p.userid}</span>}
      >
        {(close) => {
          const trimmedNew = userIdVal.trim().toUpperCase();
          const canSave = trimmedNew !== "" && trimmedNew !== p.userid && userIdConfirm.trim() === "ยืนยัน";
          return (
            <>
              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 flex gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  ⚠ การเปลี่ยน user จะส่งผลต่อ <b>สถานะรายการ · บริษัทขนส่ง · ที่อยู่จัดส่ง · เรทราคา ·
                  การหัก ณ ที่จ่าย</b> — ตรวจสอบให้ครบก่อนบันทึก
                </span>
              </div>
              <input
                type="text"
                value={userIdVal}
                onChange={(e) => setUserIdVal(e.target.value)}
                maxLength={10}
                placeholder="รหัสลูกค้าใหม่ (เช่น PR12345)"
                className={inputCls}
              />
              <input
                type="text"
                value={userIdConfirm}
                onChange={(e) => setUserIdConfirm(e.target.value)}
                placeholder='พิมพ์ "ยืนยัน" เพื่อบันทึก'
                className={inputCls}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending || !canSave}
                  className={btnSave}
                  onClick={() =>
                    run(
                      () => adminReassignForwarderOwner({ fId: p.fId, newUserId: trimmedNew }),
                      () => {
                        setUserIdConfirm("");
                        close();
                      },
                    )
                  }
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={btnCancel}
                  onClick={() => {
                    setUserIdVal(p.userid);
                    setUserIdConfirm("");
                    close();
                  }}
                >
                  ยกเลิก
                </button>
              </div>
            </>
          );
        }}
      </EditableRow>

      {/* Location / pallet (PCS L2417-2427 update_fPallet) — warehouse pallet number */}
      <EditableRow
        label="Location"
        editing={editPallet}
        setEditing={setEditPallet}
        display={
          p.fpallet !== null && p.fpallet > 0 ? (
            <span className="font-mono">{p.fpallet}</span>
          ) : (
            <span className="text-muted">—</span>
          )
        }
      >
        {(close) => (
          <>
            <input
              type="number"
              min={0}
              max={99999}
              step={1}
              value={palletVal}
              onChange={(e) => setPalletVal(e.target.value)}
              placeholder="เลขพาเลท (0 = ล้าง)"
              className={inputCls}
            />
            <p className="text-[11px] text-muted">
              เลขพาเลทในโกดัง — ใช้สำหรับค้นหาที่จัดเก็บ · กรอก 0 เพื่อล้าง
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() => {
                  const n = Number(palletVal);
                  const safe = Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : 0;
                  run(() => adminUpdateForwarderPallet({ fId: p.fId, fpallet: safe }), close);
                }}
              >
                บันทึก
              </button>
              <button
                type="button"
                disabled={pending}
                className={btnCancel}
                onClick={() => {
                  setPalletVal(p.fpallet !== null ? String(p.fpallet) : "");
                  close();
                }}
              >
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </EditableRow>

      {/* รูปแบบขนส่ง จีน-ไทย */}
      <EditableRow
        label="รูปแบบขนส่ง จีน-ไทย"
        editing={editTransport}
        setEditing={setEditTransport}
        display={TRANSPORT_LABEL[p.ftransporttype ?? "1"] ?? `mode ${p.ftransporttype ?? "-"}`}
      >
        {(close) => (
          <>
            <select className={selectCls} value={transportVal} onChange={(e) => setTransportVal(e.target.value as "1" | "2" | "3")}>
              <option value="1">ทางรถ (5-7 วัน)</option>
              <option value="2">ทางเรือ (12-16 วัน)</option>
              <option value="3">ทางอากาศ</option>
            </select>
            <p className="text-[11px] text-muted">
              ⚠ เปลี่ยนแล้วราคาไม่อัพเดทอัตโนมัติ — แก้ไขขนาด/น้ำหนักเพื่อคำนวณเรทใหม่
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() =>
                  run(() => adminUpdateForwarderTransportType({ fId: p.fId, transportType: transportVal }), close)
                }
              >
                บันทึก
              </button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </EditableRow>

      {/* การตีลังไม้ */}
      <EditableRow
        label="การตีลังไม้"
        editing={editCrate}
        setEditing={setEditCrate}
        display={CRATE_LABEL[p.crate ?? ""] ?? "—"}
      >
        {(close) => (
          <>
            <select className={selectCls} value={crateVal} onChange={(e) => setCrateVal(e.target.value as "1" | "2")}>
              <option value="1">ตีลังไม้</option>
              <option value="2">ไม่ตีลังไม้</option>
            </select>
            <p className="text-[11px] text-muted">
              ค่าตีลังจริงคำนวณตอนแก้ไขขนาด/น้ำหนัก (ต่อ-รายการ) — รายการนี้เก็บแค่ flag header
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() => run(() => adminUpdateForwarderCrate({ fId: p.fId, crate: crateVal }), close)}
              >
                บันทึก
              </button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </EditableRow>

      {/* บริษัทขนส่ง (Ship-by) */}
      <EditableRow
        label="บริษัทขนส่ง"
        editing={editShipBy}
        setEditing={setEditShipBy}
        display={carrierLabel(p.fshipby)}
      >
        {(close) => (
          <>
            <select
              className={selectCls}
              value={shipByMode}
              onChange={(e) => setShipByMode(e.target.value)}
            >
              <option value="PCS">รับเองที่โกดัง Pacred (ไม่มีค่าส่ง)</option>
              <option value="PCSF">Pacred เหมาๆ · ส่งในเขต ฿100</option>
              <option value="PCSE">Pacred Express · ส่งด่วน (ปริมาตร×120 · ขั้นต่ำ ฿50)</option>
              {/* 🔴 owner 2026-07-14 — the free-text "ผู้ขนส่งภายนอก (กรอกชื่อเอง)" option is
                  GONE: a ขนส่งเอกชน may only come from the owner's workbook, filtered by the
                  delivery province. Pick it on the detail page (<EditShipByField>), which
                  knows faddressprovince; the server refuses anything else anyway. */}
              {!isPresetShipBy && (p.fshipby ?? "").trim() !== "" && (
                <option value={(p.fshipby ?? "").trim()} disabled>
                  {carrierLabel(p.fshipby)} (ค่าเดิม · เลือกใหม่ไม่ได้)
                </option>
              )}
            </select>
            <p className="text-[11px] text-muted">
              PCS = ที่อยู่จะถูกแทนด้วยโกดัง Pacred (สมุทรสาคร) · PCS/PCSF/PCSE คิดค่าขนส่งใหม่อัตโนมัติ ·
              “ขนส่งเอกชน” เลือกได้ที่หน้ารายละเอียด (ขึ้นตามจังหวัดปลายทาง · เฉพาะที่มีในไฟล์พื้นที่ขนส่ง)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !effectiveShipBy}
                className={btnSave}
                onClick={() =>
                  run(() => adminUpdateForwarderShipBy({ fId: p.fId, fShipBy: effectiveShipBy }), close)
                }
              >
                บันทึก
              </button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </EditableRow>

      {/* การเก็บเงินค่าขนส่งในไทย */}
      <EditableRow
        label="การเก็บเงินค่าขนส่งในไทย"
        editing={editPay}
        setEditing={setEditPay}
        display={PAY_LABEL[p.paymethod ?? ""] ?? "—"}
      >
        {(close) => (
          <>
            <select className={selectCls} value={payVal} onChange={(e) => setPayVal(e.target.value as "1" | "2")}>
              <option value="1">ต้นทาง</option>
              <option value="2">ปลายทาง</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() => run(() => adminUpdateForwarderPayMethod({ fId: p.fId, paymethod: payVal }), close)}
              >
                บันทึก
              </button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </EditableRow>

      {/* เลขพัสดุจีน — ftrackingchn (PCS L1562 update_fTrackingCHN · gated fstatus<7) */}
      <EditableRow
        label="เลขพัสดุจีน (Tracking CN)"
        editing={editTrackingChn}
        setEditing={setEditTrackingChn}
        display={
          p.ftrackingchn && p.ftrackingchn.trim() !== "" ? (
            <span className="font-mono text-primary-600">{p.ftrackingchn}</span>
          ) : (
            <span className="text-muted">—</span>
          )
        }
      >
        {(close) =>
          trackingLocked ? (
            <>
              <p className="text-[11px] text-red-700">
                ⚠ รายการนี้ถูกส่งแล้ว (fStatus=7) — เลขแทรคกิ้งจีนถูกล็อก แก้ไขไม่ได้
              </p>
              <div className="flex gap-2">
                <button type="button" className={btnCancel} onClick={close}>
                  ปิด
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                type="text"
                value={trackingChnVal}
                onChange={(e) => setTrackingChnVal(e.target.value)}
                maxLength={60}
                placeholder="เลขแทรคกิ้งจาก vendor จีน"
                className={inputCls}
              />
              <p className="text-[11px] text-muted">
                แก้ไขได้ก่อนรายการจะถูกส่ง (fStatus &lt; 7) เท่านั้น
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending || trackingChnVal.trim() === ""}
                  className={btnSave}
                  onClick={() =>
                    run(
                      () =>
                        adminUpdateForwarderTrackingChn({
                          fId: p.fId,
                          ftrackingchn: trackingChnVal.trim(),
                        }),
                      close,
                    )
                  }
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={btnCancel}
                  onClick={() => {
                    setTrackingChnVal(p.ftrackingchn ?? "");
                    close();
                  }}
                >
                  ยกเลิก
                </button>
              </div>
            </>
          )
        }
      </EditableRow>

      {/* วันที่ปิดตู้ — fdatecontainerclose (PCS L1541 update_fDateToThai · also writes fdatetothai) */}
      <EditableRow
        label="วันที่ปิดตู้"
        editing={editDateClose}
        setEditing={setEditDateClose}
        display={
          p.fdatecontainerclose && p.fdatecontainerclose.length >= 10 ? (
            <span className="font-mono">
              {new Date(p.fdatecontainerclose).toLocaleDateString("th-TH")}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )
        }
      >
        {(close) => (
          <>
            <input
              type="date"
              value={dateCloseVal}
              onChange={(e) => setDateCloseVal(e.target.value)}
              className={inputCls}
            />
            <p className="text-[11px] text-muted">
              วันที่จะอัปเดตทั้ง <b>วันปิดตู้</b> และ <b>วันถึงไทย (ETA)</b> โดยอัตโนมัติ
              (รถ +5 วัน · เรือ/อากาศ +12 วัน)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !/^\d{4}-\d{2}-\d{2}$/.test(dateCloseVal)}
                className={btnSave}
                onClick={() =>
                  run(
                    () =>
                      adminUpdateForwarderDateToThai({
                        fId: p.fId,
                        fdatecontainerclose: dateCloseVal,
                      }),
                    close,
                  )
                }
              >
                บันทึก
              </button>
              <button
                type="button"
                disabled={pending}
                className={btnCancel}
                onClick={() => {
                  setDateCloseVal(
                    p.fdatecontainerclose && /^\d{4}-\d{2}-\d{2}/.test(p.fdatecontainerclose)
                      ? p.fdatecontainerclose.slice(0, 10)
                      : "",
                  );
                  close();
                }}
              >
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </EditableRow>

      {/* การรวมกล่อง — famountcount (PCS L2450 update_fAmountCount · pricing basis toggle) */}
      <EditableRow
        label="การรวมกล่อง"
        editing={editAmountCount}
        setEditing={setEditAmountCount}
        display={
          p.famountcount === "1" ? (
            <span className="rounded bg-red-50 text-red-700 px-1.5 py-0.5 text-xs">รวมกล่อง</span>
          ) : (
            <span>{AMOUNT_COUNT_LABEL[p.famountcount ?? "2"] ?? "ไม่รวมกล่อง"}</span>
          )
        }
      >
        {(close) => (
          <>
            <select
              className={selectCls}
              value={amountCountVal}
              onChange={(e) => setAmountCountVal(e.target.value as "1" | "2")}
            >
              <option value="2">ไม่รวมกล่อง (คิดราคาแยกต่อกล่อง)</option>
              <option value="1">รวมกล่อง (คิดราคารวมทั้งบิล)</option>
            </select>
            <p className="text-[11px] text-muted">
              ⚠ ค่าฐานการคิดราคา — มีผลตอนกดแก้ไขขนาด/น้ำหนักครั้งถัดไป (ราคาเดิมไม่ recompute)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() =>
                  run(
                    () =>
                      adminUpdateForwarderAmountCount({
                        fId: p.fId,
                        famountcount: amountCountVal,
                      }),
                    close,
                  )
                }
              >
                บันทึก
              </button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </EditableRow>

      {/* ชื่อผู้รับใบกำกับ (Bill-to override) */}
      <EditableRow
        label="ชื่อผู้รับใบกำกับ"
        editing={editBillTo}
        setEditing={setEditBillTo}
        display={
          p.fbilltoname && p.fbilltoname.trim() !== "" ? (
            <span className="rounded bg-violet-50 text-violet-700 px-1.5 py-0.5 text-xs">
              {p.fbilltoname}
            </span>
          ) : (
            <span className="text-muted">{p.defaultBillTo || "—"} (ค่าเริ่มต้น)</span>
          )
        }
      >
        {(close) => (
          <>
            <input
              type="text"
              value={billToVal}
              onChange={(e) => setBillToVal(e.target.value)}
              maxLength={200}
              placeholder={p.defaultBillTo || "เว้นว่าง = ใช้ชื่อเริ่มต้น"}
              className={inputCls}
            />
            <p className="text-[11px] text-muted">
              ปล่อยว่าง = กลับใช้ชื่อเริ่มต้น ({p.defaultBillTo || "—"}) · สูงสุด 200 ตัวอักษร
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() =>
                  run(
                    () =>
                      adminSetForwarderBillToOverride({
                        f_no: String(p.fId),
                        override: billToVal.trim(),
                      }),
                    close,
                  )
                }
              >
                บันทึก
              </button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Individual exported field components (2026-06-04 ภูม UX F2 — Issue 1
// follow-up).
//
// These small wrappers let the /edit page place each [แก้ไข] toggle INLINE
// next to its sibling data field (in the "ลูกค้า · ที่อยู่ · การขนส่ง" and
// "ตู้ · Tracking · สินค้า" 2-col blocks) instead of stuffing all 10 fields
// into a single bottom panel. Each one owns its own draft state + uses the
// shared `useEditor` hook + `EditableRow compact` for InfoLine-shape display.
//
// Workflow + server-action contract is IDENTICAL to the bundled
// ForwarderInlineEdits; this is a layout-only refactor.
// ─────────────────────────────────────────────────────────────────────────

/** รหัสสมาชิก (Customer) — TYPE-CONFIRM owner reassign · PCS L1469. */
export function EditUserIdField({ fId, userid }: { fId: number; userid: string }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const [userIdVal, setUserIdVal] = useState<string>(userid);
  const [userIdConfirm, setUserIdConfirm] = useState<string>("");
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="รหัสสมาชิก"
        editing={editing}
        setEditing={setEditing}
        display={<span className="font-mono font-bold">{userid}</span>}
      >
        {(close) => {
          const trimmedNew = userIdVal.trim().toUpperCase();
          const canSave = trimmedNew !== "" && trimmedNew !== userid && userIdConfirm.trim() === "ยืนยัน";
          return (
            <>
              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 flex gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  ⚠ การเปลี่ยน user จะส่งผลต่อ <b>สถานะรายการ · บริษัทขนส่ง · ที่อยู่จัดส่ง · เรทราคา ·
                  การหัก ณ ที่จ่าย</b> — ตรวจสอบให้ครบก่อนบันทึก
                </span>
              </div>
              <input type="text" value={userIdVal} onChange={(e) => setUserIdVal(e.target.value)} maxLength={10}
                placeholder="รหัสลูกค้าใหม่ (เช่น PR12345)" className={inputCls} />
              <input type="text" value={userIdConfirm} onChange={(e) => setUserIdConfirm(e.target.value)}
                placeholder='พิมพ์ "ยืนยัน" เพื่อบันทึก' className={inputCls} />
              <div className="flex gap-2">
                <button type="button" disabled={pending || !canSave} className={btnSave}
                  onClick={() => run(() => adminReassignForwarderOwner({ fId, newUserId: trimmedNew }), () => {
                    setUserIdConfirm("");
                    close();
                  })}>บันทึก</button>
                <button type="button" disabled={pending} className={btnCancel}
                  onClick={() => { setUserIdVal(userid); setUserIdConfirm(""); close(); }}>ยกเลิก</button>
              </div>
            </>
          );
        }}
      </EditableRow>
    </div>
  );
}

/** Location (pallet) · PCS L2417 — warehouse pallet number, integer 0+. */
export function EditPalletField({ fId, fpallet }: { fId: number; fpallet: number | null }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const [palletVal, setPalletVal] = useState<string>(fpallet !== null ? String(fpallet) : "");
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="Location"
        editing={editing}
        setEditing={setEditing}
        display={
          fpallet !== null && fpallet > 0
            ? <span className="font-mono">{fpallet}</span>
            : <span className="text-muted">—</span>
        }
      >
        {(close) => (
          <>
            <input type="number" min={0} max={99999} step={1} value={palletVal}
              onChange={(e) => setPalletVal(e.target.value)} placeholder="เลขพาเลท (0 = ล้าง)" className={inputCls} />
            <p className="text-[11px] text-muted">เลขพาเลทในโกดัง — ใช้สำหรับค้นหาที่จัดเก็บ · กรอก 0 เพื่อล้าง</p>
            <div className="flex gap-2">
              <button type="button" disabled={pending} className={btnSave} onClick={() => {
                const n = Number(palletVal);
                const safe = Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : 0;
                run(() => adminUpdateForwarderPallet({ fId, fpallet: safe }), close);
              }}>บันทึก</button>
              <button type="button" disabled={pending} className={btnCancel}
                onClick={() => { setPalletVal(fpallet !== null ? String(fpallet) : ""); close(); }}>ยกเลิก</button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

/** การตีลังไม้ · PCS L2439 — header crate flag. */
export function EditCrateField({ fId, crate, pricecrate }: { fId: number; crate: string | null; pricecrate?: number | string | null }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  // Legacy crate flag: '1' = ตีลังไม้ · '2'/empty = ไม่ตีลังไม้ (nameCrate · function.php L1691).
  const initialCrate = (crate === "1" ? "1" : "2") as "1" | "2";
  const [crateVal, setCrateVal] = useState<"1" | "2">(initialCrate);
  // Owner 2026-06-29 — ค่าตีลังไม้ (baht) now directly editable on the header.
  const initialPrice = Number(pricecrate ?? 0);
  const [priceVal, setPriceVal] = useState<string>(String(initialPrice));

  async function onSave(close: () => void) {
    const price = Number(priceVal);
    if (!Number.isFinite(price) || price < 0) {
      // surface via the shared editor error path by routing through run()
      run(() => Promise.resolve({ ok: false, error: "กรอกค่าตีลัง (บาท) ที่ถูกต้อง (≥ 0)" }), () => {});
      return;
    }
    if (crateVal === initialCrate && price === initialPrice) {
      run(() => Promise.resolve({ ok: false, error: "ไม่มีการเปลี่ยนแปลง (ค่าตีลังเดิม)" }), () => {});
      return;
    }
    if (!(await confirm(
      `บันทึกค่าตีลังไม้ ?\n\n` +
      `การตีลังไม้ : ${CRATE_LABEL[crateVal] ?? crateVal}\n` +
      `ค่าตีลังไม้ : ฿${price.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n\n` +
      `(เป็นส่วนหนึ่งของยอดรวมที่ลูกค้าต้องชำระ — เก็บในบิล)`,
    ))) return;
    run(() => adminUpdateForwarderCratePrice({ fId, crate: crateVal, pricecrate: price }), close);
  }

  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="การตีลังไม้"
        editing={editing}
        setEditing={setEditing}
        display={
          <>
            {CRATE_LABEL[crate === "1" ? "1" : "2"] ?? "—"}
            {Number(pricecrate ?? 0) > 0 && (
              <span className="text-muted text-xs ml-1.5">(฿{Number(pricecrate).toLocaleString("th-TH", { minimumFractionDigits: 2 })})</span>
            )}
          </>
        }
      >
        {(close) => (
          <>
            <div>
              <label className="block text-[11px] text-muted mb-0.5">การตีลังไม้</label>
              <select className={selectCls} value={crateVal} onChange={(e) => setCrateVal(e.target.value as "1" | "2")}>
                <option value="1">ตีลังไม้</option>
                <option value="2">ไม่ตีลังไม้</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-muted mb-0.5">ค่าตีลังไม้ (บาท)</label>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                className={`${inputCls} font-mono text-right`}
                value={priceVal}
                onChange={(e) => setPriceVal(e.target.value)}
                placeholder="0.00"
                disabled={pending}
              />
            </div>
            <p className="text-[11px] text-muted">
              ค่าตีลังไม้เป็นส่วนหนึ่งของยอดที่ลูกค้าต้องชำระ (รวมในบิล/ใบเสร็จ) — แก้ได้ทุกสถานะ
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={pending} className={btnSave}
                onClick={() => onSave(close)}>บันทึก</button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>ยกเลิก</button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

/** การเก็บเงิน · PCS L2428 — paymethod "1" ต้นทาง / "2" ปลายทาง.
 *  Owner 2026-07-09: DEFAULT = ต้นทาง (คิดค่าส่งจริง — the real Flash cost + margin
 *  is auto-filled + billed upfront). COD (ปลายทาง) is a MANUAL choice only, shown in
 *  red when the stored paymethod === "2" (the customer asked for เอกชน ปลายทาง). The
 *  dropdown stays editable behind the EditableRow "แก้ไข" toggle. */
export function EditPayMethodField({
  fId,
  paymethod,
  zip: _zip,
  fshipby: _fshipby,
}: { fId: number; paymethod: string | null; zip?: string | null; fshipby?: string | null }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const isManualCod = paymethod === "2"; // stored "2" = admin chose ปลายทาง COD
  const initialPay = (paymethod === "2" ? "2" : "1") as "1" | "2";
  const [payVal, setPayVal] = useState<"1" | "2">(initialPay);
  const payDisplay = isManualCod ? "ปลายทาง COD (ลูกค้าขอ)" : "ต้นทาง (คิดค่าส่งจริง)";
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="การเก็บเงินค่าขนส่งในไทย"
        editing={editing}
        setEditing={setEditing}
        display={
          <span className="inline-flex flex-col gap-0.5">
            <span className={isManualCod ? "rounded bg-red-50 text-red-700 px-1.5 py-0.5 text-xs font-medium" : "text-foreground"}>
              {payDisplay}
            </span>
          </span>
        }
      >
        {(close) => (
          <>
            <p className="text-[11px] text-muted-foreground mb-1">
              ค่าเริ่มต้น: ต้นทาง (คิดค่าส่งจริง) — เลือก “ปลายทาง COD” หากลูกค้าขอเก็บปลายทาง
            </p>
            <select className={selectCls} value={payVal} onChange={(e) => setPayVal(e.target.value as "1" | "2")}>
              <option value="1">ต้นทาง (คิดค่าส่งจริง)</option>
              <option value="2">ปลายทาง COD (ลูกค้าขอ)</option>
            </select>
            <div className="flex gap-2">
              <button type="button" disabled={pending} className={btnSave}
                onClick={() => run(() => adminUpdateForwarderPayMethod({ fId, paymethod: payVal }), close)}>บันทึก</button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>ยกเลิก</button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

/**
 * ค่าขนส่งไทย (ftransportprice) — Thai domestic shipping cost, editable on the left
 * panel (owner 2026-07-19). Fixes "Flash เลือกแล้วค่าส่งไม่ขึ้น" — the auto-quote
 * no-ops until the parcel is measured (dims+kg), leaving ฿0 with no field to fix
 * it here. Part of the customer bill; on a COD row the COD gate still drops the
 * domestic leg from the Pacred bill (shown as a chip so staff know).
 */
export function EditThShippingField({
  fId,
  ftransportprice,
  paymethod,
}: { fId: number; ftransportprice: number | string | null; paymethod?: string | null }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const current = Number(ftransportprice ?? 0);
  const [val, setVal] = useState(current > 0 ? String(current) : "");
  const isCod = paymethod === "2";
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="ค่าขนส่งไทย"
        editing={editing}
        setEditing={setEditing}
        display={
          <span className="inline-flex items-center gap-2">
            <span className={current > 0 ? "font-semibold text-foreground" : "text-amber-600 font-medium"}>
              {current > 0
                ? `฿${current.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "ยังไม่ระบุ (฿0)"}
            </span>
            {isCod && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">COD · ไม่คิดในบิลเรา</span>
            )}
          </span>
        }
      >
        {(close) => (
          <>
            <p className="text-[11px] text-muted-foreground mb-1">
              ค่าส่งในไทย (บาท) — ปกติระบบคิด Flash อัตโนมัติเมื่อวัดขนาด+น้ำหนักครบ · กรอกเองได้ถ้ายังไม่ขึ้น
            </p>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className={selectCls}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="0.00"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() => {
                  const n = Math.max(0, Number(val) || 0);
                  run(() => adminUpdateForwarderThShipping({ fId, ftransportprice: n }), close);
                }}
              >
                บันทึก
              </button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

/** One selectable private courier — computed SERVER-side from the delivery province
 *  (`getPrivateCarrierOptionsForProvince`) so the client never bundles the SOT.
 *  `note` = the per-province delivery restriction · `notes` = carrier-level notes
 *  ("เริ่มต้น 30" · "ไม่รับสาย" · "ต้องแจ้งอำเภอก่อน"). */
export type CarrierPick = { id: string; name: string; note?: string; notes?: string[] };

/**
 * CLIENT-side carrier options for a province — the exact shape the server passes via
 * `getPrivateCarrierOptionsForProvince`, computed here from the pure SOT so the province
 * <select> can refresh the courier list LIVE (even on a row that had no province stored).
 * `note` = this province's delivery restriction · `notes` = carrier-level notes.
 */
function carrierPicksForProvince(province: string | null | undefined): CarrierPick[] {
  const p = canonicalProvince(province);
  if (!p) return [];
  return carriersForProvince(p).map((c) => {
    const pick: CarrierPick = { id: c.code, name: c.name };
    const note = c.provinceNotes?.[p];
    if (note) pick.note = note;
    if (c.notes?.length) pick.notes = [...c.notes];
    return pick;
  });
}

/**
 * บริษัทขนส่ง · PCS L1579 — Pacred own-fleet preset · **ขนส่งเอกชนตามจังหวัดปลายทาง (CLOSED)**.
 *
 * 🔴 Owner 2026-07-14: "ให้อิง data ตามไฟล์นี้เลย · บังคับให้เลือกให้ใส่แค่ที่มีในไฟล์ที่ส่งให้เท่านั้น ·
 * ไม่ให้เลือกหรือให้ใส่ นอกเหนือจาก data ตรงนี้" → the free-text "ผู้ขนส่งภายนอก อื่นๆ (กรอกชื่อเอง)"
 * option is GONE. `carriers` is the province-filtered list from the owner's workbook
 * (carrier-province-coverage), each with its delivery restriction ("ไม่เข้าวังน้ำเขียว",
 * "ส่งแค่บางเลน", "ไม่ไป เบตง"). The server action re-checks it (checkCarrierForProvince) —
 * this picker is the UX half of the rule, not the gate.
 *
 * A carrier ALREADY stored but no longer selectable (retired courier · legacy free text like
 * "สมใจสาย4" · the address moved province) still RENDERS, and stays visible in the <select> as a
 * disabled "ค่าเดิม" entry so staff can see what it was — but Save is blocked until they pick a
 * valid one. Existing data is never silently rewritten or lost.
 */
export function EditShipByField({
  fId,
  fshipby,
  province,
  carriers = [],
}: {
  fId: number;
  fshipby: string | null;
  /** The EFFECTIVE delivery province (order → customer primary address → juristic company
   *  address), canonicalised server-side. Seeds the inline "จังหวัดปลายทาง" <select> +
   *  the initial courier list, so the picker is usable even when faddressprovince is empty. */
  province?: string | null;
  /** Server-computed courier list for `province` (first paint / read-view badge). The editor
   *  recomputes it LIVE from the chosen จังหวัด via `carrierPicksForProvince`. */
  carriers?: CarrierPick[];
}) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);

  const cur = (fshipby ?? "").trim();
  const isPresetShipBy = SHIPBY_PRESETS.includes(cur as (typeof SHIPBY_PRESETS)[number]);
  const effectiveProvince = canonicalProvince(province ?? "");
  /** Read-view badge: is the STORED carrier valid for the address's (effective) province? */
  const staleCurrent = cur !== "" && !isPresetShipBy && !carriers.some((c) => c.id === cur);

  // "จังหวัดปลายทาง" the picker filters by — starts at the effective (shown) province, but
  // staff can change it inline so an address-less / juristic row is still usable in one place.
  const [selectedProvince, setSelectedProvince] = useState<string>(effectiveProvince);
  // Live courier list for the chosen province (client-side, same pure SOT the server used).
  // The editor is only rendered after "แก้ไข" (client) so there is no SSR hydration to match.
  const liveCarriers = useMemo<CarrierPick[]>(
    () => carrierPicksForProvince(selectedProvince),
    [selectedProvince],
  );

  const initialShipByMode = cur !== "" ? cur : "PCS";
  const [shipByMode, setShipByMode] = useState<string>(initialShipByMode);
  const selected = liveCarriers.find((c) => c.id === shipByMode);
  const selectedNote = selected?.note ?? "";
  const selectedNotes = selected?.notes ?? [];
  /** The stored carrier isn't selectable in the CHOSEN province's list → show as disabled "ค่าเดิม". */
  const curStaleInLive = cur !== "" && !isPresetShipBy && !liveCarriers.some((c) => c.id === cur);
  /** Saving is only allowed for an own-fleet preset or a courier that runs in the chosen province. */
  const canSave =
    SHIPBY_PRESETS.includes(shipByMode as (typeof SHIPBY_PRESETS)[number]) ||
    liveCarriers.some((c) => c.id === shipByMode);

  function onProvinceChange(next: string) {
    setSelectedProvince(next);
    // Keep own-fleet presets; drop a private carrier the NEW province cannot back (→ re-pick).
    if (
      !SHIPBY_PRESETS.includes(shipByMode as (typeof SHIPBY_PRESETS)[number]) &&
      !carrierPicksForProvince(next).some((c) => c.id === shipByMode)
    ) {
      setShipByMode("PCS");
    }
  }

  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="บริษัทขนส่ง"
        editing={editing}
        setEditing={setEditing}
        display={
          <span className="inline-flex flex-col gap-0.5">
            <span className="break-words">{carrierLabel(fshipby)}</span>
            {carrierProvinceNoteOf(carriers, cur) && (
              <span className="text-[11px] text-amber-700">⚠ {carrierProvinceNoteOf(carriers, cur)}</span>
            )}
            {staleCurrent && (
              <span className="text-[11px] text-amber-700">
                ⚠ ไม่อยู่ในรายชื่อขนส่งที่วิ่ง{effectiveProvince ? ` จ.${effectiveProvince}` : "จังหวัดนี้"} — กรุณาเลือกใหม่
              </span>
            )}
          </span>
        }
      >
        {(close) => (
          <>
            {/* จังหวัดปลายทาง — owner 2026-07-15: "ที่อยู่จัดส่งมีจังหวัดอยู่แล้ว · lock auto ·
                ห้ามให้เลือกจังหวัดอีก". When the delivery address gives us a province, LOCK it
                (the ขนส่งเอกชน list below filters by it automatically) — the province follows the
                address, not a separate picker. Only when there's NO address province (address-less
                row) do we fall back to a manual <select> so the courier list is still reachable. */}
            {effectiveProvince ? (
              <div>
                <label className="block text-[11px] text-muted mb-0.5">จังหวัดปลายทาง</label>
                <div className="rounded-md border border-border bg-surface-alt/50 px-2.5 py-1.5 text-sm font-medium flex flex-wrap items-center gap-1.5">
                  🔒 {effectiveProvince}
                  <span className="text-[11px] text-muted font-normal">(จากที่อยู่จัดส่ง · อัตโนมัติ)</span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] text-muted mb-0.5">จังหวัดปลายทาง</label>
                <select className={selectCls} value={selectedProvince} onChange={(e) => onProvinceChange(e.target.value)}>
                  <option value="">— เลือกจังหวัด —</option>
                  {THAI_PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted mt-0.5">ลูกค้ายังไม่มีที่อยู่จัดส่งที่มีจังหวัด — เลือกจังหวัดเพื่อให้ขึ้นขนส่งเอกชนในพื้นที่</p>
              </div>
            )}
            <div>
              <label className="block text-[11px] text-muted mb-0.5">บริษัทขนส่ง</label>
              <select className={selectCls} value={shipByMode} onChange={(e) => setShipByMode(e.target.value)}>
                <optgroup label="Pacred (ส่งเอง)">
                  <option value="PCS">รับเองที่โกดัง Pacred (ไม่มีค่าส่ง)</option>
                  <option value="PCSF">Pacred เหมาๆ · ส่งในเขต ฿100</option>
                  <option value="PCSE">Pacred Express · ส่งด่วน (ปริมาตร×120 · ขั้นต่ำ ฿50)</option>
                </optgroup>
                {liveCarriers.length > 0 && (
                  <optgroup label={`ขนส่งเอกชน ที่วิ่ง${selectedProvince ? ` จ.${selectedProvince}` : "จังหวัดปลายทาง"} (${liveCarriers.length})`}>
                    {liveCarriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.note ? ` — ${c.note}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {curStaleInLive && (
                  <optgroup label="ค่าเดิม (เลือกใหม่ไม่ได้ · ไม่อยู่ในไฟล์พื้นที่ขนส่ง)">
                    <option value={cur} disabled>{carrierLabel(cur)}</option>
                  </optgroup>
                )}
              </select>
            </div>
            {(selectedNote || selectedNotes.length > 0) && (
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 space-y-0.5">
                {selectedNote && <p>⚠ พื้นที่ส่ง: {selectedNote}</p>}
                {selectedNotes.map((n) => (
                  <p key={n}>• {n}</p>
                ))}
              </div>
            )}
            {!selectedProvince && (
              <p className="text-[11px] text-amber-700">
                เลือก “จังหวัดปลายทาง” ก่อน แล้วระบบจะขึ้นรายชื่อขนส่งเอกชนที่วิ่งในจังหวัดนั้นให้เลือก
                (เลือกได้เฉพาะที่มีในไฟล์พื้นที่ขนส่งของบริษัท) — หรือเลือก Pacred (ส่งเอง) ได้เลย
              </p>
            )}
            {selectedProvince && liveCarriers.length === 0 && (
              <p className="text-[11px] text-amber-700">
                ยังไม่มี “ขนส่งเอกชน” ที่วิ่ง จ.{selectedProvince} ในไฟล์พื้นที่ขนส่งของบริษัท — เลือก Pacred (ส่งเอง) หรือเปลี่ยนจังหวัด
              </p>
            )}
            {!canSave && (
              <p className="text-[11px] text-red-700">
                เลือกบริษัทขนส่งจากรายชื่อก่อน — ระบบไม่อนุญาตให้ใส่ขนส่งนอกไฟล์พื้นที่ขนส่ง
              </p>
            )}
            <p className="text-[11px] text-muted">
              รับเองโกดัง Pacred → ที่อยู่จะถูกแทนด้วยโกดัง Pacred (สมุทรสาคร) · ตัวเลือก Pacred คิดค่าขนส่งใหม่อัตโนมัติ ·
              เลือกขนส่งเอกชน → บันทึกจังหวัดปลายทางให้ด้วย (จำไว้ใช้ครั้งหน้า)
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={pending || !canSave} className={btnSave}
                onClick={() => run(() => adminUpdateForwarderShipBy({ fId, fShipBy: shipByMode, province: selectedProvince }), close)}>บันทึก</button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>ยกเลิก</button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

/** The restriction note of the CURRENTLY-stored carrier in this province (display badge). */
function carrierProvinceNoteOf(carriers: CarrierPick[], code: string): string {
  if (!code) return "";
  return carriers.find((c) => c.id === code)?.note ?? "";
}

/**
 * ที่อยู่จัดส่ง — เลือกจากที่อยู่ที่ลูกค้าบันทึกไว้ (ภูม 2026-07-03 · "แก้ไขที่อยู่หน้านี้ได้เลย
 * ดึงจากที่อยู่ในโปรไฟล์ลูกค้า · ถ้ามีหลายที่อยู่กดเลือกได้ เหมือนตอนเลือกบริษัทขนส่ง").
 *
 * Reuses adminPickForwarderAddress (PCS L1737 · ownership+active-guarded · snapshots the
 * chosen tb_address into tb_forwarder.fAddress*). NO new write path. Guards:
 *   - fshipby='PCS' (รับเองโกดัง) → ไม่มีที่อยู่จัดส่ง → ปุ่มโชว์หมายเหตุ (action ก็ปฏิเสธ)
 *   - ไม่มีที่อยู่บันทึกไว้ → หมายเหตุ + ลิงก์ให้ลูกค้าเพิ่มที่อยู่
 * Confirm-before-mutate (§0f). The address SNAPSHOT changes only; the carrier stays as its
 * own edit (บริษัทขนส่ง แก้ไข) — pick a matching carrier separately if the province changed.
 */
export function EditDeliveryAddressField({
  fId,
  userid,
  fshipby,
  addresses,
}: {
  fId: number;
  userid: string;
  fshipby: string | null;
  addresses: CustomerAddressRow[];
}) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const isPcs = (fshipby ?? "").trim() === "PCS";

  // onPick from the reusable <CustomerAddressPicker> — confirm + snapshot via the
  // existing adminPickForwarderAddress (ownership+active-guarded · no new write path).
  async function onPickApply(addressId: number) {
    if (!Number.isInteger(addressId) || addressId <= 0) return;
    const picked = addresses.find((a) => a.addressID === addressId);
    const label = picked ? `${picked.name} ${picked.lastname} · ${picked.province} ${picked.zipcode}` : `#${addressId}`;
    if (!(await confirm(
      `เปลี่ยนที่อยู่จัดส่งเป็น ?\n\n${label}\n\n• ดึงที่อยู่ลูกค้ามาใส่ออเดอร์นี้\n• บริษัทขนส่ง + ค่าส่งในไทย จะจับตามจังหวัดให้อัตโนมัติ (แก้ได้)`,
    ))) return;
    run(() => adminPickForwarderAddress({ fId, addressId }), () => setEditing(false));
  }
  async function onWarehouse(close: () => void) {
    if (!(await confirm(
      `เปลี่ยนเป็น "รับเองที่โกดัง Pacred" ?\n\n• บริษัทขนส่ง → รับเองโกดัง · ค่าส่งในไทย = ฿0\n• ที่อยู่จัดส่งจะเป็นที่อยู่โกดัง Pacred`,
    ))) return;
    run(() => adminUpdateForwarderShipBy({ fId, fShipBy: "PCS" }), close);
  }

  const inp = "w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50";

  return (
    <div className="mt-1.5">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      {!editing ? (
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-sky-600 hover:underline">
          ✏️ แก้ไข / เลือกที่อยู่จัดส่ง
        </button>
      ) : (
        <div className="space-y-2 text-left rounded-lg border border-border bg-surface-alt/40 p-2.5">
          {isPcs && (
            <p className="text-[11px] text-amber-700">
              ℹ️ ตอนนี้เป็น <b>รับเองที่โกดัง</b> — เลือก/พิมพ์ที่อยู่จัดส่งได้เลย ระบบจะเปลี่ยนขนส่งให้อัตโนมัติ
            </p>
          )}
          {/* owner 2026-07-21: *"เอากรอบแก้ไขที่อยู่ตรงนี้ออกไปเลย · ต้องกลับไปตั้งในหน้า
              profile ลูกค้าเอง · ตรงนี้มีแค่เอาไว้เลือกที่อยู่สำรอง กรณีมีมากกว่า 1 ที่อยู่"* —
              พิมพ์แก้ที่อยู่ตรงนี้ถูกถอดออกแล้ว. สมุดที่อยู่ในโปรไฟล์ลูกค้า = แหล่งเดียว
              (พิมพ์ 2 ที่ = ต้องไล่ตามให้ตรงกันตลอด). ที่นี่ทำได้แค่ "เลือก" ที่อยู่ที่ลูกค้ามีอยู่. */}
          {addresses.length > 0 ? (
            <div className="space-y-1.5">
              <CustomerAddressPicker
                userid={userid}
                addresses={addresses}
                busy={pending}
                revalidate={`/admin/forwarders/${fId}`}
                applyLabel="ใช้ที่อยู่นี้กับออเดอร์"
                selectOnly
                onPick={onPickApply}
              />
              <p className="text-[11px] text-muted">
                บริษัทขนส่ง + ค่าส่งในไทย จับตามจังหวัดของที่อยู่ให้อัตโนมัติ (แก้ได้ที่ช่องบริษัทขนส่ง)
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-amber-700">
              ลูกค้ารายนี้ยังไม่มีที่อยู่ในระบบ — ไปเพิ่มที่หน้าโปรไฟล์ลูกค้าก่อน แล้วกลับมาเลือกที่นี่
            </p>
          )}
          {/* ทางเดียวในการ "แก้/เพิ่ม" ที่อยู่ = โปรไฟล์ลูกค้า (แหล่งเดียว · ไม่ต้องกรอกซ้ำ) */}
          <Link
            href={`/admin/customers/${encodeURIComponent(userid)}`}
            className="inline-block text-[11px] font-medium text-sky-600 hover:underline"
          >
            ✎ แก้ไข / เพิ่มที่อยู่ของลูกค้า → หน้าโปรไฟล์ลูกค้า
          </Link>

          <div className="flex items-center gap-2 border-t border-border pt-2">
            <button type="button" disabled={pending || isPcs} className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              onClick={() => onWarehouse(() => setEditing(false))}>
              🏢 รับเองที่โกดัง (ขนส่ง→รับเองโกดัง)
            </button>
            <button type="button" disabled={pending} className={btnCancel} onClick={() => setEditing(false)}>ยกเลิก</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** ผู้รับใบกำกับ (Bill-to override) · Pacred extension. */
export function EditBillToField({ fId, fbilltoname, defaultBillTo }: { fId: number; fbilltoname: string | null; defaultBillTo: string }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const [billToVal, setBillToVal] = useState<string>(fbilltoname ?? "");
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="ชื่อผู้รับใบกำกับ"
        editing={editing}
        setEditing={setEditing}
        display={
          fbilltoname && fbilltoname.trim() !== ""
            ? <span className="rounded bg-violet-50 text-violet-700 px-1.5 py-0.5 text-xs">{fbilltoname}</span>
            : <span className="text-muted">{defaultBillTo || "—"} (ค่าเริ่มต้น)</span>
        }
      >
        {(close) => (
          <>
            <input type="text" value={billToVal} onChange={(e) => setBillToVal(e.target.value)} maxLength={200}
              placeholder={defaultBillTo || "เว้นว่าง = ใช้ชื่อเริ่มต้น"} className={inputCls} />
            <p className="text-[11px] text-muted">
              ปล่อยว่าง = กลับใช้ชื่อเริ่มต้น ({defaultBillTo || "—"}) · สูงสุด 200 ตัวอักษร
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={pending} className={btnSave}
                onClick={() => run(() => adminSetForwarderBillToOverride({ f_no: String(fId), override: billToVal.trim() }), close)}>บันทึก</button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>ยกเลิก</button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

/**
 * โหมดเอกสารภาษี (ใบกำกับ / ใบขน / ไม่รับเอกสาร) · Lane B.
 *
 * UN-ORPHANS adminUpdateForwarderTaxDocMode (the action + the doc-mode UI lived
 * only in the never-mounted tb-edit-panel.tsx → unreachable). This compact
 * inline field makes the customer's tax-document choice both VISIBLE (the badge
 * in the display row) and CORRECTABLE by staff, on the same page as every other
 * field. Confirm-before-mutate (§0f) via the shared confirm() dialog — the
 * dialog spells out the new mode + its VAT base + that it only affects documents
 * issued AFTER the change.
 *
 * DISPLAY/PREF only — does NOT re-issue an already-issued document and does NOT
 * touch the VAT base math (computeTaxForMode stays the SOT).
 */
export function EditTaxDocModeField({ fId, taxDocPref }: { fId: number; taxDocPref: string | null }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const currentMode = modeFromPref(taxDocPref);
  const [mode, setMode] = useState<TaxDocMode>(currentMode);
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="เอกสารภาษี"
        editing={editing}
        setEditing={setEditing}
        display={<TaxDocBadge pref={taxDocPref} />}
      >
        {(close) => (
          <>
            <select
              className={selectCls}
              value={mode}
              onChange={(e) => setMode(e.target.value as TaxDocMode)}
            >
              {TAX_DOC_MODES.map((m) => (
                <option key={m} value={m}>{TAX_DOC_MODE_META[m].title}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted">
              {TAX_DOC_MODE_META[mode].hint}
              <br />
              ฐาน VAT: <b>{TAX_DOC_MODE_META[mode].vatBase}</b>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || mode === currentMode}
                className={btnSave}
                onClick={async () => {
                  // §0f confirm-before-mutate — name the new mode + VAT base, and
                  // that it only governs documents issued AFTER this change.
                  const meta = TAX_DOC_MODE_META[mode];
                  if (!(await confirm(
                    `เปลี่ยนโหมดเอกสารภาษีเป็น "${meta.title}" ?\n\n` +
                    `${meta.hint}\n` +
                    `ฐาน VAT: ${meta.vatBase}\n\n` +
                    `(มีผลตอนชำระเงิน — ระบบจะออกเอกสารตามโหมดนี้ · ไม่กระทบเอกสารที่ออกไปแล้ว)`,
                  ))) return;
                  run(() => adminUpdateForwarderTaxDocMode({ fId, mode }), close);
                }}
              >
                บันทึก
              </button>
              <button
                type="button"
                disabled={pending}
                className={btnCancel}
                onClick={() => { setMode(currentMode); close(); }}
              >
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

/** เลขพัสดุจีน · PCS L1562 — ftrackingchn (locked fstatus=7). */
export function EditTrackingChnField({ fId, ftrackingchn, fstatus }: { fId: number; ftrackingchn: string | null; fstatus: string | null }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const [trackingChnVal, setTrackingChnVal] = useState<string>(ftrackingchn ?? "");
  const trackingLocked = (fstatus ?? "") === "7";
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="เลขพัสดุจีน"
        editing={editing}
        setEditing={setEditing}
        display={
          ftrackingchn && ftrackingchn.trim() !== ""
            ? <span className="font-mono font-bold text-primary-600 break-all">{ftrackingchn}</span>
            : <span className="text-muted">—</span>
        }
      >
        {(close) =>
          trackingLocked ? (
            <>
              <p className="text-[11px] text-red-700">⚠ รายการนี้ถูกส่งแล้ว (fStatus=7) — เลขแทรคกิ้งจีนถูกล็อก แก้ไขไม่ได้</p>
              <div className="flex gap-2">
                <button type="button" className={btnCancel} onClick={close}>ปิด</button>
              </div>
            </>
          ) : (
            <>
              <input type="text" value={trackingChnVal} onChange={(e) => setTrackingChnVal(e.target.value)} maxLength={60}
                placeholder="เลขแทรคกิ้งจาก vendor จีน" className={inputCls} />
              <p className="text-[11px] text-muted">แก้ไขได้ก่อนรายการจะถูกส่ง (fStatus &lt; 7) เท่านั้น</p>
              <div className="flex gap-2">
                <button type="button" disabled={pending || trackingChnVal.trim() === ""} className={btnSave}
                  onClick={() => run(() => adminUpdateForwarderTrackingChn({ fId, ftrackingchn: trackingChnVal.trim() }), close)}>บันทึก</button>
                <button type="button" disabled={pending} className={btnCancel}
                  onClick={() => { setTrackingChnVal(ftrackingchn ?? ""); close(); }}>ยกเลิก</button>
              </div>
            </>
          )
        }
      </EditableRow>
    </div>
  );
}

/** เลขที่ตู้ · fcabinetnumber — inline edit (owner 2026-06-11 "เพิ่มปุ่มแก้ไข · แก้เลขตู้ตรงนั้น
    ได้เลย"). แก้เฉพาะเลขตู้ (ไม่เปลี่ยนสถานะ) · ยังลิงก์ไป /admin/report-cnt เหมือนเดิม. */
export function EditCabinetField({ fId, fcabinetnumber, fcabinetLocked }: { fId: number; fcabinetnumber: string | null; fcabinetLocked?: boolean }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const [cabinetVal, setCabinetVal] = useState<string>(fcabinetnumber ?? "");
  const cur = (fcabinetnumber ?? "").trim();
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label={fcabinetLocked ? "เลขที่ตู้ 🔒" : "เลขที่ตู้"}
        editing={editing}
        setEditing={setEditing}
        display={
          cur !== ""
            ? <Link href={`/admin/report-cnt/${encodeURIComponent(cur)}`} className="text-primary-600 hover:underline font-mono break-all">{fcabinetnumber}</Link>
            : <span className="text-muted">—</span>
        }
      >
        {(close) => (
          <>
            <input type="text" value={cabinetVal} onChange={(e) => setCabinetVal(e.target.value)} maxLength={300}
              placeholder="GZE-2026-001 / GZS..." className={inputCls} />
            <p className="text-[11px] text-muted">แก้เฉพาะเลขตู้ (ไม่เปลี่ยนสถานะ) · เว้นว่าง = ล้างเลขตู้</p>
            <div className="flex gap-2">
              <button type="button" disabled={pending || cabinetVal.trim() === cur} className={btnSave}
                onClick={() => run(() => adminUpdateForwarderCabinet({ fId, cabinet: cabinetVal.trim() }), close)}>บันทึก</button>
              <button type="button" disabled={pending} className={btnCancel}
                onClick={() => { setCabinetVal(fcabinetnumber ?? ""); close(); }}>ยกเลิก</button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

/** รูปแบบขนส่ง จีน-ไทย · PCS L1458 — ftransporttype. */
export function EditTransportTypeField({ fId, ftransporttype }: { fId: number; ftransporttype: string | null }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const initialTransport = (["1", "2", "3"].includes(ftransporttype ?? "") ? ftransporttype : "1") as "1" | "2" | "3";
  const [transportVal, setTransportVal] = useState<"1" | "2" | "3">(initialTransport);
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="รูปแบบขนส่ง จีน-ไทย"
        editing={editing}
        setEditing={setEditing}
        display={TRANSPORT_LABEL[ftransporttype ?? "1"] ?? `mode ${ftransporttype ?? "-"}`}
      >
        {(close) => (
          <>
            <select className={selectCls} value={transportVal} onChange={(e) => setTransportVal(e.target.value as "1" | "2" | "3")}>
              <option value="1">ทางรถ (5-7 วัน)</option>
              <option value="2">ทางเรือ (12-16 วัน)</option>
              <option value="3">ทางอากาศ</option>
            </select>
            <p className="text-[11px] text-muted">⚠ เปลี่ยนแล้วราคาไม่อัพเดทอัตโนมัติ — แก้ไขขนาด/น้ำหนักเพื่อคำนวณเรทใหม่</p>
            <div className="flex gap-2">
              <button type="button" disabled={pending} className={btnSave}
                onClick={() => run(() => adminUpdateForwarderTransportType({ fId, transportType: transportVal }), close)}>บันทึก</button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>ยกเลิก</button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

/** วันที่ปิดตู้ · PCS L1541 — fdatecontainerclose + fdatetothai.
 *  ภูม 2026-07-10: ถ้า MOMO ไม่ได้ส่งวันปิดตู้มา (null) ให้ดึงจากเลขตู้แทน
 *  (GZS260529-1 → 2026-05-29) เป็น fallback แสดงผล — รายการที่ MOMO ส่งมาแล้วไม่แตะ. */
export function EditDateCloseField({ fId, fdatecontainerclose, fcabinetnumber }: { fId: number; fdatecontainerclose: string | null; fcabinetnumber?: string | null }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const hasRealClose = !!(fdatecontainerclose && /^\d{4}-\d{2}-\d{2}/.test(fdatecontainerclose));
  const derivedClose = hasRealClose ? null : deriveContainerCloseDate(fcabinetnumber);
  // The effective close date the field shows/edits from: real MOMO date wins,
  // else the date embedded in the cabinet code.
  const effectiveClose = hasRealClose ? fdatecontainerclose!.slice(0, 10) : (derivedClose ?? "");
  const [dateCloseVal, setDateCloseVal] = useState<string>(effectiveClose);
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="วันที่ปิดตู้"
        editing={editing}
        setEditing={setEditing}
        display={
          hasRealClose ? (
            <span className="font-mono">{new Date(fdatecontainerclose!).toLocaleDateString("th-TH")}</span>
          ) : derivedClose ? (
            <span className="inline-flex items-center gap-1">
              <span className="font-mono">{new Date(derivedClose).toLocaleDateString("th-TH")}</span>
              <span className="rounded bg-amber-100 px-1 py-0.5 text-[11px] text-amber-700 border border-amber-300">จากเลขตู้</span>
            </span>
          ) : (
            <span className="text-muted">—</span>
          )
        }
      >
        {(close) => (
          <>
            <input type="date" value={dateCloseVal} onChange={(e) => setDateCloseVal(e.target.value)} className={inputCls} />
            <p className="text-[11px] text-muted">
              วันที่จะอัปเดตทั้ง <b>วันปิดตู้</b> และ <b>วันถึงไทย (ETA)</b> โดยอัตโนมัติ
              (รถ +5 วัน · เรือ/อากาศ +12 วัน)
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={pending || !/^\d{4}-\d{2}-\d{2}$/.test(dateCloseVal)} className={btnSave}
                onClick={() => run(() => adminUpdateForwarderDateToThai({ fId, fdatecontainerclose: dateCloseVal }), close)}>บันทึก</button>
              <button type="button" disabled={pending} className={btnCancel}
                onClick={() => {
                  setDateCloseVal(effectiveClose);
                  close();
                }}>ยกเลิก</button>
            </div>
          </>
        )}
      </EditableRow>
    </div>
  );
}

// ภูม 2026-07-13: SplitBoxesButton (แตกกล่อง MOMO) REMOVED — box-split is now automatic
// at commit (commit-momo-row-core split-at-commit · same money-neutral splitAggregatedMomoBoxRows).
// The manual button was broken when the aggregate weight ≠ Σ boxes (MOMO มั่ว) and is
// redundant now. adminSplitForwarderBoxes stays in forwarders-field-edits.ts (unreferenced).

/** การรวมกล่อง · PCS L2450 — famountcount. */
export function EditAmountCountField({ fId, famountcount, famount }: { fId: number; famountcount: string | null; famount?: number | null }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const initialAmountCount = (famountcount === "1" ? "1" : "2") as "1" | "2";
  const [amountCountVal, setAmountCountVal] = useState<"1" | "2">(initialAmountCount);
  // จำนวนกล่อง/ชิ้น (famount) — editable so staff can correct it to match MOMO
  // (owner/ภูม 2026-07-08: "แก้จำนวนกล่องก็ไม่ได้"). display-only field · money-safe.
  const [amountVal, setAmountVal] = useState<string>(String(famount ?? 1));
  return (
    <div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      <EditableRow
        compact
        label="จำนวน · การรวมกล่อง"
        editing={editing}
        setEditing={setEditing}
        display={
          <>
            <span className="font-mono font-bold">{famount ?? 0}</span> กล่อง
            {famountcount === "1" ? (
              <span className="ml-1.5 rounded bg-red-50 text-red-700 px-1.5 py-0.5 text-xs">รวมกล่อง</span>
            ) : (
              <span className="ml-1.5 text-xs text-muted">({AMOUNT_COUNT_LABEL[famountcount ?? "2"] ?? "ไม่รวมกล่อง"})</span>
            )}
          </>
        }
      >
        {(close) => {
          const amountNum = Math.max(1, Math.round(Number(amountVal) || 0));
          return (
          <>
            <label className="block text-[11px] text-muted mb-0.5">จำนวนกล่อง/ชิ้น (ให้ตรงกับ MOMO)</label>
            <input
              type="number" min={1} max={9999} inputMode="numeric"
              className={`${selectCls} w-28`} value={amountVal}
              onChange={(e) => setAmountVal(e.target.value)}
            />
            <label className="block text-[11px] text-muted mt-2 mb-0.5">การรวมกล่อง (ฐานคิดราคา)</label>
            <select className={selectCls} value={amountCountVal} onChange={(e) => setAmountCountVal(e.target.value as "1" | "2")}>
              <option value="2">ไม่รวมกล่อง (คิดราคาแยกต่อกล่อง)</option>
              <option value="1">รวมกล่อง (คิดราคารวมทั้งบิล)</option>
            </select>
            <p className="text-[11px] text-muted">จำนวน = แค่แสดงผล (ไม่กระทบยอดเงิน) · การรวมกล่อง = ฐานคิดราคา มีผลตอนแก้ขนาด/น้ำหนักครั้งถัดไป (ราคาเดิมไม่ recompute)</p>
            <div className="flex gap-2">
              <button type="button" disabled={pending} className={btnSave}
                onClick={() => run(() => adminUpdateForwarderAmountCount({ fId, famountcount: amountCountVal, famount: amountNum }), close)}>บันทึก</button>
              <button type="button" disabled={pending} className={btnCancel} onClick={close}>ยกเลิก</button>
            </div>
          </>
          );
        }}
      </EditableRow>
    </div>
  );
}

export type ForwarderGalleryImage = { key: string; url: string; isCover: boolean; canDelete: boolean };

/**
 * รูปสินค้า (GALLERY) · migration 0176 — multi-image gallery on the forwarder
 * detail page.
 *
 * 2026-06-11 (ปอน · owner "มันไม่ใช่ 'เปลี่ยนรูปสินค้า' แต่เป็น 'เพิ่มรูปภาพ' · มันจะ
 * มีหลายๆรูปภาพ"): replaces the single cover-replace with a per-order gallery. Shows
 * the cover (fcover · badge "ปก") + every uploaded image (fimages), "เพิ่มรูปภาพ"
 * appends (adminAddForwarderImage), and each gallery image is deletable
 * (adminRemoveForwarderImage). Confirm-before-mutate (§0f): explicit edit-mode +
 * preview before อัปโหลด, and a confirm dialog before delete. Client type + 5 MB
 * guard → clean Thai error before the 12 MB bodySizeLimit (nextjs-16-quirks).
 */
export function EditCoverField({ fId, images }: { fId: number; images: ForwarderGalleryImage[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  // Revoke the preview blob URL when it changes / unmounts.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function clearPick() { setFile(null); setPreview(null); setLocalErr(null); }
  function close() { setEditing(false); clearPick(); }
  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setLocalErr(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) { clearPick(); return; }
    if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) {
      setLocalErr("รับเฉพาะรูป PNG / JPEG / WEBP"); setFile(null); setPreview(null); return;
    }
    if (f.size > 5 * 1024 * 1024) {
      const mb = Math.round((f.size / (1024 * 1024)) * 10) / 10;
      setLocalErr(`ไฟล์ใหญ่เกิน 5 MB (ขนาด ${mb} MB) — เลือกรูปใหม่`); setFile(null); setPreview(null); return;
    }
    setFile(f); setPreview(URL.createObjectURL(f));
  }
  function onUpload() {
    if (!file) return;
    setLocalErr(null);
    const fd = new FormData();
    fd.append("fId", String(fId));
    fd.append("file", file);
    startTransition(async () => {
      const res = await adminAddForwarderImage(fd);
      if (res.ok) { close(); router.refresh(); }
      else setLocalErr(res.error ?? "อัปโหลดไม่สำเร็จ");
    });
  }
  // 2026-06-11 (ปอน · owner "กดแล้วรูปไม่หาย"): confirm() ต้องอยู่ "นอก" startTransition
  // — เรียก confirm (async dialog ที่รอ user คลิก) ข้างใน transition ทำให้ dialog ไม่เด้ง
  // → ลบไม่ทำงาน. ถาม-ยืนยันก่อน แล้วค่อย startTransition ทำ mutation (แบบเดียวกับ onSaveAll).
  async function onDelete(key: string) {
    setLocalErr(null);
    if (!(await confirm("ลบรูปนี้ออกจากแกลเลอรี?"))) return;
    startTransition(async () => {
      const res = await adminRemoveForwarderImage({ fId, imageKey: key });
      if (res.ok) router.refresh();
      else setLocalErr(res.error ?? "ลบไม่สำเร็จ");
    });
  }

  return (
    <div className="pt-1">
      {localErr && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {localErr}</div>}

      {/* HAS images → gallery thumbnails (cover badge + per-image delete).
          NO images → the Pacred upload placeholder (UploadimagesPacred.png),
          clickable to open the picker. Owner 2026-06-11: "ถ้าไม่มีรูปให้เอาภาพนี้
          ขึ้นไว้ · กดที่ภาพแล้วอัปได้ · ถ้ามีภาพให้แสดงภาพจริง". */}
      {images.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-2 md:justify-end">
          {images.map((img) => (
            <div key={img.key} className="relative">
              <a href={img.url} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="รูปสินค้า" className="h-20 w-20 rounded-lg border border-border object-cover" />
              </a>
              {img.isCover && (
                <span className="absolute left-1 top-1 rounded bg-primary-600 px-1 py-0.5 text-[11px] font-semibold text-white shadow">ปก</span>
              )}
              {img.canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(img.key)}
                  disabled={pending}
                  aria-label="ลบรูป"
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="คลิกเพื่อเพิ่มรูปภาพ"
          className="mt-1 block rounded-lg transition-opacity hover:opacity-80 md:ml-auto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/hero-section/icon-draf/UploadimagesPacred.png"
            alt="เพิ่มรูปภาพ — ยังไม่มีรูปสินค้า"
            className="h-28 w-28 object-contain"
          />
        </button>
      )}

      {/* "เพิ่มรูปภาพ" — ALWAYS visible (owner: "ไม่ซ่อนปุ่ม เพิ่มรูปภาพไว้เลย") */}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline"
      >
        <Camera className="h-3.5 w-3.5" /> เพิ่มรูปภาพ
      </button>

      {/* file picker — opens BELOW (the button above stays visible) */}
      {editing && (
        <div className="mt-2 space-y-2 text-left">
          <StyledFileInput
            accept="image/png,image/jpeg,image/webp"
            disabled={pending}
            label="เลือกรูปภาพ (คลิกเพื่อเลือกรูป)"
            hint="PNG / JPEG / WEBP · ไม่เกิน 5 MB · เพิ่มได้หลายรูป"
            onChange={onPick}
          />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="ตัวอย่างรูปใหม่" className="w-full max-w-[160px] rounded-lg border border-border object-cover" />
          )}
          <div className="flex gap-2">
            <button type="button" disabled={pending || !file} className={btnSave} onClick={onUpload}>
              {pending ? "กำลังอัปโหลด…" : "เพิ่มรูปนี้"}
            </button>
            <button type="button" disabled={pending} className={btnCancel} onClick={close}>ยกเลิก</button>
          </div>
        </div>
      )}
    </div>
  );
}
