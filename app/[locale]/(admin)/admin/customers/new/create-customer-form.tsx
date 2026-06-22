"use client";

/**
 * Admin-create-customer form (staff-CRUD gap · §PM-6 #3.3).
 *
 * Collects name · phone · optional email · password (admin-set OR auto) · an
 * optional นิติบุคคล toggle (reveals company name / tax id / address). On
 * submit it calls adminCreateCustomer (no OTP) and, on success, swaps the form
 * for a "created" panel that reveals the minted member code + the password ONCE
 * (copy buttons) — the admin relays it to the customer.
 *
 * Pure Tailwind + Lucide per the Pacred design philosophy (AGENTS.md §0a) —
 * not legacy Bootstrap chrome.
 */

import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { Loader2, UserPlus, Copy, Check, ArrowRight, Building2, UserCog, Headphones, StickyNote, Link2 } from "lucide-react";
import { adminCreateCustomer } from "@/actions/admin/customer-admin";
import { adminCreateCustomerSchema, type AdminCreateCustomerData } from "@/lib/validators/customer-admin";

/** One assignable staff member (tb_admin.adminID + a friendly label). */
export type StaffOption = { id: string; label: string };

export function CreateCustomerForm({
  salesReps = [],
  csReps = [],
}: {
  /** Active เซลล์ pool (tb_admin adminStatusSale='1'). */
  salesReps?: StaffOption[];
  /** Active CS pool (tb_admin adminStatusCS='1'). */
  csReps?: StaffOption[];
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<AdminCreateCustomerData | null>(null);

  // Controlled fields.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [csRepId, setCsRepId] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [isJuristic, setIsJuristic] = useState(false);

  const toggleService = (s: string) =>
    setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const payload = {
      firstName,
      lastName,
      phone,
      email,
      password,
      salesRepId,
      csRepId,
      services,
      note,
      isJuristic,
      companyName,
      taxId,
      companyAddress,
    };
    // Client preflight using the same schema the action validates with — fail
    // fast with a Thai message before the round-trip.
    const pre = adminCreateCustomerSchema.safeParse(payload);
    if (!pre.success) {
      setErr(pre.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
      return;
    }

    start(async () => {
      const res = await adminCreateCustomer(payload);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setDone(res.data ?? null);
    });
  }

  if (done) {
    return <CreatedPanel data={done} onAddAnother={() => { setDone(null); resetForm(); }} />;
  }

  function resetForm() {
    setFirstName(""); setLastName(""); setPhone(""); setEmail(""); setPassword("");
    setSalesRepId(""); setCsRepId(""); setServices([]); setNote("");
    setIsJuristic(false); setCompanyName(""); setTaxId(""); setCompanyAddress("");
    setErr(null);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-5 space-y-4">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {err}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ชื่อ" required>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder="สมชาย" autoComplete="off" />
        </Field>
        <Field label="นามสกุล" required>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} placeholder="ใจดี" autoComplete="off" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="เบอร์โทร" required hint="0XXXXXXXXX">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="0948782006" inputMode="tel" autoComplete="off" />
        </Field>
        <Field label="อีเมล" hint="ไม่บังคับ">
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="name@example.com" type="email" autoComplete="off" />
        </Field>
      </div>

      <Field label="รหัสผ่าน" hint="เว้นว่าง = สุ่มให้อัตโนมัติ (จะแสดงครั้งเดียวหลังสร้าง)">
        <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="เว้นว่างเพื่อสุ่มรหัส" autoComplete="new-password" />
      </Field>

      {/* ผู้ดูแล — เลือกเซลล์ + CS เอง (เว้นว่าง = ระบบสุ่มให้คนที่ดูแลน้อยสุด) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="เซลล์ผู้ดูแล" hint="เว้นว่าง = สุ่มให้อัตโนมัติ">
          <div className="relative">
            <UserCog className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)} className={`${inputCls} pl-9 appearance-none`}>
              <option value="">อัตโนมัติ — ระบบสุ่มให้ (ดูแลน้อยสุด)</option>
              {salesReps.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="CS ผู้ดูแล" hint="เว้นว่าง = สุ่มให้อัตโนมัติ">
          <div className="relative">
            <Headphones className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <select value={csRepId} onChange={(e) => setCsRepId(e.target.value)} className={`${inputCls} pl-9 appearance-none`}>
              <option value="">อัตโนมัติ — ระบบสุ่มให้ (ดูแลน้อยสุด)</option>
              {csReps.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
        </Field>
      </div>

      {/* บริการที่ใช้ — multi-select chips · composed into the note ("เลือกเพื่อโน๊ต") */}
      <div className="block">
        <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
          บริการที่ใช้
          <span className="font-normal text-muted">· เลือกได้หลายอย่าง (ใช้โน๊ตว่าลูกค้าสนใจ/ใช้บริการอะไร)</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {SERVICE_OPTIONS.map((s) => {
            const on = services.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggleService(s)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? "border-primary-600 bg-primary-600 text-white"
                    : "border-border bg-white dark:bg-surface text-foreground hover:bg-surface-alt"
                }`}
              >
                {on && <Check className="h-3.5 w-3.5" />}
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* หมายเหตุ — staff note saved with the customer (tb_users.userNote) */}
      <Field label="หมายเหตุ (พนักงานบันทึก)" hint="ไม่บังคับ · เช่น ที่มาของลูกค้า / สินค้าที่สนใจ / สิ่งที่ต้องตามต่อ">
        <div className="relative">
          <StickyNote className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${inputCls} min-h-[64px] pl-9`}
            placeholder="พิมพ์หมายเหตุเกี่ยวกับลูกค้ารายนี้…"
            maxLength={2000}
          />
        </div>
      </Field>

      {/* นิติบุคคล toggle */}
      <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-sm cursor-pointer select-none">
        <input type="checkbox" checked={isJuristic} onChange={(e) => setIsJuristic(e.target.checked)} className="h-4 w-4 rounded border-border" />
        <Building2 className="h-4 w-4 text-blue-600" />
        <span>ลูกค้านิติบุคคล (มีข้อมูลบริษัท + เลขผู้เสียภาษี)</span>
      </label>

      {isJuristic && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 dark:bg-blue-900/10 p-4 space-y-4">
          <Field label="ชื่อบริษัท" required>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputCls} placeholder="บริษัท ตัวอย่าง จำกัด" autoComplete="off" />
          </Field>
          <Field label="เลขประจำตัวผู้เสียภาษี" required hint="13 หลัก">
            <input value={taxId} onChange={(e) => setTaxId(e.target.value)} className={inputCls} placeholder="0105564077716" inputMode="numeric" maxLength={13} autoComplete="off" />
          </Field>
          <Field label="ที่อยู่บริษัท" hint="ไม่บังคับ">
            <textarea value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} className={`${inputCls} min-h-[64px]`} placeholder="ที่อยู่สำหรับออกใบกำกับภาษี" />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Link href="/admin/customers" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt">
          ยกเลิก
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {pending ? "กำลังสร้าง..." : "สร้างลูกค้า"}
        </button>
      </div>
    </form>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:border-primary-400 focus:outline-none";

// High-level service lines (match the admin sidebar SERVICES + the ecosystem
// catalogue). Selected chips are composed into the customer note by the action.
const SERVICE_OPTIONS = [
  "ฝากสั่งซื้อ",
  "ฝากโอน/โอนหยวน",
  "ฝากนำเข้า",
  "ส่งออก",
  "พิธีการศุลกากร",
  "ใบกำกับภาษี/ใบขน",
  "ขนส่งในประเทศ",
  "ฝากขาย",
  "อื่นๆ",
] as const;

/** Absolute URL of the customer's magic-login page (`/k/<token>`). Client-only
 *  (CreatedPanel renders after a successful create) — guarded for SSR safety. */
function customerLoginUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/k/${token}`;
}

function Field({
  label, children, required, hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-red-500">*</span>}
        {hint && <span className="font-normal text-muted">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * Post-create success panel — reveals the minted member code + the (once-only)
 * password with copy buttons, plus links to the new customer + to add another.
 */
function CreatedPanel({ data, onAddAnother }: { data: AdminCreateCustomerData; onAddAnother: () => void }) {
  return (
    <div className="rounded-2xl border border-green-200 bg-green-50/60 dark:bg-green-900/10 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Check className="h-5 w-5 text-green-600" />
        <h2 className="text-lg font-semibold text-green-800 dark:text-green-300">สร้างลูกค้าสำเร็จ</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CopyRow label="รหัสสมาชิก" value={data.memberCode} />
        <CopyRow label={data.generated ? "รหัสผ่าน (สุ่มให้)" : "รหัสผ่าน"} value={data.password} />
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ⚠️ ส่งรหัสผ่านนี้ให้ลูกค้าทันที — จะไม่แสดงอีก (รีเซ็ตได้ที่หน้ารายละเอียดลูกค้า)
      </p>

      {/* Magic-login link (owner 2026-06-22) — non-expiring, OTP-gated. */}
      <div className="rounded-lg border border-primary-200 bg-primary-50/50 dark:bg-primary-900/10 p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-primary-700">
          <Link2 className="h-4 w-4" /> ลิงก์เข้าสู่ระบบสำหรับลูกค้า
        </div>
        <p className="text-xs text-muted">
          ส่งลิงก์นี้ให้ลูกค้า — กดแล้วขอ OTP ทาง SMS เพื่อเข้าบัญชีของตัวเองได้เลย (ลิงก์ไม่มีวันหมดอายุ · ต้องผ่าน OTP ทุกครั้ง)
        </p>
        <CopyRow label="ลิงก์เฉพาะลูกค้า" value={customerLoginUrl(data.loginLinkToken)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-green-200 pt-4">
        <Link
          href={`/admin/customers/${data.memberCode}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
        >
          เปิดโปรไฟล์ลูกค้า <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={onAddAnother}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt"
        >
          <UserPlus className="h-4 w-4" /> เพิ่มลูกค้าอีกคน
        </button>
        <Link href="/admin/customers" className="text-sm text-primary-600 hover:underline ml-1">
          ← กลับรายการลูกค้า
        </Link>
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Non-secure context — admin can still read it on screen.
    }
  }
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 font-mono text-sm font-bold">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white dark:bg-surface text-muted hover:bg-surface-alt"
          title="คัดลอก"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
