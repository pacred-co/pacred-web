"use client";

/**
 * Submit-cart-as-order client island. Replaces the legacy
 * `<button type="submit" name="addOrder">ยืนยันการสั่งซื้อ</button>`
 * (cart.php L561) which POSTed the whole cart form to `pcs-admin/shops/`.
 *
 * The Server Action equivalent (`adminSubmitCartAsOrder`) takes the
 * cart-owner userid + the carrier + transport-type + a few address fields
 * — everything the surrounding form already provides via named inputs.
 * We read them off the parent <form> via formData on click.
 *
 * Faithful behaviours kept:
 *   - "ยืนยันการสั่งซื้อ" label
 *   - same Bootstrap-4 classes so cart.css styles it identically
 *   - confirm dialog before mutation (parity with the SweetAlert flow)
 *   - on success → router.refresh() (the cart rows are gone; the page
 *     re-renders into the empty-cart fallback)
 *
 * Not yet wired (deferred to follow-up sibling agents):
 *   - mPDF invoice generation after submit
 *   - customer email
 *   - Multi-address pick (the legacy resolves addressID → tb_address
 *     SELECT; this island uses the hshipby='PCS' static address branch
 *     OR posts the address fields from the form. Either works for the
 *     PCS-warehouse-pickup path, which is the common case.)
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSubmitCartAsOrder } from "@/actions/admin/cart";
import { confirm, alert } from "@/components/ui/confirm";

type Props = {
  /** The legacy `userid` who owns the source tb_cart rows. */
  cartOwnerUserid: string;
};

export default function CartSubmitButton({ cartOwnerUserid }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const button = e.currentTarget;
    const form   = button.closest("form");
    if (!form) {
      await alert("ไม่พบฟอร์มรถเข็น");
      return;
    }

    const fd = new FormData(form);

    // The legacy form reads these by POST['name']; mirror that lookup.
    const hShipBy        = String(fd.get("hShipBy") ?? "").trim();
    const hTransportType = String(fd.get("hTransportType") ?? "1").trim();
    const userIDField    = String(fd.get("userID") ?? "").trim();

    if (!hShipBy) {
      await alert("กรุณาเลือกบริษัทขนส่ง");
      return;
    }

    // The customer the order is FOR — legacy form has a userID dropdown
    // (cart.php L522 — populated by AJAX from coID); if it's not set, the
    // cart belongs to the staff themselves (rare admin self-shop), so the
    // customer userid = cart owner userid.
    const customerUserid = userIDField || cartOwnerUserid;

    if (hShipBy !== "PCS" && !customerUserid) {
      await alert("กรุณาเลือกรหัสสมาชิก (สำหรับจัดส่งไปที่อยู่ลูกค้า)");
      return;
    }

    if (!(await confirm("ยืนยันการสั่งซื้อสินค้าในรถเข็นทั้งหมด?"))) return;

    startTransition(async () => {
      const res = await adminSubmitCartAsOrder({
        cart_owner_userid: cartOwnerUserid,
        customer_userid:   customerUserid,
        hshipby:           hShipBy,
        htransporttype:    hTransportType === "2" ? "2" : "1",
        // Address fields — if present on the form, forward; otherwise empty
        // (the action substitutes the static PCS pickup address when
        // hshipby='PCS').
        haddressname:         String(fd.get("addressName") ?? ""),
        haddresslastname:     String(fd.get("addressLastname") ?? ""),
        haddressno:           String(fd.get("addressNo") ?? ""),
        haddresssubdistrict:  String(fd.get("addressSubDistrict") ?? ""),
        haddressdistrict:     String(fd.get("addressDistrict") ?? ""),
        haddressprovince:     String(fd.get("addressProvince") ?? ""),
        haddresszipcode:      String(fd.get("addressZIPCode") ?? ""),
        haddressnote:         String(fd.get("addressNote") ?? ""),
        haddresstel:          String(fd.get("addressTel") ?? ""),
        haddresstel2:         String(fd.get("addressTel2") ?? ""),
      });

      if (!res.ok) {
        await alert(`ยืนยันการสั่งซื้อไม่สำเร็จ: ${res.error}`);
        return;
      }

      await alert(
        `สร้างออเดอร์ ${res.data?.hno} สำเร็จ\n` +
        `โอนรายการ: ${res.data?.itemsTransferred} รายการ`,
      );
      router.refresh();
    });
  }

  return (
    <button
      type="submit"
      className="checkout2 btn btn-outline-info round btn-min-width waves-effect"
      id="CheckWait"
      name="addOrder"
      disabled={pending}
      onClick={handleSubmit}
    >
      {pending ? "กำลังบันทึก..." : "ยืนยันการสั่งซื้อ"}
    </button>
  );
}
