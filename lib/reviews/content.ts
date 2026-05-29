/**
 * Per-review SEO content matrix for the `/reviews/[id]` landing pages.
 *
 * **Server-intended** — produces the long-form, keyword-rich body for each
 * review landing page. Not imported by the `"use client"` carousel (which
 * uses only the short i18n labels), so this prose never ships in the client
 * bundle.
 *
 * Content is composed from three axes so each landing page reads relevantly
 * for the review it represents:
 *   - service  — FCL / LCL / customs clearance / air clearance (from `titleKey`)
 *   - mode     — sea / road / air (from the mode tag)
 *   - term     — DDP / CIF Incoterm (from the term tag)
 *
 * Each page cross-links to the matching `/services/*` landing page so the
 * review funnels into the real booking surface.
 */
import { type SiteLocale } from "@/components/seo/site";
import type { Review, TagKey, TitleKey } from "./catalog";

type Mode = "sea" | "road" | "air";
type Term = "DDP" | "CIF";

export type ReviewContent = {
  /** Human-friendly code, e.g. "FCL-01" — keeps each metaTitle unique. */
  code: string;
  /** Short service label, e.g. "FCL เหมาตู้". */
  serviceLabel: string;
  /** Transport mode label, e.g. "ทางเรือ". */
  modeLabel: string;
  /** Incoterm labels present on this review, e.g. ["DDP"]. */
  termLabels: string[];
  /** Page H1. */
  h1: string;
  /** <title> — includes the code so near-identical reviews stay unique. */
  metaTitle: string;
  metaDescription: string;
  /** Keyword chips (visible) + <meta name="keywords">. */
  keywords: string[];
  /** Lead paragraph under the H1. */
  intro: string;
  /** Body sections. */
  sections: { heading: string; paragraphs: string[] }[];
  /** FAQ — also feeds FAQPage JSON-LD. */
  faq: { question: string; answer: string }[];
  /** Cross-link to the matching /services landing page. */
  cta: { href: string; label: string; description: string };
};

function modeOf(tagKeys: TagKey[]): Mode {
  if (tagKeys.includes("tagAir")) return "air";
  if (tagKeys.includes("tagRoad")) return "road";
  return "sea";
}

function termsOf(tagKeys: TagKey[]): Term[] {
  const out: Term[] = [];
  if (tagKeys.includes("tagDdp")) out.push("DDP");
  if (tagKeys.includes("tagCif")) out.push("CIF");
  return out;
}

/** "fcl-12" → "FCL-12", "clr-air-6" → "AIR-06", "clr-1" → "CLR-01". */
function codeOf(id: string): string {
  const num = id.match(/(\d+)$/)?.[1] ?? "";
  const padded = num.padStart(2, "0");
  const prefix = id.startsWith("clr-air")
    ? "AIR"
    : id.startsWith("clr")
      ? "CLR"
      : id.startsWith("lcl")
        ? "LCL"
        : "FCL";
  return `${prefix}-${padded}`;
}

// ─────────────────────────── TH content ───────────────────────────

const TH_MODE: Record<Mode, { label: string; blurb: string; kw: string }> = {
  sea: {
    label: "ทางเรือ",
    blurb:
      "ขนส่งทางเรือจีน–ไทย เหมาะกับสินค้าปริมาณมากและน้ำหนักสูง ต้นทุนต่อหน่วยประหยัดที่สุด ใช้เวลาประมาณ 10–15 วัน",
    kw: "นำเข้าทางเรือจีน",
  },
  road: {
    label: "ทางรถ",
    blurb:
      "ขนส่งทางรถจีน–ไทยผ่านด่านชายแดน รวดเร็วกว่าทางเรือ ใช้เวลาประมาณ 5–7 วัน เหมาะกับสินค้าที่ต้องการความเร็วปานกลาง",
    kw: "นำเข้าทางรถจีน",
  },
  air: {
    label: "ทางอากาศ",
    blurb:
      "ขนส่งทางอากาศ รวดเร็วที่สุด ใช้เวลาเพียง 2–4 วัน เหมาะกับสินค้าด่วน สินค้ามูลค่าสูง หรือสินค้าน้ำหนักเบา",
    kw: "นำเข้าทางอากาศด่วน",
  },
};

const TH_TERM: Record<Term, { blurb: string; kw: string }> = {
  DDP: {
    blurb:
      "เงื่อนไข DDP (Delivered Duty Paid) — ราคารวมค่าขนส่ง ภาษี และพิธีการศุลกากร ส่งถึงหน้าบ้านโดยไม่ต้องจ่ายเพิ่มหน้าด่าน จบในราคาเดียว",
    kw: "นำเข้า DDP จีนไทย",
  },
  CIF: {
    blurb:
      "เงื่อนไข CIF (Cost, Insurance, Freight) — ราคารวมค่าสินค้า ค่าประกัน และค่าขนส่งถึงท่าปลายทาง โดย Pacred ช่วยดำเนินพิธีการศุลกากรต่อให้ครบ",
    kw: "นำเข้า CIF จีนไทย",
  },
};

type ServiceBlock = {
  serviceLabel: string;
  titleNoun: string;
  keywords: string[];
  intro: (modeLabel: string) => string;
  sections: (mode: Mode, terms: Term[]) => { heading: string; paragraphs: string[] }[];
  faq: (mode: Mode, terms: Term[]) => { question: string; answer: string }[];
  cta: { href: string; label: string; description: string };
};

const termSentenceTh = (terms: Term[]) =>
  terms.length === 0
    ? ""
    : terms.map((t) => TH_TERM[t].blurb).join(" และ ");

const TH_SERVICE: Record<TitleKey, ServiceBlock> = {
  titleFcl: {
    serviceLabel: "FCL เหมาตู้",
    titleNoun: "FCL นำเข้าสินค้าจากจีน เหมาตู้คอนเทนเนอร์",
    keywords: [
      "นำเข้าสินค้าจากจีน",
      "FCL เหมาตู้",
      "นำเข้าเหมาตู้คอนเทนเนอร์",
      "ชิปปิ้งจีน FCL",
      "นำเข้าตู้ 20 ฟุต",
      "นำเข้าตู้ 40 ฟุต",
    ],
    intro: (m) =>
      `ผลงานจริงของ Pacred Shipping ในการนำเข้าสินค้าจากจีนแบบ FCL เหมาตู้คอนเทนเนอร์ ${m} — ดูแลครบตั้งแต่จองตู้ที่จีน ขนส่ง เคลียร์ภาษี จนส่งถึงโกดังปลายทางในไทย`,
    sections: (mode, terms) => [
      {
        heading: "FCL เหมาตู้คืออะไร เหมาะกับใคร",
        paragraphs: [
          "FCL (Full Container Load) คือการนำเข้าแบบเช่าตู้คอนเทนเนอร์เต็มใบ — สินค้าทั้งตู้เป็นของคุณคนเดียว ไม่ต้องแชร์พื้นที่กับใคร เหมาะกับผู้นำเข้าที่มีสินค้าตั้งแต่ประมาณ 10–15 CBM ขึ้นไป เพราะคุ้มกว่าการรวมตู้ (LCL) ทันที",
          "ตู้มาตรฐานมีให้เลือกทั้งตู้ 20 ฟุต และตู้ 40 ฟุต/40HQ ทีม Pacred ช่วยประเมินว่าสินค้าของคุณควรใช้ตู้ขนาดไหนเพื่อจัดวางได้เต็มคุ้มที่สุด",
        ],
      },
      {
        heading: `ขั้นตอนการนำเข้า FCL ${TH_MODE[mode].label} กับ Pacred`,
        paragraphs: [
          `จองตู้และยืนยันออเดอร์ → โหลดสินค้าเข้าตู้ที่โกดังจีน → ขนส่ง${TH_MODE[mode].label}มายังไทย → เคลียร์พิธีการศุลกากรและชำระภาษีนำเข้า → ส่งตู้ถึงโกดัง/หน้าโรงงานของคุณ`,
          TH_MODE[mode].blurb,
        ],
      },
      ...(terms.length
        ? [
            {
              heading: `เงื่อนไขราคา (${terms.join(" / ")})`,
              paragraphs: [termSentenceTh(terms)],
            },
          ]
        : []),
    ],
    faq: (mode, terms) => [
      {
        question: "นำเข้า FCL ขั้นต่ำกี่ CBM ถึงคุ้ม",
        answer:
          "โดยทั่วไปเมื่อสินค้าเกิน 10–15 CBM การเหมาตู้ FCL จะคุ้มกว่ารวมตู้ LCL — ทีม Pacred คำนวณเปรียบเทียบให้ฟรีก่อนตัดสินใจ",
      },
      {
        question: `นำเข้า FCL ${TH_MODE[mode].label} ใช้เวลานานเท่าไหร่`,
        answer: TH_MODE[mode].blurb,
      },
      ...(terms.includes("DDP")
        ? [
            {
              question: "ราคา DDP รวมภาษีแล้วหรือยัง",
              answer:
                "DDP รวมค่าขนส่ง ภาษีนำเข้า และพิธีการศุลกากรเรียบร้อย ส่งถึงหน้าบ้านโดยไม่ต้องจ่ายเพิ่มหน้าด่าน",
            },
          ]
        : []),
    ],
    cta: {
      href: "/services/import-china-fcl",
      label: "ดูบริการ FCL นำเข้าเหมาตู้",
      description: "คำนวณค่าตู้ 20'/40' + จองคิวนำเข้ากับทีม Pacred",
    },
  },

  titleLcl: {
    serviceLabel: "LCL รวมตู้",
    titleNoun: "LCL นำเข้าสินค้าจากจีน รวมตู้ เปิดใบขนสินค้า",
    keywords: [
      "นำเข้าสินค้าจากจีน",
      "LCL รวมตู้",
      "ชิปปิ้งจีน LCL",
      "นำเข้าสินค้าไม่เต็มตู้",
      "เปิดใบขนสินค้า",
      "นำเข้าจีนรายย่อย",
    ],
    intro: (m) =>
      `ผลงานจริงของ Pacred Shipping ในการนำเข้าสินค้าจากจีนแบบ LCL รวมตู้ ${m} — จ่ายตามปริมาณจริง เปิดใบขนสินค้าถูกต้อง เหมาะกับผู้นำเข้ารายย่อยที่ของยังไม่เต็มตู้`,
    sections: (mode, terms) => [
      {
        heading: "LCL รวมตู้คืออะไร เหมาะกับใคร",
        paragraphs: [
          "LCL (Less than Container Load) คือการนำเข้าแบบรวมตู้ — แชร์พื้นที่ตู้คอนเทนเนอร์กับผู้นำเข้ารายอื่น จ่ายตามปริมาตร (CBM) หรือน้ำหนักจริงของสินค้า เหมาะกับผู้ที่สินค้ายังไม่ถึงขั้นเหมาตู้ FCL",
          "ข้อดีคือเริ่มนำเข้าได้แม้ของน้อย ควบคุมต้นทุนได้ตามจริง และยังได้เปิดใบขนสินค้าขาเข้าอย่างถูกต้องตามกฎหมาย พร้อมเอกสารครบสำหรับทำบัญชีและขอคืนภาษี",
        ],
      },
      {
        heading: `ขั้นตอนการนำเข้า LCL ${TH_MODE[mode].label} กับ Pacred`,
        paragraphs: [
          `ส่งสินค้าเข้าโกดังจีน → วัดปริมาตร/ชั่งน้ำหนัก → รวมตู้และขนส่ง${TH_MODE[mode].label} → เคลียร์พิธีการศุลกากรและเปิดใบขนสินค้า → กระจายส่งถึงมือคุณ`,
          TH_MODE[mode].blurb,
        ],
      },
      ...(terms.length
        ? [
            {
              heading: `เงื่อนไขราคา (${terms.join(" / ")})`,
              paragraphs: [termSentenceTh(terms)],
            },
          ]
        : []),
    ],
    faq: (mode, terms) => [
      {
        question: "นำเข้า LCL คิดราคายังไง",
        answer:
          "LCL คิดตามปริมาตร (CBM) หรือน้ำหนักจริงของสินค้า แล้วแต่ว่าค่าใดสูงกว่า — เริ่มนำเข้าได้แม้ของน้อย ไม่ต้องรอเต็มตู้",
      },
      {
        question: "LCL เปิดใบขนสินค้าให้ด้วยไหม",
        answer:
          "ใช่ — Pacred เปิดใบขนสินค้าขาเข้าให้ถูกต้องตามกฎหมาย พร้อมเอกสารครบสำหรับทำบัญชีและภาษี",
      },
      {
        question: `นำเข้า LCL ${TH_MODE[mode].label} ใช้เวลานานเท่าไหร่`,
        answer: TH_MODE[mode].blurb,
      },
    ],
    cta: {
      href: "/services/import-china-lcl",
      label: "ดูบริการ LCL นำเข้ารวมตู้",
      description: "เช็คเรท CBM/กก. + เปิดใบขนสินค้ากับทีม Pacred",
    },
  },

  titleClearance: {
    serviceLabel: "เคลียร์พิธีการศุลกากร",
    titleNoun: "เคลียร์พิธีการศุลกากร สินค้าติดด่าน",
    keywords: [
      "เคลียร์พิธีการศุลกากร",
      "สินค้าติดด่าน",
      "ตัวแทนออกของ",
      "ชิปปิ้งเคลียร์ภาษี",
      "ใบขนสินค้าขาเข้า",
      "เคลียร์ของติดศุลกากร",
    ],
    intro: (m) =>
      `ผลงานจริงของ Pacred Shipping ในการเคลียร์พิธีการศุลกากรและแก้ปัญหาสินค้าติดด่าน (${m}) — ตัวแทนออกของมืออาชีพ เดินเอกสารครบ ปล่อยของไว`,
    sections: (mode, terms) => [
      {
        heading: "บริการเคลียร์พิธีการศุลกากรครอบคลุมอะไรบ้าง",
        paragraphs: [
          "Pacred รับเป็นตัวแทนออกของ (Customs Broker) ดำเนินพิธีการศุลกากรขาเข้าให้ครบวงจร — ตั้งแต่จัดเตรียมและยื่นใบขนสินค้า ประเมินพิกัดภาษี ชำระอากรขาเข้า จนถึงรับของออกจากด่าน",
          "กรณีสินค้าติดด่านหรือถูกอายัด ทีมงานช่วยประสานกับเจ้าหน้าที่ จัดเอกสารเพิ่มเติม และเร่งกระบวนการปล่อยของให้เร็วที่สุด ลดความเสี่ยงค่าปรับและค่าเก็บรักษา",
        ],
      },
      {
        heading: `เคลียร์สินค้าขนส่ง${TH_MODE[mode].label}`,
        paragraphs: [
          TH_MODE[mode].blurb,
          "ไม่ว่าสินค้าจะมาทางไหน Pacred รับเคลียร์ให้ครบทุกประเภทพิกัด พร้อมออกเอกสารถูกต้องตามกฎหมายไทย",
        ],
      },
      ...(terms.length
        ? [
            {
              heading: `เงื่อนไขราคา (${terms.join(" / ")})`,
              paragraphs: [termSentenceTh(terms)],
            },
          ]
        : []),
    ],
    faq: () => [
      {
        question: "ของติดด่านศุลกากร Pacred ช่วยได้ไหม",
        answer:
          "ได้ — ทีมตัวแทนออกของช่วยประสานเจ้าหน้าที่ จัดเอกสารเพิ่มเติม และเร่งปล่อยของ ลดความเสี่ยงค่าปรับและค่าเก็บรักษา",
      },
      {
        question: "ต้องเตรียมเอกสารอะไรบ้างในการเคลียร์",
        answer:
          "หลัก ๆ คือ Invoice, Packing List, B/L หรือ AWB และเอกสารใบอนุญาตเฉพาะสินค้า (ถ้ามี) — Pacred ตรวจสอบและแนะนำให้ครบก่อนยื่น",
      },
      {
        question: "Pacred ออกใบขนสินค้าและใบกำกับภาษีให้ด้วยไหม",
        answer:
          "ใช่ — เปิดใบขนสินค้าขาเข้าและออกเอกสารถูกต้องตามกฎหมายไทย พร้อมสำหรับทำบัญชีและขอคืนภาษี",
      },
    ],
    cta: {
      href: "/customs-clearance-shipping-suvarnabhumi",
      label: "ดูบริการเคลียร์พิธีการศุลกากร",
      description: "ปรึกษาเคลียร์ของติดด่าน + ตัวแทนออกของกับทีม Pacred",
    },
  },

  titleAirClearance: {
    serviceLabel: "เคลียร์สินค้าทางอากาศ",
    titleNoun: "เคลียร์สินค้าทางอากาศด่วน สนามบินสุวรรณภูมิ",
    keywords: [
      "เคลียร์สินค้าทางอากาศ",
      "เคลียร์ของสนามบินสุวรรณภูมิ",
      "ชิปปิ้งแอร์ด่วน",
      "เคลียร์สินค้าแอร์",
      "พิธีการศุลกากรทางอากาศ",
      "นำเข้าทางอากาศด่วน",
    ],
    intro: () =>
      "ผลงานจริงของ Pacred Shipping ในการเคลียร์สินค้าทางอากาศด่วนที่สนามบินสุวรรณภูมิ — รับของไว เอกสารครบ เหมาะกับสินค้าด่วนและสินค้ามูลค่าสูง",
    sections: (_mode, terms) => [
      {
        heading: "เคลียร์สินค้าทางอากาศด่วน เหมาะกับใคร",
        paragraphs: [
          "บริการเคลียร์พิธีการศุลกากรสำหรับสินค้าที่ขนส่งทางอากาศ (Air Freight) เข้าทางสนามบินสุวรรณภูมิ — เหมาะกับสินค้าที่ต้องการความเร็วสูงสุด สินค้ามูลค่าสูง อะไหล่ด่วน หรือสินค้าที่มีกำหนดส่งกระชั้น",
          "ขนส่งทางอากาศใช้เวลาเพียง 2–4 วัน และ Pacred เร่งกระบวนการเคลียร์ให้รับของออกจากคลังสินค้าสนามบินได้รวดเร็วที่สุด",
        ],
      },
      {
        heading: "ขั้นตอนเคลียร์ของแอร์กับ Pacred",
        paragraphs: [
          "รับข้อมูล AWB และเอกสาร → จัดเตรียมและยื่นใบขนสินค้าขาเข้า → ประเมินพิกัดภาษีและชำระอากร → รับของออกจากคลังสินค้าสุวรรณภูมิ → จัดส่งถึงมือคุณ",
          "ทีมงานเฝ้าติดตามสถานะเที่ยวบินและคิวคลังสินค้า เพื่อให้ปล่อยของได้ทันทีที่เอกสารพร้อม",
        ],
      },
      ...(terms.length
        ? [
            {
              heading: `เงื่อนไขราคา (${terms.join(" / ")})`,
              paragraphs: [termSentenceTh(terms)],
            },
          ]
        : []),
    ],
    faq: () => [
      {
        question: "เคลียร์ของแอร์ที่สุวรรณภูมิใช้เวลานานไหม",
        answer:
          "เมื่อเอกสารครบ Pacred เร่งปล่อยของได้ภายในวันเดียวในหลายกรณี — ขึ้นกับประเภทสินค้าและคิวคลังสินค้าสนามบิน",
      },
      {
        question: "สินค้าแบบไหนเหมาะกับการขนส่งทางอากาศ",
        answer:
          "สินค้าด่วน สินค้ามูลค่าสูง น้ำหนักเบา หรือสินค้าที่มีกำหนดส่งกระชั้น — คุ้มกับค่าขนส่งที่สูงกว่าทางเรือ/รถเพราะได้ความเร็ว 2–4 วัน",
      },
      {
        question: "Pacred ช่วยเรื่องเอกสารและภาษีของแอร์ด้วยไหม",
        answer:
          "ครบ — ตั้งแต่ยื่นใบขนสินค้า ประเมินพิกัดภาษี ชำระอากร จนรับของออกจากคลังสินค้าสุวรรณภูมิ",
      },
    ],
    cta: {
      href: "/customs-clearance-shipping-suvarnabhumi",
      label: "ดูบริการเคลียร์สินค้าทางอากาศ",
      description: "เคลียร์ของแอร์สุวรรณภูมิด่วน — ปรึกษาทีม Pacred",
    },
  },
};

// ─────────────────────────── EN content ───────────────────────────

const EN_MODE: Record<Mode, { label: string; blurb: string; kw: string }> = {
  sea: {
    label: "by sea",
    blurb:
      "China–Thailand sea freight suits high-volume, heavy cargo at the lowest per-unit cost, taking about 10–15 days.",
    kw: "China sea freight import",
  },
  road: {
    label: "by road",
    blurb:
      "China–Thailand road freight crosses the border faster than sea — about 5–7 days — and suits cargo needing moderate speed.",
    kw: "China road freight import",
  },
  air: {
    label: "by air",
    blurb:
      "Air freight is the fastest option at just 2–4 days, ideal for urgent, high-value, or lightweight goods.",
    kw: "China air freight express",
  },
};

const EN_TERM: Record<Term, { blurb: string }> = {
  DDP: {
    blurb:
      "DDP (Delivered Duty Paid) — the price includes freight, import duty, and customs clearance, delivered to your door with nothing more to pay at the border.",
  },
  CIF: {
    blurb:
      "CIF (Cost, Insurance, Freight) — the price covers goods, insurance, and freight to the destination port; Pacred handles the customs clearance for you.",
  },
};

const termSentenceEn = (terms: Term[]) =>
  terms.length === 0 ? "" : terms.map((t) => EN_TERM[t].blurb).join(" ");

const EN_SERVICE: Record<TitleKey, ServiceBlock> = {
  titleFcl: {
    serviceLabel: "FCL full container",
    titleNoun: "FCL import from China — full container load",
    keywords: [
      "import from China",
      "FCL full container",
      "China FCL shipping",
      "20ft container import",
      "40ft container import",
      "door to door FCL",
    ],
    intro: (m) =>
      `Real Pacred Shipping work on FCL full-container import from China ${m} — handled end to end, from booking the container in China to customs clearance and final delivery in Thailand.`,
    sections: (mode, terms) => [
      {
        heading: "What is FCL, and who is it for?",
        paragraphs: [
          "FCL (Full Container Load) means renting an entire container for your goods alone — no sharing space. It becomes cheaper than LCL once you have roughly 10–15 CBM or more.",
          "Both 20ft and 40ft/40HQ containers are available; Pacred advises which size loads most efficiently for your cargo.",
        ],
      },
      {
        heading: `Importing FCL ${EN_MODE[mode].label} with Pacred`,
        paragraphs: [
          `Book the container → load goods at the China warehouse → ship ${EN_MODE[mode].label} → clear customs and pay import duty → deliver to your warehouse.`,
          EN_MODE[mode].blurb,
        ],
      },
      ...(terms.length
        ? [{ heading: `Pricing terms (${terms.join(" / ")})`, paragraphs: [termSentenceEn(terms)] }]
        : []),
    ],
    faq: (mode) => [
      {
        question: "What volume makes FCL worthwhile?",
        answer:
          "Generally above 10–15 CBM, FCL beats LCL — Pacred runs a free comparison before you decide.",
      },
      { question: `How long does FCL ${EN_MODE[mode].label} take?`, answer: EN_MODE[mode].blurb },
    ],
    cta: {
      href: "/services/import-china-fcl",
      label: "See the FCL full-container service",
      description: "Estimate 20'/40' container cost + book with the Pacred team",
    },
  },

  titleLcl: {
    serviceLabel: "LCL consolidated",
    titleNoun: "LCL import from China — consolidated, customs declared",
    keywords: [
      "import from China",
      "LCL consolidated shipping",
      "China LCL shipping",
      "less than container load",
      "customs declaration",
      "small-volume China import",
    ],
    intro: (m) =>
      `Real Pacred Shipping work on LCL consolidated import from China ${m} — pay for the volume you actually ship, with a proper import declaration, ideal for smaller importers.`,
    sections: (mode, terms) => [
      {
        heading: "What is LCL, and who is it for?",
        paragraphs: [
          "LCL (Less than Container Load) shares container space with other importers; you pay by volume (CBM) or actual weight. It is ideal when your goods don't yet fill a container.",
          "You can start importing even with small volumes, control cost precisely, and still receive a legally correct import declaration with full documents for accounting and tax refunds.",
        ],
      },
      {
        heading: `Importing LCL ${EN_MODE[mode].label} with Pacred`,
        paragraphs: [
          `Send goods to the China warehouse → measure/weigh → consolidate and ship ${EN_MODE[mode].label} → clear customs and file the declaration → distribute to you.`,
          EN_MODE[mode].blurb,
        ],
      },
      ...(terms.length
        ? [{ heading: `Pricing terms (${terms.join(" / ")})`, paragraphs: [termSentenceEn(terms)] }]
        : []),
    ],
    faq: (mode) => [
      {
        question: "How is LCL priced?",
        answer:
          "By volume (CBM) or actual weight, whichever is greater — you can start importing without waiting for a full container.",
      },
      { question: `How long does LCL ${EN_MODE[mode].label} take?`, answer: EN_MODE[mode].blurb },
    ],
    cta: {
      href: "/services/import-china-lcl",
      label: "See the LCL consolidated service",
      description: "Check CBM/kg rates + file your declaration with Pacred",
    },
  },

  titleClearance: {
    serviceLabel: "customs clearance",
    titleNoun: "customs clearance & stuck-at-border cargo",
    keywords: [
      "customs clearance",
      "cargo stuck at border",
      "customs broker",
      "duty clearance",
      "import declaration",
      "release detained goods",
    ],
    intro: (m) =>
      `Real Pacred Shipping work on customs clearance and stuck-at-border resolution (${m}) — a professional customs broker that handles the paperwork and releases goods fast.`,
    sections: (mode, terms) => [
      {
        heading: "What does the clearance service cover?",
        paragraphs: [
          "Pacred acts as your customs broker for the full import clearance — preparing and filing the declaration, assessing the tariff code, paying import duty, and releasing the goods from the checkpoint.",
          "If goods are detained, the team liaises with officials, prepares extra documents, and expedites release to reduce penalty and storage risk.",
        ],
      },
      {
        heading: `Clearing cargo shipped ${EN_MODE[mode].label}`,
        paragraphs: [
          EN_MODE[mode].blurb,
          "Whichever mode the cargo arrives by, Pacred clears every tariff type and issues documents compliant with Thai law.",
        ],
      },
      ...(terms.length
        ? [{ heading: `Pricing terms (${terms.join(" / ")})`, paragraphs: [termSentenceEn(terms)] }]
        : []),
    ],
    faq: () => [
      {
        question: "Can Pacred help if my goods are detained at customs?",
        answer:
          "Yes — the broker team liaises with officials, prepares extra documents, and expedites release to cut penalty and storage costs.",
      },
      {
        question: "What documents are needed for clearance?",
        answer:
          "Mainly the Invoice, Packing List, B/L or AWB, and any product-specific permits — Pacred reviews and completes them before filing.",
      },
    ],
    cta: {
      href: "/customs-clearance-shipping-suvarnabhumi",
      label: "See the customs clearance service",
      description: "Consult on detained cargo + broker service with Pacred",
    },
  },

  titleAirClearance: {
    serviceLabel: "air clearance",
    titleNoun: "express air clearance at Suvarnabhumi",
    keywords: [
      "air freight clearance",
      "Suvarnabhumi customs clearance",
      "express air shipping",
      "air cargo clearance",
      "air customs declaration",
      "express air import",
    ],
    intro: () =>
      "Real Pacred Shipping work on express air-freight clearance at Suvarnabhumi Airport — fast release with complete paperwork, ideal for urgent and high-value goods.",
    sections: (_mode, terms) => [
      {
        heading: "Who is express air clearance for?",
        paragraphs: [
          "Customs clearance for air-freight cargo arriving via Suvarnabhumi Airport — ideal for goods needing maximum speed: high-value items, urgent spare parts, or tight deadlines.",
          "Air freight takes only 2–4 days, and Pacred expedites clearance so goods leave the airport cargo terminal as quickly as possible.",
        ],
      },
      {
        heading: "The air clearance process with Pacred",
        paragraphs: [
          "Receive AWB and documents → prepare and file the import declaration → assess tariff and pay duty → release from the Suvarnabhumi cargo terminal → deliver to you.",
          "The team tracks flight status and terminal queues so goods release the moment paperwork is ready.",
        ],
      },
      ...(terms.length
        ? [{ heading: `Pricing terms (${terms.join(" / ")})`, paragraphs: [termSentenceEn(terms)] }]
        : []),
    ],
    faq: () => [
      {
        question: "How fast is air clearance at Suvarnabhumi?",
        answer:
          "With complete documents, Pacred can often release goods the same day — depending on the product type and terminal queue.",
      },
      {
        question: "What goods suit air freight?",
        answer:
          "Urgent, high-value, or lightweight goods, or anything on a tight deadline — the 2–4 day speed justifies the higher freight cost.",
      },
    ],
    cta: {
      href: "/customs-clearance-shipping-suvarnabhumi",
      label: "See the air clearance service",
      description: "Express Suvarnabhumi air clearance — consult the Pacred team",
    },
  },
};

export function getReviewContent(review: Review, locale: SiteLocale): ReviewContent {
  const isTh = locale !== "en";
  const mode = modeOf(review.tagKeys);
  const terms = termsOf(review.tagKeys);
  const code = codeOf(review.id);

  const SERVICE = isTh ? TH_SERVICE : EN_SERVICE;
  const MODE = isTh ? TH_MODE : EN_MODE;
  const block = SERVICE[review.titleKey];
  const modeLabel = MODE[mode].label;

  const termSuffix = terms.length ? ` ${terms.join(" / ")}` : "";
  const h1 = isTh
    ? `ผลงาน Pacred — ${block.titleNoun} ${modeLabel}${termSuffix}`
    : `Pacred case — ${block.titleNoun} ${modeLabel}${termSuffix}`;
  const metaTitle = isTh
    ? `${block.titleNoun} ${modeLabel}${termSuffix} — รีวิว ${code} | Pacred`
    : `${block.titleNoun} ${modeLabel}${termSuffix} — review ${code} | Pacred`;
  const metaDescription = block.intro(modeLabel);

  const modeKw = MODE[mode].kw;
  const termKw = isTh ? terms.map((t) => TH_TERM[t].kw) : [];
  const keywords = Array.from(
    new Set([...block.keywords, modeKw, ...termKw, "Pacred Shipping"]),
  );

  return {
    code,
    serviceLabel: block.serviceLabel,
    modeLabel,
    termLabels: terms,
    h1,
    metaTitle,
    metaDescription,
    keywords,
    intro: block.intro(modeLabel),
    sections: block.sections(mode, terms),
    faq: block.faq(mode, terms),
    cta: block.cta,
  };
}
