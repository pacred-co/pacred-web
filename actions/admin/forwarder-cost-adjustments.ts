"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { getWalletAvailableBalance } from "@/lib/wallet/balance";
import { getBusinessConfig } from "@/lib/business-config";
import {
  evaluateReconfirmGate,
  RECONFIRM_THRESHOLD_CONFIG_KEY,
  RECONFIRM_THRESHOLD_DEFAULT_PCT,
} from "@/lib/forwarder/reconfirm-gate";

/**
 * U2-4: Post-delivery cost adjustment workflow (chat W-4).
 *
 * Per chat AIR IMPORT: extra fees (D/O · gateway · weight rebill ·
 * customs extra) are discovered AFTER delivery and need a traceable
 * rebill flow rather than today's ad-hoc LINE chat → wallet adjustment.
 *
 * V1 actions:
 *   - adminAddForwarderCostAdjustment: create unpaid row + notify customer.
 *     When the cumulative "actual" cost (preview + existing adjustments +
 *     new amount) exceeds the original preview by > threshold_pct (default
 *     10), the row is created as `pending_reconfirm` instead of `unpaid`
 *     and the customer must accept/dispute via /service-import/[fNo]
 *     before admin can bill it. Per BUSINESS_FLOW.md L85-87 + pcs-business
 *     -flow audit §3 Priority 2.
 *   - adminMarkCostAdjustmentPaid: debit wallet (-amount) + flip status='paid'.
 *     REFUSES to bill a row in `pending_reconfirm` — customer decision
 *     required first.
 *   - adminCancelCostAdjustment: flip status='cancelled' + notify
 *
 * Gate: super OR accounting (money-moving). Ops can't add adjustments
 * because they bypass the wallet ledger gate per ADR-0005 K-7.
 */

const KINDS = ["do_fee", "gateway_fee", "weight_rebill", "customs_extra", "other"] as const;
const KIND_LABEL_TH: Record<typeof KINDS[number], string> = {
  do_fee:        "ค่า D/O",
  gateway_fee:   "ค่า gateway",
  weight_rebill: "ค่าน้ำหนักเพิ่ม",
  customs_extra: "ค่าศุลกากรเพิ่ม",
  other:         "อื่นๆ",
};

const addSchema = z.object({
  forwarder_id: z.string().uuid(),
  kind:         z.enum(KINDS),
  amount_thb:   z.number().positive("amount ต้องมากกว่า 0").max(10_000_000),
  note:         z.string().trim().max(2000).optional(),
  slip_url:     z.string().trim().max(500).optional(),
});
export type AddCostAdjustmentInput = z.infer<typeof addSchema>;

export async function adminAddForwarderCostAdjustment(
  input: AddCostAdjustmentInput,
): Promise<AdminActionResult<{ id: string; reconfirm_required: boolean }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ id: string; reconfirm_required: boolean }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Resolve forwarder + profile + preview total (= the price the
    // customer agreed to at order time, stored as forwarders.total_price
    // since createForwarder inserts it from calcPrice on submit).
    const { data: fwd, error: fwdErr } = await admin
      .from("forwarders")
      .select("id, f_no, profile_id, total_price")
      .eq("id", d.forwarder_id)
      .maybeSingle<{ id: string; f_no: string; profile_id: string; total_price: number }>();
    if (fwdErr) {
      console.error(`[forwarders mutation lookup] failed`, { code: fwdErr.code, message: fwdErr.message });
      return { ok: false, error: `db_error:${fwdErr.code ?? "unknown"}` };
    }
    if (!fwd) return { ok: false, error: "forwarder not_found" };

    // 10%-over-preview gate (BUSINESS_FLOW.md L85-87 / audit §3 P2).
    // Sum existing non-cancelled adjustments to know the cumulative
    // BEFORE this one (paid + unpaid + pending_reconfirm all count).
    const previewTotal = Number(fwd.total_price) || 0;
    const { data: existingRows, error: existingRowsErr } = await admin
      .from("forwarder_cost_adjustments")
      .select("amount_thb")
      .eq("forwarder_id", fwd.id)
      .neq("status", "cancelled")
      .returns<Array<{ amount_thb: number }>>();
    if (existingRowsErr) {
      console.error(`[forwarder_cost_adjustments list] failed`, { code: existingRowsErr.code, message: existingRowsErr.message });
    }
    const existingCumulative = (existingRows ?? [])
      .reduce((sum, r) => sum + (Number(r.amount_thb) || 0), 0);

    const thresholdPct = await getBusinessConfig<number>(
      RECONFIRM_THRESHOLD_CONFIG_KEY,
      RECONFIRM_THRESHOLD_DEFAULT_PCT,
    );
    const gate = evaluateReconfirmGate({
      preview_total_thb:       previewTotal,
      existing_cumulative_thb: existingCumulative,
      new_adjustment_thb:      d.amount_thb,
      threshold_pct:           thresholdPct,
    });

    // Branch: gate-tripped rows land as `pending_reconfirm` carrying the
    // preview snapshot + cumulative-after so the customer UI / future
    // audit always sees the same numbers, even if admin later edits
    // total_price. Non-gate rows keep today's `unpaid` default.
    const insertStatus = gate.triggered ? "pending_reconfirm" : "unpaid";
    const nowIso = new Date().toISOString();
    const { data: created, error: insErr } = await admin
      .from("forwarder_cost_adjustments")
      .insert({
        forwarder_id:   fwd.id,
        profile_id:     fwd.profile_id,
        kind:           d.kind,
        amount_thb:     d.amount_thb,
        note:           d.note ?? null,
        slip_url:       d.slip_url ?? null,
        status:         insertStatus,
        added_by_admin: adminId,
        // Reconfirm-gate context — only set when gate triggered.
        preview_total_thb:     gate.triggered ? previewTotal               : null,
        cumulative_after_thb:  gate.triggered ? gate.actual_total_thb      : null,
        reconfirm_required_at: gate.triggered ? nowIso                      : null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr) return { ok: false, error: insErr.message };

    await logAdminAction(adminId, "fwd_cost_adj.create", "forwarder_cost_adjustment", created.id, {
      forwarder_f_no:       fwd.f_no,
      kind:                 d.kind,
      amount_thb:           d.amount_thb,
      // Gate-context for audit trail (null when gate did not fire).
      reconfirm_required:   gate.triggered,
      preview_total_thb:    previewTotal,
      existing_cumulative:  existingCumulative,
      actual_total_thb:     gate.actual_total_thb,
      delta_pct:            gate.delta_pct,
      threshold_pct:        gate.threshold_pct,
    });

    if (gate.triggered) {
      // Customer-facing: surprise-bill warning (severity 'warning')
      // pointing back to the order detail (not the receipt) so the
      // accept/dispute UI is one tap away.
      void sendNotification(fwd.profile_id, {
        category:       "payment",
        severity:       "warning",
        title:          `🛑 รอยืนยันราคาจริง — ${fwd.f_no}`,
        body:           `ราคาจริง ฿${gate.actual_total_thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} สูงกว่าราคาประเมิน ฿${previewTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (เกิน ${gate.delta_pct.toFixed(1)}%) — กรุณายืนยันก่อนชำระ`,
        link_href:      `/service-import/${fwd.f_no}`,
        reference_type: "forwarder",
        reference_id:   fwd.id,
      });

      // Best-effort: open a work_item for ops so the board surfaces the
      // pending reconfirm (used when customer doesn't decide in 24h or
      // disputes). RPC is SECURITY DEFINER + service-role-only.
      try {
        await admin.rpc("ensure_work_item", {
          p_entity_type:   "forwarder",
          p_entity_ref:    fwd.f_no,
          p_type:          "payment_followup",
          p_title:         `รอลูกค้ายืนยันราคาจริง (+${gate.delta_pct.toFixed(1)}%) — ${fwd.f_no}`,
          p_assigned_role: "ops",
          p_priority:      "high",
          p_due_at:        null,
        });
      } catch {
        // work_items hook is best-effort; the customer notification +
        // the row's status='pending_reconfirm' are the load-bearing parts.
      }
    } else {
      // Standard "extra fee added" notification (legacy behaviour).
      void sendNotification(fwd.profile_id, {
        category:       "payment",
        severity:       "warning",
        title:          `มีค่าใช้จ่ายเพิ่ม — ${fwd.f_no}`,
        body:           `${KIND_LABEL_TH[d.kind]} ฿${d.amount_thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} — ติดต่อทีมงานเพื่อชำระ`,
        // …/receipt is now a redirect → …/invoice (live tb_forwarder⋈tb_receipt view).
        link_href:      `/service-import/${fwd.f_no}/invoice`,
        reference_type: "forwarder",
        reference_id:   fwd.id,
      });
    }

    revalidatePath(`/admin/forwarders/${fwd.f_no}`);
    revalidatePath(`/service-import/${fwd.f_no}/invoice`);
    revalidatePath(`/service-import/${fwd.f_no}`);

    return { ok: true, data: { id: created.id, reconfirm_required: gate.triggered } };
  });
}

// ────────────────────────────────────────────────────────────
// Mark paid — debit wallet + link wallet_tx for traceability
//
// ⚠️ §0e DEAD-TWIN — DISABLED 2026-06-15 (latent money-loss).
// The debit inserts into `wallet_transactions` (0-row twin on prod), NOT the
// live `tb_wallet_hs` the real wallet engine reads + the lookups it depends on
// hit the rebuilt `forwarders` twin instead of `tb_forwarder`. A "mark paid"
// here would record a wallet debit the customer's real balance never sees +
// flip the adjustment to 'paid' = money mis-stated / lost. The owning UI
// (CostAdjustmentsPanel at app/.../forwarders/[fNo]/cost-adjustments-panel.tsx)
// is currently NOT mounted anywhere, so this is dormant — the exported entry
// below throws a hard guard so it can never silently move money if the panel
// is ever mounted before the wallet write is repointed to tb_wallet_hs (+
// tb_forwarder lookups). The real logic is preserved verbatim in
// adminMarkCostAdjustmentPaidImpl. See docs/research/code-debt-priority-2026-06-15.md.
// ────────────────────────────────────────────────────────────
const markPaidSchema = z.object({
  id:             z.string().uuid(),
  allow_overdraw: z.boolean().optional(),
});
export type MarkCostAdjustmentPaidInput = z.infer<typeof markPaidSchema>;

export async function adminMarkCostAdjustmentPaid(
  input: MarkCostAdjustmentPaidInput,
): Promise<AdminActionResult<{ wallet_tx_id: string }>> {
  void input; // §0e: input ignored — debit disabled (dead wallet_transactions twin)
  // §0e DEAD-TWIN GUARD: the debit writes wallet_transactions (0-row twin),
  // not tb_wallet_hs — disabled until repointed so it cannot silently lose
  // money. The CostAdjustmentsPanel that calls this stays unmounted.
  throw new Error(
    "DEAD-TWIN GUARD: cost-adjustment debit writes wallet_transactions (0-row twin), not tb_wallet — disabled until repointed. See docs/research/code-debt-priority-2026-06-15.md",
  );
}

// Preserved verbatim for the future repoint to tb_wallet_hs (+ tb_forwarder
// lookups). NOT exported + intentionally unreferenced until then.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- §0e: kept for the future tb_wallet_hs repoint
async function adminMarkCostAdjustmentPaidImpl(
  input: MarkCostAdjustmentPaidInput,
): Promise<AdminActionResult<{ wallet_tx_id: string }>> {
  const parsed = markPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ wallet_tx_id: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: adj, error: adjErr } = await admin
      .from("forwarder_cost_adjustments")
      .select("id, forwarder_id, profile_id, kind, amount_thb, status, paid_via_wallet_tx_id")
      .eq("id", d.id)
      .maybeSingle<{
        id: string; forwarder_id: string; profile_id: string;
        kind: string; amount_thb: number; status: string;
        paid_via_wallet_tx_id: string | null;
      }>();
    if (adjErr) {
      console.error(`[forwarder_cost_adjustments mutation lookup] failed`, { code: adjErr.code, message: adjErr.message });
      return { ok: false, error: `db_error:${adjErr.code ?? "unknown"}` };
    }
    if (!adj)                            return { ok: false, error: "not_found" };
    if (adj.status === "paid")           return { ok: false, error: "already_paid" };
    if (adj.status === "cancelled")      return { ok: false, error: "cancelled" };
    // 0092 gate: a row in pending_reconfirm requires customer accept/dispute
    // first. Refusing here protects the customer wallet from surprise debits
    // (BUSINESS_FLOW.md L85-87) — admin can re-call this after the customer
    // accepts (which flips the row back to 'unpaid').
    if (adj.status === "pending_reconfirm") {
      return {
        ok: false,
        error: "รอลูกค้ายืนยันราคาจริง — เกิน 10% จากราคาประเมิน ลูกค้าต้องกดยืนยันก่อนชำระ",
      };
    }

    const total = Number(adj.amount_thb);
    // Balance check (skip if admin overrides). Pending-aware available
    // balance — the raw wallet.balance column (0007 trigger) is blind to
    // the customer's own open pending debits (gap-customer §H-1).
    if (!d.allow_overdraw) {
      const available = await getWalletAvailableBalance(admin, adj.profile_id);
      if (available === null) {
        return { ok: false, error: "ตรวจสอบยอด wallet ไม่สำเร็จ — ลองใหม่อีกครั้ง" };
      }
      if (available < total) {
        return {
          ok: false,
          error: `wallet ไม่พอ (มี ฿${available.toLocaleString()} ต้อง ฿${total.toLocaleString()}) — ใช้ allow_overdraw ถ้ารับเงินสด`,
        };
      }
    }

    // Look up forwarder f_no for the wallet_tx note
    const { data: fwd, error: fwdErr } = await admin
      .from("forwarders")
      .select("f_no")
      .eq("id", adj.forwarder_id)
      .maybeSingle<{ f_no: string }>();
    if (fwdErr) {
      console.error(`[forwarders list] failed`, { code: fwdErr.code, message: fwdErr.message });
    }
    const fNo = fwd?.f_no ?? "—";

    const { data: tx, error: txErr } = await admin
      .from("wallet_transactions")
      .insert({
        profile_id:     adj.profile_id,
        bucket:         "main",
        amount:         -total,
        // P0-1: distinct kind so a cost-adjustment debit never collides
        // with the MAIN forwarder payment's idempotency tuple. The
        // payForwarderFromWallet / adminMarkForwarderPaid idempotency
        // SELECTs filter kind='import_payment' → they skip these rows.
        kind:           "cost_adjustment",
        status:         "completed",
        reference_type: "forwarder",
        reference_id:   fNo,
        admin_id:       adminId,
        note:           `ค่าใช้จ่ายเพิ่ม ${KIND_LABEL_TH[adj.kind as keyof typeof KIND_LABEL_TH] ?? adj.kind} — ${fNo}${d.allow_overdraw ? " (override)" : ""}`,
      })
      .select("id")
      .single<{ id: string }>();
    if (txErr) return { ok: false, error: `wallet insert: ${txErr.message}` };

    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from("forwarder_cost_adjustments")
      .update({
        status:                "paid",
        paid_at:               nowIso,
        paid_via_wallet_tx_id: tx.id,
      })
      .eq("id", adj.id)
      .neq("status", "paid");
    if (updErr) {
      return {
        ok: false,
        error: `update failed AFTER wallet debit (tx ${tx.id} stays): ${updErr.message}`,
      };
    }

    await logAdminAction(adminId, "fwd_cost_adj.mark_paid", "forwarder_cost_adjustment", adj.id, {
      kind:           adj.kind,
      amount_thb:     total,
      tx_id:          tx.id,
      allow_overdraw: !!d.allow_overdraw,
    });

    void sendNotification(adj.profile_id, {
      category: "payment",
      severity: "success",
      title:    `ชำระค่าใช้จ่ายเพิ่ม — ${fNo}`,
      body:     `${KIND_LABEL_TH[adj.kind as keyof typeof KIND_LABEL_TH] ?? adj.kind} ฿${total.toLocaleString()} ชำระแล้ว`,
      // …/receipt is now a redirect → …/invoice (live tb_forwarder⋈tb_receipt view).
      link_href: `/service-import/${fNo}/invoice`,
      reference_type: "forwarder",
      reference_id:   adj.forwarder_id,
    });

    revalidatePath(`/admin/forwarders/${fNo}`);
    revalidatePath(`/service-import/${fNo}/invoice`);
    revalidatePath("/admin/wallet");

    return { ok: true, data: { wallet_tx_id: tx.id } };
  });
}

// ────────────────────────────────────────────────────────────
// Cancel adjustment (admin made an error, or fee waived)
// ────────────────────────────────────────────────────────────
const cancelSchema = z.object({
  id:     z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export async function adminCancelCostAdjustment(
  input: z.infer<typeof cancelSchema>,
): Promise<AdminActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: adj, error: adjErr } = await admin
      .from("forwarder_cost_adjustments")
      .select("id, forwarder_id, profile_id, status")
      .eq("id", d.id)
      .maybeSingle<{ id: string; forwarder_id: string; profile_id: string; status: string }>();
    if (adjErr) {
      console.error(`[forwarder_cost_adjustments mutation lookup] failed`, { code: adjErr.code, message: adjErr.message });
      return { ok: false, error: `db_error:${adjErr.code ?? "unknown"}` };
    }
    if (!adj)                       return { ok: false, error: "not_found" };
    if (adj.status === "cancelled") return { ok: false, error: "already_cancelled" };
    if (adj.status === "paid")      return { ok: false, error: "ชำระแล้ว — ยกเลิกไม่ได้ (ทำ refund แทน)" };

    const { error } = await admin
      .from("forwarder_cost_adjustments")
      .update({
        status:              "cancelled",
        cancelled_at:        new Date().toISOString(),
        cancelled_by_admin:  adminId,
        cancellation_reason: d.reason,
      })
      .eq("id", adj.id)
      .neq("status", "cancelled");
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "fwd_cost_adj.cancel", "forwarder_cost_adjustment", adj.id, {
      reason: d.reason,
    });

    // Look up f_no for revalidate
    const { data: fwd, error: fwdErr } = await admin
      .from("forwarders")
      .select("f_no")
      .eq("id", adj.forwarder_id)
      .maybeSingle<{ f_no: string }>();
    if (fwdErr) {
      console.error(`[forwarders list] failed`, { code: fwdErr.code, message: fwdErr.message });
    }
    if (fwd) {
      revalidatePath(`/admin/forwarders/${fwd.f_no}`);
      // …/receipt redirects → …/invoice (live tb_forwarder⋈tb_receipt view).
      revalidatePath(`/service-import/${fwd.f_no}/invoice`);
    }
    return { ok: true };
  });
}
