"use client";

/**
 * ApListTable — the AP ledger LIST, grouped by SHIPMENT (report-cnt-style),
 * with an expandable fan-out. Each row is §0g self-explaining + §0h ≥11px:
 *
 *   คืออะไร   → category pill + item_label
 *   ของใคร    → line_name + customer_id + SHIPMENT (grouped)
 *   ทำอะไร    → lane badge
 *   สถานะไหน  → dual pills (transfer_status + receipt_status)
 *   รายละเอียด → QO/IV/RT/container + ยอดเบิก/ยอดคืน
 *   รูป       → slip thumbnail (Slice 2 will populate transfer_slip_path)
 *   next-act  → AP_NEXT_ACTION hint
 *   วันไหน    → formatThaiDateTime(requested_at)
 *
 * READ-only in Slice 1 — clicking a row opens the detail page. No mutate here.
 */

import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import { SlipImage } from "@/components/admin/slip-image";
import {
  AP_LANE_LABEL,
  AP_ENTITY_LABEL,
  AP_CATEGORY_LABEL,
  AP_CATEGORY_TONE,
  AP_TRANSFER_STATUS,
  AP_RECEIPT_STATUS,
  AP_NEXT_ACTION,
  rowNetAmount,
  type ApShipmentGroup,
  type ApDisbursementRow,
} from "@/lib/admin/ap-disbursement";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ApListTable({ groups }: { groups: ApShipmentGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-8 text-center text-sm text-gray-500">
        ไม่พบรายการเบิกจ่ายตามเงื่อนไข
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <ShipmentGroupCard key={g.shipmentNo ?? `__no_ship_${i}`} group={g} />
      ))}
    </div>
  );
}

function ShipmentGroupCard({ group }: { group: ApShipmentGroup }) {
  const [open, setOpen] = useState(true);
  const { shipmentNo, rows, totals } = group;
  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
      {/* Group header — SHIPMENT + net Σ (self-explaining at a glance). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100"
      >
        <div className="min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            SHIPMENT
          </span>
          <div className="truncate text-sm font-semibold text-foreground">
            {shipmentNo ?? "(ไม่ระบุ SHIPMENT · OPEX/ทั่วไป)"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-right">
          <div>
            <div className="text-[11px] text-gray-400">ยอดสุทธิ</div>
            <div className="font-mono text-sm font-bold text-primary-700">฿{fmt2(totals.netSum)}</div>
          </div>
          <div className="text-xs text-gray-400">{rows.length} รายการ</div>
          <span className="text-gray-400">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className="divide-y divide-black/5">
          {rows.map((r) => (
            <ApRow key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApRow({ row }: { row: ApDisbursementRow }) {
  const cat = AP_CATEGORY_LABEL[row.category];
  const catTone = AP_CATEGORY_TONE[row.category];
  const tstat = AP_TRANSFER_STATUS[row.transfer_status];
  const rstat = AP_RECEIPT_STATUS[row.receipt_status];
  const nextAction = AP_NEXT_ACTION[row.transfer_status];
  const net = rowNetAmount(row);

  return (
    <div className="flex flex-col gap-2 px-4 py-3 hover:bg-gray-50/60 sm:flex-row sm:items-start sm:gap-4">
      {/* slip thumbnail (Slice 2 will populate) */}
      <div className="hidden shrink-0 sm:block">
        {row.transfer_slip_path ? (
          <a href={row.transfer_slip_path} target="_blank" rel="noreferrer">
            <SlipImage
              src={row.transfer_slip_path}
              alt="สลิปโอน"
              className="h-14 w-14 rounded-md border border-black/10 object-cover"
              pdfMode="tile"
            />
          </a>
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-black/10 text-[11px] text-gray-300">
            —
          </div>
        )}
      </div>

      {/* main — คืออะไร / ของใคร / รายละเอียด */}
      <div className="min-w-0 grow">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${catTone}`}>
            {cat}
          </span>
          <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-gray-600">
            {AP_LANE_LABEL[row.lane]}
          </span>
          <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-gray-500">
            {AP_ENTITY_LABEL[row.entity]}
          </span>
          {row.is_customer_named_receipt && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              ทดรองจ่าย · ใบเสร็จชื่อลูกค้า
            </span>
          )}
        </div>

        <Link
          href={`/admin/accounting/ap/${row.id}`}
          className="mt-1 block truncate text-sm font-semibold text-foreground hover:text-primary-700 hover:underline"
        >
          {row.item_label || "(ไม่มีชื่อรายการ)"}
        </Link>

        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
          {row.line_name && <span>{row.line_name}</span>}
          {row.customer_id && <span className="font-mono">{row.customer_id}</span>}
          {row.quotation_no && <span>QO: {row.quotation_no}</span>}
          {row.invoice_no && <span>IV: {row.invoice_no}</span>}
          {row.receipt_no && <span>RT: {row.receipt_no}</span>}
          {row.container_no && <span>ตู้: {row.container_no}</span>}
          {row.payee_name && <span>ผู้รับ: {row.payee_name}</span>}
        </div>
        {row.note && (
          <div className="mt-0.5 truncate text-[11px] text-gray-400">📝 {row.note}</div>
        )}
      </div>

      {/* status axis + money + next-action */}
      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <div className="flex flex-wrap items-center justify-end gap-1">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tstat.tone}`}>
            {tstat.label}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${rstat.tone}`}>
            {rstat.label}
          </span>
        </div>
        <div className="font-mono text-sm font-bold text-foreground">
          {net < 0 ? (
            <span className="text-green-700">คืน ฿{fmt2(Math.abs(net))}</span>
          ) : (
            <span>฿{fmt2(net)}</span>
          )}
        </div>
        {row.amount_gross && row.wht_pct ? (
          <div className="text-[11px] text-gray-400">
            gross ฿{fmt2(row.amount_gross)} · หัก {row.wht_pct}%
          </div>
        ) : null}
        {nextAction && (
          <div className="text-[11px] font-medium text-rose-600">🔔 {nextAction}</div>
        )}
        <div className="text-[11px] text-gray-400">{formatThaiDateTime(row.requested_at)}</div>
      </div>
    </div>
  );
}
