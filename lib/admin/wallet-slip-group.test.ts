import { directSlipGroupKey, groupDirectWalletSlips } from "./wallet-slip-group";

let pass = 0;
let fail = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`); }
};

const rows = [
  { id: 105713, userid: "PR050", imagesslip: "u/forwarder_payment/one.jpeg", type: "4", typeservice: "2", reforder2: null, amount: 415.13 },
  { id: 105714, userid: "PR050", imagesslip: "u/forwarder_payment/one.jpeg", type: "4", typeservice: "2", reforder2: null, amount: 414.87 },
];

const grouped = groupDirectWalletSlips(rows);
eq("one exact slip becomes one review group", grouped.length, 1);
eq("anchor is deterministic", grouped[0]?.anchor.id, 105713);
eq("all shipment ledger ids remain inspectable", grouped[0]?.rows.map((r) => r.id), [105713, 105714]);
eq("aggregate uses integer satang", grouped[0]?.totalSatang, 83000);
eq("decimal half-up does not inherit binary-float drift",
  groupDirectWalletSlips([{ ...rows[0], amount: 1.005 }])[0]?.totalSatang, 101);

eq("same slip filename for a different customer does not collide",
  groupDirectWalletSlips([...rows, { ...rows[0], id: 9, userid: "PR999" }]).length, 2);
eq("cascade child keeps its explicit relation and is not slip-grouped",
  directSlipGroupKey({ ...rows[0], reforder2: 123 }), null);
eq("non-direct wallet row is never heuristic-grouped",
  directSlipGroupKey({ ...rows[0], type: "1" }), null);

console.log(`\n${fail === 0 ? "✅" : "❌"} wallet-slip-group: ${pass} pass / ${fail} fail`);
if (fail) process.exit(1);
