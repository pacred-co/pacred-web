import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { loadServiceDashboard, type ServiceDashboardRow } from "@/lib/admin/service-dashboard";
import type { ServiceGroup } from "@/lib/services/service-catalog";
import {
  ShoppingBasket, ArrowLeftRight, Box, Ship, FileCheck, FileText, Truck,
  Layers, Boxes, Container as ContainerIcon, TrendingUp, AlertTriangle, ArrowRight,
} from "lucide-react";

/**
 * 🧭 Cross-platform SERVICE cockpit (/admin/dashboard/services) — owner W2
 * "ทำ dashboard ให้หมด" (2026-06-30). The scaling cockpit: every order is now
 * tagged with a service_key (mig 0232 + backfill), so the whole platform pivots
 * BY SERVICE here — per-service volume + status + money, a คาร์โก้/เฟรท/บริการ
 * group rollup, and a 3-account money strip.
 *
 * READ-ONLY (lib/admin/service-dashboard.ts is SELECT-only). Drills into each
 * service's EXISTING list page (≤3-click · §0d). Self-explaining cards (§0g) ·
 * ≥11px readable hierarchy (§0h). Gated to office roles that may see company-wide
 * revenue (NOT floor-ops driver/warehouse).
 *
 * Refreshes live on every visit (`force-dynamic`) — no migration, no SQL view.
 */

export const dynamic = "force-dynamic";

// per-service accent icon (visual identity for the card header).
const SERVICE_ICON: Record<string, React.ReactNode> = {
  shop_order: <ShoppingBasket className="h-5 w-5" />,
  yuan_transfer: <ArrowLeftRight className="h-5 w-5" />,
  import_cargo: <Box className="h-5 w-5" />,
  freight_import: <Ship className="h-5 w-5" />,
  freight_export: <Ship className="h-5 w-5" />,
  customs_clearance: <FileCheck className="h-5 w-5" />,
  tax_documents: <FileText className="h-5 w-5" />,
  domestic_logistics: <Truck className="h-5 w-5" />,
};
const GROUP_ICON: Record<ServiceGroup, React.ReactNode> = {
  cargo: <Boxes className="h-4 w-4" />,
  freight: <Ship className="h-4 w-4" />,
  service: <Layers className="h-4 w-4" />,
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function int(n: number): string {
  return n.toLocaleString("th-TH");
}

export default async function ServiceDashboardPage() {
  // company-wide selling + cost shown → office roles only (mirrors /admin/kpi).
  await requireAdmin(["super", "ultra", "accounting", "manager"]);

  const data = await loadServiceDashboard();
  const liveRows = data.rows.filter((r) => r.entry.isLive);
  const soonRows = data.rows.filter((r) => !r.entry.isLive);

  return (
    <main className="p-4 lg:p-6 space-y-6">
      <PageHeader
        eyebrow="ADMIN · DASHBOARD"
        title="แดชบอร์ดทุกบริการ"
        subtitle={`ภาพรวมทั้งแพลตฟอร์ม แยกตามบริการ · ออเดอร์ · สถานะ · กำลังขนส่ง · รายได้ · ${data.monthLabelTh}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/kpi" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
              KPI ภาพรวม →
            </Link>
            <Link href="/admin" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
              ← กลับภาพรวม
            </Link>
          </div>
        }
      />

      {data.hadError ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>บางบริการดึงข้อมูลไม่ครบ — ตัวเลขด้านล่างอาจเป็นค่าบางส่วน (ดู log เซิร์ฟเวอร์)</span>
        </div>
      ) : null}

      {/* ── platform totals ── */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <BigStat tone="primary" icon={<Boxes className="h-5 w-5" />} label="ออเดอร์ทั้งหมด" value={int(data.totals.orderCount)} sub={`เดือนนี้ ${int(data.totals.monthCount)}`} />
        <BigStat tone="info" icon={<ContainerIcon className="h-5 w-5" />} label="กำลังขนส่ง / ดำเนินการ" value={int(data.totals.inTransitCount)} sub="ทุกบริการรวมกัน" />
        <BigStat tone="danger" icon={<TrendingUp className="h-5 w-5" />} label="รายได้รวม (selling)" value={thb(data.totals.sellingThb)} sub="ทุกบริการที่วัดมูลค่าได้" />
        <BigStat tone="success" icon={<Box className="h-5 w-5" />} label="ต้นทุนรวม (cost)" value={thb(data.totals.costThb)} sub={`กำไรขั้นต้น ${thb(data.totals.sellingThb - data.totals.costThb)}`} />
      </section>

      {/* ── คาร์โก้ / เฟรท / บริการ group rollup ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-foreground">สรุปตามกลุ่มบริการ</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {data.groups.map((g) => (
            <div key={g.group} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted">
                <span className="text-primary-600">{GROUP_ICON[g.group]}</span>
                <span className="text-xs font-semibold">{g.label}</span>
              </div>
              <p className="mt-2 text-xl font-bold font-mono text-foreground">{int(g.orderCount)} <span className="text-sm font-normal text-muted">ออเดอร์</span></p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                <span>เดือนนี้ {int(g.monthCount)}</span>
                <span>กำลังขนส่ง {int(g.inTransitCount)}</span>
                <span className="font-semibold text-foreground">รายได้ {thb(g.sellingThb)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3-account money strip ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-foreground">รายได้ตามบัญชีรับเงิน</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {data.accounts.map((a) => (
            <div key={a.account} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
              <p className="text-xs font-semibold text-muted">{a.label}</p>
              <p className="mt-1.5 text-lg font-bold font-mono text-foreground">{thb(a.sellingThb)}</p>
              <p className="mt-0.5 text-[11px] text-muted">{int(a.serviceCount)} บริการที่มีออเดอร์</p>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          * แยกตามบัญชีเริ่มต้นของแต่ละบริการ — ออเดอร์ที่ขอใบกำกับจะถูกบันทึกเข้าบัญชีเทรดดิ้งจริงในระบบบัญชี (ดู lib/payment/bank-accounts.ts)
        </p>
      </section>

      {/* ── per-service cards (live) ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-foreground">บริการที่เปิดให้บริการ</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {liveRows.map((row) => (
            <ServiceCard key={row.serviceKey} row={row} />
          ))}
        </div>
      </section>

      {/* ── empty / coming-soon frontier ── */}
      {soonRows.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-bold text-foreground">บริการที่พร้อมเปิด (ยังไม่มีออเดอร์)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {soonRows.map((row) => (
              <div key={row.serviceKey} className="rounded-2xl border border-dashed border-border bg-surface-alt/30 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-muted">{SERVICE_ICON[row.serviceKey] ?? <Layers className="h-5 w-5" />}</span>
                  <span className="text-sm font-semibold text-foreground">{row.entry.nameTh}</span>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">ยังไม่มีออเดอร์ · พร้อมเปิดบริการ</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-[11px] text-muted">
        ตัวเลขดึงสดจากฐานข้อมูล (tb_* / freight_*) ทุกครั้งที่เปิดหน้านี้ · แยกตาม service_key (mig 0232)
      </p>
    </main>
  );
}

// ── components ───────────────────────────────────────────────────────────────

function BigStat({
  tone, icon, label, value, sub,
}: {
  tone: "danger" | "info" | "success" | "primary";
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  const tones = {
    danger: "text-red-600",
    info: "text-cyan-600",
    success: "text-emerald-600",
    primary: "text-fuchsia-600",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-2xl sm:text-3xl font-bold font-mono leading-none ${tones}`}>{value}</p>
          <p className="mt-2 text-xs font-semibold text-foreground line-clamp-2">{label}</p>
          <p className="mt-1 text-[11px] text-muted">{sub}</p>
        </div>
        <div className={`shrink-0 opacity-80 ${tones}`}>{icon}</div>
      </div>
    </div>
  );
}

/** the self-explaining per-service card (§0g): identity · volume · status pills · money · drill. */
function ServiceCard({ row }: { row: ServiceDashboardRow }) {
  const { entry, money } = row;
  const groupChip = {
    cargo: "bg-amber-100 text-amber-800 border-amber-300",
    freight: "bg-sky-100 text-sky-800 border-sky-300",
    service: "bg-violet-100 text-violet-800 border-violet-300",
  }[entry.group];
  const groupLabel = { cargo: "คาร์โก้", freight: "เฟรท", service: "บริการ" }[entry.group];

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      {/* header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 text-primary-600 shrink-0">{SERVICE_ICON[row.serviceKey] ?? <Layers className="h-5 w-5" />}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground leading-tight">{entry.nameTh}</h3>
            <p className="text-[11px] text-muted truncate">{entry.nameEn}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${groupChip}`}>{groupLabel}</span>
      </div>

      {/* volume row */}
      <div className="mt-3 grid grid-cols-3 divide-x divide-border border-y border-border bg-surface-alt/30">
        <Metric label="ออเดอร์" value={int(row.orderCount)} />
        <Metric label="เดือนนี้" value={int(row.monthCount)} />
        <Metric label="กำลังขนส่ง" value={int(row.inTransitCount)} tone={row.inTransitCount > 0 ? "live" : undefined} />
      </div>

      {/* status pills */}
      <div className="px-4 py-3 grow">
        {row.statuses.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {row.statuses.map((s) => (
              <span key={s.code} className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2 py-0.5 text-[11px] text-foreground">
                {s.label}
                <span className="font-mono font-semibold">{int(s.count)}</span>
              </span>
            ))}
          </div>
        ) : row.isEmpty ? (
          <p className="text-[12px] text-muted">ยังไม่มีออเดอร์ · พร้อมเปิดบริการ</p>
        ) : (
          <p className="text-[12px] text-muted">— ไม่มีสถานะแยกย่อย</p>
        )}
      </div>

      {/* money */}
      {money.hasMoney ? (
        <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          <span className="text-muted">รายได้ <span className="font-mono font-semibold text-foreground">{thb(money.sellingThb)}</span></span>
          {money.costThb > 0 ? (
            <span className="text-muted">ต้นทุน <span className="font-mono font-semibold text-foreground">{thb(money.costThb)}</span></span>
          ) : null}
          {money.marginThb !== null ? (
            <span className="text-muted">กำไร <span className={`font-mono font-semibold ${money.marginThb >= 0 ? "text-emerald-600" : "text-red-600"}`}>{thb(money.marginThb)}</span></span>
          ) : null}
          {money.declaredThb !== null ? (
            <span className="text-muted">มูลค่าสำแดง <span className="font-mono font-semibold text-foreground">{thb(money.declaredThb)}</span></span>
          ) : null}
        </div>
      ) : null}

      {/* drill */}
      {row.drillHref ? (
        <Link
          href={row.drillHref}
          className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[12px] font-semibold text-primary-600 hover:bg-surface-alt/40"
        >
          <span>เปิดรายการ {entry.nameTh}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "live" }) {
  return (
    <div className="px-2 py-2 text-center">
      <p className={`text-lg font-bold font-mono leading-none ${tone === "live" ? "text-cyan-600" : "text-foreground"}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted">{label}</p>
    </div>
  );
}
