"use client";

/**
 * Client island — commission-batch CREATE flow (sales rep OR interpreter).
 * Faithful port of the legacy withdraw-commission-{sale,interpreter} add.php +
 * listPayComm*.php flow, rendered in our own Tailwind (AGENTS.md §0a).
 *
 * Flow:
 *   1. pick a payee (sales rep / interpreter) + optional month range → "ค้นหา"
 *   2. server returns the eligible rows (already anti-joined + priced)
 *   3. multi-select rows → the footer shows commBefore / WHT / net (server
 *      recomputes on submit — the client total is a preview only)
 *   4. pick the pay-FROM bank account + a title → §0f confirm → create action
 *   5. success → navigate to the new batch detail
 *
 * The button is only rendered for admins who can actually create (accounting /
 * god) — the server action re-gates regardless.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { confirm } from "@/components/ui/confirm";
import {
  getSaleBatchEligible,
  getInterpreterBatchEligible,
  createSaleCommBatch,
  createInterpreterCommBatch,
  type BatchKind,
  type CommPayee,
  type CommPayAccount,
  type EligibleSaleForwarder,
  type EligibleInterpreterOrder,
} from "@/actions/admin/withdraw-comm-batch";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}

const WHT_RATE = 0.03;
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type Row = {
  key: string;            // forwarderId (string) or hno
  label: string;          // order/forwarder id shown
  sub: string;            // tracking / owner
  walletDate: string | null;
  basis: number;          // priceNet (sale) or diffYaun (interp)
  basisLabel: string;
  commission: number;
};

export function CommBatchCreateForm({
  kind,
  payees,
  accounts,
}: {
  kind: BatchKind;
  payees: CommPayee[];
  accounts: CommPayAccount[];
}) {
  const router = useRouter();
  const isSale = kind === "sale";
  const payeeLabel = isSale ? "แอดมินเซลล์" : "ล่ามจีน";
  const basePath = isSale ? "comm-sale" : "comm-interpreter";

  const [open, setOpen] = useState(false);
  const [payeeId, setPayeeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [perCom, setPerCom] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false);

  const [accountId, setAccountId] = useState("");
  const [title, setTitle] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [creating, startCreate] = useTransition();

  function reset() {
    setRows([]);
    setSelected(new Set());
    setSearched(false);
    setPerCom(null);
    setTitle("");
    setError(null);
  }

  function search() {
    setError(null);
    if (!payeeId) {
      setError(`กรุณาเลือก${payeeLabel}`);
      return;
    }
    startSearch(async () => {
      const range = { payeeAdminId: payeeId, start: start || undefined, end: end || undefined };
      if (isSale) {
        const res = await getSaleBatchEligible(range);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const items = res.data?.items ?? [];
        setRows(
          items.map((i: EligibleSaleForwarder) => ({
            key: String(i.fid),
            label: `#${i.fid}`,
            sub: i.ftrackingchn ?? i.userid,
            walletDate: i.walletDate,
            basis: i.priceNet,
            basisLabel: "ราคานำเข้าจีน-ไทย (สุทธิ)",
            commission: i.commission,
          })),
        );
        setPerCom(null);
      } else {
        const res = await getInterpreterBatchEligible(range);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const items = res.data?.items ?? [];
        setPerCom(res.data?.perCom ?? 0);
        setRows(
          items.map((i: EligibleInterpreterOrder) => ({
            key: i.hno,
            label: i.hno,
            sub: i.userid ?? "—",
            walletDate: i.walletDate,
            basis: i.diffYaun,
            basisLabel: "ส่วนต่าง (หยวน)",
            commission: i.commission,
          })),
        );
      }
      setSelected(new Set());
      setSearched(true);
    });
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.key))));
  }

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.key)), [rows, selected]);
  const preview = useMemo(() => {
    const commBefore = round2(selectedRows.reduce((s, r) => s + r.commission, 0));
    const withholding = round2(commBefore * WHT_RATE);
    return { commBefore, withholding, net: round2(commBefore - withholding) };
  }, [selectedRows]);

  function submit() {
    setError(null);
    if (selected.size === 0) {
      setError("กรุณาเลือกอย่างน้อย 1 รายการ");
      return;
    }
    if (!accountId) {
      setError("กรุณาเลือกบัญชีรับเงิน");
      return;
    }
    if (!title.trim()) {
      setError("กรุณากรอกชื่อเรื่องที่เบิกเงิน");
      return;
    }
    startCreate(async () => {
      const ok = await confirm(
        `ยืนยันสร้างรายการเบิกค่าคอมให้ ${payeeId}\n` +
          `${selected.size} รายการ · ค่าคอมสุทธิ ฿${fmt2(preview.net)} (ก่อนหัก ฿${fmt2(preview.commBefore)} − WHT ฿${fmt2(preview.withholding)})?`,
      );
      if (!ok) return;
      const common = {
        payeeAdminId: payeeId,
        accountId: Number(accountId),
        title: title.trim(),
      };
      const res = isSale
        ? await createSaleCommBatch({ ...common, forwarderIds: Array.from(selected).map(Number) })
        : await createInterpreterCommBatch({ ...common, hnos: Array.from(selected) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/admin/accounting/withdraw/${basePath}/${res.data?.batchId}`);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
      >
        ＋ สร้างรายการเบิก
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-6 w-full max-w-4xl rounded-2xl bg-white shadow-xl dark:bg-surface">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-3">
          <h3 className="text-base font-bold">
            สร้างรายการเบิกค่าคอม{isSale ? "เซลล์" : "ล่ามจีน"}
          </h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-700"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Filters */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="cb-payee">
                {payeeLabel}
              </label>
              <select
                id="cb-payee"
                value={payeeId}
                onChange={(e) => {
                  setPayeeId(e.target.value);
                  reset();
                }}
                className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              >
                <option value="">— เลือก{payeeLabel} —</option>
                {payees.map((p) => (
                  <option key={p.adminId} value={p.adminId}>
                    {p.name ? `${p.adminId} · ${p.name}` : p.adminId}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="cb-start">
                วันที่ชำระเงิน (ตั้งแต่)
              </label>
              <input
                id="cb-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="cb-end">
                วันที่ชำระเงิน (ถึง)
              </label>
              <input
                id="cb-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={search}
              disabled={searching || !payeeId}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {searching ? "กำลังค้นหา…" : "🔍 ค้นหารายการที่เบิกได้"}
            </button>
            <span className="text-xs text-muted">
              ค่าเริ่มต้น = เดือนปัจจุบัน (ไม่ระบุวันที่)
            </span>
            {perCom != null && (
              <span className="text-xs text-primary-700">% ค่าคอมล่าม = {fmt2(perCom)}%</span>
            )}
          </div>

          {/* Eligible rows */}
          {searched && (
            <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-black/10">
              <table className="min-w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-orange-400/50 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                <thead className="bg-orange-500 text-xs text-white">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selected.size === rows.length}
                        onChange={toggleAll}
                        aria-label="เลือกทั้งหมด"
                        className="h-4 w-4"
                      />
                    </th>
                    <th className="px-3 py-2 text-left">{isSale ? "forwarder" : "เลขที่ออเดอร์"}</th>
                    <th className="px-3 py-2 text-left">{isSale ? "แทรคกิ้ง/ลูกค้า" : "ลูกค้า"}</th>
                    <th className="px-3 py-2 text-left">วันที่ชำระเงิน</th>
                    <th className="px-3 py-2 text-right">{isSale ? "ราคาสุทธิ" : "ส่วนต่าง (หยวน)"}</th>
                    <th className="px-3 py-2 text-right">ค่าคอมมิชชัน (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                        ไม่พบรายการที่เบิกได้ในช่วงเวลานี้ (ชำระแล้ว · ยังไม่ถูกเบิก)
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const checked = selected.has(r.key);
                      return (
                        <tr key={r.key} className={checked ? "bg-primary-50/60" : "hover:bg-gray-50/60"}>
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(r.key)}
                              aria-label={`เลือก ${r.label}`}
                              className="h-4 w-4"
                            />
                          </td>
                          <td className="px-3 py-1.5 font-medium text-primary-700">{r.label}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-600">{r.sub}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-600">{shortDate(r.walletDate)}</td>
                          <td className="px-3 py-1.5 text-right">{fmt2(r.basis)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{fmt2(r.commission)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary + create fields */}
          {searched && rows.length > 0 && (
            <>
              <div className="grid gap-3 rounded-lg bg-primary-50 px-4 py-3 text-sm sm:grid-cols-4">
                <div>
                  เลือกแล้ว <span className="font-bold">{selected.size}</span> รายการ
                </div>
                <div>
                  ก่อนหัก <span className="font-bold">฿{fmt2(preview.commBefore)}</span>
                </div>
                <div>
                  WHT 3% <span className="font-bold text-muted">฿{fmt2(preview.withholding)}</span>
                </div>
                <div>
                  สุทธิ <span className="text-lg font-bold text-primary-700">฿{fmt2(preview.net)}</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="cb-account">
                    บัญชีรับเงิน (จ่ายจากบัญชีบริษัท)
                  </label>
                  <select
                    id="cb-account"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
                  >
                    <option value="">— เลือกบัญชี —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.bankname} · {a.accountnumber} · {a.accountname}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="cb-title">
                    ชื่อเรื่องที่เบิกเงิน
                  </label>
                  <input
                    id="cb-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={300}
                    placeholder={`ค่าคอม${isSale ? "เซลล์" : "ล่ามจีน"} ${payeeId}`}
                    className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm hover:bg-gray-50"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={creating || !searched || rows.length === 0 || selected.size === 0}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {creating ? "กำลังสร้าง…" : "ยืนยันสร้างรายการเบิก"}
          </button>
        </div>
      </div>
    </div>
  );
}
