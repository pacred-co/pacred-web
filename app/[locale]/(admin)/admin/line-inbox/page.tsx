import {
  getLineInboxCustomers,
  getLineCustomerThread,
  getLineInboxStats,
} from "@/actions/admin/line-inbox";
import type {
  LineCustomer,
  LineMessage,
} from "@/lib/admin/line-inbox-types";
import { relativeTimeTh } from "@/lib/utils/relative-time";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  MessageCircle,
  Users,
  MessageSquare,
  ArrowDownLeft,
  UsersRound,
  ImageIcon,
  ChevronLeft,
} from "lucide-react";

// Reads cookies (auth) + live DB → must render per-request.
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-green-50 text-green-700 border-green-200",
  follow:    "bg-green-50 text-green-700 border-green-200",
  following: "bg-green-50 text-green-700 border-green-200",
  blocked:   "bg-red-50 text-red-700 border-red-200",
  unfollow:  "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_LABEL: Record<string, string> = {
  active:    "ติดตามอยู่",
  follow:    "ติดตามอยู่",
  following: "ติดตามอยู่",
  blocked:   "บล็อก",
  unfollow:  "เลิกติดตาม",
};

export default async function AdminLineInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const selectedId = sp.c ?? null;

  // Stat cards + customer list always load. The thread only loads when a
  // customer is selected. Run them together so the panel doesn't waterfall.
  const [stats, customers, thread] = await Promise.all([
    getLineInboxStats(),
    getLineInboxCustomers(),
    selectedId ? getLineCustomerThread(selectedId) : Promise.resolve(null),
  ]);

  const selectedCustomer = thread?.customer ?? null;

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="hidden sm:inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary-50 text-primary-600 shrink-0">
          <MessageCircle className="w-6 h-6" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · CRM</p>
          <h1 className="mt-0.5 text-xl sm:text-2xl font-bold">กล่องข้อความ LINE</h1>
          <p className="mt-1 text-sm text-muted">
            ลูกค้าและข้อความจาก LINE OA ของ Pacred — ดูประวัติการสนทนา รายลูกค้า
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="ลูกค้า LINE"
          value={stats.totalCustomers}
          tone="primary"
        />
        <StatCard
          icon={<MessageSquare className="w-5 h-5" />}
          label="ข้อความทั้งหมด"
          value={stats.totalMessages}
          tone="slate"
        />
        <StatCard
          icon={<ArrowDownLeft className="w-5 h-5" />}
          label="ลูกค้าส่งเข้า"
          value={stats.inboundMessages}
          sub={`ส่งออก ${stats.outboundMessages.toLocaleString("th-TH")}`}
          tone="blue"
        />
        <StatCard
          icon={<UsersRound className="w-5 h-5" />}
          label="ข้อความจากกลุ่ม"
          value={stats.distinctGroups}
          tone="amber"
        />
      </div>

      {/* List + thread — 2-col on desktop, stacked on mobile. On mobile we
          show ONLY the thread when a customer is selected (back link returns
          to the list) so the phone screen isn't split. */}
      <div className="grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-4 items-start">
        {/* Customer list */}
        <div className={selectedId ? "hidden lg:block" : "block"}>
          <CustomerList customers={customers} selectedId={selectedId} />
        </div>

        {/* Thread panel */}
        <div className={selectedId ? "block" : "hidden lg:block"}>
          {selectedId ? (
            <ThreadPanel
              customer={selectedCustomer}
              messages={thread?.messages ?? []}
            />
          ) : (
            <EmptyThreadPlaceholder />
          )}
        </div>
      </div>
    </main>
  );
}

// ── Stat card ───────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  tone: "primary" | "slate" | "blue" | "amber";
}) {
  const toneClass = {
    primary: "bg-primary-50 text-primary-600",
    slate:   "bg-slate-100 text-slate-600",
    blue:    "bg-blue-50 text-blue-600",
    amber:   "bg-amber-50 text-amber-600",
  }[tone];

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${toneClass}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted truncate">{label}</p>
          <p className="text-xl sm:text-2xl font-bold leading-tight">
            {value.toLocaleString("th-TH")}
          </p>
        </div>
      </div>
      {sub && <p className="mt-2 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

// ── Customer list ─────────────────────────────────────────────────────────
function CustomerList({
  customers,
  selectedId,
}: {
  customers: LineCustomer[];
  selectedId: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-surface-alt/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          ลูกค้า LINE ({customers.length.toLocaleString("th-TH")})
        </p>
      </div>

      {customers.length === 0 ? (
        <div className="p-10 text-center">
          <MessageCircle className="w-10 h-10 mx-auto text-muted/40" />
          <p className="mt-3 text-sm text-muted">ยังไม่มีลูกค้า LINE</p>
        </div>
      ) : (
        <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto scrollbar-x-visible">
          {customers.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/line-inbox?c=${encodeURIComponent(c.id)}`}
                className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                  selectedId === c.id
                    ? "bg-primary-50"
                    : "hover:bg-surface-alt/60"
                }`}
              >
                <Avatar
                  url={c.picture_url}
                  name={c.display_name}
                  className="w-10 h-10 text-sm shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">
                    {c.display_name || "ผู้ใช้ LINE"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted truncate">
                    {c.last_message_text || "— ยังไม่มีข้อความ —"}
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-muted/80">
                      {relativeTimeTh(c.last_message_at)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-1.5 py-0.5 text-[10px] text-muted">
                      <MessageSquare className="w-3 h-3" />
                      {(c.total_messages ?? 0).toLocaleString("th-TH")}
                    </span>
                    {c.status && (
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                          STATUS_BADGE[c.status] ?? "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Thread panel ────────────────────────────────────────────────────────
function ThreadPanel({
  customer,
  messages,
}: {
  customer: LineCustomer | null;
  messages: LineMessage[];
}) {
  if (!customer) {
    return (
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-10 text-center">
        <p className="text-sm text-muted">ไม่พบลูกค้ารายนี้</p>
        <Link
          href="/admin/line-inbox"
          className="mt-3 inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
        >
          <ChevronLeft className="w-4 h-4" /> กลับไปที่รายชื่อ
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden flex flex-col max-h-[78vh]">
      {/* Thread header */}
      <div className="px-4 py-3 border-b border-border bg-surface-alt/40 flex items-center gap-3">
        {/* Back link — mobile only (desktop keeps the list visible) */}
        <Link
          href="/admin/line-inbox"
          className="lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-surface-alt text-muted shrink-0"
          aria-label="กลับ"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Avatar
          url={customer.picture_url}
          name={customer.display_name}
          className="w-10 h-10 text-sm shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">
            {customer.display_name || "ผู้ใช้ LINE"}
          </p>
          <p className="text-[11px] text-muted truncate">
            <span className="font-mono">{customer.line_user_id || "—"}</span>
            {customer.status && (
              <> · {STATUS_LABEL[customer.status] ?? customer.status}</>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-muted">
            ข้อความ {(customer.total_messages ?? 0).toLocaleString("th-TH")}
          </p>
          <p className="text-[10px] text-muted/70">
            เข้า {(customer.total_inbound_messages ?? 0).toLocaleString("th-TH")}
            {" · "}
            ออก {(customer.total_outbound_messages ?? 0).toLocaleString("th-TH")}
          </p>
        </div>
      </div>

      {/* Customer meta strip */}
      <div className="px-4 py-2 border-b border-border flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted bg-white dark:bg-surface">
        {customer.first_follow_at && (
          <span>ติดตามเมื่อ {new Date(customer.first_follow_at).toLocaleDateString("th-TH")}</span>
        )}
        {customer.first_message_at && (
          <span>คุยครั้งแรก {new Date(customer.first_message_at).toLocaleDateString("th-TH")}</span>
        )}
        {customer.last_message_at && (
          <span>ล่าสุด {relativeTimeTh(customer.last_message_at)}</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-alt/20">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">ยังไม่มีข้อความในห้องสนทนานี้</p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>
    </div>
  );
}

// ── One message bubble ─────────────────────────────────────────────────────
function MessageBubble({ message }: { message: LineMessage }) {
  const outbound = message.direction === "outbound";
  const isImage = message.message_type === "image";
  const media = message.media_url || message.file_url || null;

  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
          outbound
            ? "bg-primary-600 text-white rounded-br-sm"
            : "bg-white dark:bg-surface border border-border rounded-bl-sm"
        }`}
      >
        {message.group_name && (
          <p
            className={`text-[10px] font-medium mb-1 ${
              outbound ? "text-white/80" : "text-primary-600"
            }`}
          >
            <UsersRound className="inline w-3 h-3 mr-0.5" />
            {message.group_name}
          </p>
        )}

        {isImage ? (
          media ? (
            <a
              href={media}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1.5 ${
                outbound ? "text-white underline" : "text-primary-600 hover:underline"
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              [รูปภาพ]
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 opacity-90">
              <ImageIcon className="w-4 h-4" />
              [รูปภาพ]
            </span>
          )
        ) : message.message_text ? (
          <p className="whitespace-pre-wrap break-words">{message.message_text}</p>
        ) : (
          <p className="italic opacity-75">
            [{message.message_type || "ข้อความ"}]
          </p>
        )}

        <p
          className={`mt-1 text-[10px] ${
            outbound ? "text-white/70 text-right" : "text-muted"
          }`}
        >
          {message.sent_at
            ? new Date(message.sent_at).toLocaleString("th-TH", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </p>
      </div>
    </div>
  );
}

// ── Empty thread placeholder (desktop, nothing selected) ───────────────────
function EmptyThreadPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white/60 dark:bg-surface/60 shadow-sm p-12 text-center">
      <MessageCircle className="w-12 h-12 mx-auto text-muted/30" />
      <p className="mt-4 text-sm font-medium text-foreground/80">
        เลือกลูกค้าเพื่อดูประวัติการสนทนา
      </p>
      <p className="mt-1 text-xs text-muted">
        คลิกที่รายชื่อด้านซ้ายเพื่อเปิดห้องสนทนา LINE
      </p>
    </div>
  );
}

// ── Avatar (LINE picture_url or initial fallback) ──────────────────────────
function Avatar({
  url,
  name,
  className = "",
}: {
  url: string | null;
  name: string | null;
  className?: string;
}) {
  const initial = (name?.trim().charAt(0) || "L").toUpperCase();
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external LINE CDN avatar; next/image not configured for line.me hosts
      <img
        src={url}
        alt={name || "LINE"}
        className={`rounded-full object-cover bg-surface-alt ${className}`}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-primary-100 text-primary-700 font-bold ${className}`}
    >
      {initial}
    </span>
  );
}
