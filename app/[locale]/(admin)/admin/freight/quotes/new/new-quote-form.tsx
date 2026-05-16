"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateFreightQuote } from "@/actions/admin/freight-quotes";
import {
  TRANSPORT_MODES, TRANSPORT_MODE_LABEL,
  INCOTERMS,
  type TransportMode, type Incoterm,
} from "@/lib/validators/freight-quote";

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function NewQuoteForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [profileId,    setProfileId]    = useState("");
  const [buyerName,    setBuyerName]    = useState("");
  const [buyerTaxId,   setBuyerTaxId]   = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [mode,         setMode]         = useState<TransportMode>("sea_lcl");
  const [portLoad,     setPortLoad]     = useState("");
  const [portDisch,    setPortDisch]    = useState("");
  const [placeDel,     setPlaceDel]     = useState("");
  const [incoterm,     setIncoterm]     = useState<Incoterm | "">("");
  const [vatPct,       setVatPct]       = useState<number>(7);
  const [validUntil,   setValidUntil]   = useState(plusDaysIso(30));
  const [notes,        setNotes]        = useState("");
  const [err,          setErr]          = useState<string | null>(null);

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await adminCreateFreightQuote({
        profile_id:             profileId.trim() || undefined,
        buyer_name_snapshot:    buyerName.trim(),
        buyer_tax_id_snapshot:  buyerTaxId.trim() || undefined,
        buyer_contact_snapshot: buyerContact.trim() || undefined,
        transport_mode:         mode,
        port_loading:           portLoad.trim() || undefined,
        port_discharge:         portDisch.trim() || undefined,
        place_delivery:         placeDel.trim() || undefined,
        incoterm:               incoterm || undefined,
        currency:               "THB",
        vat_pct:                vatPct,
        valid_until:            validUntil,
        notes:                  notes.trim() || undefined,
      });
      if (res.ok) {
        router.push(`/admin/freight/quotes/${res.data!.id}`);
      } else {
        setErr(translateError(res.error));
      }
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => { e.preventDefault(); fire(); }}
    >
      {/* Buyer block */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">ผู้ซื้อ</h2>
        <Field label="ชื่อบริษัท / ชื่อลูกค้า" required>
          <input
            type="text"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="เช่น บจก. ตัวอย่าง การนำเข้า"
            maxLength={300}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="เลขประจำตัวผู้เสียภาษี (13 หลัก — optional)">
            <input
              type="text"
              value={buyerTaxId}
              onChange={(e) => setBuyerTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))}
              placeholder="0105564077716"
              maxLength={13}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
            />
          </Field>
          <Field label="ลูกค้าใน Pacred (profile UUID — optional)">
            <input
              type="text"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              placeholder="cold quote ไม่ต้องกรอก"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs font-mono"
            />
          </Field>
        </div>
        <Field label="ผู้ติดต่อ (ชื่อ + เบอร์ + อีเมล)">
          <textarea
            rows={2}
            value={buyerContact}
            onChange={(e) => setBuyerContact(e.target.value)}
            maxLength={1000}
            placeholder="คุณ A · 081-234-5678 · a@example.com"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          />
        </Field>
      </section>

      {/* Logistics block */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">โลจิสติกส์</h2>
        <Field label="ประเภทขนส่ง" required>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as TransportMode)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          >
            {TRANSPORT_MODES.map((m) => (
              <option key={m} value={m}>{TRANSPORT_MODE_LABEL[m]}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="ต้นทาง (Port of Loading)">
            <input type="text" value={portLoad} onChange={(e) => setPortLoad(e.target.value)} placeholder="NANSHA" maxLength={100} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
          <Field label="ปลายทาง (Port of Discharge)">
            <input type="text" value={portDisch} onChange={(e) => setPortDisch(e.target.value)} placeholder="LAEM CHABANG" maxLength={100} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
          <Field label="ส่งมอบที่ (Place of Delivery)">
            <input type="text" value={placeDel} onChange={(e) => setPlaceDel(e.target.value)} placeholder="โกดังลูกค้า" maxLength={100} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
        </div>
        <Field label="Incoterm">
          <select
            value={incoterm}
            onChange={(e) => setIncoterm(e.target.value as Incoterm)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          >
            <option value="">— ไม่ระบุ —</option>
            {INCOTERMS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </Field>
      </section>

      {/* Financial block */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">การเงิน + ความถูกต้อง</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="VAT %">
            <input
              type="number"
              min={0} max={30} step={0.01}
              value={vatPct}
              onChange={(e) => setVatPct(Number(e.target.value) || 0)}
              className="w-32 rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
            />
          </Field>
          <Field label="หมดอายุภายในวันที่">
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </Field>
        </div>
        <Field label="หมายเหตุ">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            placeholder="เงื่อนไขพิเศษ, ของพิเศษ, อื่นๆ"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          />
        </Field>
      </section>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="flex gap-3 pt-2 border-t border-border">
        <button
          type="submit"
          disabled={pending || buyerName.trim().length < 1}
          className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "✓ บันทึก + ไปเพิ่ม line items"}
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}{required && <span className="text-red-500">*</span>}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function translateError(code: string): string {
  if (code.startsWith("serial_reserve_failed")) return `จองเลขที่ไม่สำเร็จ: ${code}`;
  if (code.startsWith("insert_failed"))         return `บันทึกล้มเหลว: ${code}`;
  return code;
}
