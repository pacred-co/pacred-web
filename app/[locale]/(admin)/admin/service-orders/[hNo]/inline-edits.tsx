"use client";

/**
 * Inline toggle-to-edit fields for the shop-order detail page — the
 * "แก้ไข" links beside each header attribute in legacy `update.php`
 * (L156-265 left column + L268-276 right-column rate edit).
 *
 * Faithful WORKFLOW (same fields, same options, same target), Pacred UI
 * (a clean show → click "แก้ไข" → inline form → บันทึก/ยกเลิก, no jQuery
 * slideToggle / Bootstrap modal). Each writer is an existing action:
 *   transport → adminSwitchOrderTransport   (1/2/3)
 *   crate     → adminUpdateOrderCrate        (1/2)
 *   shipBy    → adminUpdateOrderShipBy       (PCS/PCSF/TTP/JMF/PCSE)
 *   payMethod → adminUpdateOrderPayMethod    (1/2)
 *   rate      → adminUpdateOrderRate         (recomputes htotalpriceuser)
 *
 * The header-edit actions key on h_no = /^P\d+$/; for legacy A/ONS-prefix
 * orders the action rejects with a clear message (rendered in <err>).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { adminSwitchOrderTransport } from "@/actions/admin/service-orders-shop-workflow";
import {
  adminUpdateOrderCrate,
  adminUpdateOrderShipBy,
  adminUpdateOrderPayMethod,
  adminUpdateOrderRate,
} from "@/actions/admin/service-orders-header-edits";

type ActionResult = { ok: true; data?: unknown } | { ok: false; error: string };

const selectCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const btnSave =
  "rounded-md bg-primary-500 px-3 py-1 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50";
const btnCancel =
  "rounded-md border border-border px-3 py-1 text-xs hover:bg-surface-alt disabled:opacity-50";

/** Shared toggle row: a static "display + แก้ไข" that swaps to an editor. */
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
      {editing ? <div className="space-y-2">{children(() => setEditing(false))}</div> : <div className="text-sm">{display}</div>}
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
        setErr(res.error);
      }
    });
  }
  return { pending, err, run };
}

const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 ขนส่งทางรถ",
  "2": "🚢 ขนส่งทางเรือ",
  "3": "✈️ ขนส่งทางเครื่องบิน",
};
const CRATE_LABEL: Record<string, string> = { "1": "ตีลังไม้", "2": "ไม่ตีลังไม้" };
const PAY_LABEL: Record<string, string> = { "1": "ต้นทาง", "2": "ปลายทาง" };
const SHIPBY_OPTS = ["PCS", "PCSF", "TTP", "JMF", "PCSE"] as const;

export function OrderInlineEdits({
  hNo,
  htransporttype,
  crate,
  hshipby,
  paymethod,
}: {
  hNo:            string;
  htransporttype: string | null;
  crate:          string | null;
  hshipby:        string | null;
  paymethod:      string | null;
}) {
  const { pending, err, run } = useEditor();
  const [editTransport, setEditTransport] = useState(false);
  const [editCrate, setEditCrate] = useState(false);
  const [editShipBy, setEditShipBy] = useState(false);
  const [editPay, setEditPay] = useState(false);

  const [transportVal, setTransportVal] = useState(htransporttype === "3" ? "3" : htransporttype === "2" ? "2" : "1");
  const [crateVal, setCrateVal] = useState(crate === "2" ? "2" : "1");
  const [shipByVal, setShipByVal] = useState<(typeof SHIPBY_OPTS)[number]>(
    (SHIPBY_OPTS.includes((hshipby ?? "") as (typeof SHIPBY_OPTS)[number]) ? hshipby : "PCS") as (typeof SHIPBY_OPTS)[number],
  );
  const [payVal, setPayVal] = useState(paymethod === "2" ? "2" : "1");

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}

      <EditableRow
        label="รูปแบบขนส่ง จีน-ไทย"
        editing={editTransport}
        setEditing={setEditTransport}
        display={TRANSPORT_LABEL[htransporttype ?? "1"] ?? `mode ${htransporttype ?? "-"}`}
      >
        {(close) => (
          <>
            <select className={selectCls} value={transportVal} onChange={(e) => setTransportVal(e.target.value)}>
              <option value="1">ขนส่งทางรถ (5-7 วัน)</option>
              <option value="2">ขนส่งทางเรือ (12-16 วัน)</option>
              <option value="3">ขนส่งทางเครื่องบิน</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() =>
                  run(
                    () => adminSwitchOrderTransport({ hNo, htransporttype: transportVal as "1" | "2" | "3" }),
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

      <EditableRow
        label="การตีลังไม้"
        editing={editCrate}
        setEditing={setEditCrate}
        display={CRATE_LABEL[crate ?? ""] ?? "—"}
      >
        {(close) => (
          <>
            <select className={selectCls} value={crateVal} onChange={(e) => setCrateVal(e.target.value)}>
              <option value="1">ตีลังไม้</option>
              <option value="2">ไม่ตีลังไม้</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() => run(() => adminUpdateOrderCrate({ h_no: hNo, crate: crateVal as "1" | "2" }), close)}
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

      <EditableRow
        label="บริษัทขนส่ง"
        editing={editShipBy}
        setEditing={setEditShipBy}
        display={hshipby || "—"}
      >
        {(close) => (
          <>
            <select
              className={selectCls}
              value={shipByVal}
              onChange={(e) => setShipByVal(e.target.value as (typeof SHIPBY_OPTS)[number])}
            >
              {SHIPBY_OPTS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted">PCS = รับที่โกดัง Pacred (จะเขียนทับที่อยู่จัดส่ง)</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() => run(() => adminUpdateOrderShipBy({ h_no: hNo, ship_by: shipByVal }), close)}
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

      <EditableRow
        label="การเก็บเงินค่าขนส่งในไทย"
        editing={editPay}
        setEditing={setEditPay}
        display={PAY_LABEL[paymethod ?? ""] ?? "—"}
      >
        {(close) => (
          <>
            <select className={selectCls} value={payVal} onChange={(e) => setPayVal(e.target.value)}>
              <option value="1">ต้นทาง</option>
              <option value="2">ปลายทาง</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={btnSave}
                onClick={() => run(() => adminUpdateOrderPayMethod({ h_no: hNo, pay_method: payVal as "1" | "2" }), close)}
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

/**
 * Right-column inline rate editor (legacy update.php L268-276). On save,
 * `adminUpdateOrderRate` recomputes htotalpriceuser too — so the displayed
 * net total moves with the rate. Blocked server-side for paid orders (3/4/5).
 */
export function OrderRateInlineEdit({ hNo, hRate }: { hNo: string; hRate: number }) {
  const { pending, err, run } = useEditor();
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState(String(hRate));

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="font-mono tabular-nums">{hRate.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
        <span className="text-muted">บาท/หยวน</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:underline"
        >
          <Pencil className="h-3 w-3" /> แก้ไข
        </button>
      </span>
    );
  }
  return (
    <span className="block space-y-1.5">
      {err && <span className="block rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">{err}</span>}
      <input
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        className="w-28 rounded-lg border border-border bg-white dark:bg-surface px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/50"
      />
      <span className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          className={btnSave}
          onClick={() => run(() => adminUpdateOrderRate({ h_no: hNo, h_rate: Number(rate) }), () => setEditing(false))}
        >
          บันทึก
        </button>
        <button type="button" disabled={pending} className={btnCancel} onClick={() => setEditing(false)}>
          ยกเลิก
        </button>
      </span>
    </span>
  );
}
