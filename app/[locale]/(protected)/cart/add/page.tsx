/* eslint-disable @next/next/no-img-element */
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { CartAddMultiLink } from "./cart-add-multi-link";

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
    <div className="pcs-content-pad w-full px-3 md:px-6 pt-4 pb-24 md:py-6 max-w-[1080px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[11px] text-muted mb-4">
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
          Default align = stretch → the image column matches the form card's
          height (no dangling tall image · owner 2026-07-30 "ขยับให้พอดี responsive"). */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <CartAddMultiLink rsDefault={rsDefault} />

        {/* ภาพแนวตั้งด้านขวา (owner 2026-07-30 · "ภาพเฉยๆ ~1080×1920 portrait ·
            ดึงภาพอะไรก็ได้มาแปะ"). placeholder = แบนเนอร์มือถือ Pacred · เดสก์ท็อปเท่านั้น
            · h-full = สูงเท่าการ์ดฟอร์ม (พอดีกันไม่ห้อย) · object-cover เต็มกรอบ.
            สลับภาพจริงได้ที่ src เดียว. */}
        <aside className="hidden lg:block self-stretch">
          <img
            src="/images/bannermobile/pacredbannermobile01.png"
            alt="Pacred Shipping"
            className="h-full min-h-[440px] w-full rounded-2xl object-cover shadow-md"
          />
        </aside>
      </div>

      {/* Back to cart */}
      <div className="mt-6 text-center">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-primary-600 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("backToCart")}
        </Link>
      </div>
    </div>
  );
}
