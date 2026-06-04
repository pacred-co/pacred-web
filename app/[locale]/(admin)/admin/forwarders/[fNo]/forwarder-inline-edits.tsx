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

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, AlertTriangle } from "lucide-react";
import {
  adminUpdateForwarderTransportType,
  adminUpdateForwarderCrate,
  adminUpdateForwarderShipBy,
  adminUpdateForwarderPayMethod,
  adminUpdateForwarderAmountCount,
  adminUpdateForwarderPallet,
  adminUpdateForwarderTrackingChn,
  adminUpdateForwarderDateToThai,
  adminReassignForwarderOwner,
} from "@/actions/admin/forwarders-field-edits";
import { adminSetForwarderBillToOverride } from "@/actions/admin/forwarders";

type ActionResult = { ok: true; data?: unknown } | { ok: false; error?: string };

const selectCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const btnSave =
  "rounded-md bg-primary-500 px-3 py-1 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50";
const btnCancel =
  "rounded-md border border-border px-3 py-1 text-xs hover:bg-surface-alt disabled:opacity-50";

/** Shared "display + แก้ไข" → editor toggle row. */
function EditableRow({
  label,
  display,
  children,
  editing,
  setEditing,
}: {
  label: string;
  display: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
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

// PCS-family ship-by preset options (matches tb-edit-panel.tsx L57-L61).
const SHIPBY_PRESETS = ["PCS", "PCSF", "PCSE"] as const;

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
  const initialShipByMode = isPresetShipBy ? (p.fshipby as (typeof SHIPBY_PRESETS)[number]) : (p.fshipby && p.fshipby.trim() !== "" ? "_ext" : "PCS");

  const [userIdVal, setUserIdVal] = useState<string>(p.userid);
  const [userIdConfirm, setUserIdConfirm] = useState<string>("");
  const [palletVal, setPalletVal] = useState<string>(p.fpallet !== null ? String(p.fpallet) : "");
  const [transportVal, setTransportVal] = useState<"1" | "2" | "3">(initialTransport);
  const [crateVal, setCrateVal] = useState<"1" | "2">(initialCrate);
  const [shipByMode, setShipByMode] = useState<string>(initialShipByMode);
  const [shipByExt, setShipByExt] = useState<string>(isPresetShipBy ? "" : (p.fshipby ?? ""));
  const [payVal, setPayVal] = useState<"1" | "2">(initialPay);
  const [trackingChnVal, setTrackingChnVal] = useState<string>(p.ftrackingchn ?? "");
  const [dateCloseVal, setDateCloseVal] = useState<string>(
    p.fdatecontainerclose && /^\d{4}-\d{2}-\d{2}/.test(p.fdatecontainerclose)
      ? p.fdatecontainerclose.slice(0, 10)
      : "",
  );
  const [amountCountVal, setAmountCountVal] = useState<"1" | "2">(initialAmountCount);
  const [billToVal, setBillToVal] = useState<string>(p.fbilltoname ?? "");

  // The carrier code actually sent: preset code OR free-text.
  const effectiveShipBy = shipByMode === "_ext" ? shipByExt.trim() : shipByMode;

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
        label="Location (pallet)"
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
            <p className="text-[10px] text-muted">
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
            <p className="text-[10px] text-muted">
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
            <p className="text-[10px] text-muted">
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
        display={p.fshipby || "—"}
      >
        {(close) => (
          <>
            <select
              className={selectCls}
              value={shipByMode}
              onChange={(e) => setShipByMode(e.target.value)}
            >
              <option value="PCS">PCS · รับเองที่โกดัง (ค่าขนส่ง 0)</option>
              <option value="PCSF">PCSF · ส่งฟรี (ค่าขนส่ง 0)</option>
              <option value="PCSE">PCSE · ส่งด่วน (ปริมาตร×120 · ขั้นต่ำ 50)</option>
              <option value="_ext">ผู้ขนส่งภายนอก (กรอกชื่อเอง)…</option>
            </select>
            {shipByMode === "_ext" && (
              <input
                type="text"
                value={shipByExt}
                onChange={(e) => setShipByExt(e.target.value)}
                maxLength={50}
                placeholder="ชื่อผู้ขนส่งภายนอก เช่น Flash Express"
                className={inputCls}
              />
            )}
            <p className="text-[10px] text-muted">
              PCS = ที่อยู่จะถูกแทนด้วยโกดัง Pacred (สมุทรสาคร) · PCS/PCSF/PCSE คิดค่าขนส่งใหม่อัตโนมัติ
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
              <p className="text-[10px] text-muted">
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
            <p className="text-[10px] text-muted">
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
            <p className="text-[10px] text-muted">
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
            <p className="text-[10px] text-muted">
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
