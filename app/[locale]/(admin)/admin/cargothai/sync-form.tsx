"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminSyncCargoThai } from "@/actions/admin/cargothai";

/**
 * /admin/cargothai manual sync form — Sprint-7 foundation.
 *
 * Date-range picker (defaults: from = yesterday, to = today) + "Sync now"
 * button. On success, shows the per-row counters (containers/items
 * scanned/inserted/updated/pages_fetched) and refreshes the page so the
 * "Last sync" + counts update.
 */
export function SyncForm({ tokenConfigured }: { tokenConfigured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const yday  = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(yday);
  const [to,   setTo]   = useState(today);
  const [msg, setMsg]   = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function handleSync(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setMsg(null);
    startTransition(async () => {
      const res = await adminSyncCargoThai({ from, to });
      if (!res.ok) {
        setMsg({ tone: "err", text: res.error });
        return;
      }
      const s = res.data;
      if (!s) {
        setMsg({ tone: "ok", text: "Sync เสร็จ แต่ไม่ได้รับ summary" });
      } else {
        setMsg({
          tone: "ok",
          text:
            `Sync เสร็จ ${s.pages_fetched} หน้า · ` +
            `containers: ${s.containers_scanned} (เพิ่ม ${s.containers_inserted} · แก้ไข ${s.containers_updated}) · ` +
            `items: ${s.items_scanned} (เพิ่ม ${s.items_inserted} · แก้ไข ${s.items_updated})`,
        });
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSync} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-semibold mb-1" htmlFor="from">
          From
        </label>
        <input
          id="from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          required
          disabled={pending}
          className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" htmlFor="to">
          To
        </label>
        <input
          id="to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
          disabled={pending}
          className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={pending || !tokenConfigured}>
        {pending ? "กำลัง sync..." : "Sync now"}
      </Button>
      {!tokenConfigured && (
        <span className="text-xs text-amber-700">
          (ปุ่ม disabled เพราะยังไม่มี token)
        </span>
      )}
      {msg && (
        <div
          className={`mt-2 w-full rounded-lg border px-3 py-2 text-xs ${
            msg.tone === "ok"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {msg.text}
        </div>
      )}
    </form>
  );
}
