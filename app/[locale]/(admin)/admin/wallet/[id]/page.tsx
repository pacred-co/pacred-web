/**
 * /admin/wallet/[id] — type-aware wallet event detail (Wave 19 BUG #3 + #4).
 *
 * Faithful port of `pcs-admin/include/pages/wallet/w-s-deposit-detail.php`
 * (~530 LOC) PLUS the type-2/3/4/6/7 catch-all behaviour that legacy
 * implements implicitly (legacy's deposit-detail handler is shared by every
 * type — slip just renders broken for the no-slip types). Replaces the
 * Wave 7 read-only stub.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Wave 19 BUG #4 (2026-05-25 ค่ำ) — partner topup join via tb_wallet_paydeposit
 * ─────────────────────────────────────────────────────────────────────
 * `tb_wallet_hs` holds 7 transaction types. They split into 3 groups by
 * slip semantics (verified across 104,591 prod rows):
 *
 *   type 1: TOPUP-USER     (32,941/32,982 → 99.9% have slip)  → +amount
 *   type 2: TOPUP-ADMIN    (0/15,980     → never has slip)    → +amount
 *   type 3: WITHDRAW       (592/641      → 92% have slip)     → -amount
 *   type 4: SPEND-FORWARDER (0/47,318    → never has slip)    → -amount
 *   type 5: ADMIN-MANUAL   (0/4,356      → never has slip)    → ±amount
 *   type 6: SPEND-OTHER    (0/1,460      → never has slip)    → -amount
 *   type 7: SPEND-OTHER-2  (0/1,854      → never has slip)    → -amount
 *
 * Critical discovery: a "spend" row (type 4/6/7) frequently HAS a partner
 * topup row created in the SAME transaction. The legacy "เติมแล้วใช้จ่าย
 * ทันที" pattern: customer uploads slip + selects forwarder to pay → system
 * creates id=N (type 1, with slip) AND id=N+1 (type 4, paying that fwd) in
 * pair, linked via `tb_wallet_paydeposit { whid → hno }`.
 *
 * Example seen on prod:
 *   id 105410: type 1, +1748.76, imagesslip=PCS10691_xxx.png, reforder=null
 *   id 105411: type 4, +1748.76, imagesslip=null,            reforder=51201
 *   tb_wallet_paydeposit: { whid: 105410, hno: '51201' }
 *
 * Per ภูม's BUG #4 (2026-05-25): when admin opens id 105411 on the dashboard
 * "ดู / แก้ไข" link, they expected to see the slip (because the matching
 * customer/amount/time topup HAS one). Fix: detect type and follow the
 * paydeposit link to fetch the partner topup's slip + show a banner.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Layout (top-to-bottom):
 *   1. BREADCRUMB     — หน้าแรก / กระเป๋าสตางค์ / <type-label> / #<id>
 *   2. TWO TOP CARDS  — left: this customer's wallet + cash-back balance
 *                       right: system-wide wallet + cash-back totals
 *                       Each has a "+ ชำระเงิน" CTA → /admin/wallet/add
 *   3. DETAIL CARD (2-col on md+):
 *      LEFT  — rich row info: timestamp, customer link, target bank,
 *              slip date (with collapsible <EditDateSlipForm>), amount
 *              (signed: + for topup / - for spend/withdraw),
 *              source/target reference list (paydeposit join):
 *                · For type 1/2: "เงินก้อนนี้ใช้จ่ายค่า: [F51201] [P22302] ..."
 *                · For type 4/6/7: "นี่คือการจ่ายค่า: [F51201] · สลิปอยู่ที่
 *                                    รายการชำระเงินคู่กัน [#105410 →]"
 *      RIGHT — status badge, "ดำเนินรายการแล้ว โดย <admin>" if completed,
 *              <ApproveRejectForm> if still pending (status='1'),
 *              SLIP IMAGE: own slip OR partner-topup slip OR
 *              "ไม่มีสลิป (ไม่จำเป็นสำหรับรายการประเภทนี้)" for type 2/4/5/6/7.
 *   4. SIMILAR-TX WARNING — red banner listing other tb_wallet_hs rows with
 *      the same DATE(dateslip) + amount + status='1' (excluding self).
 *
 * Design philosophy (AGENTS §0a): rebuild the SAME LOGIC in Tailwind v4 +
 * Lucide. Don't copy the Bootstrap-4 markup verbatim — `text-danger`,
 * `card-body pb-0`, `progress-bar` are out. Same fields + same buttons +
 * same status flow are in.
 *
 * Role gate (AGENTS §0c, legacy L17): CEO/Manager/Accounting/ITDT →
 * Pacred roles ["super", "ops", "accounting"]. requireAdmin already grants
 * "super" implicit access to every role-gated page.
 */

import { notFound } from "next/navigation";
import { User as UserIcon, Printer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { SlipCompare } from "@/components/admin/slip-compare";
import { WalletBalanceCard } from "@/components/admin/wallet-balance-card";
import { EditDateSlipForm, ApproveRejectForm, RejectSlipInline } from "./edit-form";
import { classifyWalletHsRow } from "@/lib/wallet/classify-approve-row";
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";
import { loadLinkedForwarderPaymentBatch } from "@/lib/forwarder/linked-payment-batch";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};
/**
 * Solid legacy badges (ปอน 2026-07-15). Legacy is the Modern Admin theme — the
 * same palette its .text-danger/#FF4961 and .tam-counter/#FF9149 come from — so
 * its status pills are solid warning/success/danger with white text, not the
 * tinted pastels we had. Mapping: 1 pending → warning · 2 approved → success ·
 * 3 rejected → danger.
 */
const STATUS_CLS: Record<string, string> = {
  "1": "bg-[#FF9149] text-white border-[#FF9149]",
  "2": "bg-[#28D094] text-white border-[#28D094]",
  "3": "bg-[#FF4961] text-white border-[#FF4961]",
};

// Wave 19 BUG #4: type→label mapping. Covers all 7 wallet types so the
// page reads truthfully no matter which row admin opens (legacy used the
// same handler for every type and just rendered a broken slip image —
// we do better by labelling each type accurately).
const TYPE_LABEL: Record<string, string> = {
  "1": "ชำระเงิน (ลูกค้าโอน)",
  "2": "ชำระเงิน (แอดมินเพิ่ม)",
  "3": "ถอนเงิน",
  "4": "จ่ายค่าฝากนำเข้า",
  "5": "ปรับยอดโดยแอดมิน",
  "6": "จ่ายค่าบริการ",
  "7": "จ่ายค่าบริการ",
};

// Wave 19 BUG #4: amount sign per type. Topup adds to wallet (+), spend &
// withdraw remove from wallet (−). Type 5 can go either way so we let the
// raw amount sign speak for itself (handled at render).
function isCreditType(t: string | null): boolean {
  return t === "1" || t === "2";
}
function isDebitType(t: string | null): boolean {
  return t === "3" || t === "4" || t === "6" || t === "7";
}

// Wave 19 BUG #4: slip semantic per type. Topup-user + withdraw require a
// slip from the customer; topup-admin + every spend type never has one
// (verified against 104,591 prod rows: type 1 → 99.9% have slip; types 2,
// 4, 5, 6, 7 → 0% have slip).
function typeShouldHaveOwnSlip(t: string | null): boolean {
  return t === "1" || t === "3";
}

// Wave 19 BUG #4: hno semantic in tb_wallet_paydeposit. Inferred from prod
// data — pure-digit IDs are forwarder f_no; "P"+digits are shop-order hNo;
// "ONS"+timestamp are legacy invoice numbers (pre-2026 imports).
function classifyHno(hno: string): { kind: "forwarder" | "shop" | "other"; href: string | null; label: string } {
  if (/^\d+$/.test(hno)) {
    return { kind: "forwarder", href: `/admin/forwarders/${hno}`, label: `F${hno}` };
  }
  if (/^P\d+/.test(hno)) {
    return { kind: "shop", href: `/admin/service-orders/${hno}`, label: hno };
  }
  return { kind: "other", href: null, label: hno };
}

type WalletHsRow = {
  id: number;
  date: string | null;
  dateslip: string | null;
  amount: number;
  status: string | null;
  type: string | null;
  typeservice: string | null;
  imagesslip: string | null;
  userid: string;
  note: string | null;
  nouserbank: string | null;
  nameuserbank: string | null;
  depositnamebank: string | null;
  adminidupdate: string | null;
  reforder: string | null;
  reforder2: string | null;
  reviewed_at: string | null;
};

type UserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
  userEmail: string | null;
  userPicture: string | null;
};

type LinkedWalletHsRow = {
  id: number;
  amount: number;
};

type SimilarRow = {
  id: number;
  status: string | null;
  imagesslip: string | null;
  dateslip: string | null;
  amount: number | string | null;
  userid: string | null;
};

type SimilarResolved = {
  id: number;
  status: string | null;
  slipUrl: string | null;
  dateSlip: string | null;
  amount: number;
  name: string;
};

export default async function AdminWalletDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const admin = createAdminClient();

  // ── Main row ──
  const { data: rowRaw, error: rowErr } = await admin
    .from("tb_wallet_hs")
    .select(
      "id,date,dateslip,amount,status,type,typeservice,imagesslip,userid,note,nouserbank,nameuserbank,depositnamebank,adminidupdate,reforder,reforder2,reviewed_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (rowErr) {
    console.error(`[tb_wallet_hs list] failed`, {
      code: rowErr.code,
      message: rowErr.message,
      details: rowErr.details,
      hint: rowErr.hint,
    });
    throw new Error(
      `Failed to load tb_wallet_hs (${rowErr.code ?? "unknown"}): ${rowErr.message}`,
    );
  }
  if (!rowRaw) notFound();
  const row = rowRaw as unknown as WalletHsRow;

  // ── Parallel reads for the rest of the page ──
  const [
    { data: userRaw, error: userErr },
    { data: corpRaw, error: corpErr },
    { data: walletRaw, error: walletErr },
    { data: cbRaw, error: cbErr },
    { data: allWallets, error: allWalletsErr },
    { data: allCb, error: allCbErr },
    { data: linkedRaw, error: linkedErr },
  ] = await Promise.all([
    admin
      .from("tb_users")
      .select("userID,userName,userLastName,userCompany,userTel,userEmail,userPicture")
      .eq("userID", row.userid)
      .maybeSingle(),
    admin
      .from("tb_corporate")
      .select("corporatename,corporatenumber,corporateaddress")
      .eq("userid", row.userid)
      .maybeSingle(),
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", row.userid)
      .maybeSingle(),
    admin
      .from("tb_cash_back")
      .select("cbtotal")
      .eq("userid", row.userid)
      .maybeSingle(),
    // Wave 21 P2 Phase A: System-wide wallet + cash_back totals — fetched
    // here to render the "ยอดรวมทั้งหมดในระบบ" card. Detail page pulls ALL
    // ~8,898 wallet rows just to display one summary card. Survey
    // docs/research/wave-21-p2-query-survey.md §6 — to be replaced by a
    // `get_wallet_system_totals()` RPC in Phase C (saves ~500ms per detail
    // page-load). Leaving the fetches for now: PostgREST has no SUM endpoint.
    admin.from("tb_wallet").select("wallettotal").limit(50_000),
    admin.from("tb_cash_back").select("cbtotal").limit(50_000),
    admin
      .from("tb_wallet_hs")
      .select("id,amount")
      .eq("reforder", String(row.id))
      .eq("userid", row.userid),
  ]);
  if (userErr) console.error(`[tb_users list] failed`, { code: userErr.code, message: userErr.message });
  if (corpErr) console.error(`[tb_corporate list] failed`, { code: corpErr.code, message: corpErr.message });
  if (walletErr) console.error(`[tb_wallet list] failed`, { code: walletErr.code, message: walletErr.message });
  if (cbErr) console.error(`[tb_cash_back list] failed`, { code: cbErr.code, message: cbErr.message });
  if (allWalletsErr)
    console.error(`[tb_wallet list-all] failed`, { code: allWalletsErr.code, message: allWalletsErr.message });
  if (allCbErr)
    console.error(`[tb_cash_back list-all] failed`, { code: allCbErr.code, message: allCbErr.message });
  if (linkedErr)
    console.error(`[tb_wallet_hs linked] failed`, { code: linkedErr.code, message: linkedErr.message });

  const user = userRaw as unknown as UserRow | null;
  const corp = (corpRaw as unknown as {
    corporatename: string | null;
    corporatenumber: string | null;
    corporateaddress: string | null;
  } | null) ?? null;
  const walletTotalUser = Number((walletRaw as { wallettotal: number | null } | null)?.wallettotal ?? 0);
  const cbTotalUser = Number((cbRaw as { cbtotal: number | null } | null)?.cbtotal ?? 0);
  const walletTotalAll = (allWallets ?? []).reduce(
    (s, r) => s + Number((r as { wallettotal: number | null }).wallettotal ?? 0),
    0,
  );
  const cbTotalAll = (allCb ?? []).reduce(
    (s, r) => s + Number((r as { cbtotal: number | null }).cbtotal ?? 0),
    0,
  );
  const linkedRows = (linkedRaw ?? []) as unknown as LinkedWalletHsRow[];
  const linkedSpentTotal = linkedRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const linkedDebitAndCredit = linkedSpentTotal + Number(row.amount ?? 0);

  // ── Resolve slip URL (the OWN slip of this row) ──
  const slipUrl = await resolveLegacyUrl(row.imagesslip, "slip");

  // ── Wave 19 BUG #4: paydeposit join ──
  // For TOPUPS (type 1/2)  → look forward: what did this topup pay for?
  //                          → SELECT hno FROM tb_wallet_paydeposit WHERE whid = row.id
  //                          → renders as "เงินนี้ใช้จ่ายค่า: [F51201] [P22302]"
  // For SPENDS (type 4/6/7) → look backward: which topup funded this spend?
  //                          → SELECT whid FROM tb_wallet_paydeposit WHERE hno = row.reforder
  //                          → cross-check whid in tb_wallet_hs matching userid+amount
  //                          → renders the partner topup's slip + "[#105410 →]" link
  type PayDeposit = { whid: number; hno: string };
  let paymentTargets: { hno: string }[] = [];
  let partnerTopupId: number | null = null;
  let partnerSlipUrl: string | null = null;
  let partnerSlipFilename: string | null = null;

  if (isCreditType(row.type)) {
    // Topup → enumerate targets (what got paid)
    const { data: targets, error: targetsErr } = await admin
      .from("tb_wallet_paydeposit")
      .select("hno")
      .eq("whid", row.id);
    if (targetsErr) {
      console.error(`[tb_wallet_paydeposit forward-lookup] failed`, {
        code: targetsErr.code,
        message: targetsErr.message,
      });
    } else {
      paymentTargets = (targets ?? []) as { hno: string }[];
    }
  } else if (isDebitType(row.type) && row.reforder && row.reforder !== "") {
    // Spend/withdraw → find partner topup via paydeposit reverse-join
    const { data: pdRows, error: pdErr } = await admin
      .from("tb_wallet_paydeposit")
      .select("whid")
      .eq("hno", row.reforder);
    if (pdErr) {
      console.error(`[tb_wallet_paydeposit reverse-lookup] failed`, {
        code: pdErr.code,
        message: pdErr.message,
      });
    } else if (pdRows && pdRows.length > 0) {
      const whids = (pdRows as PayDeposit[]).map((r) => r.whid);
      // Resolve the partner topup with the EXACT matching user+amount (a topup
      // can pay multiple targets so paydeposit alone is N→1; user+amount+id-in
      // disambiguates to the 1 row that funded this specific spend).
      const { data: matchRow, error: matchErr } = await admin
        .from("tb_wallet_hs")
        .select("id,imagesslip,userid,amount")
        .in("id", whids)
        .eq("userid", row.userid)
        .eq("amount", row.amount)
        .limit(1)
        .maybeSingle();
      if (matchErr) {
        console.error(`[tb_wallet_hs partner-topup] failed`, {
          code: matchErr.code,
          message: matchErr.message,
        });
      } else if (matchRow) {
        const partner = matchRow as { id: number; imagesslip: string | null };
        partnerTopupId = partner.id;
        partnerSlipFilename = partner.imagesslip;
        partnerSlipUrl = await resolveLegacyUrl(partner.imagesslip, "slip");
      }
    }
  }

  // ── "ยอดที่ต้องชำระ" per linked payment (legacy right pane) ──
  // Legacy prints the amount each linked target actually owes next to the slip
  // figure, so the reviewer can eyeball slip-vs-due before approving. The
  // targets are forwarder f_no (a shop hNo has no equivalent single figure, so
  // it's simply omitted rather than guessed). Money SOT: calcForwarderOutstanding
  // — the NET "ยอดเก็บจริง" (legacy calPriceForwarderMain), which is what a
  // customer slip is paid against. NOT calcForwarderGross (that's the ใบวางบิล
  // pre-WHT figure) — mixing them would show a 1% gap on juristic rows.
  // DISPLAY-only: no write, no bill/receipt coupling.
  const dueByHno = new Map<string, number>();
  let linkedDueTotal: number | null = null;
  {
    const hnos = isCreditType(row.type)
      ? paymentTargets.map((t) => t.hno)
      : row.reforder ? [row.reforder] : [];
    const fwdIds = hnos.filter((h) => /^\d+$/.test(h));
    if (fwdIds.length > 0 && fwdIds.length === hnos.length) {
      const result = await loadLinkedForwarderPaymentBatch(admin, {
        userId: row.userid,
        forwarderIds: fwdIds,
      });
      if (!result.ok) {
        console.error(`[linked forwarder due-lookup] failed`, { error: result.error });
      } else if (result.missingIds.length > 0) {
        console.error(`[linked forwarder due-lookup] missing rows`, { missingIds: result.missingIds });
      } else {
        linkedDueTotal = result.batch.total_thb;
        for (const line of result.batch.lines) dueByHno.set(line.id, line.price_thb);
      }
    }
  }

  // ── Similar-tx detector (legacy L487-501): same DATE(dateslip) + amount,
  //    type<>5, exclude self. Render as red banner.
  //    PostgREST has no DATE() helper, so we filter by [day_start, day_end]
  //    range derived from dateslip. Skip the check when dateslip is null.
  let similar: SimilarResolved[] = [];
  if (row.dateslip) {
    const slipDate = new Date(row.dateslip);
    if (!Number.isNaN(slipDate.getTime())) {
      const dayStart = new Date(slipDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(slipDate);
      dayEnd.setHours(23, 59, 59, 999);
      const { data: simRaw, error: simErr } = await admin
        .from("tb_wallet_hs")
        .select("id,status,imagesslip,dateslip,amount,userid")
        .eq("amount", row.amount)
        .neq("id", row.id)
        .neq("type", "5")
        .gte("dateslip", dayStart.toISOString())
        .lte("dateslip", dayEnd.toISOString());
      if (simErr) {
        console.error(`[tb_wallet_hs similar] failed`, { code: simErr.code, message: simErr.message });
      } else {
        const sims = ((simRaw ?? []) as unknown as SimilarRow[]).filter((candidate) =>
          !(row.imagesslip?.trim()
            && candidate.userid === row.userid
            && candidate.imagesslip?.trim() === row.imagesslip.trim()),
        );
        // resolve each dup's customer name (junk "0"/"" → empty · นิติ→corp · else ชื่อคน)
        const cleanNm = (s: string | null | undefined) => { const v = (s ?? "").trim(); return v && v !== "0" ? v : ""; };
        const uids = [...new Set(sims.map((s) => s.userid).filter((x): x is string => !!x))];
        const nameByUid = new Map<string, string>();
        if (uids.length) {
          const { data: us, error: usErr } = await admin.from("tb_users").select("userID,userName,userLastName,userCompany").in("userID", uids);
          const { data: cs, error: csErr } = await admin.from("tb_corporate").select("userid,corporatename").in("userid", uids);
          if (usErr) console.error(`[similar names: tb_users]`, { code: usErr.code, message: usErr.message });
          if (csErr) console.error(`[similar names: tb_corporate]`, { code: csErr.code, message: csErr.message });
          const corpBy = new Map((cs ?? []).map((c) => [(c as { userid: string }).userid, (c as { corporatename: string | null }).corporatename]));
          for (const u of (us ?? []) as Array<{ userID: string; userName: string | null; userLastName: string | null; userCompany: string | null }>) {
            nameByUid.set(u.userID, cleanNm(corpBy.get(u.userID)) || `${cleanNm(u.userName)} ${cleanNm(u.userLastName)}`.trim() || cleanNm(u.userCompany) || u.userID);
          }
        }
        similar = await Promise.all(
          sims.map(async (s) => ({
            id: s.id,
            status: s.status,
            slipUrl: await resolveLegacyUrl(s.imagesslip, "slip"),
            dateSlip: s.dateslip,
            amount: Number(s.amount ?? 0),
            name: (s.userid ? nameByUid.get(s.userid) : undefined) || s.userid || "—",
          })),
        );
      }
    }
  }

  // ── F4 shared-imagesslip siblings (owner 2026-07-15 · PR178) ──
  //    A COMBINED payment splits into N per-order pay rows that carry the SAME
  //    uploaded slip file (imagesslip). Distinct from the same-date+amount dup
  //    check above — this matches the EXACT slip filename + same customer. Warn
  //    the reviewer so they treat + edit the group as ONE payment (avoid
  //    "เผลอเปลี่ยนยอด 2 งาน" / double-count on ตัดจ่าย).
  let sharedSlipSiblings: Array<{
    id: number; reforder: string | null; amount: number | string | null;
    status: string | null; reviewed_at: string | null;
  }> = [];
  if (
    row.type === "4"
    && row.typeservice === "2"
    && !String(row.reforder2 ?? "").trim()
    && row.imagesslip?.trim()
    && row.userid
  ) {
    const { data: shRaw, error: shErr } = await admin
      .from("tb_wallet_hs")
      .select("id,reforder,amount,status,reviewed_at")
      .eq("userid", row.userid)
      .eq("imagesslip", row.imagesslip.trim())
      .eq("type", "4")
      .eq("typeservice", "2")
      .is("reforder2", null)
      .neq("id", row.id)
      .limit(50);
    if (shErr) console.error(`[tb_wallet_hs shared-slip siblings] failed`, { code: shErr.code, message: shErr.message });
    else sharedSlipSiblings = (shRaw ?? []) as typeof sharedSlipSiblings;
  }

  // ── Derive view-bits ──
  const sharedSlipRows = [
    { id: row.id, reforder: row.reforder, amount: row.amount, status: row.status, reviewed_at: row.reviewed_at },
    ...sharedSlipSiblings,
  ];
  const isDirectSharedSlip = row.type === "4" && row.typeservice === "2" && !String(row.reforder2 ?? "").trim() && sharedSlipSiblings.length > 0;
  const groupIds = isDirectSharedSlip ? sharedSlipRows.map((item) => item.id) : [row.id];
  const directSharedTargets = isDirectSharedSlip
    ? sharedSlipRows.map((item) => item.reforder).filter((value): value is string => Boolean(value))
    : [];
  if (directSharedTargets.length > 1 && directSharedTargets.every((value) => /^\d+$/.test(value))) {
    const groupedDue = await loadLinkedForwarderPaymentBatch(admin, {
      userId: row.userid,
      forwarderIds: directSharedTargets,
    });
    if (groupedDue.ok && groupedDue.missingIds.length === 0) {
      dueByHno.clear();
      linkedDueTotal = groupedDue.batch.total_thb;
      for (const line of groupedDue.batch.lines) dueByHno.set(line.id, line.price_thb);
    } else {
      console.error("[shared-slip grouped due-lookup] failed", groupedDue);
    }
  }
  const amount = isDirectSharedSlip
    ? sharedSlipRows.reduce((satang, item) => satang + Math.round(Number(item.amount ?? 0) * 100), 0) / 100
    : Number(row.amount ?? 0);
  const linkedAmountMismatch = linkedDueTotal !== null && Math.round(linkedDueTotal * 100) !== Math.round(amount * 100);
  const status = row.status ?? "1";
  const isPending = status === "1";
  const userid = row.userid;
  const customerName =
    resolveBillingIdentity({
      userCompany: user?.userCompany,
      userName: user?.userName,
      userLastName: user?.userLastName,
      corp,
    }).name || "—";
  const userAvatar = await resolveLegacyUrl(user?.userPicture ?? null, "profile-thumb");

  // Wave 19 BUG #4: type-aware labels for breadcrumb + page title.
  const typeKey = row.type ?? "1";
  const typeLabel = TYPE_LABEL[typeKey] ?? `รายการประเภท ${typeKey}`;
  const isCredit = isCreditType(typeKey);
  const isDebit = isDebitType(typeKey);
  const shouldHaveOwnSlip = typeShouldHaveOwnSlip(typeKey);

  // DIRECT-CUT label fix (money-critical · 2026-07-02). A ฝากนำเข้า direct-slip
  // (type='4' typeservice='2' · reforder set · reforder2 empty · NOT part of a
  // "เติม-แล้วจ่าย" cascade) is settled from the BANK — the wallet is untouched
  // (submitForwarderPayment · forwarder.ts L509-561 · approve keeps walletDelta 0).
  // Rendering the red "−฿… หักจากกระเป๋า" label lies. `partnerTopupId === null`
  // means the reverse paydeposit lookup found no paired topup → not a cascade →
  // treat the classifier's hasPaydepositLink as false for the label.
  const directSlipShape = classifyWalletHsRow(
    { type: row.type, typeservice: row.typeservice, reforder: row.reforder, reforder2: row.reforder2, amount: row.amount },
    { hasPaydepositLink: partnerTopupId !== null },
  );
  const isDirectSlip = directSlipShape.shape === "direct-slip";

  // A4 two-round verify — customer payment slips (type 1/4/8) require a round-1
  // review before the approve (round-2). STEP-1 fold: round-1 is confirmed on the
  // left date panel (<EditDateSlipForm>), so pass the flag + stamp there too.
  const reviewedAt = (row as { reviewed_at?: string | null }).reviewed_at ?? null;
  const needsRound1 = row.type === "1" || row.type === "4" || row.type === "8";

  // Slip-compare (owner 2026-07-15): the customer's real slip (green frame) beside
  // the duplicate slip(s) (red frame). Customer slip = own slip, else the paired
  // topup's slip (cascade). One reason string preserves the old 6-branch fallbacks.
  const customerSlipUrl = slipUrl ?? partnerSlipUrl;
  const customerSlipMissingReason: string | null = customerSlipUrl
    ? null
    : row.imagesslip
      ? `⚠ ไม่สามารถสร้างลิงก์สลิปได้ (${row.imagesslip})`
      : partnerSlipFilename
        ? `⚠ ไม่สามารถสร้างลิงก์สลิปจากรายการคู่กันได้ (#${partnerTopupId})`
        : !shouldHaveOwnSlip
          ? `ไม่จำเป็นต้องมีสลิปสำหรับรายการประเภทนี้ (${typeLabel} — หักจากกระเป๋าโดยตรง)`
          : "ลูกค้ายังไม่ได้อัพโหลดสลิป";

  // ── Issued receipt (owner 2026-07-16) ──────────────────────────────
  //    A settled forwarder-slip mints a ใบเสร็จ (tb_receipt). The auto-issue
  //    hook links it back to the FUNDING slip via tb_receipt.refwhid = this
  //    tb_wallet_hs.id (lib/admin/auto-issue-receipt.ts). Surface its เลขที่ +
  //    a print link + a jump to the receipt history — the legacy completed view.
  //    Fallback: older receipts (pre-refwhid backfill) are reachable only via
  //    tb_receipt_item.fid, so when refwhid finds nothing and reforder is a
  //    forwarder id, resolve the receipt through the item table instead.
  //    rstatus='2' (ยกเลิก) is excluded — a voided receipt is not "this receipt".
  //    Fail-soft: any read error logs + leaves issuedReceipt null (never blocks
  //    the page or the approve flow).
  let issuedReceipt: { id: number; rid: string } | null = null;
  if (!isPending) {
    const { data: byWhid, error: rcptErr } = await admin
      .from("tb_receipt")
      .select("id,rid")
      .eq("refwhid", row.id)
      .neq("rstatus", "2")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: number; rid: string }>();
    if (rcptErr) console.error(`[tb_receipt by refwhid] failed`, { code: rcptErr.code, message: rcptErr.message });
    if (byWhid) {
      issuedReceipt = { id: byWhid.id, rid: byWhid.rid };
    } else if (row.reforder && /^\d+$/.test(row.reforder)) {
      const { data: items, error: itemErr } = await admin
        .from("tb_receipt_item")
        .select("rid")
        .eq("fid", Number(row.reforder));
      if (itemErr) console.error(`[tb_receipt_item by fid] failed`, { code: itemErr.code, message: itemErr.message });
      const rids = [
        ...new Set(((items ?? []) as Array<{ rid: string | null }>).map((i) => i.rid).filter((x): x is string => !!x)),
      ];
      if (rids.length > 0) {
        const { data: byItem, error: byItemErr } = await admin
          .from("tb_receipt")
          .select("id,rid")
          .in("rid", rids)
          .neq("rstatus", "2")
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle<{ id: number; rid: string }>();
        if (byItemErr) console.error(`[tb_receipt by item rids] failed`, { code: byItemErr.code, message: byItemErr.message });
        if (byItem) issuedReceipt = { id: byItem.id, rid: byItem.rid };
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    /* Legacy-faithful page canvas: a light-grey field so the white cards read as
       cards (the default --background is #fff → white-on-white, which is why this
       page looked flat). LIGHT only — in dark the tokens already give contrast
       (page #0d0d0d vs card #1a1a1a); painting dark:bg-surface here would instead
       make the cards blend into the canvas.
       Height: fill the viewport BELOW the fixed h-14 header so a short row (e.g.
       an approved one, no form) still paints grey to the bottom. The 3.5rem must
       track the layout's own `header h-14` + `.admin-content pt-14` — a plain
       min-h-screen here overflows by exactly that header (verified: +56px). */
    <main className="p-4 lg:p-6 space-y-4 min-h-[calc(100vh-3.5rem)] bg-surface dark:bg-background">
      {/* ── 1. BREADCRUMB — Wave 19 BUG #4: type-aware label.
          Sits ABOVE the balance cards (legacy order · ปอน 2026-07-15): the trail
          is page chrome, so it leads; the cards are content. ── */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/wallet" className="hover:text-primary-600">กระเป๋าสตางค์</Link>
        <span>/</span>
        <Link href="/admin/wallet?view=tx" className="hover:text-primary-600">{typeLabel}</Link>
        <span>/</span>
        <span className="font-mono text-foreground">#{row.id}</span>
      </nav>

      {/* ── 2. TOP CARDS: per-user + system-wide ──
          gap-8 (32px) ≈ legacy's Bootstrap-4 row gutter (30px), which is what
          gives the pair their distinct separation; our old gap-3 (12px) read as
          one block. mb-5 reserves room for the CTA pill that overhangs each. */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-5">
        <WalletBalanceCard
          title="ยอดเงินของสมาชิก"
          subtitle={`กระเป๋าสตางค์ ${userid} (บาท)`}
          amount={walletTotalUser}
          cashback={cbTotalUser}
          payHref="/admin/wallet/add"
        />
        <WalletBalanceCard
          title="ยอดรวมทั้งหมดในระบบ"
          subtitle="กระเป๋าสตางค์ (บาท)"
          amount={walletTotalAll}
          cashback={cbTotalAll}
          titleTone="ink"
          payHref="/admin/wallet/add"
        />
      </section>

      {/* ── 3. DETAIL CARD (2-col) ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* LEFT — info pane (no divider between panes · ปอน 2026-07-15) */}
          <div className="p-5 space-y-3">
            <h2 className="text-xl font-light tracking-tight text-foreground leading-tight">
              {/* §0h — detail header is a real page-title tier (was text-lg).
                  Wave 19 BUG #4: type-aware title (was hard-coded "รายการชำระเงิน").
                  Legacy sets the whole line in plain ink, id included. */}
              รายการ{typeLabel}กระเป๋าสตางค์ <span className="font-mono">#{row.id}</span>
            </h2>

            {/* Legacy prints the raw stamp — `2026-07-15 09:45:31`, Gregorian, to
                the second. Ours re-formatted to พ.ศ. and dropped the seconds, so
                the two pages couldn't be reconciled row-by-row. The second is the
                point here: it's what separates a double-submitted slip from one
                genuine transfer. */}
            <KV label="เวลาทำรายการ" value={row.date ? formatLegacyStamp(row.date) : "—"} />

            <div className="flex items-center gap-1.5 text-[18.48px]">
              <span className="text-muted">จาก:</span>
              <Link
                href={`/admin/customers/${userid}`}
                className="inline-flex items-center gap-2 text-primary-600 hover:underline"
              >
                {userAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userAvatar}
                    alt={customerName}
                    className="h-10 w-10 rounded-full object-cover border border-border"
                  />
                ) : (
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-alt text-muted">
                    <UserIcon className="h-5 w-5" />
                  </span>
                )}
                <span className="font-mono">[{userid}]</span>
                <span>{customerName}</span>
              </Link>
            </div>

            {/* Legacy prints the DESTINATION account as one string —
                `KBANK-064-174-3836` (bank + number). Ours showed the bank alone
                and stranded the number in a mini-table in the other pane, so the
                reviewer couldn't tell WHICH Pacred account a slip was paid into
                without hunting. Joined here, as legacy does; the number is
                dropped only when the row genuinely lacks one. */}
            <div className="text-[18.48px]">
              <span className="text-red-700 font-semibold">โอนเข้าบัญชี: </span>
              <span>
                {[row.depositnamebank, row.nouserbank].filter(Boolean).join("-") || "—"}
              </span>
            </div>

            {/* Legacy renders the slip-transfer time as a solid danger-red badge on
                the LEFT (display) while the EDITOR lives on the right, above the
                approve. Ported: the value stays here, <EditDateSlipForm> moved
                to the right pane so the fill-date → dup-check → approve flow
                reads top-to-bottom in one column (as legacy does).

                The badge wraps "label + whatever value exists" — with no date it
                ends at the colon, exactly as legacy leaves it. It does NOT append
                a "(ยังไม่ได้กรอก)": the empty tail already says that, and the red
                is the alarm. Red stays on even once filled — legacy keeps this
                line flagged because matching it to the slip is the whole job. */}
            <div className="text-[18.48px]">
              <span className="inline-block rounded px-2 py-0.5 text-[15px] font-semibold bg-[#FF4961] text-white">
                เวลาโอนเงินในสลิป : {row.dateslip ? formatLegacyStamp(row.dateslip) : ""}
              </span>
            </div>

            <div className="text-[18.48px]">
              {/* "จำนวนเงินในสลิป : +X บาท" in legacy's success green — legacy's own
                  wording (ปอน 2026-07-15, owner-directed), and it reads true for
                  every slip-backed type: the line describes THE SLIP (money the
                  customer sent us), not the wallet delta. That's why the "+" is
                  honest even on a type-4 cascade spend, whose wallet leg is −X:
                  the slip really is +X incoming. The wallet direction is carried
                  by the row's own title ("รายการจ่ายค่าฝากนำเข้า…") and the right
                  pane's ยอดที่ต้องชำระ, not by this figure.
                  Type 5 (admin manual) keeps the neutral label: there IS no slip,
                  so "จำนวนเงินในสลิป" would name a document that doesn't exist. */}
              {isCredit || isDirectSlip || isDebit ? (
                <>
                  <span className="font-bold text-[#28D094]">จำนวนเงินในสลิป : </span>
                  <span className="font-mono font-extrabold text-[#28D094]">
                    +{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-muted">จำนวนเงิน: </span>
                  <span className="font-mono font-bold">
                    {amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                  </span>
                </>
              )}
            </div>

            {/* F4 — shared-slip warning (owner PR178): this slip covers ≥2 รายการ
                (ชำระรวมสลิปเดียว). Treat + ตัดจ่าย as ONE payment · ระวังแก้ยอดกระทบงานอื่น. */}
            {sharedSlipSiblings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-800">
                <div className="font-semibold">🔗 สลิปนี้ใช้ร่วมกับอีก {sharedSlipSiblings.length} รายการ (ชำระรวมสลิปเดียว)</div>
                <p className="mt-0.5 text-[13px]">
                  ตรวจ/ตัดจ่ายพร้อมกันเป็นชุดเดียว · แก้ยอดรายการนี้อาจกระทบงานอื่น (ระวังยอด/เหมาๆ ซ้ำ)
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {sharedSlipSiblings.map((s) => (
                    <Link
                      key={s.id}
                      href={`/admin/wallet/${s.id}`}
                      className="inline-flex items-center rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                      title={s.reforder ? `ออเดอร์ #${s.reforder}` : undefined}
                    >
                      #{s.id}{s.reforder ? ` · ออเดอร์ ${s.reforder}` : ""} ↗
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {linkedRows.length > 0 && (
              <div className="text-sm space-y-1 rounded-lg border border-border bg-surface-alt/40 p-2">
                {linkedRows.map((l) => (
                  <div key={l.id}>
                    <span className="text-red-700 font-semibold">ยอดในเป๋าตัง: </span>
                    <span className="font-mono font-bold text-red-700">
                      −{Number(l.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                    </span>
                  </div>
                ))}
                <div>
                  <span className="text-red-700 font-semibold">ยอดที่ใช้ชำระ: </span>
                  <span className="font-mono font-bold text-red-700">
                    {linkedDebitAndCredit.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                  </span>
                </div>
              </div>
            )}

            <div className="pt-1">
              <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLS[status]}`}>
                {STATUS_LABEL[status] ?? `status ${status}`}
              </span>
              {row.note && (
                <p className="mt-2 text-xs text-muted whitespace-pre-line">หมายเหตุ: {row.note}</p>
              )}
            </div>

            {/* ── SLIP COMPARE (owner 2026-07-15): 2 กรอบเทียบกัน — เขียว = สลิป
                   ลูกค้าตัวจริง · แดง = สลิปที่ซ้ำ (+N นับจำนวน · เลื่อนดูได้). ── */}
            <SlipCompare
              customerSlipUrl={customerSlipUrl}
              customerSlipMissingReason={customerSlipMissingReason}
              customerName={customerName}
              dups={similar.map((s) => ({
                id: s.id,
                slipUrl: s.slipUrl,
                dateSlip: s.dateSlip,
                amount: s.amount,
                name: s.name,
                status: s.status,
              }))}
            />
          </div>

          {/* RIGHT — status + linked payments + date/approve pane */}
          <div className="p-5 space-y-3">
            {/* Legacy right pane is a right-aligned column of plain lines split by
                rules — no nested cards. Ported shape:
                  สถานะรายการ : [pill]
                  ───────────────────────
                  รายการนี้มาพร้อมกับรายการชำระเงิน
                  1. รายการชำระเงินฝากนำเข้า : <no>
                     ยอดที่ต้องชำระ : <due>
                  จำนวนเงินในสลิป : <x>   ยอดรวมทุกรายการ : <x>
                  ───────────────────────
                  วันเวลาที่โอนในสลิป … */}
            {/* Legacy: one <h3> at 21.14px / #464855 whose accessible name reads
                "สถานะรายการ : รอดำเนินการ" — i.e. the pill sits INSIDE the heading,
                not beside it. Ours had them as siblings at 16px, so the line read
                small and screen readers announced the label without its value. */}
            <h3 className="mb-[7px] flex items-center justify-end gap-2 text-[21.14px] font-medium text-[#464855] dark:text-foreground">
              สถานะรายการ :
              <span className={`rounded-full border px-3 py-0.5 text-[14px] font-medium ${STATUS_CLS[status]}`}>
                {STATUS_LABEL[status] ?? `status ${status}`}
              </span>
            </h3>

            {(isCredit ? paymentTargets.length > 0 : Boolean(isDebit && row.reforder)) && (
              <div className="border-t border-border pt-3 text-right space-y-1">
                <p className="text-base font-semibold text-foreground">รายการนี้มาพร้อมกับรายการชำระเงิน</p>
                {(isCredit
                  ? paymentTargets.map((t) => t.hno)
                  : directSharedTargets.length > 0 ? directSharedTargets : [row.reforder!]
                ).map((hno, i) => {
                  const c = classifyHno(hno);
                  const due = dueByHno.get(hno);
                  return (
                    <div key={`${hno}-${i}`}>
                      <p className="text-sm">
                        {c.href ? (
                          <Link href={c.href} className="text-sky-700 hover:underline">
                            {i + 1}. รายการชำระเงิน{c.kind === "shop" ? "ฝากสั่งซื้อ" : "ฝากนำเข้า"} :{" "}
                            <span className="font-mono font-bold">{c.label} →</span>
                          </Link>
                        ) : (
                          <span className="text-sky-700">
                            {i + 1}. รายการชำระเงิน{c.kind === "shop" ? "ฝากสั่งซื้อ" : "ฝากนำเข้า"} :{" "}
                            <span className="font-mono font-bold">{c.label}</span>
                          </span>
                        )}
                      </p>
                      {due !== undefined && (
                        <p className="text-xs text-muted">
                          ยอดที่ต้องชำระ : {due.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  );
                })}
                <p className="mt-1 border-t border-border/70 pt-2 text-[21.14px] font-medium text-green-700">
                  จำนวนเงินในสลิป : {amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  <span className="ml-3 text-red-700">
                    ยอดรวมทุกรายการ : {(linkedDueTotal ?? amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </span>
                </p>
                {linkedAmountMismatch && (
                  <p className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    ยอดรายการจริงไม่ตรงกับยอดที่บันทึกในรายการชำระเงิน กรุณาตรวจสอบก่อนอนุมัติ
                  </p>
                )}

                {/* ใบเสร็จที่ออกแล้ว (owner 2026-07-16) — เลขที่ + พิมพ์ใบเสร็จรายการนี้
                    + ไปยังประวัติใบเสร็จ. Shown once this settled row minted (or points
                    to) a ใบเสร็จ (tb_receipt) — mirrors the legacy completed view. */}
                {issuedReceipt && (
                  <div className="mt-2 border-t border-border/60 pt-2 space-y-2">
                    <p className="text-sm text-foreground">
                      เลขที่ใบเสร็จชำระเงิน :{" "}
                      <span className="font-mono font-bold text-primary-700 dark:text-primary-400">
                        {issuedReceipt.rid}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={`/admin/accounting/forwarder-invoice/${issuedReceipt.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"
                      >
                        <Printer className="h-3.5 w-3.5" /> ใบเสร็จรายการนี้
                      </Link>
                      <Link
                        href="/admin/accounting/receipts"
                        className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-orange-600"
                      >
                        ไปยังประวัติใบเสร็จ
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SLIP-VERIFY FLOW · แยกเป็น 2 หน้า (owner 2026-07-15) ──
                   หน้า 1 = กรอกวันเวลาที่โอน (รอบ 1) → กดบันทึก → advance →
                   หน้า 2 = ออกเลขที่ใบเสร็จ + อนุมัติ (รอบ 2). รายการที่ไม่ต้อง
                   รอบ 1 (ถอนเงิน type='3') ข้ามไปหน้า 2 เลย. Completed → audit. */}

            {needsRound1 && (
              <ol className="grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-3" aria-label="ขั้นตอนตรวจสลิป">
                {[
                  { no: 1, label: "ตรวจสลิป · วันโอน · รายการซ้ำ", done: Boolean(reviewedAt) || !isPending },
                  { no: 2, label: "ตรวจข้อมูลเอกสาร · เลขที่ใบเสร็จ", done: status === "2", active: isPending && Boolean(reviewedAt) },
                  { no: 3, label: "อนุมัติตัดจ่าย · เปิดใบเสร็จ", done: status === "2", active: status === "2" },
                ].map((step) => (
                  <li
                    key={step.no}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                      step.done
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : step.active
                          ? "border-sky-400 bg-sky-50 text-sky-900 ring-2 ring-sky-100"
                          : "border-border bg-surface-alt/40 text-muted"
                    }`}
                  >
                    <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full border border-current text-[11px]">
                      {step.done ? "✓" : step.no}
                    </span>
                    {step.label}
                  </li>
                ))}
              </ol>
            )}

            {/* หน้า 1 — วันเวลาที่โอนในสลิป (ยังไม่ผ่านรอบ 1) */}
            {isPending && needsRound1 && !reviewedAt && (
              <div className="border-t border-border pt-3">
                <p className="text-sm font-semibold text-foreground">วันเวลาที่โอนในสลิป</p>
                <p className="mt-0.5 mb-1 text-[11px] text-muted">
                  ขั้นที่ 1 · กรอกวันเวลาให้ตรงสลิป แล้วกดบันทึก จึงจะไปหน้าออกใบเสร็จ (รอบ 2)
                </p>
                <EditDateSlipForm
                  id={row.id}
                  initialDateSlip={row.dateslip}
                  needsRound1={needsRound1}
                  reviewedAt={reviewedAt}
                />
                {/* ตีกลับสลิป (owner 2026-07-16) — สลิปปลอม/ซ้ำ/ไม่ตรง → ปฏิเสธ
                    ตั้งแต่หน้า 1 (ถอยสถานะให้ลูกค้าจ่ายใหม่) โดยไม่ต้องผ่านรอบ 1 ก่อน.
                    reuse ตัวปฏิเสธเดิม (adminRejectWalletDeposit) — ไม่มี money logic ใหม่. */}
                <RejectSlipInline id={row.id} groupIds={groupIds} />
              </div>
            )}

            {/* หน้า 2 — ออกเลขที่ใบเสร็จ + อนุมัติ (ผ่านรอบ 1 แล้ว · หรือไม่ต้องรอบ 1) */}
            {isPending && (!needsRound1 || reviewedAt) && (
              <>
                {/* header ย่อ: ผ่านรอบ 1 แล้ว + ปุ่มแก้ไขเวลา (ย้อนกลับได้) */}
                {needsRound1 && reviewedAt && (
                  <div className="border-t border-border pt-3">
                    <EditDateSlipForm
                      id={row.id}
                      initialDateSlip={row.dateslip}
                      needsRound1={needsRound1}
                      reviewedAt={reviewedAt}
                      showLabel="แก้ไขเวลาที่โอน"
                    />
                  </div>
                )}
                <ApproveRejectForm
                  id={row.id}
                  groupIds={groupIds}
                  hasDateSlip={Boolean(row.dateslip)}
                  kind={row.type === "3" ? "withdraw" : "deposit"}
                  // ชั้น-1 dup gate: only a pending('1')/approved('2') same-day
                  // same-amount twin is a double-pay risk (a rejected '3' twin is
                  // harmless) — mirror the server's findDuplicateSlips predicate.
                  hasDuplicate={similar.some(
                    (s) => s.status === "1" || s.status === "2",
                  )}
                  needsRound1={needsRound1}
                  reviewedAt={reviewedAt}
                  // round-1 status shown in the header above → don't repeat the banner
                  showRound1Banner={false}
                  // STEP-2 doc-number panel: a receipt-issuing slip → let accounting
                  // see/edit the receipt เลขที่ before it's minted. Two shapes issue a
                  // receipt at approve:
                  //   · DIRECT type-4 slip (reforder = the fid)
                  //   · type-1 COMBINED payment (ONE slip + total · paydeposit links →
                  //     forwarder children — legacy "1 การจ่าย = 1 บิล = 1 ใบเสร็จ") —
                  //     the cascade mints ONE receipt covering EVERY linked fid; the
                  //     first fid is the representative for the preview/link.
                  receiptContext={
                    isDirectSlip && row.reforder && /^\d+$/.test(String(row.reforder))
                      ? { fid: Number(row.reforder), userid, dateSlipIso: row.dateslip }
                      : row.type === "1"
                          && paymentTargets.length > 0
                          && paymentTargets.every((t) => /^\d+$/.test(t.hno))
                        ? { fid: Number(paymentTargets[0].hno), userid, dateSlipIso: row.dateslip }
                        : null
                  }
                />
              </>
            )}

            {/* Completed → audit badge (owner 2026-07-16 · red status pill like
                legacy PCS · was a flat grey box). Centered · white on danger-red
                (#FF4961 · same danger hue as the rejected status pill above). */}
            {!isPending && (
              <div className="flex justify-center pt-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF4961] px-4 py-1.5 text-[13px] font-medium text-white">
                  ดำเนินรายการแล้ว โดย :{" "}
                  <span className="font-mono font-semibold">{row.adminidupdate ?? "—"}</span>
                </span>
              </div>
            )}

          </div>
        </div>
      </section>

    </main>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

/**
 * A label:value line at legacy's own scale — 18.48px Prompt / #464855, read off
 * `h4.pt-1` on the live legacy page (its rem base is 14px, so this is 1.32rem).
 * Ours sat at 14px, which is what made every left-column line read small.
 *
 * Rendered as a <p>, not the <h4> legacy uses: this is a data line, not a
 * section heading, and emitting a heading here would put a bogus rung in the
 * document outline for screen readers. Size + colour are what must match.
 */
function KV({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[18.48px] text-[#464855] dark:text-foreground">
      <span className="text-muted">{label} : </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

/**
 * The legacy stamp: `2026-07-15 09:45:31` — Gregorian, to the second, exactly as
 * `tb_wallet_hs.date` holds it. Reproduced verbatim so a row on this page can be
 * reconciled 1:1 against the legacy screen (and against the bank slip, where the
 * SECOND is what tells a double-submit apart from one real transfer).
 *
 * These columns are naive local-time strings, NOT timestamptz — so slice the raw
 * value rather than `new Date()`, which would re-interpret it as UTC and shift
 * the clock by the Bangkok offset.
 */
function formatLegacyStamp(raw: string): string {
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  const short = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return short ? `${short[1]} ${short[2]}:00` : raw;
}
