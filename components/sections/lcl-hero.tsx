import Image from "next/image";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";

// LCL service scope — bullet list shown in the primary-tinted hero card.
// Each pairs a brand PNG icon (rendered as-is) with a benefit line.
const SCOPE: { icon: string; text: string }[] = [
  { icon: "/images/hero-section/icon-draf/transfast.png",       text: "รับของที่โกดังกวางโจว / เซินเจิ้น / อี้อู — ฟรีค่าฝาก 14 วัน" },
  { icon: "/images/hero-section/icon-draf/pcs-forwarder.png",   text: "ตรวจสภาพสินค้า · ห่อกันกระแทก · นับชิ้น · ถ่ายรูป ก่อนรวมตู้" },
  { icon: "/images/hero-section/icon-draf/box.png",             text: "รวมส่งกับลูกค้ารายอื่นในตู้เดียว — ค่าขนส่งคุ้มสุด ไม่ต้องเหมาตู้" },
  { icon: "/images/hero-section/icon-draf/customclearance.png", text: "เคลียร์พิธีการศุลกากรขาเข้า + ชำระภาษี + อากร ครบจบในที่เดียว" },
  { icon: "/images/hero-section/icon-draf/checklistred.png",    text: "ใช้สิทธิ Form E ทุก order — ลดภาษีนำเข้าผ่าน FTA จีน-ไทย สูงสุดเหลือ 0%" },
  { icon: "/images/hero-section/icon-draf/transfast.png",       text: "Door-to-Door — ส่งถึงโรงงาน / หน้าร้าน / บ้าน ทั่วประเทศ" },
  { icon: "/images/hero-section/icon-draf/billingicon.png",     text: "ออกใบกำกับภาษี (ภพ.20) + ใบเสร็จครบ ใช้ลดหย่อนนิติบุคคล" },
  { icon: "/images/hero-section/icon-draf/people.png",          text: "ทีมล่ามจีนช่วยปิดดีลกับโรงงาน — สั่ง 1688 / Taobao / Alibaba ไม่ต้องคุยจีนเอง" },
];

/**
 * LCL hero — mirrors the customs landing "Hero intro" block:
 * h1 + a tappable red-gradient LINE scope-banner + a primary-tinted
 * bullet-list card. LCL copy hardcoded for one-place refinement.
 */
export function LclHero() {
  return (
    <section className="relative pt-1 md:pt-2 pb-1 md:pb-2">
      <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <h1 className="text-[20px] md:text-[40px] leading-[1.25] md:leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white">
          <span className="md:block">นำเข้าจีน <span className="text-primary-600">LCL รวมตู้</span> (<span className="text-primary-600 text-[28px] md:text-[56px]">เริ่มไม่กี่กล่อง</span>)</span>{" "}
          <span className="md:block md:mt-1">
            <span className="block md:inline">จ่ายตามที่ใช้ · Sea Freight จีน-ไทย</span>
            <br className="hidden md:block" />
            <span className="text-primary-600">Pacred Shipping</span>
          </span>
        </h1>

        {/* ─── Service scope banner — tappable LINE link, headline only ─── */}
        <div
          className="group relative mt-3 md:mt-4 overflow-hidden rounded-2xl text-white shadow-[0_12px_32px_rgba(179,0,0,0.30)] transition-all duration-300 hover:shadow-[0_18px_44px_rgba(179,0,0,0.45)] hover:-translate-y-0.5"
          style={{ background: "linear-gradient(135deg, #d60000 0%, #b30000 45%, #8c0000 100%)" }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
            style={{ background: "radial-gradient(circle at 25% 50%, rgba(253,224,71,0.25) 0%, transparent 55%)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />

          {/* LINE click overlay — covers entire banner */}
          <TrackedExternalLink
            href={LINE_URL}
            cta="line_consult"
            surface="lcl_scope_banner"
            aria-label="ทักไลน์ Pacred Shipping ปรึกษานำเข้า LCL ฟรี"
            className="absolute inset-0 z-10"
          >
            <span className="sr-only">ทักไลน์ Pacred Shipping</span>
          </TrackedExternalLink>

          <div className="relative pointer-events-none px-4 md:px-6 py-4 md:py-5">
            <h3 className="flex items-start gap-2 text-[18px] sm:text-[22px] md:text-[30px] font-black text-white tracking-tight leading-snug md:whitespace-nowrap [text-shadow:0_2px_6px_rgba(0,0,0,0.4)]">
              <Image
                src="/images/iconwhite/silent.png"
                alt=""
                width={28}
                height={28}
                aria-hidden
                className="w-6 h-6 md:w-9 md:h-9 shrink-0 mt-0.5 object-contain"
              />
              <span className="inline">
                นำเข้า LCL จากจีน{" "}
                <span className="text-yellow-300 text-[22px] sm:text-[26px] md:text-[36px] [text-shadow:0_2px_8px_rgba(0,0,0,0.55)]">
                  รวมตู้
                </span>{" "}
                จ่ายตามที่ใช้จริง{" "}
                {/* Transport icons — inline so they flow with the title text */}
                <span className="inline-flex items-center gap-0.5 align-middle whitespace-nowrap">
                  <Image src="/images/iconwhite/ship.png" alt="" width={28} height={28} aria-hidden className="w-5 h-5 md:w-7 md:h-7 object-contain" />
                  <Image src="/images/iconwhite/box.png"  alt="" width={28} height={28} aria-hidden className="w-5 h-5 md:w-7 md:h-7 object-contain" />
                </span>
              </span>
            </h3>
            {/* Desktop-only subtitle — origin warehouses + ports */}
            <p className="hidden md:block mt-2 pl-[44px] text-[13px] font-medium text-white/70 leading-snug tracking-tight whitespace-nowrap">
              กวางโจว · เซินเจิ้น · อี้อู · เซี่ยงไฮ้ · หางโจว · เทียนจิน → คลองเตย · แหลมฉบัง (Door-to-Door ทั่วประเทศ)
            </p>
          </div>
        </div>

        {/* Bullet list — wrapped in a primary-tinted "service highlights" card,
            same theme as the red banner above it. */}
        <div className="mt-4 md:mt-5 rounded-2xl md:rounded-3xl border border-primary-200 dark:border-primary-800/60 bg-gradient-to-br from-primary-50/60 via-white to-primary-50/30 dark:from-primary-900/15 dark:via-surface dark:to-primary-900/10 p-4 md:p-6 shadow-[0_8px_22px_rgba(179,0,0,0.06)]">
          <ul className="flex flex-col gap-y-3 md:gap-y-3.5 text-[14px] md:text-[16px] leading-[1.55] text-foreground/95">
            {SCOPE.map((item) => (
              <li key={item.text} className="flex items-start gap-3">
                <Image src={item.icon} alt="" width={32} height={32} aria-hidden className="w-6 h-6 md:w-8 md:h-8 shrink-0 mt-0.5 object-contain" />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
