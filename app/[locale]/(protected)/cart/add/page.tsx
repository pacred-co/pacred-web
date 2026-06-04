import { Link } from "@/i18n/navigation";
import { ShoppingCart, Pencil, ArrowRight, ArrowLeft } from "lucide-react";
import { CartAddUrlForm } from "./cart-add-url-form";

/**
 * `/cart/add` — "เพิ่มสินค้าในรถเข็น" — the dedicated add-a-product entry.
 *
 * Reached from the cart header CTA ("เพิ่มสินค้า" / "สั่งสินค้าเพิ่ม") and the
 * empty-cart state. A focused, centered screen whose single job is: paste a
 * 1688 / Taobao / Tmall product URL → order it.
 *
 * The centered <CartAddUrlForm> submits to the real wired flow
 * (`GET /search?url=…` → product card → `addCartItem` → `tb_cart`), the same
 * mechanism the home-hero SearchBar uses. Customers without a link get a
 * secondary card into the manual-entry workflow at `/service-order/add`.
 *
 * (Earlier this route re-rendered the whole `/cart` page with an auto-focus
 * effect — a faithful 1:1 of legacy `cart.php?page=add`. The owner asked for
 * a dedicated paste-to-order screen with a prominent centered search bar, so
 * this is now its own page — a Phase-C UX improvement over the legacy, per
 * AGENTS.md §0a "we copy the working system, polish the look ourselves".)
 */
export const dynamic = "force-dynamic";

const SUPPORTED_SITES = ["1688", "Taobao", "Tmall", "Alibaba"] as const;

export default function CartAddPage() {
  return (
    <div className="pcs-content-pad w-full px-3 md:px-6 pt-4 pb-24 md:py-10 max-w-[860px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[11px] text-muted mb-4">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          หน้าแรก
        </Link>
        <span>/</span>
        <Link href="/cart" className="hover:text-foreground transition-colors">
          ตะกร้าสินค้า
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">เพิ่มสินค้า</span>
      </div>

      {/* Hero — title + the centered URL-paste search bar */}
      <div className="rounded-3xl bg-white border border-border shadow-[0_4px_24px_rgba(0,0,0,0.05)] p-6 md:p-10 text-center">
        <span className="inline-flex w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white items-center justify-center shadow-lg shadow-primary-600/25 mb-4">
          <ShoppingCart className="w-7 h-7 md:w-8 md:h-8" strokeWidth={2} />
        </span>
        <h1 className="text-[22px] md:text-[30px] font-black tracking-tight text-foreground">
          เพิ่มสินค้าในรถเข็น
        </h1>
        <p className="mt-2 text-[13.5px] md:text-[15px] text-muted max-w-lg mx-auto">
          วางลิงก์สินค้าจาก{" "}
          <b className="text-foreground">1688 · Taobao · Tmall</b>{" "}
          เพื่อสั่งซื้อ — ระบบดึงราคา + รูปสินค้าให้อัตโนมัติ
        </p>

        {/* The centered search bar */}
        <div className="mt-6 max-w-xl mx-auto">
          <CartAddUrlForm />
        </div>

        {/* Supported sites */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12px] text-muted">
          <span>รองรับร้าน:</span>
          {SUPPORTED_SITES.map((s) => (
            <span
              key={s}
              className="inline-flex items-center rounded-full bg-surface-alt/60 px-3 py-1 font-semibold text-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Divider → manual entry fallback */}
      <div className="my-6 flex items-center gap-3 text-[12px] text-muted">
        <span className="h-px flex-1 bg-border" />
        <span>ไม่มีลิงก์สินค้า?</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Link
        href="/service-order/add"
        className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 md:p-5 hover:border-primary-300 hover:shadow-md transition group"
      >
        <span className="inline-flex w-11 h-11 rounded-xl bg-primary-50 text-primary-600 items-center justify-center shrink-0 group-hover:bg-primary-100 transition">
          <Pencil className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] md:text-[15px] font-bold text-foreground">
            กรอกข้อมูลสินค้าเอง
          </span>
          <span className="block text-[12px] text-muted">
            พิมพ์ชื่อ · ราคา · จำนวนเอง (กรณีไม่มีลิงก์ หรือสั่งจากร้านอื่น)
          </span>
        </span>
        <ArrowRight className="w-5 h-5 text-muted group-hover:text-primary-600 transition shrink-0" />
      </Link>

      {/* Back to cart */}
      <div className="mt-6 text-center">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-primary-600 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          กลับไปที่ตะกร้าสินค้า
        </Link>
      </div>
    </div>
  );
}
