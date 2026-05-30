/**
 * /admin/wallet?view=tx — transactions list (Wave 7.2 · Wave 13.1 · 2026-05-21).
 *
 * This is the PRE-Wave-15 implementation, extracted verbatim from
 * `page.tsx` so the route can default to the per-customer balance summary
 * (Wave 15 P0-1 paradigm fix per fidelity-gap-2026-05-24 §1) while
 * keeping the legacy-equivalent of `?page=deposit / ?page=withdraw /
 * ?page=history` available behind `?view=tx`.
 *
 * Behaviour preserved 1:1:
 *   - status / kind / q searchParams (incl. legacy back-compat for
 *     kind=deposit + status=pending)
 *   - bulk-approve bar + slip resolver + customer name join
 *   - kind/status tabs + search box + 200-row cap
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { TbWalletBulkBar, TbWalletRowCheckbox } from "./tb-bulk-bar";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-red-100 text-red-700 border-red-200",
};

// type → kind label + colour (legacy taxonomy · 0081 L6220 · see page.tsx header).
// ADR-0018 P1-25 fix (2026-05-30): customer withdraw is type='3' (was missing
// here, so customer withdraw requests were INVISIBLE in this list — a P0-7
// reachability bug). type='7' is "ชำระเงินรอตรวจสอบการเติม" (a top-up sibling),
// NOT a withdraw — it was mislabeled "ถอนเงิน". Both corrected below.
const TYPE_LABEL: Record<string, string> = {
  "1": "เติมเงิน",
  "2": "เติม (manual)",
  "3": "ถอนเงิน",
  "4": "ชำระจากกระเป๋า",
  "7": "รอตรวจการเติม",
};
const TYPE_CLS: Record<string, string> = {
  "1": "bg-green-50 text-green-700 border-green-200",
  "2": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "3": "bg-red-50 text-red-700 border-red-200",
  "4": "bg-blue-50 text-blue-700 border-blue-200",
  "7": "bg-amber-50 text-amber-700 border-amber-200",
};

const KIND_TABS: { key: string | null; label: string; types: string[] | null }[] = [
  { key: null,       label: "ทั้งหมด", types: null },
  { key: "topup",    label: "เติมเงิน (รอตรวจ + manual)", types: ["1", "2"] },
  { key: "withdraw", label: "ถอนเงิน", types: ["3"] },
  { key: "orderpay", label: "ชำระจากกระเป๋า", types: ["4"] },
];

const STATUS_TABS: { key: string | null; label: string }[] = [
  { key: null, label: "ทุกสถานะ" },
  { key: "1",  label: "รอตรวจ" },
  { key: "2",  label: "อนุมัติ" },
  { key: "3",  label: "ปฏิเสธ" },
];

type WhsRow = {
  id: number;
  date: string | null;
  dateslip: string | null;
  amount: number | null;
  status: string | null;
  type: string | null;
  imagesslip: string | null;
  depositnamebank: string | null;
  note: string | null;
  userid: string | null;
  adminid: string | null;
  adminidcrate: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

export type TransactionsViewProps = {
  kind: string | undefined;
  status: string | undefined;
  q: string | undefined;
};

// Helper — build URL preserving view=tx + the other tx-only searchparams.
function buildTxHref(params: { kind?: string | null; status?: string | null }): string {
  const qs = new URLSearchParams();
  qs.set("view", "tx");
  if (params.kind) qs.set("kind", params.kind);
  if (params.status) qs.set("status", params.status);
  return `/admin/wallet?${qs.toString()}`;
}

export async function WalletTransactionsView({ kind, status, q }: TransactionsViewProps) {
  const admin = createAdminClient();

  // Map ?kind=... to the matching `type` values.
  const kindTab = KIND_TABS.find((t) => t.key === (kind ?? null));
  const typeFilter = kindTab?.types ?? null;
  // Back-compat: legacy menubar URLs used kind=deposit, kind=withdraw, status=pending.
  // ADR-0018 P1-25: customer withdraw is type='3' (was wrongly '7').
  const legacyKindMap: Record<string, string[]> = {
    deposit: ["1", "2"],
    withdraw: ["3"],
  };
  const legacyTypeFilter = kind && legacyKindMap[kind] ? legacyKindMap[kind] : null;
  const effectiveTypeFilter = typeFilter ?? legacyTypeFilter;

  const statusFilter = status === "pending" ? "1" : status ?? "";

  let qb = admin
    .from("tb_wallet_hs")
    .select(
      "id,date,dateslip,amount,status,type,imagesslip,depositnamebank,note,userid,adminid,adminidcrate",
    )
    .order("date", { ascending: false })
    .limit(200);

  if (effectiveTypeFilter && effectiveTypeFilter.length > 0) {
    qb = qb.in("type", effectiveTypeFilter);
  }
  if (statusFilter && /^[123]$/.test(statusFilter)) {
    qb = qb.eq("status", statusFilter);
  }
  if (q) {
    const term = q.trim();
    if (/^\d+$/.test(term)) qb = qb.eq("id", Number(term));
    else qb = qb.eq("userid", term.toUpperCase());
  }

  const { data: rowsRaw, error } = await qb;
  const rows = (rowsRaw ?? []) as unknown as WhsRow[];

  // Resolve every imagesslip → signed Supabase URL in parallel (Wave 13.1).
  const slipUrlMap = await resolveLegacyUrlMap(
    rows.map((r) => ({ id: r.id, filename: r.imagesslip })),
    "slip",
  );

  // 2nd query — merge customer names from tb_users.
  const userIds = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean))) as string[];
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersRawErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel")
      .in("userID", userIds);
    if (usersRawErr) {
      console.error(`[tb_users list] failed`, { code: usersRawErr.code, message: usersRawErr.message });
    }
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]));
  }

  return (
    <>
      {/* Kind tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {KIND_TABS.map((t) => {
          const isActive = (t.key ?? "") === (kind ?? "");
          const href = buildTxHref({
            kind: t.key,
            status: status && /^[123]$/.test(status) ? status : null,
          });
          return (
            <Link
              key={t.label}
              href={href}
              className={
                "px-3 py-1.5 text-xs rounded-t-md border-b-2 -mb-px " +
                (isActive
                  ? "border-primary-600 text-primary-600 font-semibold"
                  : "border-transparent text-muted hover:text-foreground")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => {
          const isActive = (t.key ?? "") === (status ?? "");
          const href = buildTxHref({ kind: kind ?? null, status: t.key });
          return (
            <Link
              key={t.label}
              href={href}
              className={
                "rounded-full border px-3 py-1 text-xs " +
                (isActive
                  ? "border-primary-500 bg-primary-50 text-primary-700 font-medium"
                  : "border-border bg-white text-muted hover:bg-surface-alt")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Search box */}
      <form className="flex gap-2 flex-wrap" action="/admin/wallet">
        <input type="hidden" name="view" value="tx" />
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="ค้นหา รหัสลูกค้า (PR…) / หมายเลขรายการ"
          className="rounded-lg border border-border px-3 py-2 text-sm w-72"
        />
        <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm">
          ค้นหา
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {error.message}
        </div>
      )}

      {/* Wave 8 Group A — sticky bulk-approve bar (shows when rows selected) */}
      <TbWalletBulkBar />

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>👛</div>
            <p className="text-sm font-medium text-foreground">ไม่มีรายการตามตัวกรองนี้</p>
            <p className="text-xs text-muted max-w-md mx-auto">
              ลองล้าง/เปลี่ยนตัวกรองด้านบนเพื่อดูทุก deposit / withdraw / payment ของลูกค้า
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-3 w-8"></th>
                  <th className="px-3 py-3">วันที่สร้าง</th>
                  <th className="px-3 py-3">ลูกค้า</th>
                  <th className="px-3 py-3">ประเภท</th>
                  <th className="px-3 py-3 text-right">จำนวน (THB)</th>
                  <th className="px-3 py-3">ธนาคาร</th>
                  <th className="px-3 py-3">สถานะ</th>
                  <th className="px-3 py-3">สลิป</th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const rowStatus = r.status ?? "1";
                  const type = r.type ?? "";
                  const amount = Number(r.amount ?? 0);
                  const isNeg = amount < 0;
                  const customerName = u
                    ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || r.userid
                    : r.userid ?? "—";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-2 py-3 w-8">
                        {rowStatus === "1" ? <TbWalletRowCheckbox id={r.id} /> : null}
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.date
                          ? new Date(r.date).toLocaleString("th-TH", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="font-mono">{r.userid ?? "—"}</div>
                        <div>{customerName}</div>
                        {u?.userTel ? <div className="text-muted">{u.userTel}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            TYPE_CLS[type] ?? "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {TYPE_LABEL[type] ?? `type ${type}`}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono text-xs ${isNeg ? "text-red-600" : "text-foreground"}`}
                      >
                        {isNeg ? "−" : ""}฿
                        {Math.abs(amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r.depositnamebank ? (
                          <span className="font-mono text-[11px]">{r.depositnamebank}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            STATUS_CLS[rowStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {STATUS_LABEL[rowStatus] ?? `status ${rowStatus}`}
                        </span>
                        {(r.adminid || r.adminidcrate) ? (
                          <div className="text-muted text-[10px] mt-1 font-mono">
                            {r.adminid ?? r.adminidcrate}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {(() => {
                          const url = slipUrlMap[String(r.id)];
                          if (url) {
                            return (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary-600 hover:underline"
                              >
                                ดู
                              </a>
                            );
                          }
                          if (r.imagesslip) {
                            return (
                              <span
                                className="text-amber-600"
                                title={`สลิป upload แล้วแต่หา URL ไม่ได้ — filename: ${r.imagesslip}`}
                              >
                                ⚠ ไม่พบ
                              </span>
                            );
                          }
                          return <span className="text-muted">—</span>;
                        })()}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <Link
                          href={`/admin/wallet/${r.id}`}
                          className="text-primary-600 hover:underline"
                        >
                          ดู / แก้ไข
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        แสดงไม่เกิน 200 แถวต่อหน้า (ใช้ตัวกรอง / ค้นหาด้านบนเพื่อกรองเพิ่ม)
      </p>
    </>
  );
}
