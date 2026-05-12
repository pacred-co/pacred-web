import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

/** Accounting overview — separate ledgers for Cargo + Freight per
 * legacy structure (acc-cargo.php / acc-forwarder.php). Reads from
 * the unified wallet_transactions ledger but groups by the
 * payment kind to keep each book separate. */
export default async function AdminAccountingPage() {
  const admin = createAdminClient();

  const [cargoIn, cargoOut, freightIn, yuanIn] = await Promise.all([
    sum(admin, ["deposit", "order_payment", "order_top_up", "cashback_earn"]),
    sum(admin, ["withdraw", "refund", "cashback_redeem"]),
    sum(admin, ["import_payment", "import_top_up"]),
    sum(admin, ["yuan_payment"]),
  ]);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">💼 ระบบบัญชี</h1>
        <p className="mt-1 text-sm text-muted">บัญชีแยกตามสาย Cargo / Freight (เหมือน acc-cargo.php + acc-forwarder.php เดิม)</p>
      </div>

      <section className="grid lg:grid-cols-2 gap-4">
        <BookCard
          title="🛒 บัญชี Cargo (ฝากสั่งซื้อ + ฝากโอน)"
          inflow={cargoIn + yuanIn}
          outflow={cargoOut}
          links={[
            { href: "/admin/service-orders?status=completed", label: "ฝากสั่งที่สำเร็จ" },
            { href: "/admin/yuan-payments?status=completed",   label: "ฝากโอนหยวนที่สำเร็จ" },
            { href: "/admin/wallet?kind=deposit&status=completed", label: "เติมเงินที่อนุมัติแล้ว" },
            { href: "/admin/wallet?kind=withdraw&status=completed", label: "ถอนเงินที่จ่ายแล้ว" },
          ]}
        />
        <BookCard
          title="📦 บัญชี Freight (ฝากนำเข้า)"
          inflow={freightIn}
          outflow={0}
          links={[
            { href: "/admin/forwarders?status=delivered", label: "ฝากนำเข้าที่ส่งมอบแล้ว" },
            { href: "/admin/containers", label: "ตู้ที่อยู่ในระบบ" },
          ]}
        />
      </section>

      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">
        รายงานบัญชีรายเดือน + งบกำไรขาดทุน (P&L) — ต้องการ Phase H+ (มี seed cost_total_price จาก admin)
      </div>
    </main>
  );
}

async function sum(admin: ReturnType<typeof createAdminClient>, kinds: string[]): Promise<number> {
  const { data } = await admin
    .from("wallet_transactions")
    .select("amount")
    .in("kind", kinds)
    .eq("status", "completed");
  if (!data) return 0;
  return (data as Array<{ amount: number }>).reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
}

function BookCard({ title, inflow, outflow, links }: {
  title: string; inflow: number; outflow: number;
  links: Array<{ href: string; label: string }>;
}) {
  const net = inflow - outflow;
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-lg">{title}</h3>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="รายรับ" value={inflow}  tone="green" />
        <Stat label="รายจ่าย" value={outflow} tone="red" />
        <Stat label="คงเหลือ" value={net}    tone="primary" />
      </div>
      <ul className="space-y-1 pt-2 border-t border-border">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-xs text-primary-500 hover:underline">→ {l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "green" | "red" | "primary" }) {
  const colors = {
    green:   "text-green-700",
    red:     "text-red-700",
    primary: "text-primary-700",
  }[tone];
  return (
    <div>
      <p className="text-[10px] text-muted">{label}</p>
      <p className={`font-mono font-bold ${colors}`}>฿{Math.abs(value).toLocaleString("th-TH", { minimumFractionDigits: 0 })}</p>
    </div>
  );
}
