import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";

type Banner = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  image_path: string | null;
  link_href: string | null;
  cta_label: string | null;
};

/** Marketing/feature banners shown on the customer dashboard.
 *  Admin manages via /admin/banners (later) — for now seeded with
 *  3 default banners by migration 0016. */
export async function DashboardBanners() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dashboard_banners")
    .select("id, slug, title, subtitle, image_path, link_href, cta_label")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(3);

  // Fallback to hardcoded default banners when the table is empty (or
  // migration 0016 hasn't run yet) — so the dashboard always has the
  // visual row, matching the PCS legacy layout.
  const DEFAULT_BANNERS: Banner[] = [
    { id: "default-search-china", slug: "search-china", title: "ค้นหาสินค้าจากเว็บ 1688 / Taobao / Tmall", subtitle: "วางลิ้งสินค้าหรือพิมพ์คำค้น แปลภาษาไทยทันที", image_path: null, link_href: "/service-order/add", cta_label: "เริ่มค้นหา" },
    { id: "default-billing",      slug: "billing",      title: "ออกบิลใบเสร็จ / ใบแจ้งหนี้",                 subtitle: "ฝากสั่งซื้อด้วยตัวคุณเอง — Pacred ออกบิลให้อัตโนมัติ", image_path: null, link_href: "/cart", cta_label: "ดูตัวอย่าง" },
    { id: "default-line-oa",      slug: "line-oa",      title: "ไม่พลาดทุกการแจ้งเตือน",                     subtitle: "เพิ่ม Pacred LINE OA เป็นเพื่อน รับข่าวสาร + โปรโมชั่น",  image_path: null, link_href: "/line",               cta_label: "เพิ่มเพื่อน LINE" },
  ];
  const banners = ((data ?? []) as Banner[]).length > 0 ? (data as Banner[]) : DEFAULT_BANNERS;

  // Use slug to color-theme banners
  const themes: Record<string, string> = {
    "search-china":  "from-orange-500 via-red-500 to-red-700",
    "billing":       "from-blue-500 via-indigo-500 to-indigo-700",
    "line-oa":       "from-green-500 via-emerald-500 to-emerald-700",
  };

  const icons: Record<string, string> = {
    "search-china": "🔍",
    "billing":      "🧾",
    "line-oa":      "💬",
  };

  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {banners.map((b) => {
        const tone = themes[b.slug] ?? "from-primary-500 to-primary-700";
        const icon = icons[b.slug] ?? "📣";
        return (
          <Link
            key={b.id}
            href={b.link_href ?? "#"}
            className={`group block rounded-2xl bg-gradient-to-br ${tone} text-white p-4 shadow-md hover:shadow-lg transition-shadow overflow-hidden relative`}
          >
            <div className="text-2xl mb-2">{icon}</div>
            <h3 className="font-bold text-sm leading-tight">{b.title}</h3>
            {b.subtitle && (
              <p className="mt-1 text-xs text-white/85 line-clamp-2">{b.subtitle}</p>
            )}
            {b.cta_label && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 group-hover:bg-white/25">
                {b.cta_label} →
              </p>
            )}
          </Link>
        );
      })}
    </section>
  );
}
