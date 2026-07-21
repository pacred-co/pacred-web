"use client";

/**
 * <CustomerAddressPicker> — ONE reusable customer-address chooser, used on the
 * forwarder detail ("แก้ไข / เลือกที่อยู่จัดส่ง") AND on the billing-run document
 * ("แก้ที่อยู่จัดส่ง (บนใบ)"). DISPLAY/ADDRESS only — the surface's `onPick`
 * decides what to snapshot (forwarder → adminPickForwarderAddress · billing-run
 * → adminSetBillingRunDeliveryAddress). This component itself only:
 *   - lists the customer's saved tb_address rows (readable Thai detail + ★ค่าเริ่มต้น
 *     marker + highlighted selection),
 *   - lets staff "+ เพิ่มที่อยู่ให้ลูกค้า" (writes tb_address via adminAddCustomerAddress,
 *     confirm-gated §0f) → the new row appears, is auto-selected, and onPick fires,
 *   - calls onPick(addressID) when a row is chosen / a new one is added.
 *
 * Ownership is enforced server-side (adminAddCustomerAddress + the surface actions
 * re-verify the address belongs to `userid`). Reusable on any surface with a customer.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { adminAddCustomerAddress } from "@/actions/admin/customer-address";
import type { CustomerAddressRow } from "@/lib/legacy/customer-address-options";

function fullLine(a: CustomerAddressRow): string {
  return [
    a.addressno,
    a.subdistrict && `ตำบล/แขวง ${a.subdistrict}`,
    a.district && `อำเภอ/เขต ${a.district}`,
    a.province && `จังหวัด ${a.province}`,
    a.zipcode,
  ].filter(Boolean).join(" ");
}

const inp = "w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function CustomerAddressPicker({
  userid,
  addresses,
  currentAddressId,
  onPick,
  busy = false,
  /** which surface path to revalidate after an add (optional). */
  revalidate,
  /** Forwarder correction: remember a newly keyed address for the next order too. */
  makeNewAddressDefault = false,
  applyLabel = "ใช้ที่อยู่นี้",
}: {
  userid: string;
  addresses: CustomerAddressRow[];
  currentAddressId?: number | null;
  onPick: (addressID: number) => void;
  busy?: boolean;
  revalidate?: string;
  makeNewAddressDefault?: boolean;
  applyLabel?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<CustomerAddressRow[]>(addresses);
  const [selected, setSelected] = useState<number | null>(
    currentAddressId ?? rows.find((r) => r.isDefault)?.addressID ?? rows[0]?.addressID ?? null,
  );
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blank = {
    addressname: "", addresslastname: "", addresstel: "", addresstel2: "",
    addressno: "", addresssubdistrict: "", addressdistrict: "",
    addressprovince: "", addresszipcode: "", addressnote: "",
  };
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submitAdd() {
    setAddErr(null);
    if (!form.addressname.trim() || !form.addresslastname.trim() || !form.addresstel.trim() ||
        !form.addressno.trim() || !form.addresssubdistrict.trim() || !form.addressdistrict.trim() ||
        !form.addressprovince.trim() || !form.addresszipcode.trim()) {
      setAddErr("กรุณากรอกข้อมูลให้ครบ (ยกเว้นเบอร์สำรอง/หมายเหตุ)");
      return;
    }
    if (!(await confirm(
      `เพิ่มที่อยู่ให้ลูกค้า ${userid} ?\n\n${form.addressname} ${form.addresslastname}\n${form.addressno} ${form.addresssubdistrict} ${form.addressdistrict} ${form.addressprovince} ${form.addresszipcode}\nโทร. ${form.addresstel}${makeNewAddressDefault ? "\n\n★ บันทึกเป็นค่าเริ่มต้นสำหรับครั้งถัดไป" : ""}`,
    ))) return;
    startTransition(async () => {
      const res = await adminAddCustomerAddress({ userid, ...form, makeDefault: makeNewAddressDefault, revalidate });
      if (!res.ok) { setAddErr(res.error ?? "บันทึกไม่สำเร็จ"); return; }
      const newId = res.data!.addressId;
      const isDefault = res.data!.isDefault;
      const newRow: CustomerAddressRow = {
        addressID: newId,
        name: form.addressname.trim(), lastname: form.addresslastname.trim(),
        addressno: form.addressno.trim(), subdistrict: form.addresssubdistrict.trim(),
        district: form.addressdistrict.trim(), province: form.addressprovince.trim(),
        zipcode: form.addresszipcode.trim(), tel: form.addresstel.trim(),
        tel2: form.addresstel2.trim(), note: form.addressnote.trim(), isDefault,
      };
      setRows((rs) => {
        const withoutStaleDefault = isDefault ? rs.map((row) => ({ ...row, isDefault: false })) : rs;
        const existing = withoutStaleDefault.findIndex((row) => row.addressID === newId);
        if (existing < 0) return [...withoutStaleDefault, newRow];
        return withoutStaleDefault.map((row, index) => index === existing ? newRow : row);
      });
      setSelected(newId);
      setForm(blank);
      setAdding(false);
      router.refresh();
      onPick(newId); // auto-apply the freshly added address
    });
  }

  const disabled = busy || pending;

  return (
    <div className="space-y-2">
      {rows.length === 0 && !adding && (
        <p className="text-[11px] text-muted">ลูกค้ายังไม่มีที่อยู่บันทึกไว้ — กด “+ เพิ่มที่อยู่ให้ลูกค้า”</p>
      )}
      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((a) => {
            const isSel = selected === a.addressID;
            return (
              <li key={a.addressID}>
                <button
                  type="button"
                  onClick={() => setSelected(a.addressID)}
                  className={`w-full text-left rounded-lg border p-2 text-xs transition ${
                    isSel ? "border-primary-500 bg-primary-50 dark:bg-primary-500/10 ring-1 ring-primary-500/40"
                          : "border-border hover:bg-surface"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">{a.name} {a.lastname}</span>
                    {a.isDefault && <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700">★ ค่าเริ่มต้น</span>}
                    {isSel && <span className="ml-auto text-[10px] text-primary-600">● เลือกอยู่</span>}
                  </div>
                  <div className="text-muted">{fullLine(a)}</div>
                  {(a.tel || a.tel2) && <div className="text-muted">โทร. {a.tel || "—"}{a.tel2 ? `, ${a.tel2}` : ""}</div>}
                  {a.note && <div className="text-muted">📝 {a.note}</div>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <button
          type="button"
          disabled={disabled || selected == null}
          className="rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          onClick={() => selected != null && onPick(selected)}
        >
          {disabled ? "กำลังบันทึก…" : applyLabel}
        </button>
      )}

      {/* + add address for this customer */}
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="block text-xs font-medium text-sky-600 hover:underline">
          + เพิ่มที่อยู่ให้ลูกค้า
        </button>
      ) : (
        <div className="space-y-1.5 rounded-lg border border-border bg-surface-alt/40 p-2.5">
          {addErr && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">⚠ {addErr}</div>}
          <div className="grid grid-cols-2 gap-1.5">
            <input className={inp} placeholder="ชื่อ" value={form.addressname} onChange={set("addressname")} />
            <input className={inp} placeholder="นามสกุล" value={form.addresslastname} onChange={set("addresslastname")} />
          </div>
          <input className={inp} placeholder="บ้านเลขที่ / ที่อยู่" value={form.addressno} onChange={set("addressno")} />
          <div className="grid grid-cols-2 gap-1.5">
            <input className={inp} placeholder="ตำบล/แขวง" value={form.addresssubdistrict} onChange={set("addresssubdistrict")} />
            <input className={inp} placeholder="อำเภอ/เขต" value={form.addressdistrict} onChange={set("addressdistrict")} />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input className={inp} placeholder="จังหวัด" value={form.addressprovince} onChange={set("addressprovince")} />
            <input className={inp} placeholder="ไปรษณีย์" value={form.addresszipcode} onChange={set("addresszipcode")} inputMode="numeric" maxLength={5} />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input className={inp} placeholder="เบอร์โทร" value={form.addresstel} onChange={set("addresstel")} inputMode="numeric" maxLength={10} />
            <input className={inp} placeholder="เบอร์สำรอง" value={form.addresstel2} onChange={set("addresstel2")} inputMode="numeric" maxLength={10} />
          </div>
          <input className={inp} placeholder="หมายเหตุ" value={form.addressnote} onChange={set("addressnote")} />
          {makeNewAddressDefault && (
            <p className="text-[11px] font-medium text-amber-700">★ ที่อยู่นี้จะถูกจำเป็นค่าเริ่มต้นสำหรับออเดอร์ครั้งถัดไป</p>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={disabled} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50" onClick={submitAdd}>
              {pending ? "กำลังเพิ่ม…" : "บันทึกที่อยู่ใหม่"}
            </button>
            <button type="button" disabled={disabled} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface disabled:opacity-50" onClick={() => { setAdding(false); setAddErr(null); }}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
