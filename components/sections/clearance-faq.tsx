"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

const FAQS = [
  {
    q: "ค่าบริการเคลียร์สินค้าติดด่านคิดยังไง?",
    a: "ค่าบริการขึ้นกับ 3 ปัจจัย: (1) ด่าน/ท่าที่สินค้าติดอยู่ (2) ประเภทสินค้า (ทั่วไป / มอก. / อย. / สินค้าควบคุม) และ (3) สถานะเอกสาร (ครบ / ไม่ครบ / HS Code มีปัญหา) เริ่มต้นเคสปกติ 2,800 บาท แจ้งราคาชัดเจนก่อนเริ่ม 100% ไม่มีค่าแอบแฝง",
  },
  {
    q: "เอกสารไม่ครบหรือไม่แน่ใจว่าใช้ HS Code ไหน — ทำยังไง?",
    a: "ส่งเท่าที่มีมาทาง LINE / Email ทีม Pacred จะช่วยวิเคราะห์พิกัด HS Code ที่ถูกต้อง จัดทำเอกสารที่ขาด และประสานกับโรงงาน/ผู้ขายต้นทางให้ ลูกค้าไม่ต้องเดินเองทุกขั้นตอน",
  },
  {
    q: "ใช้เวลาเคลียร์กี่ชั่วโมง/วัน?",
    a: "งานปกติ เอกสารครบ: 1–3 ชม. ปล่อยสินค้าได้ภายในวัน. งานที่ต้องขอใบอนุญาตเพิ่ม (อย./มอก./กสทช.): 1–5 วันทำการขึ้นกับหน่วยงาน. ทีมเราจะแจ้ง Timeline ที่แม่นยำหลังตรวจเอกสาร",
  },
  {
    q: "ต้องจ่ายภาษีอะไรบ้าง?",
    a: "1) อากรขาเข้า (Import Duty) ตามพิกัด HS Code 2) ภาษีมูลค่าเพิ่ม (VAT 7%) คำนวณจาก CIF + อากร 3) ภาษีสรรพสามิต (ถ้ามี เช่น เครื่องดื่ม น้ำหอม). เรามีบริการคำนวณภาษีให้ล่วงหน้าฟรี",
  },
  {
    q: "Form E คืออะไร ใช้แล้วได้ลดอะไร?",
    a: "Form E เป็นใบรับรองถิ่นกำเนิดสินค้าตามข้อตกลง FTA จีน–อาเซียน ใช้ลดอากรขาเข้าได้ถึง 0% สำหรับสินค้าหลายพิกัด ถ้าซื้อสินค้าจากจีนแล้วยังไม่มี Form E เราช่วยประสานโรงงานออกให้",
  },
  {
    q: "สินค้าติดด่านอยู่ตอนนี้ ค่าปรับ/ค่าเก็บรักษาคิดยังไง?",
    a: "ค่าปรับและค่าเก็บรักษาคิดเป็นรายวัน เริ่มสะสมตั้งแต่วันที่สินค้ามาถึง ยิ่งทิ้งไว้นานยิ่งแพง แนะนำให้รีบส่งเอกสารให้ทีมเราภายในวันที่ทราบเหตุ เพื่อหยุดยอดและเริ่มเคลียร์ทันที",
  },
  {
    q: "ไม่ใช่บริษัท เป็นบุคคลทั่วไป เคลียร์ได้ไหม?",
    a: "ได้ครับ ทั้งบุคคลธรรมดาและนิติบุคคล Pacred ขึ้นทะเบียนผู้นำเข้า/ส่งออกให้ฟรีและจับคู่รหัส (YY) กับกรมศุลกากรภายใน 30 นาที พร้อมใช้งานทันที",
  },
  {
    q: "Pacred ดูแลด่านไหนบ้าง?",
    a: "ครบทุกด่านในไทย: สุวรรณภูมิ · ดอนเมือง · ท่าเรือกรุงเทพ (คลองเตย) · แหลมฉบัง · ICD ลาดกระบัง · ไปรษณีย์หลักสี่ · มุกดาหาร · หนองคาย · อรัญประเทศ · แม่สาย",
  },
];

export function ClearanceFAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-4 md:py-8">
      <div className="mx-auto w-full max-w-[920px] px-3 md:px-4">

        {/* Header */}
        <div className="mb-4 md:mb-7">
          <div className="flex items-center gap-1.5 mb-1 md:mb-1.5 text-primary-600 text-[10.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <HelpCircle className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={2.8} />
            CLEARANCE FAQ
          </div>
          <h2 className="text-[20px] md:text-[38px] leading-[1.25] md:leading-[1.15] font-black tracking-[-0.03em] md:tracking-[-0.04em] text-[#111827] dark:text-white">
            คำถามที่พบบ่อย
            <span className="text-primary-600"> เกี่ยวกับการเคลียร์ด่าน</span>
          </h2>
          <p className="mt-1.5 md:mt-2 max-w-[820px] text-[12px] md:text-[15px] leading-[1.5] md:leading-[1.55] font-medium text-muted">
            รวมคำถามที่ลูกค้าถามมากที่สุด — ถ้าไม่เจอ ทักทีมเราใน LINE ตอบทุกข้อภายใน 5 นาที
          </p>
        </div>

        {/* Accordion */}
        <div className="flex flex-col gap-2.5">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className={`overflow-hidden rounded-xl md:rounded-2xl border transition-all ${
                  isOpen
                    ? "border-primary-300 dark:border-primary-800 bg-white dark:bg-surface shadow-[0_12px_28px_rgba(220,38,38,0.10)]"
                    : "border-border bg-white dark:bg-surface hover:border-primary-200 dark:hover:border-primary-900"
                }`}
              >
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-3 md:gap-4 px-3.5 md:px-5 py-3 md:py-4 text-left cursor-pointer"
                >
                  <div className="flex items-start gap-2.5 md:gap-3">
                    <span className={`mt-0.5 inline-flex h-6 w-6 md:h-7 md:w-7 shrink-0 items-center justify-center rounded-md md:rounded-lg text-[11px] md:text-[13px] font-black transition-colors ${
                      isOpen
                        ? "bg-primary-600 text-white"
                        : "bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300"
                    }`}>
                      Q
                    </span>
                    <span className="text-[12.5px] md:text-[15.5px] font-extrabold text-[#111827] dark:text-white leading-[1.4]">
                      {f.q}
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 md:h-5 md:w-5 shrink-0 text-muted transition-transform duration-300 ${isOpen ? "rotate-180 text-primary-600" : ""}`}
                    strokeWidth={2.4}
                  />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <div className="overflow-hidden">
                    <div className="px-3.5 md:px-5 pb-4 md:pb-5 pt-0">
                      <div className="ml-8 md:ml-10 pl-2.5 md:pl-3 border-l-2 border-primary-200 dark:border-primary-900/60 text-[12.5px] md:text-[14.5px] leading-[1.6] md:leading-[1.7] text-[#4b5563] dark:text-white/80">
                        {f.a}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
