"use client";

/**
 * Tier A6 — `<LegacyRatesForm>` is the client island that wraps the
 * existing `adminSetTbSettingsRates` server action. The action already
 * implements the range guard [2.0, 8.0] + super-only force_override +
 * audit logging, so this form is thin: 3 controlled inputs + submit +
 * optional confirm-dialog when the server rejects an out-of-range value.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminSetTbSettingsRates } from "@/actions/admin/tb-settings";

type Props = {
  initial: {
    rsdefault: number;
    rpdefault: number;
    rgdefault: number;
  };
  // hratecostdefault is displayed in the page; the editor doesn't write it yet
  // (Wave-2: extend the server action + add a 4th input).
  hratecostdefault: number | null;
};

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function LegacyRatesForm({ initial }: Props) {
  const router = useRouter();
  const [rsdefault, setRsdefault] = useState(initial.rsdefault.toFixed(4));
  const [rpdefault, setRpdefault] = useState(initial.rpdefault.toFixed(4));
  const [rgdefault, setRgdefault] = useState(initial.rgdefault.toFixed(4));
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);

    const parsed = {
      rsdefault: Number(rsdefault),
      rpdefault: Number(rpdefault),
      rgdefault: Number(rgdefault),
    };
    if (!Number.isFinite(parsed.rsdefault) || parsed.rsdefault <= 0) {
      setError("rsdefault ต้องเป็นตัวเลข > 0");
      return;
    }
    if (!Number.isFinite(parsed.rpdefault) || parsed.rpdefault <= 0) {
      setError("rpdefault ต้องเป็นตัวเลข > 0");
      return;
    }
    if (!Number.isFinite(parsed.rgdefault) || parsed.rgdefault <= 0) {
      setError("rgdefault ต้องเป็นตัวเลข > 0");
      return;
    }

    submitWith(false);

    function submitWith(forceOverride: boolean) {
      startTransition(async () => {
        const res = await adminSetTbSettingsRates({
          ...parsed,
          ...(forceOverride ? { force_override: true } : {}),
        });
        if (res.ok) {
          const updated = res.data?.updated ?? [];
          setMsg(
            forceOverride
              ? `บันทึก ${updated.length} ค่า (super bypass range guard)`
              : `บันทึก ${updated.length} ค่า ${updated.length > 0 ? `(${updated.join(", ")})` : "(ไม่มีการเปลี่ยน)"}`,
          );
          router.refresh();
          setTimeout(() => setMsg(null), 5000);
        } else {
          // Range-guard rejection → ask user to confirm bypass (super only).
          if (res.error.includes("เรทผิดปกติ") && !forceOverride) {
            if (
              window.confirm(
                `${res.error}\n\nยืนยันใช้ค่านี้จริง? (ต้องเป็น super admin จึง bypass ได้)`,
              )
            ) {
              submitWith(true);
            }
            return;
          }
          setError(res.error);
        }
      });
    }
  }

  // Show side-by-side diff (initial → new) so the editor can see at a glance
  // which rates moved before submitting.
  const dRs = Number(rsdefault) - initial.rsdefault;
  const dRp = Number(rpdefault) - initial.rpdefault;
  const dRg = Number(rgdefault) - initial.rgdefault;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{msg}</div>
      )}

      <RateField
        label="rpdefault — เรทฝากชำระสินค้า (ฝากโอนหยวน)"
        hint="หน้า /admin/yuan-payments/new + /service-payment ใช้ค่านี้"
        value={rpdefault}
        onChange={setRpdefault}
        initialValue={initial.rpdefault}
        delta={dRp}
        important
      />

      <RateField
        label="rsdefault — เรทฝากสั่งสินค้า (shop)"
        hint="/cart + /search + /service-order/add ใช้ค่านี้"
        value={rsdefault}
        onChange={setRsdefault}
        initialValue={initial.rsdefault}
        delta={dRs}
      />

      <RateField
        label="rgdefault — ไม่ได้ใช้ (legacy schema-only)"
        hint="เก็บไว้เพื่อ fidelity · admin dashboard แสดงเป็น reference"
        value={rgdefault}
        onChange={setRgdefault}
        initialValue={initial.rgdefault}
        delta={dRg}
      />

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <p className="text-xs text-muted">
          Range guard [2.0 - 8.0]. นอกช่วง → ต้อง super admin ยืนยัน
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึกเรท"}
        </Button>
      </div>
    </form>
  );
}

function RateField({
  label,
  hint,
  value,
  onChange,
  initialValue,
  delta,
  important = false,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  initialValue: number;
  delta: number;
  important?: boolean;
}) {
  const dStr =
    Math.abs(delta) < 0.00005
      ? null
      : `${delta > 0 ? "+" : ""}${delta.toFixed(4)}`;
  return (
    <label className={`block space-y-1 ${important ? "rounded-lg border border-primary-200 bg-primary-50/30 p-3" : ""}`}>
      <span className={`text-sm ${important ? "font-bold text-primary-700" : "font-medium"}`}>
        {label}
      </span>
      <input
        type="number"
        min="0"
        step="0.0001"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
        required
      />
      <div className="flex justify-between text-[11px]">
        <span className="text-muted">{hint}</span>
        <span className="text-muted">
          เดิม <span className="font-mono">{initialValue.toFixed(4)}</span>
          {dStr && (
            <span className={`ml-1 font-mono ${delta > 0 ? "text-emerald-700" : "text-red-700"}`}>
              ({dStr})
            </span>
          )}
        </span>
      </div>
    </label>
  );
}
