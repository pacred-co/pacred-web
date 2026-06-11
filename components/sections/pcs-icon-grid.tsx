import { getTranslations } from "next-intl/server";
import {
  ShoppingBasket,
  PackagePlus,
  ReceiptText,
  ArrowLeftRight,
  Wallet,
  CirclePlus,
  CircleMinus,
  MapPin,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { signOutAction } from "@/actions/auth";

/**
 * PCS 9-icon launchpad grid — the core, most-recognisable surface of the
 * legacy PCS Cargo customer portal. Faithful port of the `row text-center`
 * icon grid in `member/menu.php` (D1 / ADR-0017, `d1-fidelity-customer.md`
 * §1.1 table — closes gap-map row "9-icon grid 🔴🔴").
 *
 * Legacy = 9 cells, each `col-4` → a FLAT 3-column × 3-row grid on every
 * width. Order + labels match the legacy table exactly, rebranded only by
 * routing to the equivalent Pacred routes:
 *
 *   1 ฝากสั่งสินค้า              shops/            → /service-order
 *   2 ฝากนำเข้าสินค้า            forwarder/        → /service-import
 *   3 ประวัติใบเสร็จรายการนำเข้า  receipt-f-hs/     → /service-import/receipts
 *   4 ฝากชำระ/โอน               payment/          → /service-payment
 *   5 เป๋าตัง                    wallet/           → /wallet/history
 *   6 ชำระเงิน                   wallet/add/       → /wallet/deposit
 *   7 ถอนเงิน                    wallet/withdraw/  → /wallet/withdraw
 *   8 ที่อยู่จัดส่งสินค้า          address/          → /addresses
 *   9 ออกจากระบบ                 logout/           → signOutAction()
 */

type Tile = {
  key: string;
  href: string;
  icon: LucideIcon;
  /** Lucide icon colour — keeps each tile distinct like the legacy PNGs. */
  tone: string;
};

const TILES: Tile[] = [
  { key: "tileShop",     href: "/service-order",            icon: ShoppingBasket, tone: "text-rose-500" },
  { key: "tileImport",   href: "/service-import",           icon: PackagePlus,    tone: "text-orange-500" },
  { key: "tileReceipts", href: "/service-import/receipts",  icon: ReceiptText,    tone: "text-amber-500" },
  { key: "tilePayment",  href: "/service-payment",          icon: ArrowLeftRight, tone: "text-emerald-500" },
  { key: "tileWallet",   href: "/wallet/history",           icon: Wallet,         tone: "text-sky-500" },
  { key: "tileTopUp",    href: "/wallet/deposit",           icon: CirclePlus,     tone: "text-green-600" },
  { key: "tileWithdraw", href: "/wallet/withdraw",          icon: CircleMinus,    tone: "text-cyan-600" },
  { key: "tileAddress",  href: "/addresses",                icon: MapPin,         tone: "text-indigo-500" },
];

export async function PcsIconGrid() {
  const t = await getTranslations("pcsHome");

  return (
    <section className="px-4">
      <div className="grid grid-cols-3 gap-2">
        {TILES.map(({ key, href, icon: Icon, tone }) => (
          <Link
            key={key}
            href={href}
            className="flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center transition-colors hover:bg-surface-alt/60 active:bg-surface-alt"
          >
            <span className="flex h-[70px] w-[70px] items-center justify-center rounded-full bg-surface-alt/70">
              <Icon className={`h-8 w-8 ${tone}`} strokeWidth={1.75} />
            </span>
            <span className="text-sm font-medium leading-tight text-foreground">
              {t(key as "tileShop")}
            </span>
          </Link>
        ))}

        {/* Tile 9 — ออกจากระบบ. Logout is a server action, not a route, so
            this tile is a form submit rather than a <Link>. */}
        <form action={signOutAction} className="contents">
          <button
            type="submit"
            className="flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center transition-colors hover:bg-surface-alt/60 active:bg-surface-alt"
          >
            <span className="flex h-[70px] w-[70px] items-center justify-center rounded-full bg-surface-alt/70">
              <LogOut className="h-8 w-8 text-slate-500" strokeWidth={1.75} />
            </span>
            <span className="text-sm font-medium leading-tight text-foreground">
              {t("tileLogout")}
            </span>
          </button>
        </form>
      </div>
    </section>
  );
}
