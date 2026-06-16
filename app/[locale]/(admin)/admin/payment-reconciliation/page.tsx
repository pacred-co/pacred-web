import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  listPendingReconciliations,
  type PendingReconciliationItem,
} from "@/actions/admin/payment-reconciliation";
import { ReconciliationRow } from "./reconciliation-row";

/**
 * /admin/payment-reconciliation — V-A3 Phase 2 slip ↔ order reconciliation.
 *
 * Companion to /admin/accounting/reconcile (forwarder status auto-clear,
 * ภูม Phase G). This page works the OTHER side: takes completed deposit
 * wallet_tx rows that haven't been cross-linked yet and suggests which
 * pending_payment forwarders they should clear (or lets admin mark as
 * "no match → refund queue"). See actions/admin/payment-reconciliation.ts
 * for the legacy reference (forwarder.php:1431 + forwarder-action.php:185).
 *
 * RBAC: super OR accounting (action-level checks enforced; page-level
 * gate here is the broader admin role + action throws if non-accounting).
 */

const DAYS_BACK = 90;

export default async function PaymentReconciliationPage() {
  await requireAdmin(["accounting"]);

  const res = await listPendingReconciliations({ days_back: DAYS_BACK });
  if (!res.ok) {
    return (
      <main className="p-6 lg:p-8 max-w-6xl">
        <p className="text-sm text-red-700">โหลดรายการล้มเหลว: {res.error}</p>
      </main>
    );
  }
  const { items, total } = res.data ?? { items: [], total: 0 };

  // Bucket the items for the admin's eyeball — exact matches go top
  // (one-click safe), ambiguous matches in middle, no-match at bottom.
  const exactCandidates: PendingReconciliationItem[] = [];
  const ambiguous:       PendingReconciliationItem[] = [];
  const noMatch:         PendingReconciliationItem[] = [];
  for (const item of items) {
    if (item.candidates.length === 0) {
      noMatch.push(item);
    } else if (item.candidates[0]?.is_exact && item.candidates.length === 1) {
      exactCandidates.push(item);
    } else {
      ambiguous.push(item);
    }
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      {/* 2026-06-15 (§0e dead-twin sweep) — listPendingReconciliations reads
          the rebuilt `wallet_transactions` + `forwarders` twins (0-row on
          prod), NOT live `tb_wallet_hs` / `tb_forwarder`. The slip↔order
          match queue is therefore structurally empty = a false "all matched".
          Bannered so staff don't trust it. Repoint (read → tb_*) needs a
          careful column remap + prod verification — not done here. */}
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 space-y-1">
        <p className="font-bold">⚠️ หน้านี้ยังไม่ได้เชื่อมข้อมูลกับระบบจริง</p>
        <p>
          ดึงข้อมูลจากตาราง <code className="font-mono bg-white/60 px-1.5 py-0.5 rounded">wallet_transactions</code>{" "}
          / <code className="font-mono bg-white/60 px-1.5 py-0.5 rounded">forwarders</code>{" "}
          (ว่างบน prod) — ตารางจริงคือ{" "}
          <code className="font-mono bg-white/60 px-1.5 py-0.5 rounded">tb_wallet_hs</code>{" "}
          / <code className="font-mono bg-white/60 px-1.5 py-0.5 rounded">tb_forwarder</code>.
          ตัวเลข<strong>ยังไม่ครบ</strong> — <strong>อย่าใช้ยืนยันการจับคู่สลิป</strong>.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · บัญชี</p>
        <h1 className="mt-1 text-2xl font-bold">Slip ↔ Order Reconciliation</h1>
        <p className="mt-1 text-sm text-muted">
          สลิปเงินที่อนุมัติแล้วแต่ยังไม่ได้จับคู่กับใบฝากนำเข้า (90 วันล่าสุด). ระบบเสนอผู้สมัครที่ตรงตามยอด ±2 บาท · admin สามารถจับคู่แบบ manual หรือ mark เป็นไม่จับคู่ (เข้าคิว refund).
        </p>
        <div className="mt-2 flex gap-2 text-xs">
          <Link href="/admin/accounting" className="text-primary-500 hover:underline">← กลับบัญชี</Link>
          <span className="text-muted">·</span>
          <Link href="/admin/accounting/reconcile" className="text-primary-500 hover:underline">
            → forwarder status reconcile (ภูม Phase G)
          </Link>
          <span className="text-muted">·</span>
          <Link href="/admin/refunds" className="text-primary-500 hover:underline">→ refund queue</Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card label="🟢 จับคู่ตรง (auto-safe)" count={exactCandidates.length} tone="green"
          hint="ยอดตรง 1 ใบ — กดจับคู่ปลอดภัย" />
        <Card label="🟡 หลายผู้สมัคร / ยอดไม่ตรง" count={ambiguous.length} tone="amber"
          hint="ตรวจมือก่อนเลือกใบ" />
        <Card label="🔴 ไม่พบใบที่จับคู่ได้" count={noMatch.length} tone="red"
          hint="ลูกค้าไม่มี pending_payment — refund หรือเก็บไว้ใช้?" />
      </div>

      <p className="text-[11px] text-muted">รวม {total} รายการในช่วง {DAYS_BACK} วัน</p>

      <Section title="🟢 จับคู่ตรง — กดได้ทันที">
        {exactCandidates.length === 0 ? <Empty msg="ไม่มีรายการ — บัญชีตรงทุกใบ" /> :
          <RowList items={exactCandidates} />
        }
      </Section>

      <Section title="🟡 ตรวจมือก่อน — หลายผู้สมัคร / ยอดไม่ตรง">
        {ambiguous.length === 0 ? <Empty msg="ไม่มีรายการกำกวม" /> :
          <RowList items={ambiguous} />
        }
      </Section>

      <Section title="🔴 ไม่พบใบที่จับคู่ได้ — mark เป็น unmatched">
        {noMatch.length === 0 ? <Empty msg="ไม่มี slip ที่ไม่จับคู่" /> :
          <RowList items={noMatch} />
        }
      </Section>
    </main>
  );
}

function Card({ label, count, tone, hint }: { label: string; count: number; tone: "green" | "amber" | "red"; hint: string }) {
  const colour = tone === "red"   ? "border-red-200 bg-red-50"
              : tone === "amber" ? "border-amber-200 bg-amber-50"
              :                     "border-green-200 bg-green-50";
  const text   = tone === "red"   ? "text-red-700"
              : tone === "amber" ? "text-amber-700"
              :                     "text-green-700";
  return (
    <div className={`rounded-2xl border ${colour} p-4`}>
      <p className="text-xs font-medium text-foreground/80">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${text}`}>{count}</p>
      <p className="mt-1 text-[11px] text-muted leading-snug">{hint}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-bold text-sm">{title}</h2>
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="p-6 text-center text-xs text-muted">{msg}</p>;
}

function RowList({ items }: { items: PendingReconciliationItem[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.wallet_tx.id} className="px-4 py-3">
          <ReconciliationRow item={item} />
        </li>
      ))}
    </ul>
  );
}
