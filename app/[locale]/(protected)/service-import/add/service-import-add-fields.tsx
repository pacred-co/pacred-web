import { BadgePercent, Box, MapPin, Plus, Ship } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ServiceImportShipBySelect } from "./service-import-shipby-select";

/**
 * The four form-field sections of the "เพิ่มรายการนำเข้า" (forwarder add)
 * flow — shared verbatim by BOTH surfaces that create an import order:
 *   - the full-page form at `/service-import/add` (Server Component), and
 *   - the `<AddForwarderModal>` on the `/service-import` list view (Client).
 *
 * Pure, prop-driven markup (no hooks / no event handlers) so it renders
 * identically on either side of the RSC boundary. The field NAMES are the
 * legacy `forwarder.php` `save` POST contract — `fTrackingCHN` · `fDetail`
 * · `fAmount` · `hTransportType` (1=รถ EK / 2=เรือ SEA) · `crate`
 * (2=ไม่ตีลังไม้ / 1=ตีลังไม้) · `addressID` (id | "PCS") · `pro` ("f") —
 * consumed by `createLegacyForwarder` (actions/forwarder-legacy.ts). The
 * submit footer is owned by `<ServiceImportAddForm>`, not here.
 *
 * `compact` (the list-view modal) packs the four sections into a 2-column
 * grid on `sm+` with tighter spacing so the dialog fits the viewport without
 * scrolling (ปอน 2026-05-30). The full-page form leaves `compact` unset and
 * keeps its roomy single-column layout, byte-for-byte unchanged.
 *
 * The address <select> is rendered from pre-resolved options passed by the
 * parent (each page loads tb_address its own faithful way); this component
 * never touches the DB.
 */

export type AddrOption = { addressid: number; full: string };

const inputBase =
  "w-full rounded-lg border border-border bg-white px-3 text-base text-foreground placeholder:text-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20";
const labelClass = "mb-1 block text-sm font-medium text-foreground";

export function ServiceImportAddFields({
  mainAddr,
  others,
  compact = false,
}: {
  mainAddr: AddrOption | null;
  others: AddrOption[];
  compact?: boolean;
}) {
  const hasAddress = Boolean(mainAddr) || others.length > 0;

  // Spacing scales down in compact (modal) mode; identical to the original
  // roomy values otherwise (full-page form is untouched).
  const sectionCls = `rounded-2xl border border-border bg-white shadow-sm ${
    compact ? "p-3.5" : "p-4 sm:p-5"
  }`;
  const headCls = `flex items-center gap-2 text-base font-semibold text-foreground ${
    compact ? "mb-3" : "mb-4"
  }`;
  const fieldMb = compact ? "mb-3" : "mb-4";
  const inputCls = `${inputBase} ${compact ? "py-2" : "py-2.5"}`;

  const sections = (
    <>
      {/* ── 1. ข้อมูลการฝากนำเข้า ── */}
      <section className={sectionCls}>
        <h2 className={headCls}>
          <Box className="h-5 w-5 text-primary-600" />
          ข้อมูลการฝากนำเข้า
        </h2>

        <div className={fieldMb}>
          <label className={labelClass} htmlFor="fTrackingCHN">
            เลข Tracking
          </label>
          <input
            className={inputCls}
            name="fTrackingCHN"
            id="fTrackingCHN"
            type="text"
            placeholder="เลข Tracking จากร้านค้าจีน"
            maxLength={50}
            required
          />
        </div>

        <div className={fieldMb}>
          <label className={labelClass} htmlFor="fDetail">
            รายละเอียดสินค้า
          </label>
          <textarea
            className={inputCls}
            rows={compact ? 2 : 4}
            name="fDetail"
            id="fDetail"
            placeholder="เช่น เสื้อผ้า 3 ตัว, อะไหล่รถ ฯลฯ"
            maxLength={500}
            required
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="fAmount">
            จำนวนกล่อง
          </label>
          <input
            className={`${inputCls} max-w-[140px]`}
            name="fAmount"
            id="fAmount"
            type="number"
            min="1"
            max="10000"
            step="1"
            inputMode="numeric"
            defaultValue="1"
            required
          />
        </div>
      </section>

      {/* ── 2. การขนส่งจากจีนมาไทย ── */}
      <section className={sectionCls}>
        <h2 className={headCls}>
          <Ship className="h-5 w-5 text-primary-600" />
          การขนส่งจากจีนมาไทย
        </h2>

        {/* รูปแบบการขนส่ง */}
        <p className="mb-2 text-sm font-medium text-foreground">
          รูปแบบการขนส่งจีน-ไทย
        </p>
        <div className={`grid grid-cols-2 gap-3 ${compact ? "mb-3" : "mb-5"}`}>
          <RadioCard
            compact={compact}
            name="hTransportType"
            value="1"
            img="/images/Iconistpack/car.png"
            title="รถ (EK)"
            subtitle="5-7 วัน"
          />
          <RadioCard
            compact={compact}
            name="hTransportType"
            value="2"
            img="/images/Iconistpack/ship.png"
            title="เรือ (SEA)"
            subtitle="12-16 วัน"
            defaultChecked
          />
        </div>

        {/* การตีลังไม้ */}
        <p className="mb-2 text-sm font-medium text-foreground">
          การตีลังไม้สินค้า
        </p>
        <div className="grid grid-cols-2 gap-3">
          <RadioCard
            compact={compact}
            name="crate"
            value="2"
            img="/images/Iconistpack/unbox.png"
            title="ไม่ตีลังไม้"
            defaultChecked
          />
          <RadioCard
            compact={compact}
            name="crate"
            value="1"
            img="/images/Iconistpack/box.png"
            title="ตีลังไม้"
            subtitle="มีค่าบริการ"
          />
        </div>
      </section>

      {/* ── 3. ที่อยู่ในการจัดส่งในไทย ── */}
      <section className={sectionCls}>
        <div
          className={`flex flex-wrap items-center justify-between gap-2 ${
            compact ? "mb-3" : "mb-4"
          }`}
        >
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <MapPin className="h-5 w-5 text-primary-600" />
            ที่อยู่ในการจัดส่งในไทย
          </h2>
          <Link
            href="/addresses/add"
            target="_blank"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-600 hover:text-primary-700"
          >
            <Plus className="h-3.5 w-3.5" />
            เพิ่มที่อยู่ใหม่
          </Link>
        </div>

        <select
          className={inputCls}
          name="addressID"
          id="addressID"
          required
          defaultValue=""
        >
          <option value="">กรุณาเลือกที่อยู่ในการจัดส่ง</option>
          {mainAddr && (
            <option value={mainAddr.addressid}>
              [ที่อยู่หลัก] {mainAddr.full}
            </option>
          )}
          {others.map((a) => (
            <option key={a.addressid} value={a.addressid}>
              {a.full}
            </option>
          ))}
          <option value="PCS">รับเองหน้าโกดัง Pacred (สมุทรสาคร)</option>
        </select>

        {/* P1-18 — carrier (#hShipBy) picker. Repopulates when the address
            above changes (server action → tb_address ZIP → free-area list).
            TODO(ปอน): style the ship-by select + free-area hint to match
            design. */}
        <ServiceImportShipBySelect compact={compact} />

        {!hasAddress && (
          <p className="mt-2 text-[13px] text-muted">
            คุณยังไม่มีที่อยู่จัดส่ง — เลือก &ldquo;รับเองหน้าโกดัง Pacred
            (สมุทรสาคร)&rdquo; หรือ{" "}
            <Link
              href="/addresses/add"
              target="_blank"
              className="text-primary-600 hover:underline"
            >
              เพิ่มที่อยู่ใหม่
            </Link>
          </p>
        )}

        <p
          className={`rounded-lg bg-surface px-3 py-2 text-[13px] text-muted ${
            compact ? "mt-2" : "mt-3"
          }`}
        >
          หมายเหตุ : หากพื้นที่นอกเขตขนส่งของ Pacred
          ทางบริษัทจะเก็บเงินปลายทางเท่านั้น ยกเว้น แฟลช เอ็กซ์เพรส และ เจแอนด์ที
          เอ็กซ์เพรส ที่เก็บต้นทางเท่านั้น{" "}
          <a
            href="/services/import-china"
            target="_blank"
            rel="noreferrer"
            className="text-primary-600 hover:underline"
          >
            (เช็คพื้นที่ได้ที่นี่)
          </a>
        </p>
      </section>

      {/* ── 4. โปรโมชันสำหรับคุณ ── */}
      <section className={sectionCls}>
        <h2 className={headCls}>
          <BadgePercent className="h-5 w-5 text-primary-600" />
          โปรโมชันสำหรับคุณ
        </h2>

        <label
          htmlFor="input-12"
          className="group flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border p-3 transition has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50 hover:border-primary-300"
        >
          <input
            type="checkbox"
            name="pro"
            id="input-12"
            value="f"
            className="mt-1 h-5 w-5 shrink-0 accent-primary-600"
          />
          <span className="min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={`mb-2 w-full rounded-lg ${
                compact ? "max-w-[150px]" : "max-w-[240px]"
              }`}
              src="/legacy/pcs/theme/free50-3.png"
              alt="โปรโมชัน Pacred เหมา ๆ"
            />
            <a
              href="/services/import-china"
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-primary-600 hover:underline"
            >
              ดูพื้นที่จัดส่งและรายละเอียด
            </a>
          </span>
        </label>

        <p
          className={`text-[13px] text-muted ${compact ? "mt-2" : "mt-3"}`}
        >
          *หากสินค้ามีขนาดเล็ก บริษัทแนะนำให้เลือกขนส่ง Flash Express (เริ่มต้น
          30 บ.)
        </p>
      </section>
    </>
  );

  // Compact (modal): 2-column grid on sm+ so all four sections fit without
  // scrolling. Full-page: plain fragment — the parent <form> spaces them.
  if (compact) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
        {sections}
      </div>
    );
  }
  return sections;
}

/**
 * A single image radio "card". The check indicator is a DIRECT child of the
 * <label> (a sibling of the <input>) — `peer-checked:` compiles to the `~`
 * general-sibling combinator, which only reaches siblings of the peer input,
 * never descendants of a sibling.
 */
function RadioCard({
  name,
  value,
  img,
  title,
  subtitle,
  defaultChecked,
  compact,
}: {
  name: string;
  value: string;
  img: string;
  title: string;
  subtitle?: string;
  defaultChecked?: boolean;
  compact?: boolean;
}) {
  return (
    <label className="relative block cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <div
        className={`flex h-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border bg-white text-center transition peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-checked:ring-2 peer-checked:ring-primary-600/20 hover:border-primary-300 ${
          compact ? "p-2" : "p-3"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img}
          className={`object-contain ${compact ? "h-8 w-8" : "h-10 w-10"}`}
          alt=""
        />
        <div className="text-sm font-medium text-foreground">{title}</div>
        {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
      </div>
      <span className="pointer-events-none absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white opacity-0 transition peer-checked:opacity-100">
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 0 1 1.4-1.4l3.3 3.3 6.8-6.8a1 1 0 0 1 1.4 0Z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </label>
  );
}
