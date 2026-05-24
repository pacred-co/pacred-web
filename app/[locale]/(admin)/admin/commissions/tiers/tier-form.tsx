"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpsertCommissionTier } from "@/actions/admin/commissions";
import {
  ROLE_KINDS,
  ROLE_KIND_LABEL,
  SOURCE_KINDS,
  SOURCE_KIND_LABEL,
  type RoleKind,
  type SourceKind,
} from "@/lib/validators/commission";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export type TierInitial = {
  role_kind:      RoleKind;
  service_kind:   SourceKind;
  tier_name:      string;
  rate_pct:       number | null;
  flat_thb:       number | null;
  min_base_thb:   number | null;
  effective_from: string;
  effective_to:   string | null;
  notes:          string;
};

type Props =
  | { mode: "create"; id?: never; initial?: never }
  | { mode: "edit"; id: string; initial: TierInitial };

/**
 * V-E8 — commission tier upsert form. Used in 2 modes:
 *   - create: bottom panel of /admin/commissions/tiers (always visible)
 *   - edit:   inline expansion when admin clicks ✏️ on a row
 *
 * Constraint: exactly ONE of `rate_pct` / `flat_thb` must be set (Zod refines).
 * The form enforces this with a radio toggle.
 */
export function TierForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const init = props.mode === "edit" ? props.initial : null;

  const [roleKind,      setRoleKind]      = useState<RoleKind>(init?.role_kind    ?? "sales_rep");
  const [serviceKind,   setServiceKind]   = useState<SourceKind>(init?.service_kind ?? "forwarder");
  const [tierName,      setTierName]      = useState(init?.tier_name              ?? "");
  // Radio: "pct" uses rate_pct; "flat" uses flat_thb. Exactly one is sent.
  const [rateMode,      setRateMode]      = useState<"pct" | "flat">(
    init?.flat_thb !== null && init?.flat_thb !== undefined ? "flat" : "pct",
  );
  const [ratePct,       setRatePct]       = useState<string>(
    init?.rate_pct !== null && init?.rate_pct !== undefined ? String(init.rate_pct) : "",
  );
  const [flatThb,       setFlatThb]       = useState<string>(
    init?.flat_thb !== null && init?.flat_thb !== undefined ? String(init.flat_thb) : "",
  );
  const [minBaseThb,    setMinBaseThb]    = useState<string>(
    init?.min_base_thb !== null && init?.min_base_thb !== undefined ? String(init.min_base_thb) : "",
  );
  const [effectiveFrom, setEffectiveFrom] = useState<string>(init?.effective_from ?? "");
  const [effectiveTo,   setEffectiveTo]   = useState<string>(init?.effective_to ?? "");
  const [notes,         setNotes]         = useState(init?.notes ?? "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    // Parse numbers locally so we can show a friendly error before round-trip.
    const ratePctNum = rateMode === "pct" ? Number(ratePct) : null;
    const flatThbNum = rateMode === "flat" ? Number(flatThb) : null;
    if (rateMode === "pct" && (!ratePct || !Number.isFinite(ratePctNum!) || ratePctNum! < 0 || ratePctNum! > 100)) {
      setErr("กรุณาระบุอัตรา % ที่ถูกต้อง (0-100)");
      return;
    }
    if (rateMode === "flat" && (!flatThb || !Number.isFinite(flatThbNum!) || flatThbNum! < 0)) {
      setErr("กรุณาระบุยอดเหมา (THB) ที่ถูกต้อง");
      return;
    }

    const minBaseNum =
      minBaseThb && Number.isFinite(Number(minBaseThb)) ? Number(minBaseThb) : null;

    startTransition(async () => {
      const res = await adminUpsertCommissionTier({
        id:             props.mode === "edit" ? props.id : undefined,
        role_kind:      roleKind,
        service_kind:   serviceKind,
        tier_name:      tierName.trim(),
        rate_pct:       ratePctNum,
        flat_thb:       flatThbNum,
        min_base_thb:   minBaseNum,
        effective_from: effectiveFrom || undefined,
        effective_to:   effectiveTo   || null,
        is_active:      true,
        notes:          notes.trim() || undefined,
      });
      if (res.ok) {
        setMsg(props.mode === "create" ? "เพิ่ม tier เรียบร้อย" : "บันทึกแล้ว");
        if (props.mode === "create") {
          setTierName("");
          setRatePct("");
          setFlatThb("");
          setMinBaseThb("");
          setEffectiveFrom("");
          setEffectiveTo("");
          setNotes("");
        }
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">บทบาท <span className="text-red-500">*</span></span>
          <select
            value={roleKind}
            onChange={(e) => setRoleKind(e.target.value as RoleKind)}
            className={inputCls}
            disabled={pending}
          >
            {ROLE_KINDS.map((r) => (
              <option key={r} value={r}>{ROLE_KIND_LABEL[r]}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium">ประเภทออเดอร์ <span className="text-red-500">*</span></span>
          <select
            value={serviceKind}
            onChange={(e) => setServiceKind(e.target.value as SourceKind)}
            className={inputCls}
            disabled={pending}
          >
            {SOURCE_KINDS.map((s) => (
              <option key={s} value={s}>{SOURCE_KIND_LABEL[s]}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">
          ชื่อ tier <span className="text-red-500">*</span>
          <span className="ml-2 text-muted">(เช่น &quot;ล่ามอัตราปกติ&quot;, &quot;Sales VIP closer&quot;)</span>
        </span>
        <input
          value={tierName}
          onChange={(e) => setTierName(e.target.value)}
          className={inputCls}
          required
          maxLength={200}
          disabled={pending}
        />
      </label>

      {/* Rate toggle */}
      <div className="rounded-lg border border-border bg-surface-alt/30 p-3 space-y-2">
        <p className="text-xs font-medium">วิธีคิดค่าคอม <span className="text-red-500">*</span></p>
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={rateMode === "pct"}
              onChange={() => setRateMode("pct")}
              disabled={pending}
            />
            <span>% ของ Base</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={rateMode === "flat"}
              onChange={() => setRateMode("flat")}
              disabled={pending}
            />
            <span>ยอดเหมา (THB) ต่อ job</span>
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 pt-1">
          {rateMode === "pct" ? (
            <label className="block space-y-1">
              <span className="text-xs">อัตรา % (0-100)</span>
              <input
                type="number"
                step="0.001"
                min="0"
                max="100"
                value={ratePct}
                onChange={(e) => setRatePct(e.target.value)}
                className={inputCls + " font-mono"}
                placeholder="1.500"
                required
                disabled={pending}
              />
            </label>
          ) : (
            <label className="block space-y-1">
              <span className="text-xs">ยอดเหมา (THB)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={flatThb}
                onChange={(e) => setFlatThb(e.target.value)}
                className={inputCls + " font-mono"}
                placeholder="200.00"
                required
                disabled={pending}
              />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-xs">ขั้นต่ำ Base (THB) — เว้นว่างถ้าไม่จำกัด</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={minBaseThb}
              onChange={(e) => setMinBaseThb(e.target.value)}
              className={inputCls + " font-mono"}
              placeholder="0"
              disabled={pending}
            />
          </label>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">เริ่มใช้ (effective_from) — เว้นว่างใช้วันนี้</span>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className={inputCls}
            disabled={pending}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">สิ้นสุด (effective_to) — เว้นว่างถ้าไม่จำกัด</span>
          <input
            type="date"
            value={effectiveTo}
            onChange={(e) => setEffectiveTo(e.target.value)}
            className={inputCls}
            disabled={pending}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">หมายเหตุ (admin only)</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputCls}
          maxLength={500}
          placeholder="เช่น: ใช้กับ campaign Q2, อ้างอิงมติประชุม xxx"
          disabled={pending}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "กำลังบันทึก..." : props.mode === "create" ? "+ เพิ่ม tier" : "บันทึกการแก้ไข"}
      </button>
    </form>
  );
}
