"use client";

/**
 * V-E11 — small client button used inside the shipment-detail page to
 * spawn a draft customs declaration for the current shipment. The
 * action is RBAC-gated (super + accounting only); other roles see a
 * disabled button explaining why.
 *
 * Kept in its own file so the parent server page can pass declaration
 * type via a select control while staying mostly server-rendered.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateDeclaration } from "@/actions/admin/customs-declarations";
import {
  CUSTOMS_DECLARATION_TYPES,
  CUSTOMS_DECLARATION_TYPE_LABEL,
  type CustomsDeclarationType,
} from "@/lib/validators/customs-declaration";

export function DeclarationCreateButton({
  shipmentId, allowedToCreate,
}: {
  shipmentId:       string;
  allowedToCreate:  boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen]   = useState(false);
  const [kind, setKind]   = useState<CustomsDeclarationType>("import");
  const [err, setErr]     = useState<string | null>(null);

  if (!allowedToCreate) {
    return (
      <button
        type="button"
        disabled
        title="ต้องเป็น super หรือ accounting จึงจะสร้างใบขนฯ ได้"
        className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-muted cursor-not-allowed"
      >
        📋 สร้างใบขนสินค้า (read-only)
      </button>
    );
  }

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await adminCreateDeclaration({
        freight_shipment_id: shipmentId,
        declaration_type:    kind,
      });
      if (res.ok && res.data?.id) {
        setOpen(false);
        router.push(`/admin/freight/declarations/${res.data.id}`);
      } else {
        setErr(translate(res.ok ? "unknown" : res.error));
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700"
      >
        📋 สร้างใบขนสินค้า (V-E11)
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2 text-xs max-w-xs">
      <p className="font-bold">ประเภทใบขนสินค้า</p>
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as CustomsDeclarationType)}
        className="w-full rounded border border-border bg-white px-2 py-1.5"
      >
        {CUSTOMS_DECLARATION_TYPES.map((t) => (
          <option key={t} value={t}>{CUSTOMS_DECLARATION_TYPE_LABEL[t]}</option>
        ))}
      </select>
      <p className="text-[10px] text-muted">
        จะ seed รายการสินค้าจาก commercial invoice ของงานนี้ (ถ้ามี) — แก้ไขได้หลังสร้าง
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={fire}
          disabled={pending}
          className="rounded bg-primary-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "..." : "✓ สร้าง"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); }}
          disabled={pending}
          className="rounded border border-border bg-white px-3 py-1.5 text-[11px] hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
      {err && <p className="text-red-700">{err}</p>}
    </div>
  );
}

function translate(code: string): string {
  if (code.startsWith("existing_declaration")) return "งานนี้มีใบขนฯ อยู่แล้ว — ยกเลิกใบเก่าก่อน";
  if (code.startsWith("insert_failed"))        return `บันทึกล้มเหลว: ${code}`;
  switch (code) {
    case "shipment_not_found":    return "ไม่พบ shipment";
    case "shipment_cancelled":    return "shipment ถูกยกเลิกแล้ว";
    case "invalid_input":         return "ข้อมูลไม่ถูกต้อง";
    default:                      return code;
  }
}
