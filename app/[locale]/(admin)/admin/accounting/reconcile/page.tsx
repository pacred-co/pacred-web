import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ReconcileRow } from "./reconcile-row";

/**
 * /admin/accounting/reconcile — V-A3 payment ↔ order reconciliation.
 *
 * Per Part V V-A3 + cargo forensics: every "เครดิตค้างนำเข้า" today is a
 * dev escalation. Surfaces 3 mismatch buckets so accounting can self-serve:
 *
 *   🟡 BUCKET A — pending_payment WITH completed wallet_tx
 *      → safe one-click auto-clear (flip to shipped_china)
 *
 *   🔴 BUCKET B — paid status WITHOUT wallet_tx (revenue leak signal)
 *      → flag for investigation (no wallet debit happened)
 *
 *   🟡 BUCKET C — orphaned wallet_tx (forwarder cancelled or missing)
 *      → flag for refund/audit
 *
 * Defaults to last 90 days created_at to keep page snappy.
 *
 * RBAC: super OR accounting (money-state). Layout-level requireAdmin
 * already gates; sidebar nav additionally restricts the link.
 */

const DAYS_BACK = 90;

const STATUS_LABEL: Record<string, string> = {
  pending_payment:  "รอชำระ",
  shipped_china:    "ออกจีน",
  in_transit:       "กลางทาง",
  arrived_thailand: "ถึงไทย",
  out_for_delivery: "จัดส่ง",
  delivered:        "สำเร็จ",
  cancelled:        "ยกเลิก",
};

type Forwarder = {
  id:          string;
  f_no:        string;
  profile_id:  string;
  status:      string;
  total_price: number;
  created_at:  string;
  profile:     { member_code: string | null; first_name: string | null; last_name: string | null } | null;
};
type WalletTx = {
  id:             string;
  reference_id:   string;
  amount:         number;
  status:         string;
  created_at:     string;
};

type Bucket = "A" | "B" | "C";
type ReconcileItem = {
  bucket:        Bucket;
  forwarder:     Forwarder | null;
  wallet_tx:     WalletTx | null;
  amount_diff:   number;
  hint:          string;
};

export default async function ReconcilePage() {
  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60_000).toISOString();

  // 1. All recent forwarders (window: 90d)
  const { data: forwardersRaw } = await admin
    .from("forwarders")
    .select(`
      id, f_no, profile_id, status, total_price, created_at,
      profile:profiles!profile_id ( member_code, first_name, last_name )
    `)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(2000);
  type RawForwarder = Omit<Forwarder, "profile"> & { profile: Forwarder["profile"] | Forwarder["profile"][] | null };
  const forwarders: Forwarder[] = ((forwardersRaw ?? []) as RawForwarder[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  // 2. All completed import_payment wallet_tx (window: 90d)
  const { data: txs } = await admin
    .from("wallet_transactions")
    .select("id, reference_id, amount, status, created_at")
    .eq("reference_type", "forwarder")
    .eq("kind",           "import_payment")
    .eq("status",         "completed")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(2000)
    .returns<WalletTx[]>();

  // Index wallet_tx by f_no for O(1) join
  const txByFno = new Map<string, WalletTx>();
  for (const tx of (txs ?? [])) {
    if (tx.reference_id && !txByFno.has(tx.reference_id)) txByFno.set(tx.reference_id, tx);
  }
  // Index forwarders by f_no
  const fwdByFno = new Map<string, Forwarder>();
  for (const f of forwarders) fwdByFno.set(f.f_no, f);

  // ── Bucket A: pending_payment + completed tx ──
  const bucketA: ReconcileItem[] = [];
  // ── Bucket B: paid status (any non-pending non-cancelled) + NO completed tx ──
  const bucketB: ReconcileItem[] = [];
  for (const f of forwarders) {
    const tx = txByFno.get(f.f_no);
    if (f.status === "pending_payment" && tx) {
      const expectedDebit = -Number(f.total_price);
      const diff = Number(tx.amount) - expectedDebit;
      bucketA.push({
        bucket: "A",
        forwarder: f,
        wallet_tx: tx,
        amount_diff: diff,
        hint: Math.abs(diff) > 0.01
          ? `wallet_tx ฿${Math.abs(Number(tx.amount)).toFixed(2)} ≠ ยอด ฿${Number(f.total_price).toFixed(2)} — ตรวจมือก่อน auto-clear`
          : "ยอดตรง — auto-clear ได้ปลอดภัย",
      });
    }
    if (
      f.status !== "pending_payment" &&
      f.status !== "cancelled" &&
      !tx
    ) {
      bucketB.push({
        bucket: "B",
        forwarder: f,
        wallet_tx: null,
        amount_diff: 0,
        hint: `สถานะ ${STATUS_LABEL[f.status] ?? f.status} แต่ไม่มี wallet_tx completed — ลูกค้าอาจชำระนอกระบบ หรือไม่ได้ชำระจริง (revenue leak signal)`,
      });
    }
  }

  // ── Bucket C: wallet_tx with no matching forwarder (or forwarder cancelled) ──
  const bucketC: ReconcileItem[] = [];
  for (const tx of (txs ?? [])) {
    const f = fwdByFno.get(tx.reference_id);
    if (!f) {
      // Outside the window OR truly orphaned. Try a direct lookup to avoid false positive.
      const { data: anyF } = await admin
        .from("forwarders")
        .select("id, f_no, profile_id, status, total_price, created_at, profile:profiles!profile_id(member_code, first_name, last_name)")
        .eq("f_no", tx.reference_id)
        .maybeSingle<Forwarder>();
      if (!anyF) {
        bucketC.push({
          bucket: "C",
          forwarder: null,
          wallet_tx: tx,
          amount_diff: 0,
          hint: `wallet_tx อ้างอิง f_no=${tx.reference_id} แต่ไม่พบ forwarder ในระบบ — orphaned (อาจถูกลบ)`,
        });
      } else if (anyF.status === "cancelled") {
        bucketC.push({
          bucket: "C",
          forwarder: anyF,
          wallet_tx: tx,
          amount_diff: 0,
          hint: `forwarder ${anyF.f_no} ยกเลิกแล้ว แต่ wallet_tx ฿${Math.abs(Number(tx.amount)).toFixed(2)} ยังหัก — refund ลูกค้าหรือยัง?`,
        });
      }
    } else if (f.status === "cancelled") {
      bucketC.push({
        bucket: "C",
        forwarder: f,
        wallet_tx: tx,
        amount_diff: 0,
        hint: `forwarder ${f.f_no} ยกเลิกแล้ว แต่ wallet_tx ฿${Math.abs(Number(tx.amount)).toFixed(2)} ยังหัก — refund หรือยัง?`,
      });
    }
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · บัญชี</p>
        <h1 className="mt-1 text-2xl font-bold">Payment ↔ Order Reconciliation</h1>
        <p className="mt-1 text-sm text-muted">
          เช็คความตรงระหว่าง forwarder status กับ wallet_tx (90 วันล่าสุด).
          ตรงไหนค้าง / ตรงไหนตก / ตรงไหน orphan → ดูได้ที่นี่ + แก้ตามคำแนะนำ.
        </p>
        <div className="mt-2 flex gap-2 text-xs">
          <Link href="/admin/accounting" className="text-primary-500 hover:underline">← กลับบัญชี</Link>
          <span className="text-muted">·</span>
          <Link href="/admin/wallet" className="text-primary-500 hover:underline">→ wallet ledger</Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card label="🟡 BUCKET A · ค้างปรับสถานะ" count={bucketA.length} tone="amber"
          hint="pending_payment + completed wallet_tx · auto-clear ได้" />
        <Card label="🔴 BUCKET B · revenue leak?" count={bucketB.length} tone="red"
          hint="paid status + ไม่มี wallet_tx · ลูกค้าอาจไม่ได้ชำระ" />
        <Card label="🟡 BUCKET C · orphaned tx" count={bucketC.length} tone="amber"
          hint="wallet_tx + forwarder ถูกลบ/ยกเลิก · refund?" />
      </div>

      {/* BUCKET A — auto-clear actionable */}
      <Section title="🟡 BUCKET A — pending_payment + completed wallet_tx">
        {bucketA.length === 0 ? <Empty msg="ไม่มีรายการ — ดี ทุก forwarder ที่จ่ายแล้วอัพเดทสถานะตรง" /> :
          <RowList items={bucketA} canAutoClear />
        }
      </Section>

      {/* BUCKET B — flag for investigation */}
      <Section title="🔴 BUCKET B — paid status without wallet_tx (revenue leak signal)">
        {bucketB.length === 0 ? <Empty msg="ไม่มีรายการ — ดี ทุก forwarder paid มี wallet_tx ตรง" /> :
          <RowList items={bucketB} />
        }
      </Section>

      {/* BUCKET C — orphan tx */}
      <Section title="🟡 BUCKET C — orphan wallet_tx (forwarder cancelled or missing)">
        {bucketC.length === 0 ? <Empty msg="ไม่มี wallet_tx ที่ลอยอยู่" /> :
          <RowList items={bucketC} />
        }
      </Section>
    </main>
  );
}

function Card({ label, count, tone, hint }: { label: string; count: number; tone: "amber" | "red"; hint: string }) {
  const colour = tone === "red" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50";
  return (
    <div className={`rounded-2xl border ${colour} p-4`}>
      <p className="text-xs font-medium text-foreground/80">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone === "red" ? "text-red-700" : "text-amber-700"}`}>
        {count}
      </p>
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

function RowList({ items, canAutoClear }: { items: ReconcileItem[]; canAutoClear?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item, idx) => (
        <li key={`${item.bucket}-${idx}`} className="px-4 py-3">
          <ReconcileRow item={item} canAutoClear={!!canAutoClear} />
        </li>
      ))}
    </ul>
  );
}
