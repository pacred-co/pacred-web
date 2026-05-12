import Image from "next/image";

type Partner = {
  file: string;
  name: string;
  url: string;
};

const PARTNERS: Partner[] = [
  // ─── Shopping platforms ───
  { file: "alibabapartner.png",   name: "Alibaba",            url: "https://www.alibaba.com" },
  { file: "taobaopartner.png",    name: "Taobao",             url: "https://world.taobao.com" },
  { file: "tmallpartner.png",     name: "Tmall",              url: "https://www.tmall.com" },

  // ─── International couriers ───
  { file: "dhlpartner.png",       name: "DHL",                url: "https://www.dhl.com/th" },
  { file: "fedexpartner.png",     name: "FedEx",              url: "https://www.fedex.com/th" },
  { file: "upspartner.png",       name: "UPS",                url: "https://www.ups.com/th" },
  { file: "tntpartner.png",       name: "TNT",                url: "https://www.tnt.com/express/th_th/site/home.html" },

  // ─── Shipping lines ───
  { file: "maerskpartner.png",    name: "Maersk",             url: "https://www.maersk.com" },
  { file: "coscopartner.png",     name: "COSCO Shipping",     url: "https://lines.coscoshipping.com" },

  // ─── Ports / customs (TH) ───
  { file: "laemchabangpartner.png", name: "Laem Chabang Port", url: "https://www.port.co.th" },
  { file: "patpartner.png",       name: "Port Authority of Thailand", url: "https://www.port.co.th" },
  { file: "aotpartner.png",       name: "Airports of Thailand", url: "https://www.airportthai.co.th" },
  { file: "etracking.png",        name: "e-Tracking ศุลกากร", url: "https://e-tracking.customs.go.th" },

  // ─── Cargo / freight services ───
  { file: "thaicargo.png",        name: "Thai Cargo",         url: "https://www.thaicargo.com" },
  { file: "bfs.png",              name: "BFS — Bangkok Flight Services", url: "https://www.bfs.co.th" },
  { file: "bkp.png",              name: "BKP iService",       url: "https://www.bkp.co.th" },
];

export function Partner() {
  return (
    <section id="partner" className="py-8 md:py-12">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">

        {/* Heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
            OUR PARTNERS
          </div>
          <h2 className="text-[24px] md:text-[34px] leading-[1.2] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
            พาร์ทเนอร์{" "}
            <span className="text-primary-600">ของเรา</span>
          </h2>
          <p className="mt-2 text-[13px] md:text-[15px] leading-[1.55] font-medium text-muted md:whitespace-nowrap md:overflow-hidden md:text-ellipsis">
            ทำงานกับเครือข่ายผู้นำเข้า–ส่งออก ขนส่ง สายเดินเรือ ท่าเรือ และศุลกากรชั้นนำทั่วโลก
          </p>
        </div>

        {/* Marquee strip */}
        <div className="mx-auto mt-6 md:mt-8 w-full max-w-[1120px] overflow-hidden relative">
          {/* Edge fade gradients */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 md:w-20 z-[2]"
            style={{ background: "linear-gradient(90deg, var(--color-background) 0%, transparent 100%)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 md:w-20 z-[2]"
            style={{ background: "linear-gradient(270deg, var(--color-background) 0%, transparent 100%)" }}
          />

          <div
            className="flex hover:[animation-play-state:paused] py-3 md:py-4"
            style={{
              gap: 28,
              animation: "marquee 60s linear infinite",
              width: `${PARTNERS.length * 2 * (170 + 28)}px`,
            }}
          >
            {[...PARTNERS, ...PARTNERS].map((p, i) => (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={p.name}
                title={p.name}
                className="group shrink-0 w-[170px] h-[80px] md:h-[88px] flex items-center justify-center p-3 transition-transform duration-300 hover:-translate-y-1"
              >
                <Image
                  src={`/images/partners/${p.file}`}
                  alt={p.name}
                  width={140}
                  height={56}
                  className="max-h-full max-w-full object-contain transition-all duration-300 grayscale-[0.5] opacity-75 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110"
                />
              </a>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
