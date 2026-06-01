import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";

/**
 * /admin/accounting/documents — PEAK-style documents lifecycle landing.
 *
 * Per `docs/briefs/poom-wave-2026-06-01.md` §3.1 — one hub page that threads
 * the full money-doc lifecycle:
 *
 *   ใบเสนอราคา  →  ใบแจ้งหนี้  →  ใบเสร็จ/ใบกำกับขาย  →  ใบลด/เพิ่มหนี้
 *
 * Only RECEIPT + TAX-INVOICE + INVOICE-ADJUSTMENT have real backends today
 * (per brief §3 table); the rest are HONESTLY bannered as Phase-C (don't
 * fake them — staff would walk away thinking ระบบมีแต่หน้า no data).
 *
 * Each card shows live count + sum for the current month from the
 * underlying tb_* family so accounting can spot anomalies at a glance.
 *
 * Roles per ADR-0006 §1.4: super | accounting (matches /receipts +
 * /tax-invoices gate).
 */

export const dynamic = "force-dynamic";

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type DocCardProps = {
  title:       string;
  desc:        string;
  href:        string;
  badge:       "live" | "comingSoon";
  stat?: {
    label:  string;
    count:  number;
    sum?:   number;
  };
};

export default async function AdminDocumentsLifecyclePage() {
  await requireAdmin(["super", "accounting"]);

  const admin = createAdminClient();

  // ── Current-month window for live stat counts ──
  const now = new Date();
  const ymStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const ymEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // ── Receipts current month — count + Σ ramount ──
  const { data: receiptRows, error: receiptErr } = await admin
    .from("tb_receipt")
    .select("ramount")
    .gte("issuedate", ymStart)
    .lte("issuedate", ymEnd)
    .eq("rstatus", "1");
  if (receiptErr) {
    console.error("[tb_receipt month] failed", { code: receiptErr.code, message: receiptErr.message });
  }
  const receipts = (receiptRows ?? []) as Array<{ ramount: number | string | null }>;
  const receiptCount = receipts.length;
  const receiptSum   = receipts.reduce((s, r) => s + Number(r.ramount ?? 0), 0);

  // ── Tax invoices current month — count + Σ total_thb (issued only) ──
  const { data: taxRows, error: taxErr } = await admin
    .from("tax_invoices")
    .select("total_thb")
    .gte("issued_at", ymStart)
    .lte("issued_at", ymEnd)
    .eq("status", "issued");
  if (taxErr) {
    console.error("[tax_invoices month] failed", { code: taxErr.code, message: taxErr.message });
  }
  const taxs = (taxRows ?? []) as Array<{ total_thb: number | string | null }>;
  const taxCount = taxs.length;
  const taxSum   = taxs.reduce((s, r) => s + Number(r.total_thb ?? 0), 0);

  // ── Combine-bill (tb_bill) current month — count ──
  const { count: billCount, error: billErr } = await admin
    .from("tb_bill")
    .select("id", { count: "exact", head: true });
  if (billErr) {
    console.error("[tb_bill count] failed", { code: billErr.code, message: billErr.message });
  }

  // ── Pending tax-invoice queue (any month) ──
  const { count: pendingTaxCount, error: pendingErr } = await admin
    .from("tax_invoices")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (pendingErr) {
    console.error("[tax_invoices pending] failed", { code: pendingErr.code, message: pendingErr.message });
  }

  const monthLabel = now.toLocaleDateString("th-TH", { year: "numeric", month: "long" });

  // Build the lifecycle stages (left → right).
  const stages: DocCardProps[] = [
    {
      title: "ใบเสนอราคา",
      desc:  "Quote → ลูกค้ายืนยัน",
      href:  "/admin/accounting/cargo/income/quotation/shop",
      badge: "comingSoon",
    },
    {
      title: "ใบแจ้งหนี้",
      desc:  "Invoice → ลูกค้ารับรู้หนี้",
      href:  "/admin/accounting/cargo/income/invoice/shop",
      badge: "comingSoon",
    },
    {
      title: "ใบเสร็จรับเงิน",
      desc:  "Receipt · ออกเมื่อรับเงิน",
      href:  "/admin/accounting/receipts",
      badge: "live",
      stat: {
        label: monthLabel,
        count: receiptCount,
        sum:   receiptSum,
      },
    },
    {
      title: "ใบกำกับภาษีขาย",
      desc:  "Tax Invoice · RD Code 86",
      href:  "/admin/tax-invoices",
      badge: "live",
      stat: {
        label: monthLabel,
        count: taxCount,
        sum:   taxSum,
      },
    },
    {
      title: "ใบลดหนี้ · ใบเพิ่มหนี้",
      desc:  "Credit/Debit Note",
      href:  "/admin/accounting/cargo/income/credit-note/shop",
      badge: "comingSoon",
    },
  ];

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/documents" />
      <main className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · เอกสาร</p>
          <h1 className="mt-1 text-2xl font-bold">เอกสารบัญชี (Lifecycle)</h1>
          <p className="text-xs text-muted mt-1">
            แผน flow ออกเอกสารบัญชีของ Pacred · ดูตามเส้นทาง quote → invoice → receipt → tax-invoice → credit/debit note
          </p>
          <p className="text-[10px] text-muted mt-1">
            📊 ใบเสร็จ + ใบกำกับ + ใบลดหนี้ มี backend จริง (live) · ใบเสนอราคา + ใบแจ้งหนี้ banner เป็น Phase-C (อย่าหลอกตัวเอง)
          </p>
        </header>

        {/* Headline summary */}
        <section className="grid sm:grid-cols-4 gap-3">
          <Stat label={`ใบเสร็จเดือนนี้ (${monthLabel})`} value={receiptCount.toLocaleString("th-TH")} sub={thb(receiptSum)} />
          <Stat label={`ใบกำกับขายเดือนนี้`} value={taxCount.toLocaleString("th-TH")} sub={thb(taxSum)} />
          <Stat label="ใบกำกับรออนุมัติ" value={(pendingTaxCount ?? 0).toLocaleString("th-TH")} sub="คิวงาน accounting" />
          <Stat label="ใบรวมบิล (Combine Bill)" value={(billCount ?? 0).toLocaleString("th-TH")} sub="tb_bill total" />
        </section>

        {/* Lifecycle chain */}
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-bold text-sm">🧾 Lifecycle ของเอกสารบัญชี</h2>
            <p className="text-[10px] text-muted">live = backend จริง · 🚧 = banner Phase-C</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 relative">
            {stages.map((s, idx) => (
              <DocCard key={s.title} {...s} arrow={idx < stages.length - 1} />
            ))}
          </div>
        </section>

        {/* Cross-link adjacent surfaces */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-3">🔗 หน้าที่เกี่ยวข้อง (live · click ทันที)</h2>
          <ul className="grid sm:grid-cols-2 gap-2 text-xs">
            <li>
              <Link href="/admin/accounting/receipts" className="text-primary-600 hover:underline">
                /admin/accounting/receipts
              </Link>
              <span className="text-muted ml-2">— PEAK 7-tab ใบเสร็จ explorer</span>
            </li>
            <li>
              <Link href="/admin/tax-invoices" className="text-primary-600 hover:underline">
                /admin/tax-invoices
              </Link>
              <span className="text-muted ml-2">— ใบกำกับขาย (RD-86)</span>
            </li>
            <li>
              <Link href="/admin/accounting/forwarder-invoice" className="text-primary-600 hover:underline">
                /admin/accounting/forwarder-invoice
              </Link>
              <span className="text-muted ml-2">— Wave-29 ใบเสร็จ ฝากนำเข้า (redirect → /receipts)</span>
            </li>
            <li>
              <Link href="/admin/accounting/closing" className="text-primary-600 hover:underline">
                /admin/accounting/closing
              </Link>
              <span className="text-muted ml-2">— ปิดงบรายเดือน + period close</span>
            </li>
            <li>
              <Link href="/admin/accounting/ar-aging" className="text-primary-600 hover:underline">
                /admin/accounting/ar-aging
              </Link>
              <span className="text-muted ml-2">— ลูกหนี้ค้างชำระ aging</span>
            </li>
            <li>
              <Link href="/admin/accounting/periods" className="text-primary-600 hover:underline">
                /admin/accounting/periods
              </Link>
              <span className="text-muted ml-2">— งวดบัญชี</span>
            </li>
          </ul>
        </section>

        <p className="text-[10px] text-muted">
          📌 Per brief §3 — PEAK module landed incrementally · §3.2 AR-aging (live) · §3.3 period-close + e-Tax + PEAK-export = next surfaces
        </p>
      </main>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-[10px] font-medium text-muted">{label}</p>
      <p className="mt-1 font-bold font-mono text-foreground text-xl">{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5 font-mono">{sub}</p>}
    </div>
  );
}

function DocCard({ title, desc, href, badge, stat, arrow }: DocCardProps & { arrow?: boolean }) {
  const isLive = badge === "live";
  return (
    <div className="relative">
      <Link
        href={href}
        className={`block rounded-2xl border p-4 h-full transition-colors ${
          isLive
            ? "border-primary-200 bg-white hover:bg-primary-50 dark:bg-surface"
            : "border-border bg-surface-alt/30 hover:bg-surface-alt/50 cursor-not-allowed opacity-75"
        }`}
        title={isLive ? "เปิดได้เลย" : "🚧 Phase-C · ยังไม่เปิดใช้งาน · click ไปยังหน้า stub"}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-bold text-sm">{title}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
              isLive
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
          >
            {isLive ? "live" : "🚧 Phase-C"}
          </span>
        </div>
        <p className="text-[11px] text-muted mb-3">{desc}</p>
        {stat ? (
          <div className="border-t border-border pt-2">
            <p className="text-[10px] text-muted">{stat.label}</p>
            <p className="mt-0.5 font-mono font-bold text-primary-700 text-lg">{stat.count.toLocaleString("th-TH")} ฉบับ</p>
            {stat.sum !== undefined && (
              <p className="text-[10px] text-muted font-mono">รวม {thb(stat.sum)}</p>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-muted italic mt-3">backend ยังไม่พร้อม</p>
        )}
      </Link>
      {arrow && (
        <span className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 text-primary-300 text-xl font-mono z-10">
          →
        </span>
      )}
    </div>
  );
}
