"use client";

/**
 * STEP-2 doc-number panel (2026-07-07) — the missing legacy create-f-receipt
 * "ออกเลขบิล" step, shared by the two surfaces that issue a ใบเสร็จ at settle:
 *   • /admin/wallet/[id]      — a ฝากนำเข้า DIRECT forwarder-slip (approve).
 *   • /admin/billing-run/[id] — a ใบวางบิล (FRI) mark-paid.
 *
 * Shows the auto-mint suggestion for the ใบเสร็จ เลขที่ (rID) as an EDITABLE input
 * with a LIVE dup-check (legacy checkRIDF), the previous doc-no, the customer
 * identity, and the "ระบบจะสร้างใบเสร็จอัตโนมัติ" note.
 *
 * READ-only server calls only (previewReceiptDocNo · checkReceiptRidAvailable).
 * The chosen rID flows up via `onOverrideRidChange`:
 *   - null  → keep the suggestion → the settle auto-mints (MAX+1 · race-free).
 *   - "..." → the admin hand-edited the เลขที่ → passed as overrideRid to the
 *             settle, which re-validates it unique server-side before insert.
 */

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  previewReceiptDocNo,
  checkReceiptRidAvailable,
  type ReceiptDocNoPreview,
} from "@/actions/admin/wallet-hs";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", { dateStyle: "medium" });
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
  // Stored in state (not a ref) so the "กลับไปใช้เลขที่ระบบแนะนำ (X)" hint can read
  // it during render without touching a ref value in render.
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
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-indigo-700" />
        <h4 className="text-sm font-bold text-indigo-900">ออกเลขที่ใบเสร็จ (ก่อนตัดจ่าย)</h4>
      </div>

      {loadErr ? (
        <p className="text-[11px] text-red-700">โหลดเลขที่ใบเสร็จไม่สำเร็จ: {loadErr} · ระบบจะออกเลขอัตโนมัติตอนตัดจ่าย</p>
      ) : !preview ? (
        <p className="inline-flex items-center gap-1 text-[11px] text-muted">
          <Loader2 className="h-3 w-3 animate-spin" /> กำลังเตรียมเลขที่ใบเสร็จ…
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-1.5 text-[11px] text-indigo-900">
            <div>
              เลขที่เอกสารก่อนหน้า:{" "}
              <span className="font-mono font-semibold">{preview.previousRid ?? "— (รายแรกของเดือน)"}</span>
              {preview.previousIssueDate ? <span className="text-muted"> · {fmtDate(preview.previousIssueDate)}</span> : null}
            </div>
            <div>ประเภท: <span className="font-semibold">{preview.corporate === 1 ? "นิติบุคคล (FRC)" : "บุคคลธรรมดา (FRG)"}</span></div>
          </div>

          <label className="block">
            <span className="block text-[11px] font-semibold text-indigo-900 mb-1">เลขที่ใบเสร็จ (rID) — แก้ไขได้</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={rid}
                onChange={(e) => onRidInput(e.target.value)}
                disabled={disabled}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono disabled:opacity-50"
              />
              <span className="shrink-0 text-[11px] font-semibold">
                {avail === "checking" ? (
                  <span className="inline-flex items-center gap-1 text-muted"><Loader2 className="h-3 w-3 animate-spin" /> ตรวจ…</span>
                ) : avail === "free" ? (
                  <span className="text-emerald-700">✓ ว่าง</span>
                ) : avail === "taken" ? (
                  <span className="text-red-700">✕ ซ้ำ</span>
                ) : null}
              </span>
            </div>
            {avail === "taken" && (
              <p className="mt-1 text-[11px] text-red-700">เลขที่นี้ถูกใช้แล้ว — เปลี่ยนเลขอื่น หรือกลับไปใช้เลขที่ระบบแนะนำ ({defaultRid})</p>
            )}
          </label>

          <div className="rounded-lg border border-border bg-white/70 p-2 text-[11px] text-foreground space-y-0.5">
            <div className="font-semibold text-muted">ข้อมูลลูกค้าบนใบเสร็จ</div>
            {preview.recompNumber && <div>เลขผู้เสียภาษี: <span className="font-mono">{preview.recompNumber}</span></div>}
            <div>ชื่อ: {preview.recompName || "—"}</div>
            <div>ที่อยู่: {preview.recompAddress || "—"}</div>
            <div className="text-muted">ผู้อนุมัติ: {preview.approver || "—"}</div>
          </div>

          <p className="text-[11px] text-indigo-800">
            ระบบจะสร้างใบเสร็จอัตโนมัติ หากสถานะสำเร็จ (ตามเลขที่ + ข้อมูลข้างต้น)
          </p>
          {fid ? (
            <Link
              href={`/service-import/${fid}/receipt`}
              target="_blank"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> ดูตัวอย่างใบเสร็จ
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}
