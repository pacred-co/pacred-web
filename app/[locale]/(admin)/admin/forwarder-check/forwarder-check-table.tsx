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
 *   - Channels: SMS · LINE OA · email — all three live after Wave 16
 *     follow-up A wired the tb_users.userid → profiles.id resolver.
 */

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowUpDown } from "lucide-react";
import {
  adminCallPriceUser,
  adminRemoveFromCheckQueue,
} from "@/actions/admin/forwarder-check";
import { confirm } from "@/components/ui/confirm";
import { filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";

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
  ship_by: string;                     // fShipBy raw code — "PCS" / "2" / "PCSF" (logic)
  ship_by_label: string;               // SHIP_BY_LABEL[fShipBy] — carrier name (display)
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

// legacy nameProductsType (function.php) — ประเภทสินค้า
const PRODUCTS_TYPE_LABEL: Record<string, string> = {
  "1": "ทั่วไป",
  "2": "มอก.",
  "3": "อย.",
  "4": "พิเศษ",
};

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

// ─────────────────────────────────────────────────────────────────────
// Lane C 2026-06-02 — sortable column headers (ภูม flag #3).
// Module-level component per Next 16 react-hooks/static-components rule.
// ─────────────────────────────────────────────────────────────────────
type FwckSortKey =
  | "id"
  | "userid"
  | "amount"
  | "transport"
  | "outstanding"
  | "onePercent"
  | "cost"
  | "profit"
  | "status"
  | "checkAddedAt";
type FwckSortDir = "asc" | "desc";

function fwckSortValue(r: ForwarderCheckRow, k: FwckSortKey): string | number {
  switch (k) {
    case "id":            return r.id;
    case "userid":        return (r.userid ?? "").toLowerCase();
    case "amount":        return r.amount;
    case "transport":     return r.transport_price;
    case "outstanding":   return r.outstanding_thb;
    case "onePercent":    return r.one_percent;
    case "cost":          return r.cost_total_price;
    case "profit":        return r.profit_item;
    case "status":        return r.status;
    case "checkAddedAt":  return r.check_added_at ? Date.parse(r.check_added_at) : 0;
  }
}

function FwckSortableTh({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  align = "left",
  title,
}: {
  label: string;
  sortKey: FwckSortKey;
  activeKey: FwckSortKey | null;
  activeDir: FwckSortDir;
  onSort: (k: FwckSortKey) => void;
  align?: "left" | "right" | "center";
  title?: string;
}) {
  const active = activeKey === sortKey;
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const ariaSort: "ascending" | "descending" | "none" =
    active ? (activeDir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className={`px-2 py-3 ${alignCls}`} title={title} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          active ? "text-primary-700 font-semibold" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
        aria-label={`เรียงตาม ${label}`}
      >
        <span>{label}</span>
        <ArrowUpDown
          className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`}
          aria-hidden
        />
      </button>
    </th>
  );
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function ForwarderCheckTable({
  rows,
  showMoneyColumns,
  packingByCab,
}: {
  rows: ForwarderCheckRow[];
  showMoneyColumns: boolean;
  /** G1 combo-flow (2026-07-08) — per-container packing-list reconcile flag keyed by
   *  cabinet_number (mig 0245). true = อัพ packing แล้ว. Drives the "📦 packing" badge. */
  packingByCab?: Record<string, boolean>;
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
  // Lane C 2026-06-02 — sortable column headers (ภูม flag #3). Default
  // sort preserves the server's order until staff clicks a header.
  const [sortKey, setSortKey] = useState<FwckSortKey | null>(null);
  const [sortDir, setSortDir] = useState<FwckSortDir>("desc");
  const handleSort = (k: FwckSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  const viewRows = useMemo(() => {
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = fwckSortValue(a, sortKey);
      const bv = fwckSortValue(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

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

  // G3 reachability (§0d · 2026-07-08) — when the current selection is a SINGLE
  // credit/นิติ customer, offer a direct jump to ออกใบวางบิล for them. The billing-run
  // add form auto-ticks this customer's ตรวจตู้ (check-queue) rows, so the ตรวจตู้
  // selection carries straight into the ใบวางบิล (a credit/นิติ order bills via a
  // ใบวางบิล, not the SMS-pay flow). Only shown for a juristic/credit single customer.
  const billingRunTarget = useMemo(() => {
    const picked = rows.filter((r) => selected.has(r.id));
    const uids = new Set(picked.map((r) => r.userid));
    if (uids.size !== 1) return null;
    const uid = [...uids][0];
    const eligible = picked.some((r) => r.customer_company === 1 || r.user_credit === "1");
    return eligible ? uid : null;
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

        // Channel breakdown — show only channels that actually moved data so
        // the banner stays compact. SMS · LINE · email all surface side-by-side
        // now that Wave 16 follow-up A wired the resolver.
        const channels: string[] = [];
        if (d.sms_sent > 0)   channels.push(`SMS ${d.sms_sent}`);
        if (d.line_sent > 0)  channels.push(`LINE ${d.line_sent}`);
        if (d.email_sent > 0) channels.push(`Email ${d.email_sent}`);
        if (channels.length > 0) parts.push(`· ส่ง ${channels.join(" / ")}`);

        const failNotes: string[] = [];
        if (d.sms_failed > 0)   failNotes.push(`SMS ${d.sms_failed}`);
        if (d.line_failed > 0)  failNotes.push(`LINE ${d.line_failed}`);
        if (d.email_failed > 0) failNotes.push(`Email ${d.email_failed}`);
        if (d.no_profile > 0)   failNotes.push(`ไม่มีโปรไฟล์ ${d.no_profile}`);
        if (failNotes.length > 0) parts.push(`(ส่งไม่สำเร็จ: ${failNotes.join(" / ")} — เช็คใน Sentry)`);

        setResultBanner({ kind: "ok", text: parts.join(" ") });
        setSelected(new Set());
        router.refresh();
      } else if (!res.ok) {
        setResultBanner({ kind: "err", text: res.error });
      }
    });
  }

  async function runRemoveFromQueue() {
    setResultBanner(null);
    const fids = Array.from(selected);
    if (fids.length === 0) return;
    if (!(await confirm(`ลบ ${fids.length} รายการออกจากคิว? (ไม่แจ้งชำระเงิน · forwarder ยังคงอยู่ที่สถานะ 4)`))) return;
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
  //
  // 2026-06-12 — the box-count Σ (amount / amount_fi = "received/expected
  // กล่อง") excludes MOMO หัวบิล placeholders: a bare zero-weight tracking
  // whose `-N/M` box siblings exist carries the DECLARED box count and would
  // double the parcel's boxes (header 6 + 6 boxes = 12). The money/weight/CBM
  // sums stay over ALL rows (the header is weight/price 0, so they're already
  // correct, and the billing acts per-row on outstanding — not on this Σ).
  const countableRows = useMemo(
    () =>
      filterCountableForwarderRows(rows, {
        tracking: (r) => r.tracking_chn,
        weight: (r) => r.weight_kg,
        userid: (r) => r.userid,
      }),
    [rows],
  );
  const datasetSummary = useMemo(() => {
    return {
      amount:               countableRows.reduce((s, r) => s + r.amount, 0),
      amountFi:             countableRows.reduce((s, r) => s + r.amount_fi, 0),
      volumeCbm:            rows.reduce((s, r) => s + r.volume_cbm, 0),
      weightKg:             rows.reduce((s, r) => s + r.weight_kg, 0),
      transportPrice:       rows.reduce((s, r) => s + r.transport_price, 0),
      outstanding:          rows.reduce((s, r) => s + r.outstanding_thb, 0),
      onePercent:           rows.reduce((s, r) => s + r.one_percent, 0),
      profit:               rows.reduce((s, r) => s + r.profit_item, 0),
    };
  }, [rows, countableRows]);

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
            <table className="w-full text-[11px] border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
              <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
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
                  <FwckSortableTh label="ID / ตู้"            sortKey="id"           activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <FwckSortableTh label="รหัส / ลูกค้า"        sortKey="userid"       activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <th className="px-2 py-3">รายละเอียด</th>
                  <FwckSortableTh label="ปริมาณ"              sortKey="amount"       activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" title="กล่อง · CBM · Kg" />
                  <th className="px-2 py-3 text-right">ค่านำเข้า/อัปเดต</th>
                  <th className="px-2 py-3 text-right">ค่าตีลัง / ขนส่งจีน+ / อื่นๆ</th>
                  <FwckSortableTh label="ขนส่งไทย"            sortKey="transport"    activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <th className="px-2 py-3 text-right">ส่วนลด</th>
                  <FwckSortableTh label="รวมขาย (ยอดบิล)"     sortKey="outstanding"  activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" title="ยอดที่จะแจ้งลูกค้า (calPriceForwarderMain)" />
                  <FwckSortableTh label="1%"                  sortKey="onePercent"   activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
                  {showMoneyColumns && (
                    <>
                      <FwckSortableTh label="ต้นทุน" sortKey="cost"   activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
                      <FwckSortableTh label="กำไร"   sortKey="profit" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
                    </>
                  )}
                  <FwckSortableTh label="สถานะ"     sortKey="status"       activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <FwckSortableTh label="ตรวจโดย"   sortKey="checkAddedAt" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
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
                    <div className="text-[11px] uppercase tracking-wider text-orange-700">รวมในตาราง</div>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div>{datasetSummary.amountFi}/{datasetSummary.amount} กล่อง</div>
                    <div className="text-[11px]">{datasetSummary.volumeCbm.toLocaleString("th-TH", { maximumFractionDigits: 4 })} CBM</div>
                    <div className="text-[11px]">{datasetSummary.weightKg.toLocaleString("th-TH", { maximumFractionDigits: 1 })} Kg</div>
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
                {viewRows.map((r) => {
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
                              className="text-[11px] font-mono text-muted hover:text-primary-600 hover:underline"
                            >
                              ตู้ {r.cabinet_number}
                            </Link>
                            {/* G1 combo-flow (2026-07-08) — packing-list reconcile status (mig 0245). */}
                            {packingByCab?.[r.cabinet_number] ? (
                              <span className="ml-1 inline-block rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] px-1.5 py-0.5 align-middle">
                                📦 ✓
                              </span>
                            ) : (
                              <Link
                                href="/admin/api-forwarder-momo/packing-upload"
                                className="ml-1 inline-block rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] px-1.5 py-0.5 align-middle hover:bg-amber-100"
                                title="ตู้นี้ยังไม่อัพ packing list — คลิกเพื่ออัพ"
                              >
                                ⏳ ยังไม่อัพ packing
                              </Link>
                            )}
                          </div>
                        )}
                        {r.tracking_chn && (
                          <div className="mt-0.5 text-[11px] font-mono text-muted truncate max-w-[120px]" title={r.tracking_chn}>
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
                        <div className="truncate max-w-[140px] text-[11px]" title={r.customer_name}>
                          {r.customer_name || "—"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.user_credit === "1" && (
                            <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[11px]">
                              เครดิต
                            </span>
                          )}
                          {r.customer_company === 1 && (
                            <span className="rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 text-[11px]">
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
                              className="h-12 w-12 rounded border border-dashed border-border/60 bg-surface-alt/40 shrink-0 flex items-center justify-center text-[11px] text-muted"
                            >
                              ไม่มี<br />รูป
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            {transportBadge && (
                              <span className={`rounded-full border px-1.5 py-0.5 text-[11px] mr-1 ${transportBadge.cls}`}>
                                {transportBadge.label}
                              </span>
                            )}
                            <span className="text-[11px] text-muted">
                              เรท {r.ref_rate.toLocaleString("th-TH")}
                              {r.ref_price === "1" ? " (น้ำหนัก)" : " (ปริมาตร)"}
                            </span>
                            {r.fno_cargo && (
                              <div className="text-[11px] font-mono text-muted mt-0.5">{r.fno_cargo}</div>
                            )}
                            {/* ประเภท (legacy nameProductsType · forwarder-check.php L283/425) */}
                            {r.products_type && (
                              <div className="mt-0.5">
                                <span className="rounded border border-border bg-surface-alt/60 px-1.5 py-0.5 text-[11px] text-muted">
                                  ประเภท: {PRODUCTS_TYPE_LABEL[r.products_type] ?? r.products_type}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                        <div>{r.amount_fi}/{r.amount} กล่อง</div>
                        {r.amount_count === "1" && (
                          <div className="text-[11px] text-red-600">รวม</div>
                        )}
                        <div className="text-[11px] text-muted">
                          {r.volume_cbm.toLocaleString("th-TH", { maximumFractionDigits: 4 })} CBM
                        </div>
                        <div className="text-[11px] text-muted">
                          {r.weight_kg.toLocaleString("th-TH", { maximumFractionDigits: 1 })} Kg
                        </div>
                      </td>

                      <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">
                        <div>{thb(r.total_price)}</div>
                        {r.price_update > 0 && (
                          <div className="text-[11px] text-muted">อัปเดต: {thb(r.price_update)}</div>
                        )}
                      </td>

                      <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">
                        {r.price_crate > 0 && (
                          <div className="text-[11px]">ลัง: {thb(r.price_crate)}</div>
                        )}
                        {r.transport_price_chn_thb > 0 && (
                          <div className="text-[11px]">CHN+: {thb(r.transport_price_chn_thb)}</div>
                        )}
                        {r.price_other > 0 && (
                          <div className="text-[11px]">อื่นๆ: {thb(r.price_other)}</div>
                        )}
                        {r.price_crate === 0 && r.transport_price_chn_thb === 0 && r.price_other === 0 && (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="px-2 py-2.5">
                        <div className="text-[11px] font-medium">{r.ship_by_label || r.ship_by || "—"}</div>
                        {r.pay_method === "2" && (
                          <div className="text-[11px] bg-red-100 text-red-700 px-1 rounded inline-block mt-0.5">ปลายทาง</div>
                        )}
                        {r.ship_by && r.ship_by !== "PCS" && r.address_district && (
                          <div className="text-[11px] text-muted">
                            {r.address_district} · จ.{r.address_province}
                          </div>
                        )}
                        {r.ship_service_fee > 0 && (
                          <div className="text-[11px] text-amber-700 mt-0.5">
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
                              <div className="text-[11px] text-muted" title="ต้นทุน แสง">
                                S: {thb(r.cost_total_price_sheet)}
                              </div>
                            )}
                            {r.cost_total_price === 0 && (
                              <div className="text-[11px] text-amber-700">⚠ ไม่คำนวณ</div>
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
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusCls}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>

                      <td className="px-2 py-2.5 text-[11px] font-mono text-muted whitespace-nowrap">
                        {r.check_added_by ?? "—"}
                        {r.check_added_at && (
                          <div className="text-[11px] text-muted/70">
                            {new Date(r.check_added_at).toLocaleDateString("th-TH", {
                              day: "2-digit", month: "2-digit", year: "2-digit",
                            })}
                          </div>
                        )}
                      </td>

                      <td className="px-2 py-2.5 text-[11px] max-w-[140px] truncate" title={r.note ?? ""}>
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
              {billingRunTarget && (
                <Link
                  href={`/admin/billing-run/add?userid=${encodeURIComponent(billingRunTarget)}`}
                  className="rounded-md border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
                  title="ออกใบวางบิลให้ลูกค้าเครดิต/นิติ — ระบบติ๊กรายการที่ตรวจตู้แล้วให้อัตโนมัติ"
                >
                  🧾 ออกใบวางบิล (เครดิต/นิติ)
                </Link>
              )}
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
          // backdrop click does NOT close (owner 2026-07-05)
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

            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
              <div className="font-medium">ช่องทางแจ้งเตือน:</div>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                <li>📱 SMS — เปิดใช้งาน (ThaiBulkSMS gateway)</li>
                <li>💬 LINE OA — เปิดใช้งาน (push ผ่าน @pacred · เฉพาะลูกค้าที่ link LINE แล้ว)</li>
                <li>📧 Email — เปิดใช้งาน (fallback เมื่อไม่มี LINE · ต้องมี email ใน tb_users)</li>
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
