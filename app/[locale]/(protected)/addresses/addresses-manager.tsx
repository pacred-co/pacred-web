"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  createAddress,
  updateAddress,
  setDefaultAddress,
  softDeleteAddress,
  type Address,
} from "@/actions/addresses";
import type { AddressInput } from "@/lib/validators/addresses";
import { Pencil, Trash2, Star, Phone, MapPin, Plus } from "lucide-react";
import { THAI_PROVINCES } from "@/lib/thai-provinces";

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
  const t = useTranslations("addresses");
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
        flash("ok", editing.mode === "create" ? t("createdToast") : t("updatedToast"));
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
        flash("ok", t("setDefaultToast"));
        refresh();
      } else {
        flash("err", res.error);
      }
    });
  }

  function onDelete(a: Address) {
    if (!confirm(t("deleteConfirm", { name: `${a.first_name} ${a.last_name}` }))) return;
    startTransition(async () => {
      const res = await softDeleteAddress(a.id);
      if (res.ok) {
        flash("ok", t("deletedToast"));
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

      {/* Address list */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-alt/30">
          <p className="text-sm font-bold text-foreground">
            ที่อยู่ทั้งหมด <span className="text-muted font-normal">({addresses.length})</span>
          </p>
          {!editing && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 text-white px-3 py-1.5 text-xs font-bold hover:bg-emerald-600 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> เพิ่มที่อยู่
            </button>
          )}
        </div>

        {addresses.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-muted">
              <MapPin className="w-7 h-7" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">ยังไม่มีที่อยู่จัดส่ง</p>
            <p className="mt-1 text-xs text-muted">เพิ่มที่อยู่แรกของคุณเพื่อใช้สั่งซื้อ</p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-bold hover:bg-primary-600 shadow-sm"
            >
              <Plus className="w-4 h-4" /> เพิ่มที่อยู่
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {addresses.map((a, i) => (
              <div key={a.id} className="p-5 hover:bg-surface-alt/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    a.is_default ? "bg-red-500 text-white" : "bg-surface-alt text-muted"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">{a.first_name} {a.last_name}</span>
                      {a.is_default && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 text-[11px] font-bold">
                          <Star className="w-3 h-3 fill-current" /> ที่อยู่หลัก
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <a href={`tel:${a.phone}`} className="hover:text-primary-600 font-mono">{a.phone}</a>
                      {a.phone2 && <span className="text-muted"> / {a.phone2}</span>}
                    </p>
                    <p className="text-sm text-foreground">
                      {a.address_line}{" "}
                      <span className="text-muted">ต.</span>{a.sub_district}{" "}
                      <span className="text-muted">อ.</span>{a.district}{" "}
                      <span className="text-muted">จ.</span>{a.province}{" "}
                      <span className="font-mono">{a.postal_code}</span>
                    </p>
                    {a.note && (
                      <p className="text-xs text-muted">📝 {a.note}</p>
                    )}
                  </div>
                </div>

                {/* Action buttons (PCS-style: red-outline ลบ / amber-outline แก้ไข / blue-outline ตั้งเป็นหลัก) */}
                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => onDelete(a)}
                    disabled={pending || a.is_default}
                    title={a.is_default ? "ไม่สามารถลบที่อยู่หลักได้" : "ลบที่อยู่นี้"}
                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 px-3 py-1 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3 h-3" /> ลบที่อยู่
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white text-amber-700 hover:bg-amber-50 px-3 py-1 text-xs font-semibold disabled:opacity-50"
                  >
                    <Pencil className="w-3 h-3" /> แก้ไขที่อยู่
                  </button>
                  {a.is_default ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 text-red-700 px-3 py-1 text-xs font-bold">
                      <Star className="w-3 h-3 fill-current" /> ที่อยู่หลัก
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSetDefault(a.id)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 px-3 py-1 text-xs font-semibold disabled:opacity-50"
                    >
                      <Star className="w-3 h-3" /> ตั้งเป็นที่อยู่หลัก
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <form onSubmit={onSubmit} className="rounded-2xl border-2 border-primary-500/30 bg-white dark:bg-surface p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-foreground">
            {editing.mode === "create" ? t("formTitleCreate") : t("formTitleEdit")}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("firstName")} required>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("lastName")} required>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("phone")} required>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("phone2")}>
              <input value={form.phone2 ?? ""} onChange={(e) => setForm({ ...form, phone2: e.target.value })} className={inputCls} />
            </Field>
          </div>

          <Field label={t("addressLine")} required>
            <input value={form.address_line} onChange={(e) => setForm({ ...form, address_line: e.target.value })} className={inputCls} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("subDistrict")} required>
              <input value={form.sub_district} onChange={(e) => setForm({ ...form, sub_district: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("district")} required>
              <input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className={inputCls} required />
            </Field>
            <Field label={t("province")} required>
              {/* gap-customer H-6: dropdown of 77 official provinces (no more typo-prone typing) */}
              <select
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
                className={inputCls}
                required
              >
                <option value="" disabled>— เลือกจังหวัด —</option>
                {THAI_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label={t("postalCode")} required hint={t("postalCodeHint")}>
              <input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className={inputCls} required maxLength={5} />
            </Field>
          </div>

          <Field label={t("note")}>
            <textarea rows={2} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default ?? false}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
            />
            <span>{t("markAsDefault")}</span>
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : t("save")}
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
