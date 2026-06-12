import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { Truck, Calculator, MapPin, Users, Star, Unlock, ExternalLink } from "lucide-react";
import { calPriceFlash, FLASH_REMOTE_AREA_ZIPS, FLASH_TOURIST_AREA_ZIPS } from "@/lib/tools/flash-price";
import {
  resolveShipByCarriers,
  lookupProvinceByZip,
  ALL_SHIPBY_CARRIERS,
} from "@/lib/tools/thai-shipby-rules";

/**
 * /admin/tools/thai-shipping — ตรวจสอบขนส่งไทย (hub of 6 read-only checkers).
 *
 * Faithful port of six legacy PCS admin checkers, consolidated into ONE hub
 * page with internal tabs (legacy each had its own .php):
 *   1. flash          → check-price-flash.php       (คำนวณค่าขนส่ง Flash)
 *   2. shipby         → check-shipby.php            (เช็คบริษัทขนส่งตามจังหวัด)
 *   3. paymethod      → check-payMethod.php         (ขนส่งไทยต้น-ปลายทาง · static guide)
 *   4. maomao-free    → check-customer-maomao-free.php   (ลูกค้าส่งเหมาๆ ฟรี · tb_address_maomao_free)
 *   5. maomao-vip     → check-customer-maomao-vip.php    (เหมาๆ นอกเขตได้ · JSON ref → static)
 *   6. shipby-freedom → check-customer-shipby-freedom.php (เลือกขนส่งอิสระ · JSON ref → static)
 *
 * READ-ONLY — no writes. RBAC: super · ops · accounting · sales.
 * Per AGENTS.md §11: requireAdmin reads cookies → force-dynamic.
 */

export const dynamic = "force-dynamic";

type Tab = "flash" | "shipby" | "paymethod" | "maomao-free" | "maomao-vip" | "shipby-freedom";

const TABS: { key: Tab; label: string; icon: typeof Truck }[] = [
  { key: "flash", label: "คำนวณค่าส่ง Flash", icon: Calculator },
  { key: "shipby", label: "เช็คบริษัทขนส่ง", icon: Truck },
  { key: "paymethod", label: "ต้น-ปลายทาง", icon: MapPin },
  { key: "maomao-free", label: "เหมาๆ ฟรี", icon: Users },
  { key: "maomao-vip", label: "เหมาๆ นอกเขต", icon: Star },
  { key: "shipby-freedom", label: "เลือกขนส่งอิสระ", icon: Unlock },
];

function isTab(v: string | undefined): v is Tab {
  return (
    v === "flash" ||
    v === "shipby" ||
    v === "paymethod" ||
    v === "maomao-free" ||
    v === "maomao-vip" ||
    v === "shipby-freedom"
  );
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type MaomaoFreeRow = {
  id: number;
  datetime: string | null;
  addresssubdistrict: string;
  addressdistrict: string;
  addressprovince: string;
  addresszipcode: string;
  userid: string;
  adminid: string;
};

export default async function ThaiShippingToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales"]);

  const sp = await searchParams;
  const tab: Tab = isTab(sp.tab) ? sp.tab : "flash";

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-5xl">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · เครื่องมือ</p>
        <h1 className="mt-1 text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Truck className="w-6 h-6 shrink-0" /> ตรวจสอบขนส่งไทย
        </h1>
        <p className="mt-1 text-sm text-muted">
          เครื่องมือเช็กค่าส่ง / บริษัทขนส่ง / เงื่อนไขลูกค้าพิเศษ ฝั่งขนส่งไทย (อ่านอย่างเดียว)
        </p>
      </header>

      {/* Tab strip — links carry the active tab via ?tab= */}
      <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => {
          const active = t.key === tab;
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={`/admin/tools/thai-shipping?tab=${t.key}`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-primary-600 text-white"
                  : "bg-surface-alt/40 text-foreground hover:bg-surface-alt"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === "flash" && <FlashCalcTab sp={sp} />}
      {tab === "shipby" && (await renderShipByTab(sp))}
      {tab === "paymethod" && <PayMethodTab />}
      {tab === "maomao-free" && (await renderMaomaoFreeTab())}
      {tab === "maomao-vip" && <MaomaoVipTab />}
      {tab === "shipby-freedom" && <ShipByFreedomTab />}
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 1. Flash price calculator (check-price-flash.php)
 * ──────────────────────────────────────────────────────────────────────── */
function FlashCalcTab({ sp }: { sp: Record<string, string | undefined> }) {
  // Legacy origin is hardcoded 10160 (the PCS warehouse zip). amount=1, type=1.
  const zipCodeOrigin = "10160";
  const zipCodeEndway = (sp.zipCodeEndway ?? "").trim();
  const kg = num(sp.kg);
  const length = num(sp.length);
  const width = num(sp.width);
  const height = num(sp.height);

  const ready =
    /^\d{5}$/.test(zipCodeEndway) &&
    kg !== undefined &&
    length !== undefined &&
    width !== undefined &&
    height !== undefined;

  const result = ready
    ? calPriceFlash(1, zipCodeOrigin, zipCodeEndway, width!, length!, height!, kg!, 0, 1)
    : null;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-bold text-sm">คำนวณค่าขนส่ง Flash</h2>
          <a
            href="https://www.flashexpress.co.th/fle/check-price"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> เช็กราคาจากเว็บ Flash
          </a>
        </div>
        <form method="GET" action="/admin/tools/thai-shipping" className="space-y-3">
          <input type="hidden" name="tab" value="flash" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-muted text-xs">รหัสไปรษณีย์ต้นทาง</span>
              <input
                value={zipCodeOrigin}
                disabled
                className="mt-1 w-full rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-base text-muted"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted text-xs">รหัสไปรษณีย์ปลายทาง *</span>
              <input
                name="zipCodeEndway"
                inputMode="numeric"
                maxLength={5}
                defaultValue={zipCodeEndway}
                placeholder="เช่น 50000"
                className="mt-1 w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-primary-500/40"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block text-sm">
              <span className="text-muted text-xs">น้ำหนัก (kg) *</span>
              <input
                name="kg"
                type="number"
                step="0.01"
                defaultValue={sp.kg}
                className="mt-1 w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-base text-right focus:outline-none focus:ring-1 focus:ring-primary-500/40"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted text-xs">ยาว (cm) *</span>
              <input
                name="length"
                type="number"
                step="0.01"
                defaultValue={sp.length}
                className="mt-1 w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-base text-right focus:outline-none focus:ring-1 focus:ring-primary-500/40"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted text-xs">กว้าง (cm) *</span>
              <input
                name="width"
                type="number"
                step="0.01"
                defaultValue={sp.width}
                className="mt-1 w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-base text-right focus:outline-none focus:ring-1 focus:ring-primary-500/40"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted text-xs">สูง (cm) *</span>
              <input
                name="height"
                type="number"
                step="0.01"
                defaultValue={sp.height}
                className="mt-1 w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-base text-right focus:outline-none focus:ring-1 focus:ring-primary-500/40"
              />
            </label>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-primary-600 text-white px-6 py-2.5 text-sm font-medium hover:bg-primary-700 inline-flex items-center gap-1.5"
          >
            <Calculator className="w-4 h-4" /> คำนวณราคา
          </button>
        </form>
      </div>

      {result && (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-2">
          <h3 className="font-bold text-sm">ผลลัพธ์การคำนวณ จาก PCS System</h3>
          <p className="text-xs text-muted">ส่งแบบมาตรฐาน · ปลายทาง {result.nameEndway}</p>
          {result.error ? (
            <p className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 text-sm">
              {result.error.trim()} — Flash ไม่รับขนส่ง (ราคา 0)
            </p>
          ) : (
            <p className="text-lg font-bold">
              ราคา (THB){" "}
              <span className="text-rose-600">{fmt(result.price)}</span> บาท
            </p>
          )}

          {result.remoteArea === 1 && (
            <div className="rounded-lg bg-rose-600 text-white px-3 py-2 text-sm">
              <div>พื้นที่ห่างไกล +50 บาท</div>
              <div className="font-bold">รวมราคา : {fmt(result.price + 50)} บาท</div>
            </div>
          )}
          {result.touristArea === 1 && (
            <div className="rounded-lg bg-rose-600 text-white px-3 py-2 text-sm">
              <div>พื้นที่ท่องเที่ยวพิเศษ +50 บาท</div>
              <div className="font-bold">รวมราคา : {fmt(result.price + 50)} บาท</div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted pt-2 border-t border-border">
            <span>type: <b className="text-foreground">{result.type}</b></span>
            <span>ราคาตามขนาด: <b className="text-foreground">{fmt(result.priceSize)}</b></span>
            <span>ราคาตามน้ำหนัก: <b className="text-foreground">{fmt(result.priceKg)}</b></span>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface-alt/30 p-4 text-xs text-muted space-y-2">
        <p className="text-amber-700">
          หมายเหตุ : ราคาจะมีเรื่องของ พื้นที่ห่างไกล / พื้นที่ท่องเที่ยวพิเศษ เข้ามาเกี่ยวข้อง
          มีค่าใช้จ่ายเพิ่มขั้นต่ำ 50 บาท
        </p>
        <details>
          <summary className="cursor-pointer text-foreground font-medium">
            พื้นที่ห่างไกล ({FLASH_REMOTE_AREA_ZIPS.length} รหัส)
          </summary>
          <p className="mt-1 font-mono break-words leading-relaxed">
            {FLASH_REMOTE_AREA_ZIPS.join(", ")}
          </p>
        </details>
        <details>
          <summary className="cursor-pointer text-foreground font-medium">
            พื้นที่ท่องเที่ยวพิเศษ ({FLASH_TOURIST_AREA_ZIPS.length} รหัส)
          </summary>
          <p className="mt-1 font-mono break-words leading-relaxed">
            {FLASH_TOURIST_AREA_ZIPS.join(", ")}
          </p>
        </details>
        <p>ระบบอ้างอิงตารางราคา Flash อัปเดตล่าสุด 2023/02/26</p>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 2. เช็คบริษัทขนส่ง ตามจังหวัด/อำเภอ (check-shipby.php)
 * ──────────────────────────────────────────────────────────────────────── */
async function renderShipByTab(sp: Record<string, string | undefined>) {
  const zipcode = (sp.zipcode ?? "10600").trim();
  const loc = /^\d{5}$/.test(zipcode) ? await lookupProvinceByZip(zipcode) : null;
  const carriers = loc ? resolveShipByCarriers(loc.province, loc.amphoe) : [];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h2 className="font-bold text-sm mb-3">ตรวจสอบบริษัทขนส่ง</h2>
        <form method="GET" action="/admin/tools/thai-shipping" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="shipby" />
          <label className="block text-sm">
            <span className="text-muted text-xs">รหัสไปรษณีย์</span>
            <input
              name="zipcode"
              inputMode="numeric"
              maxLength={5}
              minLength={5}
              defaultValue={zipcode}
              placeholder="รหัสไปรษณีย์"
              className="mt-1 w-40 rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-primary-500/40"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-primary-600 text-white px-5 py-2 text-sm font-medium hover:bg-primary-700"
          >
            ค้นหาบริษัทขนส่ง
          </button>
        </form>
      </div>

      {!loc ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          ไม่พบจังหวัด/อำเภอ สำหรับรหัสไปรษณีย์ <b>{zipcode}</b> — กรอกรหัสไปรษณีย์ 5 หลักให้ถูกต้อง
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
          <p className="text-sm">
            รหัสไปรษณีย์ตั้งต้น = <b>{zipcode}</b> · จังหวัด = <b>{loc.province}</b> · อำเภอ ={" "}
            <b>{loc.amphoe}</b> · ตำบล = <b>{loc.district}</b>
          </p>
          <div>
            <p className="text-xs text-muted mb-1">บริษัทขนส่งที่ให้บริการ ({carriers.length})</p>
            <ul className="flex flex-wrap gap-2">
              {carriers.map((c, i) => (
                <li
                  key={`${c.id}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1 text-xs font-medium"
                >
                  <span className="font-mono text-[10px] text-emerald-500">#{c.id}</span>
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface-alt/30 p-4 text-xs text-muted space-y-1">
        <p className="text-amber-700 font-medium">หมายเหตุ :</p>
        <p>1. ลูกค้ารหัส PRFAM สามารถเลือกขนส่งได้แบบอิสระ (ดูแท็บ &ldquo;เลือกขนส่งอิสระ&rdquo;)</p>
        <p>
          2. ลูกค้ารหัส PR2515 (บริษัท เอดี แคมป์ จำกัด · ฉะเชิงเทรา 24130) ส่ง PCS เหมาๆ ได้
          (ดูแท็บ &ldquo;เหมาๆ นอกเขต&rdquo;)
        </p>
        <details className="pt-1">
          <summary className="cursor-pointer text-foreground font-medium">
            รายชื่อบริษัทขนส่งทั้งหมดในระบบ ({ALL_SHIPBY_CARRIERS.length})
          </summary>
          <ol className="mt-1 list-decimal list-inside columns-2 sm:columns-3">
            {ALL_SHIPBY_CARRIERS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </details>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 3. ขนส่งไทยต้น-ปลายทาง (check-payMethod.php · static guide)
 * ──────────────────────────────────────────────────────────────────────── */
function PayMethodTab() {
  const lines = [
    "ประเภทการชำระเงินต้นทางหรือปลายทางขึ้นอยู่กับขนส่งที่ลูกค้าเลือก หากมีการเปลี่ยนขนส่งต้องเช็กข้อมูล ประเภทการขนส่งเพื่อให้สอดคล้องกับเงื่อนไขของบริษัทดังต่อไปนี้",
    "การคิดค่าขนส่งต้นทาง โดยปกติแล้วจะมีแต่ Flash และ PCS เหมาๆ",
    "ขนส่งเอกชนต่าง ๆ จะเป็นปลายทางทั้งหมด",
    "ยกเว้นแต่มีความจำเป็นจากลูกค้า เช่น ลูกค้าไม่อยู่บ้านหรือสะดวกจ่ายค่าขนส่งต้นทาง สามารถปรับได้ในแต่ละกรณี",
  ];
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <h2 className="font-bold text-sm mb-3">เช็กขนส่งไทยต้น-ปลายทาง</h2>
      <ol className="list-decimal list-inside space-y-2 text-sm leading-relaxed">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 4. ลูกค้าส่งเหมาๆ ฟรี ไม่มี 50 บาท (check-customer-maomao-free.php → tb_address_maomao_free)
 * ──────────────────────────────────────────────────────────────────────── */
async function renderMaomaoFreeTab() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_address_maomao_free")
    .select("id, datetime, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, userid, adminid")
    .order("datetime", { ascending: false })
    .returns<MaomaoFreeRow[]>();

  if (error) {
    console.error("[thai-shipping maomao-free] query failed", {
      code: error.code,
      message: error.message,
    });
  }
  const rows = data ?? [];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h2 className="font-bold text-sm">ลูกค้าที่ส่งเหมา ๆ ฟรี (ไม่มี 50 บาท)</h2>
        <p className="mt-1 text-xs text-muted">
          ระบบทำงานอัตโนมัติ หากรหัสลูกค้าตรงกับชื่อที่อยู่ที่ระบุไว้ โดยที่ ตำบล/แขวง · อำเภอ/เขต ·
          จังหวัด · รหัสไปรษณีย์ ตรงกันเท่านั้น
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
          โหลดข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-8 text-center text-sm text-muted">
          ยังไม่มีรายการที่อยู่ส่งเหมาๆ ฟรี
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/40 text-xs text-muted">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-semibold">วันที่สร้าง</th>
                <th className="px-4 py-2.5 font-semibold">รหัสลูกค้า</th>
                <th className="px-4 py-2.5 font-semibold">ตำบล/แขวง</th>
                <th className="px-4 py-2.5 font-semibold">อำเภอ/เขต</th>
                <th className="px-4 py-2.5 font-semibold">จังหวัด</th>
                <th className="px-4 py-2.5 font-semibold">รหัสไปรษณีย์</th>
                <th className="px-4 py-2.5 font-semibold">ผู้สร้าง</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-alt/40">
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                    {r.datetime ? r.datetime.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/customers/${r.userid}`}
                      className="text-primary-600 hover:underline font-mono"
                    >
                      {r.userid}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{r.addresssubdistrict}</td>
                  <td className="px-4 py-2.5">{r.addressdistrict}</td>
                  <td className="px-4 py-2.5">{r.addressprovince}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.addresszipcode}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{r.adminid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 5. ลูกค้าที่ใช้เหมาๆ นอกเขตได้ (check-customer-maomao-vip.php · legacy JSON ref)
 * ──────────────────────────────────────────────────────────────────────── */
function MaomaoVipTab() {
  // Legacy reads a 1-row reference JSON (user-vip-maomao.json). Ported as the
  // same static reference (PCS→PR rebrand applied to the customer code).
  const rows = [
    {
      datetime: "2024-05-27 00:30:00",
      userid: "PR2515",
      addressFullText:
        "บริษัท เอดี แคมป์ จำกัด 55/9 หมู่4 หมู่บ้านสุขุมวิทพาร์คมอเตอร์เวย์ ตำบล/แขวง ท่าสะอ้าน อำเภอ/เขต บางปะกง จังหวัด ฉะเชิงเทรา 24130",
    },
  ];
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h2 className="font-bold text-sm">ลูกค้าที่ใช้เหมา ๆ นอกเขตได้</h2>
        <p className="mt-1 text-xs text-muted">
          ระบบทำงานอัตโนมัติ หากรหัสลูกค้าตรงกับชื่อที่อยู่ที่ระบุไว้ โดยที่ ตำบล/แขวง · อำเภอ/เขต ·
          จังหวัด · รหัสไปรษณีย์ ตรงกันเท่านั้น
        </p>
        <p className="mt-1 text-[11px] text-amber-700">
          ข้อมูลอ้างอิงจากรายการพิเศษของระบบเดิม (เดิมเป็นไฟล์ JSON) — รหัสลูกค้า rebrand PCS → PR
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/40 text-xs text-muted">
            <tr className="text-left">
              <th className="px-4 py-2.5 font-semibold">วันที่สร้าง</th>
              <th className="px-4 py-2.5 font-semibold">รหัสลูกค้า</th>
              <th className="px-4 py-2.5 font-semibold">ที่อยู่</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userid} className="border-t border-border hover:bg-surface-alt/40">
                <td className="px-4 py-2.5 text-xs whitespace-nowrap">{r.datetime}</td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/customers/${r.userid}`}
                    className="text-primary-600 hover:underline font-mono"
                  >
                    {r.userid}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-xs">{r.addressFullText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * 6. ลูกค้าที่เลือกขนส่งได้อิสระ (check-customer-shipby-freedom.php · legacy JSON ref)
 * ──────────────────────────────────────────────────────────────────────── */
function ShipByFreedomTab() {
  // Legacy reads a 1-row reference JSON (user-shipby-freedom.json).
  const rows = [{ datetime: "2024-05-27 00:30:00", userid: "PRFAM" }];
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h2 className="font-bold text-sm">ลูกค้าที่เลือกขนส่งได้อิสระ</h2>
        <p className="mt-1 text-xs text-muted">
          ระบบทำงานอัตโนมัติ หากรหัสลูกค้าตรงกับชื่อที่อยู่ที่ระบุไว้ โดยที่ ตำบล/แขวง · อำเภอ/เขต ·
          จังหวัด · รหัสไปรษณีย์ ตรงกันเท่านั้น
        </p>
        <p className="mt-1 text-[11px] text-amber-700">
          ข้อมูลอ้างอิงจากรายการพิเศษของระบบเดิม (เดิมเป็นไฟล์ JSON) — รหัสลูกค้า rebrand PCS → PR
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/40 text-xs text-muted">
            <tr className="text-left">
              <th className="px-4 py-2.5 font-semibold">วันที่สร้าง</th>
              <th className="px-4 py-2.5 font-semibold">รหัสลูกค้า</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userid} className="border-t border-border hover:bg-surface-alt/40">
                <td className="px-4 py-2.5 text-xs whitespace-nowrap">{r.datetime}</td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/customers/${r.userid}`}
                    className="text-primary-600 hover:underline font-mono"
                  >
                    {r.userid}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
