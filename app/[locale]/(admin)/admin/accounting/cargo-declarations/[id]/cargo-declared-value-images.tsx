"use client";

/**
 * <CargoDeclaredValueImages> — multi-image evidence for a CARGO ใบขน line's
 * declared value (owner 2026-06-28 #2 "แนบรูปได้ด้วยก็ดี มากกว่า 1"). Supplier-
 * invoice / packing photos that justify the มูลค่าสำแดง. Uses the GENERIC
 * adminAddDeclarationLineImage / adminRemoveDeclarationLineImage actions (they
 * work for any customs_declaration_line · cargo or freight) — the keys live in
 * customs_declaration_lines.declared_value_images (mig 0222). Draft-only edit;
 * the server action re-checks. Mirrors the freight LineEvidence images block.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminAddDeclarationLineImage,
  adminRemoveDeclarationLineImage,
} from "@/actions/admin/customs-declarations";

export function CargoDeclaredValueImages({
  lineId,
  evidence,
  editable,
}: {
  lineId: string;
  evidence: Array<{ key: string; url: string | null }>;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("lineId", lineId);
    fd.set("file", file);
    startTransition(async () => {
      const res = await adminAddDeclarationLineImage(fd);
      if (res.ok) router.refresh();
      else alert(res.error ?? "แนบรูปไม่สำเร็จ");
    });
    e.target.value = "";
  }

  function removeImg(key: string) {
    startTransition(async () => {
      const res = await adminRemoveDeclarationLineImage({ lineId, imageKey: key });
      if (res.ok) router.refresh();
      else alert(res.error ?? "ลบรูปไม่สำเร็จ");
    });
  }

  if (!editable && evidence.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted">หลักฐานมูลค่า:</span>
      {evidence.map((e) => (
        <div key={e.key} className="relative">
          {e.url ? (
            <a href={e.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.url} alt="หลักฐานมูลค่าสำแดง" className="h-12 w-12 rounded border border-border object-cover" />
            </a>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded border border-border bg-surface-alt text-[11px] text-muted">รูป</div>
          )}
          {editable && (
            <button
              type="button"
              onClick={() => removeImg(e.key)}
              disabled={pending}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white hover:bg-red-700 disabled:opacity-50"
              title="ลบรูป"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {evidence.length === 0 && <span className="text-[11px] text-muted">ยังไม่มี</span>}
      {editable && (
        <label className="cursor-pointer rounded border border-dashed border-indigo-300 bg-white px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-50">
          + แนบรูป
          <input type="file" accept="image/*" onChange={onFile} disabled={pending} className="hidden" />
        </label>
      )}
    </div>
  );
}
