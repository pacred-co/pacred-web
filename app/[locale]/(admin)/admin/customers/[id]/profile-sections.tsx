"use client";

/**
 * Interactive admin customer-profile sections — the editable surfaces of
 * the legacy `users/profile` page, Pacred-polished (Tailwind, no Bootstrap).
 * (เดฟ 2026-05-30)
 *
 * Bundles five legacy features as client components driven by the new
 * server actions in actions/admin/customer-profile.ts:
 *   • StatCards        — 8 cards (legacy profile.php L75-129 + L198-389)
 *   • NoteEditor       — inline edit tb_users.userNote
 *   • SaleRepEditor    — editSale → tb_users.adminIDSale (dropdown of admins)
 *   • CorporateEditor  — edit tb_corporate (UPDATE-only, file deferred)
 *   • AddressManager   — tb_address CRUD + set-main / first-auto-main rule
 *
 * Kept disjoint from rate-editor.tsx (the parallel agent / rate work) — this
 * file owns ONLY the non-rate editable profile sections.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  Pencil, Save, Plus, Trash2, Star, Check, AlertTriangle,
  Package, Ship, Wallet, ArrowDownCircle, CreditCard, ArrowUpCircle, Gift, ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import {
  adminUpdateUserNote,
  adminUpdateUserSaleRep,
  adminUpdateCorporate,
  adminAddAddress,
  adminUpdateAddress,
  adminDeleteAddress,
  adminSetMainAddress,
  type CustomerStatCounts,
  type SalesAdminOption,
} from "@/actions/admin/customer-profile";
import { adminUpdateUserIdentity } from "@/actions/admin/customers";

// ── shared types (mirror the legacy-view row shapes) ──────────────────────
export type ProfileCorp = {
  corporatename: string | null;
  corporatenumber: string | null;
  corporateaddress: string | null;
  corporatestatus: string | null;
};
export type ProfileAddress = {
  addressid: number;
  addressname: string | null;
  addresslastname: string | null;
  addresstel: string | null;
  addresstel2: string | null;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
  addressnote: string | null;
};

// ── tiny shared section shell (matches legacy-view's card style) ──────────
function SectionShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{msg}</span>
    </div>
  );
}
function OkBox({ msg }: { msg: string }) {
  return <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">✓ {msg}</div>;
}

// ──────────────────────────────────────────────────────────────────────────
// 0) Identity editor — edit tb_users core fields (P0-17 · adm-08 WF#4)
// Faithful port of the legacy editUser modal + users.php `update` POST.
// Fields (all roles): name · lastname · email · tel · sex · birthday ·
//   lineId · facebook. Senior-only (super/manager/accounting/qa): rep + coID.
// ──────────────────────────────────────────────────────────────────────────
export type IdentityValues = {
  userName: string;
  userLastName: string;
  userEmail: string;
  userTel: string;
  userSex: string;        // 2026-06-05 (ภูม flag #2) canonical = ภาษาไทย "ชาย"/"หญิง"/"" (legacy SOT)
  userBirthday: string;   // YYYY-MM-DD | ""
  userLineID: string;
  userFacebook: string;
  adminIDSale: string;
  coID: string;
};

// 2026-06-05 (ภูม flag #2) — sex display helper. tb_users.userSex canonical =
// ภาษาไทย "ชาย"/"หญิง" (legacy + customer EditProfileForm). Accept English
// fallback for legacy data that might've been written via the rebuilt path.
function sexDisplay(s: string): string {
  if (s === "ชาย" || s === "male") return "ชาย";
  if (s === "หญิง" || s === "female") return "หญิง";
  return "—";
}

export function IdentityEditor({
  userid,
  initial,
  isSenior,
  admins,
}: {
  userid: string;
  initial: IdentityValues;
  isSenior: boolean;
  admins: SalesAdminOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<IdentityValues>(initial);

  function set<K extends keyof IdentityValues>(k: K, val: IdentityValues[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  function save() {
    setError(null);
    if (!v.userName.trim() || !v.userLastName.trim()) { setError("กรอกชื่อและนามสกุล"); return; }
    if (!/^\d{9,10}$/.test(v.userTel.trim())) { setError("เบอร์โทร 9-10 หลัก (ไม่มีขีด)"); return; }
    start(async () => {
      const res = await adminUpdateUserIdentity({
        userid,
        userName:     v.userName.trim(),
        userLastName: v.userLastName.trim(),
        userEmail:    v.userEmail.trim(),
        userTel:      v.userTel.trim(),
        // 2026-06-05 (ภูม flag #2) — schema preprocess accepts both English +
        // Thai input + normalizes to Thai. Pass through as-is (form sends Thai).
        userSex:      v.userSex,
        userBirthday: v.userBirthday.trim(),
        userLineID:   v.userLineID.trim(),
        userFacebook: v.userFacebook.trim(),
        ...(isSenior ? { adminIDSale: v.adminIDSale.trim(), coID: v.coID.trim() } : {}),
      });
      if (!res.ok) { setError(res.error); return; }
      setEditing(false);
      router.refresh();
    });
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

  return (
    <SectionShell
      title="ข้อมูลส่วนตัวลูกค้า"
      action={
        !editing ? (
          <button
            type="button"
            onClick={() => { setV(initial); setEditing(true); }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-alt"
          >
            <Pencil className="w-3.5 h-3.5" /> แก้ไขข้อมูลลูกค้า
          </button>
        ) : null
      }
    >
      <div className="p-4 space-y-3">
        {error && <ErrBox msg={error} />}
        {!editing ? (
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <IdField label="ชื่อจริง" value={initial.userName || "—"} />
            <IdField label="นามสกุล" value={initial.userLastName || "—"} />
            <IdField label="อีเมล" value={initial.userEmail || "—"} />
            <IdField label="โทรศัพท์" value={initial.userTel || "—"} />
            <IdField label="เพศ" value={sexDisplay(initial.userSex)} />
            <IdField label="วันเกิด" value={initial.userBirthday || "—"} />
            <IdField label="LINE ID" value={initial.userLineID || "—"} />
            <IdField label="Facebook" value={initial.userFacebook || "—"} />
          </dl>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <Labeled label="ชื่อจริง *"><input className={inputCls} value={v.userName} onChange={(e) => set("userName", e.target.value)} maxLength={200} /></Labeled>
            <Labeled label="นามสกุล *"><input className={inputCls} value={v.userLastName} onChange={(e) => set("userLastName", e.target.value)} maxLength={200} /></Labeled>
            <Labeled label="อีเมล"><input className={inputCls} value={v.userEmail} onChange={(e) => set("userEmail", e.target.value)} type="email" maxLength={100} placeholder="(เว้นว่างได้)" /></Labeled>
            <Labeled label="โทรศัพท์ *"><input className={inputCls} value={v.userTel} onChange={(e) => set("userTel", e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="0812345678" /></Labeled>
            <Labeled label="เพศ">
              {/* 2026-06-05 (ภูม flag #2) — value = ภาษาไทย ตรงกับ tb_users
                  canonical · ฟอร์มลูกค้า EditProfileForm ก็ส่ง Thai · ห้ามใช้
                  English ที่นี่อีก (กัน split-brain). */}
              <select className={inputCls} value={v.userSex} onChange={(e) => set("userSex", e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                <option value="ชาย">ชาย</option>
                <option value="หญิง">หญิง</option>
              </select>
            </Labeled>
            <Labeled label="วันเกิด"><input className={inputCls} value={v.userBirthday} onChange={(e) => set("userBirthday", e.target.value)} type="date" /></Labeled>
            <Labeled label="LINE ID"><input className={inputCls} value={v.userLineID} onChange={(e) => set("userLineID", e.target.value)} maxLength={50} /></Labeled>
            <Labeled label="Facebook"><input className={inputCls} value={v.userFacebook} onChange={(e) => set("userFacebook", e.target.value)} maxLength={255} /></Labeled>

            {isSenior && (
              <>
                <Labeled label="เซลล์ผู้ดูแล (adminIDSale)">
                  <select className={inputCls} value={v.adminIDSale} onChange={(e) => set("adminIDSale", e.target.value)}>
                    <option value="">— ไม่กำหนด —</option>
                    {admins.map((a) => (
                      <option key={a.adminID} value={a.adminID}>{a.name} ({a.adminID})</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="กลุ่มลูกค้า (coID)"><input className={inputCls} value={v.coID} onChange={(e) => set("coID", e.target.value)} maxLength={10} placeholder="PCS" /></Labeled>
              </>
            )}

            <div className="sm:col-span-2 flex gap-2 pt-1">
              <Button type="button" onClick={save} disabled={pending}>
                <Save className="w-4 h-4 mr-1" /> {pending ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
              <button type="button" onClick={() => { setEditing(false); setError(null); }} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-alt">
                ยกเลิก
              </button>
            </div>
          </div>
        )}
        {isSenior ? null : (
          <p className="text-[11px] text-muted">การเปลี่ยนเซลล์ผู้ดูแล + กลุ่มลูกค้า ทำได้เฉพาะระดับผู้จัดการ/บัญชี/QA</p>
        )}
      </div>
    </SectionShell>
  );
}

function IdField({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </>
  );
}
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 1) Stat cards — 8 cards (faithful to legacy profile.php tiles)
// ──────────────────────────────────────────────────────────────────────────
export function StatCards({
  userid,
  walletBalance,
  counts,
}: {
  userid: string;
  walletBalance: number;
  counts: CustomerStatCounts;
}) {
  const enc = encodeURIComponent(userid);
  const fmtInt = (n: number | null) => (n == null ? "—" : n.toLocaleString());

  const cards: {
    label: string;
    value: string;
    icon: React.ReactNode;
    href?: string;
    accent: string;
    unverified?: boolean;
  }[] = [
    { label: "ฝากสั่งซื้อสินค้า", value: fmtInt(counts.shop), icon: <ShoppingCart className="w-5 h-5" />, href: `/admin/service-orders?q=${enc}`, accent: "text-sky-600 bg-sky-50" },
    { label: "ฝากนำเข้าสินค้า", value: fmtInt(counts.forwarder), icon: <Package className="w-5 h-5" />, href: `/admin/forwarders?focus=search&q=${enc}`, accent: "text-indigo-600 bg-indigo-50" },
    { label: "ฝากชำระเงิน/โอน", value: fmtInt(counts.payment), icon: <Ship className="w-5 h-5" />, href: `/admin/yuan-payments?q=${enc}`, accent: "text-violet-600 bg-violet-50" },
    { label: "กระเป๋าสตางค์ (฿)", value: `฿${walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: <Wallet className="w-5 h-5" />, href: `/admin/wallet?userid=${enc}`, accent: "text-primary-600 bg-primary-50" },
    { label: "รายการเติมเงิน", value: fmtInt(counts.walletAdd), icon: <ArrowDownCircle className="w-5 h-5" />, href: `/admin/wallet?userid=${enc}`, accent: "text-emerald-600 bg-emerald-50" },
    { label: "รายการชำระเงิน", value: fmtInt(counts.walletPay), icon: <CreditCard className="w-5 h-5" />, href: `/admin/wallet?userid=${enc}`, accent: "text-amber-600 bg-amber-50" },
    { label: "รายการถอนเงิน", value: fmtInt(counts.walletWithdraw), icon: <ArrowUpCircle className="w-5 h-5" />, href: `/admin/wallet?userid=${enc}`, accent: "text-rose-600 bg-rose-50" },
    { label: "ประวัติ Cash Back", value: fmtInt(counts.cashBack), icon: <Gift className="w-5 h-5" />, accent: "text-fuchsia-600 bg-fuchsia-50" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards.map((c) => {
        const inner = (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 h-full flex flex-col gap-1.5 hover:border-primary-300 transition-colors">
            <span className={`inline-flex w-9 h-9 items-center justify-center rounded-xl ${c.accent}`}>{c.icon}</span>
            <p className="text-[11px] text-muted leading-tight mt-1">{c.label}</p>
            <p className="text-xl font-bold font-mono tabular-nums">{c.value}</p>
          </div>
        );
        return c.href ? (
          <Link key={c.label} href={c.href} className="block">
            {inner}
          </Link>
        ) : (
          <div key={c.label}>{inner}</div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 2) Note editor — inline edit tb_users.userNote
// ──────────────────────────────────────────────────────────────────────────
export function NoteEditor({ userid, initialNote }: { userid: string; initialNote: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote ?? "");
  const [draft, setDraft] = useState(initialNote ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    start(async () => {
      const res = await adminUpdateUserNote({ userid, note: draft });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNote(draft.trim());
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <SectionShell
      title="หมายเหตุภายใน (โน้ตทีม)"
      action={
        !editing ? (
          <button
            type="button"
            onClick={() => {
              setDraft(note);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
          >
            <Pencil className="w-3.5 h-3.5" /> แก้ไข
          </button>
        ) : null
      }
    >
      <div className="p-4 space-y-3 text-sm">
        {error && <ErrBox msg={error} />}
        {!editing ? (
          note ? (
            <p className="whitespace-pre-wrap text-foreground">{note}</p>
          ) : (
            <p className="text-muted italic">ยังไม่มีหมายเหตุ — กด &ldquo;แก้ไข&rdquo; เพื่อเพิ่ม</p>
          )
        ) : (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={pending}
              rows={4}
              maxLength={2000}
              placeholder="หมายเหตุภายในเกี่ยวกับลูกค้ารายนี้ (เห็นเฉพาะทีมงาน)"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
            />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(false)}>
                ยกเลิก
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={save}>
                <Save className="size-4" /> {pending ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </>
        )}
      </div>
    </SectionShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 3) Sale-rep editor — editSale → tb_users.adminIDSale
// ──────────────────────────────────────────────────────────────────────────
export function SaleRepEditor({
  userid,
  currentRep,
  admins,
}: {
  userid: string;
  currentRep: string | null;
  admins: SalesAdminOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [rep, setRep] = useState(currentRep ?? "");
  const [choice, setChoice] = useState(currentRep ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    if (!choice) {
      setError("เลือกเซลล์ผู้ดูแล");
      return;
    }
    start(async () => {
      const res = await adminUpdateUserSaleRep({ userid, adminID: choice });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRep(choice);
      setEditing(false);
      router.refresh();
    });
  }

  const repLabel = (() => {
    const found = admins.find((a) => a.adminID === rep);
    if (found) return `${found.nickname ? found.nickname + " · " : ""}${found.name} (${found.adminID})`;
    return rep || "ยังไม่กำหนด";
  })();

  return (
    <div className="rounded-xl border border-border bg-surface-alt/30 px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-[11px] text-muted">เซลล์ผู้ดูแล (adminIDSale)</p>
        {!editing ? (
          <p className="font-medium truncate">{repLabel}</p>
        ) : (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              disabled={pending}
              className="rounded-lg border border-border px-2 py-1.5 text-sm bg-white dark:bg-surface focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            >
              <option value="">— เลือกเซลล์ —</option>
              {admins.map((a) => (
                <option key={a.adminID} value={a.adminID}>
                  {a.nickname ? `${a.nickname} · ` : ""}{a.name} ({a.adminID})
                </option>
              ))}
            </select>
          </div>
        )}
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        {editing && admins.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">ไม่พบเซลล์ที่ active ใน tb_admin</p>
        )}
      </div>
      {!editing ? (
        <button
          type="button"
          onClick={() => {
            setChoice(rep);
            setEditing(true);
          }}
          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" /> แก้ไข
        </button>
      ) : (
        <div className="flex gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(false)}>
            ยกเลิก
          </Button>
          <Button type="button" size="sm" disabled={pending} onClick={save}>
            <Save className="size-4" /> {pending ? "..." : "บันทึก"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 4) Corporate editor — edit tb_corporate (UPDATE-only, file deferred)
// ──────────────────────────────────────────────────────────────────────────
export function CorporateEditor({ userid, corp }: { userid: string; corp: ProfileCorp | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    corporatenumber: corp?.corporatenumber ?? "",
    corporatename: corp?.corporatename ?? "",
    corporateaddress: corp?.corporateaddress ?? "",
  });

  function save() {
    setError(null);
    start(async () => {
      const res = await adminUpdateCorporate({ userid, ...form });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  // No corporate row → nothing to edit (legacy is UPDATE-only).
  const canEdit = !!corp;

  return (
    <SectionShell
      title="ข้อมูลบริษัท (นิติบุคคล)"
      action={
        canEdit && !editing ? (
          <button
            type="button"
            onClick={() => {
              setForm({
                corporatenumber: corp?.corporatenumber ?? "",
                corporatename: corp?.corporatename ?? "",
                corporateaddress: corp?.corporateaddress ?? "",
              });
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
          >
            <Pencil className="w-3.5 h-3.5" /> แก้ไข
          </button>
        ) : null
      }
    >
      <div className="p-4 space-y-3 text-sm">
        {error && <ErrBox msg={error} />}
        {!corp ? (
          <p className="text-muted">
            ลูกค้าเลือกประเภทนิติบุคคลแต่ยังไม่ได้กรอกข้อมูลบริษัท — แก้ไขได้เมื่อลูกค้ากรอกข้อมูลบริษัทจากฝั่งสมาชิกแล้ว
          </p>
        ) : !editing ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <KV label="ชื่อบริษัท" value={corp.corporatename ?? "-"} />
            <KV label="เลขผู้เสียภาษี" value={corp.corporatenumber ?? "-"} mono />
            <KV label="สถานะอนุมัติ" value={corp.corporatestatus === "1" ? "อนุมัติแล้ว" : "รออนุมัติ"} />
            <KV label="ที่อยู่บริษัท" value={corp.corporateaddress ?? "-"} />
          </div>
        ) : (
          <>
            <Field label="ชื่อบริษัท">
              <input
                type="text"
                value={form.corporatename}
                disabled={pending}
                maxLength={300}
                onChange={(e) => setForm((f) => ({ ...f, corporatename: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="เลขผู้เสียภาษี (13 หลัก)">
              <input
                type="text"
                inputMode="numeric"
                value={form.corporatenumber}
                disabled={pending}
                maxLength={13}
                onChange={(e) => setForm((f) => ({ ...f, corporatenumber: e.target.value.replace(/\D/g, "") }))}
                className={`${inputCls} font-mono`}
              />
            </Field>
            <Field label="ที่อยู่บริษัท">
              <textarea
                value={form.corporateaddress}
                disabled={pending}
                rows={2}
                maxLength={2000}
                onChange={(e) => setForm((f) => ({ ...f, corporateaddress: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              อัปโหลดเอกสาร (หนังสือรับรอง / ภพ.20) = รอบหน้า
            </p>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(false)}>
                ยกเลิก
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={save}>
                <Save className="size-4" /> {pending ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </>
        )}
      </div>
    </SectionShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 5) Address manager — tb_address CRUD + set-main
// ──────────────────────────────────────────────────────────────────────────
type AddressForm = {
  addressname: string;
  addresslastname: string;
  addresstel: string;
  addresstel2: string;
  addressno: string;
  addresssubdistrict: string;
  addressdistrict: string;
  addressprovince: string;
  addresszipcode: string;
  addressnote: string;
};
const emptyAddress: AddressForm = {
  addressname: "", addresslastname: "", addresstel: "", addresstel2: "",
  addressno: "", addresssubdistrict: "", addressdistrict: "", addressprovince: "",
  addresszipcode: "", addressnote: "",
};

export function AddressManager({
  userid,
  addresses,
  mainAddressId,
}: {
  userid: string;
  addresses: ProfileAddress[];
  mainAddressId: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // mode: null = list; "add" = new-address form; number = editing that addressid
  const [mode, setMode] = useState<null | "add" | number>(null);
  const [form, setForm] = useState<AddressForm>(emptyAddress);

  function openAdd() {
    setError(null);
    setSuccess(null);
    setForm(emptyAddress);
    setMode("add");
  }
  function openEdit(a: ProfileAddress) {
    setError(null);
    setSuccess(null);
    setForm({
      addressname: a.addressname ?? "",
      addresslastname: a.addresslastname ?? "",
      addresstel: a.addresstel ?? "",
      addresstel2: a.addresstel2 ?? "",
      addressno: a.addressno ?? "",
      addresssubdistrict: a.addresssubdistrict ?? "",
      addressdistrict: a.addressdistrict ?? "",
      addressprovince: a.addressprovince ?? "",
      addresszipcode: a.addresszipcode ?? "",
      addressnote: a.addressnote ?? "",
    });
    setMode(a.addressid);
  }

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 5000);
  }

  function submit() {
    setError(null);
    start(async () => {
      const res =
        mode === "add"
          ? await adminAddAddress({ userid, ...form })
          : await adminUpdateAddress({ userid, addressid: mode as number, ...form });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMode(null);
      flash(mode === "add" ? "เพิ่มที่อยู่แล้ว" : "อัปเดตที่อยู่แล้ว");
      router.refresh();
    });
  }

  function setMain(addressid: number) {
    setError(null);
    start(async () => {
      const res = await adminSetMainAddress({ userid, addressid });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      flash("ตั้งเป็นที่อยู่หลักแล้ว");
      router.refresh();
    });
  }

  async function remove(addressid: number) {
    setError(null);
    if (!(await confirm("ยืนยันลบที่อยู่นี้?"))) return;
    start(async () => {
      const res = await adminDeleteAddress({ userid, addressid });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      flash("ลบที่อยู่แล้ว");
      router.refresh();
    });
  }

  return (
    <SectionShell
      title={`ที่อยู่จัดส่ง (${addresses.length})`}
      action={
        mode === null ? (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มที่อยู่
          </button>
        ) : null
      }
    >
      <div className="p-4 space-y-3">
        {error && <ErrBox msg={error} />}
        {success && <OkBox msg={success} />}

        {/* Add / edit form */}
        {mode !== null && (
          <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-4 space-y-3">
            <p className="text-sm font-semibold">{mode === "add" ? "เพิ่มที่อยู่จัดส่ง" : "แก้ไขที่อยู่จัดส่ง"}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="ชื่อจริง">
                <input className={inputCls} disabled={pending} value={form.addressname} maxLength={200}
                  onChange={(e) => setForm((f) => ({ ...f, addressname: e.target.value }))} />
              </Field>
              <Field label="นามสกุล">
                <input className={inputCls} disabled={pending} value={form.addresslastname} maxLength={200}
                  onChange={(e) => setForm((f) => ({ ...f, addresslastname: e.target.value }))} />
              </Field>
              <Field label="เบอร์โทร (ไม่มีขีด)">
                <input className={`${inputCls} font-mono`} disabled={pending} value={form.addresstel} inputMode="numeric" maxLength={10}
                  onChange={(e) => setForm((f) => ({ ...f, addresstel: e.target.value.replace(/\D/g, "") }))} />
              </Field>
              <Field label="เบอร์สำรอง (ไม่จำเป็น)">
                <input className={`${inputCls} font-mono`} disabled={pending} value={form.addresstel2} inputMode="numeric" maxLength={10}
                  onChange={(e) => setForm((f) => ({ ...f, addresstel2: e.target.value.replace(/\D/g, "") }))} />
              </Field>
            </div>
            <Field label="ที่อยู่ (บ้านเลขที่ ถนน ซอย หมู่บ้าน หมู่ที่)">
              <input className={inputCls} disabled={pending} value={form.addressno} maxLength={200}
                onChange={(e) => setForm((f) => ({ ...f, addressno: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="ตำบล/แขวง">
                <input className={inputCls} disabled={pending} value={form.addresssubdistrict} maxLength={255}
                  onChange={(e) => setForm((f) => ({ ...f, addresssubdistrict: e.target.value }))} />
              </Field>
              <Field label="อำเภอ/เขต">
                <input className={inputCls} disabled={pending} value={form.addressdistrict} maxLength={255}
                  onChange={(e) => setForm((f) => ({ ...f, addressdistrict: e.target.value }))} />
              </Field>
              <Field label="จังหวัด">
                <input className={inputCls} disabled={pending} value={form.addressprovince} maxLength={255}
                  onChange={(e) => setForm((f) => ({ ...f, addressprovince: e.target.value }))} />
              </Field>
              <Field label="รหัสไปรษณีย์">
                <input className={`${inputCls} font-mono`} disabled={pending} value={form.addresszipcode} inputMode="numeric" maxLength={5}
                  onChange={(e) => setForm((f) => ({ ...f, addresszipcode: e.target.value.replace(/\D/g, "") }))} />
              </Field>
            </div>
            <Field label="หมายเหตุ (ไม่จำเป็น)">
              <input className={inputCls} disabled={pending} value={form.addressnote} maxLength={255}
                onChange={(e) => setForm((f) => ({ ...f, addressnote: e.target.value }))} />
            </Field>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setMode(null)}>
                ยกเลิก
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={submit}>
                <Save className="size-4" /> {pending ? "กำลังบันทึก..." : mode === "add" ? "เพิ่มที่อยู่" : "อัปเดต"}
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {addresses.length === 0 ? (
          mode === null ? <p className="p-4 text-center text-sm text-muted">ยังไม่มีที่อยู่จัดส่ง</p> : null
        ) : (
          <ul className="divide-y divide-border">
            {addresses.map((ad) => {
              const isMain = ad.addressid === mainAddressId;
              const recipient = `${ad.addressname ?? ""} ${ad.addresslastname ?? ""}`.trim() || "-";
              const phones = [ad.addresstel, ad.addresstel2].filter(Boolean).join(" · ") || "-";
              const line = [
                ad.addressno,
                ad.addresssubdistrict ? `ต.${ad.addresssubdistrict}` : null,
                ad.addressdistrict ? `อ.${ad.addressdistrict}` : null,
                ad.addressprovince ? `จ.${ad.addressprovince}` : null,
                ad.addresszipcode,
              ].filter(Boolean).join(" ");
              return (
                <li key={ad.addressid} className="py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{recipient}</span>
                        {isMain ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary-500 text-white px-2 py-0.5 text-[10px]">
                            <Star className="w-3 h-3" /> ที่อยู่หลัก
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted">📞 {phones}</p>
                      <p className="text-xs">{line || "-"}</p>
                      {ad.addressnote ? <p className="text-xs text-muted italic">หมายเหตุ: {ad.addressnote}</p> : null}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isMain && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setMain(ad.addressid)}
                          title="ตั้งเป็นที่อยู่หลัก"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" /> ตั้งหลัก
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => openEdit(ad)}
                        title="แก้ไข"
                        className="inline-flex items-center justify-center rounded-md border border-border w-7 h-7 hover:bg-surface-alt disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pending || isMain}
                        onClick={() => remove(ad.addressid)}
                        title={isMain ? "ลบที่อยู่หลักไม่ได้" : "ลบ"}
                        className="inline-flex items-center justify-center rounded-md border border-red-200 text-red-600 w-7 h-7 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SectionShell>
  );
}

// ── shared tiny helpers ────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-border px-3 py-2 text-sm bg-white dark:bg-surface focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5 gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className={mono ? "font-mono text-right" : "text-right"}>{value}</span>
    </div>
  );
}
