"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { bustCustomerChrome } from "@/lib/cache/revalidate-chrome";
import { BANK } from "@/components/seo/site";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnsRecord } from "@/lib/auth/owned-write";
import { sendNotification } from "@/lib/notifications";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { validateStoredFile } from "@/lib/file-validation";
import { buildPromptPayPayload, buildPromptPayQrDataUrl, PromptPayConfigError } from "@/lib/promptpay";
import { appendCashbackNoteTag } from "@/lib/cashback/note-tag";

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
//   - -1% discount when userCompany==1 (juristic) AND price >= 1000.
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
      "id, faddressdistrict, fshipby, fshippingservice, ftransporttype, fdiscount, ftotalprice, ftransportprice, fpriceupdate, priceother, ftransportpricechnthb, pricecrate",
    )
    .eq("userid", userID)
    .or("fstatus.eq.5,fcredit.eq.1")
    .in("id", input.ids);
  if (rowsErr) {
    console.error(`[tb_forwarder list] failed`, { code: rowsErr.code, message: rowsErr.message });
  }

  let countID = 0;
  let price = 0;
  let countPricePCSF = 0;
  // calPrice.php L34 — the per-user "no 50฿" allowlist. The legacy
  // reads it from a static JSON; we mirror just the bare username
  // membership check the legacy `in_array($userID, $userNotPCS50)` does.
  const userNotPCS50: Set<string> = new Set([
    "PCS50", "PCS3083", "PCS3983", "PCS999",
    // PR equivalents (rebrand parity — D1 keeps the same identifiers
    // mapped 1:1 from the legacy member-code numbering).
    "PR50", "PR3083", "PR3983", "PR999",
  ]);

  for (const r of (rows ?? []) as Array<{
    faddressdistrict: string | null;
    fshipby: string | null;
    fshippingservice: number | string | null;
    ftransporttype: string | null;
    fdiscount: number | string | null;
    ftotalprice: number | string | null;
    ftransportprice: number | string | null;
    fpriceupdate: number | string | null;
    priceother: number | string | null;
    ftransportpricechnthb: number | string | null;
    pricecrate: number | string | null;
  }>) {
    countID++;
    // calPrice.php L26 — legacy per-row total formula (verbatim).
    const totalPrice =
      Number(r.ftotalprice ?? 0) +
      Number(r.ftransportprice ?? 0) +
      Number(r.fpriceupdate ?? 0) +
      Number(r.fshippingservice ?? 0) +
      Number(r.pricecrate ?? 0) +
      Number(r.ftransportpricechnthb ?? 0) +
      Number(r.priceother ?? 0) -
      Number(r.fdiscount ?? 0);
    price = price + totalPrice;

    // calPrice.php L29-31 — PCSF rows with fTransportPrice=0 trigger
    // the +50฿ flat fee (counted, then applied once below).
    if (
      r.fshipby === "PCSF" &&
      Number(r.ftransportprice ?? 0) === 0
    ) {
      countPricePCSF++;
    }

    // calPrice.php L34-38 — the หนองแขม allowlist exemption: if the
    // address district contains "หนองแขม" AND the user is on the
    // userNotPCS50 list, the +50฿ doesn't apply for that row.
    if (
      r.faddressdistrict &&
      r.faddressdistrict.indexOf("หนองแขม") !== -1 &&
      userNotPCS50.has(userID)
    ) {
      countPricePCSF--;
    }
  }

  // calPrice.php L40-42 — +50฿ flat when at least one PCSF row qualifies.
  if (countPricePCSF >= 1) {
    price = price + 50;
  }
  // calPrice.php L43-45 — juristic users with price>=1000 get a 1%
  // discount (the legacy WHT-aligned reduction).
  if (userCompany === "1" && price >= 1000) {
    price = price - price * 0.01;
  }

  return {
    ok: true,
    count: countID,
    price: numberFormatLegacy(price),
    priceRaw: price,
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
// ⚠️ MONEY ROUTING — the legacy hard-coded `0105564077716` (PCS
// Cargo's juristic tax id). Scanning that QR sends the customer's
// payment to PCS Cargo's bank account — the OLD company. Pacred
// MUST collect to ITS OWN account, so this action reads the Pacred
// PromptPay id from the `PROMPTPAY_ID` env (the SAME id /wallet/
// deposit already collects top-ups to, via `lib/promptpay.ts`).
// This is NOT a brand-cosmetic scrub (AGENTS.md §3 — those wait for
// ก๊อต) — it is where real customer money lands; it cannot route to
// the predecessor company. `PROMPTPAY_ID` is empty in dev `.env.local`
// + must be set on Vercel prod (Pacred's tax id is 0105564077716 per
// the company DNA — the owner sets the registered PromptPay id).
//
// Returns a `data:image/png` URL + the configured id (so the modal
// can show the human-readable number) — or `promptpay_not_configured`
// when the env is unset, which the modal degrades to a friendly notice.
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
  // PROMPTPAY_ID — Pacred's own PromptPay collection id (env-driven,
  // shared with /wallet/deposit). NOT the legacy PCS Cargo id.
  const promptPayId = process.env.PROMPTPAY_ID;
  if (!promptPayId) {
    return { ok: false, error: "promptpay_not_configured" };
  }
  try {
    const payload = buildPromptPayPayload(amountThb);
    const dataUrl = await buildPromptPayQrDataUrl(amountThb);
    return { ok: true, data: { dataUrl, payload, promptPayId } };
  } catch (err) {
    if (err instanceof PromptPayConfigError) return { ok: false, error: err.code };
    return { ok: false, error: "qr_failed" };
  }
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

  // forwarder.php L207-215 — corporate flag (the juristic 1% reduction
  // lever). The handler reads `tb_corporate` existence; if a row exists
  // `$corporate=1`.
  const { data: corpRow, error: corpRowErr } = await admin
    .from("tb_corporate")
    .select("id")
    .eq("userid", userID)
    .maybeSingle<{ id: number }>();
  if (corpRowErr) {
    console.error(`[tb_corporate list] failed`, { code: corpRowErr.code, message: corpRowErr.message });
  }
  const isCorporate = !!corpRow;

  // forwarder.php L252-253 — re-fetch the selected eligible rows
  // server-side (trust nothing from the client). The legacy predicate:
  //   userID=$userID AND (fStatus='5' OR fCredit='1') AND ID IN (ids)
  const { data: rows, error: rowsErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, fshipby, fcredit, fpriceupdate, ftotalprice, ftransportprice, fdiscount, pricecrate, ftransportpricechnthb, priceother, fshippingservice",
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
    fcredit: string | null;
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

  // forwarder.php L193 — count PCSF rows (fShipBy='PCSF' AND
  // fTransportPrice=0) that trigger the +50฿ flat fee.
  const countPricePCSF = eligible.filter(
    (r) => r.fshipby === "PCSF" && Number(r.ftransportprice ?? 0) === 0,
  ).length;

  // forwarder.php L256-257 — per-row total + the bill grand total.
  const num = (v: number | string | null) => Number(v ?? 0);
  const perRowTotal = (r: (typeof eligible)[number]) =>
    num(r.ftotalprice) +
    num(r.ftransportprice) +
    num(r.fpriceupdate) +
    num(r.fshippingservice) +
    num(r.pricecrate) +
    num(r.ftransportpricechnthb) +
    num(r.priceother) -
    num(r.fdiscount);

  let pricePayAll = eligible.reduce((s, r) => s + perRowTotal(r), 0);
  // forwarder.php L263-266 — +50฿ flat when ≥1 PCSF row qualifies.
  if (countPricePCSF >= 1) pricePayAll += 50;
  // forwarder.php L268-270 — juristic 1% reduction when total ≥ 1000.
  const applyNiti = isCorporate && pricePayAll >= 1000;

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

  // forwarder.php L335-342 — one `tb_wallet_hs` row per forwarder id.
  // The legacy writes: date, status='1' (pending admin verify), amount
  // = the per-row total, type='4' (ชำระฝากนำเข้า), userID, refOrder=ID,
  // typeService='2', typeNew='6'. Wallet stays untouched.
  //   NOT-NULL columns the legacy lets MySQL default to '' — Postgres
  //   needs them explicit: whno / wusercredit / adminidcrate / typenew
  //   / typeservice (the 0081 schema marks these NOT NULL).
  const hsRows = eligible.map((r, idx) => {
    let amount = perRowTotal(r);
    // forwarder.php L316-318 — a PCSF row carries the +50฿ inside its
    // own amount (the legacy bumps the FIRST PCSF row). We attribute
    // the +50 to each qualifying PCSF row's amount so the per-row sum
    // still reconciles to pricePayAll. Faithful net: the bill total is
    // identical; the per-row split differs only cosmetically.
    if (countPricePCSF >= 1 && r.fshipby === "PCSF" && Number(r.ftransportprice ?? 0) === 0) {
      amount += 50 / countPricePCSF;
    }
    // forwarder.php L329-331 — juristic 1% reduction applied per row.
    if (applyNiti) amount = amount * 0.99;
    // ADR-0025 D-2a — carry the applied cashback as a note tag on the FIRST
    // row so the approve cascade settles it exactly once.
    const note = idx === 0 ? appendCashbackNoteTag("", cashBackApplied) : "";
    return {
      date: datetimeNow,
      dateslip: slipDate ? slipDate : null,
      status: "1",
      type: "4",
      typenew: "6",
      typeservice: "2",
      amount: Number(amount.toFixed(2)),
      imagesslip: slipPath,
      depositnamebank: `KBANK-${BANK.accountNumber}`,
      note,
      userid: userID,
      reforder: String(r.id),
      whno: "",
      wusercredit: r.fcredit === "1" ? "1" : "",
      adminidcrate: "",
    };
  });

  const { error: insErr } = await admin.from("tb_wallet_hs").insert(hsRows);
  if (insErr) {
    return { ok: false, error: `wallet_hs insert: ${insErr.message}` };
  }

  // Faithful: do NOT flip tb_forwarder.fstatus (legacy keeps fStatus=5
  // until the admin verifies the slip) and do NOT mutate tb_wallet
  // (wallet disabled for this service).
  //
  // Wave 29: auto-receipt is NOT triggered here — the wallet_hs rows
  // we just inserted are status='1' (pending admin verify). The receipt
  // fires when admin flips them to status='2' via either
  // `adminApproveWalletHs` (actions/admin/wallet-trans.ts) or
  // `adminBulkApproveWalletHs` (actions/admin/tb-bulk.ts), both of which
  // call `autoIssueReceiptOnPaymentLand`.

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
