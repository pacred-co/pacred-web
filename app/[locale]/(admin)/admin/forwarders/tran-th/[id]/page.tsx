import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getTranThDetail } from "@/actions/admin/forwarder-tran-th";

/**
 * /admin/forwarders/tran-th/[id] — TH-transport batch detail.
 *
 * Shows: header (date + creator) + included forwarder rows with delivery
 * destination metadata (province · tel · tracking) so dispatch staff can
 * see the route in one shot.
 *
 * READ-ONLY · MVP per brief §6.
 */

export const dynamic = "force-dynamic";

function fmtDateLong(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "2-digit" });
}

const FSTATUS_LABEL: Record<string, string> = {
  "1": "ใหม่",
  "2": "ตรวจสอบ",
  "3": "รอเข้าระบบ",
  "4": "ถึงโกดังจีน",
  "5": "รอชำระเงิน",
  "6": "ถึงไทยแล้ว",
  "7": "ส่งสำเร็จ",
};

export default async function AdminTranThDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "accounting", "warehouse", "freight_sales"]);
  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const detail = await getTranThDetail(id);
  if (!detail) notFound();
  const { header, items, totals } = detail;

  // Group by destination province for at-a-glance routing.
  const byProvince = new Map<string, number>();
  for (const it of items) {
    const p = it.forwarder?.faddressprovince?.trim() || "(ไม่ระบุ)";
    byProvince.set(p, (byProvince.get(p) ?? 0) + 1);
  }
  const provinceList = Array.from(byProvince.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <nav className="text-xs text-muted">
        <Link href="/admin" className="hover:text-foreground">หน้าแรก</Link>
        <span className="mx-1">/</span>
        <Link href="/admin/forwarders" className="hover:text-foreground">ฝากนำเข้า</Link>
        <span className="mx-1">/</span>
        <Link href="/admin/forwarders/tran-th" className="hover:text-foreground">ใบจัดส่งในไทย</Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">#{header.id}</span>
      </nav>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">ใบจัดส่งในไทย #{header.id}</h1>
          <p className="text-xs text-muted mt-1">
            สร้างเมื่อ {fmtDateLong(header.date)} โดย <span className="font-mono">{header.adminidcreate}</span>
          </p>
        </div>
      </header>

      {/* Totals */}
      <section className="grid sm:grid-cols-4 gap-3">
        <Stat label="forwarder ในชุด" value={totals.itemCount.toLocaleString("th-TH")} />
        <Stat label="น้ำหนักรวม (kg)" value={totals.totalWeight.toFixed(2)} />
        <Stat label="ปริมาตรรวม (CBM)" value={totals.totalVolume.toFixed(5)} />
        <Stat label="กล่องรวม" value={totals.totalBoxes.toLocaleString("th-TH")} />
      </section>

      {/* Province rollup */}
      {provinceList.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
          <h2 className="font-bold text-sm mb-3">🗺 ปลายทาง (top {provinceList.length} จังหวัด)</h2>
          <div className="flex flex-wrap gap-2">
            {provinceList.map(([prov, n]) => (
              <span key={prov} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-alt/40 px-3 py-1 text-xs">
                <span className="font-medium">{prov}</span>
                <span className="text-muted">×</span>
                <span className="font-mono text-primary-700 font-bold">{n}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Items */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">📦 รายการ forwarder ({totals.itemCount.toLocaleString("th-TH")})</h2>
        </div>
        {items.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Forwarder</th>
                  <th className="px-3 py-2">Tracking CHN</th>
                  <th className="px-3 py-2">Tracking TH</th>
                  <th className="px-3 py-2">ผู้รับ</th>
                  <th className="px-3 py-2">โทร</th>
                  <th className="px-3 py-2">จังหวัด</th>
                  <th className="px-3 py-2 text-right">กล่อง</th>
                  <th className="px-3 py-2 text-right">น้ำหนัก</th>
                  <th className="px-3 py-2 text-right">CBM</th>
                  <th className="px-3 py-2">fStatus</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/forwarders/${it.fid}`}
                        className="font-mono text-xs text-primary-600 hover:underline"
                      >
                        #{it.fid}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted whitespace-nowrap">{it.forwarder?.ftrackingchn ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted whitespace-nowrap">{it.forwarder?.ftrackingth ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {it.forwarder ? [it.forwarder.faddressname, it.forwarder.faddresslastname].filter(Boolean).join(" ").trim() || "—" : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted whitespace-nowrap">{it.forwarder?.faddresstel ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{it.forwarder?.faddressprovince ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{it.forwarder?.famount.toLocaleString("th-TH") ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{it.forwarder ? it.forwarder.fweight.toFixed(2) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{it.forwarder ? it.forwarder.fvolume.toFixed(5) : "—"}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-surface-alt text-foreground border border-border px-2 py-0.5 text-[11px]">
                        {it.forwarder?.fstatus ? (FSTATUS_LABEL[it.forwarder.fstatus] ?? it.forwarder.fstatus) : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted">
        📌 MVP read-only · CREATE batch DEFERRED next sitting
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-bold font-mono text-foreground text-xl">{value}</p>
    </div>
  );
}
