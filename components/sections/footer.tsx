import Image from "next/image";
import { Link } from "@/i18n/navigation";

const COL_IMPORT = [
  { label: "นำเข้าสินค้าจากจีน LCL", href: "#" },
  { label: "นำเข้าสินค้าจากจีน FCL", href: "#" },
  { label: "ขนส่งทางรถ DDP จีน-ไทย", href: "#" },
  { label: "ขนส่งทางอากาศ Air Freight", href: "#" },
  { label: "นำเข้าสินค้าจากญี่ปุ่น", href: "#" },
  { label: "นำเข้าสินค้าจากอเมริกา", href: "#" },
  { label: "นำเข้าสินค้าจากเกาหลี", href: "#" },
  { label: "ส่งออกสินค้าไปจีน LCL", href: "#" },
  { label: "ส่งออกสินค้าไปจีน FCL", href: "#" },
  { label: "Freight Forwarder", href: "#" },
  { label: "Door to Door นำเข้าจีน", href: "#" },
];

const COL_CUSTOMS = [
  { label: "พิธีการศุลกากรขาเข้า", href: "#" },
  { label: "พิธีการศุลกากรขาออก", href: "#" },
  { label: "เคลียร์สินค้าติดด่าน", href: "#" },
  { label: "เคลียร์ใบอนุญาติ อย.", href: "#" },
  { label: "เคลียร์ มอก. / สมอ.", href: "#" },
  { label: "เคลียร์สินค้าเกษตร-ประมง", href: "#" },
  { label: "HS Code / ภาษีนำเข้า", href: "#" },
  { label: "นำเข้าในนามชิปปิ้ง", href: "#" },
  { label: "Customs Clearance", href: "#" },
  { label: "Import Clearance", href: "#" },
];

const COL_ORDER = [
  { label: "ฝากสั่งซื้อสินค้าจาก 1688", href: "#" },
  { label: "ฝากสั่งซื้อสินค้าจาก Taobao", href: "#" },
  { label: "ฝากสั่งซื้อสินค้าจาก Alibaba", href: "#" },
  { label: "ฝากสั่งซื้อสินค้าจาก Tmall", href: "#" },
  { label: "ฝากโอนชำระค่าสินค้า CNY", href: "#" },
  { label: "ฝากโอนชำระค่าสินค้า JPY", href: "#" },
  { label: "ฝากโอนชำระค่าสินค้า USD", href: "#" },
  { label: "ล่ามภาษาจีน เจรจาโรงงาน", href: "#" },
  { label: "QC สินค้าที่โกดัง", href: "#" },
  { label: "ขนส่งภายในประเทศ 50 บาท", href: "#" },
];

const COL_KNOWLEDGE = [
  { label: "นำเข้าสินค้าจากจีน LCL", href: "#" },
  { label: "นำเข้าสินค้าจากจีน FCL", href: "#" },
  { label: "Freight Forwarder คืออะไร", href: "#" },
  { label: "Shipping จีนคืออะไร", href: "#" },
  { label: "พิธีการศุลกากรขาเข้า", href: "#" },
  { label: "Import Clearance", href: "#" },
  { label: "Customs Clearance", href: "#" },
  { label: "HS Code / ภาษีนำเข้า", href: "#" },
  { label: "ตรวจเอกสารนำเข้า", href: "#" },
  { label: "นำเข้าสินค้าจากจีนทางเรือ", href: "#" },
];

function LinkCol({ heading, links }: { heading: string; links: { label: string; href: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-white">{heading}</h3>
      <nav className="flex flex-col gap-1.5">
        {links.map((l) => (
          <a key={l.label} href={l.href} className="text-xs text-white/60 hover:text-white transition-colors leading-relaxed">
            {l.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

export function Footer() {
  return (
    <footer id="contact" className="bg-[#1a0000]">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">

        {/* Main grid */}
        <div className="grid grid-cols-6 gap-8 py-12">

          {/* Col 1 — Brand */}
          <div className="col-span-1 flex flex-col gap-4">
            <Link href="/">
              <Image
                src="/images/pacred-logo-white.png"
                alt="Pacred"
                width={80}
                height={32}
                className="object-contain"
              />
            </Link>
            <p className="text-xs text-white/60 leading-relaxed">
              ผู้เชี่ยวชาญด้านนำเข้า-ส่งออก เคลียร์พิธีการกรมศุลกากรครบวงจร มากกว่า 14 ปี
            </p>
            {/* Social */}
            <div className="flex gap-2">
              {[
                { label: "LINE", href: "https://lin.ee/Yg3fU0I", color: "#06C755" },
                { label: "FB", href: "#", color: "#1877F2" },
                { label: "YT", href: "#", color: "#FF0000" },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white transition-opacity hover:opacity-80"
                  style={{ backgroundColor: s.color }}
                >
                  {s.label.charAt(0)}
                </a>
              ))}
            </div>
            {/* Contact */}
            <div className="flex flex-col gap-1.5 text-xs text-white/60">
              <p>📞 066-131-0253</p>
              <p>✉️ contact@pacred.co</p>
              <p>📍 เพชรเกษม 77 กรุงเทพฯ</p>
            </div>
          </div>

          {/* Col 2 — นำเข้า-ส่งออก */}
          <div className="col-span-1">
            <LinkCol heading="นำเข้า-ส่งออก" links={COL_IMPORT} />
          </div>

          {/* Col 3 — เคลียร์ศุลกากร */}
          <div className="col-span-1">
            <LinkCol heading="เคลียร์ศุลกากร" links={COL_CUSTOMS} />
          </div>

          {/* Col 4 — ฝากสั่งซื้อ / โอนเงิน */}
          <div className="col-span-1">
            <LinkCol heading="ฝากสั่งซื้อ / โอนเงิน" links={COL_ORDER} />
          </div>

          {/* Col 5 — บทความ */}
          <div className="col-span-1">
            <LinkCol heading="บทความและความรู้" links={COL_KNOWLEDGE} />
          </div>

          {/* Col 6 — บริษัท */}
          <div className="col-span-1">
            <LinkCol
              heading="บริษัท"
              links={[
                { label: "เกี่ยวกับ Pacred", href: "#" },
                { label: "คำถามที่พบบ่อย", href: "#" },
                { label: "โปรโมชัน", href: "#" },
                { label: "วันหยุด PCS 2026", href: "#" },
                { label: "ร่วมงานกับเรา", href: "#" },
                { label: "นโยบายความเป็นส่วนตัว", href: "#" },
                { label: "เงื่อนไขการใช้บริการ", href: "#" },
                { label: "ติดต่อเรา", href: "#" },
              ]}
            />
          </div>

        </div>

        {/* Partner logos row */}
        <div className="border-t border-white/10 py-6">
          <div className="flex flex-wrap items-center justify-center gap-4 opacity-50">
            {["1688", "alibaba", "taobao", "tmall", "dhlpartner", "fedexpartner", "upspartner", "maerskpartner", "coscopartner"].map((name) => (
              <img
                key={name}
                src={`/images/partners/${name}.png`}
                alt={name}
                className="h-6 w-auto object-contain grayscale invert"
              />
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 py-5 text-xs text-white/40">
          <span>© 2026 Pacred CO., LTD. สงวนลิขสิทธิ์ตามกฎหมาย</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white transition-colors">นโยบายความเป็นส่วนตัว</a>
            <a href="#" className="hover:text-white transition-colors">เงื่อนไขการใช้บริการ</a>
          </div>
        </div>

      </div>
    </footer>
  );
}
