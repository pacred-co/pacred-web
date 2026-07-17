"use client";

/**
 * In-thread CRM side-panel (Task 3 · ปอน · 2026-06-02). Turns the read-only
 * LINE inbox into a working CRM without leaving the chat:
 *   1. Assign a CS/sales agent (writes Podeng_customers_line.assigned_agent_id)
 *   2. Link the contact to a real PR account → show wallet + shipments in-chat
 *   3. Reply box — GATED (deferred): outbound LINE send has a real external
 *      side-effect + waits on the webhook-consolidation decision (P0-3/G-15).
 *      Rendered disabled with a banner so it's visible-but-clearly-not-live
 *      (AGENTS.md §0a — banner deferred features, never silently omit).
 */

import { useState, useRef } from "react";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import {
  assignLineAgent,
  linkLineContactToMember,
  unlinkLineContact,
} from "@/actions/admin/line-crm";
import type { CsAgent, MemberChatSnapshot } from "@/lib/admin/line-inbox-types";
import {
  UserCog,
  Wallet,
  Package,
  Link2,
  Unlink,
  Lock,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { confirm } from "@/components/ui/confirm";

/** Unlink button — guarded by the styled (async) confirm via ปอน's
 *  preventDefault → await confirm → requestSubmit (ref-guarded so the server
 *  action fires exactly once). */
function UnlinkLineButton({
  customerLineId,
  className,
  children,
}: {
  customerLineId: string;
  className: string;
  children: React.ReactNode;
}) {
  const confirmed = useRef(false);
  return (
    <form
      action={unlinkLineContact}
      onSubmit={async (e) => {
        if (confirmed.current) { confirmed.current = false; return; }
        e.preventDefault();
        const form = e.currentTarget;
        if (
          await confirm(
            "ยกเลิกการเชื่อมบัญชีนี้?\n(ห้องแชทจะไม่เห็นกระเป๋าเงิน/พัสดุของลูกค้า จนกว่าจะเชื่อมใหม่)",
          )
        ) {
          confirmed.current = true;
          form.requestSubmit();
        }
      }}
    >
      <input type="hidden" name="customerLineId" value={customerLineId} />
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}

const CRM_ERROR_TEXT: Record<string, string> = {
  assign: "บันทึกไม่สำเร็จ กรุณาลองใหม่",
  nocode: "กรุณากรอกรหัสลูกค้า (PR…)",
  notfound: "ไม่พบรหัสลูกค้านี้ในระบบ ตรวจสอบอีกครั้ง",
};

function baht(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ThreadCrmPanel({
  customerLineId,
  assignedAgentId,
  customerCode,
  agents,
  snapshot,
  crmError,
}: {
  customerLineId: string;
  assignedAgentId: string | null;
  customerCode: string | null;
  agents: CsAgent[];
  snapshot: MemberChatSnapshot | null;
  crmError: string | null;
}) {
  const [replyText, setReplyText] = useState("");

  return (
    <div className="border-t border-border bg-surface-alt/30 p-4 space-y-3">
      {crmError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {CRM_ERROR_TEXT[crmError] ?? "เกิดข้อผิดพลาด"}
        </div>
      )}

      {/* 1 · Agent assign */}
      <div className="rounded-xl border border-border bg-white p-3 dark:bg-surface">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <UserCog className="h-4 w-4 text-muted" />
          ผู้ดูแลลูกค้า
        </p>
        <form action={assignLineAgent} className="flex items-center gap-2">
          <input type="hidden" name="customerLineId" value={customerLineId} />
          <select
            name="agentId"
            defaultValue={assignedAgentId ?? ""}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-9 flex-1 rounded-lg border border-border bg-white px-2 text-sm text-foreground dark:bg-surface"
          >
            <option value="">— ยังไม่มอบหมาย —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name ?? a.agent_code ?? a.id}
                {a.role ? ` (${a.role})` : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-medium text-muted hover:bg-surface-alt"
          >
            บันทึก
          </button>
        </form>
      </div>

      {/* 2 · Member link / in-system snapshot */}
      <div className="rounded-xl border border-border bg-white p-3 dark:bg-surface">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Link2 className="h-4 w-4 text-muted" />
          ลูกค้าในระบบ Pacred
        </p>

        {customerCode && snapshot ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {snapshot.name || "ลูกค้า"}{" "}
                  <CustomerCodeLink code={snapshot.memberCode} className="text-xs" />
                </p>
                {snapshot.tel && <p className="text-xs text-muted">{snapshot.tel}</p>}
              </div>
              <a
                href={`/admin/customers/${encodeURIComponent(snapshot.memberCode)}`}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-primary-600 hover:underline"
              >
                เปิดโปรไฟล์ <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border bg-surface-alt/40 px-2 py-1.5 text-center">
                <p className="flex items-center justify-center gap-1 text-[11px] text-muted">
                  <Wallet className="h-3 w-3" /> วอลเล็ท
                </p>
                <p className="mt-0.5 text-sm font-bold text-foreground">฿{baht(snapshot.walletTotal)}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-alt/40 px-2 py-1.5 text-center">
                <p className="flex items-center justify-center gap-1 text-[11px] text-muted">
                  <Package className="h-3 w-3" /> พัสดุ
                </p>
                <p className="mt-0.5 text-sm font-bold text-foreground">{snapshot.forwarderTotal}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-alt/40 px-2 py-1.5 text-center">
                <p className="text-[11px] text-muted">กำลังดำเนินการ</p>
                <p className="mt-0.5 text-sm font-bold text-amber-600">{snapshot.forwarderInTransit}</p>
              </div>
            </div>
            <UnlinkLineButton
              customerLineId={customerLineId}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-600"
            >
              <Unlink className="h-3.5 w-3.5" /> ยกเลิกการเชื่อมบัญชี
            </UnlinkLineButton>
          </div>
        ) : customerCode && !snapshot ? (
          <div className="space-y-2">
            <p className="text-xs text-amber-700">
              เชื่อมกับรหัส <span className="font-mono">{customerCode}</span> แต่ไม่พบบัญชีนี้แล้ว
            </p>
            <form action={unlinkLineContact}>
              <input type="hidden" name="customerLineId" value={customerLineId} />
              <button type="submit" className="text-xs text-primary-600 hover:underline">
                ล้างการเชื่อม แล้วลองใหม่
              </button>
            </form>
          </div>
        ) : (
          <form action={linkLineContactToMember} className="flex items-center gap-2">
            <input type="hidden" name="customerLineId" value={customerLineId} />
            <input
              type="text"
              name="memberCode"
              placeholder="รหัสลูกค้า เช่น PR10899"
              className="h-9 flex-1 rounded-lg border border-border bg-white px-2.5 text-sm uppercase text-foreground placeholder:normal-case placeholder:text-muted dark:bg-surface"
            />
            <button
              type="submit"
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-primary-600 px-3 text-xs font-semibold text-white hover:bg-primary-700"
            >
              <Link2 className="h-3.5 w-3.5" /> เชื่อม
            </button>
          </form>
        )}
      </div>

      {/* 3 · Reply box — GATED (deferred until webhook consolidation) */}
      <div className="rounded-xl border border-dashed border-border bg-white/60 p-3 dark:bg-surface/60">
        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          ตอบกลับผ่านระบบยังไม่เปิด — รอยืนยันรวม LINE webhook กับเดฟ (P0-3/G-15) ก่อนเปิดส่งจริง
        </div>
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          rows={2}
          disabled
          placeholder="พิมพ์ข้อความตอบกลับ… (ปิดใช้งานชั่วคราว)"
          className="w-full resize-none rounded-lg border border-border bg-surface-alt/40 px-2.5 py-2 text-sm text-muted disabled:cursor-not-allowed"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg bg-gray-200 px-4 py-1.5 text-xs font-semibold text-gray-500"
          >
            ส่ง (ปิดอยู่)
          </button>
        </div>
      </div>
    </div>
  );
}
