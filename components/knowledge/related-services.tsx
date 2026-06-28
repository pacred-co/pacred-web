import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight, Sparkles,
  Container, Boxes, Truck, Stamp, ShoppingBag, HandCoins,
} from "lucide-react";

/**
 * "บริการที่คุณอาจสนใจ" — related-service cards + popular-keyword chips on a
 * knowledge article (ปอน 2026-06-29). The category banner is a full-width
 * <CategoryBanner> above the article; this card is the service cross-sell + SEO
 * keywords. Desktop = sticky right sidebar; mobile = inline block. LIVE landings only.
 */
type Svc = { icon: typeof Container; titleKey: string; subKey: string; href: string };

const SERVICES: Svc[] = [
  { icon: Stamp,       titleKey: "svcCustomsTitle", subKey: "svcCustomsSub", href: "/customs-clearance-shipping-suvarnabhumi" },
  { icon: Boxes,       titleKey: "svcLclTitle",     subKey: "svcLclSub",     href: "/services/import-china-lcl" },
  { icon: Container,   titleKey: "svcFclTitle",     subKey: "svcFclSub",     href: "/services/import-china-fcl" },
  { icon: Truck,       titleKey: "svcAllModeTitle", subKey: "svcAllModeSub", href: "/services/import-china" },
  { icon: ShoppingBag, titleKey: "svcShoppingTitle",subKey: "svcShoppingSub",href: "/services/china-shopping" },
  { icon: HandCoins,   titleKey: "svcYuanTitle",    subKey: "svcYuanSub",    href: "/payment/alipay" },
];

// Popular search keywords (SEO · ปอน 2026-06-29 "ใส่คีย์เวิร์ดเพิ่มได้เต็มที่").
const KEYWORDS = [
  "นำเข้าสินค้าจีน", "เคลียร์ศุลกากร", "ชิปปิ้งจีน", "LCL รวมตู้", "FCL เหมาตู้",
  "ฝากสั่งซื้อ 1688", "Taobao", "ภาษีนำเข้า", "Form E", "พิธีการศุลกากร",
  "ขนส่งจีน-ไทย", "ฝากโอนหยวน", "นำเข้าทางเรือ", "นำเข้าทางรถ",
];

export async function RelatedServices({ max }: { max?: number }) {
  const t = await getTranslations("servicesIndex");
  const ordered = SERVICES.slice(0, max ?? SERVICES.length);

  return (
    <div className="rounded-2xl border border-border bg-white p-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.05)] dark:bg-surface">
      {/* ── heading ── */}
      <div className="mb-2.5 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 fill-primary-600/20 text-primary-600" strokeWidth={2.4} />
        <h2 className="text-[13.5px] font-black text-[#111827] dark:text-white">บริการที่คุณอาจสนใจ</h2>
      </div>

      {/* ── service cards (icon, no photo) ── */}
      <div className="space-y-2">
        {ordered.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.titleKey}
              href={s.href}
              className="group flex items-center gap-2.5 rounded-xl border border-border bg-surface-alt/40 p-2 transition-all duration-300 hover:border-primary-300 hover:bg-primary-50/40 hover:shadow-[0_6px_16px_-8px_rgba(179,0,0,0.25)] dark:bg-surface-alt/20 dark:hover:bg-primary-950/20"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-600 transition-colors duration-300 group-hover:bg-primary-600 group-hover:text-white dark:bg-primary-950/40 dark:text-primary-300">
                <Icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[12.5px] font-black leading-tight text-[#111827] transition-colors group-hover:text-primary-700 dark:text-white">
                  {t(s.titleKey)}
                </p>
                <p className="line-clamp-1 text-[11px] text-muted">{t(s.subKey)}</p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary-600 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={2.8} />
            </Link>
          );
        })}
      </div>

      <Link
        href="/services"
        className="mt-2.5 flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-white text-[12px] font-black text-[#111827] transition-colors hover:border-primary-400 hover:text-primary-700 dark:bg-surface dark:text-white"
      >
        ดูบริการทั้งหมด <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.8} />
      </Link>

      {/* ── คำค้นยอดนิยม (SEO keywords · ปอน 2026-06-29) ── */}
      <div className="mt-3 border-t border-border pt-3">
        <p className="mb-2 text-[11px] font-black text-muted">คำค้นยอดนิยม</p>
        <div className="flex flex-wrap gap-1.5">
          {KEYWORDS.map((k) => (
            <span
              key={k}
              className="rounded-full border border-border bg-surface-alt/50 px-2 py-0.5 text-[11px] font-bold text-foreground/70 dark:bg-surface-alt/20"
            >
              {k}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
