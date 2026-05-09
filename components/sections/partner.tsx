import Image from "next/image";
import { useTranslations } from "next-intl";

const LOGOS = [
  "1688.png",
  "alibaba.png",
  "alibabapartner.png",
  "aotpartner.png",
  "bfs.png",
  "bkp.png",
  "coscopartner.png",
  "dhlpartner.png",
  "etracking.png",
  "facebook.png",
  "fedexpartner.png",
  "laemchabangpartner.png",
  "line.png",
  "maerskpartner.png",
  "patpartner.png",
  "qrcode.png",
  "taobao.png",
  "taobaopartner.png",
  "thaicargo.png",
  "tmall.png",
  "tmallpartner.png",
  "tntpartner.png",
  "upspartner.png",
  "youtube.png",
];

export function Partner() {
  const t = useTranslations("partner");

  return (
    <section id="partner" className="bg-background py-10">
      <div className="mx-auto w-full max-w-[1140px] px-[10px] flex flex-col gap-4">

        {/* Container 1 — Section heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            {t("sectionBadge")}
          </p>
        </div>

        {/* Container 2 — Logo marquee */}
        <div className="mx-auto w-full max-w-[1120px] overflow-hidden">
          <div
            className="flex hover:[animation-play-state:paused]"
            style={{
              gap: 24,
              animation: "marquee 48s linear infinite",
              width: `${LOGOS.length * 2 * (160 + 24)}px`,
            }}
          >
            {[...LOGOS, ...LOGOS].map((file, i) => (
              <div
                key={i}
                className="shrink-0 w-[160px] h-[72px] flex items-center justify-center"
              >
                <Image
                  src={`/images/partners/${file}`}
                  alt=""
                  width={140}
                  height={56}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
