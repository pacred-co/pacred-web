"use client";

/**
 * <DimensionAuditPanel> — "ใครไปแก้ขนาด/คิว และเมื่อไร"
 * (owner 2026-08-03: "เอา audit log ที่มีคนไปเปลี่ยนขนาดมาขึ้นบอกเลยครับ ใครและเมื่อไร
 *  จะได้ไปสอบถามกันถูกคนครับว่าเพราะอะไร แนะ กันทุจริต ได้ด้วยครับ").
 *
 * DISPLAY-ONLY — ไม่มีปุ่มที่เขียนอะไรเลย ทั้งคอมโพเนนต์ (ตรวจสอบอย่างเดียว).
 *
 * โชว์ 2 ชั้น:
 *   1. ป้ายเตือนแดง — เฉพาะแถวที่ severity = alert (คิวถูกแก้ให้เล็กกว่าที่ MOMO วัด
 *      ⇒ เก็บลูกค้าต่ำกว่าที่เราจ่าย MOMO) พร้อมเลขเงินที่ขาด
 *   2. ดรอปดาว "ประวัติการแก้ขนาด (N ครั้ง)" — ตารางเต็ม: เวลาไทย · ชื่อคน (ล็อกอิน) ·
 *      ขนาดก่อน→หลัง · คิวก่อน→หลัง · ป้าย "ไม่เปลี่ยนค่า" สำหรับครั้งที่กดเซฟซ้ำ
 *
 * ทำไมต้องมีป้าย "ไม่เปลี่ยนค่า": prod มีการกดบันทึก 1,661 ครั้ง แต่คิวเปลี่ยนจริง
 * แค่ 104 ครั้ง — ถ้าโชว์เลขดิบ "แก้ 8 ครั้ง" คนอ่านจะตกใจฟรีและหาตัวจริงไม่เจอ.
 *
 * ⚠️ เวลาทุกจุด render ผ่าน `formatThaiDateTime` เท่านั้น — `created_at` เก็บ UTC
 * (ถ้า toLocaleString ดิบ จะเพี้ยน 7 ชม. · learning timezone-utc-columns 2026-07-28).
 *
 * §0g self-explaining row · §0h ตัวอักษรขั้นต่ำ 11px · ตารางกว้าง = overflow-x-auto.
 */

import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import {
  describeEditor,
  type DimensionAuditEntry,
  type DimensionAuditSummary,
} from "@/lib/admin/dimension-audit-verdict";

export type DimensionAuditRowView = {
  /** tb_forwarder.id */
  fid: number;
  /** เลขแทรคกิ้งของแถวนั้น (ให้รู้ว่าประวัตินี้เป็นของกล่องไหน) */
  tracking: string;
  entries: DimensionAuditEntry[];
  summary: DimensionAuditSummary;
};

/** คิว — โชว์ทศนิยมเท่าที่มีจริง (สูงสุด 6) เพื่อไม่กลบส่วนต่างเล็กๆ */
function fmtCbm(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const s = n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return s.includes(".") ? s : `${s}.00`;
}

/** ขนาด ซม. — ตัดทศนิยมที่ไม่จำเป็นทิ้ง (83 ไม่ใช่ 83.00) */
function fmtDim(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n * 100) / 100);
}

function dims(e: DimensionAuditEntry, side: "before" | "after"): string {
  const s = e[side];
  return `${fmtDim(s.width)}×${fmtDim(s.length)}×${fmtDim(s.height)}`;
}

const TH = "px-2 py-1.5 text-[11px] font-semibold text-muted whitespace-nowrap border-b border-border text-left";
const TD = "px-2 py-1.5 text-[11px] whitespace-nowrap align-top";

export function DimensionAuditPanel({ rows }: { rows: DimensionAuditRowView[] }) {
  // ไม่เคยมีใครแก้เลย = ไม่ต้องโชว์อะไร (อย่ารกจอ)
  if (rows.length === 0) return null;

  const alerts = rows.filter((r) => r.summary.severity === "alert");

  return (
    <div className="space-y-2">
      {/* ── 1. ป้ายเตือน — คิวถูกแก้ให้เล็กกว่าที่ MOMO วัด = เก็บลูกค้าขาด ── */}
      {alerts.length > 0 && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2.5">
          <p className="text-[13px] font-bold text-red-800">
            🚨 ตรวจพบการแก้คิวที่ทำให้เก็บเงินลูกค้าต่ำกว่าที่จ่าย MOMO ({alerts.length} แทรคกิง)
          </p>
          <ul className="mt-1.5 space-y-1">
            {alerts.map((r) => (
              <li key={r.fid} className="text-[12px] leading-relaxed text-red-800">
                <span className="font-mono font-semibold">{r.tracking || `#${r.fid}`}</span>
                <span className="mx-1">—</span>
                <span>{r.summary.messageTh}</span>
                {r.summary.lastRealChange && (
                  <span className="ml-1 text-[11px] text-red-700/80">
                    · เมื่อ {formatThaiDateTime(r.summary.lastRealChange.at)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-red-700">
            เงินที่ขาด = (คิว MOMO − คิวระบบ) × เรทขาย ฿/คิว ของแถวนั้น (ประเมินจากเรทเดียวกับที่ระบบใช้คิดราคา) ·
            ดูรายละเอียดว่าใครแก้ตอนไหนได้ที่ “ประวัติการแก้ขนาด” ด้านล่าง
          </p>
        </div>
      )}

      {/* ── 2. ดรอปดาวประวัติ — หนึ่งอันต่อแทรคกิง ── */}
      {rows.map((r) => {
        const s = r.summary;
        const tone =
          s.severity === "alert"
            ? "border-red-300 bg-red-50/50"
            : s.severity === "watch"
              ? "border-amber-300 bg-amber-50/40"
              : "border-border bg-surface-alt/30";
        const dot = s.severity === "alert" ? "🔴" : s.severity === "watch" ? "🟡" : "⚪";
        return (
          <details key={r.fid} className={`rounded-lg border ${tone} [&_summary]:list-none`}>
            <summary className="flex cursor-pointer select-none flex-wrap items-center gap-1.5 px-3 py-2 text-[12px] hover:bg-black/[0.03]">
              <span className="text-[11px]">▸</span>
              <span>{dot}</span>
              <span className="font-semibold text-foreground">ประวัติการแก้ขนาด</span>
              <span className="font-mono text-[11px] text-muted">{r.tracking || `#${r.fid}`}</span>
              <span className="text-[11px] text-muted">
                — กดบันทึก {s.totalEdits} ครั้ง
                {s.realChanges > 0
                  ? ` · เปลี่ยนค่าจริง ${s.realChanges} ครั้ง`
                  : " · ไม่เคยเปลี่ยนค่า"}
              </span>
              {s.lastRealChange && (
                <span className="text-[11px] text-muted">
                  · ล่าสุด {describeEditor(s.lastRealChange)} {formatThaiDateTime(s.lastRealChange.at)}
                </span>
              )}
            </summary>

            <div className="px-3 pb-3">
              <p className="mb-2 text-[11px] text-muted">{s.messageTh}</p>

              {/* คิวปัจจุบัน vs MOMO — บริบทที่ทำให้อ่านประวัติแล้วตัดสินได้ทันที */}
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span>
                  คิวในระบบตอนนี้:{" "}
                  <b className="font-mono tabular-nums">
                    {s.currentCbm == null ? "—" : fmtCbm(s.currentCbm)}
                  </b>
                </span>
                <span>
                  คิวที่ MOMO วัด:{" "}
                  <b className="font-mono tabular-nums">
                    {s.momoCbm == null ? "— (ไม่มีข้อมูลเทียบ)" : fmtCbm(s.momoCbm)}
                  </b>
                </span>
                {s.momoCbm != null && s.currentCbm != null && (
                  <span className={s.cbmShortfall > 0 ? "text-red-700 font-medium" : "text-muted"}>
                    ต่างกัน:{" "}
                    <b className="font-mono tabular-nums">
                      {s.cbmShortfall > 0 ? "−" : s.cbmShortfall < 0 ? "+" : ""}
                      {fmtCbm(Math.abs(s.cbmShortfall))}
                    </b>{" "}
                    คิว
                  </span>
                )}
              </div>

              <div className="overflow-x-auto scrollbar-x-visible rounded-md border border-border bg-white dark:bg-surface">
                <table className="w-full">
                  <thead className="bg-surface-alt/60">
                    <tr>
                      <th className={TH}>เวลา (ไทย)</th>
                      <th className={TH}>ผู้แก้ไข</th>
                      <th className={TH}>ขนาด ก×ย×ส (ซม.)</th>
                      <th className={TH}>คิว (CBM)</th>
                      <th className={TH}>ผล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.entries.map((e, i) => (
                      <tr
                        key={`${e.at}-${i}`}
                        className={`border-t border-border ${e.changed ? "" : "opacity-60"}`}
                      >
                        <td className={`${TD} font-mono tabular-nums`}>{formatThaiDateTime(e.at)}</td>
                        <td className={TD}>
                          <span className="font-medium text-foreground">
                            {e.adminName || "ไม่ทราบชื่อ"}
                          </span>
                          {e.adminLogin && (
                            <span className="ml-1 font-mono text-[11px] text-muted">({e.adminLogin})</span>
                          )}
                        </td>
                        <td className={`${TD} font-mono tabular-nums`}>
                          {dims(e, "before")}
                          <span className="mx-1 text-muted">→</span>
                          <span className={e.changed ? "font-semibold" : ""}>{dims(e, "after")}</span>
                        </td>
                        <td className={`${TD} font-mono tabular-nums`}>
                          {fmtCbm(e.before.cbm)}
                          <span className="mx-1 text-muted">→</span>
                          <span className={e.changed ? "font-semibold" : ""}>{fmtCbm(e.after.cbm)}</span>
                          {e.changed && e.cbmDelta !== 0 && (
                            <span
                              className={`ml-1.5 text-[11px] font-medium ${e.cbmDelta < 0 ? "text-red-600" : "text-emerald-600"}`}
                            >
                              ({e.cbmDelta < 0 ? "−" : "+"}
                              {fmtCbm(Math.abs(e.cbmDelta))})
                            </span>
                          )}
                        </td>
                        <td className={TD}>
                          {e.changed ? (
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                e.cbmDelta < 0
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {e.cbmDelta < 0 ? "คิวลดลง" : e.cbmDelta > 0 ? "คิวเพิ่มขึ้น" : "แก้ขนาด"}
                            </span>
                          ) : (
                            <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              ไม่เปลี่ยนค่า
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-1.5 text-[11px] text-muted">
                “ไม่เปลี่ยนค่า” = กดบันทึกซ้ำโดยค่าเท่าเดิม (ไม่ใช่การแก้ข้อมูล) ·
                ประวัตินี้อ่านจาก admin_audit_log อย่างเดียว ไม่มีการแก้ไขใดๆ จากหน้านี้
              </p>
            </div>
          </details>
        );
      })}
    </div>
  );
}
