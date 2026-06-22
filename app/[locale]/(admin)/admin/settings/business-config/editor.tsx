"use client";

/**
 * G-10 · Editor for /admin/settings/business-config.
 *
 * Tabbed by category (OTP / Wallet / Cashback / Banks / Features / …).
 * Per-row, the editor surface depends on value_type:
 *   number / currency_thb / duration_ms / percent → <input type=number>
 *   boolean                                       → checkbox toggle
 *   string                                        → text input
 *   json                                          → <textarea> with JSON.parse
 *
 * Submitting calls adminUpdateBusinessConfig server action. Errors are
 * surfaced inline per-row. On success the row is marked "บันทึกแล้ว"
 * for a few seconds.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateBusinessConfig } from "@/actions/admin/business-config";
import type { BusinessConfigRow, BusinessConfigValueType } from "@/lib/business-config";

type Group = { category: string; items: BusinessConfigRow[] };

type Props = { groups: Group[] };

// Keys that exist + are editable here but are NOT YET read by any code path
// (the real value is hardcoded in a validator/const) — flagged from the
// 2026-06-11 rate/cost wiring audit so staff don't think editing them takes
// effect. otp.ttl_ms is additionally STALE (config 5min, code uses 15min).
// (freight.default_markup_pct / freight.markup_tiers_pct were wired live in the
//  same wave, so they are NOT listed here.)
const NOT_YET_WIRED = new Set<string>([
  "otp.ttl_ms",
  "otp.rate_limit_per_hour",
  "wallet.deposit_min_thb",
  "wallet.deposit_max_thb",
  "wallet.withdraw_min_thb",
  "wallet.withdraw_max_thb",
  "cashback.default_pct",
  "features.liff_enabled",
  "features.china_search_demo",
]);

export function BusinessConfigEditor({ groups }: Props) {
  const [activeCat, setActiveCat] = useState<string>(groups[0]?.category ?? "");

  const activeItems = useMemo(
    () => groups.find((g) => g.category === activeCat)?.items ?? [],
    [groups, activeCat],
  );

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
        {groups.map((g) => (
          <button
            key={g.category}
            type="button"
            onClick={() => setActiveCat(g.category)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              g.category === activeCat
                ? "bg-primary-600 text-white"
                : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
            }`}
          >
            {g.category}
            <span className={`ml-1.5 text-[11px] ${g.category === activeCat ? "text-white/80" : "text-muted"}`}>
              ({g.items.length})
            </span>
          </button>
        ))}
      </nav>

      {/* Rows */}
      <ul className="space-y-3">
        {activeItems.map((row) => (
          <li key={row.key}>
            <ConfigRow row={row} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Per-row editor
// ────────────────────────────────────────────────────────────

function ConfigRow({ row }: { row: BusinessConfigRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>(() => stringify(row.value, row.value_type));

  function fire() {
    setErr(null);
    setMsg(null);

    let parsed: unknown;
    try {
      parsed = parseDraft(draft, row.value_type);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "parse_failed");
      return;
    }

    startTransition(async () => {
      const res = await adminUpdateBusinessConfig({ key: row.key, value: parsed });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setMsg("บันทึกแล้ว");
      setTimeout(() => setMsg(null), 2500);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-white dark:bg-surface p-4 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold">{row.key}</p>
          {NOT_YET_WIRED.has(row.key) && (
            <p className="mt-1 inline-block rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              ⚠️ ยังไม่เชื่อมโค้ด (reference-only) — แก้แล้วยังไม่มีผลกับระบบ{row.key === "otp.ttl_ms" ? " · ค่าจริงในโค้ด = 15 นาที" : ""}
            </p>
          )}
          <p className="text-[11px] text-muted font-mono">
            {row.value_type}
            {row.updated_at && (
              <span className="ml-2">· แก้ล่าสุด {new Date(row.updated_at).toLocaleString("th-TH")}</span>
            )}
          </p>
          {row.description && (
            <p className="text-xs text-muted mt-1">{row.description}</p>
          )}
        </div>
      </div>

      <ValueInput
        valueType={row.value_type}
        draft={draft}
        onChange={setDraft}
        disabled={pending}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs">
          {err && <span className="text-red-600">⚠️ {err}</span>}
          {msg && <span className="text-emerald-600">✓ {msg}</span>}
        </div>
        <button
          type="button"
          onClick={fire}
          disabled={pending}
          className="rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-1.5"
        >
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ValueInput — type-aware editor surface
// ────────────────────────────────────────────────────────────

function ValueInput({
  valueType,
  draft,
  onChange,
  disabled,
}: {
  valueType: BusinessConfigValueType;
  draft: string;
  onChange: (s: string) => void;
  disabled: boolean;
}) {
  const baseInput = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-60";

  if (valueType === "boolean") {
    const checked = draft === "true";
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          className="h-4 w-4"
        />
        <span className="font-mono text-xs">{checked ? "true" : "false"}</span>
      </label>
    );
  }

  if (valueType === "json") {
    return (
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        disabled={disabled}
        className={`${baseInput} font-mono`}
        placeholder='[] or {"key":"value"}'
        spellCheck={false}
      />
    );
  }

  if (valueType === "string") {
    return (
      <input
        type="text"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={baseInput}
      />
    );
  }

  // number-family
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        step={valueType === "percent" ? "0.01" : "any"}
        className={`${baseInput} font-mono`}
      />
      <span className="text-xs text-muted whitespace-nowrap">{unitLabel(valueType)}</span>
    </div>
  );
}

function unitLabel(t: BusinessConfigValueType): string {
  switch (t) {
    case "currency_thb": return "฿ THB";
    case "percent":      return "%";
    case "duration_ms":  return "ms";
    case "number":       return "";
    default:             return "";
  }
}

// ────────────────────────────────────────────────────────────
// Serialize ↔ Parse
// ────────────────────────────────────────────────────────────
// The textarea holds a STRING. We serialize the typed jsonb value to a
// string for display + parse it back on submit.

function stringify(value: unknown, t: BusinessConfigValueType): string {
  if (value === null || value === undefined) {
    if (t === "json") return "[]";
    if (t === "boolean") return "false";
    return "";
  }
  switch (t) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return String(value);
    case "json":
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return "";
      }
    default:
      return String(value);
  }
}

function parseDraft(draft: string, t: BusinessConfigValueType): unknown {
  switch (t) {
    case "boolean":
      if (draft === "true")  return true;
      if (draft === "false") return false;
      throw new Error("expected_boolean");
    case "string":
      return draft;
    case "json":
      try {
        return JSON.parse(draft);
      } catch (e) {
        throw new Error("invalid_json: " + (e instanceof Error ? e.message : ""));
      }
    default: {
      const n = Number(draft);
      if (!Number.isFinite(n)) throw new Error("expected_number");
      return n;
    }
  }
}
