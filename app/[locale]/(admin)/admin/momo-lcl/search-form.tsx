"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  adminCheckMomoSack,
  type CheckMomoSackData,
} from "@/actions/admin/momo-lcl";

/**
 * Single-input form for the MOMO LCL sack lookup. On submit, calls
 * `adminCheckMomoSack`, then renders:
 *   1. A summary card  — sack number · MOMO sack-weight · matched/unmatched
 *      counts · CBM total · weight total.
 *   2. A details table — one row per track from MOMO with the local
 *      tb_tmp_forwarder_item_momo match (or "ไม่พบในฐานข้อมูล").
 *
 * Mobile-first: form stacks vertically below `sm`, summary cards wrap, table
 * scrolls horizontally on narrow viewports.
 */

const ERROR_LABEL: Record<string, string> = {
  invalid_input:        "กรุณาระบุ sack number",
  momo_not_configured:  "ระบบยังไม่ได้ตั้งค่า MOMO API token — แจ้งทีม IT",
  not_found:            "ไม่พบ sack นี้ที่ระบบ MOMO",
  auth_failed:          "MOMO ปฏิเสธการเข้าถึง (token อาจหมดอายุ)",
  rate_limited:         "ส่งคำขอถี่เกินไป กรุณารอสักครู่",
  network:              "เชื่อมต่อ MOMO ไม่สำเร็จ (network)",
  parse_error:          "MOMO ส่งข้อมูลรูปแบบที่อ่านไม่ออก",
};

export function SackCheckForm() {
  const [sackNo, setSackNo]   = useState("");
  const [pending, startTx]    = useTransition();
  const [result, setResult]   = useState<CheckMomoSackData | null>(null);
  const [error, setError]     = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = sackNo.trim();
    if (trimmed.length === 0) {
      setError("invalid_input");
      setResult(null);
      return;
    }
    setError(null);
    startTx(async () => {
      const res = await adminCheckMomoSack({ sackNo: trimmed });
      if (res.ok && res.data) {
        setResult(res.data);
        setError(null);
      } else {
        setResult(null);
        setError(res.ok ? null : res.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 sm:p-5"
      >
        <label htmlFor="sackNo" className="block text-sm font-semibold mb-1.5">
          MOMO Sack Number
        </label>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            id="sackNo"
            name="sackNo"
            type="text"
            value={sackNo}
            onChange={(e) => setSackNo(e.target.value)}
            placeholder="เช่น SACK20251225-001"
            autoComplete="off"
            disabled={pending}
            className="flex-1 rounded-lg border border-border bg-white dark:bg-surface px-3 py-2.5 text-base font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
          />
          <Button type="submit" disabled={pending || sackNo.trim().length === 0}>
            {pending ? "กำลังค้นหา..." : "ค้นหา"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">
          ระบบจะดึงรายการ tracking ใน sack จาก MOMO API แล้วจับคู่กับฐานข้อมูล Pacred
          (รองรับหลาย sack คั่นด้วย comma)
        </p>
      </form>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-800 p-4 text-sm">
          <p className="font-semibold">เกิดข้อผิดพลาด</p>
          <p className="mt-0.5">{ERROR_LABEL[error] ?? error}</p>
        </div>
      )}

      {result && <SackResultView data={result} />}
    </div>
  );
}

function SackResultView({ data }: { data: CheckMomoSackData }) {
  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label="Sack" value={data.sackNo} mono />
        <Tile label="น้ำหนัก Sack (MOMO)" value={fmtKg(data.sackInfo.sackWeight)} />
        <Tile label="Tracking ทั้งหมด" value={String(data.resolved.length)} />
        <Tile label="CBM รวม" value={data.productCBMAllTotal.toFixed(5)} />
        <Tile label="น้ำหนักรวม (Pacred)" value={fmtKg(data.productWeightAllTotal)} />
      </div>

      {/* Match summary */}
      <div className="rounded-xl border border-border bg-surface-alt/30 p-3 text-sm">
        <span className="font-semibold">{data.matchedCount}</span>{" "}
        <span className="text-muted">รายการพบในฐานข้อมูล</span>
        {data.unmatchedCount > 0 && (
          <>
            {" · "}
            <span className="font-semibold text-yellow-700">{data.unmatchedCount}</span>{" "}
            <span className="text-muted">ไม่พบ (ต้องตรวจสอบเพิ่ม)</span>
          </>
        )}
      </div>

      {/* Tracks table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {data.resolved.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            MOMO ไม่ส่ง tracking มาใน sack นี้
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">MOMO ส่งมา</th>
                  <th className="px-4 py-3">จับคู่ด้วย</th>
                  <th className="px-4 py-3 text-right">CBM</th>
                  <th className="px-4 py-3 text-right">น้ำหนัก (kg)</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {data.resolved.map((r, i) => (
                  <tr key={`${r.momoTrack}-${i}`} className="border-t border-border align-top">
                    <td className="px-4 py-2 text-xs text-muted">{i + 1}</td>
                    <td className="px-4 py-2 font-mono">{r.track}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">
                      {r.momoTrack !== r.track ? r.momoTrack : ""}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.matchedBy === "productID"        && "productID (CG…)"}
                      {r.matchedBy === "productTracking"  && "productTracking"}
                      {r.matchedBy === null               && "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {r.matched ? r.productCBMAll.toFixed(5) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {r.matched ? r.productWeightAll.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {r.matched ? (
                        <span className="rounded-full border border-green-200 bg-green-50 text-green-700 px-2 py-0.5 text-[10px] font-medium">
                          พบ
                        </span>
                      ) : (
                        <span className="rounded-full border border-yellow-200 bg-yellow-50 text-yellow-700 px-2 py-0.5 text-[10px] font-medium">
                          ไม่พบ
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Raw MOMO payload (collapsible) */}
      <details className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <summary className="cursor-pointer p-4 text-sm font-semibold">
          Raw MOMO sack-info payload
        </summary>
        <pre className="px-4 pb-4 text-xs overflow-x-auto font-mono">
{JSON.stringify(data.sackInfo, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Tile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p className={`mt-1 text-base font-bold ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function fmtKg(n: number): string {
  if (!Number.isFinite(n)) return "0.00 kg";
  return `${n.toFixed(2)} kg`;
}
