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
 *
 * 2026-06-11 (owner) — the main form is now STATUS-ONLY (สถานะใหม่ + บันทึก). เลขตู้
 * ย้ายไปแก้ inline ในกล่องข้อมูล (<EditCabinetField>); หมายเหตุ (NotePushForm) ถูกถอดออก.
 *
 * EVERY sub-form calls an EXISTING server action — no backend change. The flat
 * <TbForwarderActionPanel> stays on /edit unchanged; this replaces it on the
 * read-detail page (the surface the owner works on).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package, CreditCard, ClipboardCheck, ChevronDown, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { adminBulkUpdateForwarderTbStatus } from "@/actions/admin/forwarders";
import { adminMarkForwarderCredit } from "@/actions/admin/forwarders-field-edits";
import { confirm } from "@/components/ui/confirm";

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
  note: string;
  customRate: "0" | "1";
  customRateKg: number;
  customRateCbm: number;
  // 2026-06-17 (mig 0187) — per-order ค่าเทียบ override (durable persistence)
  customComparison: "0" | "1";
  customComparisonValue: number;
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
  /** ภูม 2026-06-19 — the MANUAL status dropdown is reserved for Ultra Admin Z.
   *  Non-ultra staff advance status via the proper flow (scan/bill/ส่งแล้ว). */
  isUltra: boolean;
  currentStatus: Status;
  currentCabinet: string;
  currentTrackingTh: string;
  currentNote: string;
  currentCabinetLocked: boolean;
  isCredit: boolean;
  amountEstimate: number;
  pricing: ForwarderPricingInit;
  // รายการสินค้า (product list) — render ระหว่างฟอร์มสถานะ กับ ฟอร์มเงื่อนไข (pricing@4/…)
  // owner 2026-06-11: "ฟอร์มสถานะอยู่บน · รายการสินค้าอยู่กลาง · ฟอร์มราคาต่อจากรายการสินค้า".
  children?: React.ReactNode;
  /** รายการสินค้า (table only) — render ก่อน cost panel. @ถึงไทยแล้ว(4): คลิกหัวข้อ
   *  "รายการสินค้า" พับ/กางฟอร์มแก้ไขขนาด/ราคา (default กาง · owner 2026-06-12). */
  itemsTable?: React.ReactNode;
  /** ฟอร์มกรอกรายละเอียดสินค้า ขนาด/ราคา · @ถึงไทยแล้ว(4) — render ใต้รายการสินค้า.
   *  2026-06-18 (ภูม · A2): ตอนนี้เป็น <ForwarderPerTrackingEditor> (หลายแถวตามแทรคกิง)
   *  สร้างฝั่ง server ใน page.tsx แล้วส่งเข้ามาเป็น node (workflow เป็น client). */
  pricingEditor?: React.ReactNode;
  /** ออเดอร์ต้นทาง (reforder) — สำหรับลิงก์ "ดูออเดอร์ต้นทาง" ข้างหัวข้อรายการสินค้า. */
  reforder?: string | null;
};

// h-10 (40px) on every control so the merged row lines up on ONE straight,
// balanced baseline (owner 2026-06-11 "เรียงบรรทัดเดียว สมดุล ตรงๆ · ไม่เบี้ยว").
const selectCls =
  "h-10 w-full rounded-lg border border-border bg-white dark:bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60";
const inputCls =
  "h-10 w-full rounded-lg border border-border bg-white dark:bg-surface px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60";

function rank(s: string): number {
  if (s === "99") return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export function ForwarderStatusWorkflow(p: Props) {
  const router = useRouter();

  // The dropdown selection — drives the conditional sub-forms (legacy #fStatus).
  const [selected, setSelected] = useState<string>(p.currentStatus);
  // owner 2026-06-12 — @ถึงไทยแล้ว(4): คลิกหัวข้อ "รายการสินค้า" เพื่อพับ/กางฟอร์มกรอกรายละเอียด.
  // default = กาง (true) ตามที่ owner สั่ง.
  const [itemsOpen, setItemsOpen] = useState(true);

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

  // owner 2026-06-11 "เอาเลขตู้ + หมายเหตุ ออกจากฟอร์มสถานะ": ฟอร์มนี้เปลี่ยน "สถานะ" อย่างเดียว
  // (เลขตู้แก้ inline ในกล่องข้อมูลด้านบนแทน · โหมดเครดิตใช้ฟอร์ม "ติดเครดิต" ด้านล่าง).
  const statusDirty = selected !== p.currentStatus;
  const canSave = !isCreditSel && statusDirty;

  async function onSaveAll() {
    setError(null);
    setSuccess(null);
    if (isCreditSel || !statusDirty) {
      setError("ไม่มีการเปลี่ยนแปลง — เลือกสถานะใหม่ก่อนบันทึก");
      return;
    }
    const statusLabel = STATUS_LABEL[selected] ?? selected;
    if (!(await confirm(
      `เปลี่ยนสถานะ #${p.fNo}\n"${STATUS_LABEL[p.currentStatus] ?? p.currentStatus}" → "${statusLabel}" ?`,
    ))) return;

    startTransition(async () => {
      const res = await adminBulkUpdateForwarderTbStatus({
        fids: [p.fId],
        fstatus: selected as Status,
      });
      if (!res.ok) {
        setError(res.error ?? "บันทึกสถานะไม่สำเร็จ");
        return;
      }
      setSuccess(`บันทึกสำเร็จ — #${p.fNo}`);
      router.refresh();
      setTimeout(() => setSuccess(null), 5000);
    });
  }

  return (
    <div className="space-y-4">
      {/* ── owner 2026-06-11 "ปุ่มบันทึกปุ่มเดียว · ไม่ต้องแบ่ง section · มันคือเรื่องเดียวกัน":
           สถานะ + หมายเหตุ = ฟอร์มเดียว ปุ่มบันทึกปุ่มเดียว — กดทีเดียวบันทึกทั้งสถานะ/เลขตู้
           + หมายเหตุ (เรียก server action เท่าที่เปลี่ยน) · ตรงกับ legacy update.php ที่เป็นฟอร์มเดียว.
           ฟอร์มเงื่อนไข pricing/tracking/credit ยังอยู่ด้านล่าง (คนละเรื่อง · เด้งตามสถานะ). ── */}
      {/* owner 2026-06-11 "เอากรอบออก": ฟอร์มสถานะไม่มีกรอบการ์ด (border/rounded/shadow/accent)
          แล้ว — วางแบนๆ ในเซกชัน เหลือแค่ระยะห่างแนวตั้ง. */}
      {p.isUltra ? (
      <form
        onSubmit={(e) => { e.preventDefault(); onSaveAll(); }}
        className="space-y-3"
      >
        {/* ── owner 2026-06-11 "เอาเลขตู้ + หมายเหตุ ออก": ฟอร์มสถานะเหลือแค่ สถานะใหม่ + บันทึก
            (เลขตู้แก้ inline ในกล่องข้อมูลด้านบนแทน). ── */}
        <div className="flex flex-wrap items-end gap-3">
          {/* สถานะ */}
          <label className="flex-1 min-w-[180px]">
            <span className="block text-[11px] font-medium text-muted mb-1 whitespace-nowrap">สถานะใหม่</span>
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
          </label>

          {/* บันทึก */}
          <button
            type="submit"
            disabled={pending || !canSave}
            className="shrink-0 h-10 rounded-lg bg-primary-600 text-white px-6 text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>

        {/* per-status helper — tells staff WHAT to do for the picked status */}
        <p className="text-[11px] text-muted">
          {showPricing
            ? "📦 ของถึงไทยแล้ว — กรอกขนาด/น้ำหนัก/เรทราคาในฟอร์มด้านล่าง แล้วกด “บันทึกข้อมูล”"
            : showTracking
              ? "🚚 ใส่เลขพัสดุไทยในฟอร์มด้านล่างเพื่อปิดงาน “ส่งแล้ว”"
              : isCreditSel
                ? "💳 กรอกวันครบกำหนดชำระด้านล่าง แล้วกด “ติดเครดิต”"
                : `ปัจจุบัน: ${STATUS_LABEL[p.currentStatus] ?? p.currentStatus} · เลือกสถานะใหม่แล้วกด “บันทึก” (เลขตู้แก้ที่กล่องข้อมูลด้านบน)`}
        </p>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {error}</div>
        )}
        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">✓ {success}</div>
        )}
      </form>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          🔒 การเปลี่ยนสถานะแบบ manual สงวนเฉพาะ <b>Ultra Admin Z</b> · สถานะปัจจุบัน:{" "}
          <b>{STATUS_LABEL[p.currentStatus] ?? p.currentStatus}</b> — พนักงานเลื่อนสถานะผ่านงานปกติ (ยิงเข้าโกดัง · วางบิล · ปิดงานส่งแล้ว)
        </p>
      )}

      {/* ── รายการสินค้า · @ถึงไทยแล้ว(4): คลิกหัวข้อ "รายการสินค้า" (มี chevron) เพื่อพับ/กาง
           ฟอร์มแก้ไขขนาด/ราคา · default กาง (owner 2026-06-12 "กดที่รายการให้หุบ/กาง · กางเป็น default")
           — ฟอร์มเดิม · order-level · ไม่แตะ backend/เงิน ── */}
      {p.itemsTable && (
        <div>
          <hr className="my-4 border-t border-dashed border-border" />
          <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => showPricing && setItemsOpen((o) => !o)}
              className={`flex items-center gap-2 text-base md:text-lg font-bold text-red-600 ${showPricing ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
            >
              {showPricing && (
                <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-200 ${itemsOpen ? "rotate-180" : ""}`} />
              )}
              รายการสินค้า
            </button>
            {p.reforder && p.reforder !== "" && (
              <Link
                href={`/admin/service-orders/${p.reforder}`}
                className="text-xs font-normal text-sky-600 hover:underline inline-flex items-center gap-1"
              >
                ดูออเดอร์ต้นทาง {p.reforder} <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
          {p.itemsTable}
          {showPricing && itemsOpen && p.pricingEditor && (
            <section className="mt-3 rounded-2xl border border-border border-l-4 border-l-indigo-400 bg-white dark:bg-surface shadow-sm overflow-hidden">
              <header className="flex items-center gap-2 px-4 pt-4">
                <Package className="h-4 w-4 text-indigo-500" />
                <h3 className="text-sm font-semibold tracking-wide">กรอกรายละเอียดสินค้า · ขนาด · ราคา (ถึงไทยแล้ว) · ทุกแทรคกิง</h3>
              </header>
              <div className="p-3 sm:p-4">
                {/* 2026-06-18 (ภูม · A2) — หลายแถวตามแทรคกิง (สร้างฝั่ง server ใน page.tsx).
                   แต่ละแทคกรอก/คำนวณราคาด้วยขนาดของตัวเอง แล้ว "บันทึกทุกแถว". */}
                {p.pricingEditor}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── ส่วนที่เหลือ (cost panel · ฯลฯ) ── */}
      {p.children}

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
