"use client";

/**
 * UpgradeJuristicPopup — the in-header "อัพเกรดเป็นนิติบุคคล" control (owner
 * 2026-07-05). Sales + CS do this themselves, NO password/PIN unlock.
 *
 * Owner directive: move the บุคคล→นิติ upgrade UP into the header (right after
 * the ล่ามจีน/ทีม-Pricing area); clicking opens a popup to enter company info +
 * upload docs inline.
 *
 * NON-DISMISSIBLE popup (owner's other 2026-07-05 rule: a popup must NOT close
 * on an outside/backdrop click — a stray click can't discard a half-filled
 * upgrade form). This is a `fixed inset-0` overlay whose BACKDROP has NO
 * onClick-close; the only ways to close are the explicit ✕, ยกเลิก, or "เสร็จสิ้น"
 * buttons. (We deliberately do NOT use <PacredDialog> — it closes on backdrop.)
 *
 * Two-step flow inside the popup:
 *   1. Company info — reuses <ConvertToJuristicFormBody> (the SAME submit path
 *      as the /convert-to-juristic page · canonical action · notifies customer).
 *   2. After a successful convert the customer is a juristic with a tb_corporate
 *      row → we reveal the inline doc uploader (ภพ.20 / หนังสือรับรอง / บัตรกรรมการ /
 *      อื่นๆ) which appends to tb_corporate.corporate_docs. On close the page
 *      refreshes and the full "เอกสารนิติบุคคล" gallery renders (the customer is
 *      now juristic, so legacy-view shows CorporateEditor + CorporateDocGallery).
 *
 * RBAC: adminConvertToJuristic + adminUploadCorporateDoc are already gated to
 * the same role set that reaches the profile page (sales/sales_admin/ops/
 * accounting + god) with NO PIN — so this is reachable without any unlock.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConvertToJuristicFormBody } from "./convert-to-juristic/convert-to-juristic-form";
import { adminUploadCorporateDoc } from "@/actions/admin/customer-profile";
import { CORPORATE_DOC_TYPES, type CorporateDocType } from "@/lib/admin/corporate-docs";

const CORP_DOC_LABEL: Record<string, string> = {
  vat: "ภพ.20",
  affidavit: "หนังสือรับรองบริษัท",
  director_id: "บัตรกรรมการ",
  other: "เอกสารอื่นๆ",
};

export function UpgradeJuristicPopup({ userid }: { userid: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // "info" = fill company info · "docs" = converted, now attach documents.
  const [step, setStep] = useState<"info" | "docs">("info");

  // Doc-upload state (step 2).
  const [docType, setDocType] = useState<CorporateDocType>("vat");
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ type: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Lock body scroll while the modal is open (it can't be dismissed by click).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function openPopup() {
    setStep("info");
    setUploaded([]);
    setUploadError(null);
    setOpen(true);
  }

  function closePopup() {
    setOpen(false);
    // Refresh once on close so, after a convert, the page re-reads the juristic
    // state + renders the full CorporateEditor + CorporateDocGallery.
    router.refresh();
  }

  function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setBusy(true);
    const list = Array.from(files);
    (async () => {
      let firstErr: string | null = null;
      const ok: { type: string; name: string }[] = [];
      for (const f of list) {
        const fd = new FormData();
        fd.set("userid", userid);
        fd.set("docType", docType);
        fd.set("file", f);
        const res = await adminUploadCorporateDoc(fd);
        if (res.ok) ok.push({ type: docType, name: f.name });
        else if (!firstErr) firstErr = res.error;
      }
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (ok.length) setUploaded((prev) => [...prev, ...ok]);
      if (firstErr) setUploadError(firstErr);
      router.refresh();
    })();
  }

  return (
    <>
      {/* Header chip trigger — shown ONLY for a PERSONAL customer (parent gates). */}
      <button
        type="button"
        onClick={openPopup}
        className="inline-flex items-center gap-1 rounded-lg border border-primary-300 bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700 hover:bg-primary-100"
      >
        <Building2 className="h-3.5 w-3.5" /> อัพเกรดเป็นนิติบุคคล
      </button>

      {open && (
        // Non-dismissible overlay — the backdrop has NO onClick handler, so a
        // click outside the panel can't discard the form. Close via ✕/ยกเลิก only.
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="อัพเกรดเป็นนิติบุคคล"
            className="my-6 w-full max-w-lg rounded-2xl border border-border bg-white shadow-xl dark:bg-surface"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Building2 className="h-4 w-4 text-primary-600" />
                {step === "info" ? "อัพเกรดเป็นนิติบุคคล" : "แนบเอกสารนิติบุคคล"}
              </h3>
              <button
                type="button"
                onClick={closePopup}
                className="text-muted hover:text-foreground"
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-5 py-4">
              {step === "info" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted">
                    กรอกข้อมูลบริษัทเพื่อเปลี่ยนลูกค้ารายนี้เป็น <b>นิติบุคคล</b> — เสร็จแล้วแนบเอกสาร
                    (ภพ.20 / หนังสือรับรอง / บัตรกรรมการ) ในขั้นถัดไป
                  </p>
                  <ConvertToJuristicFormBody
                    userid={userid}
                    prefilledTaxId=""
                    prefilledCompanyName=""
                    prefilledCompanyAddress=""
                    hasExistingDraft={false}
                    compact
                    onSuccess={() => setStep("docs")}
                  />
                  <div className="flex justify-end border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={closePopup}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-surface-alt"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    ✓ เปลี่ยนเป็นนิติบุคคลแล้ว — แนบเอกสารนิติบุคคลด้านล่าง (ไม่บังคับ · แนบเพิ่มภายหลังได้ในหน้าโปรไฟล์)
                  </div>

                  {uploadError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {uploadError}
                    </div>
                  )}

                  {/* Upload row — ประเภท + เลือกไฟล์ (หลายไฟล์ได้) */}
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <span className="mb-1 block text-xs text-muted">ประเภทเอกสาร</span>
                      <select
                        value={docType}
                        disabled={busy}
                        onChange={(e) => setDocType(e.target.value as CorporateDocType)}
                        className="rounded-lg border border-border bg-white px-3 py-2 text-sm dark:bg-surface focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                      >
                        {CORPORATE_DOC_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {CORP_DOC_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                      disabled={busy}
                      onChange={(e) => onPickFiles(e.currentTarget.files)}
                      className="hidden"
                      id={`upgrade-corpdoc-${userid}`}
                    />
                    <label
                      htmlFor={`upgrade-corpdoc-${userid}`}
                      className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs ${
                        busy
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer border-primary-300 text-primary-700 hover:bg-primary-50"
                      }`}
                    >
                      <Plus className="h-3.5 w-3.5" />{" "}
                      {busy ? "กำลังอัปโหลด..." : "เลือกไฟล์ (หลายไฟล์ได้ · JPG/PNG/PDF ≤ 5MB)"}
                    </label>
                  </div>

                  {/* Uploaded-this-session list (the full gallery appears on the profile after close). */}
                  {uploaded.length > 0 && (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {uploaded.map((d, i) => (
                        <li key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 shrink-0">
                            {CORP_DOC_LABEL[d.type] ?? "เอกสาร"}
                          </span>
                          <span className="min-w-0 flex-1 truncate" title={d.name}>
                            {d.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex justify-end gap-2 border-t border-border pt-3">
                    <Button type="button" onClick={closePopup} disabled={busy}>
                      <Check className="size-4" /> เสร็จสิ้น
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
