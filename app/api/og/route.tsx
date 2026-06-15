import { renderOgImage, type OgImageOptions } from "@/lib/og/render-og-image";

// Node runtime — renderOgImage reads the Sarabun TTFs from /public via node:fs.
export const runtime = "nodejs";

/**
 * Dynamic branded OG card endpoint (`/api/og?key=<key>`).
 *
 * Lives under `/api` on purpose: the next-intl proxy (proxy.ts matcher
 * `/((?!api|_next|_vercel|.*\\..*).*)`) processes extension-less metadata
 * routes under `[locale]` and mangles the Next file-convention
 * `opengraph-image.tsx` (it 404s + emits no `og:image` meta on `[locale]`
 * pages). An `/api` route is excluded from that matcher, so it serves
 * reliably. Pages reference it via explicit `openGraph.images`
 * (see `components/seo/site.ts` `ogImageUrl` + `components/seo/page-meta.ts`).
 *
 * Each key renders the same branded template with service-specific
 * keyword-rich headline copy — every service landing gets its OWN social
 * card instead of the generic site default.
 */
const CARDS: Record<string, OgImageOptions> = {
  default: {
    line1: "นำเข้า ส่งออก ชิปปิ้ง",
    line2: "เคลียร์ศุลกากรครบวงจร",
    chips: ["FCL · LCL", "รถ · เรือ · อากาศ"],
  },
  home: {
    line1: "นำเข้า ส่งออก ชิปปิ้ง",
    line2: "เคลียร์ศุลกากรครบวงจร",
    chips: ["FCL · LCL", "รถ · เรือ · อากาศ"],
  },
  "import-china": {
    line1: "นำเข้าสินค้าจากจีน",
    line2: "FCL · LCL ครบวงจร",
    chips: ["Door to Door", "ทุก Term ทุก Port"],
  },
  "import-china-fcl": {
    line1: "นำเข้าจีนเหมาตู้ FCL",
    line2: "20ft · 40ft · 40HQ",
    chips: ["เหมาทั้งตู้", "ราคาถูก ส่งถึงโกดัง"],
  },
  "import-china-lcl": {
    line1: "นำเข้าจีนแบบ LCL",
    line2: "ไม่เต็มตู้ ส่งถึงบ้าน",
    chips: ["คิดตาม คิว / กก.", "รวมส่งทุกสัปดาห์"],
  },
  "china-shopping": {
    line1: "ฝากสั่งซื้อสินค้าจีน",
    line2: "1688 · Taobao · Tmall",
    chips: ["ล่ามจีนปิดดีล", "ฝากโอนหยวน"],
  },
  "yuan-transfer": {
    line1: "ฝากโอนเงินหยวน",
    line2: "ชำระค่าสินค้าจีน",
    chips: ["เรทดี โปร่งใส", "Alipay · ธนาคารจีน"],
  },
  "export-worldwide": {
    line1: "ส่งออกสินค้าทั่วโลก",
    line2: "Air & Sea Freight",
    chips: ["ครบเอกสารส่งออก", "ทุกปลายทาง"],
  },
  "customs-clearance": {
    line1: "เคลียร์พิธีศุลกากร",
    line2: "นำเข้า · ส่งออก",
    chips: ["ตัวแทนออกของ", "รถ · เรือ · อากาศ"],
  },
  "customs-suvarnabhumi": {
    line1: "เคลียร์ศุลกากร",
    line2: "สินค้าติดด่าน",
    chips: ["ออกของไว", "รถ · เรือ · อากาศ"],
  },
  services: {
    line1: "บริการนำเข้า-ส่งออก",
    line2: "ครบวงจรที่เดียว",
    chips: ["ชิปปิ้ง · ศุลกากร", "ฝากสั่ง · ฝากโอน"],
  },
  about: {
    line1: "เกี่ยวกับ Pacred",
    line2: "ชิปปิ้งครบวงจร",
    chips: ["นำเข้า · ส่งออก", "ศุลกากร · ขนส่ง"],
  },
};

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "default";
  return renderOgImage(CARDS[key] ?? CARDS.default);
}
