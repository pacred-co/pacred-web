"use client";

/**
 * G3 (V-E1.1) — Value-block inline editor.
 *
 * Replaces the read-only value-block display (with the
 * "ตอนนี้ read-only — แก้ผ่าน update action" disclaimer) on
 * /admin/freight/shipments/[id] with a click-to-edit form that posts
 * directly to the existing adminUpdateFreightShipment action.
 *
 * Editable fields (per ADR-0016 + updateFreightShipmentSchema):
 *   commercial_value_usd · exchange_rate · rate_date
 *   declared_customs_value_thb · declared_value_basis · hs_code
 *   duty_rate_pct · vat_base_thb · vat_plan_label · form_e_applied
 *
 * Server-side rules the action enforces (this UI just surfaces them):
 *   - declared_customs_value_thb edit requires super OR accounting
 *     + a basis text (≥1 char) — both gated server-side, but the form
 *     hints at the constraints up front.
 *   - delivered / cancelled shipments are read-only (the page hides
 *     the editor in that case via `editable={false}`).
 *   - commercial_value_thb / duty_thb / vat_thb are DERIVED — UI shows
 *     them read-only; server recomputes on save.
 *
 * The component is split into a closed (display) state + an open (form)
 * state — entering edit mode pre-fills inputs from the current values.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { adminUpdateFreightShipment } from "@/actions/admin/freight-shipments";
import {
  INCOTERMS as _INCOTERMS, // not used here; suppress import-cleanup confusion
} from "@/lib/validators/freight-shipment";
void _INCOTERMS;

// Snapshot of the value-block fields the page passes in.
export interface ValueBlockData {
  id:                          string;
  // derived (display only)
  commercial_value_thb:        number | null;
  duty_thb:                    number | null;
  vat_thb:                     number | null;
  // editable
  commercial_value_usd:        number | null;
  exchange_rate:               number | null;
  rate_date:                   string | null;        // YYYY-MM-DD
  declared_customs_value_thb:  number | null;
  declared_value_basis:        string | null;
  hs_code:                     string | null;
  duty_rate_pct:               number | null;
  vat_base_thb:                number | null;
  vat_plan_label:              string | null;
  form_e_applied:              boolean;
}

interface Props {
  data: ValueBlockData;
  /** True when the shipment is in an editable status (not delivered / cancelled). */
  editable: boolean;
}

function thb(n: number | null | undefined): string {
  return n != null ? `฿${Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 })}` : "—";
}
function usd(n: number | null | undefined): string {
  return n != null ? `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—";
}
function num(s: string | undefined | null): number | null {
  if (s == null || s.trim() === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
function str(s: string | undefined | null): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

export function ValueBlockEditor({ data, editable }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Form state (string inputs — converted to numbers on save).
  const [cvUsd, setCvUsd]               = useState(toStr(data.commercial_value_usd));
  const [fx,    setFx]                  = useState(toStr(data.exchange_rate));
  const [rateDate, setRateDate]         = useState(data.rate_date ?? "");
  const [declared, setDeclared]         = useState(toStr(data.declared_customs_value_thb));
  const [basis,    setBasis]            = useState(data.declared_value_basis ?? "");
  const [hs,       setHs]               = useState(data.hs_code ?? "");
  const [dutyPct,  setDutyPct]          = useState(toStr(data.duty_rate_pct));
  const [vatBase,  setVatBase]          = useState(toStr(data.vat_base_thb));
  const [vatPlan,  setVatPlan]          = useState(data.vat_plan_label ?? "");
  const [formE,    setFormE]            = useState(data.form_e_applied);

  function resetToCurrent() {
    setCvUsd(toStr(data.commercial_value_usd));
    setFx(toStr(data.exchange_rate));
    setRateDate(data.rate_date ?? "");
    setDeclared(toStr(data.declared_customs_value_thb));
    setBasis(data.declared_value_basis ?? "");
    setHs(data.hs_code ?? "");
    setDutyPct(toStr(data.duty_rate_pct));
    setVatBase(toStr(data.vat_base_thb));
    setVatPlan(data.vat_plan_label ?? "");
    setFormE(data.form_e_applied);
    setErr(null);
  }

  function fire() {
    setErr(null);
    const declaredNum = num(declared);
    if (declaredNum != null && (!basis || basis.trim().length === 0)) {
      setErr("กรอก declared_customs_value_thb แล้ว ต้องกรอก 'declared_value_basis' ด้วย (ADR-0016 Q3 — กฎหมาย)");
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateFreightShipment({
        id:                         data.id,
        commercial_value_usd:       num(cvUsd),
        exchange_rate:              num(fx),
        rate_date:                  str(rateDate),
        declared_customs_value_thb: declaredNum,
        declared_value_basis:       str(basis),
        hs_code:                    str(hs),
        duty_rate_pct:              num(dutyPct),
        vat_base_thb:               num(vatBase),
        vat_plan_label:             str(vatPlan),
        form_e_applied:             formE,
      });
      if (!res.ok) {
        setErr(translateErr(res.error));
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  // ─── Closed (display) state ───
  if (!editing) {
    return (
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-sm">📊 Value block (ADR-0016)</h2>
          {editable && (
            <button
              type="button"
              onClick={() => { resetToCurrent(); setEditing(true); }}
              className="inline-flex items-center gap-1.5 min-h-[36px] rounded-lg border border-primary-300 bg-white dark:bg-surface px-3 text-xs font-bold text-primary-600 hover:bg-primary-50"
            >
              <Pencil className="w-3 h-3" /> แก้ไข
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1 text-xs">
          <p>Commercial value USD: <span className="font-mono">{usd(data.commercial_value_usd)}</span></p>
          <p>Exchange rate: <span className="font-mono">{data.exchange_rate ?? "—"}</span></p>
          <p>Rate date: <span className="font-mono">{data.rate_date ?? "—"}</span></p>
          <p>Commercial THB: <span className="font-mono">{thb(data.commercial_value_thb)}</span></p>
          <p>Declared customs THB: <span className="font-mono text-amber-700">{thb(data.declared_customs_value_thb)}</span></p>
          <p>HS code: <span className="font-mono">{data.hs_code ?? "—"}</span></p>
          <p>Duty: <span className="font-mono">{data.duty_rate_pct ?? "—"}% / {thb(data.duty_thb)}</span></p>
          <p>VAT base: <span className="font-mono">{thb(data.vat_base_thb)}</span></p>
          <p>VAT 7%: <span className="font-mono">{thb(data.vat_thb)}</span></p>
          <p>VAT plan: {data.vat_plan_label ?? "—"}</p>
          <p>Form E: {data.form_e_applied ? "✓ applied" : "—"}</p>
        </div>
        {data.declared_value_basis && (
          <p className="mt-2 text-xs text-amber-800 italic">📝 {data.declared_value_basis}</p>
        )}
        <p className="mt-1 text-[10px] text-muted">
          ⚠️ commercial_value_usd × exchange_rate = commercial_value_thb (frozen at invoice issuance) ·
          declared_customs_value_thb แก้ได้เฉพาะ super/accounting (ADR-0016 Q3) ·
          ฟิลด์ derived ({"commercial_value_thb / duty_thb / vat_thb"}) คำนวณอัตโนมัติตอน save
        </p>
      </section>
    );
  }

  // ─── Open (edit) state ───
  return (
    <section className="rounded-2xl border border-primary-300 bg-primary-50/30 dark:bg-primary-950/10 p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-sm">📊 Value block (edit) — ADR-0016</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setEditing(false); setErr(null); }}
            disabled={pending}
            className="inline-flex items-center gap-1 min-h-[36px] rounded-lg border border-border bg-white dark:bg-surface px-3 text-xs hover:bg-surface-alt disabled:opacity-50"
          >
            <X className="w-3 h-3" /> ยกเลิก
          </button>
          <button
            type="button"
            onClick={fire}
            disabled={pending}
            className="inline-flex items-center gap-1 min-h-[36px] rounded-lg bg-primary-600 text-white px-3 text-xs font-bold hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <FieldGroup label="Commercial value USD" hint="ค่าสินค้าจริงเป็น USD">
          <input type="number" min={0} step={0.01} value={cvUsd} onChange={(e) => setCvUsd(e.target.value)} className={INPUT_CLASS} />
        </FieldGroup>
        <FieldGroup label="Exchange rate" hint="USD → THB เรท ณ วันออกใบ">
          <input type="number" min={0.0001} step={0.0001} value={fx} onChange={(e) => setFx(e.target.value)} className={INPUT_CLASS} />
        </FieldGroup>
        <FieldGroup label="Rate date" hint="วันที่อัตราแลกเปลี่ยน">
          <input type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} className={INPUT_CLASS} />
        </FieldGroup>

        <FieldGroup label="Declared customs THB" hint="ค่าที่แจ้งศุลกากร (super/accounting only)">
          <input type="number" min={0} step={0.01} value={declared} onChange={(e) => setDeclared(e.target.value)} className={INPUT_CLASS} />
        </FieldGroup>
        <FieldGroup label="HS code" hint="HS code ของสินค้า">
          <input type="text" maxLength={20} value={hs} onChange={(e) => setHs(e.target.value)} className={INPUT_CLASS + " font-mono uppercase"} />
        </FieldGroup>
        <FieldGroup label="Duty rate %" hint="0-100">
          <input type="number" min={0} max={100} step={0.001} value={dutyPct} onChange={(e) => setDutyPct(e.target.value)} className={INPUT_CLASS} />
        </FieldGroup>

        <FieldGroup label="VAT base THB" hint="ฐาน VAT (ปล่อยว่าง = ใช้ declared+duty)">
          <input type="number" min={0} step={0.01} value={vatBase} onChange={(e) => setVatBase(e.target.value)} className={INPUT_CLASS} />
        </FieldGroup>
        <FieldGroup label="VAT plan label" hint="ป้ายแผน VAT (เช่น แผน 1, แผน 2)">
          <input type="text" maxLength={50} value={vatPlan} onChange={(e) => setVatPlan(e.target.value)} className={INPUT_CLASS} />
        </FieldGroup>
        <FieldGroup label="Form E applied" hint="ASEAN-China FTA Form E">
          <label className="inline-flex items-center gap-2 h-[36px]">
            <input type="checkbox" checked={formE} onChange={(e) => setFormE(e.target.checked)} className="h-4 w-4" />
            <span className="text-xs">{formE ? "ใช้ Form E" : "ไม่ใช้"}</span>
          </label>
        </FieldGroup>
      </div>

      {/* declared_value_basis spans full width — typically a sentence */}
      <FieldGroup label="Declared value basis" hint="เหตุผลที่ระบุค่า declared (บังคับเมื่อกรอก declared_customs_value_thb)">
        <textarea
          rows={2}
          maxLength={1000}
          value={basis}
          onChange={(e) => setBasis(e.target.value)}
          className={INPUT_CLASS + " resize-none"}
          placeholder="เช่น 'แผน 2 — invoice แสดง 80% ของราคาจริง'"
        />
        <p className="text-[10px] text-muted mt-0.5">{basis.length} / 1000</p>
      </FieldGroup>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-3 text-xs text-red-800 dark:text-red-200">
          ⚠ {err}
        </div>
      )}

      <p className="text-[10px] text-muted">
        commercial_value_thb / duty_thb / vat_thb คำนวณใหม่อัตโนมัติตอน save (server-side per ADR-0016)
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs min-h-[36px] focus:outline-none focus:ring-2 focus:ring-primary-500";

function toStr(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-foreground mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted mt-0.5">{hint}</p>}
    </div>
  );
}

function translateErr(err: string): string {
  if (err === "not_found") return "ไม่พบ shipment";
  if (err === "terminal_status") return "shipment อยู่ในสถานะ delivered/cancelled — แก้ไม่ได้";
  if (err === "no_changes") return "ไม่มีการเปลี่ยนแปลง";
  if (err === "declared_value_requires_super_or_accounting") {
    return "declared_customs_value_thb แก้ได้เฉพาะ super/accounting (ADR-0016 Q3)";
  }
  if (err === "declared_value_basis_required") {
    return "กรอก declared_customs_value_thb แล้ว ต้องกรอก 'declared_value_basis' ด้วย";
  }
  if (err.startsWith("update_failed:")) return "บันทึกไม่สำเร็จ: " + err.replace("update_failed:", "").trim();
  if (err.includes("commercial_value_usd และ exchange_rate")) {
    return "commercial_value_usd และ exchange_rate ต้องกรอกพร้อมกัน หรือว่างพร้อมกัน";
  }
  return `เกิดข้อผิดพลาด: ${err}`;
}
