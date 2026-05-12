"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createAddress,
  updateAddress,
  setDefaultAddress,
  softDeleteAddress,
  type Address,
} from "@/actions/addresses";
import type { AddressInput } from "@/lib/validators/addresses";

type Props = {
  initialAddresses: Address[];
};

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const emptyForm: AddressInput = {
  first_name: "", last_name: "", phone: "", phone2: "",
  address_line: "", sub_district: "", district: "", province: "",
  postal_code: "", note: "", is_default: false,
};

export function AddressesManager({ initialAddresses }: Props) {
  const router = useRouter();
  const addresses = initialAddresses;
  const [editing, setEditing] = useState<{ mode: "create" } | { mode: "edit"; id: string } | null>(null);
  const [form, setForm] = useState<AddressInput>(emptyForm);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditing({ mode: "create" });
  }

  function openEdit(a: Address) {
    setForm({
      first_name: a.first_name,
      last_name: a.last_name,
      phone: a.phone,
      phone2: a.phone2 ?? "",
      address_line: a.address_line,
      sub_district: a.sub_district,
      district: a.district,
      province: a.province,
      postal_code: a.postal_code,
      note: a.note ?? "",
      latitude: a.latitude ?? undefined,
      longitude: a.longitude ?? undefined,
      is_default: a.is_default,
    });
    setEditing({ mode: "edit", id: a.id });
  }

  function close() {
    setEditing(null);
    setForm(emptyForm);
  }

  // Server actions revalidatePath('/addresses') already invalidates this
  // route's cache — router.refresh() refetches the server component data.
  function refresh() {
    router.refresh();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    startTransition(async () => {
      const res = editing.mode === "create"
        ? await createAddress(form)
        : await updateAddress(editing.id, form);
      if (res.ok) {
        flash("ok", editing.mode === "create" ? "เพิ่มที่อยู่แล้ว" : "บันทึกแล้ว");
        close();
        refresh();
      } else {
        flash("err", res.error);
      }
    });
  }

  function onSetDefault(id: string) {
    startTransition(async () => {
      const res = await setDefaultAddress(id);
      if (res.ok) {
        flash("ok", "ตั้งเป็นที่อยู่หลักแล้ว");
        refresh();
      } else {
        flash("err", res.error);
      }
    });
  }

  function onDelete(a: Address) {
    if (!confirm(`ลบที่อยู่ของ ${a.first_name} ${a.last_name}?`)) return;
    startTransition(async () => {
      const res = await softDeleteAddress(a.id);
      if (res.ok) {
        flash("ok", "ลบแล้ว");
        refresh();
      } else {
        flash("err", res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          msg.kind === "ok"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {msg.text}
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {addresses.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
            ยังไม่มีที่อยู่จัดส่ง
          </div>
        )}
        {addresses.map((a) => (
          <div key={a.id} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{a.first_name} {a.last_name}</span>
                  {a.is_default && (
                    <span className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      ค่าเริ่มต้น
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted">{a.phone}{a.phone2 ? ` / ${a.phone2}` : ""}</p>
                <p className="text-sm text-foreground">
                  {a.address_line} ต.{a.sub_district} อ.{a.district} จ.{a.province} {a.postal_code}
                </p>
                {a.note && <p className="text-xs text-muted">📝 {a.note}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {!a.is_default && (
                  <Button type="button" variant="outline" size="sm" onClick={() => onSetDefault(a.id)} disabled={pending}>
                    ตั้งเป็นหลัก
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(a)} disabled={pending}>
                  แก้ไข
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onDelete(a)} disabled={pending}>
                  ลบ
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add button */}
      {!editing && (
        <div className="flex justify-end">
          <Button type="button" onClick={openCreate}>+ เพิ่มที่อยู่ใหม่</Button>
        </div>
      )}

      {/* Form (inline panel) */}
      {editing && (
        <form onSubmit={onSubmit} className="rounded-2xl border-2 border-primary-500/30 bg-white dark:bg-surface p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-foreground">
            {editing.mode === "create" ? "เพิ่มที่อยู่ใหม่" : "แก้ไขที่อยู่"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อ" required>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="นามสกุล" required>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="เบอร์โทร" required>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="เบอร์โทรสำรอง">
              <input value={form.phone2 ?? ""} onChange={(e) => setForm({ ...form, phone2: e.target.value })} className={inputCls} />
            </Field>
          </div>

          <Field label="บ้านเลขที่ / ถนน / ซอย" required>
            <input value={form.address_line} onChange={(e) => setForm({ ...form, address_line: e.target.value })} className={inputCls} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ตำบล/แขวง" required>
              <input value={form.sub_district} onChange={(e) => setForm({ ...form, sub_district: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="อำเภอ/เขต" required>
              <input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="จังหวัด" required>
              <input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="รหัสไปรษณีย์" required hint="5 หลัก">
              <input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className={inputCls} required maxLength={5} />
            </Field>
          </div>

          <Field label="หมายเหตุ">
            <textarea rows={2} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default ?? false}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
            />
            <span>ตั้งเป็นที่อยู่หลัก</span>
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
