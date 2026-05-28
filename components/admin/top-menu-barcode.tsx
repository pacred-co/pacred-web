/**
 * <TopMenuBarcode>
 *
 * 5-tab menu shown at the top of every barcode-scanner page — faithful
 * port of the legacy `member/pcs-admin/barcode-c-all.php` (mobile/scanner)
 * + `barcode-d-all.php` (driver) breadcrumb cluster.
 *
 * Legacy URL → New URL mapping (per the Wave 1 plan, ภูม 2026-05-20 ค่ำ):
 *   /pcs-admin/barcode-c-all/      → /admin/barcode/cargo/all
 *   /pcs-admin/barcode-c-from/     → /admin/barcode/cargo/from
 *   /pcs-admin/barcode-c-import/   → /admin/barcode/cargo/import
 *   /pcs-admin/barcode-c-prepare/  → /admin/barcode/cargo/prepare
 *   /pcs-admin/barcode-d-all/      → /admin/barcode/driver/all
 *   /pcs-admin/barcode-d-from/     → /admin/barcode/driver/from
 *   /pcs-admin/barcode-d-import/   → /admin/barcode/driver/import
 *   /pcs-admin/barcode-d-prepare/  → /admin/barcode/driver/prepare
 *
 * No badge counts (scanner pages have no audit queues — counts apply
 * only to the warehouse/report-cnt cluster which uses <TopMenuReport>).
 *
 * Pattern lifted from `components/admin/top-menu-report.tsx`.
 */
import { Link } from "@/i18n/navigation";

type Group = "cargo" | "driver";

type Item = {
  label: string;
  cargoHref: string;
  driverHref: string;
};

const ITEMS: Item[] = [
  { label: "ทั้งหมด",          cargoHref: "/admin/barcode/cargo/all",     driverHref: "/admin/barcode/driver/all" },
  { label: "รับเข้าโกดังจีน",   cargoHref: "/admin/barcode/cargo/from",    driverHref: "/admin/barcode/driver/from" },
  { label: "เข้าโกดังไทย",      cargoHref: "/admin/barcode/cargo/import",  driverHref: "/admin/barcode/driver/import" },
  { label: "เตรียมส่ง",         cargoHref: "/admin/barcode/cargo/prepare", driverHref: "/admin/barcode/driver/prepare" },
];

function ChipLink({ href, label, active, accent }: {
  href: string;
  label: string;
  active: boolean;
  accent: "cargo" | "driver";
}) {
  // Legacy uses two visual flavors — purple-ish chips for the scanner
  // (cargo / desktop scanner) cluster, red-ish chips for driver (mobile).
  const activeBg =
    accent === "driver"
      ? "bg-red-600 text-white border-red-600"
      : "bg-primary-500 text-white border-primary-500";
  const idleHover =
    accent === "driver"
      ? "hover:bg-red-50 hover:border-red-300"
      : "hover:bg-surface-alt";
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 whitespace-nowrap border ${
        active ? activeBg : `bg-white border-border ${idleHover}`
      }`}
    >
      {label}
    </Link>
  );
}

export function TopMenuBarcode({ activeHref }: { activeHref?: string } = {}) {
  const isActive = (href: string) =>
    !!activeHref &&
    (href === activeHref || activeHref.startsWith(href + "/") || activeHref === href);

  const groups: { key: Group; tag: string; accent: "cargo" | "driver" }[] = [
    { key: "cargo",  tag: "เครื่องสแกน",  accent: "cargo"  },
    { key: "driver", tag: "มือถือคนขับ",   accent: "driver" },
  ];

  return (
    <nav className="pcs-legacy-top-menu border-b border-border bg-white dark:bg-surface px-2 py-2">
      <ul className="flex flex-wrap gap-1 items-center text-xs">
        {groups.map((g, gi) => (
          <li key={g.key} className="flex items-center gap-1">
            {gi > 0 && <span className="mx-1 text-muted">|</span>}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted px-1">
              {g.tag}
            </span>
            {ITEMS.map((it) => {
              const href = g.key === "cargo" ? it.cargoHref : it.driverHref;
              return (
                <ChipLink
                  key={g.key + ":" + it.label}
                  href={href}
                  label={it.label}
                  active={isActive(href)}
                  accent={g.accent}
                />
              );
            })}
          </li>
        ))}
      </ul>
    </nav>
  );
}
