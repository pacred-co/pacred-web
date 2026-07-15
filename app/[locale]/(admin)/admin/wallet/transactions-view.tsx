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
import { pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import { fetchCorporateNameMap, resolveBillingIdentity, corpRowFromName } from "@/lib/admin/customer-identity";
import { Explain } from "@/components/ui/tooltip";
import { isWalletCredit } from "@/lib/wallet/wallet-hs";

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
// ประเภทรายการ — plain Thai, ONE clear label per type (no raw "type N" fallback,
// no dev notation). type 8 = ฝากสั่งซื้อ QR+slip (ADR-0028) — was missing → rendered
// "type 8". type 2 = admin-added credit (was "เติม (manual)" — dev notation dropped).
const TYPE_LABEL: Record<string, string> = {
  "1": "ชำระเงิน (เข้ากระเป๋า)",
  "2": "เติมเงินโดยแอดมิน",
  "3": "ถอนเงิน",
  "4": "ตัดจากกระเป๋า",
  "7": "รอตรวจการเติมเงิน",
  "8": "ชำระฝากสั่งซื้อ",
};
const TYPE_CLS: Record<string, string> = {
  "1": "bg-green-50 text-green-700 border-green-200",
  "2": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "3": "bg-red-50 text-red-700 border-red-200",
  "4": "bg-blue-50 text-blue-700 border-blue-200",
  "7": "bg-amber-50 text-amber-700 border-amber-200",
  "8": "bg-violet-50 text-violet-700 border-violet-200",
};

// Tabs filter by TYPE only — clean nouns, no status descriptors (status is the
// separate STATUS_TABS row below). Owner 2026-06-22: "หัวข้องงซ้ำซ้อน".
const KIND_TABS: { key: string | null; label: string; types: string[] | null }[] = [
  { key: null,       label: "ทั้งหมด", types: null },
  { key: "topup",    label: "ชำระเงิน / เติมเงิน", types: ["1", "2"] },
  { key: "withdraw", label: "ถอนเงิน", types: ["3"] },
  { key: "orderpay", label: "ตัดจากกระเป๋า", types: ["4"] },
  // ADR-0028 — ฝากสั่งซื้อ QR+slip payments (type='8').
  { key: "shoppay",  label: "ชำระฝากสั่งซื้อ", types: ["8"] },
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
  // 2026-06-19 (owner #2 · UNIT B) — links a "เติม-แล้วจ่าย" pay sibling to its
  // parent top-up row (`reforder2 = topup.id`). One slip → a top-up row + N pay
  // rows; we collapse them into ONE logical "payment" row in the list.
  reforder2: number | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
};

export type TransactionsViewProps = {
  kind: string | undefined;
  status: string | undefined;
  q: string | undefined;
  /** Lane C 2026-06-02 — sortable column headers (ภูม flag #3). */
  sort?: string;
  dir?: string;
  /** 1-based page (server-side .range pagination · 2026-06-03). */
  page?: number;
};

// Lane C 2026-06-02 — server-side sort whitelist for the tx list.
const TX_SORT_FIELDS: Record<string, string> = {
  date:    "date",
  userid:  "userid",
  type:    "type",
  amount:  "amount",
  status:  "status",
};

// Helper — build URL preserving view=tx + the other tx-only searchparams.
function buildTxHref(params: { kind?: string | null; status?: string | null }): string {
  const qs = new URLSearchParams();
  qs.set("view", "tx");
  if (params.kind) qs.set("kind", params.kind);
  if (params.status) qs.set("status", params.status);
  return `/admin/wallet?${qs.toString()}`;
}

export async function WalletTransactionsView({ kind, status, q, sort, dir, page = 1 }: TransactionsViewProps) {
  const admin = createAdminClient();
  const { from: rowFrom, to: rowTo } = pageRange(page);
  // Lane C 2026-06-02 — resolve sort + dir from URL with whitelist.
  const sortKey = sort && TX_SORT_FIELDS[sort] ? sort : "date";
  const sortDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";
  const sortColumn = TX_SORT_FIELDS[sortKey];

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

  // PERF (2026-06-03): paginate 50/page via .range + exact count.
  let qb = admin
    .from("tb_wallet_hs")
    .select(
      "id,date,dateslip,amount,status,type,imagesslip,depositnamebank,note,userid,adminid,adminidcrate,reforder2",
      { count: "exact" },
    )
    .order(sortColumn, { ascending: sortDir === "asc" })
    .range(rowFrom, rowTo);

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

  const { data: rowsRaw, error, count: totalTx } = await qb;
  const rows = (rowsRaw ?? []) as unknown as WhsRow[];

  // Resolve every imagesslip → signed Supabase URL in parallel (Wave 13.1).
  const slipUrlMap = await resolveLegacyUrlMap(
    rows.map((r) => ({ id: r.id, filename: r.imagesslip })),
    "slip",
  );

  // 2nd query — merge customer names from tb_users.
  const userIds = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean))) as string[];
  let userMap = new Map<string, URow>();
  let corpNames = new Map<string, string>();
  if (userIds.length > 0) {
    const [usersRes, corpRes] = await Promise.all([
      admin
        .from("tb_users")
        .select("userID,userName,userLastName,userCompany,userTel")
        .in("userID", userIds),
      fetchCorporateNameMap(admin, userIds),
    ]);
    const { data: usersRaw, error: usersRawErr } = usersRes;
    if (usersRawErr) {
      console.error(`[tb_users list] failed`, { code: usersRawErr.code, message: usersRawErr.message });
    }
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]));
    corpNames = corpRes;
  }

  // ──────────────────────────────────────────────────────────────────────
  // UNIT B (owner #2 · 2026-06-19) — collapse the "เติม-แล้วจ่าย" 2-step into
  // ONE logical payment row. One slip creates a TOP-UP row (type '1'/'7', has
  // slip+bank) + N PAY rows (type '4'/'2', no bank) linked by reforder2 =
  // topup.id. Net: the customer paid once. We group what's VISIBLE on this page:
  // a top-up parent (a row whose id is referenced by ≥1 pay sibling on the page)
  // becomes the consolidated row; its siblings nest inside a "log หลังบ้าน"
  // expander. Standalone rows (no reforder2 link either way) render unchanged.
  // DISPLAY-only — the underlying rows are untouched (still selectable for
  // bulk-approve, still inspectable in the expander).
  type GroupedTx =
    | { kind: "single"; row: WhsRow }
    | { kind: "group"; parent: WhsRow; siblings: WhsRow[] };

  // Map of parent-topup id → its pay siblings present on this page.
  const siblingsByParent = new Map<number, WhsRow[]>();
  for (const r of rows) {
    if (r.reforder2 != null) {
      const arr = siblingsByParent.get(r.reforder2) ?? [];
      arr.push(r);
      siblingsByParent.set(r.reforder2, arr);
    }
  }
  // A row is a "child" (collapses into its parent) only if its parent top-up
  // row is ALSO on this page — otherwise we must show it standalone so it never
  // disappears across page boundaries.
  const rowById = new Map<number, WhsRow>(rows.map((r) => [r.id, r]));
  const groupedRows: GroupedTx[] = [];
  const consumedChildIds = new Set<number>();
  for (const r of rows) {
    // Skip rows already absorbed as a sibling of an earlier-rendered parent.
    if (consumedChildIds.has(r.id)) continue;
    const sibs = siblingsByParent.get(r.id);
    if (sibs && sibs.length > 0) {
      // r is a parent top-up that has pay siblings on this page → group.
      for (const s of sibs) consumedChildIds.add(s.id);
      groupedRows.push({ kind: "group", parent: r, siblings: sibs });
      continue;
    }
    if (r.reforder2 != null && rowById.has(r.reforder2)) {
      // r is a child whose parent is on this page — it'll be rendered inside the
      // parent's group; skip here (defensive · order-independent).
      continue;
    }
    // Standalone: a plain top-up / pay / withdraw / manual / type='8' / a child
    // whose parent isn't on this page → render as a single row, unchanged.
    groupedRows.push({ kind: "single", row: r });
  }

  // F4 (owner 2026-07-15 · PR178) — a COMBINED direct slip splits into N
  // per-forwarder pay rows that share ONE imagesslip (reforder2=NULL, so the
  // เติม-แล้วจ่าย collapse above never folds them). Staff then review + edit each
  // separately → งงยอด + เผลอเปลี่ยนยอดทีละงาน. Flag every row whose
  // (userid + imagesslip) appears on ≥2 rows so the shared-slip relationship is
  // visible at a glance. DISPLAY-only — rows stay individually selectable.
  const slipGroupKey = (r: WhsRow): string | null =>
    r.imagesslip && r.imagesslip.trim() && r.userid ? `${r.userid}|${r.imagesslip.trim()}` : null;
  const slipGroupIds = new Map<string, number[]>();
  for (const r of rows) {
    const k = slipGroupKey(r);
    if (!k) continue;
    const arr = slipGroupIds.get(k) ?? [];
    arr.push(r.id);
    slipGroupIds.set(k, arr);
  }
  const sharedSlipCountFor = (r: WhsRow): number => {
    const k = slipGroupKey(r);
    if (!k) return 0;
    const ids = slipGroupIds.get(k);
    return ids && ids.length > 1 ? ids.length : 0;
  };

  // Lane C 2026-06-02 — pre-compute sort hrefs for each tx column header.
  const sortHrefs: Record<string, string> = {};
  for (const k of Object.keys(TX_SORT_FIELDS)) {
    const nextDir = sortKey === k && sortDir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();
    params.set("view", "tx");
    if (kind)   params.set("kind", kind);
    if (status) params.set("status", status);
    if (q)      params.set("q", q);
    params.set("sort", k);
    params.set("dir", nextDir);
    sortHrefs[k] = `/admin/wallet?${params.toString()}`;
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
            <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-3 w-8"></th>
                  <TxSortTh label="วันที่สร้าง"   field="date"   activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} />
                  <TxSortTh label="ลูกค้า"        field="userid" activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} />
                  <TxSortTh label="ประเภท"        field="type"   activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} />
                  <TxSortTh label="จำนวน (THB)"   field="amount" activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} align="right" />
                  <th className="px-3 py-3">ธนาคาร</th>
                  <TxSortTh label="สถานะ"         field="status" activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} />
                  <th className="px-3 py-3">
                    <Explain label="สลิป" def="สลิปโอนเงินที่ลูกค้าแนบมา — กด “ดู” เพื่อเปิดดูเต็มก่อนอนุมัติทุกครั้ง" />
                  </th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((g) => {
                  if (g.kind === "single") {
                    return (
                      <TxRow key={g.row.id} row={g.row} userMap={userMap} corpNames={corpNames} slipUrlMap={slipUrlMap} sharedSlipCount={sharedSlipCountFor(g.row)} />
                    );
                  }
                  // Consolidated "เติม-แล้วจ่าย" group: ONE payment row (the
                  // top-up = the real paid figure) + a collapsible log of the
                  // underlying in/out ledger rows.
                  const { parent, siblings } = g;
                  return (
                    <TxRow
                      key={parent.id}
                      row={parent}
                      userMap={userMap}
                      corpNames={corpNames}
                      slipUrlMap={slipUrlMap}
                      groupContext={{ siblings, ledgerCount: 1 + siblings.length }}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={totalTx ?? 0}
        basePath="/admin/wallet"
        params={{ view: "tx", kind, status, q, sort, dir }}
      />
    </>
  );
}

// Slip cell — signed URL → "ดู" link · uploaded-but-unresolved → ⚠ · none → —.
function SlipCell({ row, slipUrlMap }: { row: WhsRow; slipUrlMap: Record<string, string | null> }) {
  const url = slipUrlMap[String(row.id)];
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
        ดู
      </a>
    );
  }
  if (row.imagesslip) {
    return (
      <span className="text-amber-600" title={`สลิป upload แล้วแต่หา URL ไม่ได้ — filename: ${row.imagesslip}`}>
        ⚠ ไม่พบ
      </span>
    );
  }
  return <span className="text-muted">—</span>;
}

/**
 * One rendered transaction row.
 *
 * - Plain rows (no `groupContext`) render exactly as before — 8 cells, a
 *   pending-only checkbox, and a "ดู / แก้ไข" link.
 * - When `groupContext` is supplied, `row` is the TOP-UP parent of a
 *   "เติม-แล้วจ่าย" pair (UNIT B): the displayed amount = the top-up amount =
 *   the real paid figure, with a "รวมเป็นรายการเดียว" badge, plus a second
 *   collapsible <tr> ("รายการเดินบัญชี · log หลังบ้าน") holding the parent +
 *   every pay sibling so the in/out ledger stays inspectable — and every
 *   pending underlying row keeps its bulk-approve checkbox.
 */
function TxRow({
  row,
  userMap,
  corpNames,
  slipUrlMap,
  groupContext,
  sharedSlipCount = 0,
}: {
  row: WhsRow;
  userMap: Map<string, URow>;
  corpNames: Map<string, string>;
  slipUrlMap: Record<string, string | null>;
  groupContext?: { siblings: WhsRow[]; ledgerCount: number };
  /** F4 — >1 when this row shares its slip with other rows (combined payment). */
  sharedSlipCount?: number;
}) {
  const u = row.userid ? userMap.get(row.userid) : undefined;
  const rowStatus = row.status ?? "1";
  const type = row.type ?? "";
  const amount = Number(row.amount ?? 0);
  // Money OUT? Derived from `type` (SOT), NEVER the amount sign — tb_wallet_hs.amount
  // is stored POSITIVE, so `amount < 0` matched nothing and every debit rendered as
  // if it were incoming. Debits (order-payment/withdraw/import/yuan) now show red −.
  const isNeg = !isWalletCredit(type);
  const customerName = u
    ? resolveBillingIdentity({
        userCompany: u.userCompany,
        userName: u.userName,
        userLastName: u.userLastName,
        corp: corpRowFromName(row.userid ? corpNames.get(row.userid) : undefined),
      }).name || row.userid
    : row.userid ?? "—";
  const isGroup = !!groupContext;

  return (
    <>
      <tr className="border-t border-border hover:bg-surface-alt/30">
        <td className="px-2 py-3 w-8">
          {rowStatus === "1" ? <TbWalletRowCheckbox id={row.id} /> : null}
        </td>
        <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
          {formatThaiDateTime(row.date)}
        </td>
        <td className="px-3 py-3 text-xs">
          <div className="font-mono text-sm font-semibold text-foreground">{row.userid ?? "—"}</div>
          <div className="text-foreground">{customerName}</div>
          {u?.userTel ? <div className="text-[11px] text-muted">{u.userTel}</div> : null}
        </td>
        <td className="px-3 py-3 text-xs">
          {isGroup ? (
            <div className="space-y-0.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                💳 ชำระค่าฝากนำเข้า (รวมเติม+ตัด เป็นรายการเดียว)
              </span>
              {row.note ? (
                <div className="text-muted text-[11px] line-clamp-2 max-w-[16rem]">{row.note}</div>
              ) : null}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  TYPE_CLS[type] ?? "bg-gray-100 text-gray-600 border-gray-200"
                }`}
              >
                {TYPE_LABEL[type] ?? "รายการอื่นๆ"}
              </span>
              <Explain def="ชำระเงิน/เติมเงิน = เงินเข้ากระเป๋า · ตัดจากกระเป๋า = เงินออกไปจ่ายออเดอร์ · ถอนเงิน = ลูกค้าขอถอนยอดออก · ชำระฝากสั่งซื้อ = จ่ายค่าสั่งซื้อด้วยสลิป" />
            </span>
          )}
        </td>
        <td className={`px-3 py-3 text-right font-mono text-sm font-bold ${isNeg ? "text-red-600" : "text-foreground"}`}>
          {isNeg ? "−" : ""}฿{Math.abs(amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          {/* F4 — shared-slip warning (owner PR178): this row's slip covers ≥2 รายการ. */}
          {sharedSlipCount > 1 ? (
            <div
              className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
              title="สลิปนี้ใช้ร่วมกับรายการอื่น (ชำระรวมสลิปเดียว) — ตรวจ/ตัดจ่ายพร้อมกัน ระวังยอดซ้ำ"
            >
              🔗 รวมสลิปเดียวกับ {sharedSlipCount} รายการ
            </div>
          ) : null}
        </td>
        <td className="px-3 py-3 text-xs">
          {row.depositnamebank ? (
            <span className="font-mono text-[11px]">{row.depositnamebank}</span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="px-3 py-3">
          <span className="inline-flex items-center gap-1">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                STATUS_CLS[rowStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {STATUS_LABEL[rowStatus] ?? "—"}
            </span>
            <Explain def="รอตรวจสอบ = สลิปเข้ามายังไม่ได้ตรวจ · อนุมัติแล้ว = ตรวจผ่าน เงินเข้า/ออกแล้ว · ปฏิเสธ = สลิปไม่ถูกต้อง ไม่ตัดยอด" />
          </span>
          {(row.adminid || row.adminidcrate) ? (
            <div className="text-muted text-[11px] mt-1 font-mono">{row.adminid ?? row.adminidcrate}</div>
          ) : null}
        </td>
        <td className="px-3 py-3 text-xs">
          <SlipCell row={row} slipUrlMap={slipUrlMap} />
        </td>
        <td className="px-3 py-3 text-xs">
          <Link href={`/admin/wallet/${row.id}`} className="text-primary-600 hover:underline">
            ดู / แก้ไข
          </Link>
        </td>
      </tr>
      {isGroup ? (
        <tr className="border-t border-border bg-surface-alt/20">
          <td colSpan={9} className="px-3 pb-3 pt-0">
            <details className="text-xs">
              <summary className="cursor-pointer select-none py-1 text-muted hover:text-foreground">
                ดูรายการย่อย (เติมเงิน + ตัดชำระ) · {groupContext!.ledgerCount} รายการ
              </summary>
              <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-white dark:bg-surface">
                <table className="w-full text-[11px]">
                  <thead className="bg-surface-alt/40 text-left text-muted">
                    <tr>
                      <th className="px-2 py-1.5 w-6"></th>
                      <th className="px-2 py-1.5">#</th>
                      <th className="px-2 py-1.5">วันที่</th>
                      <th className="px-2 py-1.5">ประเภท</th>
                      <th className="px-2 py-1.5 text-right">จำนวน (THB)</th>
                      <th className="px-2 py-1.5">สถานะ</th>
                      <th className="px-2 py-1.5">หมายเหตุ</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[row, ...groupContext!.siblings].map((lr) => {
                      const lrStatus = lr.status ?? "1";
                      const lrType = lr.type ?? "";
                      const lrAmount = Number(lr.amount ?? 0);
                      const lrNeg = lrAmount < 0;
                      // The parent's checkbox already lives on the consolidated
                      // main row — only render checkboxes for the pay siblings
                      // here, so no id is double-mounted with split local state.
                      const isParent = lr.id === row.id;
                      return (
                        <tr key={lr.id} className="border-t border-border">
                          <td className="px-2 py-1.5 w-6">
                            {!isParent && lrStatus === "1" ? <TbWalletRowCheckbox id={lr.id} /> : null}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-muted">{lr.id}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {formatThaiDateTime(lr.date)}
                          </td>
                          <td className="px-2 py-1.5">
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${
                                TYPE_CLS[lrType] ?? "bg-gray-100 text-gray-600 border-gray-200"
                              }`}
                            >
                              {TYPE_LABEL[lrType] ?? "รายการอื่นๆ"}
                            </span>
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono ${lrNeg ? "text-red-600" : "text-foreground"}`}>
                            {lrNeg ? "−" : ""}฿{Math.abs(lrAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-2 py-1.5">
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${
                                STATUS_CLS[lrStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"
                              }`}
                            >
                              {STATUS_LABEL[lrStatus] ?? "—"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-muted max-w-[18rem] truncate" title={lr.note ?? ""}>
                            {lr.note ?? "—"}
                          </td>
                          <td className="px-2 py-1.5">
                            <Link href={`/admin/wallet/${lr.id}`} className="text-primary-600 hover:underline">
                              ดู
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function TxSortTh({
  label,
  field,
  activeKey,
  activeDir,
  hrefs,
  align,
}: {
  label: string;
  field: string;
  activeKey: string;
  activeDir: "asc" | "desc";
  hrefs: Record<string, string>;
  align?: "right";
}) {
  const active = activeKey === field;
  const arrow = active ? (activeDir === "asc" ? "↑" : "↓") : "⇵";
  const cls = align === "right" ? "text-right" : "";
  return (
    <th className={`px-3 py-3 ${cls}`}>
      <Link
        href={hrefs[field]}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          active ? "text-primary-700 font-semibold" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        <span className="text-[11px]" aria-hidden>{arrow}</span>
      </Link>
    </th>
  );
}
