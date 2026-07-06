"use client";

/**
 * <SackListClient> — กระสอบรวม list island: filters + self-explaining rows (READ-ONLY).
 *
 * §0g self-explaining rows · §0h readable type. MIRROR-ONLY — no create/edit/delete.
 * PHYSICAL-ONLY — every number is qty / cbm / weight; no money anywhere.
 */

import { useState } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { Boxes, Search, Package } from "lucide-react";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import {
  sackStatusLabel,
  transportTypeLabel,
  type DerivedSack,
} from "@/lib/warehouse/sack";

type Filters = {
  container?: string;
  sackNo?: string;
  memberCode?: string;
};

function statusPill(status: string | null) {
  const s = (status ?? "").trim();
  if (!s) {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
        —
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
      {sackStatusLabel(s)}
    </span>
  );
}

export function SackListClient({ sacks, filters }: { sacks: DerivedSack[]; filters: Filters }) {
  const router = useRouter();
  const [f, setF] = useState<Filters>(filters);

  function applyFilters() {
    const params = new URLSearchParams();
    if (f.container?.trim()) params.set("container", f.container.trim());
    if (f.sackNo?.trim()) params.set("sackNo", f.sackNo.trim());
    if (f.memberCode?.trim()) params.set("memberCode", f.memberCode.trim());
    router.push(`/admin/warehouse/sacks?${params.toString()}`);
  }

  function clearFilters() {
    setF({});
    router.push("/admin/warehouse/sacks");
  }

  return (
    <div className="space-y-4">
      {/* filters */}
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-[11px] text-gray-500">
            ชื่อกระสอบ
            <input
              type="text"
              value={f.sackNo ?? ""}
              onChange={(e) => setF((s) => ({ ...s, sackNo: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="เลข/ชื่อกระสอบ"
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </label>
          <label className="text-[11px] text-gray-500">
            ชื่อตู้
            <input
              type="text"
              value={f.container ?? ""}
              onChange={(e) => setF((s) => ({ ...s, container: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="เช่น GZS260529-1"
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </label>
          <label className="text-[11px] text-gray-500">
            รหัสลูกค้า (PR)
            <input
              type="text"
              value={f.memberCode ?? ""}
              onChange={(e) => setF((s) => ({ ...s, memberCode: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="เช่น PR10190"
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
            />
          </label>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex items-center gap-1 rounded bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900"
          >
            <Search className="h-3.5 w-3.5" /> ค้นหา
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            ล้างตัวกรอง
          </button>
          <span className="ml-auto self-center text-[11px] text-gray-500">พบ {sacks.length} กระสอบ</span>
        </div>
      </div>

      {/* rows */}
      {sacks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-400">
          <Boxes className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          ยังไม่มีกระสอบที่ sync มาจาก MOMO
        </div>
      ) : (
        <div className="space-y-2">
          {sacks.map((s) => (
            <Link
              key={s.sack_no}
              href={`/admin/warehouse/sacks/${encodeURIComponent(s.sack_no)}`}
              className="block rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-primary-300 hover:bg-primary-50/30"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5 font-semibold text-gray-900">
                  <Boxes className="h-4 w-4 text-primary-600" />
                  {s.sack_no}
                </span>
                {statusPill(s.status)}
                <span className="text-xs text-gray-500">{transportTypeLabel(s.transport_type)}</span>
                {s.container &&
                  (s.container_is_real ? (
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
                      <Package className="h-3 w-3" /> ตู้ {s.container}
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700"
                      title={`รอบขนส่ง MOMO: ${s.container} · ยังไม่ปิดตู้เข้าเลขตู้จริง (GZS/GZE)`}
                    >
                      <Package className="h-3 w-3" /> {s.container}
                      <span className="text-amber-600">· รอเลขตู้จริง</span>
                    </span>
                  ))}
                {s.last_synced_at && (
                  <span className="ml-auto text-[11px] text-gray-400">
                    sync {formatThaiDateTime(s.last_synced_at)}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
                <span>
                  พัสดุ <span className="font-semibold text-gray-900">{s.parcels}</span> รายการ
                </span>
                <span>
                  จำนวน <span className="font-semibold text-gray-900">{s.qty}</span> ชิ้น
                </span>
                <span>
                  ปริมาตร <span className="font-semibold text-gray-900">{Number(s.cbm).toFixed(4)}</span> คิว
                </span>
                <span>
                  น้ำหนัก <span className="font-semibold text-gray-900">{Number(s.weight).toFixed(2)}</span> กก.
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
