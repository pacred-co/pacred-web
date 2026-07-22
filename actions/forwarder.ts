"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { bustCustomerChrome } from "@/lib/cache/revalidate-chrome";
import { BANK } from "@/components/seo/site";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rejectPendingSlipsForCancelledOrder } from "@/lib/admin/reject-cancelled-order-slips";
import { assertOwnsRecord } from "@/lib/auth/owned-write";
import { sendNotification } from "@/lib/notifications";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { validateStoredFile } from "@/lib/file-validation";
import { buildServicePromptPayQrDataUrl } from "@/lib/promptpay";
import { PACRED_BANK_ACCOUNTS } from "@/lib/payment/bank-accounts";
import { appendCashbackNoteTag } from "@/lib/cashback/note-tag";
import {
  computeForwarderCollectTotal,
  type ForwarderCollectRow,
} from "@/lib/forwarder/forwarder-collect-total";
import { loadLinkedForwarderPaymentBatch } from "@/lib/forwarder/linked-payment-batch";
// F3 — server-side capture rail (see actions/admin/wallet-hs.ts docblock). A
// "use server" file may only EXPORT async functions, so the throwing payment
// action delegates to a non-exported *Impl run through withObservability:
// transparent (same return value on success · re-throws the ORIGINAL error),
// files only UNEXPECTED throws (handled `{ ok:false }` returns untouched).
import { withObservability } from "@/lib/observability/with-observability";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// LEGACY (D1 / ADR-0017) — calculateForwarderTotal
// ────────────────────────────────────────────────────────────
//
// Faithful 1:1 transcription of the legacy AJAX endpoint
// `member/include/pages/forwarder/calPrice.php` — called by
// `/service-import` whenever the user toggles a row checkbox or
// "เลือกทั้งหมด" on the bottom pay-bar (forwarder.php L1273-1409).
// Reads the legacy `tb_forwarder` / `tb_users` schema; RLS is
// service_role-locked so reads go through the admin client, but
// `userid === profile.member_code` enforces ownership in code
// (mirrors the legacy `WHERE userID='$userID'` predicate at
// calPrice.php L11 + L21).
//
// Inputs:
//   - ids: the row IDs selected on the pay-bar table (forwarder.php
//          L1357 — `rows_selected.join(',')`)
//
// Outputs (mirrors calPrice.php L48-52 — `number_format($price,2)`):
//   - count: selected eligible row count (calPrice.php L25 `$countID`)
//   - price: ฿ total formatted to 2 decimals (calPrice.php L50)
//
// Legacy total per row (calPrice.php L26):
//   fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService
//   + priceCrate + fTransportPriceCHNTHB + priceOther - fDiscount
//
// Legacy adjustments (calPrice.php L29-45):
//   - +50 ฿ flat fee when at least one row uses fShipBy='PCSF' with
//     fTransportPrice=0 (the PCS เหมาๆ promo) AND that user isn't on
//     the `user-not-50.json` allowlist.
//   - -1% discount when userCompany==1 (juristic) · owner 2026-07-22: no ฿1,000 minimum.
export type CalculateForwarderTotalInput = {
  ids: number[];
};

export type CalculateForwarderTotalResult = {
  ok: true;
  count: number;
  price: string;
  priceRaw: number;
} | { ok: false; error: string };

export async function calculateForwarderTotal(
  input: CalculateForwarderTotalInput,
): Promise<CalculateForwarderTotalResult> {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  // calPrice.php L4 — guard: empty/no IDs returns zero state.
  if (input.ids.length === 0) {
    return { ok: true, count: 0, price: numberFormatLegacy(0), priceRaw: 0 };
  }

  const admin = createAdminClient();

  // calPrice.php L11-18 — SELECT userCompany, userName, userLastName
  //                        FROM tb_users WHERE userID='$userID'
  // We only need userCompany here (the juristic 1% discount lever);
  // userName/userLastName are read but unused by the calc.
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userCompany")
    .eq("userID", userID)
    .maybeSingle<{ userCompany: string | number | null }>();
  if (userRowErr) {
    console.error(`[tb_users list] failed`, { code: userRowErr.code, message: userRowErr.message });
  }
  const userCompany = String(userRow?.userCompany ?? "");

  // calPrice.php L21 — SELECT fAddressDistrict, fShipBy, fShippingService,
  //   fTransportType, fDiscount, ID, fTrackingCHN, fRefRate, fTotalPrice,
  //   fTransportPrice, fPriceUpdate, fRefPrice, priceOther,
  //   fTransportPriceCHNTHB, priceCrate
  //   FROM tb_forwarder WHERE userID='$userID' AND (fStatus='5' OR fCredit=1)
  //   AND ID IN ('$ids')
  // The legacy uses an OR over fStatus / fCredit. PostgREST: use .or().
  const { data: rows, error: rowsErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, faddressdistrict, fshipby, paymethod, fshippingservice, ftransporttype, fdiscount, ftotalprice, ftransportprice, fpriceupdate, priceother, ftransportpricechnthb, pricecrate",
    )
    .eq("userid", userID)
    .or("fstatus.eq.5,fcredit.eq.1")
    .in("id", input.ids);
  if (rowsErr) {
    console.error(`[tb_forwarder list] failed`, { code: rowsErr.code, message: rowsErr.message });
  }

  // calPrice.php L25-45 — the per-row composite total + the +50 PCSF flat
  // fee (with the หนองแขม/userNotPCS50 exemption) + the juristic 1% reduction.
  // Routed through the SHARED pure helper so the DISPLAY here can never drift
  // from the CHARGE in submitForwarderPayment (the BUG-2 root cause).
  const collectRows = (rows ?? []) as ForwarderCollectRow[];
  const { total } = computeForwarderCollectTotal(collectRows, { userId: userID, userCompany });

  return {
    ok: true,
    count: collectRows.length,
    price: numberFormatLegacy(total),
    priceRaw: total,
  };
}

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormatLegacy(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ────────────────────────────────────────────────────────────
// LIST / READ — REMOVED 2026-06-02 (Wave A trust sweep · big-audit §0e)
//  `listForwarders` + its `ForwarderSummary` type + the unused
//  `SUMMARY_FORWARDER_COLS` const + the `<ForwarderList>` component
//  (service-import/forwarder-list.tsx) all read the rebuilt, 0-row
//  `forwarders` table and backed ONLY the dead `/service-import/pending`
//  view (now a redirect → `/service-import?q=5`). The live forwarder list is
//  the faithful tb_forwarder transcription at `/service-import` (page.tsx).
//  Removed to kill the silent dead-read + the re-wire landmine.
// ────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────
// LEGACY (D1 / ADR-0017) — getForwarderPaymentQr
// ────────────────────────────────────────────────────────────
//
// The `#qrcode` PromptPay QR in the `#list-payment2` modal
// (`getListPayForwarder.php` L276 + the `makeCode()` JS L388-401).
//
// ⚠️ MONEY ROUTING — this returns the SERVICE-lane PromptPay QR (the
// ไม่รับเอกสาร / no-tax-invoice destination). The owner's rule (2026-07-02):
// when the customer does NOT take a tax invoice, GENERATE a PromptPay amount-QR
// for the EXACT total, paid into the SERVICE นิติ account
// (204-1-55856-6 · PromptPay 0105564077716) — never a static K-Shop image, and
// never the LOGISTICS (225-2-91144-0) account. The generated QR pre-fills the
// exact amount; the customer still transfers + attaches a slip (staff verify).
//
// The pay surfaces decide the DESTINATION (SERVICE vs TRADING+7% vs LOGISTICS)
// via resolvePaymentAccount() and only pass this QR into <PayDestination> when
// the resolved lane IS SERVICE (channel="promptpay"); the TRADING/LOGISTICS
// lanes render their own static K-Shop PNG. So this action always builds the
// SERVICE amount-QR + returns the SERVICE PromptPay id (read from the 3-account
// SOT — it can't drift to another number). `payload` kept "" for call-site
// back-compat.
export async function getForwarderPaymentQr(
  amountThb: number,
): Promise<ActionResult<{ dataUrl: string; payload: string; promptPayId: string }>> {
  // Cheap auth gate — the QR is customer-facing; no need to leak it
  // to anonymous callers.
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  if (!Number.isFinite(amountThb) || amountThb <= 0) {
    return { ok: false, error: "promptpay_invalid_amount" };
  }
  // Always a GENERATED PromptPay amount-QR for the SERVICE นิติ account
  // (0105564077716) — the exact total is encoded. No env gate, no static image.
  const dataUrl = await buildServicePromptPayQrDataUrl(amountThb);
  const promptPayId =
    PACRED_BANK_ACCOUNTS.service.promptPayId ?? PACRED_BANK_ACCOUNTS.service.accountNo;
  return { ok: true, data: { dataUrl, payload: "", promptPayId } };
}

// ────────────────────────────────────────────────────────────
// LEGACY (D1 / ADR-0017) — uploadForwarderSlip
// ────────────────────────────────────────────────────────────
//
// Faithful transcription of the slip-upload half of the legacy
// `paymentForwarderNew` handler (`member/forwarder.php` L274-289):
// the customer attaches a transfer slip, the legacy `exif_imagetype`
// gate accepts only PNG/JPEG, then `move_uploaded_file` stores it
// under `storage/slip/`.
//
// Pacred equivalent — the slip lands in the private `slips` bucket
// foldered by `auth.uid()` (the bucket RLS enforces the `{uid}/…`
// prefix; same bucket + folder convention as the /wallet/deposit
// slip upload — `lib/storage-upload.ts`). The image bytes are
// validated server-side with `validateStoredFile` AGAIN inside
// `submitForwarderPayment` (defence-in-depth — mirrors `createDeposit`
// re-validating the deposit slip).
//
// Returns the stored object path; the modal stashes it in state and
// passes it to `submitForwarderPayment`.
export async function uploadForwarderSlip(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const file = formData.get("slip");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "slip_missing — กรุณาแนบไฟล์สลิป" };
  }
  // forwarder.php L275-279 — the legacy accepts only PNG/JPEG image
  // slips. We accept image/* + PDF (the /wallet/deposit slip flow does
  // the same — a PDF slip is common from mobile banking apps).
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) {
    return { ok: false, error: "slip_type — ต้องเป็นรูปภาพหรือ PDF" };
  }
  // forwarder.php L307 — `data-max-file-size="9M"`. We cap at 5 MB to
  // match the `slips` bucket + `validateStoredFile` default ceiling.
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "slip_too_large — ไฟล์ใหญ่เกิน 5 MB" };
  }

  // forwarder.php L282-286 — the legacy names the file
  // `<userID>_<uniqid><time>.<ext>` under `storage/slip/`. Pacred
  // foldering: `{auth.uid()}/forwarder_payment/<time>.<ext>` so the
  // `slips` bucket RLS (`{uid}/…` prefix) authorises the write.
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const path = `${user.id}/forwarder_payment/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("slips")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) return { ok: false, error: `slip_upload: ${upErr.message}` };

  return { ok: true, data: { path } };
}

// ────────────────────────────────────────────────────────────
// LEGACY (D1 / ADR-0017) — submitForwarderPayment
// ────────────────────────────────────────────────────────────
//
// Faithful 1:1 transcription of the `paymentForwarderNew` POST
// handler (`member/forwarder.php` L161-427) — the multi-bill
// forwarder payment the `#list-payment2` modal submits.
//
// IMPORTANT — wallet is DISABLED for this service (getListPayForwarder
// .php L67-68 red banner + forwarder.php L244 `$walletTotal = 0;`).
// The customer pays the full amount by PromptPay-QR + slip; the
// handler ONLY records pending-verification rows in `tb_wallet_hs`.
// It does NOT touch `tb_wallet` and does NOT flip `tb_forwarder
// .fstatus` — the legacy keeps fStatus=5 and an admin confirms the
// slip later (the legacy's own status→6 flip lives behind the admin
// verification screen, not this customer path; faithful = record-only
// here). Wallet movement / status flip stays an admin-side action.
//
// Inputs:
//   - ids:         the forwarder row IDs ticked on the pay-bar
//   - slipPath:    the `slips`-bucket path returned by uploadForwarderSlip
//   - slipDate:    optional transfer date/time from the slip
//   - cashBackKey: optional cash-back amount (legacy `#cashBackKey`,
//                  L203). The legacy disables cash-back here
//                  (`$cbTotal=0` at L22) so it is accepted but not
//                  applied — kept for faithful input parity.
//
// Idempotency (forwarder.php L189-191): if `tb_wallet_hs` already has
// a pending/processing row (typeNew 5/6, status 1/2, typeService='2')
// referencing every selected id, the payment was already submitted —
// return ok with an already-submitted note instead of double-inserting.
const submitForwarderPaymentSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(50),
  slipPath: z.string().trim().min(1).max(300),
  slipDate: z.string().trim().max(40).optional(),
  cashBackKey: z.number().nonnegative().optional(),
});
export type SubmitForwarderPaymentInput = z.infer<
  typeof submitForwarderPaymentSchema
>;

export async function submitForwarderPayment(
  input: SubmitForwarderPaymentInput,
): Promise<ActionResult<{ submitted: number[]; alreadySubmitted: boolean }>> {
  // F3 — capture UNEXPECTED throws (null-deref / DB driver) as a
  // platform_incident, then re-throw unchanged. Handled `{ ok:false }` returns
  // propagate normally (never captured).
  return withObservability("submitForwarderPayment", submitForwarderPaymentImpl)(input);
}

async function submitForwarderPaymentImpl(
  input: SubmitForwarderPaymentInput,
): Promise<ActionResult<{ submitted: number[]; alreadySubmitted: boolean }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations
  // (same guard the legacy lacks but Pacred requires — payForwarder
  // FromWallet above uses the identical pattern).
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = submitForwarderPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ids, slipPath, slipDate, cashBackKey } = parsed.data;

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  // Slip ownership + magic-byte validation — the path must sit under
  // this customer's storage folder AND be a real image/PDF (mirrors
  // createDeposit's `validateStoredFile` re-check; never trust the
  // client-passed path).
  const { data: { user: authUser } } = await (await createClient()).auth.getUser();
  if (!authUser) return { ok: false, error: "not_signed_in" };
  if (!slipPath.startsWith(`${authUser.id}/`)) {
    return { ok: false, error: "slip_path_mismatch" };
  }
  const slipCheck = await validateStoredFile("slips", slipPath, ["image", "pdf"]);
  if (!slipCheck.ok) {
    return { ok: false, error: `slip_invalid:${slipCheck.error}` };
  }

  const admin = createAdminClient();

  // forwarder.php L189-191 — idempotency. A pending/processing
  // `tb_wallet_hs` row for ANY selected id means a payment is already
  // in flight; the legacy aborts the whole submit ('ePayRe'). We mirror
  // that: if EVERY selected id is already covered, return ok; otherwise
  // (defensive) refuse so the customer can't half-double-pay.
  const { data: existingHs, error: existingHsErr } = await admin
    .from("tb_wallet_hs")
    .select("reforder")
    .eq("userid", userID)
    .eq("typeservice", "2")
    .in("typenew", ["5", "6"])
    .in("status", ["1", "2"])
    .in("reforder", ids.map(String));
  if (existingHsErr) {
    console.error(`[tb_wallet_hs list] failed`, { code: existingHsErr.code, message: existingHsErr.message });
  }
  const alreadyPaidIds = new Set(
    (existingHs ?? []).map((r) => String((r as { reforder: string | null }).reforder)),
  );
  if (alreadyPaidIds.size > 0) {
    // forwarder.php L408-410 — 'ePayRe': at least one row already paid.
    if (alreadyPaidIds.size >= ids.length) {
      return { ok: true, data: { submitted: ids, alreadySubmitted: true } };
    }
    return {
      ok: false,
      error: "payment_partially_submitted — บางรายการชำระเงินไปแล้ว กรุณารีเฟรชหน้าจอแล้วเลือกเฉพาะรายการที่ยังไม่ชำระ",
    };
  }

  // calPrice.php L11-18 — the juristic 1% reduction lever is
  // `tb_users.userCompany`, NOT `tb_corporate` existence. The display path
  // (calculateForwarderTotal) gates on userCompany; the charge MUST use the
  // SAME source or it drifts (BUG-2b: a tb_corporate row with userCompany≠'1'
  // — or vice-versa — was charged differently than displayed). Read userCompany
  // from tb_users and route the whole calc through the shared helper.
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userCompany")
    .eq("userID", userID)
    .maybeSingle<{ userCompany: string | number | null }>();
  if (userRowErr) {
    console.error(`[tb_users list] failed`, { code: userRowErr.code, message: userRowErr.message });
  }
  const userCompany = String(userRow?.userCompany ?? "");

  // forwarder.php L252-253 — re-fetch the selected eligible rows
  // server-side (trust nothing from the client). The legacy predicate:
  //   userID=$userID AND (fStatus='5' OR fCredit='1') AND ID IN (ids)
  // faddressdistrict is now in the SELECT so the helper can apply the
  // หนองแขม/userNotPCS50 +50 exemption (BUG-2a: the charge dropped it).
  const { data: rows, error: rowsErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, fshipby, paymethod, fcredit, faddressdistrict, fpriceupdate, ftotalprice, ftransportprice, fdiscount, pricecrate, ftransportpricechnthb, priceother, fshippingservice",
    )
    .eq("userid", userID)
    .or("fstatus.eq.5,fcredit.eq.1")
    .in("id", ids);
  if (rowsErr) {
    console.error(`[tb_forwarder list] failed`, { code: rowsErr.code, message: rowsErr.message });
  }

  const eligible = (rows ?? []) as Array<{
    id: number;
    fshipby: string | null;
    paymethod: string | null;
    fcredit: string | null;
    faddressdistrict: string | null;
    fpriceupdate: number | string | null;
    ftotalprice: number | string | null;
    ftransportprice: number | string | null;
    fdiscount: number | string | null;
    pricecrate: number | string | null;
    ftransportpricechnthb: number | string | null;
    priceother: number | string | null;
    fshippingservice: number | string | null;
  }>;
  if (eligible.length === 0) {
    // getListPayForwarder.php L321 — 'ไม่พบรายการที่ต้องชำระเงิน'.
    return { ok: false, error: "no_payable_rows — ไม่พบรายการที่ต้องชำระเงิน กรุณาตรวจสอบ" };
  }
  // Every requested id must be a real eligible row — refuse if the
  // client smuggled an id that isn't owned / isn't fStatus=5/fCredit=1.
  const eligibleIds = new Set(eligible.map((r) => r.id));
  if (ids.some((id) => !eligibleIds.has(id))) {
    return { ok: false, error: "ineligible_row — มีรายการที่ชำระเงินไม่ได้ปะปนมา" };
  }

  // calPrice.php L25-45 — route the WHOLE collect calc through the SAME shared
  // helper the display (calculateForwarderTotal) uses, so charge == shown
  // (BUG-2). The helper owns: the per-row composite, the PCSF +50 (with the
  // หนองแขม/userNotPCS50 exemption), and the juristic 1%-if-≥1000 decision.
  const collect = computeForwarderCollectTotal(eligible as ForwarderCollectRow[], {
    userId: userID,
    userCompany,
  });
  // forwarder.php L268-270 — juristic 1% reduction (owner 2026-07-22: no ฿1,000
  // minimum · decided by the helper off userCompany, NOT tb_corporate — BUG-2b fix).
  // Used below for the fUserCompany stamp on the forwarder flip.
  const applyNiti = collect.appliedWht;

  // ── ONE ENGINE = ONE NUMBER (owner: "ยอดบิล ≠ ยอดลูกค้าชำระ ≠ หน้าตรวจสลิป") ──
  // The per-line allocation comes from the SAME authoritative engine the
  // slip-approve consistency guard replays (loadLinkedForwarderPaymentBatch →
  // computeForwarderDebitBatch — mao anchored once per shipment · satang-
  // allocated per line · Σ lines == total exactly). Writing the children from
  // any OTHER allocator risks a satang drift that hard-blocks the approve.
  const authoritative = await loadLinkedForwarderPaymentBatch(admin, {
    userId: userID,
    forwarderIds: ids,
  });
  if (!authoritative.ok) {
    return { ok: false, error: `คำนวณยอดชำระไม่สำเร็จ (${authoritative.error}) กรุณาลองใหม่` };
  }
  if (authoritative.missingIds.length > 0) {
    return { ok: false, error: `ไม่พบรายการ: ${authoritative.missingIds.join(", ")}` };
  }
  const batch = authoritative.batch;
  // Parity check vs the customer-facing display engine (computeForwarderCollect
  // Total) — these are tested-equal; a drift here means an engine bug, so log
  // LOUD (the verify page will also surface it as slip-vs-due mismatch).
  if (Math.round(batch.total_thb * 100) !== Math.round(collect.total * 100)) {
    console.error(`[submitForwarderPayment] engine drift collect≠debit`, {
      userID, ids, collectTotal: collect.total, debitTotal: batch.total_thb,
    });
  }

  // pricePayAll = the HEADLINE the customer transfers (the slip amount).
  let pricePayAll = batch.total_thb;

  // ── ADR-0025 — apply-cashback at checkout (getListPayForwarder.php
  //    L188-203 `cashBackKey`). Read the customer's live cashback balance
  //    and CLAMP the requested `cashBackKey` to `min(cbtotal, billRemainder)`
  //    server-side (never trust the client). Cashback reduces the slip the
  //    customer must upload (the legacy: `totalPriceAll − walletTotal −
  //    cashBackKey − totalNiTi`); the bill total here already excludes the
  //    wallet pre-apply (m2 #3 — this surface is slip-only), so the cashback
  //    reduces `pricePayAll` directly.
  //
  //    Carry-then-settle (D-2a): we do NOT debit tb_cash_back at submit
  //    (faithful hold-then-settle — the legacy holds; the debit lands on the
  //    admin slip-approve). We stamp the applied amount as a `[CB:<amt>]`
  //    note tag on the FIRST pending row so the approve cascade can settle
  //    it once (idempotent on `cbhrefid=forwarder:walleths:<row-id>`).
  //
  //    ⚠️ COUPLING (ADR-0025 D-2 note): these slip rows are status='1' type='4'
  //    and are approved by `adminApproveWalletHs`/`adminBulkApproveWalletHs`
  //    (actions/admin/wallet-trans.ts + tb-bulk.ts) — NOT the type='1'
  //    `adminApproveWalletDeposit` cascade that the cashback settle is wired
  //    into. Until those approve sites also call `spendCashbackAtCheckout`
  //    (paired with the m2 #3 wallet pre-apply restoration), the carried
  //    cashback on THIS surface is recorded but settled only via the deposit
  //    cascade. The amount IS clamped + reflected in the slip total here, and
  //    the carry tag is idempotency-anchored, so no double-spend can occur.
  let cashBackApplied = 0;
  if (cashBackKey && cashBackKey > 0) {
    const { data: cbRow, error: cbErr } = await admin
      .from("tb_cash_back")
      .select("cbtotal")
      .eq("userid", userID)
      .maybeSingle<{ cbtotal: number | string | null }>();
    if (cbErr) {
      console.error(`[tb_cash_back read] failed`, { code: cbErr.code, message: cbErr.message, userid: userID });
    }
    const cbTotal = Number(cbRow?.cbtotal ?? 0);
    // Clamp to [0, min(balance, billRemainder)] — rounded to 2dp.
    cashBackApplied = Math.round(Math.max(0, Math.min(cashBackKey, cbTotal, pricePayAll)) * 100) / 100;
    pricePayAll = Math.round((pricePayAll - cashBackApplied) * 100) / 100;
  }

  const datetimeNow = new Date().toISOString();

  // ── ONE BILL PER PAYMENT (owner 2026-07-22 · legacy member/forwarder.php
  //    L292-345 re-read) ──
  //
  // The legacy customer path writes the SAME shape as admin pay-users.php:
  //   1. ONE type='1' TOPUP HEADER — amount = the TOTAL the customer
  //      transferred, imagesSlip on THIS row ONLY, paydeposit='1',
  //      typeNew='6', typeService='2'. This is the row the slip-verify
  //      queue shows (1 payment = 1 row = 1 slip = 1 total).
  //   2. N type='4' CHILDREN — refOrder=<fid>, refOrder2=<whID>, NO slip,
  //      per-row allocation amounts (Σ reconciles to the batch total).
  //   3. tb_wallet_paydeposit (whID, fid) bridge rows — the approve
  //      cascade (adminApproveWalletDeposit case-B) walks these.
  //   4. tb_forwarder → fStatus='6' + paydeposit='1' (pending-verify
  //      state — G6: paydeposit='1' keeps it OUT of the dispatch queue).
  //      Approve clears paydeposit + stamps fDateStatus6; reject reverts
  //      to fStatus='5'.
  //
  // The earlier port MISREAD forwarder.php L335-342 as "one row per id"
  // and dropped the header → N pending rows each re-carrying the slip →
  // the verify queue showed per-tracking amounts ≠ the slip total, and
  // the receipt step-flow (which lives on the DEPOSIT detail) never ran.

  // Per-row allocation = the batch engine's own satang-allocated lines
  // (mao ฿100 anchored once per shipment · juristic 1% · COD leg excluded ·
  // Σ lines == batch.total_thb exactly — no second allocator, no drift).
  const priceByFid = new Map(batch.lines.map((l) => [String(l.id), l.price_thb]));

  // 1. TOPUP HEADER — the ONE row the verify queue sees. amount = what the
  //    customer actually transferred (post-cashback). The ADR-0025 [CB:<amt>]
  //    tag rides THIS row's note (the deposit approve/reject cascade parses
  //    the TOPUP row's note — previously the tag sat on a child the cascade
  //    never read).
  const { data: topupRow, error: topErr } = await admin
    .from("tb_wallet_hs")
    .insert({
      date: datetimeNow,
      dateslip: slipDate ? slipDate : null,
      status: "1",
      type: "1",
      typenew: "6",
      typeservice: "2",
      paydeposit: "1",
      amount: Number(pricePayAll.toFixed(2)),
      imagesslip: slipPath,
      depositnamebank: `KBANK-${BANK.accountNumber}`,
      note: appendCashbackNoteTag("", cashBackApplied),
      userid: userID,
      reforder: "",
      whno: "",
      wusercredit: "",
      adminidcrate: "",
    })
    .select("id")
    .single<{ id: number }>();
  if (topErr || !topupRow) {
    return { ok: false, error: `wallet_hs topup insert: ${topErr?.message ?? "no row"}` };
  }
  const whID = topupRow.id;

  // 2. CHILDREN — allocation rows under the header. NO slip (the header
  //    carries it); refOrder2 links each to the header.
  const hsRows = eligible.map((r) => ({
    date: datetimeNow,
    dateslip: slipDate ? slipDate : null,
    status: "1",
    type: "4",
    typenew: "6",
    typeservice: "2",
    paydeposit: "1",
    amount: priceByFid.get(String(r.id)) ?? 0,
    imagesslip: "",
    depositnamebank: "",
    note: "",
    userid: userID,
    reforder: String(r.id),
    reforder2: whID,
    whno: "",
    wusercredit: r.fcredit === "1" ? "1" : "",
    adminidcrate: "",
  }));

  const { error: insErr } = await admin.from("tb_wallet_hs").insert(hsRows);
  if (insErr) {
    // Roll the header back so a retry doesn't strand a slip-bearing topup
    // with no children (best-effort — PostgREST has no transaction).
    await admin.from("tb_wallet_hs").delete().eq("id", whID);
    return { ok: false, error: `wallet_hs insert: ${insErr.message}` };
  }

  // 3. Bridge rows — the approve/reject cascade walks tb_wallet_paydeposit
  //    (whid → hno) to settle/revert every parent under this ONE payment.
  const { error: bridgeErr } = await admin
    .from("tb_wallet_paydeposit")
    .insert(eligible.map((r) => ({ whid: whID, hno: String(r.id) })));
  if (bridgeErr) {
    // Loud — without bridges the cascade can't settle the children. The
    // payment record itself is intact; accounting settles via the fallback
    // (reforder2 linkage) or re-submits.
    console.error(`[submitForwarderPayment bridge insert] FAILED`, {
      code: bridgeErr.code, message: bridgeErr.message, whID, userID,
    });
  }

  // 4. Flip forwarders to the legacy pending-verify state (forwarder.php
  //    L343-347): non-credit → fStatus='6' + paydeposit='1' (+fDateStatus6);
  //    credit → fCredit='' + paydeposit='1' (no fstatus flip). G6: the
  //    dispatch queue excludes paydeposit='1', so nothing ships until the
  //    slip is approved. Reject reverts (cascade case-B).
  const fUserCompanyValue = applyNiti ? "1" : "";
  for (const r of eligible) {
    const isCreditRow = r.fcredit === "1";
    const fwdPatch: Record<string, unknown> = isCreditRow
      ? { fcredit: "", paydeposit: "1", fdateadminstatus: datetimeNow, fusercompany: fUserCompanyValue }
      : { fstatus: "6", paydeposit: "1", fdateadminstatus: datetimeNow, fdatestatus6: datetimeNow, fusercompany: fUserCompanyValue };
    let q = admin.from("tb_forwarder").update(fwdPatch).eq("id", r.id).eq("userid", userID);
    q = isCreditRow ? q.eq("fcredit", "1") : q.eq("fstatus", "5");
    const { error: fUpdErr } = await q;
    if (fUpdErr) {
      console.error(`[submitForwarderPayment forwarder flip] failed`, {
        code: fUpdErr.code, message: fUpdErr.message, fid: r.id, whID,
      });
    }
  }

  // The receipt fires at APPROVE (adminApproveWalletDeposit case-B →
  // autoIssueReceiptOnPaymentLand covering ALL fids under this whID),
  // mirroring legacy wallet.php $actionBillF → grenrateReceiptF.

  revalidatePath("/service-import");
  revalidatePath("/service-import/pending");
  // Pending import payment submitted → refresh the customer chrome so the
  // forwarder/payment-due badges reflect it without waiting for the 60s TTL.
  bustCustomerChrome();

  // Pacred addition — surface the pending payment in the notification
  // feed (the legacy fires a LINE Notify to admin here; Pacred's admin
  // LINE wiring is a separate channel, the customer-facing record is
  // the in-app notification).
  void sendNotification(authUser.id, {
    category: "forwarder",
    severity: "info",
    title: "แจ้งชำระเงินฝากนำเข้าแล้ว",
    body: `ส่งหลักฐานการชำระเงิน ${eligible.length} รายการ รวม ฿${pricePayAll.toLocaleString("th-TH", { minimumFractionDigits: 2 })} — รอเจ้าหน้าที่ตรวจสอบ`,
    link_href: "/service-import",
    reference_type: "forwarder",
    reference_id: String(eligible[0]?.id ?? ""),
  });

  return {
    ok: true,
    data: { submitted: eligible.map((r) => r.id), alreadySubmitted: false },
  };
}

// ────────────────────────────────────────────────────────────
// P1-19 · CUSTOMER SELF-CANCEL of an own forwarder (ฝากนำเข้า)
// ────────────────────────────────────────────────────────────
//
// Faithful 1:1 transcription of the legacy AJAX endpoint
// `member/include/pages/forwarder/deleteForwarder.php`. The customer
// pressed "ลบรายการ" / "ยกเลิกรายการ" on a forwarder row in
// `member/forwarder.php`; the legacy jQuery posts the row ID here and
// the PHP does:
//
//   deleteForwarder.php L5  — gate (the row must exist AND match all of):
//       SELECT ID FROM tb_forwarder
//        WHERE fStatus='1' AND ID='$ID' AND refOrder='' AND userID='$userID'
//   deleteForwarder.php L8  — on pass, HARD DELETE the row:
//       DELETE FROM tb_forwarder WHERE ID='$ID' AND userID='$userID'
//   echo '1' on success · '3' when the gate row doesn't exist · '2' on
//   a db error.
//
// The gate means a customer can only cancel a forwarder that is:
//   - fStatus='1'  → still "รอสินค้าเข้าโกดังจีน" (not yet processed)
//   - refOrder=''  → NOT spawned from a ฝากสั่ง order (shop-spawned rows
//                    are admin-owned; the customer must not delete them)
//   - userID=self  → their own row (ownership)
//
// Port decision: legacy DELETEs the row (it is a hard delete, not a
// status-flip). We reproduce the hard delete faithfully. RLS on
// `tb_forwarder` is service_role-locked, so reads + the delete go
// through the admin client, but ownership is enforced in code exactly
// as the legacy `WHERE userID='$userID'` predicate does, AND the gate
// (fStatus='1' AND refOrder='') is re-asserted INSIDE the DELETE
// predicate (defence against a concurrent admin write that processed
// the row between our gate-read and the delete).

const cancelForwarderSchema = z.object({
  // forwarder.php passes the integer row ID (tb_forwarder.id). Accept a
  // number or a numeric string (the client sends `data-forwarder-id`).
  fNo: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
});
export type CancelForwarderInput = z.infer<typeof cancelForwarderSchema>;

export async function cancelOwnForwarder(
  input: CancelForwarderInput,
): Promise<ActionResult<{ id: number }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = cancelForwarderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const id = Number(parsed.data.fNo);

  // Ownership — the customer's PR<n> member_code is the legacy userID.
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();

  // deleteForwarder.php L5 — the gate: the row must exist and satisfy
  // fStatus='1' AND refOrder='' AND userID='$userID' AND ID='$ID'.
  const { data: gateRow, error: gateErr } = await admin
    .from("tb_forwarder")
    .select("id, fstatus, reforder, userid")
    .eq("id", id)
    .eq("userid", userID)
    .maybeSingle<{ id: number; fstatus: string | null; reforder: string | null; userid: string | null }>();
  if (gateErr) {
    console.error(`[tb_forwarder cancel gate] failed`, { id, code: gateErr.code, message: gateErr.message });
    return { ok: false, error: `db_error:${gateErr.code ?? "unknown"}` };
  }
  // deleteForwarder.php L17-19 — gate row not found → echo '3'.
  if (!gateRow) return { ok: false, error: "not_found" };
  if (gateRow.fstatus !== "1") return { ok: false, error: "not_cancellable" };
  if (gateRow.reforder && gateRow.reforder !== "") {
    // refOrder set → shop-spawned; the customer must not delete it.
    return { ok: false, error: "not_cancellable" };
  }

  // deleteForwarder.php L8 — HARD DELETE WHERE ID='$ID' AND userID='$userID'.
  // The legacy delete keys only on ID + userID (the gate is the SELECT
  // above). We re-assert fStatus='1' inside the predicate as a lightweight
  // concurrency guard (fStatus is never NULL for these rows) so a row that
  // an admin processed between our gate-read and here can't be deleted out
  // from under the workflow. We intentionally do NOT add a `reforder`
  // predicate here: legacy stored refOrder as '' but migrated rows can be
  // NULL, and `.eq("reforder","")` would not match NULL — the SELECT gate
  // already proved refOrder is empty-or-null + ownership.
  const { error: delErr, count } = await admin
    .from("tb_forwarder")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("userid", userID)
    .eq("fstatus", "1");
  if (delErr) {
    // deleteForwarder.php L14-15 — db error → echo '2'.
    console.error(`[tb_forwarder cancel delete] failed`, { id, code: delErr.code, message: delErr.message });
    return { ok: false, error: `delete_failed:${delErr.code ?? "unknown"}` };
  }
  if (!count) {
    // The row no longer matched the gate at delete time (concurrent
    // processing). Treat as not-cancellable rather than a hard error.
    return { ok: false, error: "not_cancellable" };
  }

  // ภูม 2026-06-25 — ลบออเดอร์แล้วต้องเคลียร์สลิป pending ที่ค้างในคิว "ชำระเงิน"
  // (best-effort · money-safe). ที่ fstatus='1' มักยังไม่มีสลิป แต่ลูกค้าที่จ่ายเร็ว
  // แล้วยกเลิกก็ถูกครอบคลุม.
  await rejectPendingSlipsForCancelledOrder(admin, id, userID);

  // Refresh the list pages + purge the chrome cache. The sidebar badge counts
  // (loadPcsChromeData) are served from the 60s-TTL pcs-chrome cache; a hard-
  // deleted forwarder changes the "รอสินค้าเข้าโกดังจีน" count, so bust it now
  // (the helper passes the Next-16-required cache-profile arg) instead of
  // leaving the badge ≤60s stale.
  revalidatePath("/service-import");
  revalidatePath("/service-import/pending");
  bustCustomerChrome();

  return { ok: true, data: { id } };
}

// ────────────────────────────────────────────────────────────
// 0092 · CUSTOMER RECONFIRM-DECISION on a cost adjustment
// ────────────────────────────────────────────────────────────
//
// When admin adds a forwarder_cost_adjustments row whose cumulative
// actual cost exceeds the original preview total by > threshold_pct
// (default 10 — BUSINESS_FLOW.md L85-87, pcs-business-flow audit §3
// Priority 2), the row enters status='pending_reconfirm' instead of
// 'unpaid'. The customer then sees a banner on /service-import/[fNo]
// and presses ACCEPT (→ status='unpaid' so admin can bill) or DISPUTE
// (→ row stays pending_reconfirm + a high-priority work_item is opened
// for ops to handle the dispute path).
//
// Both branches:
//   - require auth + verify ownership of the adjustment via RLS
//   - stamp customer_decision + customer_decision_at (constraints in
//     migration 0092 require these symmetrically)
//   - notify the customer (confirmation record in their feed)
//   - idempotent — re-pressing returns the existing decision
//
// Per W-1/S-2: ownership is asserted both via RLS-scoped fetch AND via
// assertOwnsRecord on the admin-client write, defence in depth.

const decideAdjustmentSchema = z.object({
  adjustment_id: z.string().uuid(),
  decision:      z.enum(["accept", "dispute"]),
  note:          z.string().trim().max(500).optional(),
});
export type DecideCostAdjustmentInput = z.infer<typeof decideAdjustmentSchema>;

export async function customerDecideCostAdjustment(
  input: DecideCostAdjustmentInput,
): Promise<ActionResult<{ decision: "accept" | "dispute"; already_decided: boolean }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = decideAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  // 1. RLS-scoped fetch — verifies ownership + reads current state.
  //    Pull the forwarder f_no along the join for the redirect / notification.
  type AdjRow = {
    id: string;
    forwarder_id: string;
    profile_id: string;
    status: string;
    amount_thb: number;
    customer_decision: "accept" | "dispute" | null;
    customer_decision_at: string | null;
    preview_total_thb: number | null;
    cumulative_after_thb: number | null;
    forwarder: { f_no: string | null } | { f_no: string | null }[] | null;
  };
  const { data: adjRaw, error: adjRawErr } = await supabase
    .from("forwarder_cost_adjustments")
    .select(`
      id, forwarder_id, profile_id, status, amount_thb,
      customer_decision, customer_decision_at,
      preview_total_thb, cumulative_after_thb,
      forwarder:forwarders!forwarder_id ( f_no )
    `)
    .eq("id", d.adjustment_id)
    .maybeSingle<AdjRow>();
  if (adjRawErr) {
    console.error(`[forwarder_cost_adjustments mutation lookup] failed`, { code: adjRawErr.code, message: adjRawErr.message });
    return { ok: false, error: `db_error:${adjRawErr.code ?? "unknown"}` };
  }
  if (!adjRaw) return { ok: false, error: "not_found" };

  // assertOwnsRecord is the W-1/S-2 defence — RLS already scoped above,
  // this guards against a future edit dropping the RLS fetch.
  assertOwnsRecord(user.id, adjRaw);

  const fNo = Array.isArray(adjRaw.forwarder)
    ? (adjRaw.forwarder[0]?.f_no ?? null)
    : (adjRaw.forwarder?.f_no ?? null);

  // 2. Idempotent — if the customer already decided, return success with
  //    the recorded decision (do not re-stamp).
  if (adjRaw.customer_decision) {
    return {
      ok: true,
      data: {
        decision:        adjRaw.customer_decision,
        already_decided: true,
      },
    };
  }

  // 3. Guard: only pending_reconfirm rows are decidable.
  if (adjRaw.status !== "pending_reconfirm") {
    return { ok: false, error: "not_pending_reconfirm" };
  }

  // 4. Write the decision via admin client (RLS bypass needed because the
  //    customer UPDATE policy installed in 0092 is defence-in-depth only;
  //    the W-1/S-2 ownership assertion above + the .eq("profile_id",
  //    user.id) predicate below are the real gates).
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const nextStatus = d.decision === "accept" ? "unpaid" : "pending_reconfirm";

  const { error: updErr } = await admin
    .from("forwarder_cost_adjustments")
    .update({
      status:               nextStatus,
      customer_decision:    d.decision,
      customer_decision_at: nowIso,
    })
    .eq("id", adjRaw.id)
    .eq("profile_id", user.id)
    .eq("status", "pending_reconfirm")
    .is("customer_decision", null);
  if (updErr) return { ok: false, error: `decide update: ${updErr.message}` };

  // 5. Side effects per branch.
  if (d.decision === "accept") {
    // Customer-self confirmation — admin can now mark paid via the
    // existing adminMarkCostAdjustmentPaid flow.
    void sendNotification(user.id, {
      category: "payment",
      severity: "success",
      title:    `ยืนยันราคาแล้ว — ${fNo ?? ""}`,
      body:     `คุณยืนยันราคาจริงเรียบร้อย — รอเจ้าหน้าที่ตัดยอด wallet เพื่อชำระ`,
      link_href: fNo ? `/service-import/${fNo}` : undefined,
      reference_type: "forwarder",
      reference_id:   adjRaw.forwarder_id,
    });
  } else {
    // Dispute — open a work_item for ops + notify the customer that
    // their dispute is being reviewed.
    try {
      if (fNo) {
        await admin.rpc("ensure_work_item", {
          p_entity_type:   "forwarder",
          p_entity_ref:    fNo,
          p_type:          "cs_followup",
          p_title:         `ลูกค้าขอตรวจสอบราคาจริง — ${fNo}`,
          p_assigned_role: "ops",
          p_priority:      "urgent",
          p_due_at:        null,
        });
      }
    } catch {
      // best-effort; the decision stamp + notification are load-bearing
    }
    void sendNotification(user.id, {
      category: "payment",
      severity: "info",
      title:    `รับเรื่องตรวจสอบราคา — ${fNo ?? ""}`,
      body:     `เจ้าหน้าที่จะติดต่อกลับเพื่อตรวจสอบและสรุปยอดร่วมกัน${d.note ? ` — โน้ต: ${d.note.slice(0, 120)}` : ""}`,
      link_href: fNo ? `/service-import/${fNo}` : undefined,
      reference_type: "forwarder",
      reference_id:   adjRaw.forwarder_id,
    });
  }

  if (fNo) {
    revalidatePath(`/service-import/${fNo}`);
    // …/receipt is now a redirect → …/invoice (the live tb_forwarder⋈tb_receipt view).
    revalidatePath(`/service-import/${fNo}/invoice`);
    revalidatePath(`/admin/forwarders/${fNo}`);
  }

  return {
    ok: true,
    data: { decision: d.decision, already_decided: false },
  };
}
