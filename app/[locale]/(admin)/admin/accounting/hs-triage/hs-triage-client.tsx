"use client";

/**
 * GAP 5 — the CS HS-triage queue UI. One row per line missing an HS code;
 * CS types the HS (with a live คลัง HS duty hint via lookupHsCode), confirms,
 * and saves (setLineHsCode writes ONLY hs_code · §0e). A saved row drops out of
 * the queue. Reference duty hint is informational — it never changes any cost.
 */
import { useState, useEffect, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { setLineHsCode } from "@/actions/admin/hs-triage";
import { lookupHsCode, type HsLookupRow } from "@/actions/admin/hs-codes";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import type { HsTriageForwarderLine, HsTriageShopLine } from "@/actions/admin/hs-triage";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type HsHint = null | "loading" | "notfound" | HsLookupRow;

/** Debounced คลัง HS lookup → duty hint. Reference only. */
function useHsHint(code: string): HsHint {
  const [hint, setHint] = useState<HsHint>(null);
  useEffect(() => {
    const c = code.trim();
    let cancelled = false;
    if (c.length < 3) {
      queueMicrotask(() => { if (!cancelled) setHint(null); });
      return () => { cancelled = true; };
    }
    queueMicrotask(() => { if (!cancelled) setHint("loading"); });
    const t = setTimeout(() => {
      lookupHsCode(c).then((res) => {
        if (cancelled) return;
        setHint(res.ok && res.data ? res.data : "notfound");
      }).catch(() => { if (!cancelled) setHint("notfound"); });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [code]);
  return hint;
}

function HsHintLine({ hint }: { hint: HsHint }) {
  if (hint === null) return null;
  if (hint === "loading") return <span className="text-[10px] text-muted">กำลังค้นคลัง HS…</span>;
  if (hint === "notfound") return <span className="text-[10px] text-amber-600">— ไม่พบใน คลัง HS —</span>;
  return (
    <span className="text-[10px] text-emerald-700">
      อากรปกติ {hint.default_duty_pct}% · Form-E {hint.form_e_duty_pct}%
      {hint.description ? ` · ${hint.description}` : ""}
    </span>
  );
}

function TriageRow({
  title,
  subtitle,
  href,
  onSave,
}: {
  title: string;
  subtitle: string;
  href: string;
  onSave: (hs: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [hs, setHs] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hint = useHsHint(hs);
  const { confirm, dialogs } = useConfirmDialogs();

  async function save() {
    setErr(null);
    if (hs.trim() === "") { setErr("กรอกเลข HS ก่อน"); return; }
    const ok = await confirm(`บันทึก HS "${hs.trim()}" ให้รายการนี้?`);
    if (!ok) return;
    startTransition(async () => {
      const res = await onSave(hs.trim());
      if (res.ok) setDone(true);
      else setErr(res.error ?? "บันทึกไม่สำเร็จ");
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        ✓ บันทึก HS <b>{hs.trim()}</b> แล้ว — {title}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface p-2.5">
      {dialogs}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="min-w-0 flex-1">
          <Link href={href} className="text-xs font-medium text-primary-600 hover:underline break-words line-clamp-1">
            {title}
          </Link>
          <p className="text-[10px] text-muted truncate">{subtitle}</p>
        </div>
        <div className="sm:w-64 space-y-0.5">
          <div className="flex gap-1.5">
            <input
              value={hs}
              onChange={(e) => setHs(e.target.value)}
              placeholder="HS เช่น 8471.30.20"
              maxLength={40}
              className={inputCls}
            />
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50 whitespace-nowrap"
            >
              {pending ? "…" : "บันทึก"}
            </button>
          </div>
          <HsHintLine hint={hint} />
          {err && <span className="block text-[10px] text-red-600">{err}</span>}
        </div>
      </div>
    </div>
  );
}

export function HsTriageClient({
  forwarderLines,
  shopLines,
}: {
  forwarderLines: HsTriageForwarderLine[];
  shopLines: HsTriageShopLine[];
}) {
  const total = forwarderLines.length + shopLines.length;
  if (total === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface-alt/30 px-4 py-10 text-center text-sm text-muted">
        🎉 ไม่มีรายการค้าง — ทุกรายการมี HS Code แล้ว
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {forwarderLines.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-foreground">📦 ฝากนำเข้า ({forwarderLines.length})</h2>
          {forwarderLines.map((l) => (
            <TriageRow
              key={`fwd-${l.id}`}
              title={l.productname || "(ไม่มีชื่อสินค้า)"}
              subtitle={`ออเดอร์ #${l.fNo ?? l.fid ?? "—"}${l.customer ? ` · ลูกค้า ${l.customer}` : ""}`}
              href={`/admin/forwarders/${l.fid ?? ""}`}
              onSave={(hs) => setLineHsCode({ kind: "forwarder", id: l.id, hsCode: hs })}
            />
          ))}
        </section>
      )}
      {shopLines.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-foreground">🛒 ฝากสั่งซื้อ ({shopLines.length})</h2>
          {shopLines.map((l) => (
            <TriageRow
              key={`shop-${l.id}`}
              title={l.ctitle || "(ไม่มีชื่อสินค้า)"}
              subtitle={`ออเดอร์ ${l.hno ?? "—"}`}
              href={`/admin/service-orders/${l.hno ?? ""}`}
              onSave={(hs) => setLineHsCode({ kind: "shop", id: l.id, hsCode: hs })}
            />
          ))}
        </section>
      )}
    </div>
  );
}
