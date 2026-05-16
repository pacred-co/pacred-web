"use client";

/**
 * V-E10 — admin client form to record a new QA/QC inspection.
 *
 * Outcome flow:
 *   pass       → no damage / no missing fields required
 *   fail_minor → damage_level required + customer notified
 *   fail_major → damage_level required + customer notified + billing blocked
 *   waived     → super-only role at server side; reason required (≥5 chars)
 *
 * Photos uploaded AFTER row created (server returns id → we call uploadQaPhoto
 * for each file). Best-effort: if photo upload fails, the inspection row still
 * stands — admin can retry photo upload from the detail page.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQaInspection, uploadQaPhoto } from "@/actions/admin/qa-inspections";
import type { QaOutcome, QaDamageLevel } from "@/lib/validators/qa-inspection";

type Props = {
  cargoShipmentId: string;
  shipmentCode:    string;
};

const OUTCOME_OPTIONS: Array<{ value: QaOutcome; label: string; color: string }> = [
  { value: "pass",       label: "✅ ผ่าน — ส่งมอบได้",                   color: "border-green-300 bg-green-50" },
  { value: "fail_minor", label: "⚠️ ผิดเล็กน้อย — ส่งมอบได้แต่แจ้งลูกค้า", color: "border-yellow-300 bg-yellow-50" },
  { value: "fail_major", label: "🚨 ผิดสำคัญ — block ออกใบเสร็จ",        color: "border-red-300 bg-red-50" },
  { value: "waived",     label: "ℹ️ ยกเว้น (super only) — ระบุเหตุผล",   color: "border-gray-300 bg-gray-50" },
];

const DAMAGE_OPTIONS: Array<{ value: QaDamageLevel; label: string }> = [
  { value: "none",     label: "ไม่มี" },
  { value: "cosmetic", label: "ผิวภายนอกเสีย (cosmetic)" },
  { value: "partial",  label: "เสียบางส่วน (partial)" },
  { value: "total",    label: "เสียทั้งหมด (total)" },
];

export function NewInspectionForm({ cargoShipmentId, shipmentCode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<QaOutcome>("pass");
  const [damageLevel, setDamageLevel] = useState<QaDamageLevel>("none");
  const [missingItems, setMissingItems] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [waivedReason, setWaivedReason] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);

  void shipmentCode; // shown in parent header

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await createQaInspection({
        cargo_shipment_id: cargoShipmentId,
        outcome,
        damage_level:      outcome === "fail_minor" || outcome === "fail_major" ? damageLevel : undefined,
        missing_items:     missingItems,
        notes:             notes.trim() || undefined,
        waived_reason:     outcome === "waived" ? waivedReason.trim() : undefined,
      });
      if (!res.ok) {
        setErr(translateError(res.error));
        return;
      }

      // Upload photos (best-effort).
      const inspectionId = res.data!.id;
      for (const file of photos) {
        const upRes = await uploadQaPhoto(inspectionId, file);
        if (!upRes.ok) {
          // Don't bail — inspection already recorded.
          console.warn("photo upload failed", file.name, upRes.error);
        }
      }

      router.push(`/admin/warehouse/qa-inspections/${inspectionId}`);
      router.refresh();
    });
  }

  const needsDamageLevel = outcome === "fail_minor" || outcome === "fail_major";
  const needsWaivedReason = outcome === "waived";

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => { e.preventDefault(); fire(); }}
    >
      {/* Outcome */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-bold uppercase tracking-wide text-muted">ผลการตรวจ</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OUTCOME_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer text-sm ${
                outcome === o.value ? o.color + " font-bold" : "border-border hover:bg-surface-alt"
              }`}
            >
              <input
                type="radio"
                name="outcome"
                value={o.value}
                checked={outcome === o.value}
                onChange={() => setOutcome(o.value)}
                className="accent-primary-600"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      {needsDamageLevel && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted">ระดับความเสียหาย</legend>
          <select
            value={damageLevel}
            onChange={(e) => setDamageLevel(e.target.value as QaDamageLevel)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          >
            {DAMAGE_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold uppercase tracking-wide text-muted">ของหายไปกี่ชิ้น</legend>
        <input
          type="number"
          min={0}
          max={99999}
          value={missingItems}
          onChange={(e) => setMissingItems(Math.max(0, Number(e.target.value) || 0))}
          className="w-32 rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
        />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold uppercase tracking-wide text-muted">บันทึก / ข้อสังเกต</legend>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          placeholder="เช่น กล่องบุบเล็กน้อย, ของขาด 2 ชิ้นจาก 10, รูปประกอบ"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <p className="text-[10px] text-muted">{notes.length} / 2000 ตัวอักษร</p>
      </fieldset>

      {needsWaivedReason && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wide text-red-700">เหตุผลที่ยกเว้น (≥5 ตัวอักษร)</legend>
          <textarea
            rows={2}
            value={waivedReason}
            onChange={(e) => setWaivedReason(e.target.value)}
            maxLength={500}
            placeholder="เช่น ลูกค้ารับสภาพ, ทีมตัดสินใจ override, ..."
            className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm"
          />
          <p className="text-[10px] text-red-700">
            ⚠️ การยกเว้นต้องมีเหตุผล + จะถูกบันทึกใน admin_audit_log (super-only).
          </p>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold uppercase tracking-wide text-muted">รูปประกอบ (เลือกได้หลายไฟล์)</legend>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
          className="text-sm"
        />
        {photos.length > 0 && (
          <p className="text-xs text-muted">เลือกแล้ว {photos.length} ไฟล์</p>
        )}
      </fieldset>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="flex gap-3 pt-2 border-t border-border">
        <button
          type="submit"
          disabled={pending || (needsWaivedReason && waivedReason.trim().length < 5)}
          className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "✓ บันทึกการตรวจ"}
        </button>
        <button
          type="button"
          onClick={() => history.back()}
          disabled={pending}
          className="rounded-lg border border-border bg-white px-5 py-2.5 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

function translateError(code: string): string {
  if (code.startsWith("serial_reserve_failed")) return `จองเลขที่ไม่สำเร็จ: ${code}`;
  if (code.startsWith("insert_failed"))         return `บันทึกล้มเหลว: ${code}`;
  switch (code) {
    case "freight_side_not_implemented_v1": return "Freight inspection ยังไม่เปิดใช้ใน V1 (รอ V-E1)";
    case "cargo_shipment_id_required":      return "ต้องระบุ cargo shipment";
    case "shipment_not_found":              return "ไม่พบ shipment";
    case "exactly_one_parent_required":     return "ต้องระบุ shipment แค่ฝั่งเดียว";
    default:                                return code;
  }
}
