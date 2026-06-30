import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import {
  SERVICE_CATALOG_LIST,
  type ServiceCatalogEntry,
  type TransportModeKey,
} from "@/lib/services/service-catalog";

/**
 * /admin/settings/service-catalog — READ-ONLY view of Pacred's service catalog
 * (owner 2026-06-30 "เอาทุกบริการของเราเข้า DB · 7-8 บริการ · แยก FCL/LCL ×
 *  รถ/เรือ/แอร์ × คาร์โก้/เฟรท").
 *
 * Lists the 8 live lanes (+ 5 marketing soon lanes) with their group / transport
 * modes / FCL-LCL / tax-invoice / default account / live flag, plus the CURRENT
 * order count per service (read straight from the live tb_* / freight tables).
 *
 * §0d reachability: linked from the settings hub (super card). §0e: READ-ONLY —
 *   no write path. §0g/§0h: self-explaining rows + readable hierarchy.
 *
 * requireAdmin reads cookies → force-dynamic (AGENTS.md §11).
 */

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<TransportModeKey, string> = {
  truck: "รถ",
  sea: "เรือ",
  air: "แอร์",
};

const GROUP_LABEL: Record<ServiceCatalogEntry["group"], string> = {
  cargo: "คาร์โก้",
  freight: "เฟรท",
  service: "บริการ",
};

const GROUP_STYLE: Record<ServiceCatalogEntry["group"], string> = {
  cargo: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  freight: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  service: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
};

const ACCOUNT_LABEL: Record<ServiceCatalogEntry["defaultAccount"], string> = {
  service: "บริการ (PromptPay)",
  logistics: "โลจิสติกส์",
  trading: "เทรดดิ้ง (ใบกำกับ)",
};

/** Count rows in a tb_* / freight table, tolerating an absent table / query error. */
async function safeCount(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
): Promise<number | null> {
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.error(`[service-catalog count] ${table} failed`, {
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return count ?? 0;
}

export default async function ServiceCatalogPage() {
  // super/ultra manage; accounting reads. (isGodRole bypass covers ultra/super.)
  await requireAdmin(["super", "ultra", "accounting"]);

  const admin = createAdminClient();

  // Per-service live order counts from the live tables. Distinct tables only
  // (shop/yuan/cargo/freight) — count once each, then map to services.
  const [shopCount, yuanCount, cargoCount, freightCount] = await Promise.all([
    safeCount(admin, "tb_header_order"),
    safeCount(admin, "tb_payment"),
    safeCount(admin, "tb_forwarder"),
    safeCount(admin, "freight_shipments"),
  ]);

  // Map an order_table → its live count (freight import+export share one table).
  const countFor = (entry: ServiceCatalogEntry): number | null => {
    switch (entry.orderTable) {
      case "tb_header_order":
        return shopCount;
      case "tb_payment":
        return yuanCount;
      case "tb_forwarder":
        return cargoCount;
      case "freight_shipments":
        return freightCount; // shared by freight_import + freight_export
      default:
        return null; // cross-cutting / soon lanes
    }
  };

  const live = SERVICE_CATALOG_LIST.filter((e) => e.isLive);
  const soon = SERVICE_CATALOG_LIST.filter((e) => !e.isLive);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl">
      <PageHeader
        eyebrow="ADMIN · ตั้งค่าระบบ"
        title="บริการของ Pacred (Service Catalog)"
        subtitle="ทะเบียนบริการทั้งหมด — แบ่งตาม คาร์โก้/เฟรท/บริการ × รถ/เรือ/แอร์ × FCL/LCL + บัญชีรับเงิน + จำนวนออเดอร์สด (อ่านอย่างเดียว)"
        badges={
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {live.length} บริการที่เปิดใช้
          </span>
        }
      />

      <p className="text-xs text-muted">
        อ่านอย่างเดียว · ที่มาของข้อมูล:{" "}
        <code className="rounded bg-surface px-1">service_catalog</code> +{" "}
        <code className="rounded bg-surface px-1">lib/services/service-catalog.ts</code>. จำนวนออเดอร์นับจาก
        ตารางจริง (tb_header_order / tb_payment / tb_forwarder / freight_shipments).
      </p>

      {/* ── live services ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">บริการที่เปิดใช้งาน ({live.length})</h2>
        <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-surface text-left text-xs font-semibold text-muted">
                <th className="px-3 py-2.5">บริการ</th>
                <th className="px-3 py-2.5">กลุ่ม</th>
                <th className="px-3 py-2.5">ขนส่ง</th>
                <th className="px-3 py-2.5">FCL/LCL</th>
                <th className="px-3 py-2.5">ทิศทาง</th>
                <th className="px-3 py-2.5">ใบกำกับ</th>
                <th className="px-3 py-2.5">บัญชีรับเงิน</th>
                <th className="px-3 py-2.5 text-right">ออเดอร์สด</th>
              </tr>
            </thead>
            <tbody>
              {live.map((e) => (
                <ServiceRow key={e.serviceKey} entry={e} count={countFor(e)} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted">
          * freight นำเข้า + ส่งออก ใช้ตารางเดียวกัน (freight_shipments) → จำนวนที่แสดงคือรวมทั้งสอง.
        </p>
      </section>

      {/* ── soon services ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-muted">บริการที่ยังไม่เปิด (Coming soon · {soon.length})</h2>
        <div className="flex flex-wrap gap-2">
          {soon.map((e) => (
            <span
              key={e.serviceKey}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-surface px-3 py-1.5 text-xs text-muted"
              title={`${e.serviceKey} · ${GROUP_LABEL[e.group]}`}
            >
              <span className="font-medium text-foreground/70">{e.nameTh}</span>
              <span className="rounded bg-border/60 px-1 text-[10px]">soon</span>
            </span>
          ))}
        </div>
        <p className="text-[11px] text-muted">
          เก็บไว้ในทะเบียนเดียวกัน (active=false) เพื่อให้หน้าเว็บ + dashboard ขับเคลื่อนจากตารางเดียว — เปิดใช้
          ภายหลังได้โดยไม่ต้องสร้างใหม่.
        </p>
      </section>

      <div className="pt-2">
        <Link href="/admin/settings" className="text-xs text-primary-600 underline">
          ← กลับหน้าตั้งค่าระบบ
        </Link>
      </div>
    </main>
  );
}

function ServiceRow({ entry, count }: { entry: ServiceCatalogEntry; count: number | null }) {
  return (
    <tr className="border-t border-border align-top hover:bg-surface/60">
      <td className="px-3 py-3">
        <p className="font-semibold text-foreground leading-tight">{entry.nameTh}</p>
        <p className="text-[11px] text-muted">
          {entry.nameEn} · <code className="text-primary-600">{entry.serviceKey}</code>
        </p>
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${GROUP_STYLE[entry.group]}`}>
          {GROUP_LABEL[entry.group]}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-foreground">
        {entry.transportModes.length > 0
          ? entry.transportModes.map((m) => MODE_LABEL[m]).join(" · ")
          : <span className="text-muted">—</span>}
      </td>
      <td className="px-3 py-3 text-xs">
        {entry.fclLcl === "na" ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="font-medium uppercase text-foreground">{entry.fclLcl}</span>
        )}
      </td>
      <td className="px-3 py-3 text-xs">
        {entry.direction === "na" ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="text-foreground">
            {entry.direction === "import" ? "นำเข้า" : entry.direction === "export" ? "ส่งออก" : "ทั้งสอง"}
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-xs">
        {entry.issuesTaxInvoiceDefault ? (
          <span className="text-emerald-700 dark:text-emerald-400">ออกได้</span>
        ) : (
          <span className="text-muted">ไม่ออก</span>
        )}
      </td>
      <td className="px-3 py-3 text-xs text-foreground">{ACCOUNT_LABEL[entry.defaultAccount]}</td>
      <td className="px-3 py-3 text-right">
        {count == null ? (
          <span className="text-[11px] text-amber-600" title="อ่านจำนวนไม่สำเร็จ (ตารางอาจยังไม่มีบนฐานข้อมูลนี้)">
            n/a
          </span>
        ) : (
          <span className="font-bold tabular-nums text-foreground">{count.toLocaleString("th-TH")}</span>
        )}
      </td>
    </tr>
  );
}
