"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSetWalletTxSlipTransferredAt } from "@/actions/admin/wallet";
import { adminSetYuanSlipTransferredAt } from "@/actions/admin/yuan-payments";

// V-A1 — inline cell for editing slip_transferred_at (the actual bank-
// transfer time from the customer's slip). Reused on /admin/wallet +
// /admin/yuan-payments per-row. Default state = readable display +
// pencil icon; click pencil → datetime-local picker + save/cancel.

const inputCls =
  "rounded border border-border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50";

/** ISO timestamp → "YYYY-MM-DDTHH:mm" suitable for <input type="datetime-local"> */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props =
  | { kind: "wallet_tx";    id: string; currentValue: string | null }
  | { kind: "yuan_payment"; id: string; currentValue: string | null };

export function SlipTransferredAtCell(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(isoToLocalInput(props.currentValue));
  const [err, setErr]         = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const value = draft ? new Date(draft).toISOString() : "";
    startTransition(async () => {
      const res = props.kind === "wallet_tx"
        ? await adminSetWalletTxSlipTransferredAt({ id: props.id, slip_transferred_at: value })
        : await adminSetYuanSlipTransferredAt({ id: props.id, slip_transferred_at: value });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  if (!editing) {
    return (
      <div className="text-xs">
        {props.currentValue ? (
          <span className="text-foreground">
            {new Date(props.currentValue).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
          </span>
        ) : (
          <span className="text-muted italic">— ไม่ได้บันทึก</span>
        )}
        <button
          type="button"
          onClick={() => { setEditing(true); setDraft(isoToLocalInput(props.currentValue)); }}
          className="ml-1 text-[10px] text-primary-500 hover:underline"
        >
          ✏️
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <input
        type="datetime-local"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className={inputCls}
        autoFocus
        disabled={pending}
      />
      {err && <div className="text-[10px] text-red-700">{err}</div>}
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-primary-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "..." : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setErr(null); }}
          disabled={pending}
          className="rounded border border-border bg-white px-2 py-1 text-[10px] hover:bg-surface-alt"
        >
          ยกเลิก
        </button>
        {draft && (
          <button
            type="button"
            onClick={() => setDraft("")}
            disabled={pending}
            className="text-[10px] text-muted hover:underline"
          >
            ล้าง
          </button>
        )}
      </div>
    </form>
  );
}
