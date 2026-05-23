"use client";

/**
 * Forwarder-check bulk-bill table — Wave 16 P0-2 (2026-05-25)
 *
 * The interactive bulk-bill surface for `/admin/forwarder-check`. Renders
 * rows of forwarder items that admin already audited (status=4 = ตรวจสอบแล้ว)
 * with a checkbox per row; the fixed-bottom action bar runs the
 * "แจ้งชำระเงินลูกค้า" (bulk-bill) and "ลบออกจากคิว" (cancel) actions.
 *
 * Legacy reference: `pcs-admin/forwarder-check.php` L304-512 (DataTable
 * markup + bottom button + JS multi-select). The legacy version is a
 * jQuery DataTables widget with `dt-checkboxes` plugin + an absolute-
 * positioned floating button (L509-511). This component is the React
 * equivalent — Tailwind table + native HTML inputs + fixed bottom bar.
 *
 * Design philosophy: workflow copied verbatim, UI is Pacred's polished
 * design (see `docs/learnings/pacred-design-philosophy.md`). The 28 legacy
 * columns are condensed into a more scannable 11-column layout — every
 * data field from the legacy view is preserved, but visually grouped.
 *
 * Roles: money columns (ต้นทุน · กำไร) gated server-side via
 * `showMoneyColumns` prop — Pacred passes `true` for super / ops /
 * accounting per `app/[locale]/(admin)/admin/forwarder-check/page.tsx`.
 *
 * The confirm modal before billing surfaces:
 *   - Total amount being billed (sum of outstanding across selected rows)
 *   - Count of distinct customers receiving SMS
 *   - Channels: SMS (real) · LINE/email (deferred — see action TODO)
 */

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  adminCallPriceUser,
  adminRemoveFromCheckQueue,
} from "@/actions/admin/forwarder-check";

// ────────────────────────────────────────────────────────────
// Row type — exported so page.tsx can reuse
// ────────────────────────────────────────────────────────────

export type ForwarderCheckRow = {
  id: number;                          // tb_forwarder.id (= "ออเดอร์ #N")
  fno_cargo: string | null;            // tb_forwarder.fidorco (Cargo API tracking)
  tracking_chn: string | null;
  cabinet_number: string | null;
  // customer
  userid: string;
  customer_name: string;
  customer_company: number;            // 1 = juristic (gets 1% allowance)
  user_credit: string;                 // '1' = credit · '0'/null = normal
  // packaging
  amount: number;
  amount_fi: number;                   // fi2Amount (forwarder_import2 partial)
  amount_count: string | null;         // famountcount — '1' = "รวม" pinned row marker
  volume_cbm: number;
  weight_kg: number;
  products_type: string;               // ftransporttype labels
  transport_type: string;              // '1' = รถ · '2' = เรือ · '3' = เครื่องบิน
  ref_rate: number;                    // fRefRate (kg/cbm reference rate)
  ref_price: string;                   // fRefPrice — '1' = น้ำหนัก · '0' = ปริมาตร
  // pricing
  total_price: number;                 // fTotalPrice (legacy column "ค่านำเข้า")
  price_update: number;                // fPriceUpdate
  price_crate: number;                 // priceCrate
  transport_price_chn_thb: number;     // fTransportPriceCHNTHB
  price_other: number;                 // priceOther
  ship_by: string;                     // fShipBy → "PCS" / vendor labels
  pay_method: string | null;           // payMethod — '2' = ปลายทาง
  address_district: string | null;
  address_province: string | null;
  address_zipcode: string | null;
  transport_price: number;             // fTransportPrice (Thai delivery)
  discount: number;                    // fDiscount
  outstanding_thb: number;             // computed by calcForwarderOutstanding
  one_percent: number;                 // 1% juristic allowance (fUserCompany1Per)
  cost_total_price: number;            // fCostTotalPrice (PCS cost) — money col
  cost_total_price_sheet: number;      // fCostTotalPriceSheet (S/แสง cost)
  profit_item: number;                 // outstanding − cost (money col)
  // status
  status: string;                      // fStatus '1'..'7' · '99'
  promo_id: number | null;             // tb_promotion link
  ship_service_fee: number;            // fShippingService — Thai-side delivery fee
  // queue meta
  check_added_by: string | null;       // tb_check_forwarder.adminID (who added)
  check_added_at: string | null;       // tb_check_forwarder.date
  note: string | null;                 // fNote
  // image
  cover_url: string | null;            // signed legacy storage URL
  // thumbnail link target
  detail_href: string;                 // /admin/forwarders/{id}
};

// ────────────────────────────────────────────────────────────
// Static label maps — mirror /admin/forwarders patterns
// ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  "1":  "bg-yellow-50 text-yellow-700 border-yellow-200",
  "2":  "bg-blue-50 text-blue-700 border-blue-200",
  "3":  "bg-pink-50 text-pink-700 border-pink-200",
  "4":  "bg-purple-50 text-purple-700 border-purple-200",
  "5":  "bg-red-50 text-red-700 border-red-200",
  "6":  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "7":  "bg-green-50 text-green-700 border-green-200",
  "99": "bg-orange-50 text-orange-700 border-orange-200",
};

const STATUS_LABEL: Record<string, string> = {
  "1":  "รอเข้าโกดังจีน",
  "2":  "ถึงโกดังจีนแล้ว",
  "3":  "กำลังส่งมาไทย",
  "4":  "ตรวจสอบแล้ว",
  "5":  "รอชำระเงิน",
  "6":  "เตรียมส่ง",
  "7":  "ส่งแล้ว",
  "99": "พิเศษ",
};

const TRANSPORT_BADGE: Record<string, { label: string; cls: string }> = {
  "1": { label: "รถ",       cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  "2": { label: "เรือ",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
  "3": { label: "เครื่อง", cls: "bg-sky-50 text-sky-700 border-sky-200" },
};

function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function ForwarderCheckTable({
  rows,
  showMoneyColumns,
}: {
  rows: ForwarderCheckRow[];
  showMoneyColumns: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmingBill, setConfirmingBill] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resultBanner, setResultBanner] = useState<
    | { kind: "ok"; text: string }
    | { kind: "err"; text: string }
    | null
  >(null);

  const toggleRow = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelected(new Set(rows.map((r) => r.id)));
    else setSelected(new Set());
  };

  // Selection summary — total outstanding + distinct customers — for the
  // confirm modal AND the fixed-bottom bar live count.
  const summary = useMemo(() => {
    let total = 0;
    const userSet = new Set<string>();
    for (const r of rows) {
      if (!selected.has(r.id)) continue;
      total += r.outstanding_thb;
      userSet.add(r.userid);
    }
    return { total, customerCount: userSet.size, rowCount: selected.size };
  }, [rows, selected]);

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && selected.size < rows.length;

  function runBill() {
    setResultBanner(null);
    const fids = Array.from(selected);
    if (fids.length === 0) return;
    startTransition(async () => {
      const res = await adminCallPriceUser({ fids });
      setConfirmingBill(false);
      if (res.ok && res.data) {
        const d = res.data;
        const parts: string[] = [
          `✅ แจ้งชำระเงินสำเร็จ ${d.processed} รายการ`,
        ];
        if (d.failed > 0) parts.push(`· ผิดพลาด ${d.failed} รายการ`);
        if (d.sms_sent > 0) parts.push(`· SMS ส่ง ${d.sms_sent}`);
        if (d.sms_failed > 0) parts.push(`(SMS ส่งไม่สำเร็จ ${d.sms_failed} ราย — เช็คใน Sentry)`);
        setResultBanner({ kind: "ok", text: parts.join(" ") });
        setSelected(new Set());
        router.refresh();
      } else if (!res.ok) {
        setResultBanner({ kind: "err", text: res.error });
      }
    });
  }

  function runRemoveFromQueue() {
    setResultBanner(null);
    const fids = Array.from(selected);
    if (fids.length === 0) return;
    if (!window.confirm(`ลบ ${fids.length} รายการออกจากคิว? (ไม่แจ้งชำระเงิน · forwarder ยังคงอยู่ที่สถานะ 4)`)) return;
    startTransition(async () => {
      const res = await adminRemoveFromCheckQueue({ fids });
      if (res.ok && res.data) {
        setResultBanner({
          kind: "ok",
          text: `🗑️ ลบออกจากคิวสำเร็จ ${res.data.removed} รายการ`,
        });
        setSelected(new Set());
        router.refresh();
      } else if (!res.ok) {
        setResultBanner({ kind: "err", text: res.error });
      }
    });
  }

  // Pinned "รวม" summary row (legacy bg-color top row at table line 304-330).
  // Sums the relevant numeric columns across the entire dataset.
  const datasetSummary = useMemo(() => {
    return {
      amount:               rows.reduce((s, r) => s + r.amount, 0),
      amountFi:             rows.reduce((s, r) => s + r.amount_fi, 0),
      volumeCbm:            rows.reduce((s, r) => s + r.volume_cbm, 0),
      weightKg:             rows.reduce((s, r) => s + r.weight_kg, 0),
      transportPrice:       rows.reduce((s, r) => s + r.transport_price, 0),
      outstanding:          rows.reduce((s, r) => s + r.outstanding_thb, 0),
      onePercent:           rows.reduce((s, r) => s + r.one_percent, 0),
      profit:               rows.reduce((s, r) => s + r.profit_item, 0),
    };
  }, [rows]);

  return (
    <div className="space-y-3">
      {/* Result banner (shown above the table after an action runs) */}
      {resultBanner && (
        <div
          className={`rounded-md border p-3 text-sm ${
            resultBanner.kind === "ok"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {resultBanner.text}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            ไม่มีรายการในคิว — รออดมินตรวจสอบและเพิ่มรายการที่{" "}
            <Link href="/admin/report-cnt" className="text-primary-600 hover:underline">
              /admin/report-cnt
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked;
                      }}
                      onChange={toggleAll}
                      aria-label="เลือกทั้งหมด"
                    />
                  </th>
                  <th className="px-2 py-3">ID / ตู้</th>
                  <th className="px-2 py-3">รหัส / ลูกค้า</th>
                  <th className="px-2 py-3">รายละเอียด</th>
                  <th className="px-2 py-3 text-right" title="กล่อง · CBM · Kg">ปริมาณ</th>
                  <th className="px-2 py-3 text-right">ค่านำเข้า/อัปเดต</th>
                  <th className="px-2 py-3 text-right">ค่าตีลัง / ขนส่งจีน+ / อื่นๆ</th>
                  <th className="px-2 py-3">ขนส่งไทย</th>
                  <th className="px-2 py-3 text-right">ส่วนลด</th>
                  <th className="px-2 py-3 text-right" title="ยอดที่จะแจ้งลูกค้า (calPriceForwarderMain)">
                    รวมขาย (ยอดบิล)
                  </th>
                  <th className="px-2 py-3 text-right">1%</th>
                  {showMoneyColumns && (
                    <>
                      <th className="px-2 py-3 text-right">ต้นทุน</th>
                      <th className="px-2 py-3 text-right">กำไร</th>
                    </>
                  )}
                  <th className="px-2 py-3">สถานะ</th>
                  <th className="px-2 py-3">ตรวจโดย</th>
                  <th className="px-2 py-3">หมายเหตุ</th>
                </tr>
              </thead>

              {/* Pinned summary row (legacy bg-color "รวม" row L304-330).
                  Sticky top so operators always see the dataset total
                  even when scrolled. */}
              <tbody className="bg-gradient-to-r from-orange-50 to-rose-50 border-y border-orange-200 text-orange-900 font-semibold">
                <tr>
                  <td className="px-2 py-2.5"></td>
                  <td className="px-2 py-2.5" colSpan={3}>
                    <div className="text-[10px] uppercase tracking-wider text-orange-700">รวมในตาราง</div>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div>{datasetSummary.amountFi}/{datasetSummary.amount} กล่อง</div>
                    <div className="text-[10px]">{datasetSummary.volumeCbm.toLocaleString("th-TH", { maximumFractionDigits: 4 })} CBM</div>
                    <div className="text-[10px]">{datasetSummary.weightKg.toLocaleString("th-TH", { maximumFractionDigits: 1 })} Kg</div>
                  </td>
                  <td className="px-2 py-2.5"></td>
                  <td className="px-2 py-2.5"></td>
                  <td className="px-2 py-2.5 text-right">฿{thb(datasetSummary.transportPrice)}</td>
                  <td className="px-2 py-2.5"></td>
                  <td className="px-2 py-2.5 text-right">฿{thb(datasetSummary.outstanding)}</td>
                  <td className="px-2 py-2.5 text-right">฿{thb(datasetSummary.onePercent)}</td>
                  {showMoneyColumns && (
                    <>
                      <td className="px-2 py-2.5"></td>
                      <td className="px-2 py-2.5 text-right">
                        <span className={datasetSummary.profit >= 0 ? "text-green-700" : "text-red-700"}>
                          {datasetSummary.profit >= 0 ? "+" : ""}฿{thb(datasetSummary.profit)}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2.5" colSpan={3}></td>
                </tr>
              </tbody>

              <tbody>
                {rows.map((r) => {
                  const isOn = selected.has(r.id);
                  const statusCls = STATUS_BADGE[r.status] ?? "bg-gray-50 text-gray-600 border-gray-200";
                  const transportBadge = TRANSPORT_BADGE[r.transport_type];
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-border hover:bg-surface-alt/30 ${isOn ? "bg-primary-50/40" : ""}`}
                    >
                      <td className="px-2 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggleRow(r.id)}
                          aria-label={`เลือก ออเดอร์ #${r.id}`}
                        />
                      </td>

                      <td className="px-2 py-2.5 whitespace-nowrap">
                        <Link
                          href={r.detail_href}
                          className="font-mono font-semibold text-primary-600 hover:underline"
                        >
                          #{r.id}
                        </Link>
                        {r.cabinet_number && (
                          <div className="mt-0.5">
                            <Link
                              href={`/admin/report-cnt?id=${encodeURIComponent(r.cabinet_number)}`}
                              className="text-[10px] font-mono text-muted hover:text-primary-600 hover:underline"
                            >
                              ตู้ {r.cabinet_number}
                            </Link>
                          </div>
                        )}
                        {r.tracking_chn && (
                          <div className="mt-0.5 text-[10px] font-mono text-muted truncate max-w-[120px]" title={r.tracking_chn}>
                            {r.tracking_chn}
                          </div>
                        )}
                      </td>

                      <td className="px-2 py-2.5">
                        <Link
                          href={`/admin/customers/${r.userid}`}
                          className="font-mono font-semibold text-primary-600 hover:underline"
                        >
                          {r.userid}
                        </Link>
                        <div className="truncate max-w-[140px] text-[10px]" title={r.customer_name}>
                          {r.customer_name || "—"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.user_credit === "1" && (
                            <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[9px]">
                              เครดิต
                            </span>
                          )}
                          {r.customer_company === 1 && (
                            <span className="rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 text-[9px]">
                              นิติบุคคล
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-2 py-2.5">
                        <div className="flex gap-2 items-start">
                          {r.cover_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.cover_url}
                              alt={`ออเดอร์ ${r.id}`}
                              className="h-12 w-12 rounded border border-border object-cover bg-surface-alt shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              aria-hidden
                              className="h-12 w-12 rounded border border-dashed border-border/60 bg-surface-alt/40 shrink-0 flex items-center justify-center text-[10px] text-muted"
                            >
                              ไม่มี<br />รูป
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            {transportBadge && (
                              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] mr-1 ${transportBadge.cls}`}>
                                {transportBadge.label}
                              </span>
                            )}
                            <span className="text-[10px] text-muted">
                              เรท {r.ref_rate.toLocaleString("th-TH")}
                              {r.ref_price === "1" ? " (น้ำหนัก)" : " (ปริมาตร)"}
                            </span>
                            {r.fno_cargo && (
                              <div className="text-[10px] font-mono text-muted mt-0.5">{r.fno_cargo}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                        <div>{r.amount_fi}/{r.amount} กล่อง</div>
                        {r.amount_count === "1" && (
                          <div className="text-[9px] text-red-600">รวม</div>
                        )}
                        <div className="text-[10px] text-muted">
                          {r.volume_cbm.toLocaleString("th-TH", { maximumFractionDigits: 4 })} CBM
                        </div>
                        <div className="text-[10px] text-muted">
                          {r.weight_kg.toLocaleString("th-TH", { maximumFractionDigits: 1 })} Kg
                        </div>
                      </td>

                      <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">
                        <div>{thb(r.total_price)}</div>
                        {r.price_update > 0 && (
                          <div className="text-[10px] text-muted">อัปเดต: {thb(r.price_update)}</div>
                        )}
                      </td>

                      <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">
                        {r.price_crate > 0 && (
                          <div className="text-[10px]">ลัง: {thb(r.price_crate)}</div>
                        )}
                        {r.transport_price_chn_thb > 0 && (
                          <div className="text-[10px]">CHN+: {thb(r.transport_price_chn_thb)}</div>
                        )}
                        {r.price_other > 0 && (
                          <div className="text-[10px]">อื่นๆ: {thb(r.price_other)}</div>
                        )}
                        {r.price_crate === 0 && r.transport_price_chn_thb === 0 && r.price_other === 0 && (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="px-2 py-2.5">
                        <div className="text-[10px] font-medium">{r.ship_by || "—"}</div>
                        {r.pay_method === "2" && (
                          <div className="text-[9px] bg-red-100 text-red-700 px-1 rounded inline-block mt-0.5">ปลายทาง</div>
                        )}
                        {r.ship_by && r.ship_by !== "PCS" && r.address_district && (
                          <div className="text-[10px] text-muted">
                            {r.address_district} · จ.{r.address_province}
                          </div>
                        )}
                        {r.ship_service_fee > 0 && (
                          <div className="text-[10px] text-amber-700 mt-0.5">
                            ค่าบริการ: ฿{thb(r.ship_service_fee)}
                          </div>
                        )}
                      </td>

                      <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">
                        {r.discount > 0 ? (
                          <span className="text-green-700">-฿{thb(r.discount)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">
                        <div className="font-semibold text-red-700">฿{thb(r.outstanding_thb)}</div>
                      </td>

                      <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">
                        {r.one_percent > 0 ? (
                          <span className="text-purple-700">฿{thb(r.one_percent)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      {showMoneyColumns && (
                        <>
                          <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">
                            <div title="ต้นทุน PCS">P: {thb(r.cost_total_price)}</div>
                            {r.cost_total_price_sheet > 0 && (
                              <div className="text-[10px] text-muted" title="ต้นทุน แสง">
                                S: {thb(r.cost_total_price_sheet)}
                              </div>
                            )}
                            {r.cost_total_price === 0 && (
                              <div className="text-[9px] text-amber-700">⚠ ไม่คำนวณ</div>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">
                            <span className={r.profit_item >= 0 ? "text-green-700" : "text-red-700"}>
                              {r.profit_item >= 0 ? "+" : ""}฿{thb(r.profit_item)}
                            </span>
                          </td>
                        </>
                      )}

                      <td className="px-2 py-2.5 whitespace-nowrap">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${statusCls}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>

                      <td className="px-2 py-2.5 text-[10px] font-mono text-muted whitespace-nowrap">
                        {r.check_added_by ?? "—"}
                        {r.check_added_at && (
                          <div className="text-[9px] text-muted/70">
                            {new Date(r.check_added_at).toLocaleDateString("th-TH", {
                              day: "2-digit", month: "2-digit", year: "2-digit",
                            })}
                          </div>
                        )}
                      </td>

                      <td className="px-2 py-2.5 text-[10px] max-w-[140px] truncate" title={r.note ?? ""}>
                        {r.note || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Fixed-bottom bulk action bar — appears only when ≥1 row checked.
          Mirrors the legacy fixed-position button (forwarder-check.php L509)
          + adds a "ลบออกจากคิว" escape hatch operators asked for during the
          Wave 8 bulk-approve rollout. */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="บาร์แจ้งชำระเงินกลุ่ม"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white dark:bg-surface shadow-[0_-2px_10px_rgba(0,0,0,0.08)] pcs-safe-area-bottom"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:px-8">
            <div className="flex flex-col text-sm">
              <span>
                เลือกแล้ว <b className="text-primary-600">{summary.rowCount}</b> รายการ ·{" "}
                <b className="text-primary-600">{summary.customerCount}</b> ลูกค้า
              </span>
              <span className="text-xs text-muted">
                รวมยอดบิล: <b className="text-red-700">฿{thb(summary.total)}</b>
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={runRemoveFromQueue}
                disabled={pending}
                className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50"
              >
                🗑️ ลบออกจากคิว
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setResultBanner(null);
                }}
                disabled={pending}
                className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50"
              >
                ยกเลิกที่เลือก
              </button>
              <button
                type="button"
                onClick={() => setConfirmingBill(true)}
                disabled={pending}
                className="rounded-md bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                💰 แจ้งชำระเงินลูกค้า ({summary.rowCount})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm-before-bill modal — shows the financial impact + channels.
          Legacy used a sweetalert; we use a native dialog overlay for parity
          with other Wave 14-16 confirm flows (`/admin/wallet/add`, etc.). */}
      {confirmingBill && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bill-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setConfirmingBill(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-xl">
            <h2 id="bill-confirm-title" className="text-lg font-semibold text-foreground">
              ยืนยันแจ้งชำระเงินลูกค้า
            </h2>
            <p className="mt-1 text-sm text-muted">
              การกระทำนี้จะเปลี่ยนสถานะรายการเป็น <b>5 · รอชำระเงิน</b> และส่ง SMS แจ้งลูกค้าทันที.
              เมื่อแจ้งแล้วจะลบรายการออกจากคิวตรวจสอบโดยอัตโนมัติ.
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">จำนวนรายการ</dt>
                <dd className="font-semibold">{summary.rowCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">จำนวนลูกค้า</dt>
                <dd className="font-semibold">{summary.customerCount}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted">รวมยอดบิล</dt>
                <dd className="font-mono text-xl font-bold text-red-700">฿{thb(summary.total)}</dd>
              </div>
            </dl>

            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <div className="font-medium">ช่องทางแจ้งเตือน:</div>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                <li>📱 SMS — เปิดใช้งาน (ThaiBulkSMS gateway)</li>
                <li>💬 LINE OA — เลื่อนออกไปก่อน (รอ resolver userid → profile_id)</li>
                <li>📧 Email — เลื่อนออกไปก่อน (เหตุผลเดียวกัน)</li>
              </ul>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingBill(false)}
                disabled={pending}
                className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-surface-alt disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={runBill}
                disabled={pending}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:bg-gray-300"
              >
                {pending ? "กำลังแจ้ง..." : `ยืนยันแจ้งชำระเงิน ${summary.rowCount} รายการ`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
