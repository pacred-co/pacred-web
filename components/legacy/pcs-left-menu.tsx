/* eslint-disable @next/next/no-img-element */
import { Headset } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatPhoneNumber, type PcsChromeData } from "@/lib/legacy/pcs-chrome";
import { PcsLeftMenuUserPill } from "./pcs-left-menu-user-pill";
import { PcsLeftMenuAccordionGroup } from "./pcs-left-menu-accordion";
import { MenuRow, CardSubLink } from "./pcs-left-menu-cards";

/** Central Pacred line is shown pre-formatted (skips formatPhoneNumber which
 *  expects mobile format). Matches the SALES_FALLBACK tel in pcs-chrome.ts. */
const CENTRAL_TEL = "02-421-3325";

/** left-menu.php L99 — the four member codes that see the agent-history menu
 *  (legacy PCS888/PCS352/PCS2678/PCS4155 → rebranded PR<n>). */
const AGENT_CODES = ["PR888", "PR352", "PR2678", "PR4155"];

/** member/include/function.php L360-367 — badgeMenu(): a small red pill, or none. */
function MenuBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-auto min-w-[18px] rounded-full bg-red-600 px-1.5 text-center text-[10px] font-medium leading-[18px] text-white">
      {n}
    </span>
  );
}

/** A sub-row label that carries its own pending badge (right-aligned). */
function SubLabel({ label, n }: { label: string; n: number }) {
  return (
    <span className="inline-flex w-full items-center">
      <span className="flex-1">{label}</span>
      <MenuBadge n={n} />
    </span>
  );
}

/** Section heading — red vertical bar + bold label (reference "▎บริการหลัก"). */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pcs-rail-hide px-4 pb-1.5 pt-4">
      <span className="flex items-center gap-2 text-[13px] font-bold text-foreground">
        <span className="h-3.5 w-1 rounded-full bg-red-600" />
        {children}
      </span>
    </div>
  );
}

/**
 * Pacred customer left sidebar — card + list redesign (owner 2026-06-09,
 * "เรียง+ดีไซน์ตามภาพ"):
 *   1. user pill (avatar + member code + name)
 *   2. ศูนย์บริการลูกค้า card — assigned เซล + CS (no call buttons, owner ask)
 *   3. บริการหลัก — colored service cards (lucide icons, NOT the PCS-branded
 *      PNGs). Cards with sub-pages expand (preserves §0d reachability for the
 *      sidebar-only routes: ประเมินราคา / ใบเสร็จ / ติดตามตู้ / ถอน-เติม-คืนเงิน
 *      / กระเป๋าร้านค้า / เครดิต / ตัวแทน). Single-destination cards navigate.
 *   4. เมนูอื่นๆ — utility list rows.
 *
 * The `id="pcs-left-menu" className="notranslate main-menu"` wrapper is kept so
 * `legacy-overrides.css`'s `#pcs-left-menu.main-menu` selector still pins the
 * sidebar (fixed, 260px) on the md breakpoint.
 */
export async function PcsLeftMenu({ data }: { data: PcsChromeData }) {
  const t = await getTranslations("pcsLeftMenu");
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
      {/* 1. User pill / dropdown — avatar + member code + name */}
      <div className="pcs-rail-hide">
        <PcsLeftMenuUserPill
          userID={data.userID}
          userPicture={data.userPicture}
          fullName={`${data.userName} ${data.userLastName}`.trim()}
        />
      </div>

      {/* 2. ศูนย์บริการลูกค้า — assigned เซล (adminIDSale) + CS (adminIDCS).
          No call buttons (owner 2026-06-09); tel stays a plain text link. */}
      <div className="pcs-rail-hide border-b border-border px-3 py-3">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-red-50 to-white p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-red-700">
            <Headset className="h-4 w-4" aria-hidden />
            {t("customerServiceCenter")}
          </div>
          {/* เซล — assigned sales rep */}
          <div className="flex items-center gap-3">
            <a className="image-popup-vertical-fit shrink-0" href={data.sales.picture}>
              <img
                src={data.sales.picture}
                alt=""
                className="h-[42px] w-[42px] rounded-full object-cover ring-2 ring-red-200"
              />
            </a>
            <div className="min-w-0 flex-1 text-[12px] leading-snug">
              <div className="text-muted">{t("salesCaresCustomer")}</div>
              <div className="font-semibold text-foreground">
                {t("salesPrefix")} <span>{data.sales.nickname}</span>
              </div>
              <div className="text-muted">
                Tel:{" "}
                <a href={`tel:${data.sales.tel}`} className="text-foreground hover:text-red-700">
                  {salesTel}
                </a>
              </div>
            </div>
          </div>
          {/* CS — ฝ่ายบริการลูกค้า */}
          <div className="mt-2.5 flex items-center gap-3 border-t border-red-100 pt-2.5">
            <a className="image-popup-vertical-fit shrink-0" href={data.cs.picture}>
              <img
                src={data.cs.picture}
                alt=""
                className="h-[42px] w-[42px] rounded-full object-cover ring-2 ring-red-200"
              />
            </a>
            <div className="min-w-0 flex-1 text-[12px] leading-snug">
              <div className="text-muted">{t("customerServiceDept")}</div>
              <div className="font-semibold text-foreground">
                CS <span>{data.cs.nickname}</span>
              </div>
              <div className="text-muted">
                Tel:{" "}
                <a href={`tel:${data.cs.tel}`} className="text-foreground hover:text-red-700">
                  {formatPhoneNumber(data.cs.tel)}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Only ONE section is open at a time across both card groups. */}
      <PcsLeftMenuAccordionGroup>
        {/* หน้าแรก — pinned at the very top (owner 2026-06-09) */}
        <nav className="pb-1 pt-1">
          <MenuRow iconKey="home" label={t("home")} href="/" />
        </nav>

        {/* 3. บริการหลัก — same compact list pattern as เมนูอื่นๆ (owner
            2026-06-09: การ์ดใหญ่ "บวมไป"), with a per-service colored icon to
            keep the service hierarchy. Cards-with-sub-pages expand (preserves
            §0d reachability for the sidebar-only routes). */}
        <SectionLabel>{t("sectionMainServices")}</SectionLabel>
        <nav className="pb-1">
          {/* สั่ง — ฝากสั่งซื้อ (expandable · owner 2026-06-09 "สั่งซื้อขึ้นบน") */}
          <MenuRow
            iconImg="/images/home/iconfloating/pcs-cart.png"
            label={t("orderService")}
            badge={<MenuBadge n={data.countShops2 + data.countCart} />}
          >
            <CardSubLink href="/service-order">{t("allOrders")}</CardSubLink>
            <CardSubLink href="/service-order?q=2">
              <SubLabel label={t("pendingPayment")} n={data.countShops2} />
            </CardSubLink>
            <CardSubLink href="/cart">
              <SubLabel label={t("cart")} n={data.countCart} />
            </CardSubLink>
            <CardSubLink href="/cart/add">{t("addToCart")}</CardSubLink>
          </MenuRow>

          {/* โอน — ฝากโอน / yuan transfer (expandable) */}
          <MenuRow iconImg="/images/home/iconfloating/pcs-payment.png" label={t("paymentService")}>
            <CardSubLink href="/service-payment">{t("paymentList")}</CardSubLink>
            <CardSubLink href="/service-payment/add">{t("addPayment")}</CardSubLink>
          </MenuRow>

          {/* นำเข้า — import (expandable · holds the sidebar-only routes) */}
          <MenuRow
            iconImg="/images/home/iconfloating/pcs-forwarder.png"
            label={t("importService")}
            badge={<MenuBadge n={data.countForwarder5 + data.countFCredit} />}
          >
            <CardSubLink href="/service-import">{t("importList")}</CardSubLink>
            <CardSubLink href="/service-import?q=5">
              <SubLabel label={t("pendingPaymentShort")} n={data.countForwarder5} />
            </CardSubLink>
            <CardSubLink href="/service-import/add">{t("addImport")}</CardSubLink>
            <CardSubLink href="/service-import/estimate">{t("estimateImport")}</CardSubLink>
            <CardSubLink href="/service-import?q=7">{t("importHistory")}</CardSubLink>
            <CardSubLink href="/service-import/receipts">{t("importReceiptHistory")}</CardSubLink>
            <CardSubLink href="/shipments">{t("shipmentTracking")}</CardSubLink>
          </MenuRow>

          {/* ส่งออก — clickable → coming-soon page (owner 2026-06-09 ·
              "เร็วๆนี้" badge removed) */}
          <MenuRow
            iconImg="/images/home/iconfloating/export.png"
            label={t("exportService")}
            href="/coming-soon?service=export"
          />

          {/* พิธีการศุลกากร — clickable → coming-soon page */}
          <MenuRow
            iconImg="/images/home/iconfloating/checklistred.png"
            label={t("cardCustomsSub")}
            href="/coming-soon?service=customs"
          />
        </nav>

        {/* 4. เมนูอื่นๆ — utility list */}
        <SectionLabel>{t("sectionOtherMenus")}</SectionLabel>
        <nav className="pb-2">
          <MenuRow
            iconKey="receipt"
            label={t("paymentDue")}
            href="/payment-due"
            badge={<MenuBadge n={data.countPaymentDue} />}
          />

          {/* กระเป๋าสตางค์เงินสด — expandable (holds sidebar-only routes) */}
          <MenuRow iconKey="wallet" label={t("cashWallet")}>
            <CardSubLink href="/wallet">{t("accountStatement")}</CardSubLink>
            <CardSubLink href="/wallet/deposit">{t("deposit")}</CardSubLink>
            <CardSubLink href="/wallet/withdraw">{t("withdraw")}</CardSubLink>
            <CardSubLink href="/refunds">{t("refundStatus")}</CardSubLink>
            <CardSubLink href="/wallet-shop">{t("shopWallet")}</CardSubLink>
          </MenuRow>

          {/* กระเป๋าสตางค์เครดิต — credit users only */}
          {data.creditUser && (
            <MenuRow
              iconKey="credit"
              label={t("creditWallet")}
              badge={<MenuBadge n={data.countFCreditError} />}
            >
              <CardSubLink href="/wallet-credit">{t("accountStatement")}</CardSubLink>
              <CardSubLink href="/service-import?q=c">
                <SubLabel label={t("payCredit")} n={data.countFCreditError} />
              </CardSubLink>
            </MenuRow>
          )}

          {/* ประวัติตัวแทน — agent codes only */}
          {isAgent && (
            <MenuRow iconKey="agent" label={t("agentHistory")}>
              <CardSubLink href="/sales">{t("teamMembers")}</CardSubLink>
              <CardSubLink href="/sales/report">{t("allTransactionHistory")}</CardSubLink>
              <CardSubLink href="/sales/history">{t("withdrawalHistory")}</CardSubLink>
              <CardSubLink href="/sales/report/add">{t("makeWithdrawal")}</CardSubLink>
            </MenuRow>
          )}

          <MenuRow iconKey="address" label={t("shippingAddresses")} href="/addresses" />
        </nav>
      </PcsLeftMenuAccordionGroup>
    </div>
  );
}
