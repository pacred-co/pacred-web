"use client";

/**
 * <SackDetailClient> — กระสอบรวม detail island (READ-ONLY).
 *
 * Header (container / transport / totals / status) + the parcels inside (from
 * momo_import_tracks). §0g/§0h readable rows. MIRROR-ONLY — no add/remove/edit/delete
 * (Pacred mirrors MOMO; it does not originate sacks). PHYSICAL-ONLY — no money field.
 */

import { Boxes, Package, Truck } from "lucide-react";
import {
  transportTypeLabel,
  sackStatusLabel,
  type DerivedSack,
  type SackParcel,
} from "@/lib/warehouse/sack";

export function SackDetailClient({
  sack,
  parcels,
}: {
  sack: DerivedSack;
  parcels: SackParcel[];
}) {
  return (
    <div className="space-y-6">
      {/* header card */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Boxes className="h-6 w-6 text-primary-600" />
              {sack.sack_no}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1">
                <Truck className="h-4 w-4" /> {transportTypeLabel(sack.transport_type)}
              </span>
              {sack.container && (
                <span className="inline-flex items-center gap-1">
                  <Package className="h-4 w-4" /> ตู้ {sack.container}
                </span>
              )}
              {sack.status && (
                <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                  {sackStatusLabel(sack.status)}
                </span>
              )}
            </div>
          </div>
          <span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-600">
            ที่มา MOMO · อ่านอย่างเดียว
          </span>
        </div>

        {/* physical totals */}
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 text-center sm:grid-cols-4">
          <div>
            <div className="text-lg font-bold text-gray-900">{sack.parcels}</div>
            <div className="text-[11px] text-gray-500">พัสดุ (รายการ)</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">{sack.qty}</div>
            <div className="text-[11px] text-gray-500">จำนวน (ชิ้น)</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">{sack.cbm.toFixed(4)}</div>
            <div className="text-[11px] text-gray-500">ปริมาตร (คิว)</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">{sack.weight.toFixed(2)}</div>
            <div className="text-[11px] text-gray-500">น้ำหนัก (กก.)</div>
          </div>
        </div>
      </section>

      {/* parcels */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          พัสดุข้างในกระสอบ ({parcels.length})
        </h2>

        {parcels.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">ไม่มีพัสดุในกระสอบนี้</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">
                  <th className="py-2 pr-2">เลขแทรค (MOMO)</th>
                  <th className="py-2 pr-2">รหัสลูกค้า (PR)</th>
                  <th className="py-2 pr-2">รหัสชิ้น (CG)</th>
                  <th className="py-2 pr-2 text-right">จำนวน</th>
                  <th className="py-2 pr-2 text-right">น้ำหนัก</th>
                  <th className="py-2 pr-2 text-right">ปริมาตร</th>
                  <th className="py-2 pr-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {parcels.map((p, i) => (
                  <tr key={`${p.momo_tracking_no ?? "x"}-${i}`} className="border-b border-gray-100">
                    <td className="py-2 pr-2 font-medium text-gray-900">{p.momo_tracking_no ?? "—"}</td>
                    <td className="py-2 pr-2 text-gray-600">{p.momo_user_code ?? "—"}</td>
                    <td className="py-2 pr-2 text-gray-600">{p.momo_cg_no ?? "—"}</td>
                    <td className="py-2 pr-2 text-right text-gray-900">{p.quantity}</td>
                    <td className="py-2 pr-2 text-right text-gray-900">{p.weight_kg.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-right text-gray-900">{p.cbm.toFixed(4)}</td>
                    <td className="py-2 pr-2 text-gray-600">
                      {sackStatusLabel((p.shipment_status ?? "").trim() || (p.current_location ?? "").trim() || null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
