"use client";

/**
 * Per-tracking spawn form — calls `spawnForwardersFromShopOrder` to
 * create one tb_forwarder row per cTrackingNumber (Wave 21 P0 · Task #106).
 *
 * Faithful port of legacy `pcs-admin/include/pages/shops/update/update4.php`
 * L88-116 — the inline `<form>` admin uses after receiving tracking numbers
 * from the China shop. Each tb_order line item gets its own row in this
 * form; the operator types the cTrackingNumber + (optional) overrides +
 * presses "สร้างฝากนำเข้า" (single row) or the bulk "สร้างทั้งหมด" button
 * at the bottom to fire one POST per row.
 *
 * Behaviour:
 *   - Per-row "สร้างฝากนำเข้า" button → calls spawn with [thisRow]
 *   - Bulk "สร้างทั้งหมด" button       → calls spawn with [allFilledRows]
 *   - Idempotent — re-submit returns existing fNo instead of double-spawn
 *   - On success: shows toast with f_nos created · router.refresh()
 *
 * Why a client island: parent is RSC; the spawn POST must run without a
 * full reload because operators commonly spawn multiple rows in quick
 * succession (same pattern as cart-row-actions.tsx).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { spawnForwardersFromShopOrder } from "@/actions/admin/service-orders-spawn";

export type TrackingRow = {
  // identifier-only; admin types cTrackingNumber if not already present
  cShippingNumber: string;
  cTrackingNumber: string;
  cNameShop:       string;
};

export type SpawnFormProps = {
  hNo:                   string;
  rows:                  TrackingRow[];
  defaultShipBy?:        string;  // header.hshipby fallback
  defaultTransportType?: string;  // header.htransporttype fallback
};

type RowState = {
  cTrackingNumber: string;
  fPriceUpdate:    string;   // text input · parsed at submit
  fDetail:         string;
  status:          "idle" | "pending" | "done" | "skipped" | "error";
  fNo?:            number;
  message?:        string;
};

export default function SpawnForwarderForm({
  hNo,
  rows,
  defaultShipBy,
  defaultTransportType,
}: SpawnFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bulkMsg, setBulkMsg] = useState<string>("");

  // Per-row state — pre-populated from existing cTrackingNumber so already-
  // typed rows render their value and the "สร้างฝากนำเข้า" button is
  // ready immediately (matches legacy update4.php L105 default value).
  const [state, setState] = useState<RowState[]>(
    rows.map((r) => ({
      cTrackingNumber: r.cTrackingNumber ?? "",
      fPriceUpdate:    "0",
      fDetail:         "",
      status:          "idle" as const,
    })),
  );

  function updateRow(idx: number, patch: Partial<RowState>) {
    setState((s) => s.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function fireSpawn(indices: number[]) {
    const trackings = indices
      .map((i) => state[i])
      .filter((r) => r.cTrackingNumber.trim().length > 0)
      .map((r) => ({
        cTrackingNumber: r.cTrackingNumber.trim(),
        fShipBy:         defaultShipBy ?? undefined,
        fTransportType:  (defaultTransportType ?? undefined) as "1" | "2" | "3" | undefined,
        fPriceUpdate:    Number(r.fPriceUpdate) || 0,
        fDetail:         r.fDetail || undefined,
      }));

    if (trackings.length === 0) {
      setBulkMsg("ไม่มี tracking ให้ส่ง — กรอกเลขก่อน");
      return;
    }

    // mark pending
    setState((s) =>
      s.map((r, i) => (indices.includes(i) ? { ...r, status: "pending" } : r)),
    );
    setBulkMsg("กำลังสร้างรายการฝากนำเข้า...");

    const res = await spawnForwardersFromShopOrder({ hNo, trackings });

    if (!res.ok) {
      setBulkMsg(`ผิดพลาด: ${res.error}`);
      setState((s) =>
        s.map((r, i) =>
          indices.includes(i) ? { ...r, status: "error", message: res.error } : r,
        ),
      );
      return;
    }

    const { spawnedFNos, created, skipped, statusCompleted } = res.data!;
    setBulkMsg(
      `สำเร็จ — สร้าง ${created} รายการ${skipped > 0 ? ` · ข้าม ${skipped} (มีอยู่แล้ว)` : ""}: ` +
        `${spawnedFNos.map((id) => `#${id}`).join(", ")}` +
        (statusCompleted
          ? " · ครบทุกร้านแล้ว → ปิดออเดอร์เป็น “สำเร็จ”"
          : " · ออเดอร์ยังอยู่ “รอร้านจีนจัดส่ง” (กรอก tracking ร้านที่เหลือต่อได้)"),
    );
    // Mark each input row done with assigned fNo (best-effort match by order).
    setState((s) =>
      s.map((r, i) => {
        if (!indices.includes(i)) return r;
        const idxInResult = indices.indexOf(i);
        const fNo = spawnedFNos[idxInResult];
        return {
          ...r,
          status: fNo ? "done" : "skipped",
          fNo,
        };
      }),
    );
    router.refresh();
  }

  function handleSingle(idx: number) {
    startTransition(() => fireSpawn([idx]));
  }

  function handleBulk() {
    const idle = state
      .map((r, i) => (r.status === "idle" && r.cTrackingNumber.trim() ? i : -1))
      .filter((i) => i >= 0);
    if (idle.length === 0) {
      setBulkMsg("ไม่มีแถวที่พร้อมสร้าง (กรอก tracking ในแถวที่ยังว่างก่อน)");
      return;
    }
    startTransition(() => fireSpawn(idle));
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-bold text-sm">
          สร้างรายการฝากนำเข้าจาก tracking ({rows.length} รายการ)
        </h3>
        <span className="text-[11px] text-muted">
          legacy: shops.php L1584 · update4.php L88-116
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted italic">
          ไม่มี tb_order line items สำหรับออเดอร์นี้ — ไม่สามารถสร้าง ฝากนำเข้าได้
          (ตรวจสอบว่า cart-checkout ลงข้อมูลใน tb_order ครบ)
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {rows.map((row, idx) => {
              const s = state[idx];
              const statusBadge = renderStatusBadge(s);
              return (
                <div
                  key={`${row.cShippingNumber}-${idx}`}
                  className="border border-border rounded-lg p-3 text-sm"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                    <div>
                      <span className="text-muted text-xs">ร้าน: </span>
                      <span className="font-medium">{row.cNameShop || "—"}</span>
                      <span className="ml-3 text-muted text-xs">เลขออเดอร์จีน: </span>
                      <span className="font-mono text-xs">{row.cShippingNumber || "—"}</span>
                    </div>
                    {statusBadge}
                  </div>
                  <div className="grid md:grid-cols-[1.5fr_1fr_1.5fr_auto] gap-2 items-end">
                    <label className="block">
                      <span className="text-[11px] text-muted block mb-1">เลข Tracking จีน *</span>
                      <input
                        type="text"
                        className="w-full rounded border border-border px-2 py-1 text-sm font-mono"
                        value={s.cTrackingNumber}
                        onChange={(e) => updateRow(idx, { cTrackingNumber: e.target.value })}
                        disabled={s.status === "pending" || s.status === "done"}
                        placeholder="กรอกเลข tracking"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-muted block mb-1">เพิ่ม/ลด เงิน (THB)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="w-full rounded border border-border px-2 py-1 text-sm text-right font-mono"
                        value={s.fPriceUpdate}
                        onChange={(e) => updateRow(idx, { fPriceUpdate: e.target.value })}
                        disabled={s.status === "pending" || s.status === "done"}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-muted block mb-1">รายละเอียด (ไม่บังคับ)</span>
                      <input
                        type="text"
                        className="w-full rounded border border-border px-2 py-1 text-sm"
                        value={s.fDetail}
                        onChange={(e) => updateRow(idx, { fDetail: e.target.value })}
                        disabled={s.status === "pending" || s.status === "done"}
                        placeholder="(default: ใช้ htitle ของออเดอร์)"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleSingle(idx)}
                      disabled={
                        isPending ||
                        s.status === "pending" ||
                        s.status === "done" ||
                        !s.cTrackingNumber.trim()
                      }
                      className="rounded-md border border-primary-500 bg-primary-500 px-3 py-1.5 text-xs text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      สร้าง ฝากนำเข้า
                    </button>
                  </div>
                  {s.message && (
                    <p className="text-[11px] text-red-600 mt-2">{s.message}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap border-t border-border pt-3">
            <div className="text-xs text-muted">
              {bulkMsg || "กรอก tracking ทุกแถวที่ต้องการ แล้วกด \"สร้างทั้งหมด\" หรือกดทีละแถว"}
            </div>
            <button
              type="button"
              onClick={handleBulk}
              disabled={isPending}
              className="rounded-md border border-primary-600 bg-primary-600 px-4 py-2 text-xs text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              สร้างทั้งหมด ({state.filter((r) => r.status === "idle" && r.cTrackingNumber.trim()).length})
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function renderStatusBadge(s: RowState) {
  if (s.status === "done") {
    return (
      <span className="rounded-full border border-green-300 bg-green-50 text-green-700 px-2 py-0.5 text-[11px] font-medium">
        ✓ สร้าง #{s.fNo}
      </span>
    );
  }
  if (s.status === "skipped") {
    return (
      <span className="rounded-full border border-amber-300 bg-amber-50 text-amber-700 px-2 py-0.5 text-[11px] font-medium">
        ข้าม (มีอยู่แล้ว #{s.fNo})
      </span>
    );
  }
  if (s.status === "pending") {
    return (
      <span className="rounded-full border border-blue-300 bg-blue-50 text-blue-700 px-2 py-0.5 text-[11px] font-medium">
        กำลังสร้าง...
      </span>
    );
  }
  if (s.status === "error") {
    return (
      <span className="rounded-full border border-red-300 bg-red-50 text-red-700 px-2 py-0.5 text-[11px] font-medium">
        ผิดพลาด
      </span>
    );
  }
  return (
    <span className="rounded-full border border-border bg-surface-alt text-muted px-2 py-0.5 text-[11px]">
      รอสร้าง
    </span>
  );
}
