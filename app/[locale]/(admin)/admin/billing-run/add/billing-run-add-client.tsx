"use client";

/**
 * Client island for /admin/billing-run/add — customer picker + forwarder
 * picker + money summary + submit.
 *
 * Mirrors legacy add.php L96-272 (customer dropdown → ajax-loaded forwarder
 * table → summary footer → submit). Differences:
 *   - Customer dropdown is server-loaded (no AJAX-from-DOM) — keeps the
 *     island self-contained + handles auth correctly
 *   - Forwarder table fills on customer change via the
 *     listEligibleForwarders() Server Action (replaces legacy AJAX endpoint)
 *   - Submit calls createBillingRunInvoice() → redirect on success
 */

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  listEligibleForwarders,
  createBillingRunInvoice,
  type EligibleCustomerRow,
  type EligibleForwarderRow,
} from "@/actions/admin/billing-run";
import { confirm } from "@/components/ui/confirm";
import { Explain, GUIDE } from "@/components/ui/tooltip";
import { GuideNote } from "@/components/ui/guide-note";

type Props = {
  customers: EligibleCustomerRow[];
  /** ภูม flag 2026-06-10 — when opened from the "ตู้พร้อมวางบิล" ทำใบวางบิล button
   *  (?cabinet=...), pre-select this customer + tick these forwarders so the form
   *  opens ready to confirm. */
  preselectUserid?: string;
  preselectForwarderIds?: number[];
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Build A guard 2026-06-19 (money-review hardened) — a row whose import transport
 * SELL (ค่านำเข้า · ftotalprice) is ฿0 is an under-charge risk: either it was never
 * measured (fweight+fvolume empty → auto-pricer wrote nothing), OR it was measured
 * WEIGHT-ONLY under comparison pricing so the CBM leg priced to 0 (the residual
 * leak a raw-dimension check misses). `ftotalprice<=0` is the DIRECT money signal —
 * it catches both. The form flags these + requires a confirm before billing; the
 * server backstops with allowUnmeasured.
 */
function isZeroTransport(f: EligibleForwarderRow): boolean {
  return (Number(f.ftotalprice) || 0) <= 0;
}

/**
 * ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3 · owner 2026-07-06) — a domestic delivery
 * leg applies to this row but the in-Thailand cost (ค่าส่งไทย) is still ฿0. The
 * server computes `th_ship_missing` (self-pickup exempt); the UI just reads it to
 * badge + require a confirm before billing. Pure flag — no pricing change.
 */
function isThShipMissing(f: EligibleForwarderRow): boolean {
  return f.th_ship_missing === true;
}

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const labelCls = "block text-xs font-medium text-muted mb-1";

export function BillingRunAddClient({ customers, preselectUserid = "", preselectForwarderIds = [] }: Props) {
  const router = useRouter();
  const [selectedUserid, setSelectedUserid] = useState<string>(preselectUserid);
  const [eligible, setEligible] = useState<EligibleForwarderRow[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Build A D2 — per-line bill-amount override (forwarder id → typed ฿ string;
  // "" / absent = use the auto outstanding). Cleared on customer change.
  const [amountEdit, setAmountEdit] = useState<Map<number, string>>(new Map());
  const [loadingFwd, setLoadingFwd] = useState(!!preselectUserid);
  // 2026-06-03 ภูม flag — round-1 swallowed listEligibleForwarders errors
  // and just showed "ลูกค้านี้ไม่มีรายการ". Surface the real action error here
  // so the next schema/column issue doesn't masquerade as an empty state.
  const [fwdErr, setFwdErr] = useState<string | null>(null);

  const [dateIssued, setDateIssued] = useState(isoToday());
  const [dateDue, setDateDue] = useState(isoDaysFromToday(7));
  const [deliveryChn, setDeliveryChn] = useState("0");
  const [deliveryTh, setDeliveryTh]   = useState("0");
  const [other, setOther]             = useState("0");
  const [discount, setDiscount]       = useState("0");
  const [maoFeeEdit, setMaoFeeEdit]   = useState<string | null>(null); // null = follow auto เหมาๆ
  const [note, setNote]               = useState("");

  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.userid === selectedUserid) ?? null,
    [customers, selectedUserid],
  );

  // Show EVERY eligible row — incl. ones already on an invoice — so staff SEE the
  // billed status (no more "ขึ้นบ้างไม่ขึ้นบ้าง") and can RE-BILL a wrongly-issued one
  // (ภูม 2026-06-22 "เผื่อวางบิลผิดต้องวางใหม่"). Already-billed rows are badged + NOT
  // auto-selected; ticking one re-bills (warned at confirm).
  const visibleForwarders = useMemo(() => eligible ?? [], [eligible]);
  // The default-selectable set = rows NOT yet on an invoice (toggle-all + auto-tick).
  const billableForwarders = useMemo(
    () => (eligible ?? []).filter((f) => !f.already_billed),
    [eligible],
  );
  // ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3) — aggregate count of SELECTED rows still
  // missing a TH-shipping cost, for the amber summary banner.
  const missingThShipCount = useMemo(
    () => (eligible ?? []).filter((f) => selectedIds.has(f.id) && isThShipMissing(f)).length,
    [eligible, selectedIds],
  );

  // Per-row checked map (cleared on customer change)
  function toggleId(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      // "เลือกทั้งหมด" ticks only NOT-yet-billed rows — re-billing an already-billed
      // row must be a deliberate per-row tick (it creates a 2nd invoice).
      setSelectedIds(new Set(billableForwarders.map((f) => f.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  /**
   * Load eligible forwarders when a customer is picked.
   * The synchronous resets (eligible→null · selectedIds→empty) happen in the
   * onChange handler below to avoid React 19's setState-in-effect warning.
   * useEffect here only drives the async fetch, which setState-via-Promise
   * is allowed.
   */
  useEffect(() => {
    if (!selectedUserid) return;
    let cancelled = false;
    listEligibleForwarders(selectedUserid).then((res) => {
      if (cancelled) return;
      setLoadingFwd(false);
      if (res.ok) {
        setEligible(res.data!.rows);
        setFwdErr(null);
        // Default selection priority:
        //   1. cabinet-preselected customer → tick only the container's forwarders
        //      (ภูม flag · "ทำใบวางบิล" from the ตู้พร้อมวางบิล bar).
        //   2. G3 (2026-07-08) — if any row is on the ตรวจตู้ check-queue, tick EXACTLY
        //      those (unbilled) so the ตรวจตู้ selection carries into the bill.
        //   3. else → tick all unbilled rows (legacy default).
        const unbilled = res.data!.rows.filter((r) => !r.already_billed);
        const usePreselect =
          !!preselectUserid && selectedUserid === preselectUserid && preselectForwarderIds.length > 0;
        const hasCheckQueued = unbilled.some((r) => r.check_queued);
        const tick = usePreselect
          ? unbilled.filter((r) => preselectForwarderIds.includes(r.id))
          : hasCheckQueued
            ? unbilled.filter((r) => r.check_queued)
            : unbilled;
        setSelectedIds(new Set(tick.map((r) => r.id)));
      } else {
        setEligible([]);
        setFwdErr(res.error);
      }
    });
    return () => { cancelled = true; };
  }, [selectedUserid, preselectUserid, preselectForwarderIds]);

  function onCustomerChange(uid: string) {
    setSelectedUserid(uid);
    setEligible(null);
    setSelectedIds(new Set());
    setAmountEdit(new Map());
    setMaoFeeEdit(null);
    setFwdErr(null);
    setLoadingFwd(uid !== "");
  }

  // D2 — the bill amount of a row: the admin-typed override (when a valid number)
  // else the auto composite outstanding. Single source for the subtotal + submit.
  function lineAmountOf(f: EligibleForwarderRow): number {
    const raw = amountEdit.get(f.id);
    if (raw != null && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
    return f.outstanding_thb;
  }

  // Subtotal = Σ outstanding_thb of selected forwarders. outstanding_thb is the
  // GROSS composite (Σ 7 price columns − discount, NO 1% · calcForwarderGross ·
  // WHT-fix 2026-06-25), matching the server subtotal in createBillingRunInvoice
  // exactly. The หัก ณ ที่จ่าย 1% is deducted ONCE below (totalAmount × 0.01 →
  // netPayable), so the บิล shows gross subtotal → WHT line → net — never twice.
  const subtotal = useMemo(() => {
    if (!eligible) return 0;
    let sum = 0;
    for (const f of eligible) {
      if (!selectedIds.has(f.id)) continue;
      // D2 — admin-typed override wins over the auto outstanding for this row.
      // Round each line to satang BEFORE summing so the displayed subtotal equals
      // the server's persisted subtotal_thb (= Σ rounded item amounts).
      const raw = amountEdit.get(f.id);
      const amt = raw != null && raw.trim() !== "" && Number.isFinite(Number(raw))
        ? Number(raw)
        : f.outstanding_thb;
      sum += Math.round(amt * 100) / 100;
    }
    return sum;
  }, [eligible, selectedIds, amountEdit]);

  // เหมาๆ (PCSF flat ฿100 · ภูม 2026-06-23) — Σ of the SELECTED rows' anchor fee
  // (once per shipment · SAME engine as createBillingRunInvoice via mao_fee_thb). Was
  // MISSING → the preview ran ฿100 short of the saved bill; now they match exactly.
  const autoMaoFee = useMemo(() => {
    if (!eligible) return 0;
    let sum = 0;
    for (const f of eligible) {
      if (selectedIds.has(f.id)) sum += f.mao_fee_thb ?? 0;
    }
    return Math.round(sum * 100) / 100;
  }, [eligible, selectedIds]);
  // EDITABLE (ภูม 2026-06-23: เซลเก็บรอบเดียว ลูกค้าหลายออเดอร์ → คิดเหมาๆครั้งเดียว ไม่ใช่
  // ฿100×N). null = follow the auto Σ; a typed value overrides it (clamped ≥0).
  const maoFee =
    maoFeeEdit !== null && maoFeeEdit.trim() !== "" && Number.isFinite(Number(maoFeeEdit))
      ? Math.max(0, Number(maoFeeEdit))
      : autoMaoFee;

  const numChn = Number(deliveryChn) || 0;
  const numTh  = Number(deliveryTh)  || 0;
  const numOther = Number(other) || 0;
  const numDiscount = Number(discount) || 0;
  const totalAmount = Math.max(0, subtotal + maoFee + numChn + numTh + numOther - numDiscount);

  // WHT 1% — mirrors the server rule (computeBillWht in billing-run.ts) + the
  // ใบเสร็จ: a นิติบุคคล buyer withholds 1% on the transport fee when the bill
  // total ≥ 1,000 THB. Display-only here; the print/detail recompute identically.
  const showWht = !!selectedCustomer?.is_juristic && totalAmount >= 1000;
  const whtAmount = showWht ? Math.round(totalAmount * 0.01 * 100) / 100 : 0;
  const netPayable = Math.round((totalAmount - whtAmount) * 100) / 100;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);

    if (selectedIds.size === 0) {
      setSubmitErr("กรุณาเลือกรายการอย่างน้อย 1 รายการ");
      return;
    }
    if (new Date(dateDue) < new Date(dateIssued)) {
      setSubmitErr("วันที่ครบกำหนดจ่ายต้องไม่อยู่ก่อนวันที่ออกเอกสาร");
      return;
    }

    // D2 — collect per-line bill-amount overrides (only rows whose typed amount
    // differs from the auto outstanding). The server uses these for the line +
    // subtotal + audit.
    const overrides: Record<string, number> = {};
    for (const f of eligible ?? []) {
      if (!selectedIds.has(f.id)) continue;
      const amt = lineAmountOf(f);
      if (amt !== f.outstanding_thb) overrides[String(f.id)] = amt;
    }

    // Build A guard — SELECTED rows whose import transport SELL is ฿0
    // (ยังไม่ได้วัด/ยังไม่ตั้งราคา · อาจเก็บเงินขาด). A row the admin POSITIVELY
    // overrode (typed a correct amount) is handled → not "at risk". Names the
    // remaining ids in the confirm so the ack matches the badge + server error.
    const zeroIds = (eligible ?? [])
      .filter((f) => selectedIds.has(f.id) && isZeroTransport(f) && !((overrides[String(f.id)] ?? 0) > 0))
      .map((f) => f.id);
    // Re-bill guard (ภูม 2026-06-22) — selected rows ALREADY on a non-cancelled
    // invoice. Allowed (เผื่อวางบิลผิดต้องวางใหม่) but a new invoice does NOT void
    // the old one, so warn explicitly to avoid an accidental double-bill.
    const rebillIds = (eligible ?? [])
      .filter((f) => selectedIds.has(f.id) && f.already_billed)
      .map((f) => f.id);

    // ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3) — SELECTED rows whose domestic leg
    // cost is still ฿0. A positive per-line override is NOT the same thing (that
    // corrects the bill face value, not the TH-leg cost) so it does NOT clear this.
    const missingThShipIds = (eligible ?? [])
      .filter((f) => selectedIds.has(f.id) && isThShipMissing(f))
      .map((f) => f.id);

    // §0f confirm-before-mutate (money action · ออกเอกสารวางบิลจริง).
    const warn =
      (rebillIds.length > 0
        ? `🧾 มี ${rebillIds.length} รายการที่ "ออกใบวางบิลแล้ว" (${rebillIds.map((id) => `#${id}`).join(", ")}) — ออกใหม่จะได้ใบเพิ่มอีก 1 ใบ (ใบเก่าไม่ถูกยกเลิกอัตโนมัติ) · ถ้าใบเก่าผิดควรไปยกเลิกก่อน\n\n`
        : "") +
      (missingThShipIds.length > 0
        ? `🚚 มี ${missingThShipIds.length} รายการที่ยังไม่กรอกค่าส่งไทย (${missingThShipIds.map((id) => `#${id}`).join(", ")})\nควรให้โกดัง/CS กรอกค่าส่งไทยก่อนวางบิล — ถ้าจะออกบิลทั้งที่ยังไม่มีค่าส่งไทย กดตกลง\n\n`
        : "") +
      (zeroIds.length > 0
        ? `⚠️ มี ${zeroIds.length} รายการค่าขนส่ง ฿0 (ยังไม่ได้วัด/ยังไม่ตั้งราคา · อาจเก็บเงินขาด): ${zeroIds.map((id) => `#${id}`).join(", ")}\nควรตรวจสอบ/วัดที่โกดังก่อน — ถ้าจะออกบิลทั้งที่ค่าขนส่งเป็น ฿0 กดตกลง\n\n`
        : "");
    const ok = await confirm(
      `${warn}ยืนยันออกใบวางบิล?\n` +
        `ลูกค้า: ${selectedCustomer?.display_name ?? selectedUserid}\n` +
        `จำนวน: ${selectedIds.size} รายการ\n` +
        `ยอด${showWht ? "ชำระสุทธิ" : "รวมทั้งสิ้น"}: ฿${thbFmt(showWht ? netPayable : totalAmount)}`,
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await createBillingRunInvoice({
        userid:           selectedUserid,
        forwarderIds:     Array.from(selectedIds),
        dateIssued,
        dateDue,
        deliveryChnThb:   numChn,
        deliveryThThb:    numTh,
        otherThb:         numOther,
        discountThb:      numDiscount,
        maoFeeThb:        maoFee,
        noteForCustomer:  note,
        allowUnmeasured:  zeroIds.length > 0,
        allowMissingThShip: missingThShipIds.length > 0,
        overrides,
      });
      if (res.ok) {
        const id = res.data!.invoiceId;
        router.push(`/admin/billing-run/${id}`);
      } else {
        setSubmitErr(res.error);
      }
    });
  }

  // ── Step state (UX 2026-06-07 · พี่ป๊อปถาม "ตรวจสอบเครดิตได้มั้ย" → ภูม flag
  //   หน้านี้ "ดูแล้วงงๆ" → wired step indicator). Tracks the 3 stages: pick
  //   customer · pick forwarders · finalize. Used to drive the breadcrumb pills
  //   + section disclosure (don't render section 3 + sticky bar before items
  //   are picked, removes empty-space confusion). ──
  const step: 1 | 2 | 3 = !selectedUserid ? 1 : selectedIds.size === 0 ? 2 : 3;
  const noteTemplate =
    "กรุณาชำระเงินภายในวันที่ครบกำหนด ผ่านบัญชีธนาคารกสิกร 123-4-56789-0 บริษัท แพคเรด (ประเทศไทย) จำกัด · หมายเหตุ: หากมีการหัก ณ ที่จ่าย กรุณาส่งหนังสือรับรอง 50 ทวิ กลับมาด้วย";

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-24 md:pb-28">
      {/* Step indicator — 3 pills active by `step` */}
      <ol className="flex items-center flex-wrap gap-2 text-xs">
        <StepPill n={1} label="เลือกลูกค้า"      active={step >= 1} done={step > 1} />
        <span className="text-muted/50">→</span>
        <StepPill n={2} label="เลือกรายการ"     active={step >= 2} done={step > 2} />
        <span className="text-muted/50">→</span>
        <StepPill n={3} label="ตรวจยอด + ออกใบ" active={step >= 3} done={false} />
      </ol>

      {/* SECTION 1 — Customer picker */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700">1</span>
          ข้อมูลลูกค้า + วันที่
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <label className="md:col-span-8">
            <span className={labelCls}>เลือกลูกค้า <span className="text-red-500">*</span></span>
            <select
              required
              value={selectedUserid}
              onChange={(e) => onCustomerChange(e.target.value)}
              className={inputCls + " text-base"}
            >
              <option value="">— เลือกลูกค้า ({customers.length} ราย) —</option>
              {customers.map((c) => (
                <option key={c.userid} value={c.userid}>
                  {c.display_name} · {c.eligible_count} รายการ · ฿{thbFmt(c.eligible_total_thb)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">
              แสดงเฉพาะลูกค้าที่มีรายการสถานะ <strong>รอชำระเงิน (fStatus=5)</strong>
            </p>
          </label>
          <label className="md:col-span-2">
            <span className={labelCls}>วันที่ออกเอกสาร</span>
            <input
              type="date"
              value={dateIssued}
              onChange={(e) => setDateIssued(e.target.value)}
              required
              className={inputCls}
            />
          </label>
          <label className="md:col-span-2">
            <span className={labelCls}>วันครบกำหนด <span className="text-red-500">*</span></span>
            <input
              type="date"
              value={dateDue}
              onChange={(e) => setDateDue(e.target.value)}
              required
              className={inputCls}
            />
            <p className="text-[11px] text-muted mt-0.5">ค่าเริ่มต้น = วันนี้ + 7 วัน</p>
          </label>
        </div>

        {selectedCustomer && (
          <div className="mt-3 rounded-lg bg-surface-alt/40 p-3 text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-muted">ประเภทลูกค้า</div>
              <div className="font-medium">{selectedCustomer.is_juristic ? "นิติบุคคล" : "บุคคลธรรมดา"}</div>
            </div>
            {selectedCustomer.is_juristic && (
              <div>
                <div className="text-muted">เลขประจำตัวผู้เสียภาษี</div>
                <div className="font-medium font-mono">{selectedCustomer.tax_id || "—"}</div>
              </div>
            )}
            <div>
              <div className="text-muted">รายการรอออกใบ</div>
              <div className="font-medium">{selectedCustomer.eligible_count} รายการ</div>
            </div>
            <div>
              <div className="text-muted">ยอดรวมทั้งหมด</div>
              <div className="font-medium">฿{thbFmt(selectedCustomer.eligible_total_thb)}</div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 2 — Forwarder picker */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700">2</span>
            รายการฝากนำเข้าที่จะรวมในใบวางบิลนี้
          </h3>
          {visibleForwarders.length > 0 && (
            <button
              type="button"
              onClick={() => toggleAll(selectedIds.size !== visibleForwarders.length)}
              className="text-xs rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-primary-700 hover:bg-primary-100"
            >
              {selectedIds.size === visibleForwarders.length ? "ยกเลิกเลือกทั้งหมด" : `เลือกทั้งหมด (${visibleForwarders.length} รายการ)`}
            </button>
          )}
        </div>

        {!selectedUserid && (
          <div className="text-center py-10 space-y-2">
            <div className="text-4xl opacity-60" aria-hidden>📦</div>
            <p className="text-sm text-muted">เลือกลูกค้าก่อน เพื่อดูรายการที่ออกใบวางบิลได้</p>
          </div>
        )}

        {selectedUserid && loadingFwd && (
          <p className="text-sm text-muted text-center py-6">กำลังโหลด...</p>
        )}

        {selectedUserid && !loadingFwd && fwdErr && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-medium">❌ ไม่สามารถโหลดรายการได้</p>
            <p className="mt-1 text-xs">{fwdErr}</p>
          </div>
        )}

        {selectedUserid && !loadingFwd && !fwdErr && (eligible?.length ?? 0) === 0 && (
          <p className="text-sm text-muted text-center py-6">ลูกค้านี้ไม่มีรายการที่สามารถออกใบวางบิลได้</p>
        )}

        {/* ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3) — aggregate amber warning when any
            selected row still lacks a TH-shipping cost. Soft flag (not a block) —
            staff confirm before billing; give the warehouse/CS a heads-up to fill it. */}
        {selectedUserid && !loadingFwd && missingThShipCount > 0 && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            🚚 มี <strong>{missingThShipCount}</strong> รายการที่เลือกไว้ <strong>ยังไม่กรอกค่าส่งไทย</strong> —
            ควรให้โกดัง/CS กรอกค่าส่งในไทยก่อนวางบิล (ยังออกบิลได้ แต่ต้องยืนยัน)
          </div>
        )}

        {selectedUserid && !loadingFwd && visibleForwarders.length > 0 && (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
              <thead className="bg-surface-alt/60 text-xs font-medium text-muted">
                <tr>
                  <th className="px-3 py-2 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={billableForwarders.length > 0 && billableForwarders.every((f) => selectedIds.has(f.id))}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">เลขที่ออเดอร์</th>
                  <th className="px-3 py-2 text-left">รหัสพัสดุ</th>
                  <th className="px-3 py-2 text-right">จำนวน</th>
                  <th className="px-3 py-2 text-right">น้ำหนัก (kg)</th>
                  <th className="px-3 py-2 text-right">ปริมาตร (CBM)</th>
                  <th className="px-3 py-2 text-right">ยอดค้างชำระ (฿)</th>
                  <th className="px-3 py-2 text-center">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {visibleForwarders.map((f) => {
                  const zeroTransport = isZeroTransport(f);
                  const thShipMissing = isThShipMissing(f);
                  const selected = selectedIds.has(f.id);
                  // Match lineAmountOf exactly — a blank/cleared input means "use
                  // auto", so the chip must NOT read as edited (it would bill auto).
                  const editedRaw = amountEdit.get(f.id);
                  const edited = editedRaw != null && editedRaw.trim() !== "" &&
                    Number.isFinite(Number(editedRaw)) && Number(editedRaw) !== f.outstanding_thb;
                  return (
                  <tr
                    key={f.id}
                    className={`border-t border-border hover:bg-surface-alt/30 ${
                      zeroTransport
                        ? `bg-amber-50/60${selected ? " ring-1 ring-inset ring-primary-300" : ""}`
                        : selected ? "bg-primary-50/30" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleId(f.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      #{f.id}
                      {f.fcredit === "1" && (
                        <span className="ml-1 inline-block rounded bg-violet-100 px-1 py-0.5 text-[11px] font-semibold text-violet-700 align-middle">
                          เครดิต
                        </span>
                      )}
                      {zeroTransport && (
                        <span
                          className="ml-1 inline-block rounded bg-amber-200 px-1 py-0.5 text-[11px] font-semibold text-amber-900 align-middle"
                          title="ค่านำเข้า/ขนส่งเป็น ฿0 — ยังไม่ได้วัด หรือยังไม่ตั้งราคา · อาจเก็บเงินขาด · ตรวจสอบก่อนออกบิล"
                        >
                          ⚠️ ค่าขนส่ง ฿0
                        </span>
                      )}
                      {thShipMissing && (
                        <span
                          className="ml-1 inline-block rounded bg-amber-100 px-1 py-0.5 text-[11px] font-semibold text-amber-800 align-middle"
                          title="ยังไม่กรอกค่าส่งในไทย (ค่าขนส่งในไทย ฿0 · ไม่ใช่รับเองที่โกดัง) — ให้โกดัง/CS กรอกก่อนวางบิล"
                        >
                          🚚 ยังไม่กรอกค่าส่งไทย
                        </span>
                      )}
                      {f.already_billed && (
                        <span
                          className="ml-1 inline-block rounded bg-orange-200 px-1 py-0.5 text-[11px] font-semibold text-orange-900 align-middle"
                          title="รายการนี้ออกใบวางบิลไปแล้ว — ติ๊กเพื่อออกใบใหม่ได้ (เผื่อใบเก่าผิด) · ควรยกเลิกใบเก่าก่อนเพื่อกันออกซ้ำ"
                        >
                          🧾 ออกใบแล้ว
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{f.ftrackingchn}</td>
                    <td className="px-3 py-2 text-right">{f.famount ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{f.fweight ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{f.fvolume ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {/* D2 — editable line amount ("แก้มือได้ทุกจุด"). Default = the
                          auto outstanding; typing overrides just this row. */}
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={amountEdit.get(f.id) ?? String(f.outstanding_thb)}
                        onChange={(e) => setAmountEdit((prev) => new Map(prev).set(f.id, e.target.value))}
                        onFocus={(e) => e.currentTarget.select()}
                        title="แก้ยอดเรียกเก็บของรายการนี้ได้ (ค่าเริ่มต้น = ยอดคำนวณอัตโนมัติ)"
                        className={`w-28 rounded-md border px-2 py-1 text-right text-sm font-medium tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                          edited
                            ? "border-amber-300 bg-amber-50/60"
                            : zeroTransport
                              ? "border-amber-200 bg-transparent text-amber-700"
                              : "border-border/40 bg-transparent"
                        }`}
                      />
                      {edited && (
                        <div className="text-[11px] text-amber-600 mt-0.5">แก้เอง · auto ฿{thbFmt(f.outstanding_thb)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-muted">{f.fdate ?? "—"}</td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-alt/40">
                  <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium text-muted">
                    เลือก {selectedIds.size} / {visibleForwarders.length} รายการ
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{thbFmt(subtotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* SECTION 3 — Money summary (LEDGER-STYLE single column · 2026-06-07 ภูม UX
          flag "ดูแล้วงงๆ"). Previous design had a 2-column form (left = 4 inputs ·
          right = 4 display rows) where the input labels looked identical to the
          display labels → admin couldn't tell what to type where. New design =
          one ledger going top-to-bottom · auto-rows on the left · admin-override
          rows have an inline input pinned to the right · final total highlighted. */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700">3</span>
          สรุปยอดเงิน
          <span className="ml-auto text-[11px] font-normal text-muted">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-200 mr-1 align-middle" /> คำนวณอัตโนมัติ
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-200 ml-3 mr-1 align-middle" /> ใส่เอง
          </span>
        </h3>

        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {/* Subtotal — auto-computed (display only) */}
          <LedgerRow
            kind="auto"
            label="ค่าขนส่งรายการ (Subtotal)"
            hint={`จาก ${selectedIds.size} รายการที่ tick`}
            value={subtotal}
          />
          {/* เหมาๆ (PCSF ฿100/ชิปเมนต์) — EDITABLE input (ภูม 2026-06-23: เซลเก็บรอบเดียว
              ลูกค้าหลายออเดอร์ → แก้เป็นคิดครั้งเดียว). Default = the auto Σ; shows for a
              เหมาๆ order, or once the admin has typed an override. */}
          {(autoMaoFee > 0 || maoFeeEdit !== null) && (
            <LedgerRow
              kind="input"
              label="+ ค่าส่งเหมาๆ (PCSF)"
              hint="auto ฿100/ชิปเมนต์ · แก้ได้ (เซลเก็บรอบเดียว ลูกค้าหลายออเดอร์ → คิดครั้งเดียว)"
              value={maoFeeEdit ?? String(autoMaoFee)}
              onChange={setMaoFeeEdit}
            />
          )}
          {/* 4 admin-override rows — input pinned right */}
          <LedgerRow
            kind="input"
            label="+ ค่าขนส่งจีน (CHN)"
            hint="ค่าขนส่งฝั่งจีน เพิ่มเติม (ถ้ามี)"
            value={deliveryChn}
            onChange={setDeliveryChn}
          />
          <LedgerRow
            kind="input"
            label="+ ค่าขนส่งไทย (TH)"
            hint="ค่าขนส่งฝั่งไทย เพิ่มเติม (ถ้ามี)"
            value={deliveryTh}
            onChange={setDeliveryTh}
          />
          <LedgerRow
            kind="input"
            label="+ อื่นๆ"
            hint="ค่าบริการอื่นๆ เพิ่มเติม"
            value={other}
            onChange={setOther}
          />
          <LedgerRow
            kind="input"
            label="− ส่วนลด"
            hint="ส่วนลดเฉพาะใบนี้"
            value={discount}
            onChange={setDiscount}
            isDiscount
          />

          {/* Grand total — auto · highlight */}
          <LedgerRow
            kind="grand"
            label="ยอดรวมทั้งสิ้น"
            tip={showWht ? GUIDE.bill_gross : undefined}
            value={totalAmount}
          />

          {/* Optional WHT block · only นิติบุคคล + ≥฿1,000 */}
          {showWht && (
            <>
              <LedgerRow
                kind="auto"
                label="− หัก ณ ที่จ่าย 1% (นิติบุคคล)"
                hint="ลูกค้าหักจ่ายเงินสุทธิ"
                tip={GUIDE.wht_1pct_bill}
                value={whtAmount}
                isDiscount
              />
              <LedgerRow
                kind="net"
                label="ยอดชำระสุทธิ"
                tip={GUIDE.bill_net_payable}
                value={netPayable}
              />
            </>
          )}
        </div>

        {/* WHT explainer — owner 2026-06-25 "แจงไปเลย ไม่ต้องซ่อน": always-visible
            (not a hover ⓘ) with the concrete amounts for THIS bill. */}
        {showWht && (
          <GuideNote variant="info" title="หัก ณ ที่จ่าย 1% — ทำงานยังไง" className="mt-3">
            ลูกค้านิติบุคคลหักภาษี ณ ที่จ่าย 1% = <strong>฿{thbFmt(whtAmount)}</strong> ไว้ นำส่งสรรพากรแทนเรา →
            จ่ายเรา <strong>ยอดสุทธิ ฿{thbFmt(netPayable)}</strong> (จากยอดรวม ฿{thbFmt(totalAmount)}).
            ขอ <strong>ใบ 50 ทวิ</strong> จากลูกค้าเพื่อเอา 1% ที่ถูกหักคืนเป็นเครดิตภาษี.
          </GuideNote>
        )}

        {selectedCustomer?.is_juristic && totalAmount > 0 && totalAmount < 1000 && !showWht && (
          <p className="text-xs text-muted mt-2">* นิติบุคคล แต่ยอดน้อยกว่า ฿1,000 — ไม่หักภาษี ณ ที่จ่าย</p>
        )}
      </section>

      {/* SECTION 4 — Note */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700">4</span>
            หมายเหตุสำหรับลูกค้า
            <span className="text-[11px] font-normal text-muted">(จะปรินต์ใต้ใบวางบิล)</span>
          </h3>
          {!note.trim() && (
            <button
              type="button"
              onClick={() => setNote(noteTemplate)}
              className="text-xs rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-primary-700 hover:bg-primary-100"
            >
              + ใช้ข้อความมาตรฐาน
            </button>
          )}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="กดปุ่ม “+ ใช้ข้อความมาตรฐาน” ด้านบน หรือพิมพ์เอง"
          className={inputCls}
        />
      </section>

      {/* Submit error (inline, before sticky bar) */}
      {submitErr && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {submitErr}
        </div>
      )}

      {/* Sticky bottom CTA — เห็นยอดและปุ่มตลอดเวลา · ไม่ต้อง scroll กลับมา */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-white/95 dark:bg-surface/95 backdrop-blur shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex flex-col text-xs leading-tight">
            <span className="text-muted">
              ลูกค้า: <strong className="text-foreground">{selectedCustomer?.display_name ?? "—"}</strong> ·{" "}
              เลือก <strong className="text-foreground">{selectedIds.size}</strong>/{visibleForwarders.length} รายการ
            </span>
            <span className="text-base font-bold mt-0.5">
              ยอด{showWht ? "ชำระสุทธิ" : "รวมทั้งสิ้น"}:{" "}
              <span className="text-amber-700">฿{thbFmt(showWht ? netPayable : totalAmount)}</span>
              {showWht && <span className="ml-1 text-[11px] font-normal text-muted">(หัก WHT 1% ฿{thbFmt(whtAmount)})</span>}
            </span>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/admin/billing-run")}
              className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm hover:bg-surface-alt"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending || selectedIds.size === 0 || !selectedUserid}
              className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {pending ? "กำลังสร้าง..." : "🧾 สร้างใบวางบิล"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

// ── Step indicator pill ──────────────────────────────────────────────
function StepPill({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  const base = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1";
  const cls = done
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : active
      ? "border-primary-300 bg-primary-50 text-primary-700"
      : "border-border bg-surface-alt text-muted";
  return (
    <li className={`${base} ${cls}`}>
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-bold ${
          done
            ? "bg-emerald-600 text-white"
            : active
              ? "bg-primary-600 text-white"
              : "bg-muted/30 text-muted"
        }`}
        aria-hidden
      >
        {done ? "✓" : n}
      </span>
      <span className="font-medium">{label}</span>
    </li>
  );
}

// ── Single ledger row — used in section 3 (สรุปยอดเงิน) ──────────────
//   kind = "auto"  → display-only row (computed subtotal / WHT line)
//   kind = "input" → admin-override row · inline number input pinned right
//   kind = "grand" → grand total · highlight row (เด่นแต่ไม่ใช่ final)
//   kind = "net"   → ยอดชำระสุทธิ · final highlight (amber)
function LedgerRow({
  kind,
  label,
  hint,
  tip,
  value,
  onChange,
  isDiscount = false,
}: {
  kind: "auto" | "input" | "grand" | "net";
  label: string;
  hint?: string;
  /** Optional in-system guide hint — renders an ⓘ next to the label (GUIDE[...]). */
  tip?: string;
  value: number | string;
  onChange?: (v: string) => void;
  isDiscount?: boolean;
}) {
  const fmt = (n: number) =>
    n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const dotCls =
    kind === "input"
      ? "bg-amber-200"
      : kind === "grand" || kind === "net"
        ? "bg-transparent"
        : "bg-slate-200";

  const rowCls =
    kind === "net"
      ? "bg-amber-50/60"
      : kind === "grand"
        ? "bg-surface-alt/60"
        : "bg-white dark:bg-surface";

  const valueCls =
    kind === "net"
      ? "text-amber-700 text-lg font-bold tabular-nums"
      : kind === "grand"
        ? "text-foreground text-base font-bold tabular-nums"
        : isDiscount
          ? "text-red-600 tabular-nums"
          : "text-foreground tabular-nums";

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${rowCls}`}>
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotCls} shrink-0`} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-1 ${kind === "net" || kind === "grand" ? "text-sm font-semibold" : "text-sm"}`}>
          <span>{label}</span>
          {tip && <Explain def={tip} align="left" />}
        </div>
        {hint && <div className="text-[11px] text-muted">{hint}</div>}
      </div>
      {kind === "input" && onChange ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">฿</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            className="w-32 rounded-lg border border-amber-200 bg-amber-50/30 px-2.5 py-1.5 text-right text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-300 focus:bg-white"
          />
        </div>
      ) : (
        <span className={`${valueCls} text-right`}>
          {isDiscount && (value as number) > 0 ? "−" : ""}฿{fmt(value as number)}
        </span>
      )}
    </div>
  );
}
