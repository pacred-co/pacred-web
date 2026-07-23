"use server";

import { z } from "zod";
import { createHash } from "node:crypto";
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
import { loadLinkedForwarderPaymentBatch } from "@/lib/forwarder/linked-payment-batch";
import { modeFromPref } from "@/lib/tax/tax-doc-mode";
import { loadCustomerBillingParty } from "@/lib/admin/customer-billing-party";
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
  grossRaw: number;
  whtRaw: number;
  /** Fingerprint of the exact server quote shown to the customer. */
  quoteKey: string;
  billingIdentity: ForwarderBillingIdentity;
  lines: Array<{
    id: string;
    price: number;
    freight: number;
    otherCharges: number;
    discount: number;
    maoFee: number;
    wht: number;
  }>;
} | { ok: false; error: string };

type ForwarderBillingIdentity = {
  name: string;
  taxId: string;
  address: string;
  isJuristic: boolean;
};

async function loadForwarderBillingIdentity(
  admin: ReturnType<typeof createAdminClient>,
  userID: string,
  expectedJuristic: boolean,
): Promise<ForwarderBillingIdentity | null> {
  const party = await loadCustomerBillingParty(admin, userID);
  if (!party) return null;
  const identity = {
    name: party.name.trim(),
    taxId: party.taxId.trim(),
    address: party.address.trim(),
    isJuristic: party.isJuristic,
  };
  if (
    !identity.name
    || !identity.address
    || identity.isJuristic !== expectedJuristic
    || (identity.isJuristic && !identity.taxId)
  ) {
    return null;
  }
  return identity;
}

export async function calculateForwarderTotal(
  input: CalculateForwarderTotalInput,
): Promise<CalculateForwarderTotalResult> {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  // calPrice.php L4 — guard: empty/no IDs returns zero state.
  if (input.ids.length === 0) {
    return { ok: false, error: "no_forwarder_ids" };
  }

  const admin = createAdminClient();

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

  const eligibleIds = (rows ?? []).map((row) => Number((row as { id: number }).id));
  if (eligibleIds.length !== new Set(input.ids).size) {
    return { ok: false, error: "ineligible_row" };
  }

  // One server quote powers the pay bar, modal, QR and submit. This is the
  // exact calculator the admin approval guard replays; the browser no longer
  // carries a second hand-written money engine.
  const quote = await loadLinkedForwarderPaymentBatch(admin, {
    userId: userID,
    forwarderIds: eligibleIds,
  });
  if (!quote.ok) return { ok: false, error: quote.error };
  if (quote.missingIds.length > 0) return { ok: false, error: "missing_forwarder_rows" };
  const billingIdentity = await loadForwarderBillingIdentity(
    admin,
    userID,
    quote.batch.applyCorporateDiscount,
  );
  if (!billingIdentity) return { ok: false, error: "billing_profile_incomplete" };

  const lines = quote.batch.lines.map((line) => ({
    id: line.id,
    price: line.price_thb,
    freight: line.breakdown.freight,
    otherCharges: line.breakdown.otherCharges,
    discount: line.breakdown.discount,
    maoFee: line.breakdown.maoFee,
    wht: line.breakdown.wht1pct,
  }));
  const grossRaw = Math.round(lines.reduce(
    (sum, line) => sum + line.freight + line.otherCharges + line.maoFee - line.discount,
    0,
  ) * 100) / 100;
  const whtRaw = Math.round(lines.reduce((sum, line) => sum + line.wht, 0) * 100) / 100;
  const total = quote.batch.total_thb;

  return {
    ok: true,
    count: lines.length,
    price: numberFormatLegacy(total),
    priceRaw: total,
    grossRaw,
    whtRaw,
    quoteKey: buildForwarderQuoteKey(userID, quote.batch, billingIdentity),
    billingIdentity,
    lines,
  };
}

function buildForwarderQuoteKey(
  userID: string,
  batch: {
    total_thb: number;
    applyCorporateDiscount: boolean;
    lines: Array<{
      id: string;
      price_thb: number;
      breakdown: { wht1pct: number; maoFee: number };
    }>;
  },
  billingIdentity: ForwarderBillingIdentity,
): string {
  const canonical = {
    version: 1,
    userID,
    net_satang: Math.round(batch.total_thb * 100),
    apply_niti: batch.applyCorporateDiscount,
    billing_identity: {
      name: billingIdentity.name,
      tax_id: billingIdentity.taxId,
      address: billingIdentity.address,
      is_juristic: billingIdentity.isJuristic,
    },
    lines: batch.lines
      .map((line) => ({
        id: Number(line.id),
        amount_satang: Math.round(line.price_thb * 100),
        wht_satang: Math.round(line.breakdown.wht1pct * 100),
        mao_satang: Math.round(line.breakdown.maoFee * 100),
      }))
      .sort((a, b) => a.id - b.id),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
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
  // tb_wallet_hs.imagesslip is varchar(150), and the atomic RPC enforces the
  // same bound. Reject before touching the database instead of relying on a
  // truncation/column error after the customer uploaded a slip.
  slipPath: z.string().trim().min(1).max(150),
  slipDate: z.string().trim().max(40).optional(),
  cashBackKey: z.number().nonnegative().optional(),
  quoteKey: z.string().regex(/^[a-f0-9]{64}$/),
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
  const { ids, slipPath, slipDate, cashBackKey, quoteKey } = parsed.data;
  // This flow has no transactional cashback reservation yet. Merely reading
  // cbtotal before the payment RPC lets two concurrent submissions both claim
  // the same balance and leaves the second slip underfunded at approval. The
  // current UI does not offer cashback here; fail closed for direct callers too.
  if (cashBackKey && cashBackKey > 0) {
    return {
      ok: false,
      error: "cashback_hold_unavailable — การใช้ Cash Back กับรายการฝากนำเข้ายังไม่พร้อม กรุณาชำระยอดเต็ม",
    };
  }

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

  // forwarder.php L252-253 — re-fetch the selected eligible rows
  // server-side (trust nothing from the client). The legacy predicate:
  //   userID=$userID AND (fStatus='5' OR fCredit='1') AND ID IN (ids)
  // faddressdistrict is now in the SELECT so the helper can apply the
  // หนองแขม/userNotPCS50 +50 exemption (BUG-2a: the charge dropped it).
  const { data: rows, error: rowsErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, fshipby, paymethod, fcredit, faddressdistrict, fpriceupdate, ftotalprice, ftransportprice, fdiscount, pricecrate, ftransportpricechnthb, priceother, fshippingservice, tax_doc_pref",
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
    tax_doc_pref: string | null;
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
  // Credit jobs do not have a transactional reservation/settlement leg in the
  // grouped-payment RPC. Letting them through would mark work paid without a
  // matching bank or wallet movement, so direct callers must fail closed too.
  if (eligible.some((row) => row.fcredit === "1")) {
    return {
      ok: false,
      error: "credit_payment_group_unavailable — รายการเครดิตยังไม่รองรับการชำระแบบกลุ่ม กรุณาให้ฝ่ายบัญชีตรวจสอบ",
    };
  }

  const documentModes = new Set(eligible.map((row) => modeFromPref(row.tax_doc_pref)));
  if (documentModes.size > 1) {
    return { ok: false, error: "mixed_tax_document_modes — รายการในกลุ่มเลือกประเภทเอกสารไม่เหมือนกัน กรุณาแก้ให้เป็นแบบเดียวก่อนชำระ" };
  }
  const documentMode = documentModes.values().next().value ?? "none";
  // The previous UI added flat 7% while submit stored no VAT and the tax
  // invoice used class-based VAT/WHT. Refuse the unsafe lane until the frozen
  // quote/RPC migration is wired end-to-end; never accept a slip against a
  // number the resulting document cannot reproduce.
  if (documentMode !== "none") {
    return {
      ok: false,
      error: "tax_document_direct_payment_unavailable — รายการที่ขอใบกำกับภาษี/ใบขนยังไม่เปิดรับชำระตรง กรุณาติดต่อฝ่ายบัญชีเพื่อออกยอดเอกสารที่ถูกต้อง",
    };
  }

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
  const applyNiti = batch.applyCorporateDiscount;
  const billingIdentity = await loadForwarderBillingIdentity(admin, userID, applyNiti);
  if (!billingIdentity) {
    return {
      ok: false,
      error: "billing_profile_incomplete — กรุณาบันทึกชื่อและที่อยู่สำหรับออกเอกสารก่อนชำระ",
    };
  }
  if (buildForwarderQuoteKey(userID, batch, billingIdentity) !== quoteKey) {
    return {
      ok: false,
      error: "quote_changed — ยอดรายการมีการเปลี่ยนหลังสร้าง QR ระบบยังไม่บันทึกสลิป กรุณาปิดแล้วเปิดหน้าชำระใหม่",
    };
  }

  // pricePayAll = the HEADLINE the customer transfers (the slip amount).
  const pricePayAll = batch.total_thb;

  // Reserved in the frozen schema for the future transactional-hold flow.
  // Today this remains zero because non-zero requests fail closed above.
  const cashBackApplied = 0;

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

  // Persist the whole group through ONE PostgreSQL transaction. A PostgREST
  // sequence cannot roll back a failed bridge or a zero-row forwarder update;
  // the RPC locks every source and writes header + children + bridges + pending
  // flips together, or writes nothing. Integer satang is the only money unit at
  // this boundary.
  const lineAmountsSatang = batch.lines.map((line) => Math.round(line.price_thb * 100));
  if (lineAmountsSatang.some((amount) => !Number.isSafeInteger(amount) || amount <= 0)) {
    return { ok: false, error: "invalid_payment_quote — พบยอดรายการที่ไม่ถูกต้อง กรุณาติดต่อฝ่ายบัญชี" };
  }
  const netSatang = lineAmountsSatang.reduce((sum, amount) => sum + amount, 0);
  const expectedNetSatang = Math.round(batch.total_thb * 100);
  if (!Number.isSafeInteger(netSatang) || netSatang !== expectedNetSatang) {
    return { ok: false, error: "payment_quote_drift — ยอดรวมรายการไม่ตรงกับยอดชำระ กรุณาติดต่อฝ่ายบัญชี" };
  }
  const whtSatang = batch.lines.reduce(
    (sum, line) => sum + Math.round(line.breakdown.wht1pct * 100),
    0,
  );
  const maoFeeSatang = batch.lines.reduce(
    (sum, line) => sum + Math.round(line.breakdown.maoFee * 100),
    0,
  );
  const grossSatang = netSatang + whtSatang;
  const cashbackSatang = Math.round(cashBackApplied * 100);
  const bankSatang = Math.round(pricePayAll * 100);
  if (bankSatang + cashbackSatang !== netSatang) {
    return { ok: false, error: "payment_split_drift — ยอดโอนและเครดิตไม่ตรงกับยอดชำระ กรุณาลองใหม่" };
  }

  // One immutable uploaded object identifies one retry. Hashing keeps the key
  // below the DB bound without exposing the auth UID/path in a ledger index.
  const idempotencyKey = `forwarder:${createHash("sha256")
    .update(`${authUser.id}\u0000${slipPath}`)
    .digest("hex")}`;
  const depositNameBank = `KBANK-${BANK.accountNumber}`;
  const { data: whIdRaw, error: atomicErr } = await admin.rpc(
    "submit_forwarder_payment_group_atomic",
    {
      p_idempotency_key: idempotencyKey,
      p_userid: userID,
      p_forwarder_ids: batch.lines.map((line) => Number(line.id)),
      p_line_amounts_satang: lineAmountsSatang,
      p_quote_snapshot: {
        gross_satang: grossSatang,
        vat_satang: 0,
        wht_satang: whtSatang,
        net_satang: netSatang,
        cashback_satang: cashbackSatang,
        bank_satang: bankSatang,
        metadata: {
          engine: "forwarder-debit-total-v1",
          document_mode: documentMode,
          mao_fee_satang: maoFeeSatang,
        },
      },
      p_slip_path: slipPath,
      p_slip_date: slipDate ?? null,
      p_deposit_name_bank: depositNameBank,
      p_apply_niti: applyNiti,
      p_billing_identity: {
        name: billingIdentity.name,
        tax_id: billingIdentity.taxId,
        address: billingIdentity.address,
        is_juristic: billingIdentity.isJuristic,
      },
    },
  );
  const whID = Number(whIdRaw);
  if (atomicErr || !Number.isSafeInteger(whID) || whID <= 0) {
    console.error("[submitForwarderPayment atomic RPC] failed", {
      code: atomicErr?.code,
      message: atomicErr?.message,
      userID,
      ids,
    });
    return {
      ok: false,
      error: atomicErr?.code === "PGRST202"
        ? "payment_schema_not_ready — ระบบบันทึกกลุ่มชำระยังไม่พร้อม กรุณาติดต่อผู้ดูแล"
        : "payment_group_failed — ไม่สามารถบันทึกกลุ่มชำระได้ ข้อมูลยังไม่ถูกตัด กรุณาลองใหม่",
    };
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
