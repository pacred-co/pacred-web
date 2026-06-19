import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PurchaseBanner } from "@/components/sections/purchase-banner";

const CATEGORY_IMAGES = [
  "/images/catagory/beaty.png",
  "/images/catagory/maleclothes.png",
  "/images/catagory/handbag.png",
  "/images/catagory/girlshoe.png",
  "/images/catagory/machine.png",
  "/images/catagory/electronic.png",
  "/images/catagory/medic.png",
  "/images/catagory/camera.png",
  "/images/catagory/kidtoy.png",
  "/images/catagory/pet.png",
  "/images/catagory/heartpump.png",
  "/images/catagory/girlfashion.png",
  "/images/catagory/shoe.png",
  "/images/catagory/necklace.png",
  "/images/catagory/homeuse.png",
  "/images/catagory/phone.png",
  "/images/catagory/comlaptop.png",
  "/images/catagory/food.png",
  "/images/catagory/racket.png",
  "/images/catagory/ps5.png",
];

export function ProductCategories() {
  const tCat = useTranslations("service");
  const tPc = useTranslations("productCategories");

  const categories = CATEGORY_IMAGES.map((image, i) => ({
    title: tCat(`cat${i + 1}`),
    image,
  }));

  return (
    <section className="pt-1.5 md:pt-6 pb-1.5 md:pb-5">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">

        {/* Header */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex items-center gap-2 mb-1 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
            {tPc("eyebrow")}
          </div>
          <h2 className="text-[22px] md:text-[36px] leading-[1.25] md:leading-[1.2] font-black tracking-[-0.03em] text-[#111827] dark:text-white relative pl-[18px]">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[7px] h-[34px] rounded-full bg-gradient-to-b from-red-600 to-red-800" />
            {tPc("titlePrefix")}
            <span className="text-primary-600">{tPc("titleHighlight")}</span>
          </h2>
          <p className="mt-1.5 text-[15px] md:text-[17px] font-bold text-gray-500">
            {tPc("subtitlePrefix")}
            <span className="text-primary-600 font-black">{tPc("subtitleBrand")}</span>
            {tPc("subtitleSuffix")}
          </p>
        </div>
      </div>

      {/* Purchase banner — sits right under the intro copy, above the category grid */}
      <PurchaseBanner />

      <div className="mx-auto w-full max-w-[1140px] px-[10px]">
        {/* Desktop grid — md+ */}
        <div className="mx-auto w-full max-w-[1120px] hidden md:grid grid-cols-5 xl:grid-cols-10 gap-3">
          {categories.map((item, i) => (
            <Link
              key={i}
              href="/register"
              className="group flex flex-col items-center text-center pt-5 pb-4 px-2 bg-white dark:bg-surface rounded-[18px] border border-gray-100 dark:border-border shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1.5 hover:border-red-200 hover:shadow-[0_10px_24px_rgba(220,38,38,0.10)] select-none"
            >
              {/* Image circle */}
              <div className="w-[64px] h-[64px] rounded-full overflow-hidden bg-red-50 dark:bg-red-950/20 shrink-0 mb-3 transition-transform duration-300 group-hover:scale-110">
                <Image
                  src={item.image}
                  alt={`นำเข้า${item.title}จากจีน 1688 Taobao Tmall กับ Pacred Shipping`}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                />
              </div>
              {/* Text — outside image, always visible */}
              <span className="text-[12px] font-bold leading-[1.4] text-gray-700 dark:text-foreground group-hover:text-red-600 transition-colors duration-200 line-clamp-2 w-full">
                {item.title}
              </span>
            </Link>
          ))}
        </div>

        {/* Mobile 2-row horizontal scroll — <md */}
        <div className="md:hidden overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-2 -mx-[10px]">
          <div
            className="grid gap-[8px] px-[10px]"
            style={{
              gridAutoFlow: "column",
              gridTemplateRows: "repeat(2, 112px)",
              gridAutoColumns: "88px",
            }}
          >
            {categories.map((item, i) => (
              <Link
                key={i}
                href="/register"
                className="flex flex-col items-center justify-start text-center pt-3 pb-2 px-1.5 bg-white dark:bg-surface rounded-[14px] border border-gray-100 dark:border-border shadow-[0_3px_8px_rgba(0,0,0,0.05)] active:scale-95 transition-transform select-none"
              >
                {/* Image circle */}
                <div className="w-[50px] h-[50px] rounded-full overflow-hidden bg-red-50 dark:bg-red-950/20 shrink-0 mb-2">
                  <Image
                    src={item.image}
                    alt={`นำเข้า${item.title}จากจีน 1688 Taobao Tmall กับ Pacred Shipping`}
                    width={50}
                    height={50}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Text — separate row, always visible */}
                <span className="text-[10.5px] font-bold leading-[1.3] text-gray-700 dark:text-foreground line-clamp-2 w-full">
                  {item.title}
                </span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
