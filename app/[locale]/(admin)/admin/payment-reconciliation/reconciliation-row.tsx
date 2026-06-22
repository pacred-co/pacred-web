"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { confirm, prompt } from "@/components/ui/confirm";
import {
  manualMatch,
  markUnmatched,
  type PendingReconciliationItem,
} from "@/actions/admin/payment-reconciliation";

/**
 * V-A3 Phase 2 — single-row UI for slip ↔ order reconciliation.
 * Three actions:
 *   - "จับคู่" with the top candidate (or a picked candidate via radio)
 *   - "ไม่จับคู่" → markUnmatched with reason prompt
 *   - "ตรวจรายละเอียด" → opens wallet_tx detail (existing surface)
 */

const THB = (n: number) => Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export function ReconciliationRow({ item }: { item: PendingReconciliationItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(
    item.candidates[0]?.forwarder_id ?? null,
  );

  const tx = item.wallet_tx;
  const p  = item.profile;
  const hasCandidates = item.candidates.length > 0;

  async function doManualMatch() {
    if (!picked) return;
    const cand = item.candidates.find((c) => c.forwarder_id === picked);
    if (cand && !cand.is_exact) {
      if (!(await confirm(`ยอดไม่ตรง ฿${THB(cand.amount_diff)} — ยังจะจับคู่กับ ${cand.f_no}?`))) return;
    }
    setErr(null); setMsg(null);
    startTransition(async () => {
      const res = await manualMatch({
        wallet_tx_id: tx.id,
        forwarder_id: picked,
      });
      if (res.ok && res.data) {
        setMsg(`✓ จับคู่ ${res.data.f_no} สำเร็จ · diff ฿${THB(res.data.amount_diff)}`);
        router.refresh();
      } else if (!res.ok) {
        setErr(res.error);
      }
    });
  }

  async function doMarkUnmatched() {
    const reason = await prompt("ระบุเหตุผลที่ไม่จับคู่ (3+ ตัวอักษร):");
    if (!reason || reason.trim().length < 3) {
      setErr("ต้องระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }
    setErr(null); setMsg(null);
    startTransition(async () => {
      const res = await markUnmatched({ wallet_tx_id: tx.id, reason: reason.trim() });
      if (res.ok) {
        setMsg("✓ บันทึกเป็น unmatched · ดูใน refund queue");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="space-y-2 text-xs">
      {/* Slip header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link
            href={`/admin/wallet/${tx.id}`}
            className="font-mono text-primary-600 hover:underline"
          >
            slip:{tx.id.slice(0, 8)}
          </Link>
          {p && (
            <span className="ml-2 text-muted">
              · {p.member_code ?? "—"} {p.first_name} {p.last_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-green-700">
            ฿{THB(Number(tx.amount))}
          </span>
          {tx.slip_transferred_at && (
            <span className="text-[11px] text-muted">
              slip: {new Date(tx.slip_transferred_at).toLocaleDateString("th-TH")}
            </span>
          )}
        </div>
      </div>

      {/* Candidates picker */}
      {hasCandidates ? (
        <div className="space-y-1 rounded-lg border border-border bg-surface-alt p-2">
          <p className="text-[11px] text-muted">เลือกใบที่จะจับคู่:</p>
          {item.candidates.map((c) => (
            <label key={c.forwarder_id} className="flex items-center gap-2 text-[11px] cursor-pointer">
              <input
                type="radio"
                name={`pick-${tx.id}`}
                value={c.forwarder_id}
                checked={picked === c.forwarder_id}
                onChange={() => setPicked(c.forwarder_id)}
                className="accent-primary-600"
              />
              <Link
                href={`/admin/forwarders/${c.f_no}`}
                className="font-mono text-primary-600 hover:underline"
                target="_blank"
              >
                {c.f_no}
              </Link>
              <span className="font-mono">฿{THB(c.total_price)}</span>
              {c.is_exact ? (
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[11px] text-green-700">
                  ยอดตรง
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700">
                  diff ฿{THB(c.amount_diff)}
                </span>
              )}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted italic">ลูกค้าไม่มีใบ pending_payment — slip นี้ลอย</p>
      )}

      {msg && <div className="rounded border border-green-200 bg-green-50 p-1.5 text-[11px] text-green-700">{msg}</div>}
      {err && <div className="rounded border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700">{err}</div>}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {hasCandidates && (
          <button
            type="button"
            onClick={doManualMatch}
            disabled={pending || !picked}
            className="rounded-lg bg-primary-600 text-white px-2.5 py-1 text-[11px] font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? "กำลัง..." : "✓ จับคู่"}
          </button>
        )}
        <button
          type="button"
          onClick={doMarkUnmatched}
          disabled={pending}
          className="rounded-lg border border-border bg-white px-2.5 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50"
        >
          ไม่จับคู่ →
        </button>
        <Link
          href={`/admin/wallet/${tx.id}`}
          className="rounded-lg border border-border bg-white px-2.5 py-1 text-[11px] hover:bg-surface-alt"
        >
          ตรวจ slip →
        </Link>
      </div>
    </div>
  );
}
