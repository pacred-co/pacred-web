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
import { ArrowUpDown, Search } from "lucide-react";
import { flashRemoteAreaBadge } from "@/lib/forwarder/flash-remote-area";
import {
  adminCallPriceUser,
  adminRemoveFromCheckQueue,
  type BillFailure,
} from "@/actions/admin/forwarder-check";
import { confirm } from "@/components/ui/confirm";
import { SelectedItemsConfirmDialog } from "@/components/admin/selected-items-confirm-dialog";
import { baseTracking, filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";

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
  products_type: string;               // fproductstype labels (ประเภทหลัก)
  products_type2: string;              // A6 · fproductstype2 (ประเภทรอง · cost cell · gated)
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
  ship_service_fee: number;            // fShippingService — Thai-side delivery fee
  // queue meta
  check_added_by: string | null;       // tb_check_forwarder.adminID (who added)
  check_added_at: string | null;       // tb_check_forwarder.date
  note: string | null;                 // fNote
  detail: string | null;               // A1 · fDetail — รายละเอียดสินค้า
  has_custom_rate: boolean;            // A8 · has a tb_rate_custom_* row → "เรทเฉพาะตัว"
  has_comparison: boolean;             // legacy CPS · tb_users.userComparison='1' → "ค่าเทียบ"
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
  cntPaidByCab,
}: {
  rows: ForwarderCheckRow[];
  showMoneyColumns: boolean;
  /** G1 combo-flow (2026-07-08) — per-container packing-list reconcile flag keyed by
   *  cabinet_number (mig 0245). true = อัพ packing แล้ว. Drives the "📦 packing" badge. */
  packingByCab?: Record<string, boolean>;
  /** PCS "สถานะตู้" (owner 2026-07-21) — per-container disbursement flag keyed by
   *  cabinet_number (tb_cnt_item). true = จ่ายค่าตู้ให้ MOMO/TTW แล้ว. Informational
   *  badge only — it NEVER gates แจ้งชำระเงิน (we bill the customer on the SELL side
   *  regardless of whether our COST leg has been disbursed yet). */
  cntPaidByCab?: Record<string, boolean>;
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
  // owner 2026-07-17 — the per-row reasons behind "ผิดพลาด N". The action always
  // carried them; the UI used to throw them away, so staff saw a bare count and
  // had no idea what to fix ([[wrong-error-message-hides-real-block]]).
  const [failures, setFailures] = useState<BillFailure[]>([]);
  // Lane C 2026-06-02 — sortable column headers (ภูม flag #3). Default
  // sort preserves the server's order until staff clicks a header.
  const [sortKey, setSortKey] = useState<FwckSortKey | null>(null);
  const [sortDir, setSortDir] = useState<FwckSortDir>("desc");
  const handleSort = (k: FwckSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  // A2 (fidelity · 2026-07-21) — global search box. Legacy uses DataTables
  // `dom:'Bfrtip'` (forwarder-check.php L583) = a filter box that searches every
  // column. We mirror it client-side across the operationally-searched fields:
  // tracking / รหัสลูกค้า / ชื่อลูกค้า / เลขตู้ / รายละเอียดสินค้า.
  const [query, setQuery] = useState("");
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.tracking_chn,
        r.userid,
        r.customer_name,
        r.cabinet_number,
        r.detail,
        r.fno_cargo,
        String(r.id),
      ]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const viewRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = fwckSortValue(a, sortKey);
      const bv = fwckSortValue(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filteredRows, sortKey, sortDir]);

  // Selection safety (money path) — the ONLY selection any action / count / Σ
  // uses is the intersection with the currently-VISIBLE (filtered) rows. Derived
  // at read time (no state mutation), so it's structurally impossible to bill or
  // count a row the user cannot see: hide a selected row via search and it drops
  // out of the bottom bar, the Σ footer, the confirm dialog, AND the bill call.
  // Chosen over "clear the hidden selection" (the other option in the brief)
  // because it's the safer of the two — the raw checkbox state is untouched, so
  // clearing the search brings a cross-filter selection back intact (no data
  // loss) while an off-screen row can never be silently billed.
  const visibleSelectedIds = useMemo(() => {
    const out = new Set<number>();
    for (const r of filteredRows) if (selected.has(r.id)) out.add(r.id);
    return out;
  }, [filteredRows, selected]);

  // SHIPMENT-ATOMIC toggle (owner 2026-07-22 "แจ้งเก็บเงิน = ทั้งชิปเม้น"): a MOMO
  // box-split shipment is N queue rows sharing one base tracking (same customer) —
  // ticking ONE box brings the whole shipment (untick drops it) so the customer is
  // never billed a partial shipment.
  const toggleRow = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const row = rows.find((r) => r.id === id);
      const base = row ? baseTracking(row.tracking_chn) : null;
      const groupIds = base && row
        ? rows
            .filter((r) => r.userid === row.userid && baseTracking(r.tracking_chn) === base)
            .map((r) => r.id)
        : [id];
      const adding = !next.has(id);
      for (const gid of groupIds) {
        if (adding) next.add(gid);
        else next.delete(gid);
      }
      return next;
    });

  // "เลือกทั้งหมด" toggles only the currently-visible (filtered) rows — a
  // search-hidden selection is never touched (union on check · remove on uncheck).
  const toggleAll = (e: ChangeEvent<HTMLInputElement>) => {
    const on = e.target.checked;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filteredRows) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  };

  // Selection summary — total outstanding + distinct customers — for the
  // confirm modal AND the fixed-bottom bar live count. Restricted to the
  // VISIBLE selection so the bar never counts a search-hidden row.
  const summary = useMemo(() => {
    let total = 0;
    const userSet = new Set<string>();
    for (const r of filteredRows) {
      if (!visibleSelectedIds.has(r.id)) continue;
      total += r.outstanding_thb;
      userSet.add(r.userid);
    }
    return { total, customerCount: userSet.size, rowCount: visibleSelectedIds.size };
  }, [filteredRows, visibleSelectedIds]);

  // G3 reachability (§0d · 2026-07-08) — when the current selection is a SINGLE
  // credit/นิติ customer, offer a direct jump to ออกใบวางบิล for them. The billing-run
  // add form auto-ticks this customer's ตรวจตู้ (check-queue) rows, so the ตรวจตู้
  // selection carries straight into the ใบวางบิล (a credit/นิติ order bills via a
  // ใบวางบิล, not the SMS-pay flow). Only shown for a juristic/credit single customer.
  const billingRunTarget = useMemo(() => {
    const picked = filteredRows.filter((r) => visibleSelectedIds.has(r.id));
    const uids = new Set(picked.map((r) => r.userid));
    if (uids.size !== 1) return null;
    const uid = [...uids][0];
    const eligible = picked.some((r) => r.customer_company === 1 || r.user_credit === "1");
    return eligible ? uid : null;
  }, [filteredRows, visibleSelectedIds]);

  // Header checkbox reflects the VISIBLE rows only ("select all [visible]").
  const allChecked = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));
  const someChecked = visibleSelectedIds.size > 0 && !allChecked;

  function runBill() {
    setResultBanner(null);
    setFailures([]);
    // Bill only the VISIBLE selection — a search-hidden row can never be billed.
    const fids = Array.from(visibleSelectedIds);
    if (fids.length === 0) return;
    startTransition(async () => {
      const res = await adminCallPriceUser({ fids });
      setConfirmingBill(false);
      if (res.ok && res.data) {
        const d = res.data;
        setFailures(d.failures ?? []);
        const parts: string[] = [
          `✅ แจ้งชำระเงินสำเร็จ ${d.processed} รายการ`,
        ];
        // The count alone is meaningless — the reasons render in the panel below.
        if (d.failed > 0) parts.push(`· แจ้งไม่ได้ ${d.failed} รายการ (ดูเหตุผลด้านล่าง)`);

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

        // 0 สำเร็จ = ไม่ใช่ผลลัพธ์ที่ดี → อย่าโชว์แถบเขียว (เดิม "สำเร็จ 0" ขึ้นเขียว = หลอกตา).
        setResultBanner({ kind: d.processed > 0 ? "ok" : "err", text: parts.join(" ") });
        // ไม่มีอะไรสำเร็จ → คงรายการที่ติ๊กไว้ ให้แก้แล้วกดซ้ำได้เลย ไม่ต้องติ๊กใหม่.
        if (d.processed > 0) setSelected(new Set());
        router.refresh();
      } else if (!res.ok) {
        setResultBanner({ kind: "err", text: res.error });
      }
    });
  }

  async function runRemoveFromQueue() {
    setResultBanner(null);
    const fids = Array.from(visibleSelectedIds);
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
  // Σ footer sums over the FILTERED set so the totals never lie about what the
  // search shows (A2 — "matches the Σ footer to the filtered set").
  const countableRows = useMemo(
    () =>
      filterCountableForwarderRows(filteredRows, {
        tracking: (r) => r.tracking_chn,
        weight: (r) => r.weight_kg,
        userid: (r) => r.userid,
        // total_price=0 → drop an aggregate-weight bare base from the box-count Σ
        // (owner 2026-07-16 · #52559); a priced anchor stays. amount/amount_fi read
        // countableRows so the "N/M กล่อง" count no longer includes the หัวบิล.
        money: (r) => r.total_price,
      }),
    [filteredRows],
  );
  const datasetSummary = useMemo(() => {
    return {
      amount:               countableRows.reduce((s, r) => s + r.amount, 0),
      amountFi:             countableRows.reduce((s, r) => s + r.amount_fi, 0),
      volumeCbm:            filteredRows.reduce((s, r) => s + r.volume_cbm, 0),
      weightKg:             filteredRows.reduce((s, r) => s + r.weight_kg, 0),
      transportPrice:       filteredRows.reduce((s, r) => s + r.transport_price, 0),
      outstanding:          filteredRows.reduce((s, r) => s + r.outstanding_thb, 0),
      onePercent:           filteredRows.reduce((s, r) => s + r.one_percent, 0),
      profit:               filteredRows.reduce((s, r) => s + r.profit_item, 0),
    };
  }, [filteredRows, countableRows]);

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

      {/* owner 2026-07-17 — "แจ้งชำระเงินสำเร็จ 0 · ผิดพลาด 8" บอกแค่ตัวเลข พนักงานไม่รู้ว่าติดอะไร
          → แจงรายตัว: ติดอะไร · ต้องทำอะไรต่อ · กดเข้าไปแก้ได้เลย (§0g self-explaining row). */}
      {failures.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-red-200 bg-red-100/60">
            <p className="text-sm font-semibold text-red-800">
              🚫 แจ้งชำระไม่ได้ {failures.length} รายการ — ต้องแก้ก่อน
            </p>
            <button
              type="button"
              onClick={() => setFailures([])}
              className="text-[11px] text-red-700 hover:underline shrink-0"
            >
              ปิด
            </button>
          </div>
          <ul className="divide-y divide-red-200/70">
            {failures.map((f) => {
              const row = rows.find((r) => r.id === f.fid);
              return (
                <li key={f.fid} className="px-3 py-2.5 text-[11px] leading-relaxed">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Link
                      href={`/admin/forwarders/${f.fid}`}
                      className="font-mono text-xs font-semibold text-primary-700 hover:underline"
                    >
                      #{f.fid}
                    </Link>
                    {row && (
                      <>
                        <span className="font-semibold text-foreground">
                          {row.userid} · {row.customer_name || "—"}
                        </span>
                        {row.tracking_chn && (
                          <span className="font-mono text-muted">{row.tracking_chn}</span>
                        )}
                        {row.cabinet_number && (
                          <span className="font-mono text-muted">ตู้ {row.cabinet_number}</span>
                        )}
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-red-800">
                    <span className="font-semibold">ติดอะไร:</span> {f.reason}
                  </p>
                  <p className="mt-0.5 text-emerald-900">
                    <span className="font-semibold">👉 ต้องทำอะไรต่อ:</span> {f.nextAction}
                  </p>
                  <Link
                    href={`/admin/forwarders/${f.fid}`}
                    className="mt-1 inline-block rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                  >
                    เปิดรายการ #{f.fid} ไปแก้
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* A2 (fidelity) — global search box (legacy DataTables Bfrtip filter).
          Searches ทุกคอลัมน์หลัก: tracking / รหัสลูกค้า / ชื่อ / เลขตู้ / รายละเอียด. */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหา แทรคกิ้ง · รหัสลูกค้า · ชื่อ · เลขตู้ · รายละเอียด"
              className="w-full rounded-md border border-border bg-white dark:bg-surface pl-8 pr-8 py-1.5 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300"
              aria-label="ค้นหาในตาราง"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-sm"
                aria-label="ล้างการค้นหา"
              >
                ✕
              </button>
            )}
          </div>
          {query.trim() && (
            <span className="text-xs text-muted">
              พบ <b className="text-foreground">{filteredRows.length}</b> รายการ
              <span className="text-muted/70"> / {rows.length}</span>
            </span>
          )}
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
                {viewRows.length === 0 && query.trim() && (
                  <tr>
                    <td colSpan={20} className="px-3 py-8 text-center text-sm text-muted">
                      ไม่พบรายการที่ตรงกับ &quot;{query.trim()}&quot; —{" "}
                      <button type="button" onClick={() => setQuery("")} className="text-primary-600 hover:underline">
                        ล้างการค้นหา
                      </button>
                    </td>
                  </tr>
                )}
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
                            {/* PCS "สถานะตู้" (owner 2026-07-21) — จ่ายค่าตู้ให้ MOMO/TTW แล้วยัง.
                                MOMO วางบิลเราเป็น TRACKING เป็นรอบ · เราตัดจ่ายเป็น ตู้ ครั้งเดียว
                                (tb_cnt/tb_cnt_item · หน้า /admin/cnt-hs) → badge นี้บอกว่าขาต้นทุน
                                ของตู้นี้ออกจากบัญชีเราแล้วหรือยัง. ไม่บล็อกการแจ้งชำระ (ขาขายคนละขา). */}
                            {cntPaidByCab?.[r.cabinet_number] ? (
                              <span
                                className="ml-1 inline-block rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] px-1.5 py-0.5 align-middle"
                                title="จ่ายค่าตู้ให้พาร์ทเนอร์แล้ว (มีรายการใน ตัดจ่ายค่าตู้)"
                              >
                                💰 จ่ายค่าตู้แล้ว
                              </span>
                            ) : (
                              <Link
                                href={`/admin/cnt-hs?q=1&cab=${encodeURIComponent(r.cabinet_number)}`}
                                className="ml-1 inline-block rounded-full bg-slate-50 text-slate-600 border border-slate-200 text-[11px] px-1.5 py-0.5 align-middle hover:bg-slate-100"
                                title="ยังไม่มีรายการตัดจ่ายค่าตู้ของตู้นี้ — คลิกไปหน้าจ่ายค่าตู้ (ไม่บล็อกการแจ้งชำระลูกค้า)"
                              >
                                ⏳ ยังไม่จ่ายค่าตู้
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
                        <div className="flex flex-wrap items-center gap-1">
                          <Link
                            href={`/admin/customers/${r.userid}`}
                            className="font-mono font-semibold text-primary-600 hover:underline"
                          >
                            {r.userid}
                          </Link>
                          {/* A8 · เรทเฉพาะตัว (legacy badgeVIP2 SVIP · owner killed the VIP tier 2026-07-10) */}
                          {r.has_custom_rate && (
                            <span
                              className="rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 px-1.5 py-0.5 text-[11px] font-medium"
                              title="ลูกค้าคิดราคาแบบเรทเฉพาะตัว (tb_rate_custom)"
                            >
                              เรทเฉพาะตัว
                            </span>
                          )}
                          {/* legacy badgeVIP2 CPS — คิดราคาตามค่าเทียบ (tb_users.userComparison='1' · ยัง live ใน resolve-rate) */}
                          {r.has_comparison && (
                            <span
                              className="rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 text-[11px] font-medium"
                              title="ลูกค้าคิดราคาตามค่าเทียบ (userComparison)"
                            >
                              ค่าเทียบ
                            </span>
                          )}
                        </div>
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
                            {/* A1 · รายละเอียดสินค้า (legacy short-text max-w · forwarder-check.php L419) */}
                            {r.detail && r.detail.trim() && (
                              <p
                                className="mt-1 text-[11px] text-foreground/80 line-clamp-2 break-words"
                                title={r.detail}
                              >
                                {r.detail}
                              </p>
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
                        {/* A3 · ค่าขนส่งไทย ฿ รายแถว (legacy col "ค่าขนส่งไทย" L453 · = the sort key) */}
                        <div className="text-[11px] font-mono font-semibold text-foreground mt-0.5">
                          ฿{thb(r.transport_price)}
                        </div>
                        {r.pay_method === "2" && (
                          <div className="text-[11px] bg-red-100 text-red-700 px-1 rounded inline-block mt-0.5">ปลายทาง</div>
                        )}
                        {r.ship_by && r.ship_by !== "PCS" && r.address_district && (
                          <div className="text-[11px] text-muted">
                            {r.address_district} · จ.{r.address_province}
                          </div>
                        )}
                        {/* A5 · flashRemoteArea warning (legacy L449 · only for non-PCS delivery) */}
                        {r.ship_by && r.ship_by !== "PCS" && (() => {
                          const badge = flashRemoteAreaBadge(r.address_zipcode);
                          return badge ? (
                            <div className="mt-0.5">
                              <span className="inline-block rounded bg-red-600 text-white px-1.5 py-0.5 text-[11px] font-medium">
                                {badge.label}
                              </span>
                            </div>
                          ) : null;
                        })()}
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
                            {/* A6 · ประเภทสินค้ารอง (legacy nameProductsType(fProductsType2) · L471) */}
                            {r.products_type2 && r.products_type2 !== "0" && (
                              <div className="text-[11px] text-muted" title="ประเภทสินค้ารอง">
                                รอง: {PRODUCTS_TYPE_LABEL[r.products_type2] ?? "ไม่พบข้อมูล" /* legacy nameProductsType default */}
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
      {visibleSelectedIds.size > 0 && (
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

      {/* Itemized confirm-before-bill popup (§0f) — lists the ticked rows + per-row
          จำนวนเงิน + a TOTAL footer (Σ outstanding, the same number the bill uses).
          On confirm → the unchanged runBill() (adminCallPriceUser). The status-change
          + SMS/LINE/Email channel notice is carried in `note`. */}
      <SelectedItemsConfirmDialog
        open={confirmingBill}
        title={`รายการที่เลือก ${summary.rowCount}/${filteredRows.length} รายการ`}
        note={
          <>
            การกระทำนี้จะเปลี่ยนสถานะเป็น <b>5 · รอชำระเงิน</b> · ส่ง SMS / LINE OA / Email
            แจ้งลูกค้าทันที ({summary.customerCount} ลูกค้า) · เมื่อแจ้งแล้วจะลบออกจากคิวตรวจสอบอัตโนมัติ
          </>
        }
        rows={filteredRows
          .filter((r) => visibleSelectedIds.has(r.id))
          .map((r) => ({
            orderNo: `#${r.id}`,
            tracking: r.tracking_chn ?? "-",
            customerCode: r.userid,
            status: STATUS_LABEL[r.status] ?? r.status,
            amount: r.outstanding_thb,
          }))}
        showAmount
        total={summary.total}
        confirmLabel={`เรียกเก็บเงินลูกค้ารายการนำเข้า จำนวนเงิน ฿${thb(summary.total)} บาท`}
        busy={pending}
        onCancel={() => setConfirmingBill(false)}
        onConfirm={runBill}
      />
    </div>
  );
}
