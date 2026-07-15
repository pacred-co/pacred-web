"use client";

/**
 * STEP-2 doc-number panel (2026-07-07 · legacy create-f-receipt table · ปอน 2026-07-15)
 * — the "ออกเลขบิล" step, shown after round-1 on the two settle surfaces:
 *   • /admin/wallet/[id]      — a ฝากนำเข้า DIRECT forwarder-slip (approve).
 *   • /admin/billing-run/[id] — a ใบวางบิล (FRI) mark-paid.
 *
 * Layout ported 1:1 from legacy PCS create-f-receipt (2-col label/value table ·
 * เลขที่ใบแจ้งหนี้ที่อ้างอิง · เลขที่เอกสารฉบับนี้ [editable rID + dup-check] ·
 * เลขที่เอกสารก่อนหน้า · เวลาในสลิปก่อนหน้า · วันที่ออกเอกสารนี้ · ประเภทสมาชิก ·
 * เลขผู้เสียภาษี · ชื่อ · ที่อยู่ · หัก ณ ที่จ่าย · ผู้อนุมัติ).
 *
 * READ-only server calls only (previewReceiptDocNo · checkReceiptRidAvailable).
 * The chosen rID flows up via `onOverrideRidChange`:
 *   - null  → keep the suggestion → the settle auto-mints (MAX+1 · race-free).
 *   - "..." → the admin hand-edited the เลขที่ → passed as overrideRid to the
 *             settle, which re-validates it unique server-side before insert.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, Loader2, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  previewReceiptDocNo,
  checkReceiptRidAvailable,
  type ReceiptDocNoPreview,
} from "@/actions/admin/wallet-hs";

/** Legacy stamp: `2026-07-15 09:33:00` — Gregorian, to the second (matches PCS). */
function fmtDT(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** One legacy label/value row — rose label cell (right-aligned) + zebra value cell. */
function Row({ label, children, alt = false }: { label: string; children: ReactNode; alt?: boolean }) {
  return (
    <tr>
      <td className="w-[44%] whitespace-nowrap border-b border-border/50 bg-primary-50 px-3 py-2 text-right align-top font-medium text-muted dark:bg-primary-500/10">
        {label}
      </td>
      <td className={`border-b border-border/50 px-3 py-2 align-top text-foreground ${alt ? "bg-surface-alt/25" : ""}`}>
        {children}
      </td>
    </tr>
  );
}

export function ReceiptDocNoEditor({
  userid,
  dateSlipIso,
  onOverrideRidChange,
  fid,
  disabled = false,
}: {
  userid: string;
  dateSlipIso: string | null;
  /** null = keep the auto-mint suggestion · string = admin-picked เลขที่. */
  onOverrideRidChange: (overrideRid: string | null) => void;
  /** Optional — a representative forwarder id for the "ดูตัวอย่างใบเสร็จ" link. */
  fid?: number;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<ReceiptDocNoPreview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [rid, setRid] = useState<string>("");
  const [avail, setAvail] = useState<"unknown" | "checking" | "free" | "taken">("unknown");
  // Stored in state (not a ref) so the "ใช้เลขที่ระบบแนะนำ (X)" hint can read it
  // during render without touching a ref value in render.
  const [defaultRid, setDefaultRid] = useState<string>("");
  const checkSeq = useRef(0);

  // Load the preview once (per userid/date). All setState happens async in the
  // resolved promise (not synchronously in the effect body).
  useEffect(() => {
    let alive = true;
    previewReceiptDocNo({ userid, dateSlipIso })
      .then((res) => {
        if (!alive) return;
        if (res.ok && res.data) {
          setPreview(res.data);
          setDefaultRid(res.data.nextRid);
          setRid(res.data.nextRid);
          setAvail("free"); // MAX+1 is unused by construction
          onOverrideRidChange(null); // suggestion kept → auto-mint
        } else {
          setLoadErr(res.ok ? "no_preview_data" : res.error);
        }
      })
      .catch((e) => { if (alive) setLoadErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
    // onOverrideRidChange intentionally excluded — one-shot load, avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userid, dateSlipIso]);

  function onRidInput(next: string) {
    const v = next.trim();
    setRid(next);
    const isDefault = v === defaultRid;
    // Emit null when unchanged (auto-mint · race-free); else the override value.
    onOverrideRidChange(isDefault || v === "" ? null : v);

    if (isDefault) { setAvail("free"); return; }
    if (v === "") { setAvail("unknown"); return; }
    const seq = ++checkSeq.current;
    setAvail("checking");
    window.setTimeout(() => {
      if (seq !== checkSeq.current) return;
      checkReceiptRidAvailable({ rid: v }).then((res) => {
        if (seq !== checkSeq.current) return;
        if (res.ok && res.data) setAvail(res.data.available ? "free" : "taken");
        else setAvail("unknown");
      }).catch(() => { if (seq === checkSeq.current) setAvail("unknown"); });
    }, 350);
  }

  return (
    <div className="overflow-hidden">
      {/* header — ออกเลขที่ใบเสร็จ + note (legacy create-f-receipt) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-alt/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary-600" />
          <h4 className="text-sm font-bold text-foreground">ออกเลขที่ใบเสร็จ (ก่อนตัดจ่าย)</h4>
        </div>
        <span className="text-[11px] text-muted">ระบบจะมีการสร้างใบเสร็จโดยอัตโนมัติ หากสถานะสำเร็จ</span>
      </div>

      {loadErr ? (
        <p className="px-3 py-3 text-[11px] text-red-700">โหลดเลขที่ใบเสร็จไม่สำเร็จ: {loadErr} · ระบบจะออกเลขอัตโนมัติตอนตัดจ่าย</p>
      ) : !preview ? (
        <p className="inline-flex items-center gap-1 px-3 py-3 text-[11px] text-muted">
          <Loader2 className="h-3 w-3 animate-spin" /> กำลังเตรียมเลขที่ใบเสร็จ…
        </p>
      ) : (
        <>
          <table className="w-full border-collapse text-[11.5px]">
            <tbody>
              <Row label="เลขที่ใบแจ้งหนี้ที่อ้างอิง">
                <span className="italic text-muted">กำลังพัฒนา</span>
              </Row>

              <Row label="เลขที่เอกสารฉบับนี้" alt>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={rid}
                    onChange={(e) => onRidInput(e.target.value)}
                    disabled={disabled}
                    className="w-40 rounded-md border border-primary-500 bg-white px-2.5 py-1.5 font-mono text-[13px] font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-50 dark:bg-surface"
                  />
                  <span className="text-[11px] font-semibold">
                    {avail === "checking" ? (
                      <span className="inline-flex items-center gap-1 text-muted"><Loader2 className="h-3 w-3 animate-spin" /> ตรวจ…</span>
                    ) : avail === "free" ? (
                      <span className="text-emerald-700">✓ ว่าง</span>
                    ) : avail === "taken" ? (
                      <span className="text-red-700">✕ ซ้ำ</span>
                    ) : null}
                  </span>
                  {rid.trim() !== defaultRid && defaultRid ? (
                    <button
                      type="button"
                      onClick={() => onRidInput(defaultRid)}
                      disabled={disabled}
                      title={`ใช้เลขที่ระบบแนะนำ ${defaultRid}`}
                      className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      ↺ ใช้เลขที่แนะนำ
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted">🛈 แก้ไขเลขที่ได้</span>
                  )}
                </div>
                {avail === "taken" ? (
                  <p className="mt-1 text-[11px] text-red-700">เลขที่นี้ถูกใช้แล้ว — เปลี่ยนเลขอื่น หรือกดใช้เลขที่ระบบแนะนำ ({defaultRid})</p>
                ) : null}
              </Row>

              <Row label="เลขที่เอกสารก่อนหน้าตามเวลานี้">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold text-foreground">{preview.previousRid ?? "— (รายแรกของเดือน)"}</span>
                  <Link
                    href="/admin/accounting/receipts"
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-md bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-600"
                  >
                    ไปยังประวัติใบเสร็จ →
                  </Link>
                </div>
              </Row>

              <Row label="เวลาในสลิปเอกสารก่อนหน้านี้" alt>
                <span className="font-mono text-foreground">{fmtDT(preview.previousIssueDate)}</span>
              </Row>

              <Row label="วันที่ออกเอกสารนี้">
                <span className="font-mono text-foreground">{fmtDT(dateSlipIso)}</span>
              </Row>

              <Row label="ประเภทสมาชิก" alt>
                <b className="text-foreground">{preview.corporate === 1 ? "นิติบุคคล" : "บุคคลธรรมดา"}</b>
                <span className="ml-1 text-muted">({preview.corporate === 1 ? "FRC" : "FRG"})</span>
              </Row>

              <Row label="เลขประจำตัวผู้เสียภาษีลูกค้า">
                <span className="font-mono text-foreground">{preview.recompNumber || "—"}</span>
              </Row>

              <Row label="ชื่อ-นามสกุลลูกค้า" alt>
                <span className="text-foreground">{preview.recompName || "—"}</span>
              </Row>

              <Row label="ที่อยู่ลูกค้า">
                <span className="text-foreground">{preview.recompAddress || "—"}</span>
              </Row>

              <Row label="ข้อมูลการหัก ณ ที่จ่าย" alt>
                <span className="text-muted">—</span>
              </Row>

              <Row label="ผู้อนุมัติเอกสาร">
                <span className="text-foreground">{preview.approver || "—"}</span>
              </Row>
            </tbody>
          </table>

          {fid ? (
            <div className="border-t border-border px-3 py-2">
              <Link
                href={`/service-import/${fid}/receipt`}
                target="_blank"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> ดูตัวอย่างใบเสร็จ
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
