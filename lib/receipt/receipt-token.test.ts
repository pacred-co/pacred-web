/**
 * Unit tests for the public-document HMAC tokens (lib/receipt/receipt-token.ts).
 *
 * These tokens are the CAPABILITY GATE for the login-free public receipt
 * (`/r/[token]`) and public ใบวางบิล (`/b/[token]`) pages. A hole here = a money
 * document leaked (a forgeable/enumerable token) or a cross-type replay (a
 * receipt token opening a bill, or vice-versa) — so this test locks:
 *   - sign→verify round-trips for BOTH receipt and bill tokens;
 *   - a tampered / malformed / wrong-id token is rejected (fail closed);
 *   - DOMAIN SEPARATION: a receipt token is NOT a valid bill token, and a bill
 *     token is NOT a valid receipt token, even for the same numeric id.
 *
 * The module does `import "server-only"`, so run under the test tsconfig shim:
 *   tsx --tsconfig tsconfig.test.json lib/receipt/receipt-token.test.ts
 *   (also via `pnpm test:unit`). Exits non-zero on any failure.
 */

// The token secret must exist before any sign/verify call (the module fails
// closed if neither RECEIPT_TOKEN_SECRET nor SUPABASE_SERVICE_ROLE_KEY is set).
process.env.RECEIPT_TOKEN_SECRET = "test-secret-do-not-use-in-prod-0123456789";

import {
  signReceiptToken,
  verifyReceiptToken,
  signBillToken,
  verifyBillToken,
} from "./receipt-token";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

// ── round-trips ─────────────────────────────────────────────
console.log("receipt-token: sign→verify round-trips");
for (const id of [1, 42, 15118, 999999999]) {
  const rt = signReceiptToken(id);
  ok(`receipt id ${id} round-trips`, verifyReceiptToken(rt) === id);
  const bt = signBillToken(id);
  ok(`bill id ${id} round-trips`, verifyBillToken(bt) === id);
}

// token shape: `{id}-{32 lowercase hex}`
console.log("receipt-token: token format");
{
  const rt = signReceiptToken(42);
  ok("receipt token matches {id}-{32hex}", /^42-[0-9a-f]{32}$/.test(rt));
  const bt = signBillToken(42);
  ok("bill token matches {id}-{32hex}", /^42-[0-9a-f]{32}$/.test(bt));
  ok("receipt and bill tokens for same id DIFFER", rt !== bt);
}

// ── CROSS-TYPE REPLAY is impossible (the security-critical assertion) ────────
console.log("receipt-token: cross-type replay is rejected");
{
  const receiptToken = signReceiptToken(42);
  const billToken = signBillToken(42);
  ok("a receipt token is NOT a valid bill token", verifyBillToken(receiptToken) === null);
  ok("a bill token is NOT a valid receipt token", verifyReceiptToken(billToken) === null);
  // and neither cross-verifies even by swapping only the id side back in
  ok("receipt token rejected as bill (id 15118)",
    verifyBillToken(signReceiptToken(15118)) === null);
  ok("bill token rejected as receipt (id 15118)",
    verifyReceiptToken(signBillToken(15118)) === null);
}

// ── tampering / forgery → null (fail closed) ────────────────
console.log("receipt-token: tampered / malformed tokens are rejected");
{
  const rt = signReceiptToken(42); // "42-<hmac>"
  const hmac = rt.split("-")[1];

  // flip one hex char of the hmac
  const flipped = "42-" + (hmac[0] === "0" ? "1" : "0") + hmac.slice(1);
  ok("tampered receipt hmac → null", verifyReceiptToken(flipped) === null);

  // wrong id with a valid-for-another-id hmac
  ok("id swapped under a valid hmac → null", verifyReceiptToken("43-" + hmac) === null);

  // raw id, no hmac (enumeration probe)
  ok("raw id '42' → null", verifyReceiptToken("42") === null);
  ok("raw id '42' (bill) → null", verifyBillToken("42") === null);

  // short / non-hex / garbage hmac
  ok("short hmac → null", verifyReceiptToken("42-deadbeef") === null);
  ok("uppercase hex hmac → null", verifyReceiptToken("42-" + hmac.toUpperCase()) === null);
  ok("empty string → null", verifyReceiptToken("") === null);
  ok("garbage → null", verifyReceiptToken("not-a-token") === null);
  ok("bill: garbage → null", verifyBillToken("nope") === null);

  // non-positive / non-numeric id
  ok("id 0 token → null", verifyReceiptToken("0-" + hmac) === null);
  ok("negative id → null", verifyReceiptToken("-1-" + hmac) === null);
}

console.log(`\nreceipt-token: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
