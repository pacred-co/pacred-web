"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─────────────── Feature cards ───────────────
type Feature = {
  iconSrc: string;
  title: string;
  subtitle: string;
  description: string;
};

const ICON_BASE = "/images/home/iconfloating";

const FEATURES: Feature[] = [
  {
    iconSrc: `${ICON_BASE}/pcs-shop.png`,
    title: "ตรวจสอบร้านค้าจีนทุกครั้ง",
    subtitle: "1688, Taobao, Alibaba, Tmall เราพร้อมเช็คให้",
    description:
      "ไม่ว่าจะสั่งซื้อจากร้านไหน เราช่วยตรวจสอบร้านค้า เช็คสินค้า ประสานงาน ปิดดีลให้ครบ จบทุกงาน — การันตีของถึงมือแน่นอน",
  },
  {
    iconSrc: `${ICON_BASE}/people.png`,
    title: "ทีมงานมืออาชีพ",
    subtitle: "ทีมคุณภาพ ประสบการณ์กว่า 14 ปี",
    description:
      "FCL, LCL, นำเข้า–ส่งออก, ชิปปิ้งเคลียร์ภาษี, สินค้าติดด่าน — ทีมงานคุณภาพดูแลครบทุกขั้นตอน เร็ว ไว ไม่มีคำว่าทำไม่ได้",
  },
  {
    iconSrc: `${ICON_BASE}/checklistred.png`,
    title: "QC ทุกจุด การันตีคุณภาพ",
    subtitle: "ตรวจสินค้าได้ตั้งแต่โกดังต้นทาง",
    description:
      "มั่นใจได้ทุกระดับธุรกิจ ตั้งแต่ SME รายเล็กไปจนถึงรายใหญ่ บริการ QC สินค้าที่โกดัง การันตีคุณภาพก่อนจัดส่งทุกครั้ง",
  },
  {
    iconSrc: `${ICON_BASE}/transfast.png`,
    title: "รวดเร็ว ฉับไว พร้อมส่งสินค้า",
    subtitle: "เร็ว ไว ไม่มีคำว่าทำไม่ได้",
    description:
      "นำเข้าล่าช้า สินค้าติดด่านศุลกากร เจอปัญหาไหนก็เคลียร์ได้ Pacred Shipping พร้อมจัดการอย่างรวดเร็วและเป็นระบบ",
  },
  {
    iconSrc: `${ICON_BASE}/pcs-wallet.png`,
    title: "โปรโมชันขนส่ง",
    subtitle: "ขนส่งไว ราคาคุ้มค่า",
    description:
      "นำเข้ากับเราวันนี้ รับโปรโมชันส่งเหมาๆ เริ่มต้น 100 บาท ทั่วกรุงเทพฯ และปริมณฑล ประหยัดต้นทุนวางแผนค่าใช้จ่ายง่ายขึ้น",
  },
  {
    iconSrc: `${ICON_BASE}/pcs-line-notify.png`,
    title: "SMS แจ้งเตือนยอดชำระเงิน",
    subtitle: "ค่าใช้จ่ายชัดเจน ตรวจสอบง่าย",
    description:
      "ระบบ SMS แจ้งเตือนยอดชำระเงินทุกครั้ง ลดความสับสน ตรวจสอบค่าใช้จ่ายได้โปร่งใส ทุกบิลทุกออเดอร์",
  },
];

// ─────────────── Company Certificate ───────────────
const COMPANY_CERT = {
  title: "หนังสือรับรองบริษัท",
  subtitle: "Company Certificate · กรมพัฒนาธุรกิจการค้า",
  description:
    "เอกสารรับรองนิติบุคคล ใช้ยืนยันข้อมูลบริษัทอย่างเป็นทางการ — รองรับการทำงานกับลูกค้าธุรกิจ SME บริษัท และองค์กรทุกขนาด",
  tags: ["นิติบุคคล", "กรมพัฒนาธุรกิจการค้า", "ราชการ", "เอกสารตัวจริง"],
  pages: [
    "/images/dbd/page-0001.jpg",
    "/images/dbd/page-0002.jpg",
    "/images/dbd/page-0003.jpg",
    "/images/dbd/page-0004.jpg",
  ] as string[],
};

const TOTAL_MOCKUP_PAGES = 5;

export function WhyPacred() {
  const totalPages = COMPANY_CERT.pages.length || TOTAL_MOCKUP_PAGES;
  const hasRealImages = COMPANY_CERT.pages.length > 0;
  const [page, setPage] = useState(0);

  const prev = () => setPage((p) => (p - 1 + totalPages) % totalPages);
  const next = () => setPage((p) => (p + 1) % totalPages);

  return (
    <>
      <section id="why-pacred" className="relative py-8 md:py-12">
        <div className="mx-auto w-full max-w-[1140px] px-[10px]">

          {/* ─── Header ─── */}
          <div className="mx-auto w-full max-w-[1120px]">
            <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              WHY PACRED SHIPPING
            </div>
            <h2 className="text-[26px] md:text-[38px] leading-[1.18] md:leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
              นำเข้า–ส่งออก ของติดด่าน Port ไหน Term ใด{" "}
              <span className="text-primary-600">ก็ไว้ใจเราได้</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.55] font-medium text-muted md:whitespace-nowrap md:overflow-hidden md:text-ellipsis">
              สั่งซื้อจีน · QC · ขนส่ง FCL/LCL · เคลียร์ภาษี · สินค้าติดด่าน — Pacred Shipping ดูแลครบ จบในที่เดียว
            </p>
          </div>

          {/* ─── Feature grid 6 cards ─── */}
          <div className="mx-auto mt-6 md:mt-8 w-full max-w-[1120px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {FEATURES.map((f, i) => {
                const num = String(i + 1).padStart(2, "0");
                return (
                  <Link
                    key={i}
                    href="/register"
                    aria-label={`สมัครเลย · ${f.title}`}
                    className="group relative block bg-white dark:bg-surface rounded-2xl border border-border p-5 md:p-6 shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_24px_50px_-12px_rgba(179,0,0,0.18)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400 overflow-hidden cursor-pointer"
                  >
                    {/* Decorative dot pattern — appears on hover */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-[0.05] dark:group-hover:opacity-[0.08] transition-opacity duration-500"
                      style={{
                        backgroundImage: "radial-gradient(circle at 1px 1px, #b30000 1px, transparent 0)",
                        backgroundSize: "16px 16px",
                      }}
                    />

                    {/* Top animated accent line */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-0 group-hover:opacity-100 -translate-x-full group-hover:translate-x-0 transition-all duration-700"
                    />

                    {/* Hover gradient blob */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -top-16 -right-16 w-44 h-44 rounded-full bg-gradient-to-br from-primary-200/80 to-primary-400/40 dark:from-primary-900/40 dark:to-primary-700/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    />

                    {/* Number indicator */}
                    <div className="absolute top-4 right-4 md:top-5 md:right-5 flex items-center gap-1 text-muted/40 group-hover:text-primary-600/60 transition-colors duration-300">
                      <span className="text-[10px] font-bold tracking-[0.2em]">NO.</span>
                      <span className="text-[18px] md:text-[20px] font-black tabular-nums leading-none tracking-tight">{num}</span>
                    </div>

                    {/* Icon — grayscale offline → color on hover */}
                    <div className="relative w-14 h-14 md:w-16 md:h-16 mb-4 flex items-center justify-center rounded-xl md:rounded-2xl bg-gray-100/70 dark:bg-background border border-border group-hover:bg-primary-50 dark:group-hover:bg-primary-900/20 group-hover:border-primary-200 dark:group-hover:border-primary-900/60 transition-all duration-400">
                      <Image
                        src={f.iconSrc}
                        alt=""
                        width={64}
                        height={64}
                        className="relative w-[42px] h-[42px] md:w-[48px] md:h-[48px] object-contain grayscale opacity-50 saturate-0 transition-all duration-400 group-hover:grayscale-0 group-hover:opacity-100 group-hover:saturate-100 group-hover:scale-110 group-hover:-rotate-6"
                      />
                      {/* Accent dot */}
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 border-2 border-white dark:border-surface shadow-[0_2px_6px_rgba(0,0,0,0.15)] scale-0 group-hover:scale-100 transition-transform duration-300" />
                    </div>

                    {/* Title */}
                    <h3 className="relative text-[15px] md:text-[17px] font-black text-[#111827] dark:text-white leading-tight tracking-tight mb-1 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors duration-300">
                      {f.title}
                    </h3>

                    {/* Subtitle */}
                    <p className="relative text-[12px] md:text-[12.5px] font-bold text-muted group-hover:text-primary-600 leading-snug mb-2 transition-colors duration-300">
                      {f.subtitle}
                    </p>

                    {/* Description */}
                    <p className="relative text-[12.5px] md:text-[13px] leading-[1.55] text-muted">
                      {f.description}
                    </p>

                    {/* Bottom accent — "สมัครเลย →" reveal on hover */}
                    <div className="relative mt-4 flex items-center justify-between gap-2">
                      <div className="h-[2px] flex-1 bg-border overflow-hidden rounded-full">
                        <div className="h-full w-0 group-hover:w-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all duration-500 ease-out rounded-full" />
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-black text-primary-600 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 whitespace-nowrap">
                        สมัครเลย
                        <ArrowRight className="w-3 h-3" strokeWidth={3} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ─── Company Certificate — slider ─── */}
          <div className="mx-auto mt-10 md:mt-14 w-full max-w-[1120px]">
            <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              VERIFIED COMPANY
            </div>
            <h3 className="text-[22px] md:text-[30px] leading-[1.22] md:leading-[1.18] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
              หนังสือรับรองบริษัท{" "}
              <span className="text-primary-600">ตรวจสอบได้จริง</span>
            </h3>

            {/* Slider (left) + article (right) */}
            <div className="mt-6 md:mt-8 grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6 md:gap-10 items-start">

            {/* ── Slider column ── */}
            <div className="relative">
              {/* Slider window */}
              <div className="relative w-[260px] sm:w-[280px] ml-0">
                {/* Stacked paper effect — bg layers */}
                <div aria-hidden className="absolute inset-x-2.5 -bottom-1.5 top-1.5 rounded-md bg-white dark:bg-background shadow-[0_6px_14px_-8px_rgba(15,23,42,0.16)] opacity-60" />
                <div aria-hidden className="absolute inset-x-1 -bottom-0.5 top-0.5 rounded-md bg-white dark:bg-background shadow-[0_6px_14px_-8px_rgba(15,23,42,0.18)] opacity-80" />

                {/* Front document */}
                <div className="relative aspect-[1/1.41] rounded-md overflow-hidden bg-white dark:bg-background shadow-[0_14px_30px_-12px_rgba(15,23,42,0.22)] border border-border">
                  <div
                    className="flex h-full transition-transform duration-500 ease-out"
                    style={{ transform: `translateX(-${page * 100}%)` }}
                  >
                    {Array.from({ length: totalPages }).map((_, idx) => (
                      <div key={idx} className="w-full h-full shrink-0 relative">
                        {hasRealImages ? (
                          <Image
                            src={COMPANY_CERT.pages[idx]}
                            alt={`หนังสือรับรองบริษัท หน้า ${idx + 1}`}
                            fill
                            className="object-contain"
                          />
                        ) : (
                          <CertificateMockupPage page={idx} />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Page corner badge */}
                  <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/95 dark:bg-surface/95 text-[9px] font-black text-primary-600 border border-primary-200 dark:border-primary-900/60 shadow tabular-nums">
                    {page + 1}/{totalPages}
                  </div>

                  {/* VERIFIED stamp — corner */}
                  <div className="absolute bottom-2 right-2 w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center rotate-[-12deg] shadow-[0_6px_14px_rgba(179,0,0,0.30)] border-[2px] border-white dark:border-surface">
                    <span className="text-[6px] md:text-[6.5px] font-black tracking-wider leading-none text-center">
                      VERIFIED<br/>BY<br/>PACRED
                    </span>
                  </div>
                </div>

                {/* Side nav buttons */}
                <button
                  type="button"
                  onClick={prev}
                  aria-label="หน้าก่อนหน้า"
                  suppressHydrationWarning
                  className="absolute -left-3 sm:-left-5 top-1/2 -translate-y-1/2 w-8 h-8 md:w-9 md:h-9 rounded-full bg-white dark:bg-surface border border-border text-[#111827] dark:text-white flex items-center justify-center shadow-[0_6px_14px_rgba(15,23,42,0.15)] hover:bg-primary-600 hover:text-white hover:border-primary-600 hover:scale-110 transition-all duration-300 z-10"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="หน้าถัดไป"
                  suppressHydrationWarning
                  className="absolute -right-3 sm:-right-5 top-1/2 -translate-y-1/2 w-8 h-8 md:w-9 md:h-9 rounded-full bg-white dark:bg-surface border border-border text-[#111827] dark:text-white flex items-center justify-center shadow-[0_6px_14px_rgba(15,23,42,0.15)] hover:bg-primary-600 hover:text-white hover:border-primary-600 hover:scale-110 transition-all duration-300 z-10"
                >
                  <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>

              {/* Page dots + counter */}
              <div className="mt-5 md:mt-6 w-[260px] sm:w-[280px] flex items-center gap-2.5">
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPage(idx)}
                      aria-label={`ไปหน้า ${idx + 1}`}
                      suppressHydrationWarning
                      className={[
                        "transition-all duration-300 rounded-full",
                        idx === page
                          ? "w-5 h-1.5 bg-gradient-to-r from-primary-500 to-primary-700 shadow-[0_2px_6px_rgba(179,0,0,0.30)]"
                          : "w-1.5 h-1.5 bg-border hover:bg-primary-300",
                      ].join(" ")}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-black text-muted tabular-nums tracking-wider">
                  {String(page + 1).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
                </span>
              </div>
            </div>

            {/* ── Article column ── */}
            <article className="text-[13px] md:text-[14px] leading-[1.75] text-muted space-y-3 md:space-y-3.5">
              <h4 className="text-[18px] md:text-[22px] font-black text-[#111827] dark:text-white leading-[1.25] tracking-tight">
                <span className="text-primary-600">Pacred Shipping</span> ผู้เชี่ยวชาญด้านนำเข้า–ส่งออกครบวงจร
              </h4>

              <p>
                <span className="font-black text-primary-600">Pacred Shipping</span> เปิดประสบการณ์ผู้เชี่ยวชาญด้านชิปปิ้งนำเข้า–ส่งออก เคลียร์พิธีการกรมศุลกากรครบวงจร มากกว่า <span className="font-black text-[#111827] dark:text-white">14 ปี</span> ดูแลตั้งแต่ต้นน้ำถึงปลายน้ำ จบในที่เดียว หากคุณกำลังต้องการสั่งซื้อสินค้าจากจีนหรือต่างประเทศทั่วโลก ไม่ว่าจะเป็น <span className="font-black text-[#111827] dark:text-white">1688 / Taobao / Tmall</span> เราพร้อมให้บริการฝากโอนชำระค่าสินค้าอย่างปลอดภัย พร้อมเรทคุ้มค่า โปร่งใส ตรวจสอบได้
              </p>

              <p>
                ไม่เพียงเท่านั้น เรายังมีทีมล่ามจีนมืออาชีพช่วยติดต่อ เจรจา และปิดดีลโรงงานให้ฟรี ช่วยให้คุณลดต้นทุนค่าสินค้า เราทำราคาดีที่สุดได้แน่นอน พร้อมบริการนำเข้าสินค้าแบบ <span className="font-black text-[#111827] dark:text-white">Door to Door</span> ครบทุกขั้นตอน ตั้งแต่จัดหา สั่งซื้อ ขนส่ง ไปจนถึงเคลียร์ศุลกากรและจัดส่งถึงมือคุณ
              </p>

              <p>
                สำหรับผู้ที่มีสินค้าอยู่แล้ว ไม่ว่าคุณจะเป็นบุคคลทั่วไป นิติบุคคล หรือผู้ประกอบการ เราพร้อมช่วยขยายตลาดให้คุณ ด้วยบริการตัวแทนจำหน่ายและส่งออกสินค้าไปต่างประเทศ ดูแลเอกสาร โลจิสติกส์ และขั้นตอนทั้งหมดให้ครบ
              </p>

              <p>
                Pacred มุ่งเน้นการบริการที่{" "}
                <span className="font-black text-primary-600">&ldquo;เร็ว ไว ไม่มีคำว่าทำไม่ได้&rdquo;</span>{" "}
                ทุกขั้นตอน พร้อมทีมงานมืออาชีพที่มีประสบการณ์มากกว่า 14 ปี — นำเข้า–ส่งออก เคลียร์ สั่งซื้อ เราพร้อมรับจบหมดทุกปัญหา
              </p>

              <p>
                ไม่ว่าจะนำเข้าสินค้าจากจีน หรือส่งออกไปทั่วโลก จะสั่งซื้อ ฝากโอน หรือขยายธุรกิจไปต่างประเทศ ให้ <span className="font-black text-primary-600">Pacred Shipping</span> ดูแล แล้วคุณจะเข้าใจคำว่า{" "}
                <span className="font-black text-primary-600">&ldquo;ครบจบจริงในที่เดียว&rdquo;</span>
              </p>
            </article>

            </div>
          </div>

        </div>
      </section>
    </>
  );
}

// ─────────────── Certificate mockup pages ───────────────
// แสดง mockup เลียนแบบเอกสารจริง 5 หน้าที่หน้าตาต่างกัน — ใช้ตอนยังไม่มีภาพจริง
function CertificateMockupPage({ page }: { page: number }) {
  return (
    <div className="absolute inset-0 bg-white dark:bg-background flex flex-col">
      {/* Top red header — taller for page 1 (title page) */}
      <div className={`relative shrink-0 bg-gradient-to-r from-primary-600 via-primary-700 to-primary-600 ${page === 0 ? "h-16" : "h-7"}`}>
        <div className="absolute inset-y-2 left-4 right-4 flex items-center gap-1.5">
          <div className="w-1 h-full bg-white/60 rounded" />
          {page === 0 ? (
            <div className="flex-1 flex flex-col gap-1.5 pl-1">
              <div className="h-2 w-2/3 bg-white/95 rounded-sm" />
              <div className="h-1.5 w-1/2 bg-white/60 rounded-sm" />
            </div>
          ) : (
            <div className="h-1.5 w-1/3 bg-white/80 rounded-sm" />
          )}
          <div className="ml-auto h-3 w-3 rounded-full border border-white/60 flex items-center justify-center">
            <span className="text-[6px] font-black text-white">{page + 1}</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 flex flex-col gap-2 min-h-0">
        {/* Page-specific content */}
        {page === 0 && (
          <>
            {/* Title page */}
            <div className="text-center mt-2 mb-3">
              <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 mb-2 flex items-center justify-center">
                <span className="text-white font-black text-[18px]">P</span>
              </div>
              <div className="h-2 w-32 mx-auto rounded-sm bg-[#111827]/85 dark:bg-white/85" />
              <div className="h-1.5 w-24 mx-auto mt-1.5 rounded-sm bg-muted/45" />
            </div>
            <div className="space-y-1 mt-2">
              <div className="h-1 rounded-sm bg-muted/30" />
              <div className="h-1 rounded-sm bg-muted/30 w-[90%] mx-auto" />
              <div className="h-1 rounded-sm bg-muted/30 w-[80%] mx-auto" />
            </div>
            <div className="mt-auto pt-4 flex justify-center">
              <div className="w-14 h-14 rounded-full border-2 border-primary-300/60 dark:border-primary-800/70 flex items-center justify-center rotate-[-6deg] bg-primary-50/40 dark:bg-primary-900/10">
                <span className="text-[7px] font-black text-primary-600/80 leading-none text-center tracking-wider">
                  COMPANY<br/>★ SEAL ★
                </span>
              </div>
            </div>
          </>
        )}

        {page === 1 && (
          <>
            {/* Company info — label : value rows */}
            <div className="h-1.5 w-2/5 rounded-sm bg-[#111827]/75 dark:bg-white/75 mb-1" />
            {[
              { label: 22, value: 60 },
              { label: 18, value: 50 },
              { label: 24, value: 70 },
              { label: 20, value: 55 },
              { label: 22, value: 65 },
              { label: 16, value: 45 },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <div className="h-1 rounded-sm bg-muted/45" style={{ width: `${row.label}%` }} />
                <div className="h-1 flex-1 rounded-sm bg-muted/25" />
              </div>
            ))}
          </>
        )}

        {page === 2 && (
          <>
            {/* Directors list */}
            <div className="h-1.5 w-1/2 rounded-sm bg-[#111827]/75 dark:bg-white/75 mb-1" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/40 dark:to-primary-900/20 border border-primary-200/60 dark:border-primary-900/60 shrink-0 flex items-center justify-center">
                  <span className="text-[6px] font-black text-primary-600">{i}</span>
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="h-1 w-3/4 rounded-sm bg-[#111827]/55 dark:bg-white/55" />
                  <div className="h-0.5 w-1/2 rounded-sm bg-muted/35" />
                </div>
              </div>
            ))}
          </>
        )}

        {page === 3 && (
          <>
            {/* Address + objectives */}
            <div className="h-1.5 w-2/5 rounded-sm bg-[#111827]/75 dark:bg-white/75 mb-1" />
            <div className="rounded border border-border p-2 space-y-1 bg-surface/40 dark:bg-background/40">
              <div className="h-1 rounded-sm bg-muted/40" />
              <div className="h-1 rounded-sm bg-muted/40 w-[88%]" />
              <div className="h-1 rounded-sm bg-muted/40 w-[72%]" />
            </div>
            <div className="h-1.5 w-1/3 rounded-sm bg-[#111827]/65 dark:bg-white/65 mt-2 mb-0.5" />
            <div className="space-y-1">
              <div className="h-1 rounded-sm bg-muted/35" />
              <div className="h-1 rounded-sm bg-muted/35 w-[90%]" />
              <div className="h-1 rounded-sm bg-muted/35 w-[68%]" />
            </div>
          </>
        )}

        {page === 4 && (
          <>
            {/* Signature page */}
            <div className="h-1.5 w-1/2 rounded-sm bg-[#111827]/75 dark:bg-white/75 mb-1" />
            <div className="space-y-1 mb-3">
              <div className="h-1 rounded-sm bg-muted/40" />
              <div className="h-1 rounded-sm bg-muted/40 w-[85%]" />
            </div>
            <div className="mt-auto flex items-end justify-between gap-3 pt-4">
              <div className="space-y-1 flex-1">
                <div className="h-px bg-muted/45 w-full" />
                <div className="h-1 w-1/2 rounded-sm bg-muted/45" />
                <div className="h-0.5 w-1/3 rounded-sm bg-muted/35" />
              </div>
              {/* Two stamps */}
              <div className="flex gap-1 shrink-0">
                <div className="w-11 h-11 rounded-full border-[1.5px] border-primary-400/60 flex items-center justify-center rotate-[-12deg] bg-primary-50/40 dark:bg-primary-900/10">
                  <span className="text-[5.5px] font-black text-primary-600/80 leading-none text-center tracking-wider">
                    PACRED<br/>★★★
                  </span>
                </div>
                <div className="w-11 h-11 rounded-full border-[1.5px] border-blue-400/60 flex items-center justify-center rotate-[8deg] bg-blue-50/40 dark:bg-blue-900/10">
                  <span className="text-[5.5px] font-black text-blue-600/80 leading-none text-center tracking-wider">
                    OFFICIAL<br/>SEAL
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer line */}
      <div className="h-1 bg-gradient-to-r from-primary-200 via-primary-400 to-primary-200 shrink-0" />
    </div>
  );
}
