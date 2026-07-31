import { CartAddMultiLink } from "./cart-add-multi-link";
import { CartAdsBanner } from "./cart-ads-banner";

/**
 * `/cart/add` — "เพิ่มสินค้าเข้ารถเข็น" — the multi-link paste entry
 * (owner 2026-07-30/31 · "อยากได้แบบในภาพ").
 *
 * <CartAddMultiLink> lets the customer paste up to 20 product links; "ค้นหาและ
 * ตรวจสอบสินค้า" stashes them in sessionStorage and navigates to /cart/add/review,
 * which fetches each (searchProductByUrl) and shows the full rich product detail
 * with a Shopee-style skeleton. This page is just the paste form + marketing panel.
 */
export const dynamic = "force-dynamic";

export default function CartAddPage() {
  return (
    <div className="pcs-content-pad w-full px-3 md:px-6 pt-1 pb-24 md:pt-2 md:pb-6">
      {/* Form (left) + Pacred marketing panel (right, desktop only).
          Full-bleed (owner 2026-07-30 "ขยายให้เต็มจอ"): the wrapper drops its
          max-w cap so the grid fills the screen. The image column is LOCKED to a
          fixed 400px (owner "ล็อกขนาดเป๊ะ · จะทำภาพพอดีๆ") so the banner is a
          stable, designable box on every screen; the form (minmax(0,1fr))
          absorbs all the remaining width. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <CartAddMultiLink />

        {/* แบนเนอร์โปรโมชั่นด้านขวา — สไลด์วนเองอัตโนมัติ ใช้ชุดโฆษณาเดียวกับหน้าสมัคร
            (owner 2026-07-30 "เอาแบนเนอร์หน้าสมัครมาขึ้น + เปลี่ยนเองอัตโนมัติ").
            กล่องล็อก 400px × 9:16 · เดสก์ท็อปเท่านั้น · self-start = ปักบนสุด. */}
        <aside className="hidden lg:block self-start lg:mt-20">
          <CartAdsBanner />
        </aside>
      </div>
    </div>
  );
}
