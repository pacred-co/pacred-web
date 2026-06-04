"use client";

/**
 * OrderAddressPanel — change a ฝากสั่งซื้อ order's delivery address by
 * picking from the customer's saved address book (tb_address).
 *
 * Faithful port of legacy `shops.php` update_hAddress (L1268-1308):
 * re-pick a tb_address → overwrite the header's hAddress* fields. Legacy
 * REFUSES when hShipBy=='PCS' (warehouse self-pickup) — replicated here.
 *
 * Wires the previously-orphan `adminUpdateOrderAddress` (§0d). Each pick is
 * confirm-before-mutate (§0f · native, matching the board). The action also
 * server-side gates status 5/6 (closed orders).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Check } from "lucide-react";
import { adminUpdateOrderAddress } from "@/actions/admin/service-orders-shop-workflow";

export type SavedAddress = {
  addressid: number;
  addressname: string | null;
  addresslastname: string | null;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
  addressnote: string | null;
  addresstel: string | null;
};

export function OrderAddressPanel({
  hNo,
  hShipBy,
  addresses,
}: {
  hNo: string;
  hShipBy: string | null;
  addresses: SavedAddress[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const isPcsPickup = (hShipBy ?? "").toUpperCase() === "PCS";

  function pick(a: SavedAddress) {
    if (isPcsPickup) return;
    if (!a.addressname || a.addressname.trim().length === 0) {
      setMsg({ kind: "err", text: "ที่อยู่นี้ไม่มีชื่อผู้รับ — เลือกไม่ได้" });
      return;
    }
    const name = `${a.addressname ?? ""} ${a.addresslastname ?? ""}`.trim();
    const line = [a.addressno, a.addressdistrict, a.addressprovince, a.addresszipcode]
      .filter(Boolean).join(" ");
    if (!confirm(`เปลี่ยนที่อยู่จัดส่ง #${hNo} เป็น:\n\n${name}\n${line}\n\nยืนยัน?`)) return;
    startTransition(async () => {
      const res = await adminUpdateOrderAddress({
        hNo,
        haddressname:        a.addressname!.trim(),
        haddresslastname:    a.addresslastname ?? undefined,
        haddressno:          a.addressno ?? undefined,
        haddresssubdistrict: a.addresssubdistrict ?? undefined,
        haddressdistrict:    a.addressdistrict ?? undefined,
        haddressprovince:    a.addressprovince ?? undefined,
        haddresszipcode:     a.addresszipcode ?? undefined,
        haddressnote:        a.addressnote ?? undefined,
        haddresstel:         a.addresstel ?? undefined,
      });
      if (res.ok) {
        setMsg({ kind: "ok", text: "เปลี่ยนที่อยู่จัดส่งแล้ว" });
        router.refresh();
        setTimeout(() => setMsg(null), 5000);
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary-600" />
        <h3 className="font-bold text-sm">เปลี่ยนที่อยู่จัดส่ง (จากสมุดที่อยู่ลูกค้า)</h3>
      </div>

      {isPcsPickup && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
          ออเดอร์นี้รับสินค้าที่โกดัง (hShipBy = PCS) — เปลี่ยนที่อยู่จัดส่งไม่ได้ (ตาม legacy)
        </div>
      )}
      {msg && (
        <div className={`rounded-lg border p-2 text-xs ${msg.kind === "ok" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {msg.kind === "ok" ? "✓ " : "⚠ "}{msg.text}
        </div>
      )}

      {addresses.length === 0 ? (
        <p className="text-xs text-muted italic">ลูกค้ายังไม่มีที่อยู่ในสมุดที่อยู่</p>
      ) : (
        <div className="space-y-2">
          {addresses.map((a) => (
            <div key={a.addressid} className="flex items-start justify-between gap-2 rounded-lg border border-border p-2.5 text-xs">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {`${a.addressname ?? ""} ${a.addresslastname ?? ""}`.trim() || "—"}
                  {a.addresstel && <span className="text-muted font-normal"> · {a.addresstel}</span>}
                </p>
                <p className="text-muted">
                  {[a.addressno, a.addresssubdistrict, a.addressdistrict, a.addressprovince, a.addresszipcode]
                    .filter(Boolean).join(" ") || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => pick(a)}
                disabled={pending || isPcsPickup}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-primary-500 bg-primary-500 px-3 py-1.5 text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="h-3 w-3" /> ใช้ที่อยู่นี้
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
