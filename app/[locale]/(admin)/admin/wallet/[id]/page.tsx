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
 *   1. TWO TOP CARDS  — left: this customer's wallet + cash-back balance
 *                       right: system-wide wallet + cash-back totals
 *                       Each has a "+ ชำระเงิน" CTA → /admin/wallet/add
 *   2. BREADCRUMB     — หน้าแรก / กระเป๋าสตางค์ / <type-label> / #<id>
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
import { ArrowLeft, Plus, User as UserIcon, AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { SlipImage } from "@/components/admin/slip-image";
import { EditDateSlipForm, EditAmountForm, ApproveRejectForm } from "./edit-form";
import { classifyWalletHsRow } from "@/lib/wallet/classify-approve-row";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-red-100 text-red-700 border-red-200",
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
};

type UserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
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
};

type SimilarResolved = SimilarRow & { slipUrl: string | null };

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
    { data: walletRaw, error: walletErr },
    { data: cbRaw, error: cbErr },
    { data: allWallets, error: allWalletsErr },
    { data: allCb, error: allCbErr },
    { data: linkedRaw, error: linkedErr },
  ] = await Promise.all([
    admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel,userEmail,userPicture")
      .eq("userID", row.userid)
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
  if (walletErr) console.error(`[tb_wallet list] failed`, { code: walletErr.code, message: walletErr.message });
  if (cbErr) console.error(`[tb_cash_back list] failed`, { code: cbErr.code, message: cbErr.message });
  if (allWalletsErr)
    console.error(`[tb_wallet list-all] failed`, { code: allWalletsErr.code, message: allWalletsErr.message });
  if (allCbErr)
    console.error(`[tb_cash_back list-all] failed`, { code: allCbErr.code, message: allCbErr.message });
  if (linkedErr)
    console.error(`[tb_wallet_hs linked] failed`, { code: linkedErr.code, message: linkedErr.message });

  const user = userRaw as unknown as UserRow | null;
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
        .select("id,status,imagesslip")
        .eq("amount", row.amount)
        .neq("id", row.id)
        .neq("type", "5")
        .gte("dateslip", dayStart.toISOString())
        .lte("dateslip", dayEnd.toISOString());
      if (simErr) {
        console.error(`[tb_wallet_hs similar] failed`, { code: simErr.code, message: simErr.message });
      } else {
        const sims = (simRaw ?? []) as unknown as SimilarRow[];
        similar = await Promise.all(
          sims.map(async (s) => ({ ...s, slipUrl: await resolveLegacyUrl(s.imagesslip, "slip") })),
        );
      }
    }
  }

  // ── Derive view-bits ──
  const amount = Number(row.amount ?? 0);
  const status = row.status ?? "1";
  const isPending = status === "1";
  const userid = row.userid;
  const customerName = `${user?.userName ?? ""} ${user?.userLastName ?? ""}`.trim() || "—";
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

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    <main className="p-4 lg:p-6 space-y-4">
      {/* ── 1. TOP CARDS: per-user + system-wide ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BalanceCard
          title="ยอดเงินของสมาชิก"
          subtitle={`กระเป๋าสตางค์ ${userid} (บาท)`}
          amount={walletTotalUser}
          cashback={cbTotalUser}
        />
        <BalanceCard
          title="ยอดรวมทั้งหมดในระบบ"
          subtitle="กระเป๋าสตางค์ (บาท)"
          amount={walletTotalAll}
          cashback={cbTotalAll}
        />
      </section>

      {/* ── 2. BREADCRUMB — Wave 19 BUG #4: type-aware label ── */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/wallet" className="hover:text-primary-600">กระเป๋าสตางค์</Link>
        <span>/</span>
        <Link href="/admin/wallet?view=tx" className="hover:text-primary-600">{typeLabel}</Link>
        <span>/</span>
        <span className="font-mono text-foreground">#{row.id}</span>
      </nav>

      {/* ── 3. DETAIL CARD (2-col) ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* LEFT — info pane */}
          <div className="p-5 space-y-3 border-b md:border-b-0 md:border-r border-border">
            <h2 className="text-xl font-bold tracking-tight text-foreground leading-tight">
              {/* §0h — detail header is a real page-title tier (was text-lg).
                  Wave 19 BUG #4: type-aware title (was hard-coded "รายการชำระเงิน") */}
              รายการ{typeLabel}กระเป๋าสตางค์ <span className="font-mono text-primary-600">#{row.id}</span>
            </h2>

            <KV label="เวลาทำรายการ" value={row.date ? formatThai(row.date) : "—"} />

            <div className="text-sm">
              <span className="text-muted">จาก: </span>
              <Link
                href={`/admin/customers/${userid}`}
                className="inline-flex items-center gap-2 text-primary-600 hover:underline"
              >
                {userAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userAvatar}
                    alt={customerName}
                    className="h-7 w-7 rounded-full object-cover border border-border"
                  />
                ) : (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-alt text-muted">
                    <UserIcon className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="font-mono">[{userid}]</span>
                <span>{customerName}</span>
              </Link>
            </div>

            <div className="text-sm">
              <span className="text-red-700 font-semibold">โอนเข้าบัญชี: </span>
              <span>{row.depositnamebank || "—"}</span>
            </div>

            <div className="text-sm">
              <span className={
                `inline-block rounded px-2 py-0.5 text-xs font-semibold ` +
                (isPending && !row.dateslip ? "bg-red-600 text-white" : "bg-amber-100 text-amber-900")
              }>
                เวลาโอนเงินในสลิป: {row.dateslip ? formatThai(row.dateslip) : "(ยังไม่ได้กรอก)"}
              </span>
              {isPending && (
                <EditDateSlipForm id={row.id} initialDateSlip={row.dateslip} />
              )}
            </div>

            <div className="text-sm">
              {/* Wave 19 BUG #4 + DIRECT-CUT (2026-07-02): sign-aware amount label.
                  Credit (type 1/2): green "+เข้ากระเป๋า"
                  Direct-slip (type 4 direct-cut): neutral blue "ชำระโดยสลิป / โอนเข้าบัญชี"
                    — money settled from the BANK, the wallet is untouched, so the
                    red "−หักจากกระเป๋า" would be a lie.
                  Debit (type 3/4-cascade/6/7): red "−หักจากกระเป๋า"
                  type 5 (admin manual): neutral — let the raw sign speak. */}
              {isCredit ? (
                <>
                  <span className="font-semibold text-green-700">จำนวนเงินเข้ากระเป๋า: </span>
                  <span className="font-mono font-bold text-green-700">
                    +{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                  </span>
                </>
              ) : isDirectSlip ? (
                <>
                  <span className="font-semibold text-sky-700">ชำระโดยสลิป / โอนเข้าบัญชี: </span>
                  <span className="font-mono font-bold text-sky-700">
                    {amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                  </span>
                </>
              ) : isDebit ? (
                <>
                  <span className="font-semibold text-red-700">จำนวนเงินที่หักจากกระเป๋า: </span>
                  <span className="font-mono font-bold text-red-700">
                    −{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
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
              {/* #6 (owner 2026-06-26) — correct the slip amount.
                  Pending customer-slip rows (type 1/4/8 · server refuses linked
                  "เติม-แล้วจ่าย" topups) — PLUS an APPROVED ฝากสั่งซื้อ slip
                  (status='2' · type='8', delta=0 = money-neutral record fix, e.g.
                  #105519 approved at a 0.01-wrong figure). */}
              {((isPending && (typeKey === "1" || typeKey === "4" || typeKey === "8")) ||
                (status === "2" && typeKey === "8")) && (
                <EditAmountForm id={row.id} currentAmount={amount} />
              )}
            </div>

            {/* Wave 19 BUG #4: source/target reference block.
                Credit → "เงินนี้ใช้จ่ายค่า" + targets
                Debit  → "นี่คือการจ่ายค่า X · สลิปอยู่ที่ #partnerId" */}
            {isCredit && paymentTargets.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 space-y-1">
                <p className="font-semibold">💰 เงินก้อนนี้ใช้จ่ายค่า:</p>
                <div className="flex flex-wrap gap-1.5">
                  {paymentTargets.map((t, i) => {
                    const c = classifyHno(t.hno);
                    return c.href ? (
                      <Link
                        key={`${t.hno}-${i}`}
                        href={c.href}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-0.5 font-mono text-[11px] text-emerald-700 hover:bg-emerald-100 hover:underline"
                      >
                        {c.label} →
                      </Link>
                    ) : (
                      <span
                        key={`${t.hno}-${i}`}
                        className="inline-flex items-center rounded-md border border-emerald-300 bg-white px-2 py-0.5 font-mono text-[11px] text-emerald-700"
                      >
                        {c.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {isDebit && row.reforder && row.reforder !== "" && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 space-y-1">
                <p>
                  <span className="font-semibold">💸 นี่คือการจ่ายค่า: </span>
                  {(() => {
                    const c = classifyHno(row.reforder);
                    return c.href ? (
                      <Link href={c.href} className="font-mono font-bold text-sky-700 hover:underline">
                        {c.label} →
                      </Link>
                    ) : (
                      <span className="font-mono font-bold">{c.label}</span>
                    );
                  })()}
                </p>
                {partnerTopupId !== null && (
                  <p>
                    <span className="font-semibold">📎 สลิปอยู่ที่รายการชำระเงินคู่กัน: </span>
                    <Link
                      href={`/admin/wallet/${partnerTopupId}`}
                      className="font-mono font-bold text-sky-700 hover:underline"
                    >
                      #{partnerTopupId} →
                    </Link>
                  </p>
                )}
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
          </div>

          {/* RIGHT — slip + actions pane */}
          <div className="p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-muted">สถานะรายการ</h3>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLS[status]}`}>
                {STATUS_LABEL[status] ?? `status ${status}`}
              </span>
            </div>

            {/* Pending → action form · Completed → audit line.
                P1-25/26 (ADR-0018): for a customer-withdraw row (type='3')
                the form dispatches to adminApproveWithdraw/Reject (approve =
                pay out, no balance change · reject = refund). Every other
                pending type keeps the deposit approve/reject path. */}
            {isPending ? (
              <ApproveRejectForm
                id={row.id}
                hasDateSlip={Boolean(row.dateslip)}
                kind={row.type === "3" ? "withdraw" : "deposit"}
                // ชั้น-1 dup gate: only a pending('1')/approved('2') same-day
                // same-amount twin is a double-pay risk (a rejected '3' twin is
                // harmless) — mirror the server's findDuplicateSlips predicate.
                hasDuplicate={similar.some(
                  (s) => s.status === "1" || s.status === "2",
                )}
                // A4 two-round verify — customer payment slips (type 1/4/8) must
                // be round-1 reviewed before approve (round-2). reviewed_at = stamp.
                needsRound1={row.type === "1" || row.type === "4" || row.type === "8"}
                reviewedAt={(row as { reviewed_at?: string | null }).reviewed_at ?? null}
              />
            ) : (
              <div className="rounded-xl border border-border bg-surface-alt/40 px-3 py-2 text-xs text-muted">
                ดำเนินรายการแล้ว โดย: <span className="font-mono text-foreground">{row.adminidupdate ?? "—"}</span>
              </div>
            )}

            {/* Slip image — Wave 19 BUG #4: 5-branch render.
                1. own slipUrl present                      → render image (legacy parity)
                2. own slip filename but resolver failed    → amber warning with filename
                3. partner topup slipUrl present (spend rows) → render partner's image + banner
                4. partner topup filename but resolver failed → amber warning with partner filename
                5. type is no-slip-required (2/4/5/6/7)     → gray "ไม่จำเป็นต้องมีสลิป"
                6. type SHOULD have slip but doesn't        → red "ลูกค้ายังไม่อัพ" */}
            <div className="pt-2">
              <p className="text-xs font-semibold text-muted mb-2">หลักฐานการโอน (Pay slip)</p>
              {slipUrl ? (
                <a
                  href={slipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-border overflow-hidden hover:border-primary-500 bg-black/5 dark:bg-black/30"
                >
                  <SlipImage src={slipUrl} className="max-w-full max-h-[420px] mx-auto object-contain" fallbackClassName="h-40 w-full" />
                </a>
              ) : row.imagesslip ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">⚠ ไม่สามารถสร้างลิงก์สลิปได้</p>
                  <p className="mt-1 font-mono text-[11px] break-all text-amber-800">
                    filename = {row.imagesslip}
                  </p>
                </div>
              ) : partnerSlipUrl ? (
                <div className="space-y-2">
                  <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-800">
                    💡 สลิปนี้มาจากรายการชำระเงินคู่กัน{" "}
                    <Link
                      href={`/admin/wallet/${partnerTopupId}`}
                      className="font-mono font-bold text-sky-700 hover:underline"
                    >
                      #{partnerTopupId}
                    </Link>
                  </div>
                  <a
                    href={partnerSlipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-border overflow-hidden hover:border-primary-500 bg-black/5 dark:bg-black/30"
                  >
                    <SlipImage src={partnerSlipUrl} className="max-w-full max-h-[420px] mx-auto object-contain" fallbackClassName="h-40 w-full" />
                  </a>
                </div>
              ) : partnerSlipFilename ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">⚠ ไม่สามารถสร้างลิงก์สลิปจากรายการคู่กันได้</p>
                  <p className="mt-1 font-mono text-[11px] break-all text-amber-800">
                    partner #{partnerTopupId} · filename = {partnerSlipFilename}
                  </p>
                </div>
              ) : !shouldHaveOwnSlip ? (
                <div className="rounded-lg border border-dashed border-border bg-surface-alt/40 p-4 text-center text-xs text-muted">
                  <p className="font-medium">ไม่จำเป็นต้องมีสลิปสำหรับรายการประเภทนี้</p>
                  <p className="mt-1 italic">
                    ({typeLabel} — ระบบหักเงินจากกระเป๋าโดยตรง ไม่มีการโอนจากธนาคาร)
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-xs text-red-700 italic">
                  ลูกค้ายังไม่ได้อัพโหลดสลิป
                </div>
              )}
            </div>

            {/* Bank/ref mini-table */}
            {(row.nameuserbank || row.nouserbank) && (
              <dl className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs pt-2 border-t border-border/50">
                {row.nameuserbank && <Field label="ชื่อบัญชี" value={row.nameuserbank} />}
                {row.nouserbank && <Field label="เลขที่บัญชี" value={row.nouserbank} mono />}
              </dl>
            )}
          </div>
        </div>
      </section>

      {/* ── 4. SIMILAR-TX WARNING (legacy L487-501) ── */}
      {similar.length > 0 && (
        <section className="rounded-2xl border-2 border-red-400 bg-red-50 p-4 space-y-3 animate-pulse-slow">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="text-base font-bold text-red-900">
              รายการนี้ใกล้เคียงกับรายการอื่น ({similar.length} รายการ)
            </h3>
          </div>
          <p className="text-xs text-red-800">
            พบ tb_wallet_hs อื่นที่วันที่+จำนวนเงินเหมือนรายการนี้ — ตรวจสอบก่อนอนุมัติเพื่อหลีกเลี่ยงเครดิตซ้ำ
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {similar.map((s) => (
              <Link
                key={s.id}
                href={`/admin/wallet/${s.id}`}
                target="_blank"
                className="block rounded-xl border border-red-200 bg-white p-2 hover:border-red-500"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-sm text-red-700">#{s.id}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLS[s.status ?? "1"]}`}>
                    {STATUS_LABEL[s.status ?? "1"] ?? s.status}
                  </span>
                </div>
                {s.slipUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.slipUrl} alt="slip" className="mt-1 max-h-32 w-full object-contain" />
                ) : (
                  <p className="mt-1 text-[11px] text-muted italic">ไม่มีสลิป</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Footer nav ── */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Link
          href="/admin/wallet?view=tx"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> ย้อนกลับ
        </Link>
        <Link
          href={`/admin/wallet?userid=${encodeURIComponent(userid)}`}
          className="inline-flex items-center rounded-lg border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          ดูประวัติ wallet ของลูกค้านี้ →
        </Link>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function BalanceCard({
  title,
  subtitle,
  amount,
  cashback,
}: {
  title: string;
  subtitle: string;
  amount: number;
  cashback: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-red-700">{title}</p>
          <p className="text-[11px] text-muted">{subtitle}</p>
          <p className="mt-1 text-3xl font-bold text-foreground font-mono">
            ฿{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-purple-700">
            Cash Back: {cashback.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
          </p>
        </div>
      </div>
      {/* Progress bar — kept as a visual nod to legacy (decorative) */}
      <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-200" />
      <div className="px-4 py-2 text-center">
        <Link
          href="/admin/wallet/add"
          className="inline-flex items-center gap-1 rounded-full bg-primary-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-600"
        >
          <Plus className="h-3 w-3" /> ชำระเงิน
        </Link>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="text-muted">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted col-span-1">{label}</dt>
      <dd className={`col-span-2 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </>
  );
}

function formatThai(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}
