import { Link } from "@/i18n/navigation";
import { requireAdmin, getAdminRoles } from "@/lib/auth/require-admin";
import { relativeTimeTh } from "@/lib/utils/relative-time";
import {
  getCrmConversations,
  getCrmReps,
  getCrmCsReps,
  getCrmFunnel,
  getCustomer360,
} from "@/actions/admin/crm";
import { getTags } from "@/actions/admin/customer-tags";
import { getCustomerActivity } from "@/actions/admin/customer-activity";
// Thread reader lives in the existing line-inbox action (we build ON TOP of it).
import { getLineCustomerThread } from "@/actions/admin/line-inbox";
import { CRM_CHANNELS, type CrmChannel } from "@/lib/admin/crm-types";
import type { LineMessage } from "@/lib/admin/line-inbox-types";
import type { ActivityEntry } from "@/actions/admin/customer-activity-types";
import { TagChips } from "@/components/admin/tag-chips";
import { CustomerActivityTimeline } from "@/components/admin/customer-activity-timeline";
import { RepRouting } from "./rep-routing";
import { CsRouting } from "./cs-routing";
import { RepFilter } from "./rep-filter";
import {
  MessageSquare, Users, MessageCircle, PhoneCall, ImageIcon, ChevronLeft,
  Wallet, Package, BadgeCheck, UserX, MessagesSquare, Link2, Link2Off, ArrowRight,
} from "lucide-react";

// Reads PII (customer identity, phones, wallet) via createAdminClient on every
// request — must render per-request, never statically.
export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────────────────
// /admin/crm — the CRM core: omni-inbox + customer-360 + sales-rep routing.
//
// CEO opening-day directive (scale-blocker #1): omni-inbox + lead funnel +
// "ลูกค้าคนนี้ เซลไหนดูแล" rep-routing. Built ON TOP of ปอน's LINE data
// (Podeng_*) + the existing /admin/leads call-queue (linked, not rewritten).
//
//   LINE channel  = REAL (Podeng_customers_line + Podeng_line_messages).
//   Facebook tab  = STUB placeholder — no FB message table exists in the DB;
//                   ปอน owns the Messenger webhook (we don't fabricate data).
//
// Actions: actions/admin/crm.ts (disjoint from leads.ts + customers.ts).
// Spec: docs/research/ceo-directives-2026-06-01.md.
// ──────────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  follow: "bg-green-50 text-green-700 border-green-200",
  following: "bg-green-50 text-green-700 border-green-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
  unfollow: "bg-gray-100 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  active: "ติดตามอยู่",
  follow: "ติดตามอยู่",
  following: "ติดตามอยู่",
  blocked: "บล็อก",
  unfollow: "เลิกติดตาม",
};
const LEAD_STATUS_LABEL: Record<string, string> = {
  called: "ติดต่อแล้ว",
  no_answer: "ไม่รับสาย",
  closed: "ปิดการขาย",
  callback: "นัดโทรกลับ",
  not_interested: "ไม่สนใจ",
};

// Senior roles may reassign the owning rep (legacy: CEO/Manager/Sales-mgr).
const SENIOR_ROUTING_ROLES = ["super", "manager", "sales_admin"];

function isChannel(v: unknown): v is CrmChannel {
  return v === "line" || v === "facebook";
}

export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; c?: string; rep?: string }>;
}) {
  await requireAdmin(["super", "manager", "sales_admin", "sales", "ops"]);
  const roles = (await getAdminRoles()) ?? [];
  const canRoute = roles.some((r) => SENIOR_ROUTING_ROLES.includes(r));

  const sp = await searchParams;
  const channel: CrmChannel = isChannel(sp.channel) ? sp.channel : "line";
  const selectedId = sp.c ?? null;
  const repFilter = (sp.rep ?? "").trim() || null;

  // Funnel + reps + CS pool always load. Conversations + thread + 360 only for
  // the LINE channel (Facebook is a placeholder). Run them together (no waterfall).
  const isLine = channel === "line";
  const [funnelRes, repsRes, csRepsRes, convRes, threadData, c360Res] = await Promise.all([
    getCrmFunnel(),
    getCrmReps(),
    getCrmCsReps(),
    isLine ? getCrmConversations({ repFilter }) : Promise.resolve(null),
    isLine && selectedId ? getLineCustomerThread(selectedId) : Promise.resolve(null),
    isLine && selectedId
      ? getCustomer360({ lineCustomerId: selectedId })
      : Promise.resolve(null),
  ]);

  const funnel = funnelRes.ok ? funnelRes.data : undefined;
  const reps = repsRes.ok ? (repsRes.data?.reps ?? []) : [];
  const repGateNote = repsRes.ok ? (repsRes.data?.gateNote ?? null) : null;
  const csReps = csRepsRes.ok ? (csRepsRes.data?.reps ?? []) : [];
  const csGateNote = csRepsRes.ok ? (csRepsRes.data?.gateNote ?? null) : null;
  const conversations = convRes?.ok ? (convRes.data?.conversations ?? []) : [];
  const convErr = convRes && !convRes.ok ? convRes.error : null;
  const messages = threadData?.messages ?? [];
  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;
  const c360 = c360Res?.ok ? (c360Res.data ?? null) : null;

  // CRM depth (2026-06-08) — tags + activity timeline for the linked customer.
  // Depends on the resolved userid, so it runs after the initial Promise.all.
  let custTags: string[] = [];
  let custActivity: ActivityEntry[] = [];
  if (c360?.linked && c360.userid) {
    const [tagsRes, actRes] = await Promise.all([
      getTags(c360.userid),
      getCustomerActivity(c360.userid),
    ]);
    custTags = tagsRes.ok ? (tagsRes.data ?? []).map((t) => t.tag) : [];
    custActivity = actRes.ok ? (actRes.data ?? []) : [];
  }

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="hidden sm:inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary-50 text-primary-600 shrink-0">
          <MessageSquare className="w-6 h-6" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · CRM</p>
          <h1 className="mt-0.5 text-xl sm:text-2xl font-bold">CRM — ลูกค้าสัมพันธ์</h1>
          <p className="mt-1 text-sm text-muted">
            กล่องข้อความรวมทุกช่องทาง · ข้อมูลลูกค้า 360° · มอบหมายเซลล์ผู้ดูแล
          </p>
        </div>
      </div>

      {/* Lead funnel — link to the acquisition call-queue (/admin/leads) */}
      <FunnelStrip funnel={funnel} />

      {/* Channel tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {CRM_CHANNELS.map((ch) => {
          const active = ch.key === channel;
          const href = repFilter
            ? `/admin/crm?channel=${ch.key}&rep=${encodeURIComponent(repFilter)}`
            : `/admin/crm?channel=${ch.key}`;
          return (
            <Link
              key={ch.key}
              href={href}
              className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {ch.key === "line" ? <MessageCircle className="w-4 h-4" /> : <MessagesSquare className="w-4 h-4" />}
              {ch.label}
              {!ch.live && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                  รอ webhook
                </span>
              )}
            </Link>
          );
        })}
        <div className="ml-auto">
          {isLine && <RepFilter reps={reps} current={repFilter} />}
        </div>
      </div>

      {channel === "facebook" ? (
        <FacebookPlaceholder />
      ) : (
        <>
          {convErr ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
              โหลดบทสนทนาไม่สำเร็จ: {convErr}
            </div>
          ) : (
            <div className="grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,300px)] gap-4 items-start">
              {/* Conversation list */}
              <div className={selectedId ? "hidden lg:block" : "block"}>
                <ConversationList
                  conversations={conversations}
                  selectedId={selectedId}
                  repFilter={repFilter}
                  channel={channel}
                />
              </div>

              {/* Thread */}
              <div className={selectedId ? "block" : "hidden lg:block"}>
                {selectedId ? (
                  <ThreadPanel
                    conversationId={selectedId}
                    name={selectedConv?.displayName ?? null}
                    pictureUrl={selectedConv?.pictureUrl ?? null}
                    status={selectedConv?.status ?? null}
                    messages={messages}
                    repFilter={repFilter}
                  />
                ) : (
                  <EmptyThread />
                )}
              </div>

              {/* Customer 360 + rep routing */}
              <div className={selectedId ? "block" : "hidden lg:block"}>
                {selectedId ? (
                  <Customer360Panel
                    conversationId={selectedId}
                    c360={c360}
                    reps={reps}
                    repGateNote={repGateNote}
                    csReps={csReps}
                    csGateNote={csGateNote}
                    canRoute={canRoute}
                    tags={custTags}
                    activity={custActivity}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-white/60 dark:bg-surface/60 p-6 text-center text-xs text-muted">
                    เลือกบทสนทนาเพื่อดูข้อมูลลูกค้า 360°
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ── Lead funnel strip ───────────────────────────────────────────────────────
function FunnelStrip({ funnel }: { funnel?: { newLeads: number; contacted: number; quoted: number; won: number } }) {
  const stages: { label: string; value: number; tone: string; sub: string }[] = [
    { label: "ลูกค้าใหม่ (Lead)", value: funnel?.newLeads ?? 0, tone: "text-primary-600", sub: "ยังไม่ติดต่อ · มีเบอร์" },
    { label: "ติดต่อแล้ว", value: funnel?.contacted ?? 0, tone: "text-blue-600", sub: "มีบันทึกการโทร" },
    { label: "ขอใบเสนอราคา", value: funnel?.quoted ?? 0, tone: "text-amber-600", sub: "freight RFQ" },
    { label: "ปิดการขาย (Won)", value: funnel?.won ?? 0, tone: "text-green-700", sub: "ปิดได้แล้ว" },
  ];
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">กรวยการขาย (Lead funnel)</p>
        <Link
          href="/admin/leads"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
        >
          <PhoneCall className="w-3.5 h-3.5" /> ไปที่คิวโทรลูกค้า <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="flex-1 rounded-xl bg-surface-alt/50 px-3 py-2.5">
              <p className="text-[11px] text-muted truncate">{s.label}</p>
              <p className={`text-xl font-bold leading-tight ${s.tone}`}>
                {funnel ? s.value.toLocaleString("th-TH") : "—"}
              </p>
              <p className="text-[10px] text-muted/70">{s.sub}</p>
            </div>
            {i < stages.length - 1 && <ArrowRight className="hidden lg:block w-4 h-4 text-muted/40 shrink-0" />}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted/70">
        * แต่ละขั้นนับแยกกัน (ไม่ใช่ลำดับเดียวกันแบบเป๊ะ) — “ขอใบเสนอราคา” มาจาก freight RFQ
      </p>
    </div>
  );
}

// ── Conversation list ─────────────────────────────────────────────────────
function ConversationList({
  conversations,
  selectedId,
  repFilter,
  channel,
}: {
  conversations: import("@/lib/admin/crm-types").CrmConversation[];
  selectedId: string | null;
  repFilter: string | null;
  channel: CrmChannel;
}) {
  const qbase = (id: string) => {
    const params = new URLSearchParams();
    params.set("channel", channel);
    if (repFilter) params.set("rep", repFilter);
    params.set("c", id);
    return `/admin/crm?${params.toString()}`;
  };

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-surface-alt/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          บทสนทนา ({conversations.length.toLocaleString("th-TH")})
          {repFilter && <span className="ml-1 font-normal normal-case">· กรองตามเซล</span>}
        </p>
      </div>
      {conversations.length === 0 ? (
        <div className="p-10 text-center">
          <MessageCircle className="w-10 h-10 mx-auto text-muted/40" />
          <p className="mt-3 text-sm text-muted">
            {repFilter ? "ไม่มีบทสนทนาของเซลนี้" : "ยังไม่มีบทสนทนา"}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border max-h-[72vh] overflow-y-auto scrollbar-x-visible">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={qbase(c.id)}
                className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                  selectedId === c.id ? "bg-primary-50" : "hover:bg-surface-alt/60"
                }`}
              >
                <Avatar url={c.pictureUrl} name={c.displayName} className="w-10 h-10 text-sm shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm truncate">{c.displayName || "ผู้ใช้ LINE"}</p>
                    {c.linkedUserid ? (
                      <span title="ผูกกับลูกค้าในระบบแล้ว" className="inline-flex items-center text-green-600">
                        <Link2 className="w-3 h-3" />
                      </span>
                    ) : (
                      <span title="ยังไม่ผูกกับลูกค้าในระบบ" className="inline-flex items-center text-muted/50">
                        <Link2Off className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted truncate">
                    {c.lastMessageText || "— ยังไม่มีข้อความ —"}
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-muted/80">{relativeTimeTh(c.lastMessageAt)}</span>
                    {c.repName && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                        <Users className="w-3 h-3" />
                        {c.repName}
                      </span>
                    )}
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
  conversationId,
  name,
  pictureUrl,
  status,
  messages,
  repFilter,
}: {
  conversationId: string;
  name: string | null;
  pictureUrl: string | null;
  status: string | null;
  messages: LineMessage[];
  repFilter: string | null;
}) {
  const backHref = repFilter
    ? `/admin/crm?channel=line&rep=${encodeURIComponent(repFilter)}`
    : "/admin/crm?channel=line";
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden flex flex-col max-h-[78vh]">
      <div className="px-4 py-3 border-b border-border bg-surface-alt/40 flex items-center gap-3">
        <Link
          href={backHref}
          className="lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-surface-alt text-muted shrink-0"
          aria-label="กลับ"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Avatar url={pictureUrl} name={name} className="w-10 h-10 text-sm shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{name || "ผู้ใช้ LINE"}</p>
          {status && <p className="text-[11px] text-muted">{STATUS_LABEL[status] ?? status}</p>}
        </div>
        {/* Manage in the full LINE inbox (assign agent · link member · reply box).
            The omni-inbox thread here is read-only; the richer CRM panel lives at
            /admin/line-inbox (same Podeng_customers_line.id key). */}
        <Link
          href={`/admin/line-inbox?c=${encodeURIComponent(conversationId)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-primary-600 hover:bg-surface-alt shrink-0"
          title="เปิดในกล่องข้อความ LINE เพื่อจัดการเต็มรูปแบบ (มอบหมายผู้ดูแล · ผูกบัญชี · ตอบกลับ)"
        >
          <MessageCircle className="w-3.5 h-3.5" /> จัดการเต็ม
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-alt/20">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">ยังไม่มีข้อความในห้องสนทนานี้</p>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: LineMessage }) {
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
          <p className={`text-[10px] font-medium mb-1 ${outbound ? "text-white/80" : "text-primary-600"}`}>
            {message.group_name}
          </p>
        )}
        {isImage ? (
          media ? (
            <a
              href={media}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1.5 ${outbound ? "text-white underline" : "text-primary-600 hover:underline"}`}
            >
              <ImageIcon className="w-4 h-4" /> [รูปภาพ]
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 opacity-90">
              <ImageIcon className="w-4 h-4" /> [รูปภาพ]
            </span>
          )
        ) : message.message_text ? (
          <p className="whitespace-pre-wrap break-words">{message.message_text}</p>
        ) : (
          <p className="italic opacity-75">[{message.message_type || "ข้อความ"}]</p>
        )}
        <p className={`mt-1 text-[10px] ${outbound ? "text-white/70 text-right" : "text-muted"}`}>
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

// ── Customer 360 panel ──────────────────────────────────────────────────────
function Customer360Panel({
  conversationId,
  c360,
  reps,
  repGateNote,
  csReps,
  csGateNote,
  canRoute,
  tags,
  activity,
}: {
  conversationId: string;
  c360: import("@/lib/admin/crm-types").Customer360 | null;
  reps: import("@/lib/admin/crm-types").CrmRep[];
  repGateNote: string | null;
  csReps: import("@/lib/admin/crm-types").CrmCsRep[];
  csGateNote: string | null;
  canRoute: boolean;
  tags: string[];
  activity: ActivityEntry[];
}) {
  if (!c360 || !c360.linked || !c360.userid) {
    return (
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">ลูกค้า 360°</p>
        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-3 text-[11px] text-amber-800">
          <Link2Off className="inline w-3.5 h-3.5 mr-1" />
          ยังไม่ผูกบทสนทนานี้กับลูกค้าในระบบ (จับคู่ LINE ID ไม่พบ tb_users.userLineID)
        </div>
        <p className="text-[10px] text-muted/70">
          ระบบจับคู่จาก LINE ID อัตโนมัติ — ลูกค้าส่วนใหญ่กรอก “ไอดีไลน์” ตอนสมัคร ซึ่งมักไม่ตรงกับ
          LINE platform id จึงต้องผูกมือในภายหลัง
        </p>
        {/* Reachable manual-link path: the working linkLineContactToMember UI
            lives in the full LINE inbox (same Podeng_customers_line.id key) —
            link to it instead of dead-ending (§0d reachability). */}
        <Link
          href={`/admin/line-inbox?c=${encodeURIComponent(conversationId)}`}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white hover:bg-primary-700"
        >
          <Link2 className="w-3.5 h-3.5" /> ผูกกับลูกค้าในระบบ (ในกล่องข้อความ LINE)
        </Link>
      </div>
    );
  }

  const walletText =
    c360.walletBalance === null
      ? "— ไม่มีกระเป๋า —"
      : `฿${c360.walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-5 space-y-4">
      {/* Identity */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">ลูกค้า 360°</p>
        <div className="mt-2 flex items-start gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{c360.name}</p>
            <Link
              href={`/admin/customers?q=${encodeURIComponent(c360.userid)}`}
              className="font-mono text-xs text-primary-600 hover:underline"
            >
              {c360.userid}
            </Link>
            {c360.isCompany && (
              <span className="ml-2 inline-flex items-center rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-700">
                นิติบุคคล
              </span>
            )}
          </div>
        </div>
        {c360.tel && (
          <a href={`tel:${c360.tel}`} className="mt-1 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
            <PhoneCall className="w-3.5 h-3.5" /> {c360.tel}
          </a>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2">
        <Stat icon={<Package className="w-4 h-4" />} label="คำสั่งนำเข้า" value={c360.orderCount.toLocaleString("th-TH")} />
        <Stat icon={<Wallet className="w-4 h-4" />} label="ยอดกระเป๋า" value={walletText} small />
        <Stat
          icon={c360.userActive === "1" ? <BadgeCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
          label="สถานะลูกค้า"
          value={c360.userActive === "1" ? "ใช้งานอยู่" : "ยังไม่เปิดใช้ (Lead)"}
          small
        />
        <Stat
          icon={<PhoneCall className="w-4 h-4" />}
          label="สถานะการโทร"
          value={c360.leadStatus ? (LEAD_STATUS_LABEL[c360.leadStatus] ?? c360.leadStatus) : "ยังไม่โทร"}
          small
        />
      </div>
      {c360.lastCallAt && (
        <p className="text-[10px] text-muted/70 -mt-2">โทรล่าสุด {relativeTimeTh(c360.lastCallAt)}</p>
      )}

      {/* Rep routing — sales-rep mutation */}
      <div className="pt-3 border-t border-border">
        <RepRouting
          userid={c360.userid}
          currentRepLegacyId={c360.repLegacyId}
          reps={reps}
          gateNote={repGateNote}
          canEdit={canRoute}
        />
      </div>

      {/* CS routing — manual override of the close→CS auto-handoff (CEO §5:
          sale/CS ownership is flexible — assign / change / clear all allowed) */}
      <div className="pt-3 border-t border-border">
        <CsRouting
          userid={c360.userid}
          currentCsId={c360.csLegacyId}
          currentCsName={c360.csName}
          reps={csReps}
          gateNote={csGateNote}
          canEdit={canRoute}
        />
      </div>

      {/* Tags (CRM depth · 2026-06-08) */}
      <div className="pt-3 border-t border-border space-y-1.5">
        <p className="text-[11px] font-medium text-muted">แท็กลูกค้า</p>
        <TagChips userid={c360.userid} initialTags={tags} />
      </div>

      {/* Activity timeline (CRM depth · 2026-06-08) */}
      <div className="pt-3 border-t border-border space-y-1.5">
        <p className="text-[11px] font-medium text-muted">กิจกรรม / โน้ต</p>
        <CustomerActivityTimeline userid={c360.userid} initialEntries={activity} />
      </div>

      {/* Deep links */}
      <div className="pt-2 flex flex-wrap gap-2">
        <Link
          href={`/admin/customers?q=${encodeURIComponent(c360.userid)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-surface-alt"
        >
          <Users className="w-3.5 h-3.5" /> โปรไฟล์ลูกค้า
        </Link>
        <Link
          href={`/admin/leads?q=${encodeURIComponent(c360.userid)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-surface-alt"
        >
          <PhoneCall className="w-3.5 h-3.5" /> คิวโทร
        </Link>
        <Link
          href={`/admin/line-inbox?c=${encodeURIComponent(conversationId)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-surface-alt"
          title="มอบหมายผู้ดูแล · ตอบกลับ · จัดการในกล่องข้อความ LINE"
        >
          <MessageCircle className="w-3.5 h-3.5" /> จัดการแชต LINE
        </Link>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-alt/50 px-3 py-2">
      <span className="inline-flex items-center gap-1 text-[10px] text-muted">
        {icon}
        {label}
      </span>
      <p className={`font-semibold leading-tight ${small ? "text-xs" : "text-base"}`}>{value}</p>
    </div>
  );
}

// ── Empty thread placeholder ──────────────────────────────────────────────
function EmptyThread() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white/60 dark:bg-surface/60 shadow-sm p-12 text-center">
      <MessageCircle className="w-12 h-12 mx-auto text-muted/30" />
      <p className="mt-4 text-sm font-medium text-foreground/80">เลือกบทสนทนาเพื่อดูข้อความ</p>
      <p className="mt-1 text-xs text-muted">คลิกที่รายชื่อด้านซ้ายเพื่อเปิดห้องสนทนา</p>
    </div>
  );
}

// ── Facebook placeholder (no FB table in DB · ปอน lane) ────────────────────
function FacebookPlaceholder() {
  const note = CRM_CHANNELS.find((c) => c.key === "facebook")?.note;
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white/60 dark:bg-surface/60 p-12 text-center">
      <MessagesSquare className="w-12 h-12 mx-auto text-muted/30" />
      <p className="mt-4 text-sm font-semibold text-foreground/80">ช่องทาง Facebook / Messenger</p>
      <p className="mt-2 text-xs text-muted max-w-md mx-auto">{note}</p>
      <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 inline-block rounded-full px-3 py-1">
        รอ webhook (ปอน lane) — ยังไม่มีตารางข้อความ FB ในระบบ
      </p>
    </div>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ url, name, className = "" }: { url: string | null; name: string | null; className?: string }) {
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
    <span className={`inline-flex items-center justify-center rounded-full bg-primary-100 text-primary-700 font-bold ${className}`}>
      {initial}
    </span>
  );
}
