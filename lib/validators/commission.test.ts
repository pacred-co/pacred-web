/**
 * V-E8/H1/H2 — commission validator + WHT money-math unit tests.
 *
 * Covers the contract + load-bearing math for the commission-withdrawal
 * flow. A regression here mis-pays staff or mis-withholds Thai WHT:
 *
 *   1. ROLE_KINDS / SOURCE_KINDS / WITHDRAWAL_STATUSES — enum sets + labels
 *   2. roundThb                  — 2dp cents rounding
 *   3. computeWithdrawalNumbers  — Thai Revenue Code §50(1) WHT:
 *      withhold only when gross > 5,000 AND rate > 0
 *   4. computeAccrualAmount      — flat-overrides-rate precedence
 *   5. accrueCommissionSchema    — Zod contract (uuids, positive base)
 *   6. requestWithdrawalSchema   — accrual_ids 1..500, payee bank required
 *   7. upsertCommissionTierSchema — the rate/flat XOR .refine
 *   8. rejectWithdrawalSchema    — reject reason ≥3 chars
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  ROLE_KINDS,
  ROLE_KIND_LABEL,
  SOURCE_KINDS,
  SOURCE_KIND_LABEL,
  WITHDRAWAL_STATUSES,
  WITHDRAWAL_STATUS_LABEL,
  DEFAULT_WHT_RATE_PCT,
  WHT_THRESHOLD_THB,
  MIN_WITHDRAWAL_THB,
  roundThb,
  computeWithdrawalNumbers,
  computeAccrualAmount,
  accrueCommissionSchema,
  requestWithdrawalSchema,
  approveWithdrawalSchema,
  rejectWithdrawalSchema,
  markWithdrawalPaidSchema,
  upsertCommissionTierSchema,
  affiliateWithdrawRequestSchema,
  affiliateCommissionFiltersSchema,
  MIN_AFFILIATE_WITHDRAW_THB,
  MAX_AFFILIATE_WITHDRAW_THB,
} from "./commission";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}
function assertThrows(label: string, fn: () => unknown): void {
  try {
    fn();
    fail++; console.error("  ✗", label, "(expected to throw, didn't)");
  } catch {
    pass++; console.log("  ✓", label);
  }
}

console.log("commission validators (V-E8/H1/H2)");

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";

// ────────────────────────────────────────────────────────────
// (a) enum sets + label maps + law constants
// ────────────────────────────────────────────────────────────
console.log("  (a) enum sets + constants");
{
  assert("2 role kinds",          ROLE_KINDS.length === 2);
  assert("3 source kinds",        SOURCE_KINDS.length === 3);
  assert("4 withdrawal statuses", WITHDRAWAL_STATUSES.length === 4);
  assert("every role has label",  ROLE_KINDS.every((r) => ROLE_KIND_LABEL[r]?.length > 0));
  assert("every source has label",SOURCE_KINDS.every((s) => SOURCE_KIND_LABEL[s]?.length > 0));
  assert("every status has label",WITHDRAWAL_STATUSES.every((s) => WITHDRAWAL_STATUS_LABEL[s]?.length > 0));
  // Thai Revenue Code §50(1) constants must not silently drift.
  assert("default WHT rate is 15%", DEFAULT_WHT_RATE_PCT === 15);
  assert("WHT threshold is 5,000",  WHT_THRESHOLD_THB === 5000);
  assert("min withdrawal is 100",   MIN_WITHDRAWAL_THB === 100);
}

// ────────────────────────────────────────────────────────────
// (b) roundThb — 2dp cents
// ────────────────────────────────────────────────────────────
console.log("  (b) roundThb — 2dp rounding");
{
  assert("1234.567 → 1234.57", roundThb(1234.567) === 1234.57);
  assert("0.005 → 0.01",       roundThb(0.005) === 0.01);
  assert("integer untouched",  roundThb(500) === 500);
}

// ────────────────────────────────────────────────────────────
// (c) computeWithdrawalNumbers — §50(1) WHT logic
// ────────────────────────────────────────────────────────────
console.log("  (c) computeWithdrawalNumbers — WHT threshold + rate");
{
  // Above 5,000 with a positive rate → WHT applies.
  const big = computeWithdrawalNumbers({ gross_thb: 10000, wht_rate_pct: 15 });
  assert("10000 @15% → WHT 1500",  big.wht_amount_thb === 1500);
  assert("10000 @15% → net 8500",  big.net_thb === 8500);

  // Exactly at the 5,000 threshold → NOT withheld (strict > comparison).
  const atThreshold = computeWithdrawalNumbers({ gross_thb: 5000, wht_rate_pct: 15 });
  assert("gross == 5000 → no WHT", atThreshold.wht_amount_thb === 0);
  assert("gross == 5000 → net == gross", atThreshold.net_thb === 5000);

  // Just over the threshold → withheld.
  const justOver = computeWithdrawalNumbers({ gross_thb: 5000.01, wht_rate_pct: 15 });
  assert("gross 5000.01 → WHT applies", justOver.wht_amount_thb > 0);

  // Below threshold → never withheld even with a rate.
  const small = computeWithdrawalNumbers({ gross_thb: 4999, wht_rate_pct: 15 });
  assert("gross 4999 → no WHT", small.wht_amount_thb === 0);
  assert("gross 4999 → net == gross", small.net_thb === 4999);

  // Rate 0 (taxable-elsewhere override) → no WHT even above threshold.
  const rateZero = computeWithdrawalNumbers({ gross_thb: 100000, wht_rate_pct: 0 });
  assert("rate 0 → no WHT even on 100k", rateZero.wht_amount_thb === 0);
  assert("rate 0 → net == gross", rateZero.net_thb === 100000);

  // WHT rounds to 2dp.
  const rounded = computeWithdrawalNumbers({ gross_thb: 12345.67, wht_rate_pct: 3 });
  assert("WHT rounds to 2dp", rounded.wht_amount_thb === roundThb(12345.67 * 0.03));
  assert("net = gross - wht", rounded.net_thb === roundThb(12345.67 - rounded.wht_amount_thb));
}

// ────────────────────────────────────────────────────────────
// (d) computeAccrualAmount — flat overrides rate
// ────────────────────────────────────────────────────────────
console.log("  (d) computeAccrualAmount — flat-overrides-rate");
{
  // rate-only tier.
  assert("rate 5% of 20000 → 1000",
    computeAccrualAmount({ base_thb: 20000, rate_pct: 5, flat_thb: null }) === 1000);
  // flat-only tier.
  assert("flat 250 → 250",
    computeAccrualAmount({ base_thb: 99999, rate_pct: null, flat_thb: 250 }) === 250);
  // flat WINS when both are set (flat checked first).
  assert("flat wins over rate",
    computeAccrualAmount({ base_thb: 20000, rate_pct: 5, flat_thb: 250 }) === 250);
  // flat = 0 is a real value (not treated as "absent").
  assert("flat 0 → 0 (not falling through to rate)",
    computeAccrualAmount({ base_thb: 20000, rate_pct: 5, flat_thb: 0 }) === 0);
  // neither → 0.
  assert("no rate + no flat → 0",
    computeAccrualAmount({ base_thb: 20000, rate_pct: null, flat_thb: null }) === 0);
  // rate result rounds to 2dp.
  assert("rate result rounds 2dp",
    computeAccrualAmount({ base_thb: 333.33, rate_pct: 3, flat_thb: null }) === roundThb(333.33 * 0.03));
}

// ────────────────────────────────────────────────────────────
// (e) accrueCommissionSchema — Zod contract
// ────────────────────────────────────────────────────────────
console.log("  (e) accrueCommissionSchema — accepts / rejects");
{
  const ok = accrueCommissionSchema.parse({
    source_kind:     "service_order",
    source_ref:      "H26050001",
    earner_admin_id: UUID_A,
    role_kind:       "interpreter",
    tier_id:         UUID_B,
    base_thb:        20000,
  });
  assert("valid accrual parses", ok.base_thb === 20000);

  assertThrows("rejects zero base_thb", () => accrueCommissionSchema.parse({
    source_kind: "forwarder", source_ref: "F1", earner_admin_id: UUID_A,
    role_kind: "sales_rep", tier_id: UUID_B, base_thb: 0,
  }));
  assertThrows("rejects negative base_thb", () => accrueCommissionSchema.parse({
    source_kind: "forwarder", source_ref: "F1", earner_admin_id: UUID_A,
    role_kind: "sales_rep", tier_id: UUID_B, base_thb: -1,
  }));
  assertThrows("rejects bad source_kind", () => accrueCommissionSchema.parse({
    source_kind: "lottery", source_ref: "F1", earner_admin_id: UUID_A,
    role_kind: "sales_rep", tier_id: UUID_B, base_thb: 100,
  }));
  assertThrows("rejects non-uuid tier_id", () => accrueCommissionSchema.parse({
    source_kind: "forwarder", source_ref: "F1", earner_admin_id: UUID_A,
    role_kind: "sales_rep", tier_id: "x", base_thb: 100,
  }));
  assertThrows("rejects empty source_ref", () => accrueCommissionSchema.parse({
    source_kind: "forwarder", source_ref: "", earner_admin_id: UUID_A,
    role_kind: "sales_rep", tier_id: UUID_B, base_thb: 100,
  }));
}

// ────────────────────────────────────────────────────────────
// (f) requestWithdrawalSchema — accrual bundle + payee bank
// ────────────────────────────────────────────────────────────
console.log("  (f) requestWithdrawalSchema — bundle + payee bank");
{
  const ok = requestWithdrawalSchema.parse({
    accrual_ids:        [UUID_A, UUID_B],
    title:              "เบิกค่าคอมเดือน พ.ค.",
    payee_bank_name:    "กสิกรไทย",
    payee_account_name: "สมชาย ใจดี",
    payee_account_no:   "1234567890",
  });
  assert("valid withdrawal request parses", ok.accrual_ids.length === 2);
  assert("wht_rate_pct optional (undefined ok)", ok.wht_rate_pct === undefined);

  // wht_rate_pct override accepted within 0..50.
  const override = requestWithdrawalSchema.parse({
    accrual_ids: [UUID_A], title: "t", payee_bank_name: "b",
    payee_account_name: "n", payee_account_no: "1", wht_rate_pct: 0,
  });
  assert("wht_rate_pct 0 override accepted", override.wht_rate_pct === 0);

  assertThrows("rejects empty accrual_ids", () => requestWithdrawalSchema.parse({
    accrual_ids: [], title: "t", payee_bank_name: "b",
    payee_account_name: "n", payee_account_no: "1",
  }));
  assertThrows("rejects >500 accrual_ids", () => requestWithdrawalSchema.parse({
    accrual_ids: Array.from({ length: 501 }, () => UUID_A),
    title: "t", payee_bank_name: "b", payee_account_name: "n", payee_account_no: "1",
  }));
  assertThrows("rejects wht_rate_pct > 50", () => requestWithdrawalSchema.parse({
    accrual_ids: [UUID_A], title: "t", payee_bank_name: "b",
    payee_account_name: "n", payee_account_no: "1", wht_rate_pct: 51,
  }));
  assertThrows("rejects wht_rate_pct < 0", () => requestWithdrawalSchema.parse({
    accrual_ids: [UUID_A], title: "t", payee_bank_name: "b",
    payee_account_name: "n", payee_account_no: "1", wht_rate_pct: -1,
  }));
  assertThrows("rejects missing payee bank", () => requestWithdrawalSchema.parse({
    accrual_ids: [UUID_A], title: "t", payee_account_name: "n", payee_account_no: "1",
  }));
}

// ────────────────────────────────────────────────────────────
// (g) approve / mark-paid / reject schemas
// ────────────────────────────────────────────────────────────
console.log("  (g) approve / mark-paid / reject schemas");
{
  assert("approve accepts uuid", approveWithdrawalSchema.parse({ id: UUID_A }).id === UUID_A);
  assertThrows("approve rejects non-uuid", () => approveWithdrawalSchema.parse({ id: "x" }));

  const paid = markWithdrawalPaidSchema.parse({
    id: UUID_A, slip_storage_path: `${UUID_B}/WD-001.jpg`,
  });
  assert("mark-paid accepts a slip path", paid.slip_storage_path.endsWith("WD-001.jpg"));
  assertThrows("mark-paid rejects empty slip path",
    () => markWithdrawalPaidSchema.parse({ id: UUID_A, slip_storage_path: "" }));

  const rej = rejectWithdrawalSchema.parse({ id: UUID_A, rejected_reason: "ข้อมูลผิด" });
  assert("reject parses", rej.rejected_reason === "ข้อมูลผิด");
  assertThrows("reject rejects 2-char reason",
    () => rejectWithdrawalSchema.parse({ id: UUID_A, rejected_reason: "ab" }));
}

// ────────────────────────────────────────────────────────────
// (h) upsertCommissionTierSchema — the rate/flat XOR refine
// ────────────────────────────────────────────────────────────
console.log("  (h) upsertCommissionTierSchema — rate XOR flat");
{
  // rate-only → valid.
  const rateOnly = upsertCommissionTierSchema.parse({
    role_kind: "interpreter", service_kind: "service_order",
    tier_name: "Tier 1", rate_pct: 5,
  });
  assert("rate-only tier parses", rateOnly.rate_pct === 5);
  assert("is_active defaults true", rateOnly.is_active === true);

  // flat-only → valid.
  const flatOnly = upsertCommissionTierSchema.parse({
    role_kind: "sales_rep", service_kind: "forwarder",
    tier_name: "Flat tier", flat_thb: 300,
  });
  assert("flat-only tier parses", flatOnly.flat_thb === 300);

  // BOTH set → refine throws.
  assertThrows("rejects both rate AND flat", () => upsertCommissionTierSchema.parse({
    role_kind: "interpreter", service_kind: "service_order",
    tier_name: "Bad", rate_pct: 5, flat_thb: 300,
  }));
  // NEITHER set → refine throws.
  assertThrows("rejects neither rate NOR flat", () => upsertCommissionTierSchema.parse({
    role_kind: "interpreter", service_kind: "service_order", tier_name: "Bad",
  }));
  // Bad effective_from date format.
  assertThrows("rejects malformed effective_from", () => upsertCommissionTierSchema.parse({
    role_kind: "interpreter", service_kind: "service_order",
    tier_name: "T", rate_pct: 5, effective_from: "2026/05/01",
  }));
}

// ────────────────────────────────────────────────────────────
// (i) G6 — affiliateWithdrawRequestSchema (customer-side)
//
// Pacred-web feeds the modal on /commissions. Distinct from the
// staff-side schema above:
//   - has its own MIN_AFFILIATE_WITHDRAW_THB threshold (1,000 baht,
//     transcribed from legacy report-user-sales.php L161)
//   - takes a flat `amount`, not an `accrual_ids[]` bundle
//   - has lenient `account_number` (digits + dashes + spaces; normalises
//     to digits-only)
// ────────────────────────────────────────────────────────────
console.log("  (i) affiliateWithdrawRequestSchema (customer-side G6)");
{
  // Constants — the legacy 1,000 baht threshold from report-user-sales.php L161.
  assert("MIN_AFFILIATE_WITHDRAW_THB is 1000", MIN_AFFILIATE_WITHDRAW_THB === 1000);
  assert("MAX_AFFILIATE_WITHDRAW_THB is 5,000,000", MAX_AFFILIATE_WITHDRAW_THB === 5_000_000);

  // Happy path — exactly at the minimum threshold parses.
  const ok = affiliateWithdrawRequestSchema.parse({
    amount:         1000,
    bank_name:      "กสิกรไทย",
    account_name:   "สมชาย ใจดี",
    account_number: "1234567890",
  });
  assert("min threshold (1000) parses",   ok.amount === 1000);
  assert("digits-only account passes",    ok.account_number === "1234567890");
  assert("note defaults to undefined",    ok.note === undefined);
  assert("bank trimmed",                  ok.bank_name === "กสิกรไทย");

  // Lenient account_number — dashes + spaces, normalised to digits.
  const dashed = affiliateWithdrawRequestSchema.parse({
    amount: 1500, bank_name: "ไทยพาณิชย์",
    account_name: "ทดสอบ", account_number: "123-456-7890",
  });
  assert("dashed account → strips dashes",   dashed.account_number === "1234567890");
  const spaced = affiliateWithdrawRequestSchema.parse({
    amount: 1500, bank_name: "ไทยพาณิชย์",
    account_name: "ทดสอบ", account_number: "123 456 7890",
  });
  assert("spaced account → strips spaces",   spaced.account_number === "1234567890");

  // Empty-string note → undefined (preserves the wallet-action pattern).
  const noteless = affiliateWithdrawRequestSchema.parse({
    amount: 1000, bank_name: "b", account_name: "n",
    account_number: "12345678", note: "",
  });
  assert("empty-string note → undefined", noteless.note === undefined);

  // Below threshold → rejected.
  assertThrows("rejects amount below 1000",
    () => affiliateWithdrawRequestSchema.parse({
      amount: 999, bank_name: "b", account_name: "n", account_number: "12345678",
    }));
  // Above safety cap → rejected.
  assertThrows("rejects amount above 5M",
    () => affiliateWithdrawRequestSchema.parse({
      amount: 5_000_001, bank_name: "b", account_name: "n", account_number: "12345678",
    }));
  // Zero / negative → rejected.
  assertThrows("rejects zero amount",
    () => affiliateWithdrawRequestSchema.parse({
      amount: 0, bank_name: "b", account_name: "n", account_number: "12345678",
    }));
  assertThrows("rejects negative amount",
    () => affiliateWithdrawRequestSchema.parse({
      amount: -1, bank_name: "b", account_name: "n", account_number: "12345678",
    }));
  // Missing bank → rejected.
  assertThrows("rejects empty bank_name",
    () => affiliateWithdrawRequestSchema.parse({
      amount: 1000, bank_name: "", account_name: "n", account_number: "12345678",
    }));
  // Missing account name → rejected.
  assertThrows("rejects empty account_name",
    () => affiliateWithdrawRequestSchema.parse({
      amount: 1000, bank_name: "b", account_name: "", account_number: "12345678",
    }));
  // account_number too short (<8) → rejected.
  assertThrows("rejects 7-digit account",
    () => affiliateWithdrawRequestSchema.parse({
      amount: 1000, bank_name: "b", account_name: "n", account_number: "1234567",
    }));
  // account_number with letters → rejected.
  assertThrows("rejects letters in account",
    () => affiliateWithdrawRequestSchema.parse({
      amount: 1000, bank_name: "b", account_name: "n", account_number: "ABCDEFGH",
    }));
  // Over-long note → rejected.
  assertThrows("rejects note >500 chars",
    () => affiliateWithdrawRequestSchema.parse({
      amount: 1000, bank_name: "b", account_name: "n",
      account_number: "12345678", note: "x".repeat(501),
    }));
}

// ────────────────────────────────────────────────────────────
// (j) affiliateCommissionFiltersSchema (customer-side G6)
// ────────────────────────────────────────────────────────────
console.log("  (j) affiliateCommissionFiltersSchema");
{
  // All-optional → empty {} is valid.
  const empty = affiliateCommissionFiltersSchema.parse({});
  assert("empty filter parses",        empty.from === undefined && empty.to === undefined);

  // Happy path.
  const ok = affiliateCommissionFiltersSchema.parse({
    from: "2026-01-01", to: "2026-12-31", status: "unpaid",
  });
  assert("valid date range parses",    ok.from === "2026-01-01");
  assert("status: unpaid parses",      ok.status === "unpaid");

  // "all" sentinel.
  const allFilter = affiliateCommissionFiltersSchema.parse({ status: "all" });
  assert("status: all parses",         allFilter.status === "all");

  // Bad date format → rejected.
  assertThrows("rejects slash date",
    () => affiliateCommissionFiltersSchema.parse({ from: "2026/01/01" }));
  assertThrows("rejects partial date",
    () => affiliateCommissionFiltersSchema.parse({ to: "2026-1-1" }));
  // Bad status enum → rejected.
  assertThrows("rejects unknown status",
    () => affiliateCommissionFiltersSchema.parse({ status: "approved" }));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
