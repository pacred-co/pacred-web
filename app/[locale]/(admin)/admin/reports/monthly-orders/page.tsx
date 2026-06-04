/**
 * /admin/reports/monthly-orders — single-month order report (faithful-port).
 *
 * Wave 20 P0-4 (2026-05-26) — swap all data sources from the rebuilt-app
 * tables (`forwarders` / `service_orders` / `yuan_payments` — EMPTY on
 * prod) to the legacy `tb_*` tables where the 8,898-customer data import
 * lives. Same single-month picker + same 2-pane layout + same CSV export;
 * only the SQL changes. Mirrors the Wave 20 P0-2 accounting hub rewrite
 * at commit `1a1b8d7`.
 *
 * Field map (rebuilt → legacy):
 *   forwarders.total_price             → tb_forwarder.ftotalprice
 *   forwarders.f_no                    → tb_forwarder.id (formatted as string)
 *   forwarders.status enum             → tb_forwarder.fstatus '1'..'7'
 *                                        (filter fstatus='7' for "delivered")
 *   forwarders.transport_type          → tb_forwarder.ftransporttype '1'/'2'/'3'
 *   forwarders.created_at              → tb_forwarder.fdate
 *   service_orders.total_thb           → tb_header_order.hcostallth
 *   service_orders.h_no                → tb_header_order.hno
 *   service_orders.item_count          → tb_header_order.hcount
 *   service_orders.status enum         → tb_header_order.hstatus '1'..'6'
 *   service_orders.created_at          → tb_header_order.hdate
 *   yuan_payments.thb_amount           → tb_payment.paythb (new "yuan" pane)
 *   yuan_payments.status='completed'   → tb_payment.paystatus='2' (filter)
 *   yuan_payments.created_at           → tb_payment.paydate
 *   profiles join                      → tb_users batch lookup by userid
 *
 * Customer name: 2-pass tb_users lookup (rebuilt profiles is empty for
 * migrated customers); mirrors the Wave 3 P0 #1 pattern in
 * `/admin/forwarders/page.tsx`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";
import {
  legacyOrderStatusThai,
  legacyForwarderStatusThai,
} from "@/lib/legacy-status-map";

export const dynamic = "force-dynamic";

// D1 Phase-B Wave-B5 (sidebar fidelity): the sidebar routes 3 distinct SLA
// queues here — รายการยกเลิก · สั่งซื้อรอเกิน 10 นาที · สั่งซื้อรอร้านจีนส่งเกิน 2 วัน.
// We surface the active ?sla= as a chip + banner so staff see the URL state
// honoured; the underlying query is NOT yet filtered — we don't have access
// to the legacy PHP threshold semantics (created_at vs queue_entered_at,
// etc.) and picking wrong SQL would misreport numbers worse than the
// current undifferentiated view. When the legacy thresholds are decoded,
// add real WHERE clauses + status filters per key.
const SLA_CFG: Record<string, string> = {
  "cancelled":       "รายการยกเลิกออเดอร์",
  "pending-10min":   "สั่งซื้อรอเกิน 10 นาที",
  "chn-dispatch-2d": "สั่งซื้อรอร้านจีนส่งเกิน 2 วัน",
};

// tb_forwarder.ftransporttype labels.
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "รถ", "2": "เรือ", "3": "เครื่องบิน",
};

// tb_payment.paytype labels.
const PAYTYPE_LABEL: Record<string, string> = {
  "1": "เว็บจีน", "2": "Alipay", "3": "อื่นๆ",
};

type LegacyUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
};

type FRow = {
  id: number;
  f_no: string;
  status: string;          // fstatus '1'..'7'
  total_price: number;
  transport_type: string;  // ftransporttype '1'/'2'/'3'
  created_at: string;
  userid: string;
  user: LegacyUser | null;
};
type SRow = {
  id: number;
  h_no: string;
  status: string;          // hstatus '1'..'6'
  total_thb: number;
  item_count: number;
  created_at: string;
  userid: string;
  user: LegacyUser | null;
};
type YRow = {
  id: number;
  paytype: string | null;
  yuan_amount: number;
  thb_amount: number;
  status: string;          // paystatus '1'/'2'/'3'
  created_at: string;
  userid: string;
  user: LegacyUser | null;
};

function userDisplayName(u: LegacyUser | null): string {
  if (!u) return "—";
  return [u.userName, u.userLastName].filter(Boolean).join(" ") || "—";
}
function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function monthBounds(monthStr: string): { from: string; to: string; label: string } {
  // monthStr = "YYYY-MM"
  const [y, m] = monthStr.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const to   = new Date(Date.UTC(y, m, 1)).toISOString();
  const label = `${m.toString().padStart(2, "0")}/${y}`;
  return { from, to, label };
}

/**
 * Batch-load tb_users rows for the userid set across all 3 panes — one
 * round-trip vs N. Mirrors the Wave 3 P0 #1 pattern in
 * `/admin/forwarders/page.tsx`.
 */
async function fetchUsersByUserId(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, LegacyUser>> {
  const map = new Map<string, LegacyUser>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return map;
  const { data, error } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName")
    .in("userID", unique);
  if (error) {
    console.error(`[tb_users batch] failed`, { code: error.code, message: error.message });
    return map;
  }
  for (const u of (data ?? []) as LegacyUser[]) {
    map.set(u.userID, u);
  }
  return map;
}

export default async function MonthlyOrdersReport({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; sla?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting"]);
  const sp = await searchParams;
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = sp.month ?? defaultMonth;
  const { from, to, label } = monthBounds(month);
  const slaKey   = sp.sla && SLA_CFG[sp.sla] ? sp.sla : undefined;
  const slaLabel = slaKey ? SLA_CFG[slaKey] : undefined;

  const admin = createAdminClient();

  // ── 1) Parallel reads of all 3 channels for the selected month. ──
  const [fRes, sRes, yRes] = await Promise.all([
    admin
      .from("tb_forwarder")
      .select("id, fstatus, ftotalprice, ftransporttype, fdate, userid")
      .gte("fdate", from)
      .lt("fdate", to)
      .order("fdate", { ascending: false })
      .limit(2000),
    admin
      .from("tb_header_order")
      .select("id, hno, hstatus, hcostallth, hcount, hdate, userid")
      .gte("hdate", from)
      .lt("hdate", to)
      .order("hdate", { ascending: false })
      .limit(2000),
    admin
      .from("tb_payment")
      .select("id, paytype, payyuan, paythb, paystatus, paydate, userid")
      .gte("paydate", from)
      .lt("paydate", to)
      .order("paydate", { ascending: false })
      .limit(2000),
  ]);

  // AGENTS §0c: every Supabase read MUST surface its error rather than
  // silently null-fall. Throw on a load-bearing report read so Next renders
  // a real error boundary (vs an empty table that staff will misread as
  // "no orders this month").
  if (fRes.error) {
    console.error(`[tb_forwarder list] failed`, { code: fRes.error.code, message: fRes.error.message });
    throw new Error(`Failed to load tb_forwarder (${fRes.error.code ?? "unknown"}): ${fRes.error.message}`);
  }
  if (sRes.error) {
    console.error(`[tb_header_order list] failed`, { code: sRes.error.code, message: sRes.error.message });
    throw new Error(`Failed to load tb_header_order (${sRes.error.code ?? "unknown"}): ${sRes.error.message}`);
  }
  if (yRes.error) {
    console.error(`[tb_payment list] failed`, { code: yRes.error.code, message: yRes.error.message });
    throw new Error(`Failed to load tb_payment (${yRes.error.code ?? "unknown"}): ${yRes.error.message}`);
  }

  type FRaw = {
    id: number; fstatus: string; ftotalprice: number | null;
    ftransporttype: string; fdate: string | null; userid: string;
  };
  type SRaw = {
    id: number; hno: string; hstatus: string; hcostallth: number | null;
    hcount: number | null; hdate: string | null; userid: string;
  };
  type YRaw = {
    id: number; paytype: string | null; payyuan: number | null;
    paythb: number | null; paystatus: string; paydate: string | null; userid: string;
  };
  const fRaw = (fRes.data ?? []) as unknown as FRaw[];
  const sRaw = (sRes.data ?? []) as unknown as SRaw[];
  const yRaw = (yRes.data ?? []) as unknown as YRaw[];

  // ── 2) Batch-load tb_users across all 3 panes (one round-trip). ──
  const allUserIds = [
    ...fRaw.map((r) => r.userid),
    ...sRaw.map((r) => r.userid),
    ...yRaw.map((r) => r.userid),
  ];
  const userMap = await fetchUsersByUserId(admin, allUserIds);

  // ── 3) Merge into render rows. ──
  const forwarders: FRow[] = fRaw.map((r) => ({
    id: r.id,
    f_no: `${r.id}`,
    status: r.fstatus,
    total_price: Number(r.ftotalprice ?? 0),
    transport_type: r.ftransporttype,
    created_at: r.fdate ?? "",
    userid: r.userid,
    user: userMap.get(r.userid) ?? null,
  }));
  const orders: SRow[] = sRaw.map((r) => ({
    id: r.id,
    h_no: r.hno,
    status: r.hstatus,
    total_thb: Number(r.hcostallth ?? 0),
    item_count: Number(r.hcount ?? 0),
    created_at: r.hdate ?? "",
    userid: r.userid,
    user: userMap.get(r.userid) ?? null,
  }));
  const yuan: YRow[] = yRaw.map((r) => ({
    id: r.id,
    paytype: r.paytype,
    yuan_amount: Number(r.payyuan ?? 0),
    thb_amount: Number(r.paythb ?? 0),
    status: r.paystatus,
    created_at: r.paydate ?? "",
    userid: r.userid,
    user: userMap.get(r.userid) ?? null,
  }));

  const fTotal = forwarders.reduce((s, r) => s + r.total_price, 0);
  const sTotal = orders.reduce((s, r) => s + r.total_thb, 0);
  const yTotal = yuan.reduce((s, r) => s + r.thb_amount, 0);

  // Status breakdown per channel (rendered Thai via legacy-status-map).
  const fByStatus = forwarders.reduce<Record<string, number>>((a, r) => {
    const k = legacyForwarderStatusThai(r.status) || r.status;
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});
  const sByStatus = orders.reduce<Record<string, number>>((a, r) => {
    const k = legacyOrderStatusThai(r.status) || r.status;
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});
  const yByStatus = yuan.reduce<Record<string, number>>((a, r) => {
    const k = r.status === "2" ? "สำเร็จ" : r.status === "1" ? "รอ" : r.status === "3" ? "ไม่สำเร็จ" : r.status;
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});

  // ── 4) CSV data (one combined export for all 3 channels). ──
  const csvRows = [
    ...forwarders.map((r) => ({
      channel: "forwarder",
      ref:     r.f_no,
      status:  legacyForwarderStatusThai(r.status) || r.status,
      amount:  r.total_price,
      created: r.created_at,
      member:  r.userid,
      name:    userDisplayName(r.user),
      extra:   TRANSPORT_LABEL[r.transport_type] ?? r.transport_type,
    })),
    ...orders.map((r) => ({
      channel: "service_order",
      ref:     r.h_no,
      status:  legacyOrderStatusThai(r.status) || r.status,
      amount:  r.total_thb,
      created: r.created_at,
      member:  r.userid,
      name:    userDisplayName(r.user),
      extra:   `${r.item_count} ชิ้น`,
    })),
    ...yuan.map((r) => ({
      channel: "yuan_payment",
      ref:     `Y${r.id}`,
      status:  r.status === "2" ? "สำเร็จ" : r.status === "1" ? "รอ" : r.status === "3" ? "ไม่สำเร็จ" : r.status,
      amount:  r.thb_amount,
      created: r.created_at,
      member:  r.userid,
      name:    userDisplayName(r.user),
      extra:   `${PAYTYPE_LABEL[r.paytype ?? ""] ?? "—"} · ¥${r.yuan_amount.toFixed(2)}`,
    })),
  ];
  const csvCols = [
    { key: "channel", label: "ช่องทาง" },
    { key: "ref",     label: "เลขที่" },
    { key: "status",  label: "สถานะ" },
    { key: "amount",  label: "ยอด (บาท)" },
    { key: "created", label: "วันที่สร้าง" },
    { key: "member",  label: "รหัสลูกค้า" },
    { key: "name",    label: "ชื่อลูกค้า" },
    { key: "extra",   label: "หมายเหตุ" },
  ];

  // Month picker: 12 months back + current.
  const monthOptions: string[] = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">
            ออเดอร์ในเดือน · {label}{slaLabel ? ` — ${slaLabel}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted">ฝากนำเข้า + ฝากสั่งซื้อ + ฝากโอนหยวน ในเดือนที่เลือก (UTC)</p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← กลับรีพอร์ตหลัก</Link>
      </div>

      {slaKey && slaLabel && (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700">
              SLA: {slaLabel}
              <Link
                href={`/admin/reports/monthly-orders?month=${month}`}
                className="rounded-full bg-white/70 px-1.5 leading-none hover:bg-white"
                aria-label="ล้างตัวกรอง SLA"
              >
                ×
              </Link>
            </span>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ตัวกรอง SLA: {slaLabel} · กำลังพัฒนาเงื่อนไขกรอง · แสดงทุกรายการในขณะนี้
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted">เดือน:</span>
          {monthOptions.map((m) => (
            <Link
              key={m}
              href={`/admin/reports/monthly-orders?month=${m}`}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                m === month ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}
            >
              {m.slice(5)}/{m.slice(2, 4)}
            </Link>
          ))}
        </div>
        <CsvButton rows={csvRows} cols={csvCols} filename={`monthly-orders-${month}.csv`} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <Card label="ฝากนำเข้า (รายการ)" value={String(forwarders.length)} />
        <Card label="ฝากนำเข้า (ยอด)" value={thb(fTotal)} />
        <Card label="ฝากสั่งซื้อ (รายการ)" value={String(orders.length)} />
        <Card label="ฝากสั่งซื้อ (ยอด)" value={thb(sTotal)} />
        <Card label="ฝากโอนหยวน (รายการ)" value={String(yuan.length)} />
        <Card label="ฝากโอนหยวน (ยอด)" value={thb(yTotal)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Pane title={`ฝากนำเข้า — ${forwarders.length} รายการ`} statusMap={fByStatus}>
          {forwarders.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในเดือนนี้</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">เลขที่</th>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2 text-right">ยอด</th>
                  <th className="px-3 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {forwarders.slice(0, 100).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">{r.f_no}</Link>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {userDisplayName(r.user)}
                      <p className="font-mono text-[10px] text-muted">{r.userid}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(r.total_price)}</td>
                    <td className="px-3 py-2 text-[10px]">{legacyForwarderStatusThai(r.status) || r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {forwarders.length > 100 && (
            <p className="p-3 text-center text-[10px] text-muted">แสดง 100 แถวแรก — ดาวน์โหลด CSV เพื่อดูทั้งหมด</p>
          )}
        </Pane>

        <Pane title={`ฝากสั่งซื้อ — ${orders.length} รายการ`} statusMap={sByStatus}>
          {orders.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในเดือนนี้</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">เลขที่</th>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2 text-right">ยอด</th>
                  <th className="px-3 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 100).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/admin/service-orders/${r.h_no}`} className="text-primary-600 hover:underline">{r.h_no}</Link>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {userDisplayName(r.user)}
                      <p className="font-mono text-[10px] text-muted">{r.userid}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(r.total_thb)}</td>
                    <td className="px-3 py-2 text-[10px]">{legacyOrderStatusThai(r.status) || r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {orders.length > 100 && (
            <p className="p-3 text-center text-[10px] text-muted">แสดง 100 แถวแรก — ดาวน์โหลด CSV เพื่อดูทั้งหมด</p>
          )}
        </Pane>

        <Pane title={`ฝากโอนหยวน — ${yuan.length} รายการ`} statusMap={yByStatus}>
          {yuan.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในเดือนนี้</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2">ช่องทาง</th>
                  <th className="px-3 py-2 text-right">หยวน</th>
                  <th className="px-3 py-2 text-right">บาท</th>
                </tr>
              </thead>
              <tbody>
                {yuan.slice(0, 100).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs">
                      {userDisplayName(r.user)}
                      <p className="font-mono text-[10px] text-muted">{r.userid}</p>
                    </td>
                    <td className="px-3 py-2 text-[10px]">{PAYTYPE_LABEL[r.paytype ?? ""] ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">¥{r.yuan_amount.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(r.thb_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {yuan.length > 100 && (
            <p className="p-3 text-center text-[10px] text-muted">แสดง 100 แถวแรก — ดาวน์โหลด CSV เพื่อดูทั้งหมด</p>
          )}
        </Pane>
      </div>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}

function Pane({ title, statusMap, children }: { title: string; statusMap: Record<string, number>; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-bold text-sm">{title}</h2>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
          {Object.entries(statusMap).map(([k, n]) => (
            <span key={k} className="rounded-full border border-border bg-surface-alt px-2 py-0.5">
              {k}: <span className="font-mono font-semibold">{n}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
