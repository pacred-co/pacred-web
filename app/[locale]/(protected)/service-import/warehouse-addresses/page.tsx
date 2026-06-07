import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { Home, ChevronRight, Warehouse, Info, ExternalLink } from "lucide-react";
import { WarehouseCard, type WarehouseDef } from "./warehouse-card";

export const metadata = {
  title: "ที่อยู่โกดังจีน · Pacred Shipping",
};

const PLACEHOLDER_CODE = "PR_____";

export default async function WarehouseAddressesPage() {
  const session = await getCurrentUserWithProfile();
  const memberCode = session?.profile?.member_code ?? PLACEHOLDER_CODE;

  const t = await getTranslations("warehouseAddressesPage");

  const warehouses: WarehouseDef[] = [
    {
      slug: "yiwu",
      cityTh: "อี้อู",
      cityEn: "Yiwu",
      province: "มณฑลเจ้อเจียง (Zhejiang)",
      flag: "🇨🇳",
      blurb: "ศูนย์กลางค้าส่งสินค้าจิปาถะใหญ่ที่สุดของจีน — รองรับ 1688, Taobao, Yiwu Market",
      fields: [
        { key: "shipping-mark", label: "Shipping Mark", value: `${memberCode} by EK`,                       hint: "วางข้างกล่อง" },
        { key: "receiver",      label: "收件人 (ผู้รับ)",  value: `${memberCode} (รถ EK / เรือ SEA)` },
        { key: "address",       label: "ที่อยู่ (中文)",   value: "浙江省金华市义乌市荷叶塘工业区龙岗路一街2号1栋102" },
        { key: "phone",         label: "电话 (โทร)",      value: "19817984258 谢小姐" },
      ],
    },
    {
      slug: "guangzhou",
      cityTh: "กวางโจว",
      cityEn: "Guangzhou",
      province: "มณฑลกวางตุ้ง (Guangdong)",
      flag: "🇨🇳",
      blurb: "พื้นที่ขนส่งหลักของกวางโจว — รองรับสินค้าจาก 1688, Taobao, Tmall, Alibaba และโรงงานจีนโดยตรง",
      fields: [
        { key: "receiver",  label: "收货人姓名 (ผู้รับ)",  value: `${memberCode} / EK = รถ / SEA = เรือ`,            hint: "เลือก EK หรือ SEA ตามรูปแบบขนส่ง" },
        { key: "address",   label: "详细地址 (ที่อยู่)",    value: `广东省广州市白云区江高镇沙溪东路18号3-1号仓库, (${memberCode}/EK) 仓库` },
        { key: "zipcode",   label: "邮政编码 (ไปรษณีย์)", value: "510000" },
        { key: "phone",     label: "手机号码 (โทร)",      value: "+13168385163" },
      ],
    },
  ];

  return (
    <>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 space-y-5 pb-32">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> {t("breadcrumbHome")}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/service-import" className="hover:text-primary-600">{t("breadcrumbImports")}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{t("breadcrumbCurrent")}</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600">
              <Warehouse className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("headerTitle")}</h1>
              <p className="text-xs text-muted mt-0.5">
                {t("headerSubtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Member code hero */}
        <div className="rounded-2xl border-2 border-primary-500/30 bg-gradient-to-br from-primary-500/10 to-primary-500/0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wide">{t("memberCodeLabel")}</p>
              <p className="mt-1 text-3xl font-bold font-mono text-primary-600">{memberCode}</p>
              <p className="mt-1 text-xs text-muted">{t("memberCodeHint")}</p>
            </div>
            {memberCode === PLACEHOLDER_CODE && (
              <Link
                href="/complete-profile"
                className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-bold hover:bg-primary-600"
              >
                {t("completeProfileCta")}
              </Link>
            )}
          </div>
        </div>

        {/* How-to note */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 p-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-bold text-blue-900 dark:text-blue-200">{t("howToTitle")}</p>
            <ol className="list-decimal list-inside text-blue-900/80 dark:text-blue-200/80 space-y-0.5 text-xs">
              <li>{t("howToStep1")}</li>
              <li>{t.rich("howToStep2", { code: () => <span className="font-mono font-bold">{memberCode}</span> })}</li>
              <li>{t.rich("howToStep3", { ek: (chunks) => <span className="font-mono">{chunks}</span>, sea: (chunks) => <span className="font-mono">{chunks}</span> })}</li>
              <li>{t.rich("howToStep4", { link: (chunks) => <Link href="/service-import" className="underline">{chunks}</Link> })}</li>
            </ol>
          </div>
        </div>

        {/* Warehouse cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {warehouses.map((w) => (
            <WarehouseCard key={w.slug} warehouse={w} />
          ))}
        </div>

        {/* Marketing footer */}
        <div className="rounded-2xl border border-border bg-surface-alt/40 p-4 text-xs text-muted flex flex-wrap items-center justify-between gap-2">
          <span>{t("footerMore")}</span>
          <div className="flex gap-3">
            <Link href="/warehouses/yiwu" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
              {t("footerYiwu")} <ExternalLink className="w-3 h-3" />
            </Link>
            <Link href="/warehouses/guangzhou" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
              {t("footerGuangzhou")} <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
