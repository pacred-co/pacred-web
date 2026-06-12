"use client";

/**
 * <QuoteStatusActions> — the workflow-action footer on a Freight ใบเสนอราคา.
 *
 * Every button REUSES an EXISTING audited action from
 * `actions/admin/freight-quotes.ts` — this component introduces NO new
 * money/status write-path of its own (§0e). It only surfaces the actions that
 * were already built but had no admin UI:
 *
 *   draft            → ส่งขออนุมัติ        (adminSubmitQuoteForApproval)
 *   pending_approval → อนุมัติ / ปฏิเสธ    (adminApproveQuote / adminRejectQuote · super only)
 *   approved         → ส่งให้ลูกค้า         (adminSendQuote)
 *   sent             → ลูกค้ายืนยัน / หมดอายุ (adminMarkQuoteAccepted / adminMarkQuoteExpired)
 *   accepted         → แปลงเป็นงานขนส่ง     (adminConvertQuoteToShipment · super only)
 *
 * §0f confirm-before-mutate: EVERY action is gated by a confirm dialog
 * (useConfirmDialogs) before it fires — no silent instant-mutate. The reject
 * flow prompts for a reason inline before confirming.
 *
 * The action's role gate is authoritative (re-checked server-side); the
 * `isSuper`/`canSend`/`canCreate` props only decide which buttons render.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import type { QuoteStatus } from "@/lib/validators/freight-quote";
import {
  adminSubmitQuoteForApproval,
  adminApproveQuote,
  adminRejectQuote,
  adminSendQuote,
  adminMarkQuoteAccepted,
  adminMarkQuoteExpired,
  adminConvertQuoteToShipment,
} from "@/actions/admin/freight-quotes";

type AnyResult = { ok: true; data?: unknown } | { ok: false; error: string };

const btnPrimary =
  "rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50";
const btnGreen =
  "rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const btnNeutral =
  "rounded-md border border-border px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50";
const btnDanger =
  "rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";

export function QuoteStatusActions({
  quoteId,
  status,
  hasItems,
  hasProfile,
  alreadyConverted,
  isSuper,
  canCreate,
  canSend,
}: {
  quoteId: string;
  status: QuoteStatus;
  hasItems: boolean;
  hasProfile: boolean;
  alreadyConverted: boolean;
  isSuper: boolean;
  canCreate: boolean;
  canSend: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialogs } = useConfirmDialogs();

  function run(label: string, fn: () => Promise<AnyResult>) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setErr(`${label}ไม่สำเร็จ: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }

  async function onSubmit() {
    if (!hasItems) {
      setErr("ต้องมีอย่างน้อย 1 รายการก่อนส่งขออนุมัติ");
      return;
    }
    if (await confirm("ส่งใบเสนอราคานี้เพื่อขออนุมัติ?\nหลังส่งแล้วจะแก้ไขรายการไม่ได้จนกว่าจะถูกตีกลับ")) {
      run("ส่งขออนุมัติ", () => adminSubmitQuoteForApproval({ id: quoteId }));
    }
  }

  async function onApprove() {
    if (await confirm("อนุมัติใบเสนอราคานี้?\nยอดเงินจะถูกล็อก (frozen) หลังอนุมัติ")) {
      run("อนุมัติ", () => adminApproveQuote({ id: quoteId }));
    }
  }

  async function onReject() {
    const reason = window.prompt("เหตุผลที่ปฏิเสธ (อย่างน้อย 3 ตัวอักษร):", "");
    if (reason == null) return; // cancelled the prompt
    if (reason.trim().length < 3) {
      setErr("เหตุผลต้องมีอย่างน้อย 3 ตัวอักษร");
      return;
    }
    if (await confirm(`ปฏิเสธใบเสนอราคานี้?\nเหตุผล: ${reason.trim()}`)) {
      run("ปฏิเสธ", () => adminRejectQuote({ id: quoteId, rejected_reason: reason.trim() }));
    }
  }

  async function onSend() {
    if (await confirm("ส่งใบเสนอราคานี้ให้ลูกค้า?\nลูกค้าจะมองเห็นใบเสนอราคาหลังจากนี้")) {
      run("ส่งให้ลูกค้า", () => adminSendQuote({ id: quoteId }));
    }
  }

  async function onAccept() {
    if (
      await confirm(
        "ยืนยันว่าลูกค้าตอบรับใบเสนอราคานี้?" +
          (hasProfile ? "\nระบบจะพยายามแปลงเป็นงานขนส่งให้อัตโนมัติ" : ""),
      )
    ) {
      run("บันทึกการตอบรับ", () => adminMarkQuoteAccepted({ id: quoteId }));
    }
  }

  async function onExpire() {
    if (await confirm("ทำเครื่องหมายใบเสนอราคานี้ว่าหมดอายุ?")) {
      run("ทำเครื่องหมายหมดอายุ", () => adminMarkQuoteExpired({ id: quoteId }));
    }
  }

  async function onConvert() {
    if (!hasProfile) {
      setErr("ใบเสนอราคาต้องผูกกับลูกค้า (profile) ก่อนแปลงเป็นงานขนส่ง");
      return;
    }
    if (await confirm("แปลงใบเสนอราคานี้เป็นงานขนส่ง (freight shipment)?")) {
      run("แปลงเป็นงานขนส่ง", () => adminConvertQuoteToShipment({ id: quoteId }));
    }
  }

  // Build the visible button set for the current status.
  const buttons: React.ReactNode[] = [];

  if (status === "draft" && canCreate) {
    buttons.push(
      <button key="submit" type="button" onClick={onSubmit} disabled={pending} className={btnPrimary}>
        ส่งขออนุมัติ
      </button>,
    );
  }
  if (status === "pending_approval" && isSuper) {
    buttons.push(
      <button key="approve" type="button" onClick={onApprove} disabled={pending} className={btnGreen}>
        อนุมัติ
      </button>,
      <button key="reject" type="button" onClick={onReject} disabled={pending} className={btnDanger}>
        ปฏิเสธ
      </button>,
    );
  }
  if (status === "approved" && canSend) {
    buttons.push(
      <button key="send" type="button" onClick={onSend} disabled={pending} className={btnPrimary}>
        ส่งให้ลูกค้า
      </button>,
    );
  }
  if (status === "sent" && canSend) {
    buttons.push(
      <button key="accept" type="button" onClick={onAccept} disabled={pending} className={btnGreen}>
        ลูกค้ายืนยัน
      </button>,
      <button key="expire" type="button" onClick={onExpire} disabled={pending} className={btnNeutral}>
        ทำเครื่องหมายหมดอายุ
      </button>,
    );
  }
  if (status === "accepted" && isSuper && !alreadyConverted) {
    buttons.push(
      <button key="convert" type="button" onClick={onConvert} disabled={pending} className={btnPrimary}>
        แปลงเป็นงานขนส่ง
      </button>,
    );
  }

  const isTerminalNoAction = buttons.length === 0;

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
      <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-3">การดำเนินการ</h2>
      {isTerminalNoAction ? (
        <p className="text-xs text-muted">
          ไม่มีการดำเนินการในสถานะปัจจุบันสำหรับสิทธิ์ของคุณ
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">{buttons}</div>
      )}
      {pending && <p className="mt-3 text-xs text-muted">⏳ กำลังดำเนินการ...</p>}
      {err && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
      )}
      {dialogs}
    </section>
  );
}
