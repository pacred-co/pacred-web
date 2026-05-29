/* eslint-disable @next/next/no-img-element */
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatPhoneNumber, type PcsChromeData } from "@/lib/legacy/pcs-chrome";
import { PcsLeftMenuUserPill } from "./pcs-left-menu-user-pill";
import { PcsLeftMenuAccordion } from "./pcs-left-menu-accordion";

/** Central Pacred line is shown pre-formatted (skips formatPhoneNumber which
 *  expects mobile format). Matches the SALES_FALLBACK tel in pcs-chrome.ts. */
const CENTRAL_TEL = "02-421-3325";

/** left-menu.php L99 — the four member codes that see the agent-history menu
 *  (legacy PCS888/PCS352/PCS2678/PCS4155 → rebranded PR<n>). */
const AGENT_CODES = ["PR888", "PR352", "PR2678", "PR4155"];

/** member/include/function.php L360-367 — badgeMenu(): a small red pill, or none.
 *  Tailwind-only rebuild — same name + same prop so callers don't change. */
function MenuBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-auto min-w-[18px] rounded-full bg-red-600 px-1.5 text-center text-[10px] font-medium leading-[18px] text-white">
      {n}
    </span>
  );
}

/** A sub-item row inside an accordion — `<ChevronRight>` prefix + indented
 *  small muted text. Stays a Server-Component-friendly `<Link>`. */
function SubLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 pl-12 pr-4 py-2 text-[13px] text-muted hover:text-foreground hover:bg-gray-50"
    >
      <ChevronRight className="h-3.5 w-3.5 opacity-60" />
      <span className="flex-1">{children}</span>
    </Link>
  );
}

/**
 * Legacy PCS Cargo customer left sidebar — Tailwind-only rebuild.
 * Section order matches the legacy `member/include/left-menu.php` 1:1:
 *   1. user pill / dropdown   2. last-login text   3. sales card
 *   4. top-level nav items (some with accordion sub-lists).
 *
 * Bootstrap-4 / Modern-Admin markup has been dropped (ปอน 2026-05-24 —
 * `bootstrap*.css` / `custom*.css` are no longer loaded; the legacy classes
 * leaked into the public chrome). The outer `id="pcs-left-menu"
 * className="notranslate main-menu"` wrapper is kept so the
 * `#pcs-left-menu.main-menu` selector in `legacy-overrides.css` still pins
 * the sidebar to `position: fixed; left:0; top:0; width:260px; height:100vh`
 * on the md breakpoint. Icons keep `className="pcs-icon"` so the
 * grayscale→color filter override still latches.
 */
export function PcsLeftMenu({ data }: { data: PcsChromeData }) {
  const isAgent = AGENT_CODES.includes(data.userID);
  const salesTel =
    data.sales.tel === CENTRAL_TEL
      ? data.sales.tel
      : formatPhoneNumber(data.sales.tel);

  return (
    <div
      id="pcs-left-menu"
      className="notranslate main-menu bg-white text-foreground"
    >
      {/* 1. User pill / dropdown */}
      <PcsLeftMenuUserPill userID={data.userID} userPicture={data.userPicture} />

      {/* 2. Last-login text — centered, small muted */}
      <div className="border-b border-border px-3 py-2 text-center text-[11px] text-muted">
        <div>
          {data.userName} {data.userLastName}
        </div>
        <div>{data.userEmail}</div>
      </div>

      {/* 3. Sales card */}
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-gradient-to-br from-red-50 to-white px-3 py-3">
          <a
            className="image-popup-vertical-fit shrink-0"
            href={data.sales.picture}
          >
            <img
              src={data.sales.picture}
              alt=""
              className="h-[55px] w-[55px] rounded-full object-cover ring-2 ring-red-200"
            />
          </a>
          <div className="min-w-0 flex-1 text-[12px] leading-snug">
            <div className="text-muted">ผู้ดูแล</div>
            <div className="font-semibold text-foreground">
              เซลล์ <span>{data.sales.nickname}</span>
            </div>
            <div className="text-muted">
              Tel:{" "}
              <a
                href={`tel:${data.sales.tel}`}
                className="text-foreground hover:text-red-700"
              >
                {salesTel}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Top-level nav */}
      <nav className="py-1">
        {/* หน้าแรก */}
        <Link
          href="/"
          className="nav-item flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-gray-50 active:bg-gray-100"
        >
          <img
            src="/images/home/iconfloating/pacred-home-main.png"
            alt=""
            className="pcs-icon h-6 w-6"
          />
          <span>หน้าแรก</span>
        </Link>

        {/* ระบบสมาชิก */}
        <Link
          href="/dashboard"
          className="nav-item flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-gray-50 active:bg-gray-100"
        >
          <img
            src="/images/home/iconfloating/pcs-home.png"
            alt=""
            className="pcs-icon h-6 w-6"
          />
          <span>ระบบสมาชิก</span>
        </Link>

        {/* บริการฝากสั่งสินค้า */}
        <PcsLeftMenuAccordion
          icon="/images/home/iconfloating/pcs-cart.png"
          label="บริการฝากสั่งสินค้า"
          badge={<MenuBadge n={data.countShops2 + data.countCart} />}
        >
          <SubLink href="/service-order">รายการสั่งสินค้าทั้งหมด</SubLink>
          <SubLink href="/service-order?q=2">
            <span className="inline-flex w-full items-center">
              <span>รอชำระเงิน</span>
              <MenuBadge n={data.countShops2} />
            </span>
          </SubLink>
          <SubLink href="/cart">
            <span className="inline-flex w-full items-center">
              <span>รถเข็นสินค้า</span>
              <MenuBadge n={data.countCart} />
            </span>
          </SubLink>
          <SubLink href="/cart/add">เพิ่มสินค้าในรถเข็น</SubLink>
        </PcsLeftMenuAccordion>

        {/* บริการฝากนำเข้า — flat per ปอน 2026-05-30: 4 sub-rows, รอชำระ shows
            its pending-payment count (fstatus=5). LCL/FCL × รถ/เรือ/แอร์ nested
            accordions removed; ประวัติ = ส่งแล้ว filter (q=7). */}
        <PcsLeftMenuAccordion
          icon="/images/home/iconfloating/pcs-forwarder.png"
          label="บริการฝากนำเข้า"
          badge={<MenuBadge n={data.countForwarder5 + data.countFCredit} />}
        >
          <SubLink href="/service-import">รายการนำเข้า</SubLink>
          <SubLink href="/service-import?q=5">
            <span className="inline-flex w-full items-center">
              <span>รอชำระ</span>
              <MenuBadge n={data.countForwarder5} />
            </span>
          </SubLink>
          <SubLink href="/service-import/add">เพิ่มรายการนำเข้า</SubLink>
          <SubLink href="/service-import?q=7">ประวัติการนำเข้า</SubLink>
        </PcsLeftMenuAccordion>

        {/* บริการฝากชำระ/โอน */}
        <PcsLeftMenuAccordion
          icon="/images/home/iconfloating/pcs-payment.png"
          label="บริการฝากชำระ/โอน"
        >
          <SubLink href="/service-payment">รายการฝากชำระ</SubLink>
          <SubLink href="/service-payment/add">เพิ่มรายการฝากชำระ</SubLink>
        </PcsLeftMenuAccordion>

        {/* กระเป๋าสตางค์เงินสด */}
        <PcsLeftMenuAccordion
          icon="/images/home/iconfloating/pcs-wallet.png"
          label="กระเป๋าสตางค์เงินสด"
        >
          <SubLink href="/wallet">รายการเดินบัญชี</SubLink>
          <SubLink href="/wallet/withdraw">ถอนเงิน</SubLink>
          <SubLink href="/wallet/deposit">เติมเงิน</SubLink>
        </PcsLeftMenuAccordion>

        {/* กระเป๋าสตางค์เครดิต (creditUser only) */}
        {data.creditUser && (
          <PcsLeftMenuAccordion
            icon="/images/home/iconfloating/pcs-wallet.png"
            label="กระเป๋าสตางค์เครดิต"
            badge={<MenuBadge n={data.countFCreditError} />}
          >
            <SubLink href="/wallet-credit">รายการเดินบัญชี</SubLink>
            <SubLink href="/service-import?q=c">
              <span className="inline-flex w-full items-center">
                <span>ชำระเงิน</span>
                <MenuBadge n={data.countFCreditError} />
              </span>
            </SubLink>
          </PcsLeftMenuAccordion>
        )}

        {/* ประวัติตัวแทน (isAgent only) */}
        {isAgent && (
          <PcsLeftMenuAccordion
            icon="/images/home/iconfloating/pacred_sales.png"
            label="ประวัติตัวแทน"
          >
            <SubLink href="/sales">สมาชิกในทีม</SubLink>
            <SubLink href="/sales/report">ประวัติรายการทั้งหมด</SubLink>
            <SubLink href="/sales/history">ประวัติการเบิกเงิน</SubLink>
            <SubLink href="/sales/report/add">ทำรายการเบิกเงิน</SubLink>
          </PcsLeftMenuAccordion>
        )}

        {/* ที่อยู่จัดส่งสินค้า */}
        <Link
          href="/addresses"
          className="nav-item flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-gray-50 active:bg-gray-100"
        >
          <img
            src="/images/home/iconfloating/pcs-address.png"
            alt=""
            className="pcs-icon h-6 w-6"
          />
          <span>ที่อยู่จัดส่งสินค้า</span>
        </Link>
      </nav>
    </div>
  );
}
