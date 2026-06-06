"use client";

/**
 * BK-1.5 (G1) — booking attachment uploader, rendered on the REVIEW step
 * (post-auth-gate).  Wires:
 *
 *   - actions/bookings.ts:uploadBookingDocument
 *   - actions/bookings.ts:removeBookingDocument
 *   - actions/bookings.ts:listBookingDocuments
 *
 * Each of the 6 slots accepts ONE file per slot (re-uploading replaces the
 * previous file for that slot).  Files are stored under
 * `member-docs/{user_id}/booking/{bookingId}/{kind}-{ts}-{filename}` and
 * appear on the admin booking detail page.
 *
 * Mobile-first: stacked layout, 44px tap targets, no horizontal scroll.
 */

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Paperclip, FileText, UploadCloud, Loader2, X, Download } from "lucide-react";
import {
  listBookingDocuments,
  removeBookingDocument,
  uploadBookingDocument,
} from "@/actions/bookings";
import { confirm } from "@/components/ui/confirm";
import type { BookingDocKind, BookingDocument } from "@/types/booking";

interface DocSlot {
  key: BookingDocKind;
  labelTh: string;
  hintTh?: string;
}

const SLOTS: DocSlot[] = [
  { key: "booking_invoice",       labelTh: "ใบกำกับสินค้า (Invoice)",   hintTh: "ถ้ามีจากคู่ค้าจีน" },
  { key: "booking_packing_list",  labelTh: "Packing List",              hintTh: "รายการบรรจุภัณฑ์" },
  { key: "booking_certificate",   labelTh: "Certificate / Form E",      hintTh: "ใช้ลดภาษีนำเข้า" },
  { key: "booking_vat_paw20",     labelTh: "ภพ.20",                     hintTh: "นิติบุคคล" },
  { key: "booking_national_id",   labelTh: "บัตรประชาชน",                hintTh: "บุคคลธรรมดา" },
  { key: "booking_passport",      labelTh: "พาสปอร์ต",                   hintTh: "ชาวต่างชาติ" },
];

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — keep in sync with action

interface BookingDocUploaderProps {
  bookingId: string;
}

export function BookingDocUploader({ bookingId }: BookingDocUploaderProps) {
  const t = useTranslations("booking");
  const [docs, setDocs] = useState<BookingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Per-slot pending state (so each slot has its own spinner).
  const [pendingSlot, setPendingSlot] = useState<BookingDocKind | null>(null);
  const [, startTransition] = useTransition();

  // Initial load — fetch any pre-existing attachments (e.g. customer came
  // back to the review step after browser refresh).  Loading state is
  // initialised true via useState, so no synchronous setState here
  // (lint: react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    listBookingDocuments(bookingId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setDocs(res.data.documents);
        else setErrorMsg(translateErr(res.error));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMsg("network_error");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  function onSlotFile(kind: BookingDocKind, files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > MAX_BYTES) {
      setErrorMsg(`ไฟล์ใหญ่เกิน ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB`);
      return;
    }
    setErrorMsg(null);
    setPendingSlot(kind);
    startTransition(async () => {
      const res = await uploadBookingDocument(bookingId, kind, file);
      if (res.ok) {
        // Replace any existing doc for this slot with the new one.
        setDocs((prev) => [...prev.filter((d) => d.kind !== kind), res.data]);
      } else {
        setErrorMsg(translateErr(res.error));
      }
      setPendingSlot(null);
    });
  }

  async function onRemove(doc: BookingDocument) {
    if (!(await confirm(`ลบไฟล์ "${storageBasename(doc.storagePath)}"?`))) return;
    setErrorMsg(null);
    setPendingSlot(doc.kind);
    startTransition(async () => {
      const res = await removeBookingDocument(doc.id);
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      } else {
        setErrorMsg(translateErr(res.error));
      }
      setPendingSlot(null);
    });
  }

  function docForSlot(kind: BookingDocKind): BookingDocument | undefined {
    return docs.find((d) => d.kind === kind);
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <div className="flex items-start gap-2">
        <Paperclip className="w-5 h-5 text-primary-600 mt-0.5" strokeWidth={2.6} />
        <div>
          <h3 className="text-sm font-bold text-foreground">
            {/* i18n-key: booking.review.documents.title */}
            {t("selectors.docAttach.label")}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {/* i18n-key: booking.review.documents.subtitle */}
            แนบเอกสารที่มี (PDF / รูปภาพ ≤ 10 MB) — ทีมขายใช้พิจารณาราคาจริงได้แม่นยำขึ้น
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          กำลังโหลดเอกสารที่แนบ…
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SLOTS.map((slot) => {
            const doc = docForSlot(slot.key);
            const inputId = `bk-doc-${slot.key}`;
            const isPending = pendingSlot === slot.key;
            return (
              <li
                key={slot.key}
                className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 min-h-[44px] transition-colors ${
                  doc
                    ? "border-primary-200 bg-primary-50/40 dark:bg-primary-950/20"
                    : "border-border bg-surface-alt/30 dark:bg-surface-alt/10"
                }`}
              >
                <div className="flex items-start gap-2">
                  <FileText
                    className={`w-4 h-4 shrink-0 mt-0.5 ${doc ? "text-primary-600" : "text-muted"}`}
                    strokeWidth={2.4}
                  />
                  <div className="flex-1 min-w-0">
                    <label htmlFor={inputId} className="text-[12.5px] font-bold text-foreground cursor-pointer block">
                      {slot.labelTh}
                    </label>
                    {slot.hintTh && !doc && (
                      <p className="text-[11px] text-muted">{slot.hintTh}</p>
                    )}
                    {doc && (
                      <p className="text-[11px] text-muted truncate" title={storageBasename(doc.storagePath)}>
                        {storageBasename(doc.storagePath)}{" "}
                        {doc.sizeBytes ? `· ${formatBytes(doc.sizeBytes)}` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  <input
                    id={inputId}
                    type="file"
                    className="sr-only"
                    accept="image/*,application/pdf"
                    onChange={(e) => onSlotFile(slot.key, e.target.files)}
                    disabled={isPending}
                  />
                  {doc?.signedUrl && (
                    <a
                      href={doc.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-white dark:bg-surface text-foreground hover:bg-surface-alt text-[11px] font-semibold"
                    >
                      <Download className="w-3 h-3" strokeWidth={2.6} />
                      ดู
                    </a>
                  )}
                  {doc && (
                    <button
                      type="button"
                      onClick={() => onRemove(doc)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-red-200 bg-white dark:bg-surface text-red-700 hover:bg-red-50 text-[11px] font-semibold disabled:opacity-50"
                    >
                      <X className="w-3 h-3" strokeWidth={2.6} />
                      ลบ
                    </button>
                  )}
                  <label
                    htmlFor={inputId}
                    className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-md border text-[11px] font-bold cursor-pointer ${
                      isPending
                        ? "border-border bg-surface-alt text-muted cursor-wait"
                        : doc
                        ? "border-primary-300 bg-white dark:bg-surface text-primary-600 hover:bg-primary-50"
                        : "border-primary-300 bg-primary-600 text-white hover:bg-primary-700"
                    }`}
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        กำลังอัปโหลด…
                      </>
                    ) : doc ? (
                      <>
                        <UploadCloud className="w-3 h-3" strokeWidth={2.6} />
                        เปลี่ยน
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-3 h-3" strokeWidth={2.6} />
                        แนบ
                      </>
                    )}
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {errorMsg && (
        <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          ⚠ {errorMsg}
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function storageBasename(path: string): string {
  const idx = path.lastIndexOf("/");
  const base = idx >= 0 ? path.slice(idx + 1) : path;
  // Strip the `<kind>-<ts>-` prefix so the customer sees their original filename.
  return base.replace(/^[a-z_]+-\d+-/, "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function translateErr(err: string): string {
  if (err === "auth_required") return "กรุณาเข้าสู่ระบบก่อนแนบเอกสาร";
  if (err === "forbidden_not_owner") return "การจองนี้ไม่ใช่ของคุณ";
  if (err === "booking_not_found") return "ไม่พบการจอง";
  if (err.startsWith("booking_terminal:")) return "การจองนี้ปิดแล้ว — ไม่สามารถแนบเอกสารเพิ่ม";
  if (err.startsWith("file_too_large_max_")) return `ไฟล์ใหญ่เกิน ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB`;
  if (err.startsWith("unsupported_mime:")) return "ประเภทไฟล์ไม่รองรับ — ใช้ PDF หรือรูปภาพ";
  if (err === "no_file" || err === "empty_file") return "กรุณาเลือกไฟล์";
  if (err === "invalid_doc_kind") return "ชนิดเอกสารไม่ถูกต้อง";
  if (err === "not_found") return "ไม่พบเอกสาร — อาจถูกลบไปแล้ว";
  if (err === "not_a_booking_document") return "เอกสารนี้ไม่ใช่ของการจอง";
  if (err === "network_error") return "เครือข่ายมีปัญหา — ลองรีเฟรชหน้าใหม่";
  return `เกิดข้อผิดพลาด: ${err}`;
}
