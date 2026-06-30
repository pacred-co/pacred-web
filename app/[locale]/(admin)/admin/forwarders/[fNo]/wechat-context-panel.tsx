/**
 * WeChat China-ops context panel — READ-ONLY, server-rendered.
 *
 * Mounts on /admin/forwarders/[fNo] (the ฝากนำเข้า detail page). Shows the
 * China-side coordination chat messages (mig 0228 · wechat_ops_message) that
 * mention THIS order's container code / China tracking / customer PR code, so
 * staff can answer "จีนว่าไงเรื่องตู้/แทรคนี้" without leaving the page.
 *
 * Gated by the host page (requireAdmin ops/accounting/warehouse + god) — this
 * component does NOT widen access; it's only rendered after the page's gate.
 * Pure read: the data fn does one SELECT, writes nothing.
 *
 * @see lib/admin/wechat-forwarder-context.ts — the read-only data fn + match logic
 */
import { loadWechatForwarderContext } from "@/lib/admin/wechat-forwarder-context";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import { Link } from "@/i18n/navigation";

export async function WechatContextPanel({
  fcabinetnumber,
  ftrackingchn,
  userid,
}: {
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  userid: string | null;
}) {
  const { messages, searchedTokens, truncated } = await loadWechatForwarderContext({
    fcabinetnumber,
    ftrackingchn,
    userid,
  });

  // Nothing to search on (no container / tracking / PR) → render nothing rather
  // than an empty box that would just clutter every brand-new order.
  if (searchedTokens.length === 0) return null;

  // Collapsed by default (owner 2026-06-30: "ข้อความยาวเกินไป → ย่อซ่อนไว้"). Native
  // <details> keeps this server-rendered (no client JS) — the summary shows the count,
  // staff expand only when they need "จีนว่าไงเรื่องตู้นี้".
  return (
    <details className="group rounded-2xl border border-emerald-200 bg-emerald-50/40 dark:bg-surface shadow-sm">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 p-3.5 md:p-4 list-none">
        <span className="min-w-0 flex items-center gap-2 text-sm md:text-base font-bold text-emerald-800 dark:text-emerald-300">
          <span className="text-muted transition-transform group-open:rotate-90">▶</span>
          💬 จีนว่าไงเรื่องตู้/แทรคนี้
          <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            {messages.length} ข้อความ
          </span>
          <span className="text-muted font-normal text-[11px]">(WeChat · กดดู)</span>
        </span>
        <span className="shrink-0 text-[11px] text-muted group-open:hidden">แตะเพื่ออ่าน</span>
      </summary>

      <div className="px-3.5 md:px-4 pb-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="mt-0.5 text-[11px] text-muted">
            ค้นจาก:{" "}
            {searchedTokens.map((t, i) => (
              <span key={t}>
                {i > 0 && " · "}
                <span className="font-mono text-foreground">{t}</span>
              </span>
            ))}
            {" "}· อ่านอย่างเดียว
          </p>
        </div>
        <Link
          href="/admin/wechat-ops"
          className="shrink-0 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
        >
          เปิดคลังแชททั้งหมด →
        </Link>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-emerald-300 p-4 text-center text-sm text-muted">
          ยังไม่พบข้อความ WeChat ที่อ้างถึงตู้/แทรค/ลูกค้ารายนี้
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {messages.map((m, i) => {
              const mine = m.sender === "me";
              return (
                <div
                  key={i}
                  className={`rounded-lg border border-emerald-200 px-3 py-2 text-sm ${
                    mine ? "bg-emerald-100/50" : "bg-white dark:bg-surface"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted mb-0.5">
                    <span className="font-medium text-foreground">
                      {mine ? "🟢 เรา" : m.sender || "—"}
                    </span>
                    <span className="truncate max-w-[50%]" title={m.chat_name}>
                      {m.chat_name}
                    </span>
                    <span className="whitespace-nowrap">{formatThaiDateTime(m.sent_at)}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-foreground">{m.content}</div>
                </div>
              );
            })}
          </div>
          {truncated && (
            <p className="text-[11px] text-muted">
              แสดง {messages.length} ข้อความล่าสุดที่เกี่ยวข้อง — มีมากกว่านี้ ดูที่{" "}
              <Link href="/admin/wechat-ops" className="text-emerald-700 underline">
                คลังแชททั้งหมด
              </Link>
            </p>
          )}
        </>
      )}
      </div>
    </details>
  );
}
