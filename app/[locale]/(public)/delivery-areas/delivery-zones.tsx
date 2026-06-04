"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  Truck,
  PackageCheck,
  MapPin,
  Home,
  Search,
  Info,
  Building2,
  X,
} from "lucide-react";

/**
 * `/delivery-areas` content — the Pacred rebuild of the legacy PCS Cargo
 * "พื้นที่จัดส่ง PCS เหมาๆ" WordPress page (โปรส่งเหมาๆ · จัดส่งทั่ว กทม–ปริมณฑล).
 *
 * Faithful in CONTENT (the same 5 zone groups + districts + postal codes the
 * legacy page listed), Pacred in FORM: our Tailwind design system, brand red,
 * Lucide icons, mobile-first — plus a live เขต/อำเภอ/รหัสไปรษณีย์ filter, a
 * Pacred polish the static legacy tables never had (AGENTS.md §0a — "เราแค่
 * copy ระบบการทำงาน ส่วนหน้าตาเราเอามาปรับให้สวยเอง").
 *
 * Rate is Pacred's 100฿ flat (เหมา · ไม่จำกัดน้ำหนัก), NOT the legacy PCS 50฿
 * — matches the home promo + the page metadata.
 */

type Area = { n: string; zip: string };
type Zone = {
  id: number;
  province: string;
  /** unit prefix shown before each area name (เขต for Bangkok, อ. for provinces) */
  unit: string;
  areas: Area[];
};

// Legacy `freearea-pcs` content, transcribed 1:1 (50 Bangkok districts + 4
// surrounding provinces) — rebranded to Pacred.
const ZONES: Zone[] = [
  {
    id: 1,
    province: "กรุงเทพมหานคร",
    unit: "เขต",
    areas: [
      { n: "คลองสาน", zip: "10600" }, { n: "คลองสามวา", zip: "10510" },
      { n: "คลองเตย", zip: "10110" }, { n: "คันนายาว", zip: "10230" },
      { n: "จตุจักร", zip: "10900" }, { n: "จอมทอง", zip: "10150" },
      { n: "ดอนเมือง", zip: "10210" }, { n: "ดินแดง", zip: "10400" },
      { n: "ดุสิต", zip: "10300" }, { n: "ตลิ่งชัน", zip: "10170" },
      { n: "ทวีวัฒนา", zip: "10170" }, { n: "ทุ่งครุ", zip: "10140" },
      { n: "ธนบุรี", zip: "10600" }, { n: "บางกอกน้อย", zip: "10700" },
      { n: "บางกอกใหญ่", zip: "10600" }, { n: "บางกะปิ", zip: "10240" },
      { n: "บางขุนเทียน", zip: "10150" }, { n: "บางคอแหลม", zip: "10120" },
      { n: "บางซื่อ", zip: "10800" }, { n: "บางนา", zip: "10260" },
      { n: "บางบอน", zip: "10150" }, { n: "บางพลัด", zip: "10700" },
      { n: "บางรัก", zip: "10500" }, { n: "บางเขน", zip: "10220" },
      { n: "บางแค", zip: "10160" }, { n: "บึงกุ่ม", zip: "10240" },
      { n: "ปทุมวัน", zip: "10330" }, { n: "ประเวศ", zip: "10250" },
      { n: "ป้อมปราบศัตรูพ่าย", zip: "10100" }, { n: "พญาไท", zip: "10400" },
      { n: "พระนคร", zip: "10200" }, { n: "พระโขนง", zip: "10260" },
      { n: "ภาษีเจริญ", zip: "10160" }, { n: "มีนบุรี", zip: "10510" },
      { n: "ยานนาวา", zip: "10120" }, { n: "ราชเทวี", zip: "10400" },
      { n: "ราษฎร์บูรณะ", zip: "10140" }, { n: "ลาดกระบัง", zip: "10520" },
      { n: "ลาดพร้าว", zip: "10230" }, { n: "วังทองหลาง", zip: "10310" },
      { n: "วัฒนา", zip: "10110" }, { n: "สวนหลวง", zip: "10250" },
      { n: "สะพานสูง", zip: "10240" }, { n: "สัมพันธวงศ์", zip: "10100" },
      { n: "สาทร", zip: "10120" }, { n: "สายไหม", zip: "10220" },
      { n: "หนองจอก", zip: "10530" }, { n: "หนองแขม", zip: "10160" },
      { n: "หลักสี่", zip: "10210" }, { n: "ห้วยขวาง", zip: "10310" },
    ],
  },
  {
    id: 2,
    province: "นนทบุรี",
    unit: "อ.",
    areas: [
      { n: "บางกรวย", zip: "11130" }, { n: "บางบัวทอง", zip: "11110" },
      { n: "บางใหญ่", zip: "11140" }, { n: "ปากเกร็ด", zip: "11120" },
      { n: "เมืองนนทบุรี", zip: "11000" }, { n: "ไทรน้อย", zip: "11150" },
    ],
  },
  {
    id: 3,
    province: "สมุทรปราการ",
    unit: "อ.",
    areas: [
      { n: "บางบ่อ", zip: "10560" }, { n: "บางพลี", zip: "10540" },
      { n: "บางเสาธง", zip: "10540" }, { n: "พระประแดง", zip: "10130" },
      { n: "พระสมุทรเจดีย์", zip: "10290" }, { n: "เมืองสมุทรปราการ", zip: "10270" },
    ],
  },
  {
    id: 4,
    province: "นครปฐม",
    unit: "อ.",
    areas: [
      { n: "พุทธมณฑล", zip: "73170" }, { n: "สามพราน", zip: "73110" },
    ],
  },
  {
    id: 5,
    province: "สมุทรสาคร",
    unit: "อ.",
    areas: [
      { n: "กระทุ่มแบน", zip: "74110" }, { n: "เมืองสมุทรสาคร", zip: "74000" },
    ],
  },
];

const TOTAL_AREAS = ZONES.reduce((s, z) => s + z.areas.length, 0);

export function DeliveryZones({ locale = "th" }: { locale?: "th" | "en" }) {
  const en = locale === "en";
  const [q, setQ] = useState("");
  const query = q.trim();

  const filtered = useMemo(() => {
    if (!query) return ZONES;
    const needle = query.toLowerCase();
    return ZONES.map((z) => ({
      ...z,
      areas: z.areas.filter(
        (a) =>
          a.n.toLowerCase().includes(needle) ||
          a.zip.includes(query) ||
          z.province.toLowerCase().includes(needle),
      ),
    })).filter((z) => z.areas.length > 0);
  }, [query]);

  const matchCount = filtered.reduce((s, z) => s + z.areas.length, 0);

  const features = [
    { Icon: Truck, label: en ? "Flat 100฿" : "เหมา 100 บาท", sub: en ? "metro rate" : "กทม–ปริมณฑล" },
    { Icon: PackageCheck, label: en ? "Any weight" : "ไม่จำกัดน้ำหนัก", sub: en ? "no weight cap" : "หนักแค่ไหนก็ส่ง" },
    { Icon: MapPin, label: `${TOTAL_AREAS} ${en ? "areas" : "พื้นที่"}`, sub: en ? "BKK + 4 provinces" : "กทม + 4 จังหวัด" },
    { Icon: Home, label: en ? "To your door" : "ส่งถึงบ้าน", sub: en ? "fast delivery" : "รวดเร็ว ทันใจ" },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Highlight banner — replaces the legacy pcs50 promo image */}
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-primary-600 to-primary-800 p-6 md:p-9 text-white shadow-[0_12px_34px_rgba(179,0,0,0.28)]">
        <div className="relative z-10 max-w-[640px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-bold backdrop-blur-sm">
            <Truck className="h-4 w-4" />
            {en ? "FLAT-RATE DELIVERY" : "โปรส่งเหมาๆ"}
          </span>
          <h2 className="mt-3 text-[24px] md:text-[34px] font-black leading-[1.15] tracking-tight">
            {en ? (
              <>Flat <span className="text-yellow-300">100 baht</span>, any weight</>
            ) : (
              <>ส่งเหมาๆ <span className="text-yellow-300">100 บาท</span> ไม่จำกัดCBM</>
            )}
          </h2>
          <p className="mt-2 text-[13.5px] md:text-[15.5px] leading-[1.6] text-white/90">
            {en
              ? "Pacred delivers across Bangkok and the surrounding provinces — straight to the customer's door, fast and on time."
              : "Pacred จัดส่งทั่วกรุงเทพฯ และปริมณฑล — ของถึงมือลูกค้า รวดเร็ว ไว ไม่มีคำว่าทำไม่ได้"}
          </p>
        </div>
        <Truck
          className="pointer-events-none absolute -bottom-6 -right-5 h-36 w-36 text-white/10 md:h-44 md:w-44"
          strokeWidth={1.1}
        />
      </div>

      {/* Feature chips */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {features.map(({ Icon, label, sub }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-border bg-white dark:bg-surface p-3 md:p-4 shadow-[0_2px_10px_rgba(0,0,0,0.04)]"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] md:text-[15px] font-bold leading-tight text-foreground">{label}</div>
              <div className="text-[11.5px] text-muted">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Section intro + filter */}
      <div>
        <h2 className="text-[18px] md:text-[22px] font-black tracking-tight text-foreground">
          {en
            ? "Pacred delivery coverage — Bangkok & surrounding provinces"
            : "พื้นที่จัดส่ง Pacred ทั่วกรุงเทพฯ และปริมณฑล"}
        </h2>
        <p className="mt-1 text-[13px] md:text-[14px] text-muted">
          {en
            ? "Find your district or postal code below."
            : "ค้นหาเขต / อำเภอ หรือรหัสไปรษณีย์ของคุณได้เลย"}
        </p>

        <div className="relative mt-4 max-w-[460px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            inputMode="search"
            placeholder={en ? "Search district or postal code…" : "ค้นหาเขต / อำเภอ / รหัสไปรษณีย์…"}
            className="h-12 w-full rounded-full border border-border bg-white dark:bg-surface pl-12 pr-11 text-[16px] text-foreground placeholder:text-muted outline-none transition focus:border-primary-400 focus:shadow-[0_0_0_3px_rgba(179,0,0,0.08)]"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={en ? "Clear" : "ล้าง"}
              className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {query && (
          <p className="mt-2 text-[12.5px] text-muted">
            {en ? `Found ${matchCount} area(s)` : `พบ ${matchCount} พื้นที่`}
          </p>
        )}
      </div>

      {/* Zone cards */}
      {filtered.length > 0 ? (
        <div className="space-y-4 md:space-y-5">
          {filtered.map((z) => (
            <section
              key={z.id}
              className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface shadow-[0_3px_14px_rgba(0,0,0,0.04)]"
            >
              <header className="flex items-center gap-3 border-b border-border bg-surface-alt/40 px-4 py-3 md:px-5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-[15px] font-black text-white shadow-sm">
                  {z.id}
                </span>
                <div className="flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h3 className="flex items-center gap-1.5 text-[15px] md:text-[17px] font-bold text-foreground">
                    <Building2 className="h-4 w-4 text-primary-600" />
                    {z.province}
                  </h3>
                  <span className="text-[12px] font-medium text-muted">
                    {z.areas.length} {z.id === 1 ? (en ? "districts" : "เขต") : (en ? "districts" : "อำเภอ")}
                  </span>
                </div>
              </header>

              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 md:gap-2.5 md:p-4">
                {z.areas.map((a) => (
                  <div
                    key={`${z.id}-${a.n}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface-alt/30 px-2.5 py-2 md:px-3"
                  >
                    <span className="truncate text-[13px] md:text-[13.5px] font-medium text-foreground">
                      {z.unit}{a.n}
                    </span>
                    <span className="shrink-0 rounded-md bg-white dark:bg-background px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
                      {a.zip}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface-alt/30 p-8 text-center">
          <MapPin className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-2 text-[14px] font-semibold text-foreground">
            {en ? "No area matched your search" : "ไม่พบพื้นที่ที่ค้นหา"}
          </p>
          <p className="mt-1 text-[12.5px] text-muted">
            {en
              ? "Other areas are charged by distance — contact our team."
              : "พื้นที่อื่นๆ คิดค่าจัดส่งตามระยะทาง — สอบถามทีมงานได้เลย"}
          </p>
        </div>
      )}

      {/* Out-of-zone note — faint, borderless thin text */}
      <p className="flex items-start gap-2 text-[12px] md:text-[12.5px] leading-[1.6] text-muted/80">
        <Info className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted/50" />
        <span>
          <span className="font-medium text-muted">{en ? "Areas outside the list" : "พื้นที่นอกเหนือจากรายการนี้"}</span>{" "}
          {en
            ? "are delivered nationwide and charged by distance/route. "
            : "Pacred จัดส่งทั่วประเทศ คิดค่าจัดส่งตามระยะทาง/เส้นทาง "}
          <Link href="/contact" className="text-primary-600/80 underline underline-offset-2 hover:text-primary-700">
            {en ? "Contact the Pacred team" : "สอบถามทีมงาน Pacred"}
          </Link>{" "}
          {en ? "for a quote." : "เพื่อเช็กค่าส่งได้เลย"}
        </span>
      </p>
    </div>
  );
}
