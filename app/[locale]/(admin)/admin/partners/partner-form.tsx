"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpsertPartner } from "@/actions/admin/partners";
import { PARTNER_TYPES, PARTNER_TYPE_LABELS_TH, type PartnerInitial } from "./types";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props =
  | { mode: "create"; id?: never; initial?: never }
  | { mode: "edit"; id: string; initial: PartnerInitial };

/**
 * Partner upsert form (CLAUDE.md §PM-6 #3). Two modes:
 *   - create: bottom panel of /admin/partners (always visible)
 *   - edit:   inline expansion when admin clicks ✏️ on a row
 *
 * `code` is REQUIRED in create, HIDDEN in edit (immutable per action contract,
 * to avoid orphaning future integration links).
 */
export function PartnerForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const init = props.mode === "edit" ? props.initial : undefined;
  const [code,    setCode]    = useState("");
  const [name,    setName]    = useState(init?.name          ?? "");
  const [nameEn,  setNameEn]  = useState(init?.name_en       ?? "");
  const [type,    setType]    = useState<string>(init?.partner_type ?? "other");
  const [cName,   setCName]   = useState(init?.contact_name  ?? "");
  const [cPhone,  setCPhone]  = useState(init?.contact_phone ?? "");
  const [cEmail,  setCEmail]  = useState(init?.contact_email ?? "");
  const [note,    setNote]    = useState(init?.note          ?? "");
  const [sort,    setSort]    = useState(init?.sort          ?? 100);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await adminUpsertPartner({
        id:            props.mode === "edit" ? props.id : undefined,
        code:          props.mode === "create" ? code.trim().toLowerCase() : undefined,
        name:          name.trim(),
        name_en:       nameEn.trim() || null,
        partner_type:  type as (typeof PARTNER_TYPES)[number],
        contact_name:  cName.trim() || null,
        contact_phone: cPhone.trim() || null,
        contact_email: cEmail.trim() || null,
        note:          note.trim() || null,
        sort,
      });
      if (res.ok) {
        setMsg(props.mode === "create" ? "เพิ่มพาร์ทเนอร์เรียบร้อย" : "บันทึกแล้ว");
        if (props.mode === "create") {
          setCode(""); setName(""); setNameEn(""); setType("other");
          setCName(""); setCPhone(""); setCEmail(""); setNote(""); setSort(100);
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

      {props.mode === "create" && (
        <label className="block space-y-1">
          <span className="text-xs font-medium">
            Code <span className="text-red-500">*</span>
            <span className="ml-2 text-muted">(2-32 ตัว · lowercase + 0-9 + _ · เปลี่ยนไม่ได้ภายหลัง)</span>
          </span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32))}
            className={inputCls + " font-mono"}
            placeholder="gogo, jmf, ttp, momo, cargothai, sang, ..."
            required
            disabled={pending}
          />
        </label>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ชื่อพาร์ทเนอร์ <span className="text-red-500">*</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required disabled={pending} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">ชื่อภาษาอังกฤษ <span className="text-muted">(ถ้ามี)</span></span>
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputCls} disabled={pending} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">ประเภท</span>
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls} disabled={pending}>
          {PARTNER_TYPES.map((t) => (
            <option key={t} value={t}>{PARTNER_TYPE_LABELS_TH[t]}</option>
          ))}
        </select>
      </label>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ชื่อผู้ติดต่อ</span>
          <input value={cName} onChange={(e) => setCName(e.target.value)} className={inputCls} disabled={pending} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">เบอร์โทร</span>
          <input value={cPhone} onChange={(e) => setCPhone(e.target.value)} className={inputCls} disabled={pending} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">อีเมล</span>
          <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} className={inputCls} disabled={pending} />
        </label>
      </div>

      <div className="grid sm:grid-cols-[2fr_1fr] gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">หมายเหตุ (admin only)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
            placeholder="เช่น: เงื่อนไขสัญญา, ลิงก์เรทชีต, เลขบัญชี"
            disabled={pending}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">ลำดับการแสดง</span>
          <input
            type="number"
            value={sort}
            onChange={(e) => setSort(Number.isFinite(+e.target.value) ? +e.target.value : 100)}
            min={0}
            max={9999}
            className={inputCls}
            disabled={pending}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "กำลังบันทึก..." : props.mode === "create" ? "+ เพิ่มพาร์ทเนอร์" : "บันทึกการแก้ไข"}
      </button>
    </form>
  );
}
