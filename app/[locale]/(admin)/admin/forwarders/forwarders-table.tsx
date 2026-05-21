"use client";

import { Link } from "@/i18n/navigation";
import { Glossary, GLOSSARY_DEFS } from "@/components/ui/tooltip";

/**
 * Forwarders table — renders tb_forwarder rows (faithful port, Wave 3 P0 #1).
 *
 * The bulk-status-update affordance from the previous rebuilt-schema
 * version was removed: the existing `adminBulkUpdateForwarderStatus`
 * Server Action (`actions/admin/forwarders.ts`) still mutates the
 * Pacred-original `forwarders` table — calling it from a tb_forwarder
 * row would silently fail (wrong primary key shape). Wave 3D (Agent Z)
 * will rewrite that Server Action against tb_forwarder; the bulk bar
 * comes back then.
 *
 * TODO: ask ภูม — re-enable bulk status update after Agent Z lands the
 * tb_forwarder-aware `adminBulkUpdateForwarderStatus`.
 */

export type Row = {
  id: number;
  f_no: string;
  status: string;
  warehouse_china: string;
  partner_warehouse: string;
  transport_type: string;
  weight_kg: number;
  volume_cbm: number;
  total_price: number;
  tracking_chn: string | null;
  tracking_th: string | null;
  cabinet_number: string | null;
  created_at: string;
  fcredit: string;
  note: string | null;
  detail: string | null;
  customer: { userid: string; name: string; phone: string } | null;
};

const STATUS_BADGE: Record<string, string> = {
  "1":  "bg-yellow-50 text-yellow-700 border-yellow-200",
  "2":  "bg-blue-50 text-blue-700 border-blue-200",
  "3":  "bg-pink-50 text-pink-700 border-pink-200",
  "4":  "bg-purple-50 text-purple-700 border-purple-200",
  "5":  "bg-red-50 text-red-700 border-red-200",
  "6":  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "7":  "bg-green-50 text-green-700 border-green-200",
  "99": "bg-orange-50 text-orange-700 border-orange-200",
};

export function ForwardersTable({
  rows,
  statusLabel,
  modeLabel,
  warehouseLabel,
}: {
  rows: Row[];
  statusLabel: Record<string, string>;
  modeLabel: Record<string, string>;
  warehouseLabel: Record<string, string>;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการที่ตรงกัน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">
                    <Glossary term="เลขที่ (F-no)" definition={GLOSSARY_DEFS.f_no} />
                  </th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">โกดัง / ขนส่ง</th>
                  <th className="px-4 py-3">ตู้</th>
                  <th className="px-4 py-3 text-right">
                    น้ำหนัก / <Glossary term="ปริมาตร (CBM)" definition={GLOSSARY_DEFS.cbm} />
                  </th>
                  <th className="px-4 py-3 text-right">ราคา</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  // Show "เครติด" badge on top of fstatus badge for credit orders
                  const statusKey = r.fcredit === "1" ? "c" : r.status;
                  const badgeCls = STATUS_BADGE[r.status] ?? "bg-gray-50 text-gray-600 border-gray-200";
                  const label = r.fcredit === "1"
                    ? `เครติด · ${statusLabel[r.status] ?? r.status}`
                    : statusLabel[statusKey] ?? statusKey;
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-border hover:bg-surface-alt/30"
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">
                          {r.f_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono">{r.customer?.userid ?? "—"}</div>
                        <div>{r.customer?.name || "—"}</div>
                        <div className="text-muted">{r.customer?.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>
                          {warehouseLabel[r.partner_warehouse] ?? r.partner_warehouse}
                          {" / "}
                          {modeLabel[r.transport_type] ?? r.transport_type}
                        </div>
                        <div className="text-muted">โกดังจีน: {r.warehouse_china}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.cabinet_number || <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {r.weight_kg.toFixed(2)} kg
                        <br />
                        <span className="text-muted">{r.volume_cbm.toFixed(3)} cbm</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        ฿{r.total_price.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.tracking_th  && r.tracking_th  !== "-" && <div>TH: {r.tracking_th}</div>}
                        {r.tracking_chn && r.tracking_chn !== "-" && <div>CN: {r.tracking_chn}</div>}
                        {(!r.tracking_th || r.tracking_th === "-") && (!r.tracking_chn || r.tracking_chn === "-") && <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeCls}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
