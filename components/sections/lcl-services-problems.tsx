import Image from "next/image";
import {
  Briefcase,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Phone,
} from "lucide-react";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

/**
 * LCL detailed services + problems block — mirrors the customs landing:
 * service bullets (CheckCircle2) → problem bullets (square) → closing
 * full-bleed desktop + mobile banner with QR + 2 tel: badges.
 */
export function LclServicesProblems() {
  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        {/* ── Services intro ── */}
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <Briefcase className="w-3.5 h-3.5" strokeWidth={2.6} />
          LCL EXPERTS · บริการนำเข้าครบวงจร
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          เปิดประสบการณ์ <span className="text-primary-600">นำเข้า LCL จากจีน</span> กับ Pacred Shipping
        </h2>
        <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
          Pacred Shipping ดูแลนำเข้า LCL ครบในที่เดียว — ทั้ง <strong className="text-primary-600 font-black">รับของที่โกดังจีน รวมตู้ Sea Freight</strong> เคลียร์ภาษี และส่งถึงประตู ด้วยทีมหน้างานจริงทั้งจีนและไทยมา <strong className="text-primary-600 font-black">15 ปี</strong>
        </p>

        {/* Service bullets — CheckCircle2 + bolded keyword */}
        <ul className="mt-6 md:mt-8 flex flex-col gap-y-3 md:gap-y-3.5">
          {[
            <>รับของที่ <strong className="font-black text-foreground">โกดังกวางโจว · เซินเจิ้น · อี้อู</strong> — ซัพพลายเออร์ส่งเข้าฟรี พักของฟรี 14 วัน</>,
            <><strong className="font-black text-foreground">ตรวจ-นับ-ถ่ายรูป-ห่อกันกระแทก</strong> ทุก order ก่อนรวมตู้ แจ้งสถานะให้ทราบก่อนออกจากจีน</>,
            <><strong className="font-black text-foreground">รวมตู้ Sea Freight LCL</strong> — รวมส่งกับลูกค้ารายอื่นในตู้เดียว จ่ายตาม CBM/KG ที่ใช้จริง ไม่ต้องเหมาตู้</>,
            <>เคลียร์พิธีการศุลกากรขาเข้าที่ <strong className="font-black text-foreground">ท่าเรือคลองเตย · แหลมฉบัง · ลาดกระบัง (ICD)</strong> ครบจบ</>,
            <>ขอ <strong className="font-black text-foreground">Form E (FTA ASEAN-China)</strong> จากซัพพลายเออร์จีนให้ — ลดภาษีนำเข้าบางสินค้าเหลือ 0%</>,
            <><strong className="font-black text-foreground">หน้างานจริง 15+ ปี</strong> ถนัด <strong className="font-black text-foreground">พิกัดอัตราศุลกากร การใช้สิทธิภาษี และ Total Landed Cost</strong></>,
            <><strong className="font-black text-foreground">Door-to-Door ทั่วประเทศ</strong> — ส่งถึงโรงงาน หน้าร้าน หรือบ้าน ไม่ต้องประสาน vendor หลายเจ้า</>,
            <>มี <strong className="font-black text-foreground">ทีมล่ามจีน</strong> ช่วยปิดดีลกับโรงงาน — สั่ง 1688 / Taobao / Alibaba ไม่ต้องคุยจีนเอง</>,
            <>อยากเพิ่ม <strong className="font-black text-foreground">ประกันสินค้า (Cargo Insurance)</strong>? ทำให้ได้ ครอบคลุมแตกหัก/สูญหายระหว่างขนส่ง</>,
          ].map((node, idx) => (
            <li key={idx} className="flex items-start gap-2.5 md:gap-3">
              <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-primary-600 shrink-0 mt-[3px] md:mt-[4px]" strokeWidth={2.6} />
              <span className="text-[15px] md:text-[18px] leading-[1.55] text-foreground/95">
                {node}
              </span>
            </li>
          ))}
        </ul>

        {/* ── Problems we solve ── */}
        <div className="mt-8 md:mt-12 inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <ShieldAlert className="w-3.5 h-3.5" strokeWidth={2.6} />
          LCL PROBLEMS · ปัญหานำเข้า LCL ที่เรารับดูแล
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          ปัญหา <span className="text-primary-600">นำเข้า LCL จากจีน</span> ที่เรารับจัดการให้
        </h2>
        <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
          ทุกเคสที่ลูกค้าเจอ — คิด CBM ไม่เป็น ของพักจีนนาน ภาษีบาน ของแตก — ทีม Pacred Shipping ลงไปแก้ที่ต้นเรื่อง ไม่ใช่แค่รับมาแล้วส่งต่อให้คนอื่นทำ
        </p>

        <ul className="mt-6 md:mt-8 flex flex-col gap-y-2.5 md:gap-y-3">
          {[
            <><strong className="font-black text-foreground">คิด CBM / น้ำหนักไม่เป็น</strong> — ไม่รู้จะจ่ายตามปริมาตรหรือน้ำหนัก เรา quote Total Landed Cost ให้ชัดก่อนยืนยัน</>,
            <><strong className="font-black text-foreground">ของพักที่จีนนาน รอรวมหลายร้าน</strong> — พักโกดัง Pacred ฟรี 14 วัน รวมหลาย order ส่งครั้งเดียวคุ้มกว่า</>,
            <><strong className="font-black text-foreground">Form E ขอไม่เป็น / ซัพพลายเออร์ไม่ออกให้</strong> — ทีมประสานขอ Form E ให้ ใช้สิทธิ FTA ลดภาษี</>,
            <><strong className="font-black text-foreground">ภาษีนำเข้าโดนตีสูงเกินจริง / พิกัดผิด</strong> — เราคุยกับเจ้าหน้าที่กรมศุลฯ ให้ ลดต้นทุนภาษี</>,
            <><strong className="font-black text-foreground">เอกสารไม่ครบ / Invoice-Packing ไม่ตรง</strong> — แก้เอกสารให้ครบชุดก่อนเข้าด่าน ไม่ให้ของติด</>,
            <>นำเข้า <strong className="font-black text-foreground">สินค้าควบคุม — มอก. สมอ. กสทช.</strong> ฯลฯ พร้อมวิ่งใบอนุญาตให้ครบ</>,
            <>นำเข้า <strong className="font-black text-foreground">อาหาร ผลไม้ ของสด</strong> — ผ่านด่านอาหาร–กักกันพืช พร้อมเอกสารครบชุด</>,
            <>นำเข้า <strong className="font-black text-foreground">เสื้อผ้า ของแฟชั่น สินค้า e-Commerce</strong> — ทั้งล็อตขายและของใช้ส่วนตัวที่สั่งมาเอง</>,
            <><strong className="font-black text-foreground">ของแตก / สูญหายระหว่างขนส่ง</strong> — แนะนำทำ Cargo Insurance สำหรับสินค้ามูลค่าสูง ครอบคลุมเต็ม</>,
            <><strong className="font-black text-foreground">สั่ง 1688 / Taobao / Alibaba แต่คุยจีนไม่ได้</strong> — ทีมล่ามจีนปิดดีลกับโรงงานในนามคุณ</>,
          ].map((node, idx) => (
            <li key={idx} className="flex items-start gap-2.5 md:gap-3">
              <span aria-hidden className="w-2 h-2 md:w-2.5 md:h-2.5 bg-primary-600 mt-[8px] md:mt-[11px] shrink-0 rounded-[2px]" />
              <span className="text-[15px] md:text-[18px] leading-[1.55] text-foreground/95">
                {node}
              </span>
            </li>
          ))}
        </ul>

        {/* ── Closing confidence banner — full-bleed desktop ── */}
        <div className="hidden md:block relative w-screen left-1/2 -translate-x-1/2 mt-12 group">
          <Image
            src="/images/bannerdesktop/bannerbottom02.png"
            alt="Pacred Shipping — นำเข้า LCL ครบ ราคาชัด คุยกับทีมง่าย ปรึกษาฟรีตลอด 24 ชม."
            width={3840}
            height={800}
            sizes="100vw"
            className="w-full h-auto block"
            quality={95}
            unoptimized
          />

          {/* Banner-wide click target (LINE) */}
          <TrackedExternalLink
            href="/line"
            cta="line_banner"
            surface="lcl_bottom_banner"
            className="absolute inset-0 z-0"
            aria-label="ทักไลน์ Pacred Shipping"
          >
            <span className="sr-only">ทักไลน์ Pacred Shipping</span>
          </TrackedExternalLink>

          {/* Text overlay */}
          <div className="absolute inset-y-0 left-0 right-[45%] z-10 pointer-events-none flex flex-col justify-center px-[6%] lg:px-[8%] xl:px-[10%] py-2 lg:py-3">
            <div className="inline-flex items-center gap-1.5 mb-1 lg:mb-1.5 text-yellow-300 text-[11px] lg:text-[13px] xl:text-[15px] font-black tracking-[0.08em] uppercase drop-shadow-[0_1px_4px_rgba(0,0,0,0.55)]">
              <ShieldCheck className="w-3.5 h-3.5 lg:w-4 lg:h-4 xl:w-5 xl:h-5" strokeWidth={2.6} />
              LCL GUARANTEE · นำเข้าครบ จบที่เดียว
            </div>
            <h3 className="text-[20px] lg:text-[30px] xl:text-[40px] font-black text-white leading-[1.05] tracking-[-0.025em] drop-shadow-[0_3px_12px_rgba(0,0,0,0.6)]">
              เร็ว ไว ไม่มีคำว่าทำไม่ได้
              <br />
              ส่ง LCL กับ <span className="text-yellow-300">Pacred Shipping</span>
            </h3>
            <p className="mt-1 lg:mt-1.5 text-[11.5px] lg:text-[13px] xl:text-[15px] leading-[1.4] font-medium text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
              อยู่ข้างคุณทุกขั้นตอน —{" "}
              <strong className="text-yellow-200 font-black">รับของจีน รวมตู้ เคลียร์ไทย</strong>
              {" "}ปรึกษาฟรี 24 ชม.
            </p>

            {/* CTA row — QR card + 2 phone tel: badges */}
            <div className="mt-1.5 lg:mt-2 xl:mt-2.5 flex flex-wrap items-center gap-2 lg:gap-2.5 self-start ml-[5%] lg:ml-[8%] xl:ml-[11%] pointer-events-auto">
              <TrackedExternalLink
                href="/line"
                cta="line_qr_banner"
                surface="lcl_bottom_banner_qr"
                className="inline-flex items-center gap-2 lg:gap-2.5 bg-white/95 backdrop-blur-sm rounded-lg lg:rounded-xl p-1.5 pr-2.5 lg:pr-3 shadow-[0_8px_20px_rgba(0,0,0,0.28)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.4)] hover:scale-[1.03] transition-all duration-200"
              >
                <Image
                  src="/images/qr-line-oa.png"
                  alt="สแกน QR เพื่อทักไลน์ Pacred Shipping"
                  width={140}
                  height={140}
                  className="w-[60px] lg:w-[74px] xl:w-[88px] h-auto block rounded-sm"
                />
                <div className="leading-tight">
                  <p className="text-[9px] lg:text-[10.5px] xl:text-[11.5px] font-bold text-primary-600 tracking-[0.05em] uppercase">
                    สแกน QR
                  </p>
                  <p className="text-[12.5px] lg:text-[15px] xl:text-[17px] font-black text-primary-700 leading-tight">
                    ทักไลน์ฟรี →
                  </p>
                </div>
              </TrackedExternalLink>

              <div className="flex flex-col gap-1.5 lg:gap-2">
                <a
                  href="tel:024213325"
                  className="inline-flex items-center gap-1.5 lg:gap-2 bg-white/95 backdrop-blur-sm rounded-md lg:rounded-lg px-2.5 lg:px-3 py-1 lg:py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.22)] hover:scale-[1.04] hover:bg-white transition-all"
                >
                  <Phone className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary-600" strokeWidth={2.7} />
                  <span className="text-[12px] lg:text-[14px] xl:text-[16px] font-black text-primary-700 tracking-tight">02-421-3325</span>
                </a>
                <a
                  href="tel:0626030456"
                  className="inline-flex items-center gap-1.5 lg:gap-2 bg-white/95 backdrop-blur-sm rounded-md lg:rounded-lg px-2.5 lg:px-3 py-1 lg:py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.22)] hover:scale-[1.04] hover:bg-white transition-all"
                >
                  <Phone className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary-600" strokeWidth={2.7} />
                  <span className="text-[12px] lg:text-[14px] xl:text-[16px] font-black text-primary-700 tracking-tight">062-603-0456</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Closing confidence banner — full-bleed mobile ── */}
        <div className="md:hidden relative w-screen left-1/2 -translate-x-1/2 mt-8 group aspect-[6/5] overflow-hidden">
          <Image
            src="/images/bannermobile/pacredbannermobile01.png"
            alt="Pacred Shipping — นำเข้า LCL ครบ ราคาชัด คุยกับทีมง่าย ปรึกษาฟรีตลอด 24 ชม."
            fill
            sizes="100vw"
            className="object-cover object-top"
            quality={95}
            unoptimized
          />

          <TrackedExternalLink
            href="/line"
            cta="line_banner_mobile"
            surface="lcl_bottom_banner_mobile"
            className="absolute inset-0 z-0"
            aria-label="ทักไลน์ Pacred Shipping"
          >
            <span className="sr-only">ทักไลน์ Pacred Shipping</span>
          </TrackedExternalLink>

          <div className="absolute inset-0 z-10 pointer-events-none px-4 pt-3.5 pb-6 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col items-start gap-2.5">
            <div>
              <div className="inline-flex items-center gap-1.5 mb-1.5 text-yellow-300 text-[11px] font-black tracking-[0.10em] uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)]">
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.6} />
                LCL GUARANTEE · นำเข้าครบ จบที่เดียว
              </div>
              <h3 className="text-[24px] font-black text-white leading-[1.1] tracking-[-0.02em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                เร็ว ไว ไม่มีคำว่าทำไม่ได้
                <br />
                ส่ง LCL กับ <span className="text-yellow-300">Pacred Shipping</span>
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.45] font-medium text-white/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
                อยู่ข้างคุณทุกขั้นตอน —{" "}
                <strong className="text-yellow-200 font-black">รับของจีน รวมตู้ เคลียร์ไทย ส่งถึงประตู</strong>
                {" "}ปรึกษาฟรี 24 ชม.
              </p>
            </div>

            <TrackedExternalLink
              href="/line"
              cta="line_qr_banner_mobile"
              surface="lcl_bottom_banner_mobile_qr"
              className="inline-block bg-white rounded-xl p-1.5 shadow-[0_8px_22px_rgba(0,0,0,0.32)] pointer-events-auto"
              aria-label="สแกน QR เพื่อทักไลน์ Pacred Shipping"
            >
              <Image
                src="/images/qr-line-oa.png"
                alt="สแกน QR เพื่อทักไลน์ Pacred Shipping"
                width={140}
                height={140}
                className="w-[80px] h-auto block rounded-sm"
              />
            </TrackedExternalLink>

            <div className="flex flex-col gap-1.5 pointer-events-auto">
              <a
                href="tel:024213325"
                className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
              >
                <Phone className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.8} />
                <span className="text-[13px] font-black text-primary-700 tracking-tight">02-421-3325</span>
              </a>
              <a
                href="tel:0626030456"
                className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
              >
                <Phone className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.8} />
                <span className="text-[13px] font-black text-primary-700 tracking-tight">062-603-0456</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
