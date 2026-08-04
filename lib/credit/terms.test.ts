import assert from "node:assert/strict";
import {
  addCalendarDays,
  creditDueDate,
  earliestCreditDueDate,
  isIsoCalendarDate,
  normaliseCreditTermsDays,
} from "./terms";

assert.equal(normaliseCreditTermsDays("15"), 15);
assert.equal(normaliseCreditTermsDays(-1), 0);
assert.equal(normaliseCreditTermsDays("not-a-number"), 0);
assert.equal(isIsoCalendarDate("2026-02-29"), false);
assert.equal(isIsoCalendarDate("2028-02-29"), true);
assert.equal(addCalendarDays("2026-01-31", 15), "2026-02-15");
assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
assert.equal(creditDueDate("2026-08-04", "15"), "2026-08-19");
assert.equal(
  earliestCreditDueDate(["2026-08-22T00:00:00", null, "2026-08-19", "bad"]),
  "2026-08-19",
);

console.log("credit/terms: 9 checks passed");
