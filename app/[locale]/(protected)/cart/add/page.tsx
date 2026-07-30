import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CartAddMultiLink } from "./cart-add-multi-link";
import { CartAdsBanner } from "./cart-ads-banner";

/**
 * `/cart/add` — "เพิ่มสินค้าเข้ารถเข็น" — the multi-link add-a-product entry
 * (owner 2026-07-30 · "อยากได้แบบในภาพ" — see the approved mockup).
 *
 * The interactive multi-link flow lives in <CartAddMultiLink> (paste up to 20
 * links → verify all → pick qty → add the batch). It reuses the proven money
 * path (searchProductByUrl + addCartItemsBulk → tb_cart), so this page is a
 * thin Server Component: load the live yuan rate for the ฿ preview + render the
 * form beside the Pacred marketing panel.
 *
 * (Was a single-link paste box → /search. Kept AGENTS.md §0a: we copy the
 * working system, polish the look ourselves.)
 */
export const dynamic = "force-dynamic";

export default async function CartAddPage() {
  const t = await getTranslations("cartPage");

  // tb_settings.rsdefault — live yuan rate for the ฿ preview (5.0 fallback =
  // legacy default). Same load the /service-order/add page uses.
  const admin = createAdminClient();
  const settingsRes = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number | string | null }>();
  const rsDefault = Number(settingsRes.data?.rsdefault ?? 5.0);

  return (
    <div className="pcs-content-pad w-full px-3 md:px-6 pt-1 pb-24 md:pt-2 md:pb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[11px] text-muted mb-2">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          {t("breadcrumbHome")}
        </Link>
        <span>/</span>
        <Link href="/cart" className="hover:text-foreground transition-colors">
          {t("breadcrumbCart")}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{t("addItem")}</span>
      </div>

      {/* Form (left) + Pacred marketing panel (right, desktop only).
          Full-bleed (owner 2026-07-30 "ขยายให้เต็มจอ"): the wrapper drops its
          max-w cap so the grid fills the screen. The image column is LOCKED to a
          fixed 400px (owner "ล็อกขนาดเป๊ะ · จะทำภาพพอดีๆ") so the banner is a
          stable, designable box on every screen; the form (minmax(0,1fr))
          absorbs all the remaining width. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <CartAddMultiLink rsDefault={rsDefault} />

        {/* แบนเนอร์โปรโมชั่นด้านขวา — สไลด์วนเองอัตโนมัติ ใช้ชุดโฆษณาเดียวกับหน้าสมัคร
            (owner 2026-07-30 "เอาแบนเนอร์หน้าสมัครมาขึ้น + เปลี่ยนเองอัตโนมัติ").
            กล่องล็อก 400px × 9:16 · เดสก์ท็อปเท่านั้น · self-start = ปักบนสุด. */}
        <aside className="hidden lg:block self-start">
          <CartAdsBanner />
        </aside>
      </div>
    </div>
  );
}
