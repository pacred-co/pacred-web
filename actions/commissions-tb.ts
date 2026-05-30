"use server";

/**
 * actions/commissions-tb.ts — the FAITHFUL customer-commission write path,
 * repointed onto the legacy `tb_user_sales` family (P0-23 · ADR-0020).
 *
 * Path A (faithful) per `docs/decisions/0020-commission-sot.md`: the canonical
 * SOT is `tb_user_sales` + `tb_user_sales_admin_pay` + `tb_user_sales_pay`
 * (legacy, has the 4 VIP teams' real accruals). The rebuilt `sales_commissions`
 * / `sales_payouts` tables (`actions/commissions.ts`) are empty on prod → DEAD.
 *
 * Legacy source the two actions here transcribe:
 *   - `member/include/pages/report-user-sales/getListForwarder.php` — the
 *     customer withdrawal modal (select unpaid rows → bank info + ID-card PDF
 *     + min ฿1,000 net gate → posts `name="add"`).
 *   - `pcs-admin/report-user-sales.php` L6-81 — the `add` INSERT logic:
 *       1. dedup-guard: SELECT ID FROM tb_user_sales_pay WHERE IDUS IN (...)
 *          → must be 0 rows (else "ข้อมูลซ้ำ").
 *       2. INSERT tb_user_sales_admin_pay (userIDMain, amount, imagesSlip,
 *          dateSlip=NOW(), adminCreate).
 *       3. INSERT tb_user_sales_pay (IDUS, IDUSAP) — link rows.
 *       4. UPDATE tb_user_sales SET usStatus='2' WHERE ID IN (...).
 *
 * Money rule (legacy-faithful, anti-tamper): the withdrawal amount is NEVER
 * trusted from the client — it is recomputed server-side from the live
 * `tb_forwarder.fTotalPrice − fDiscount` over the re-validated unpaid rows,
 * then 1% commission − 3% WHT (lib/sales-commission/calc.ts).
 *
 * `tb_*` is RLS-locked to service_role → all reads/writes go through the
 * admin client. The customer's ID-card PDF upload uses the user-scoped
 * client + the `slips` bucket (same convention as submitLegacyWalletDeposit).
 *
 * The pure math + the constants live in lib/sales-commission/calc.ts so the
 * tsx unit test can import them without the Next bundler (a "use server" file
 * may only export async functions).
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { resolveSalesAgent } from "@/app/[locale]/(protected)/sales/team-map";
import {
  computeCommission,
  sumGross,
  SALES_MIN_WITHDRAWAL_THB,
  type CommissionBreakdown,
} from "@/lib/sales-commission/calc";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// Shared: resolve the signed-in customer → their team agent.
// ────────────────────────────────────────────────────────────
type ResolvedAgent = {
  /** the customer's member code (e.g. "PR888"). */
  memberCode: string;
  /** the team's coid (e.g. "THADA.VIP") — matched against tb_users.coid. */
  userIDMain: string;
  /** the auth.uid() — for the storage upload path. */
  authUid: string;
  /** the per-team commission rate (0.01 for all four VIP teams). */
  percen: number;
};

async function resolveSignedInAgent(): Promise<
  { ok: true; agent: ResolvedAgent } | { ok: false; error: string }
> {
  const data = await getCurrentUserWithProfile();
  if (!data?.user) return { ok: false, error: "not_signed_in" };
  if (!data.profile) return { ok: false, error: "no_profile" };
  const agent = resolveSalesAgent(data.profile.member_code ?? null);
  // Legacy `else { //404 }` — non-whitelisted accounts have no commission.
  if (!agent) return { ok: false, error: "not_sales_agent" };
  return {
    ok: true,
    agent: {
      memberCode: agent.memberCode,
      userIDMain: agent.userIDMain,
      authUid: data.user.id,
      percen: agent.percen,
    },
  };
}

// ────────────────────────────────────────────────────────────
// 1. The summary card — earned 1% minus already-withdrawn.
// ────────────────────────────────────────────────────────────
export type SalesWithdrawalSummary = CommissionBreakdown & {
  /** number of unpaid (usstatus='1') tb_user_sales rows in the team. */
  unpaidCount: number;
  /** the min net withdrawal (1,000) — echoed so the UI shows the gate. */
  minWithdrawalThb: number;
};

/**
 * Read the team's UNPAID earned rows (usstatus='1') and return the live
 * commission breakdown — the "earned minus already-withdrawn" figure.
 *
 * "Already-withdrawn" is implicit in the `usstatus='1'` filter: the moment a
 * row is included in a withdrawal it flips to usstatus='2' (D-2 step 6), so
 * summing only usstatus='1' rows IS (earned − withdrawn − pending). This is
 * exactly the legacy report-user-sales-add.php query (`WHERE usStatus=1`).
 */
export async function getSalesWithdrawalSummary(): Promise<
  ActionResult<SalesWithdrawalSummary>
> {
  const r = await resolveSignedInAgent();
  if (!r.ok) return r;
  const { userIDMain, percen } = r.agent;

  const admin = createAdminClient();

  // 1. The team's member ids — tb_users WHERE coID = userIDMain.
  const { data: teamRaw, error: teamErr } = await admin
    .from("tb_users")
    .select("userID")
    .eq("coID", userIDMain);
  if (teamErr) {
    console.error(`[commissions-tb summary tb_users] failed`, {
      code: teamErr.code,
      message: teamErr.message,
    });
    return { ok: false, error: `team_lookup_failed: ${teamErr.message}` };
  }
  const teamIds = ((teamRaw ?? []) as { userID: string }[]).map((u) => u.userID);
  const empty: SalesWithdrawalSummary = {
    ...computeCommission(0, percen),
    unpaidCount: 0,
    minWithdrawalThb: SALES_MIN_WITHDRAWAL_THB,
  };
  if (teamIds.length === 0) return { ok: true, data: empty };

  // 2. The team's UNPAID earned rows — tb_user_sales WHERE usstatus='1'.
  const { data: usRaw, error: usErr } = await admin
    .from("tb_user_sales")
    .select("id, idf")
    .eq("usstatus", "1");
  if (usErr) {
    console.error(`[commissions-tb summary tb_user_sales] failed`, {
      code: usErr.code,
      message: usErr.message,
    });
    return { ok: false, error: `earned_lookup_failed: ${usErr.message}` };
  }
  const usRows = (usRaw ?? []) as { id: number; idf: number }[];
  if (usRows.length === 0) return { ok: true, data: empty };

  // 3. tb_forwarder (by idf) — fTotalPrice/fDiscount + the team-membership
  //    filter (LEFT JOIN tb_users + WHERE u.coID).
  const forwarderIds = [...new Set(usRows.map((u) => u.idf))];
  const teamSet = new Set(teamIds);
  const gross = await sumGrossForForwarders(admin, forwarderIds, teamSet);
  if (gross.ok === false) return gross;

  return {
    ok: true,
    data: {
      ...computeCommission(gross.total, percen),
      unpaidCount: gross.countedRows,
      minWithdrawalThb: SALES_MIN_WITHDRAWAL_THB,
    },
  };
}

// ────────────────────────────────────────────────────────────
// 2. The withdrawal request — the legacy `add` POST.
// ────────────────────────────────────────────────────────────
export type SubmitSalesWithdrawalInput = {
  /** the selected tb_user_sales.id values the agent wants to claim. */
  usIds: number[];
  /** bank info — getListForwarder.php name_blank / no_blank / name_account. */
  nameBank: string;
  noBank: string;
  nameAccount: string;
  /** the ID-card PDF (getListForwarder.php `file` — accept=".pdf"). */
  idCardFile: File;
};

/**
 * Submit a commission withdrawal — `report-user-sales.php` L6-81 + the
 * `getListForwarder.php` validation, faithfully.
 *
 * Anti-tamper: the amount is recomputed server-side; the client's selection is
 * re-validated to be unpaid + team-owned + not already in a payout.
 */
export async function submitSalesWithdrawal(
  input: SubmitSalesWithdrawalInput,
): Promise<ActionResult<{ id: number; amount: number }>> {
  // Impersonation is read-only — refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const r = await resolveSignedInAgent();
  if (!r.ok) return r;
  const { userIDMain, authUid, percen, memberCode } = r.agent;

  // ── Validate selection ──
  const usIds = [...new Set((input?.usIds ?? []).map((n) => Number(n)))].filter(
    (n) => Number.isInteger(n) && n > 0,
  );
  if (usIds.length === 0) {
    return { ok: false, error: "กรุณาเลือกรายการที่ต้องการเบิกเงิน" };
  }

  // ── Validate bank info (getListForwarder.php required fields) ──
  const nameBank = (input?.nameBank ?? "").trim();
  const noBank = (input?.noBank ?? "").trim();
  const nameAccount = (input?.nameAccount ?? "").trim();
  if (!nameBank || !noBank || !nameAccount) {
    return { ok: false, error: "กรุณากรอกข้อมูลบัญชีธนาคารให้ครบ" };
  }

  // ── Validate ID-card PDF (getListForwarder.php accept=".pdf") ──
  const file = input?.idCardFile;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "กรุณาแนบสำเนาบัตรประชาชน (.pdf)" };
  }
  if (file.type !== "application/pdf") {
    return { ok: false, error: "ไฟล์สำเนาบัตรต้องเป็น .pdf เท่านั้น" };
  }
  if (file.size > 9 * 1024 * 1024) {
    // getListForwarder.php dropify data-max-file-size="9M".
    return { ok: false, error: "ไฟล์ใหญ่เกิน 9 MB" };
  }

  const admin = createAdminClient();

  // ── Re-validate selection server-side: unpaid + team-owned ──
  // tb_user_sales WHERE id IN (usIds) AND usstatus='1'.
  const { data: usRaw, error: usErr } = await admin
    .from("tb_user_sales")
    .select("id, idf, usstatus")
    .in("id", usIds)
    .eq("usstatus", "1");
  if (usErr) {
    console.error(`[commissions-tb submit tb_user_sales] failed`, {
      code: usErr.code,
      message: usErr.message,
    });
    return { ok: false, error: `earned_lookup_failed: ${usErr.message}` };
  }
  const usRows = (usRaw ?? []) as { id: number; idf: number; usstatus: string }[];
  if (usRows.length === 0) {
    return { ok: false, error: "ไม่พบรายการที่ยังไม่เบิกจ่าย (อาจถูกเบิกไปแล้ว)" };
  }

  // The team's member ids — to confirm each forwarder belongs to the team.
  const { data: teamRaw, error: teamErr } = await admin
    .from("tb_users")
    .select("userID")
    .eq("coID", userIDMain);
  if (teamErr) {
    console.error(`[commissions-tb submit tb_users] failed`, {
      code: teamErr.code,
      message: teamErr.message,
    });
    return { ok: false, error: `team_lookup_failed: ${teamErr.message}` };
  }
  const teamSet = new Set(
    ((teamRaw ?? []) as { userID: string }[]).map((u) => u.userID),
  );

  // tb_forwarder (by idf) — fTotalPrice/fDiscount + team-membership filter.
  const forwarderIds = [...new Set(usRows.map((u) => u.idf))];
  const { data: fwdRaw, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, ftotalprice, fdiscount")
    .in("id", forwarderIds);
  if (fwdErr) {
    console.error(`[commissions-tb submit tb_forwarder] failed`, {
      code: fwdErr.code,
      message: fwdErr.message,
    });
    return { ok: false, error: `forwarder_lookup_failed: ${fwdErr.message}` };
  }
  const fwdById = new Map(
    ((fwdRaw ?? []) as {
      id: number;
      userid: string | null;
      ftotalprice: number | string | null;
      fdiscount: number | string | null;
    }[]).map((f) => [f.id, f]),
  );

  // Keep only the earned rows whose forwarder belongs to a team member.
  const eligibleUs = usRows.filter((u) => {
    const f = fwdById.get(u.idf);
    return f != null && f.userid != null && teamSet.has(f.userid);
  });
  if (eligibleUs.length === 0) {
    return { ok: false, error: "รายการที่เลือกไม่อยู่ในทีมของคุณ" };
  }

  // ── Dedup guard (report-user-sales.php L44-46) — none of the chosen
  //   earned rows may already be linked to a payout. ──
  const eligibleIds = eligibleUs.map((u) => u.id);
  const { data: dupRaw, error: dupErr } = await admin
    .from("tb_user_sales_pay")
    .select("id")
    .in("idus", eligibleIds);
  if (dupErr) {
    console.error(`[commissions-tb submit tb_user_sales_pay dedup] failed`, {
      code: dupErr.code,
      message: dupErr.message,
    });
    return { ok: false, error: `dedup_check_failed: ${dupErr.message}` };
  }
  if (((dupRaw ?? []) as unknown[]).length > 0) {
    // Legacy `eRe` — "ข้อมูลซ้ำ".
    return { ok: false, error: "มีบางรายการถูกเบิกไปแล้ว กรุณาลองใหม่" };
  }

  // ── Recompute amount server-side (anti-tamper) ──
  const grossRows = eligibleUs
    .map((u) => fwdById.get(u.idf))
    .filter((f): f is NonNullable<typeof f> => f != null);
  const gross = sumGross(grossRows);
  const breakdown = computeCommission(gross, percen);

  // ── Min-withdrawal gate (getListForwarder.php L174) ──
  if (!breakdown.eligible) {
    return {
      ok: false,
      error: `คุณมียอดการเบิกเงินน้อยกว่า ${SALES_MIN_WITHDRAWAL_THB.toLocaleString(
        "en-US",
      )} บาท กรุณาสะสมยอดให้ครบหรือมากกว่าเพื่อทำรายการ`,
    };
  }

  // ── Upload the ID-card PDF (getListForwarder.php `file`) ──
  // User-scoped client + `slips` bucket, `{auth.uid()}/sales_withdraw/<ts>.pdf`
  // — same proven convention as submitLegacyWalletDeposit.
  const supabase = await createClient();
  const filePath = `${authUid}/sales_withdraw/${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("slips")
    .upload(filePath, file, { upsert: false, contentType: "application/pdf" });
  if (upErr) {
    return { ok: false, error: `id_card_upload_failed: ${upErr.message}` };
  }

  // ── 1. INSERT tb_user_sales_admin_pay (report-user-sales.php L47-49) ──
  // status='2' (รอดำเนินการ — the customer-create state; admin flips to 3
  // when paying out). imagesSlip='' (admin fills it at pay-out). dateSlip=NOW.
  // adminCreate = the agent's own member code (customer-initiated request).
  const nowIso = new Date().toISOString();
  const { data: headerRow, error: headerErr } = await admin
    .from("tb_user_sales_admin_pay")
    .insert({
      useridmain: userIDMain,
      amount: breakdown.net,
      imagesslip: "",
      file: filePath,
      dateslip: nowIso,
      date: nowIso,
      status: "2",
      admincreate: memberCode,
      name_blank: nameBank,
      no_blank: noBank,
      name_account: nameAccount,
    })
    .select("id")
    .single<{ id: number }>();
  if (headerErr || !headerRow) {
    // Roll back the uploaded PDF so no orphan file lingers.
    await supabase.storage.from("slips").remove([filePath]);
    console.error(`[commissions-tb submit insert header] failed`, {
      code: headerErr?.code,
      message: headerErr?.message,
    });
    return {
      ok: false,
      error: `withdrawal_insert_failed: ${headerErr?.message ?? "no row"}`,
    };
  }
  const idusap = headerRow.id;

  // ── 2. INSERT tb_user_sales_pay links (report-user-sales.php L62-69) ──
  const linkRows = eligibleIds.map((idus) => ({ idus, idusap }));
  const { error: linkErr } = await admin
    .from("tb_user_sales_pay")
    .insert(linkRows);
  if (linkErr) {
    // Roll back the header + the file — keep state consistent.
    await admin.from("tb_user_sales_admin_pay").delete().eq("id", idusap);
    await supabase.storage.from("slips").remove([filePath]);
    console.error(`[commissions-tb submit insert links] failed`, {
      code: linkErr.code,
      message: linkErr.message,
    });
    return { ok: false, error: `withdrawal_link_failed: ${linkErr.message}` };
  }

  // ── 3. UPDATE tb_user_sales SET usStatus='2' (report-user-sales.php L72-73) ──
  const { error: flipErr } = await admin
    .from("tb_user_sales")
    .update({ usstatus: "2" })
    .in("id", eligibleIds);
  if (flipErr) {
    // The header + links are written; a failed flip would let the rows be
    // claimed twice. Roll back links + header + file.
    await admin.from("tb_user_sales_pay").delete().eq("idusap", idusap);
    await admin.from("tb_user_sales_admin_pay").delete().eq("id", idusap);
    await supabase.storage.from("slips").remove([filePath]);
    console.error(`[commissions-tb submit flip usstatus] failed`, {
      code: flipErr.code,
      message: flipErr.message,
    });
    return { ok: false, error: `withdrawal_flip_failed: ${flipErr.message}` };
  }

  return { ok: true, data: { id: idusap, amount: breakdown.net } };
}

// ────────────────────────────────────────────────────────────
// Shared helper — Σ(fTotalPrice − fDiscount) over forwarders, filtered to
// the team. Used by the summary read.
// ────────────────────────────────────────────────────────────
async function sumGrossForForwarders(
  admin: ReturnType<typeof createAdminClient>,
  forwarderIds: number[],
  teamSet: Set<string>,
): Promise<{ ok: true; total: number; countedRows: number } | { ok: false; error: string }> {
  if (forwarderIds.length === 0) return { ok: true, total: 0, countedRows: 0 };
  const { data: fwdRaw, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, ftotalprice, fdiscount")
    .in("id", forwarderIds);
  if (fwdErr) {
    console.error(`[commissions-tb sumGross tb_forwarder] failed`, {
      code: fwdErr.code,
      message: fwdErr.message,
    });
    return { ok: false, error: `forwarder_lookup_failed: ${fwdErr.message}` };
  }
  const rows = ((fwdRaw ?? []) as {
    id: number;
    userid: string | null;
    ftotalprice: number | string | null;
    fdiscount: number | string | null;
  }[]).filter((f) => f.userid != null && teamSet.has(f.userid));
  return { ok: true, total: sumGross(rows), countedRows: rows.length };
}
