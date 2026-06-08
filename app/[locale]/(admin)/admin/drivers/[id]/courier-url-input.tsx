"use client";

/**
 * <CourierUrlInput> — set / clear the external-courier (Lalamove / Grab /
 * 3rd-party truck) tracking URL on a forwarder row.
 *
 * 2026-06-08 gap analysis #2 (AIR-import dispatch). Ops pastes the courier's
 * own tracking URL here; the customer then sees a "ติดตามพัสดุ (ขนส่งภายนอก)"
 * link on the /service-import/[fNo] detail page. Writes
 * tb_forwarder.courier_tracking_url via setForwarderCourierUrl.
 *
 * §0f: confirm-before-mutate — saving (and clearing) goes through a styled
 * confirm dialog before the action fires.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Check, Loader2 } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { setForwarderCourierUrl } from "@/actions/admin/driver-batches";

export function CourierUrlInput({
  forwarderId,
  initialUrl,
}: {
  forwarderId: number;
  initialUrl: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmed = url.trim();
  const dirty = trimmed !== (initialUrl ?? "");

  async function handleSave() {
    setErr(null);
    setSaved(false);
    const clearing = trimmed === "";
    const ok = await confirm(
      clearing
        ? `ลบลิงก์ติดตามขนส่งภายนอกของรายการ #${forwarderId}?`
        : `บันทึกลิงก์ติดตามขนส่งภายนอกของรายการ #${forwarderId}?\nลูกค้าจะเห็นลิงก์นี้ในหน้ารายละเอียดออเดอร์`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await setForwarderCourierUrl({ forwarderId, url: trimmed });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-dashed border-border bg-surface-alt/30 p-2.5">
      <label
        htmlFor={`courier-url-${forwarderId}`}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"
      >
        <Link2 className="h-3 w-3" />
        ลิงก์ติดตามขนส่งภายนอก (Lalamove / Grab / รถเหมา) — ลูกค้าเห็น
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <input
          id={`courier-url-${forwarderId}`}
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://share.lalamove.com/…"
          className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1 text-xs text-foreground placeholder:text-muted focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          บันทึก
        </button>
      </div>
      {err && <p className="mt-1 text-[11px] text-rose-700">{err}</p>}
      {saved && <p className="mt-1 text-[11px] text-emerald-700">✓ บันทึกแล้ว</p>}
    </div>
  );
}
