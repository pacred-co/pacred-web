"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpsertCarrier } from "@/actions/admin/carriers";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Initial = {
  name_th:               string;
  name_en:               string;
  tracking_url_template: string;
  sort_order:            number;
  note:                  string;
};

type Props =
  | { mode: "create"; id?: never; initial?: never }
  | { mode: "edit"; id: string; initial: Initial };

/**
 * Carrier upsert form (U2-3). Used in 2 modes:
 *   - create: bottom panel of /admin/carriers (always visible)
 *   - edit:   inline expansion when admin clicks ✏️ on a row
 *
 * Code field is REQUIRED in create, READ-ONLY (hidden) in edit per
 * action contract (code immutable to preserve future FK references).
 */

export function CarrierForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [code,    setCode]    = useState("");
  const [nameTh,  setNameTh]  = useState(props.mode === "edit" ? props.initial.name_th  : "");
  const [nameEn,  setNameEn]  = useState(props.mode === "edit" ? props.initial.name_en  : "");
  const [trkUrl,  setTrkUrl]  = useState(props.mode === "edit" ? props.initial.tracking_url_template : "");
  const [sortOrd, setSortOrd] = useState(props.mode === "edit" ? props.initial.sort_order : 100);
  const [note,    setNote]    = useState(props.mode === "edit" ? props.initial.note ?? "" : "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await adminUpsertCarrier({
        id:                    props.mode === "edit" ? props.id : undefined,
        code:                  props.mode === "create" ? code.trim().toLowerCase() : undefined,
        name_th:               nameTh.trim(),
        name_en:               nameEn.trim(),
        tracking_url_template: trkUrl.trim() || null,
        sort_order:            sortOrd,
        note:                  note.trim() || null,
      });
      if (res.ok) {
        setMsg(props.mode === "create" ? "เพิ่มขนส่งเรียบร้อย" : "บันทึกแล้ว");
        if (props.mode === "create") {
          // Reset form
          setCode(""); setNameTh(""); setNameEn(""); setTrkUrl(""); setSortOrd(100); setNote("");
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
            placeholder="spx, jnt, flash, ems, lalamove, ..."
            required
            disabled={pending}
          />
        </label>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ชื่อภาษาไทย <span className="text-red-500">*</span></span>
          <input value={nameTh} onChange={(e) => setNameTh(e.target.value)} className={inputCls} required disabled={pending} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">ชื่อภาษาอังกฤษ <span className="text-red-500">*</span></span>
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputCls} required disabled={pending} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">
          Tracking URL template
          <span className="ml-2 text-muted">(ใช้ <code className="font-mono">{"{tracking}"}</code> เป็น placeholder)</span>
        </span>
        <input
          value={trkUrl}
          onChange={(e) => setTrkUrl(e.target.value)}
          className={inputCls + " font-mono text-xs"}
          placeholder="https://example.com/track?no={tracking}"
          disabled={pending}
        />
      </label>

      <div className="grid sm:grid-cols-[1fr_2fr] gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ลำดับการแสดง</span>
          <input
            type="number"
            value={sortOrd}
            onChange={(e) => setSortOrd(Number.isFinite(+e.target.value) ? +e.target.value : 100)}
            min={0}
            max={9999}
            className={inputCls}
            disabled={pending}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">หมายเหตุ (admin only)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
            placeholder="เช่น: เบอร์ติดต่อ, รายละเอียดสัญญา, อัตราพิเศษ"
            disabled={pending}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "กำลังบันทึก..." : props.mode === "create" ? "+ เพิ่มขนส่ง" : "บันทึกการแก้ไข"}
      </button>
    </form>
  );
}
