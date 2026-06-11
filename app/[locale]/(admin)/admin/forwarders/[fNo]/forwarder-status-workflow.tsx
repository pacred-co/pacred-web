"use client";

/**
 * <ForwarderStatusWorkflow> — the STATUS-DRIVEN edit workflow for the
 * /admin/forwarders/[fNo] detail page.
 *
 * 2026-06-11 (ปอน · owner "deep research ฟอร์มแก้ไข · สถานะแต่ละอันมีให้แก้ไม่
 * เหมือนกัน · ทำให้เหมือน"). Faithful port of legacy pcs-admin
 * `forwarder/update.php`, whose edit area is NOT flat — different sub-forms
 * appear depending on `fStatus`. The legacy JS:
 *
 *   $("#fStatus").val(<current>);
 *   function showForm4(){ $("#fStatus").val()!='4' ? hide(#form4) : show(#form4); }  // pricing
 *   function showForm6(){ $("#fStatus").val()>=6 ? show(#form6) : hide(#form6); }     // tracking-TH
 *   $('#fStatus').on('change', () => { showForm4(); showForm6(); });
 *   // + fStatus options disabled/relabeled "จ่ายแล้ว..." once paid (current>=5)
 *   // + a 'c' (credit) option → reveals the credit-due-date (#form-credit)
 *
 * This component reproduces that exactly: the status <select> drives which
 * sub-form is visible, keyed off the SELECTED value (initialised to the order's
 * current status):
 *
 *   สถานะ "4" (ถึงไทยแล้ว)  → ฟอร์มกรอกขนาด/น้ำหนัก/เรท/ราคา (legacy #form4
 *                            "บันทึกข้อมูลไม่เปลี่ยนสถานะ") — REUSES <AdminForwarderEditForm>
 *   สถานะ ≥ "6" (เตรียมส่ง)  → เลขพัสดุไทย + "บันทึก + ส่งแล้ว" (legacy #form6
 *                            update_forwarder5)
 *   เครดิต (credit)          → วันครบกำหนด + "ติดเครดิต" (legacy 'c' branch) —
 *                            REUSES adminMarkForwarderCredit
 *   หมายเหตุ (always)         → <NotePushForm> (adminSaveForwarderNote)
 *
 * EVERY sub-form calls an EXISTING server action — no backend change. The flat
 * <TbForwarderActionPanel> stays on /edit unchanged; this replaces it on the
 * read-detail page (the surface the owner works on).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck, Package, CreditCard, ClipboardCheck } from "lucide-react";
import { adminBulkUpdateForwarderTbStatus } from "@/actions/admin/forwarders";
import { adminMarkForwarderCredit } from "@/actions/admin/forwarders-field-edits";
import { confirm } from "@/components/ui/confirm";
import { AdminForwarderEditForm } from "./edit/edit-form";
import { NotePushForm } from "./tb-action-panel";

type Status = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "99";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
  "99": "สถานะพิเศษ (ยกเลิก)",
};

/** Pricing-form init values forwarded straight to <AdminForwarderEditForm>. */
export type ForwarderPricingInit = {
  weight: number;
  width: number;
  length: number;
  height: number;
  volume: number;
  productType: "1" | "2" | "3" | "4";
  refPrice: "1" | "2";
  note: string;
  customRate: "0" | "1";
  customRateKg: number;
  customRateCbm: number;
  fDiscount: number;
  fTransportPriceChnThb: number;
  priceOther: number;
  fTransportPrice: number;
  fShippingService: number;
  fWarehouseChina: "1" | "2";
  fWarehouseName: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
};

type Props = {
  fId: number;
  fNo: string;
  currentStatus: Status;
  currentCabinet: string;
  currentTrackingTh: string;
  currentNote: string;
  currentCabinetLocked: boolean;
  isCredit: boolean;
  amountEstimate: number;
  pricing: ForwarderPricingInit;
};

const selectCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60";
const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60";

function rank(s: string): number {
  if (s === "99") return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export function ForwarderStatusWorkflow(p: Props) {
  const router = useRouter();

  // The dropdown selection — drives the conditional sub-forms (legacy #fStatus).
  const [selected, setSelected] = useState<string>(p.currentStatus);
  const [cabinet, setCabinet] = useState<string>(p.currentCabinet);
  const [cabinetLocked, setCabinetLocked] = useState<boolean>(p.currentCabinetLocked);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const curInt = p.currentStatus === "99" ? 99 : parseInt(p.currentStatus, 10) || 1;
  const paid = curInt >= 5 && curInt <= 7; // legacy: relabel "จ่ายแล้ว" once paid

  // State-aware option window (legacy renders forward only — a status-1 order
  // shows 1..4, never a jump to 6/7). windowMax = max(4, current+1) capped at 7.
  const windowMax = curInt === 99 ? 7 : Math.min(7, Math.max(4, curInt + 1));
  const statusOptions: Array<{ v: string; label: string; disabled: boolean }> = [];
  for (let n = 1; n <= windowMax; n++) {
    const sv = String(n);
    const disabled = paid && n < curInt; // already-paid + passed → locked
    statusOptions.push({
      v: sv,
      label: (disabled ? "จ่ายแล้ว · " : "") + STATUS_LABEL[sv],
      disabled,
    });
  }
  // Credit option (legacy 'c') — only while not yet shipped + not already credit.
  const canOfferCredit = curInt >= 1 && curInt <= 5 && !p.isCredit;
  // Special / cancel (super·manager gated server-side).
  // (rendered after credit so the dangerous option sits last)

  const isCreditSel = selected === "credit";
  const showPricing = selected === "4"; // legacy showForm4()
  const showTracking = rank(selected) >= 6; // legacy showForm6()

  // The main "บันทึกสถานะ" button advances fstatus (+ optional cabinet). It is
  // NOT the path for credit (that has its own form) — hidden when credit is picked.
  function dirtyStatus(): boolean {
    return (
      selected !== p.currentStatus ||
      cabinet.trim() !== p.currentCabinet.trim() ||
      cabinetLocked !== p.currentCabinetLocked
    );
  }

  async function onSaveStatus() {
    setError(null);
    setSuccess(null);
    if (!dirtyStatus()) {
      setError("ไม่มีการเปลี่ยนแปลง — เลือกสถานะใหม่หรือแก้เลขตู้ก่อนบันทึก");
      return;
    }
    const statusLabel = STATUS_LABEL[selected] ?? selected;
    const lines: string[] = [];
    if (selected !== p.currentStatus)
      lines.push(`สถานะ: "${STATUS_LABEL[p.currentStatus] ?? p.currentStatus}" → "${statusLabel}"`);
    if (cabinet.trim() !== p.currentCabinet.trim())
      lines.push(`เลขตู้: "${p.currentCabinet || "—"}" → "${cabinet.trim() || "—"}"`);
    if (cabinetLocked !== p.currentCabinetLocked)
      lines.push(cabinetLocked ? "🔒 ล็อกเลขตู้: เปิด" : "🔓 ปลดล็อกเลขตู้");

    if (!(await confirm(`บันทึก #${p.fNo} ?\n\n${lines.join("\n")}`))) return;

    startTransition(async () => {
      const res = await adminBulkUpdateForwarderTbStatus({
        fids: [p.fId],
        fstatus: selected as Status,
        ...(cabinet.trim() !== p.currentCabinet.trim() ? { cabinet_number: cabinet.trim() } : {}),
        ...(cabinetLocked !== p.currentCabinetLocked ? { cabinet_locked: cabinetLocked } : {}),
      });
      if (!res.ok) {
        setError(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSuccess(`บันทึกสถานะสำเร็จ — #${p.fNo}`);
      router.refresh();
      setTimeout(() => setSuccess(null), 5000);
    });
  }

  return (
    <div className="space-y-4">
      {/* ── ฟอร์มหลัก: เลือกสถานะ + ผูกตู้ (legacy main update form) ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (!isCreditSel) onSaveStatus(); }}
        className="space-y-3 rounded-2xl border border-border border-l-4 border-l-primary-500 bg-white dark:bg-surface shadow-sm p-4 md:p-5"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-full bg-primary-100 text-primary-700 px-2.5 py-0.5 text-[11px] font-semibold">
            ขั้นถัดไป
          </span>
          <h3 className="text-sm font-semibold tracking-wide flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" /> อัปเดตสถานะรายการ
          </h3>
          <span className="ml-auto text-[11px] text-muted">
            ปัจจุบัน: <b className="text-foreground">{STATUS_LABEL[p.currentStatus] ?? p.currentStatus}</b>
          </span>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {error}</div>
        )}
        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">✓ {success}</div>
        )}

        <div>
          <label htmlFor="fsw_status" className="block text-xs font-medium text-muted mb-1">สถานะใหม่</label>
          <select
            id="fsw_status"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={pending}
            className={selectCls}
          >
            {statusOptions.map((o) => (
              <option key={o.v} value={o.v} disabled={o.disabled}>
                {o.v} · {o.label}
              </option>
            ))}
            {canOfferCredit && <option value="credit">💳 ติดเครดิต (ให้เครดิตลูกค้า)</option>}
            <option value="99">99 · {STATUS_LABEL["99"]}</option>
          </select>
          {/* per-status helper — tells staff WHAT to do for the picked status */}
          <p className="mt-1 text-[11px] text-muted">
            {showPricing
              ? "📦 ของถึงไทยแล้ว — กรอกขนาด/น้ำหนัก/เรทราคาในฟอร์มด้านล่าง แล้วกด “บันทึกข้อมูล” (ไม่ต้องกดปุ่มบันทึกสถานะนี้ถ้าต้องการแค่ปรับราคา)"
              : showTracking
                ? "🚚 ใส่เลขพัสดุไทยในฟอร์มด้านล่างเพื่อปิดงาน “ส่งแล้ว”"
                : isCreditSel
                  ? "💳 กรอกวันครบกำหนดชำระด้านล่าง แล้วกด “ติดเครดิต” (ตัดเป็นเครดิตแทนการชำระ)"
                  : "เลือกสถานะถัดไปของรายการ · ใส่เลขตู้แล้วระบบจะเลื่อนเป็น “กำลังส่งมาไทย” ให้อัตโนมัติ"}
          </p>
        </div>

        {/* เลขตู้ — เกี่ยวกับการเลื่อนสถานะ (auto → 3); ซ่อนเมื่อเลือกเครดิต */}
        {!isCreditSel && (
          <div>
            <label htmlFor="fsw_cabinet" className="block text-xs font-medium text-muted mb-1">
              เลขตู้ (GZE / GZS)
              {cabinetLocked && (
                <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-semibold">
                  🔒 ล็อกแล้ว
                </span>
              )}
            </label>
            <input
              id="fsw_cabinet"
              type="text"
              value={cabinet}
              onChange={(e) => setCabinet(e.target.value)}
              disabled={pending}
              maxLength={300}
              placeholder="GZE-2026-001 (เว้นว่าง = ยังไม่ผูกตู้)"
              className={inputCls}
            />
            <label className="mt-2 flex items-start gap-2 cursor-pointer text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 hover:bg-amber-100">
              <input
                type="checkbox"
                checked={cabinetLocked}
                onChange={(e) => setCabinetLocked(e.target.checked)}
                disabled={pending}
                className="mt-0.5 accent-amber-600 cursor-pointer"
              />
              <span>
                <strong>🔒 ล็อกเลขตู้นี้</strong> · กัน MOMO/partner sync เขียนทับ
              </span>
            </label>
          </div>
        )}

        {!isCreditSel && (
          <button
            type="submit"
            disabled={pending || !dirtyStatus()}
            className="w-full rounded-lg bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "กำลังบันทึก..." : "💾 บันทึกสถานะ"}
          </button>
        )}
      </form>

      {/* ── #form4 — ฟอร์มราคา/ขนาด (เด้งเมื่อเลือกสถานะ 4 · ถึงไทยแล้ว) ── */}
      {showPricing && (
        <section className="rounded-2xl border border-border border-l-4 border-l-indigo-400 bg-white dark:bg-surface shadow-sm overflow-hidden">
          <header className="flex items-center gap-2 px-4 pt-4">
            <Package className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-semibold tracking-wide">กรอกรายละเอียดสินค้า · ขนาด · ราคา (สถานะ: ถึงไทยแล้ว)</h3>
          </header>
          <div className="p-3 sm:p-4">
            <AdminForwarderEditForm
              fNo={p.fNo}
              idNumeric={p.fId}
              weightInit={p.pricing.weight}
              widthInit={p.pricing.width}
              lengthInit={p.pricing.length}
              heightInit={p.pricing.height}
              volumeInit={p.pricing.volume}
              productTypeInit={p.pricing.productType}
              refPriceInit={p.pricing.refPrice}
              noteInit={p.pricing.note}
              itemsInit={[]}
              customRateInit={p.pricing.customRate}
              customRateKgInit={p.pricing.customRateKg}
              customRateCbmInit={p.pricing.customRateCbm}
              fDiscountInit={p.pricing.fDiscount}
              fTransportPriceChnThbInit={p.pricing.fTransportPriceChnThb}
              priceOtherInit={p.pricing.priceOther}
              fTransportPriceInit={p.pricing.fTransportPrice}
              fShippingServiceInit={p.pricing.fShippingService}
              fWarehouseChinaInit={p.pricing.fWarehouseChina}
              fWarehouseNameInit={p.pricing.fWarehouseName}
            />
          </div>
        </section>
      )}

      {/* ── #form6 — เลขพัสดุไทย + ส่งแล้ว (เด้งเมื่อเลือกสถานะ ≥ 6) ── */}
      {showTracking && (
        <TrackingShippedForm
          fId={p.fId}
          fNo={p.fNo}
          currentTrackingTh={p.currentTrackingTh}
          onDone={() => router.refresh()}
        />
      )}

      {/* ── #form-credit — ติดเครดิต (เด้งเมื่อเลือกเครดิต) ── */}
      {isCreditSel && (
        <CreditForm
          fId={p.fId}
          fNo={p.fNo}
          amountEstimate={p.amountEstimate}
          onDone={() => router.refresh()}
        />
      )}

      {/* ── หมายเหตุ + แจ้งเตือน (always · legacy saveNote) ── */}
      <NotePushForm fId={p.fId} fNo={p.fNo} currentNote={p.currentNote} />
    </div>
  );
}

/**
 * #form6 — legacy `update_forwarder5`: enter เลขพัสดุไทย then advance to ส่งแล้ว.
 * Reuses adminBulkUpdateForwarderTbStatus (tracking_th + fstatus="7").
 */
function TrackingShippedForm({
  fId, fNo, currentTrackingTh, onDone,
}: { fId: number; fNo: string; currentTrackingTh: string; onDone: () => void }) {
  const [tracking, setTracking] = useState<string>(currentTrackingTh === "-" ? "" : currentTrackingTh);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onShip() {
    setError(null);
    setSuccess(null);
    const trk = tracking.trim();
    if (!(await confirm(`ยืนยันปิดงาน #${fNo} เป็น “ส่งแล้ว” ?${trk ? `\n\nเลขพัสดุไทย: ${trk}` : "\n\n(ยังไม่ใส่เลขพัสดุไทย)"}`))) return;
    startTransition(async () => {
      const res = await adminBulkUpdateForwarderTbStatus({
        fids: [fId],
        fstatus: "7",
        ...(trk !== "" ? { tracking_th: trk } : {}),
      });
      if (!res.ok) { setError(res.error ?? "บันทึกไม่สำเร็จ"); return; }
      setSuccess(`ปิดงานสำเร็จ — #${fNo} ส่งแล้ว`);
      onDone();
      setTimeout(() => setSuccess(null), 5000);
    });
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onShip(); }}
      className="space-y-3 rounded-2xl border border-border border-l-4 border-l-emerald-400 bg-white dark:bg-surface shadow-sm p-4 md:p-5"
    >
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-semibold tracking-wide">เลขพัสดุไทย + ปิดงาน “ส่งแล้ว”</h3>
      </div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {error}</div>}
      {success && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">✓ {success}</div>}
      <div>
        <label htmlFor="fsw_trk" className="block text-xs font-medium text-muted mb-1">เลขพัสดุไทย (Tracking TH)</label>
        <input
          id="fsw_trk"
          type="text"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          disabled={pending}
          maxLength={50}
          placeholder="TH00012345"
          className={inputCls}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "กำลังบันทึก..." : "📦 บันทึก + เปลี่ยนเป็นส่งแล้ว"}
      </button>
    </form>
  );
}

/**
 * #form-credit — legacy 'c' branch: mark the order paid-on-credit with a due
 * date instead of a wallet charge. Reuses adminMarkForwarderCredit (RBAC
 * accounting·super · credit-limit gated server-side).
 */
function CreditForm({
  fId, fNo, amountEstimate, onDone,
}: { fId: number; fNo: string; amountEstimate: number; onDone: () => void }) {
  const [dueDate, setDueDate] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onCredit() {
    setError(null);
    setSuccess(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { setError("กรุณาเลือกวันครบกำหนดชำระ"); return; }
    if (!(await confirm(`ติดเครดิต #${fNo} ?\n\nยอดประมาณ ฿${amountEstimate.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\nครบกำหนด: ${dueDate}\n\n(ตัดเป็นเครดิต ไม่หักกระเป๋า · เลื่อนสถานะเป็นเตรียมส่ง)`))) return;
    startTransition(async () => {
      const res = await adminMarkForwarderCredit({ fId, creditDueDate: dueDate });
      if (!res.ok) { setError(res.error ?? "ติดเครดิตไม่สำเร็จ"); return; }
      setSuccess(`ติดเครดิตสำเร็จ — #${fNo}`);
      onDone();
      setTimeout(() => setSuccess(null), 5000);
    });
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onCredit(); }}
      className="space-y-3 rounded-2xl border border-border border-l-4 border-l-rose-400 bg-white dark:bg-surface shadow-sm p-4 md:p-5"
    >
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-rose-500" />
        <h3 className="text-sm font-semibold tracking-wide">ติดเครดิต (ให้เครดิตแทนการชำระ)</h3>
      </div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {error}</div>}
      {success && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">✓ {success}</div>}
      <p className="text-xs text-muted">
        ยอดประมาณ <b className="text-foreground font-mono">฿{amountEstimate.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b>{" "}
        · ระบบจะตรวจวงเงินเครดิตของลูกค้าอีกครั้งตอนบันทึก
      </p>
      <div>
        <label htmlFor="fsw_credit_date" className="block text-xs font-medium text-muted mb-1">วันครบกำหนดชำระ</label>
        <input
          id="fsw_credit_date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={pending}
          className={inputCls}
        />
      </div>
      <button
        type="submit"
        disabled={pending || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)}
        className="w-full rounded-lg bg-rose-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "กำลังบันทึก..." : "💳 ติดเครดิต"}
      </button>
    </form>
  );
}
