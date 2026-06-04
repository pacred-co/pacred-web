"use client";

/**
 * Inline toggle-to-edit fields for the ฝากนำเข้า detail page — the
 * "✏️ แก้ไข" links beside each header attribute, mirroring the working
 * pattern on /admin/service-orders/[hNo] (inline-edits.tsx · L42-L72
 * EditableRow + L102 OrderInlineEdits).
 *
 * ภูม flag (2026-06-04): the /edit page's 4 collapsible sections
 * ("มอบหมายคนขับ" · "แก้ไขที่อยู่/การขนส่ง/ราคา" · "ชื่อผู้รับใบกำกับ" ·
 * "ขนาด/น้ำหนัก") matched nothing in the legacy PCS layout — "ในPCS
 * ภูมิไปดูไม่เห็นมีเลย มันดูเยอะไปหมดเลย". Pattern that DOES match
 * legacy = the 4-button inline-edit beside each field on shop-order
 * /admin/service-orders/[hNo] (รูปที่ 1 the user attached).
 *
 * Fields wired here (mirror service-orders inline-edits.tsx + add the 3
 * ฝากนำเข้า-specific ones):
 *   - ftransporttype  → adminUpdateForwarderTransportType  (1 รถ · 2 เรือ · 3 อากาศ)
 *   - crate           → adminUpdateForwarderCrate          (1 ตี · 2 ไม่ตี)
 *   - fshipby         → adminUpdateForwarderShipBy         (PCS/PCSF/PCSE preset + free-text other)
 *   - paymethod       → adminUpdateForwarderPayMethod      (1 ต้นทาง · 2 ปลายทาง)
 *   - fbilltoname     → adminSetForwarderBillToOverride    (free-text)
 *
 * Faithful WORKFLOW (same fields, same options, same target tb_forwarder),
 * Pacred UI (Tailwind · Lucide pencil · click-to-edit row · บันทึก/ยกเลิก,
 * no Bootstrap-4 modal). Each writer reuses an existing server action;
 * tb_forwarder.fid is the row identity (the /edit page already uses .id
 * not .fidorco for action calls).
 *
 * Address re-pick and the cost-adjust matrix stay on /edit — they need
 * the saved-addresses dropdown and the 3-input money form, both too
 * large for an inline row. Driver assignment also stays as a panel on
 * /edit (combobox + status gates).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  adminUpdateForwarderTransportType,
  adminUpdateForwarderCrate,
  adminUpdateForwarderShipBy,
  adminUpdateForwarderPayMethod,
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

// PCS-family ship-by preset options (matches tb-edit-panel.tsx L57-L61).
const SHIPBY_PRESETS = ["PCS", "PCSF", "PCSE"] as const;

type Props = {
  fId:            number;            // tb_forwarder.id — primary key for all writers
  ftransporttype: string | null;     // "1" | "2" | "3"
  crate:          string | null;     // "1" ตี · "2" ไม่ตี
  fshipby:        string | null;     // PCS/PCSF/PCSE preset or external carrier name
  paymethod:      string | null;     // "1" ต้นทาง · "2" ปลายทาง
  fbilltoname:    string | null;     // bill-to override (free-text, NULL = use default)
  defaultBillTo:  string;            // shown when fbilltoname empty (faddressname + lastname)
};

export function ForwarderInlineEdits(p: Props) {
  const { pending, err, run } = useEditor();

  // Per-row "is the editor open?" booleans.
  const [editTransport, setEditTransport] = useState(false);
  const [editCrate, setEditCrate] = useState(false);
  const [editShipBy, setEditShipBy] = useState(false);
  const [editPay, setEditPay] = useState(false);
  const [editBillTo, setEditBillTo] = useState(false);

  // Per-row draft values.
  const initialTransport = (["1", "2", "3"].includes(p.ftransporttype ?? "") ? p.ftransporttype : "1") as "1" | "2" | "3";
  const initialCrate = (p.crate === "2" ? "2" : "1") as "1" | "2";
  const initialPay = (p.paymethod === "2" ? "2" : "1") as "1" | "2";
  const isPresetShipBy = SHIPBY_PRESETS.includes((p.fshipby ?? "") as (typeof SHIPBY_PRESETS)[number]);
  const initialShipByMode = isPresetShipBy ? (p.fshipby as (typeof SHIPBY_PRESETS)[number]) : (p.fshipby && p.fshipby.trim() !== "" ? "_ext" : "PCS");

  const [transportVal, setTransportVal] = useState<"1" | "2" | "3">(initialTransport);
  const [crateVal, setCrateVal] = useState<"1" | "2">(initialCrate);
  const [shipByMode, setShipByMode] = useState<string>(initialShipByMode);
  const [shipByExt, setShipByExt] = useState<string>(isPresetShipBy ? "" : (p.fshipby ?? ""));
  const [payVal, setPayVal] = useState<"1" | "2">(initialPay);
  const [billToVal, setBillToVal] = useState<string>(p.fbilltoname ?? "");

  // The carrier code actually sent: preset code OR free-text.
  const effectiveShipBy = shipByMode === "_ext" ? shipByExt.trim() : shipByMode;

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">⚠ {err}</div>
      )}

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
