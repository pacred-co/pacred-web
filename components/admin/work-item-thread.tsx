"use client";

/**
 * IC-1.4 · <WorkItemThread> — the per-job internal-chat thread panel.
 *
 * Per docs/research/internal-chat-system-2026-05-18.md §5.2 (the ASCII art):
 * a reusable thread panel embedded on every domain detail page that has a
 * matching work_item — the work-item detail, /admin/freight/shipments/[id],
 * /admin/warehouse/containers/[code], /admin/orders/*, /admin/contact-messages.
 *
 * Renders three things in one interleaved timeline (oldest first):
 *   - `system`      — auto-inserted ("stage → packed", "assigned to ภูม")
 *   - `comment`     — human discussion
 *   - `status_note` — yellow-card "🔴 รอ: <reason>" with author + body
 *
 * Plus, above the timeline, a coloured "waiting-for" header that mirrors
 * work_items.{waiting_reason, blocked_on_role, blocked_on_admin} and offers
 * an "✅ mark unblocked" CTA (server enforces who may clear it).
 *
 * Composer:
 *   - Textarea + Send (`postMessage`)
 *   - @-autocomplete over active admins (calls `searchAdminsForMention`).
 *     Picked admins go into `mentionedAdminIds` — the server treats that as
 *     authoritative (so a user can't fake an @mention by typing the literal).
 *   - "⚑ mark waiting" opens an inline picker (8 reasons + optional dept +
 *     optional person) → `postStatusNote`.
 *
 * BK-1: polls on action (no Realtime — that lands in IC-2).  Mobile-first:
 * 44px tap targets, full-width composer, no horizontal scroll.
 *
 * All TH literals are tagged `// i18n-key:` so Agent C can swap them into
 * messages/{th,en}.json after Agent A's actions land.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Send,
  AtSign,
  Flag,
  CheckCircle,
  Trash2,
  MessageCircle,
  Loader2,
  Settings,
  X,
} from "lucide-react";

import { confirm } from "@/components/ui/confirm";
import { isGodRole } from "@/lib/admin/god-role";
import type { AdminRole } from "@/lib/auth/require-admin";
import { relativeTimeTh } from "@/lib/utils/relative-time";
import {
  WAITING_REASONS,
  WAITING_REASON_LABEL_TH,
  WAITING_REASON_BADGE,
  type WaitingReason,
  type WorkItemMessageRow,
  type WorkItemWaitingBlock,
} from "@/types/work-item-chat";

// Agent A is building this in parallel.  If the file is missing at compile
// time, the import will fail — that's intentional (we want the build to
// flag the missing dependency rather than ship a broken UI).  When Agent A
// lands the action file, this Just Works.
import {
  postMessage,
  postStatusNote,
  clearWaiting,
  softDeleteMessage,
  markThreadSeen,
  getWorkItemThread,
} from "@/actions/admin/work-item-messages";

import {
  searchAdminsForMention,
  type AdminPickerRow,
} from "@/actions/admin/search-admins";

// ────────────────────────────────────────────────────────────
// Constants / config
// ────────────────────────────────────────────────────────────

// The full admins.role enum (per lib/auth/require-admin.ts).  Hardcoded
// here for the "blocked on dept" picker — the alternative is round-tripping
// to the server for an enum we already know.
const ROLE_OPTIONS: { value: string; label_th: string }[] = [
  { value: "super",       label_th: "Super admin" },        // i18n-key: chat.role.super
  { value: "ops",         label_th: "Operations" },         // i18n-key: chat.role.ops
  { value: "accounting",  label_th: "บัญชี" },              // i18n-key: chat.role.accounting
  { value: "sales_admin", label_th: "เซลส์" },              // i18n-key: chat.role.sales_admin
  { value: "warehouse",   label_th: "คลังสินค้า" },         // i18n-key: chat.role.warehouse
  { value: "driver",      label_th: "พขร." },                // i18n-key: chat.role.driver
  { value: "interpreter", label_th: "ล่ามจีน" },            // i18n-key: chat.role.interpreter
];

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label_th]),
);

// The shape returned by getWorkItemThread — typed locally so this file
// compiles before Agent A finalises the action signature.
interface ThreadPayload {
  waiting: WorkItemWaitingBlock;
  messages: WorkItemMessageRow[];
  /** profile_id of the viewing admin — drives "is mine? show delete" + the
   *  unblock button visibility. */
  viewerProfileId: string;
  /** Viewer's admins.role list — drives "can I clear the wait?". */
  viewerRoles: string[];
}

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface WorkItemThreadProps {
  workItemId: string;
  /** Outer wrapper class — pass `h-full` when embedded in a fixed-height
   *  column, or omit to let it grow with content. */
  className?: string;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function WorkItemThread({ workItemId, className }: WorkItemThreadProps) {
  // ── Top-level load state ──
  const [payload, setPayload] = useState<ThreadPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Composer state ──
  const [body, setBody] = useState("");
  const [mentioned, setMentioned] = useState<AdminPickerRow[]>([]);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // ── @-autocomplete state ──
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = picker closed
  const [mentionResults, setMentionResults] = useState<AdminPickerRow[]>([]);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── "⚑ mark waiting" picker state ──
  const [showWaitPicker, setShowWaitPicker] = useState(false);
  const [waitReason, setWaitReason] = useState<WaitingReason>("confirm");
  const [waitBlockedRole, setWaitBlockedRole] = useState<string>("");
  const [waitBlockedAdmin, setWaitBlockedAdmin] = useState<string>("");
  const [waitBody, setWaitBody] = useState("");

  // ── "✅ unblock" confirm prompt state ──
  const [showUnblockForm, setShowUnblockForm] = useState(false);
  const [unblockNote, setUnblockNote] = useState("");

  // Track the textarea so we can re-position the @-dropdown if we want to
  // (BK-1: dropdown sits below the composer — anchor by container).
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // ──────────────────────────────────────────────────────
  // Loaders
  // ──────────────────────────────────────────────────────

  const refetch = useCallback(async () => {
    try {
      const res = await getWorkItemThread(workItemId);
      if (res.ok && res.data) {
        setPayload(res.data as unknown as ThreadPayload);
        setLoadError(null);
      } else {
        setLoadError(translateError(("error" in res && res.error) || "load_failed"));
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "load_failed");
    }
  }, [workItemId]);

  // Initial mount: load + mark seen.  Loading state initialised true in
  // useState; we only flip it false after the async work completes, so
  // no synchronous setState in the effect body (lint hygiene).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refetch();
      // markThreadSeen is fire-and-forget — drain unread badge in the
      // background; we don't block render on it.
      try {
        await markThreadSeen(workItemId);
      } catch {
        // best-effort
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workItemId, refetch]);

  // Debounced @-search.  ALL setState calls inside the async callback so
  // the effect body itself never sets state synchronously (lint hygiene
  // + the pattern customer-picker uses).
  useEffect(() => {
    if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
    let cancelled = false;
    const id = setTimeout(async () => {
      if (cancelled) return;
      if (mentionQuery == null) {
        setMentionResults([]);
        setMentionLoading(false);
        return;
      }
      setMentionLoading(true);
      const res = await searchAdminsForMention({ q: mentionQuery, limit: 10 });
      if (cancelled) return;
      if (res.ok) {
        setMentionResults(res.data.rows);
        setMentionHighlight(0);
      } else {
        setMentionResults([]);
      }
      setMentionLoading(false);
    }, 200);
    mentionDebounceRef.current = id;
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [mentionQuery]);

  // ──────────────────────────────────────────────────────
  // Composer — textarea + @-mention detection
  // ──────────────────────────────────────────────────────

  function onBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);
    // Detect `@<query>` at the caret — open the picker.  We look back from
    // the caret to the last whitespace/newline; if that span starts with @,
    // the rest is the query.
    const caret = e.target.selectionStart ?? val.length;
    const before = val.slice(0, caret);
    const m = before.match(/(?:^|[\s\n])@([^\s\n@]*)$/);
    if (m) {
      setMentionQuery(m[1] ?? "");
    } else {
      setMentionQuery(null);
    }
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery != null && mentionResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionHighlight((i) => (i + 1) % mentionResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionHighlight((i) => (i - 1 + mentionResults.length) % mentionResults.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const r = mentionResults[mentionHighlight];
        if (r) pickMention(r);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    // Submit on Ctrl/Cmd-Enter when picker is closed.
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      fireSend();
    }
  }

  function pickMention(row: AdminPickerRow) {
    // Replace the trailing `@<query>` token with `@<DisplayName> `.
    const ta = composerRef.current;
    const caret = ta?.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    const after  = body.slice(caret);
    const m = before.match(/(?:^|[\s\n])@([^\s\n@]*)$/);
    if (!m) return;
    const tokenStart = before.length - (m[0].endsWith(`@${m[1]}`) ? m[1].length + 1 : 0);
    const displayName = pickerLabel(row);
    const replacement = `@${displayName} `;
    const newBody = before.slice(0, tokenStart) + replacement + after;
    setBody(newBody);
    setMentionQuery(null);
    setMentionResults([]);

    // Track the picked profile_id (dedupe by id).
    setMentioned((prev) => {
      if (prev.some((p) => p.id === row.id)) return prev;
      return [...prev, row];
    });

    // Restore focus + place caret right after the inserted name.
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = tokenStart + replacement.length;
      ta?.setSelectionRange(pos, pos);
    });
  }

  function removeMention(id: string) {
    setMentioned((prev) => prev.filter((p) => p.id !== id));
  }

  // ──────────────────────────────────────────────────────
  // Action handlers
  // ──────────────────────────────────────────────────────

  function fireSend() {
    setActionError(null);
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      // i18n-key: chat.error.empty_body
      setActionError("กรุณาพิมพ์ข้อความก่อนส่ง");
      return;
    }
    startTransition(async () => {
      const res = await postMessage({
        workItemId,
        body: trimmed,
        mentionedAdminIds: mentioned.map((m) => m.id),
      });
      if (res.ok) {
        setBody("");
        setMentioned([]);
        // i18n-key: chat.success.sent
        flashSuccess("ส่งข้อความแล้ว");
        await refetch();
      } else {
        setActionError(translateError(("error" in res && res.error) || "send_failed"));
      }
    });
  }

  function fireMarkWaiting() {
    setActionError(null);
    const trimmed = waitBody.trim();
    if (trimmed.length < 3) {
      // i18n-key: chat.error.waiting_note_too_short
      setActionError("กรุณาใส่รายละเอียดอย่างน้อย 3 ตัวอักษร");
      return;
    }
    startTransition(async () => {
      const res = await postStatusNote({
        workItemId,
        body: trimmed,
        waitingReason: waitReason,
        blockedRole: waitBlockedRole || undefined,
        blockedAdmin: waitBlockedAdmin || undefined,
      });
      if (res.ok) {
        setShowWaitPicker(false);
        setWaitBody("");
        setWaitBlockedRole("");
        setWaitBlockedAdmin("");
        // i18n-key: chat.success.waiting_set
        flashSuccess("ตั้งสถานะรอแล้ว");
        await refetch();
      } else {
        setActionError(translateError(("error" in res && res.error) || "wait_failed"));
      }
    });
  }

  function fireUnblock() {
    setActionError(null);
    const trimmed = unblockNote.trim();
    if (trimmed.length < 3) {
      // i18n-key: chat.error.unblock_note_too_short
      setActionError("กรุณาใส่หมายเหตุการปลดบล็อก อย่างน้อย 3 ตัวอักษร");
      return;
    }
    startTransition(async () => {
      const res = await clearWaiting({ workItemId, body: trimmed });
      if (res.ok) {
        setShowUnblockForm(false);
        setUnblockNote("");
        // i18n-key: chat.success.unblocked
        flashSuccess("ปลดบล็อกแล้ว");
        await refetch();
      } else {
        setActionError(translateError(("error" in res && res.error) || "unblock_failed"));
      }
    });
  }

  async function fireDelete(messageId: string) {
    // i18n-key: chat.confirm.delete
    if (!(await confirm("ลบข้อความนี้?"))) return;
    setActionError(null);
    startTransition(async () => {
      const res = await softDeleteMessage(messageId);
      if (res.ok) {
        // i18n-key: chat.success.deleted
        flashSuccess("ลบแล้ว");
        await refetch();
      } else {
        setActionError(translateError(("error" in res && res.error) || "delete_failed"));
      }
    });
  }

  function flashSuccess(msg: string) {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 2500);
  }

  // ──────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────

  const wrapperClass = `flex flex-col rounded-2xl border border-border bg-surface ${className ?? ""}`;

  if (loading) {
    return (
      <div className={wrapperClass}>
        <Header />
        <div className="flex-1 flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-muted animate-spin" />
          {/* i18n-key: chat.loading */}
          <span className="ml-2 text-sm text-muted">กำลังโหลดข้อความ…</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={wrapperClass}>
        <Header />
        <div className="p-4 m-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 text-xs text-red-800 dark:text-red-200">
          {/* i18n-key: chat.error.load */}
          ⚠ โหลดข้อความไม่สำเร็จ: {loadError}
          <button
            type="button"
            onClick={() => { setLoading(true); refetch().finally(() => setLoading(false)); }}
            className="ml-2 underline hover:no-underline"
          >
            {/* i18n-key: chat.retry */}
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  if (!payload) return null;

  const { waiting, messages, viewerProfileId, viewerRoles } = payload;
  const canUnblock = !!waiting.waitingReason && (
    isGodRole(viewerRoles as AdminRole[]) ||
    (waiting.blockedOnRole != null && viewerRoles.includes(waiting.blockedOnRole)) ||
    waiting.blockedOnAdmin === viewerProfileId
  );

  return (
    <div className={wrapperClass}>
      <Header />

      {/* ── Waiting-for header ── */}
      {waiting.waitingReason && (
        <WaitingHeader
          waiting={waiting}
          showUnblockForm={showUnblockForm}
          unblockNote={unblockNote}
          canUnblock={canUnblock}
          pending={pending}
          onUnblockOpen={() => setShowUnblockForm(true)}
          onUnblockCancel={() => { setShowUnblockForm(false); setUnblockNote(""); }}
          onUnblockNoteChange={setUnblockNote}
          onUnblockSubmit={fireUnblock}
        />
      )}

      {/* ── Timeline ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[60vh]">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-muted py-8">
            {/* i18n-key: chat.empty */}
            ยังไม่มีข้อความ — เริ่มสนทนาด้านล่าง
          </div>
        ) : (
          messages.map((m) => (
            <MessageRow
              key={m.id}
              row={m}
              onDelete={fireDelete}
              pending={pending}
            />
          ))
        )}
      </div>

      {/* ── Feedback banners ── */}
      {actionError && (
        <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-2 text-xs text-red-800 dark:text-red-200">
          ⚠ {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mx-4 mt-2 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/10 p-2 text-xs text-green-800 dark:text-green-200">
          ✓ {actionSuccess}
        </div>
      )}

      {/* ── Composer ── */}
      <div className="border-t border-border p-3 space-y-2">
        {/* Picked-mentions chips */}
        {mentioned.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {mentioned.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-950/30 border border-primary-200 px-2 py-0.5 text-[11px] text-primary-700 dark:text-primary-300"
              >
                <AtSign className="w-3 h-3" />
                {pickerLabel(m)}
                <button
                  type="button"
                  onClick={() => removeMention(m.id)}
                  className="ml-0.5 hover:text-red-600"
                  aria-label={`remove mention ${pickerLabel(m)}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <textarea
            ref={composerRef}
            value={body}
            onChange={onBodyChange}
            onKeyDown={onComposerKeyDown}
            // i18n-key: chat.composer.placeholder
            placeholder="พิมพ์ข้อความ… ใช้ @ เพื่อ tag เพื่อนร่วมงาน · Ctrl+Enter ส่ง"
            rows={2}
            disabled={pending}
            className="w-full resize-y rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm min-h-[68px] max-h-[200px] focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
          />

          {/* @-mention dropdown — anchored below textarea */}
          {mentionQuery != null && (
            <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-lg border border-border bg-white dark:bg-surface shadow-lg overflow-hidden">
              {mentionLoading && mentionResults.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted">
                  {/* i18n-key: chat.mention.searching */}
                  กำลังค้นหา…
                </div>
              ) : mentionResults.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted">
                  {/* i18n-key: chat.mention.no_match */}
                  ไม่พบเพื่อนร่วมงานที่ตรงกับ &quot;@{mentionQuery}&quot;
                </div>
              ) : (
                <ul role="listbox" className="max-h-60 overflow-auto">
                  {mentionResults.map((r, idx) => {
                    const isHl = idx === mentionHighlight;
                    return (
                      <li key={r.id} role="option" aria-selected={isHl}>
                        <button
                          type="button"
                          onClick={() => pickMention(r)}
                          onMouseEnter={() => setMentionHighlight(idx)}
                          className={`w-full text-left px-3 py-2 min-h-[44px] border-b border-border last:border-b-0 flex items-center gap-2 ${
                            isHl ? "bg-primary-50 dark:bg-primary-950/30" : "hover:bg-surface-alt"
                          }`}
                        >
                          <AvatarCircle name={pickerLabel(r)} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{pickerLabel(r)}</div>
                            <div className="text-[10px] text-muted truncate">
                              {r.member_code ?? "—"}
                              {r.role && ` · ${ROLE_LABEL[r.role] ?? r.role}`}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowWaitPicker((s) => !s)}
            disabled={pending}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg border px-3 py-2 text-xs ${
              showWaitPicker
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-border bg-white dark:bg-surface text-muted hover:bg-surface-alt"
            } disabled:opacity-50`}
          >
            <Flag className="w-4 h-4" />
            {/* i18n-key: chat.composer.mark_waiting */}
            mark waiting
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={fireSend}
            disabled={pending || body.trim().length === 0}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {/* i18n-key: chat.composer.send */}
            ส่ง
          </button>
        </div>

        {/* "⚑ mark waiting" inline picker */}
        {showWaitPicker && (
          <WaitPicker
            reason={waitReason}
            blockedRole={waitBlockedRole}
            blockedAdmin={waitBlockedAdmin}
            note={waitBody}
            pending={pending}
            onReasonChange={setWaitReason}
            onRoleChange={setWaitBlockedRole}
            onAdminChange={setWaitBlockedAdmin}
            onNoteChange={setWaitBody}
            onSubmit={fireMarkWaiting}
            onCancel={() => {
              setShowWaitPicker(false);
              setWaitBody("");
              setWaitBlockedRole("");
              setWaitBlockedAdmin("");
            }}
          />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function Header() {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
      <MessageCircle className="w-4 h-4 text-primary-600" />
      {/* i18n-key: chat.header.title */}
      <h3 className="text-sm font-bold">การสนทนา</h3>
    </div>
  );
}

function WaitingHeader(props: {
  waiting: WorkItemWaitingBlock;
  showUnblockForm: boolean;
  unblockNote: string;
  canUnblock: boolean;
  pending: boolean;
  onUnblockOpen: () => void;
  onUnblockCancel: () => void;
  onUnblockNoteChange: (v: string) => void;
  onUnblockSubmit: () => void;
}) {
  const {
    waiting, showUnblockForm, unblockNote, canUnblock, pending,
    onUnblockOpen, onUnblockCancel, onUnblockNoteChange, onUnblockSubmit,
  } = props;
  if (!waiting.waitingReason) return null;

  const badgeClass = WAITING_REASON_BADGE[waiting.waitingReason];
  const reasonLabel = WAITING_REASON_LABEL_TH[waiting.waitingReason];
  const blockedOn = waiting.blockedOnAdminName
    ? `${waiting.blockedOnAdminName}`
    : waiting.blockedOnRole
    ? (ROLE_LABEL[waiting.blockedOnRole] ?? waiting.blockedOnRole)
    : null;

  return (
    <div className={`mx-4 mt-3 mb-1 rounded-lg border ${badgeClass} p-3`}>
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">
            {/* i18n-key: chat.waiting.label */}
            🔴 รอ: {reasonLabel}
            {blockedOn && (
              <>
                {" "}·{" "}
                {/* i18n-key: chat.waiting.blocked_on */}
                <span className="font-normal">บล็อกที่ {blockedOn}</span>
              </>
            )}
          </div>
        </div>
        {canUnblock && !showUnblockForm && (
          <button
            type="button"
            onClick={onUnblockOpen}
            disabled={pending}
            className="inline-flex items-center justify-center gap-1 min-h-[36px] rounded-md bg-white dark:bg-surface border border-green-300 text-green-700 px-2.5 py-1 text-xs font-semibold hover:bg-green-50 disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {/* i18n-key: chat.waiting.unblock */}
            mark unblocked
          </button>
        )}
      </div>

      {showUnblockForm && (
        <div className="mt-3 space-y-2 bg-white dark:bg-surface rounded p-2 border border-border">
          <label className="text-[11px] font-semibold text-foreground">
            {/* i18n-key: chat.waiting.unblock_note_label */}
            หมายเหตุการปลดบล็อก (จะถูกบันทึกในไทม์ไลน์)
            <span className="text-red-500">*</span>
          </label>
          <textarea
            value={unblockNote}
            onChange={(e) => onUnblockNoteChange(e.target.value)}
            rows={2}
            // i18n-key: chat.waiting.unblock_note_placeholder
            placeholder="เช่น เอกสารมาแล้ว, เครดิตอนุมัติแล้ว, ลูกค้าจ่ายแล้ว"
            maxLength={300}
            disabled={pending}
            className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onUnblockSubmit}
              disabled={pending || unblockNote.trim().length < 3}
              className="flex-1 inline-flex items-center justify-center min-h-[40px] rounded bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {/* i18n-key: chat.waiting.unblock_confirm */}
              ยืนยันปลดบล็อก
            </button>
            <button
              type="button"
              onClick={onUnblockCancel}
              disabled={pending}
              className="inline-flex items-center justify-center min-h-[40px] rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
            >
              {/* i18n-key: chat.cancel */}
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageRow(props: {
  row: WorkItemMessageRow;
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  const { row, onDelete, pending } = props;

  // Soft-deleted body convention: server sets body to "" + we render a
  // placeholder.  (Agent A: please confirm — if the server uses a different
  // sentinel, adjust this check.  TODO-A.)
  const isDeleted = row.body.length === 0 || row.body === "(deleted)";

  if (row.kind === "system") {
    return (
      <div className="flex items-start gap-2 text-xs text-muted italic">
        <Settings className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="flex-1">
          <span>{isDeleted ? deletedPlaceholder() : row.body}</span>
          <span className="ml-2 text-[10px]" title={row.createdAt}>
            {relativeTimeTh(row.createdAt)}
          </span>
        </div>
      </div>
    );
  }

  if (row.kind === "status_note") {
    const reason = row.setWaitingReason;
    const reasonLabel = reason ? WAITING_REASON_LABEL_TH[reason] : null;
    return (
      <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/10 px-3 py-2 space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <Flag className="w-3.5 h-3.5 text-amber-700" />
          <span className="font-semibold text-amber-800 dark:text-amber-200">
            {/* i18n-key: chat.status_note.label */}
            🔴 รอ: {reasonLabel ?? "—"}
          </span>
          {row.setBlockedRole && (
            <span className="text-[11px] text-amber-700 dark:text-amber-300">
              {/* i18n-key: chat.status_note.blocked_on */}
              · บล็อก: {ROLE_LABEL[row.setBlockedRole] ?? row.setBlockedRole}
            </span>
          )}
        </div>
        <div className="flex items-start gap-2">
          <AvatarCircle name={row.authorDisplayName ?? "—"} small />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted">
              <span className="font-medium text-foreground">{row.authorDisplayName ?? "ไม่ระบุ"}</span>
              <span className="ml-2" title={row.createdAt}>{relativeTimeTh(row.createdAt)}</span>
            </div>
            <div className="text-sm text-foreground mt-0.5 whitespace-pre-wrap break-words">
              {isDeleted ? deletedPlaceholder() : row.body}
            </div>
          </div>
          {row.isOwnMessage && !isDeleted && (
            <button
              type="button"
              onClick={() => onDelete(row.id)}
              disabled={pending}
              className="text-[10px] text-muted hover:text-red-600 disabled:opacity-50 shrink-0"
              // i18n-key: chat.delete
              title="ลบข้อความนี้"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // kind === "comment"
  return (
    <div className="flex items-start gap-2">
      <AvatarCircle name={row.authorDisplayName ?? "—"} />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted">
          <span className="font-medium text-foreground">{row.authorDisplayName ?? "ไม่ระบุ"}</span>
          <span className="ml-2" title={row.createdAt}>{relativeTimeTh(row.createdAt)}</span>
        </div>
        <div className="text-sm text-foreground mt-0.5 whitespace-pre-wrap break-words">
          {isDeleted ? deletedPlaceholder() : renderWithMentions(row.body)}
        </div>
      </div>
      {row.isOwnMessage && !isDeleted && (
        <button
          type="button"
          onClick={() => onDelete(row.id)}
          disabled={pending}
          className="text-[10px] text-muted hover:text-red-600 disabled:opacity-50 shrink-0"
          // i18n-key: chat.delete
          title="ลบข้อความนี้"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function WaitPicker(props: {
  reason: WaitingReason;
  blockedRole: string;
  blockedAdmin: string;
  note: string;
  pending: boolean;
  onReasonChange: (r: WaitingReason) => void;
  onRoleChange: (r: string) => void;
  onAdminChange: (a: string) => void;
  onNoteChange: (n: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const {
    reason, blockedRole, blockedAdmin, note, pending,
    onReasonChange, onRoleChange, onAdminChange, onNoteChange, onSubmit, onCancel,
  } = props;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Flag className="w-4 h-4 text-amber-700" />
        <h4 className="text-xs font-bold text-amber-900 dark:text-amber-100">
          {/* i18n-key: chat.wait_picker.title */}
          ตั้งสถานะรอ — เลือกเหตุผล + (ทางเลือก) ระบุดีพาร์ตเมนต์/คน
        </h4>
      </div>

      {/* Reason radio group */}
      <fieldset>
        <legend className="text-[11px] font-semibold text-foreground mb-1">
          {/* i18n-key: chat.wait_picker.reason_label */}
          เหตุผล <span className="text-red-500">*</span>
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {WAITING_REASONS.map((r) => (
            <label
              key={r}
              className={`flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs cursor-pointer min-h-[40px] ${
                reason === r
                  ? "border-amber-400 bg-amber-100 dark:bg-amber-900/30 font-semibold"
                  : "border-border bg-white dark:bg-surface hover:bg-surface-alt"
              }`}
            >
              <input
                type="radio"
                name="wait-reason"
                value={r}
                checked={reason === r}
                onChange={() => onReasonChange(r)}
                disabled={pending}
                className="shrink-0"
              />
              <span className="truncate">{WAITING_REASON_LABEL_TH[r]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Optional: blocked-on dept */}
      <div>
        <label className="text-[11px] font-semibold text-foreground block mb-1">
          {/* i18n-key: chat.wait_picker.dept_label */}
          บล็อกที่ดีพาร์ตเมนต์ (ทางเลือก)
        </label>
        <select
          value={blockedRole}
          onChange={(e) => onRoleChange(e.target.value)}
          disabled={pending}
          className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs min-h-[40px]"
        >
          {/* i18n-key: chat.wait_picker.dept_any */}
          <option value="">— ไม่ระบุ —</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label_th}</option>
          ))}
        </select>
      </div>

      {/* Optional: specific person — BK-1 = paste UUID; the proper picker
          comes in IC-2.  TODO-A: confirm the action accepts a profile_id
          and validates membership in admins. */}
      <div>
        <label className="text-[11px] font-semibold text-foreground block mb-1">
          {/* i18n-key: chat.wait_picker.person_label */}
          บล็อกที่คนใดคนหนึ่ง (ทางเลือก — paste profile_id UUID)
        </label>
        <input
          type="text"
          value={blockedAdmin}
          onChange={(e) => onAdminChange(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          disabled={pending}
          className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs font-mono min-h-[40px]"
        />
        <p className="text-[10px] text-muted mt-1">
          {/* i18n-key: chat.wait_picker.person_hint */}
          (เว้นว่างได้ — มี dropdown picker ใน IC-2)
        </p>
      </div>

      {/* Required note */}
      <div>
        <label className="text-[11px] font-semibold text-foreground block mb-1">
          {/* i18n-key: chat.wait_picker.note_label */}
          อธิบายเพิ่ม (จะถูกบันทึกในไทม์ไลน์เป็น status_note)
          <span className="text-red-500">*</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={2}
          // i18n-key: chat.wait_picker.note_placeholder
          placeholder="เช่น รอ ก๊อต ยืนยันราคา B-rate, รอบัญชีโอนเครดิต, รอลูกค้าส่ง Form E"
          maxLength={500}
          disabled={pending}
          className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs"
        />
        <p className="text-[10px] text-muted">{note.length} / 500 · อย่างน้อย 3 ตัวอักษร</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || note.trim().length < 3}
          className="flex-1 inline-flex items-center justify-center gap-1 min-h-[44px] rounded bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
          {/* i18n-key: chat.wait_picker.confirm */}
          ยืนยัน
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center justify-center min-h-[44px] rounded border border-border px-3 py-2 text-xs hover:bg-surface-alt disabled:opacity-50"
        >
          {/* i18n-key: chat.cancel */}
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

function AvatarCircle({ name, small }: { name: string; small?: boolean }) {
  const letter = (name?.trim().charAt(0) || "?").toUpperCase();
  const size = small ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
  // Stable colour from name hash
  const palette = [
    "bg-rose-200 text-rose-800",
    "bg-amber-200 text-amber-800",
    "bg-emerald-200 text-emerald-800",
    "bg-sky-200 text-sky-800",
    "bg-violet-200 text-violet-800",
    "bg-pink-200 text-pink-800",
    "bg-teal-200 text-teal-800",
  ];
  const h = hashString(name) % palette.length;
  return (
    <span className={`shrink-0 inline-flex items-center justify-center rounded-full font-bold ${size} ${palette[h]}`}>
      {letter}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Pick a render-ready display label for an admin row.  Preference order:
 *  display_name → "first last" → member_code → uuid fragment. */
function pickerLabel(r: AdminPickerRow): string {
  if (r.display_name && r.display_name.trim().length > 0) return r.display_name.trim();
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  if (name.length > 0) return name;
  if (r.member_code) return r.member_code;
  return r.id.slice(0, 8);
}

/** Highlight @mentions in the rendered message body. */
function renderWithMentions(body: string): React.ReactNode {
  // Match `@<contiguous-non-whitespace>` (the literal token form the
  // composer wrote — the authoritative list lives in row.mentionedAdminIds,
  // but display is best-effort from text).
  const parts = body.split(/(@[^\s@]+)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      return (
        <span key={i} className="font-medium text-primary-700 dark:text-primary-300">
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function deletedPlaceholder(): React.ReactNode {
  // i18n-key: chat.deleted
  return <span className="italic text-muted">(ข้อความถูกลบ)</span>;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function translateError(err: string): string {
  // Map known server-action error strings to TH messages.
  if (err === "forbidden") return "สิทธิ์ไม่พอ — ติดต่อ super admin";
  if (err === "not_found") return "ไม่พบรายการ (อาจถูกลบ — refresh หน้า)";
  if (err === "body_empty") return "ต้องมีข้อความ ห้ามเว้นว่าง";
  if (err === "body_too_long") return "ข้อความยาวเกินกำหนด";
  if (err === "invalid_waiting_reason") return "เหตุผลรอไม่ถูกต้อง";
  if (err === "invalid_blocked_role") return "ดีพาร์ตเมนต์ไม่ถูกต้อง";
  if (err === "invalid_blocked_admin") return "ID ของผู้รับมอบไม่ถูกต้อง";
  if (err === "not_blocked") return "งานนี้ไม่ได้ติดสถานะรออยู่";
  if (err === "load_failed") return "โหลดข้อความไม่สำเร็จ";
  if (err === "send_failed") return "ส่งข้อความไม่สำเร็จ";
  if (err === "wait_failed") return "บันทึกสถานะรอไม่สำเร็จ";
  if (err === "unblock_failed") return "ปลดบล็อกไม่สำเร็จ";
  if (err === "delete_failed") return "ลบไม่สำเร็จ";
  return `เกิดข้อผิดพลาด: ${err}`;
}
