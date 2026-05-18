/**
 * Unit tests for the legacy PCS Cargo password port.
 *
 * Reference vectors were computed independently with a Python md5
 * implementation of the legacy `pass_tam` algorithm. The algorithm was also
 * structurally verified against 7 real `tb_users` hashes (userPass +
 * pcs_logged) — each satisfies  c === md5(b)  and  b === reverse(d).slice(0,15).
 *
 * Pattern matches lib/utils/phone.test.ts (plain tsx + manual assertions).
 */
import { createHash } from "node:crypto";
import { passTam, verifyLegacyPassword } from "./pcs-legacy-password";

let pass = 0;
let fail = 0;

function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// Reference vectors — Python-computed pass_tam(plaintext).
const VECTORS: ReadonlyArray<readonly [string, string]> = [
  ["test123",    "5eebefca8667eb8fbcbbfa6a747e30cccc03e747a6afbbcfae3f81c386a0d95787e1c560faee309"],
  ["hello",      "295c710119d9179b67a2b4cba20414d55d41402abc4b2a7ce6dc4c146f77a92ed1120ee90242c76"],
  ["",           "e7248fce8990089e402b00f89dc8d14dd41d8cd98f00b201ce6859c86638a187c626c344cf3e8e1"],
  ["P@ssw0rd!",  "b41dbb5d2f257840141c64f1a76342a88a24367a1f46c14beaee03179125ab7afd9a59130719409"],
  ["0966547127", "6e6dd4e0bf71ebb0569bd8aee55d370dd073d55eea8db96ac1fd3d4a1f66500ed3dcb562d266ec8"],
];

section("passTam — matches legacy reference vectors");
for (const [plain, expected] of VECTORS) {
  assertEq(`passTam(${JSON.stringify(plain)})`, passTam(plain), expected);
}

section("passTam — output is 79 chars");
for (const [plain] of VECTORS) {
  assertEq(`length 79 for ${JSON.stringify(plain)}`, passTam(plain).length, 79);
}

section("passTam — structural invariants (self-consistency)");
for (const [plain] of VECTORS) {
  const h = passTam(plain);
  const d = h.slice(0, 32);
  const b = h.slice(32, 47);
  const c = h.slice(47, 79);
  assertEq(`c === md5(b) for ${JSON.stringify(plain)}`,
    c, createHash("md5").update(b, "utf8").digest("hex"));
  assertEq(`b === reverse(d).slice(0,15) for ${JSON.stringify(plain)}`,
    b, d.split("").reverse().join("").slice(0, 15));
}

section("verifyLegacyPassword");
const H_TEST123 = "5eebefca8667eb8fbcbbfa6a747e30cccc03e747a6afbbcfae3f81c386a0d95787e1c560faee309";
assertEq("correct password verifies", verifyLegacyPassword("test123", H_TEST123), true);
assertEq("wrong password rejected", verifyLegacyPassword("wrong-pw", H_TEST123), false);
assertEq("empty stored hash rejected", verifyLegacyPassword("test123", ""), false);
assertEq("empty password verifies its own hash",
  verifyLegacyPassword("", "e7248fce8990089e402b00f89dc8d14dd41d8cd98f00b201ce6859c86638a187c626c344cf3e8e1"), true);

console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
