/**
 * /admin/wechat-ops — WeChat China-ops chat archive (READ-ONLY · mig 0228).
 *
 * The decrypted cargo-ops coordination chats (MOMO x PACRED · PCS CARGO ·
 * AXELRA / HUAHAI / FEISHENG / 柏盛泰 DOC · Yiwu · แลกหยวน · 退税 · per-container
 * groups) ingested into wechat_ops_message. Lets ops/CS SEARCH past China-side
 * coordination — "ปิดตู้วันไหน", "ตู้ไหน", a tracking number, a PR code —
 * instead of scrolling WeChat. Pure read; writes nothing.
 *
 * Gated super/ops/sales (+ god via requireAdmin) — internal partner comms.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/admin/page-header";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

function fmt(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok", year: "2-digit", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ts; }
}

export default async function WechatOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; chat?: string }>;
}) {
  await requireAdmin(["super", "ops", "sales"]);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const chat = (sp.chat ?? "").trim();
  const admin = createAdminClient();

  // top chats (for filter chips) — one light single-column read (chat_name only).
  // 30k cap covers the full archive so the histogram + total stay exact.
  const { data: chatRows, error: chatErr } = await admin
    .from("wechat_ops_message")
    .select("chat_name")
    .limit(30000);
  if (chatErr) console.error("[wechat-ops] chat list:", chatErr.message);
  const chatCounts = new Map<string, number>();
  for (const r of chatRows ?? []) chatCounts.set(r.chat_name, (chatCounts.get(r.chat_name) ?? 0) + 1);
  const topChats = [...chatCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  const total = chatRows?.length ?? 0;

  // message query
  let query = admin
    .from("wechat_ops_message")
    .select("chat_name, sender, sent_at, content")
    .order("sent_at", { ascending: false })
    .limit(300);
  if (chat) query = query.eq("chat_name", chat);
  if (q) query = query.ilike("content", `%${q}%`);
  const { data: msgs, error: msgErr } = await query;
  if (msgErr) console.error("[wechat-ops] messages:", msgErr.message);

  return (
    <div className="space-y-5">
      <nav className="text-[11px] text-muted">
        <Link href="/admin" className="hover:underline">Admin</Link>
        <span className="mx-1">/</span>
        <span className="text-foreground font-medium">WeChat ops archive</span>
      </nav>

      <PageHeader
        eyebrow="ADMIN · ฝากนำเข้า · China-ops"
        title="คลังแชท WeChat (จีน-โกดัง-ขนส่ง)"
        subtitle={`ค้นแชทประสานงานฝั่งจีน (MOMO · PCS · AXELRA/HUAHAI/FEISHENG/柏盛泰 · Yiwu · แลกหยวน · ขอคืนภาษี · กลุ่มตู้) — ${total.toLocaleString("th-TH")} ข้อความ · อ่านอย่างเดียว`}
      />

      <form method="GET" className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="ค้น: ปิดตู้ / เลขแทรค / PR012 / 报关 / GZS260628 …"
          className="flex-1 min-w-[260px] rounded-md border border-border bg-white px-3 py-2 text-sm"
        />
        {chat && <input type="hidden" name="chat" value={chat} />}
        <button className="rounded-md bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700">
          ค้นหา
        </button>
        {(q || chat) && (
          <Link href="/admin/wechat-ops" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-alt">
            ล้าง
          </Link>
        )}
      </form>

      {/* chat filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {topChats.map(([name, cnt]) => {
          const params = new URLSearchParams();
          params.set("chat", name);
          if (q) params.set("q", q);
          const active = chat === name;
          return (
            <Link
              key={name}
              href={`/admin/wechat-ops?${params.toString()}`}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium border ${
                active
                  ? "bg-primary-600 text-white border-primary-600"
                  : "bg-white text-foreground border-border hover:bg-surface-alt"
              }`}
            >
              {name.length > 28 ? name.slice(0, 28) + "…" : name} · {cnt}
            </Link>
          );
        })}
      </div>

      <div className="text-[11px] text-muted">
        {q || chat ? `แสดง ${msgs?.length ?? 0} ข้อความ${q ? ` ที่มี “${q}”` : ""}${chat ? ` ในกลุ่ม “${chat}”` : ""} (ล่าสุด 300)` : "เลือกกลุ่ม หรือพิมพ์คำค้น"}
      </div>

      <div className="space-y-1.5">
        {(msgs ?? []).map((m, i) => {
          const mine = m.sender === "me";
          return (
            <div
              key={i}
              className={`rounded-lg border border-border px-3 py-2 text-sm ${mine ? "bg-primary-50/40" : "bg-white"}`}
            >
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted mb-0.5">
                <span className="font-medium text-foreground">{mine ? "🟢 เรา" : m.sender}</span>
                <span className="truncate max-w-[55%]" title={m.chat_name}>{m.chat_name}</span>
                <span className="whitespace-nowrap">{fmt(m.sent_at)}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-foreground">{m.content}</div>
            </div>
          );
        })}
        {(!msgs || msgs.length === 0) && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
            ไม่พบข้อความ — ลองคำค้นอื่น หรือเลือกกลุ่มด้านบน
          </div>
        )}
      </div>
    </div>
  );
}
