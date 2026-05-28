"use client";

/**
 * Cart row mutation island — wires the per-row Remove + Edit-Qty buttons
 * on the admin cart page to the Server Actions in `actions/admin/cart.ts`.
 *
 * Why a client island: the parent `app/[locale]/(admin)/admin/service-orders/cart/page.tsx`
 * is a Server Component that does the SSR data fetch (faithful 1:1 of the
 * legacy SSR-rendered cart). The legacy uses jQuery AJAX for these two
 * mutations (cart.php L706-810 + deleteItem.php / updateQuantity.php);
 * the modern equivalent is a small client island per row that uses
 * `useTransition` to call the Server Action without a full page submit.
 *
 * Legacy behavioural parity:
 *   - Remove   → confirm dialog ("คุณแน่ใจเหรอ?") → Server Action → reload row
 *   - Qty edit → blur → fire Server Action → revalidate (the legacy version
 *                recalculated line totals client-side AND POSTed the new
 *                qty; we revalidate the whole page so totals re-render).
 *
 * The kept-classes (`remove-product`, `input-product-quantity`, etc.) and
 * Bootstrap-4 markup mirror the legacy DOM exactly so the
 * `public/legacy/pcs/admin/cart.css` rules continue to style the rendered
 * output identically.
 *
 * Two named exports:
 *   - <CartRowActions>  → renders the qty <input> (goes inside .product-quantity)
 *   - <CartRowRemove>   → renders the remove <button> (goes inside .product-removal)
 *
 * Splitting them keeps the legacy float-grid columns intact — each one
 * is rendered inside its own column wrapper in page.tsx.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminRemoveCartItem, adminEditCartQty } from "@/actions/admin/cart";

type Props = {
  cartId: number;
  initialQty: number;
};

export default function CartRowActions({ cartId, initialQty }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleQtyBlur(e: React.FocusEvent<HTMLInputElement>) {
    const raw = e.currentTarget.value;
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty < 1) {
      // Legacy input has min=1 step=1 — restore on invalid.
      e.currentTarget.value = String(initialQty);
      return;
    }
    if (qty === initialQty) return;  // no-op
    startTransition(async () => {
      const res = await adminEditCartQty({ cartId, qty });
      if (!res.ok) {
        window.alert(`อัพเดทจำนวนไม่สำเร็จ: ${res.error}`);
        e.currentTarget.value = String(initialQty);
        return;
      }
      router.refresh();
    });
  }

  return (
    <input
      type="number"
      className="input-product-quantity"
      defaultValue={initialQty}
      name="cAmount[]"
      min={1}
      step={1}
      disabled={pending}
      onBlur={handleQtyBlur}
      data-cart-id={cartId}
    />
  );
}

type RemoveProps = { cartId: number };

export function CartRowRemove({ cartId }: RemoveProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    if (!window.confirm("ต้องการลบรายการนี้ออกจากรถเข็นหรือไม่?")) return;
    startTransition(async () => {
      const res = await adminRemoveCartItem({ cartId });
      if (!res.ok) {
        window.alert(`ลบรายการไม่สำเร็จ: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      className="remove-product font-12 btn btn-outline-danger round"
      title="ลบรายการนี้"
      disabled={pending}
      onClick={handleRemove}
      data-cart-id={cartId}
    >
      <i className="ft-trash"></i> ลบ
    </button>
  );
}
