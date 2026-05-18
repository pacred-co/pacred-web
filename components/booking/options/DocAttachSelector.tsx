"use client";

/**
 * BK-1 selector #4 — Attach documents.
 *
 * Per `docs/research/booking-flow-system-2026-05-18.md` §4.3 row 4: a
 * typed-slot list (invoice / packing list / certificate / ภพ.20 /
 * บัตรประชาชน / passport) with file inputs. BK-1 is a PLACEHOLDER — the
 * spec says: "Reuses the `member-docs` private-bucket pattern (§6.2)"
 * but BK-1 keeps the upload pipe as a TODO. The selector returns a
 * `documentIds[]` string array (BK-1 will hold an empty list until the
 * upload pipe is wired in BK-1.5).
 */

import { Paperclip, FileText, UploadCloud } from "lucide-react";

interface DocSlot {
  /** Stable key — maps to documents.kind on upload (BK-1.5). */
  key: string;
  /** i18n-key: booking.selector.doc_attach.slot.<key> */
  labelTh: string;
}

const SLOTS: DocSlot[] = [
  { key: "invoice", labelTh: "ใบกำกับสินค้า (Invoice)" },
  { key: "packing_list", labelTh: "Packing List" },
  { key: "certificate", labelTh: "Certificate / Form E" },
  { key: "vat20", labelTh: "ภพ.20" },
  { key: "id_card", labelTh: "บัตรประชาชน" },
  { key: "passport", labelTh: "พาสปอร์ต" },
];

interface DocAttachSelectorProps {
  documentIds: string[];
  onChange: (next: string[]) => void;
}

export function DocAttachSelector({ documentIds, onChange }: DocAttachSelectorProps) {
  // BK-1 STUB — the input only registers a "selected" placeholder per slot
  // by pushing a synthetic id. Real upload to member-docs is wired in
  // BK-1.5 alongside actions/bookings draft creation. Keeping the shape
  // matches what the action contract expects.
  function onFileChosen(slotKey: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    // TODO BK-1.5: wire to documents bucket — for now, mark slot selected
    //              with a placeholder id so the parent sees a non-empty
    //              array (visual confirmation).
    const placeholder = `pending:${slotKey}:${files[0].name}`;
    if (documentIds.includes(placeholder)) return;
    onChange([...documentIds.filter((d) => !d.startsWith(`pending:${slotKey}:`)), placeholder]);
  }

  function chosenForSlot(slotKey: string): string | null {
    return documentIds.find((d) => d.startsWith(`pending:${slotKey}:`)) ?? null;
  }

  function clearSlot(slotKey: string) {
    onChange(documentIds.filter((d) => !d.startsWith(`pending:${slotKey}:`)));
  }

  return (
    <fieldset className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
      <legend className="px-2 inline-flex items-center gap-2 text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white">
        <Paperclip className="w-4 h-4 text-primary-600" strokeWidth={2.6} />
        {/* i18n-key: booking.selector.doc_attach.title */}
        แนบเอกสาร
        <span className="ml-1.5 inline-flex items-center px-1.5 h-[18px] rounded-md bg-amber-100 text-amber-800 text-[9.5px] font-black tracking-wide dark:bg-amber-900/40 dark:text-amber-200">
          BK-1 placeholder
        </span>
      </legend>
      <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
        {/* i18n-key: booking.selector.doc_attach.help */}
        แนบเอกสารคร่าวๆให้ทีม — ยังไม่ส่งจริงในเวอร์ชันนี้ (BK-1.5 จะอัปโหลดเข้า member-docs)
      </p>

      <ul className="mt-4 grid grid-cols-1 gap-2">
        {SLOTS.map((slot) => {
          const chosen = chosenForSlot(slot.key);
          const inputId = `doc-${slot.key}`;
          return (
            <li
              key={slot.key}
              className="flex items-center gap-3 rounded-xl border border-border bg-white dark:bg-surface px-3 py-2.5 min-h-[44px]"
            >
              <FileText
                className={`w-4 h-4 shrink-0 ${chosen ? "text-primary-600" : "text-muted"}`}
                strokeWidth={2.4}
              />
              <div className="flex-1 min-w-0">
                <label
                  htmlFor={inputId}
                  className="block text-[12.5px] md:text-[13px] font-bold text-foreground cursor-pointer"
                >
                  {slot.labelTh}
                </label>
                {chosen && (
                  <p className="text-[11px] md:text-[11.5px] text-muted font-medium truncate">
                    {chosen.replace(`pending:${slot.key}:`, "")}
                  </p>
                )}
              </div>
              <input
                id={inputId}
                type="file"
                className="sr-only"
                onChange={(e) => onFileChosen(slot.key, e.target.files)}
              />
              {chosen ? (
                <button
                  type="button"
                  onClick={() => clearSlot(slot.key)}
                  className="h-9 px-3 rounded-lg text-[11.5px] font-bold text-muted hover:text-primary-600 transition-colors"
                >
                  ลบ
                </button>
              ) : (
                <label
                  htmlFor={inputId}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-white dark:bg-surface text-foreground hover:border-primary-300 hover:text-primary-600 transition-colors text-[11.5px] font-bold cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" strokeWidth={2.6} />
                  เลือก
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
