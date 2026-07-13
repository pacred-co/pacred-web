import assert from "node:assert";
import { computeReverseCheck } from "./momo-packing-reverse-check";

// 1. a packing tracking absent from the API staging → flagged missing
{
  const r = computeReverseCheck(
    ["1783147517", "1783147518", "SF999"],
    ["1783147517", "1783147518"],
  );
  assert.equal(r.checked, 3, "3 distinct packing bases checked");
  assert.equal(r.present, 2, "2 present in API");
  assert.deepEqual(r.missing, ["SF999"], "SF999 is only in packing");
}

// 2. base-vs-split matching: packing "-2" child matches an API base (and vice versa)
{
  const r = computeReverseCheck(
    ["1783147517-2", "1783147517-3"], // packing split children
    ["1783147517"],                    // API has only the bare base
  );
  assert.equal(r.checked, 1, "both children collapse to ONE base");
  assert.equal(r.present, 1, "base found in API");
  assert.deepEqual(r.missing, [], "nothing missing — same base");
}

// 3. API split child covers a bare packing base
{
  const r = computeReverseCheck(
    ["1783147517"],
    ["1783147517-1", "1783147517-2"],
  );
  assert.equal(r.present, 1, "packing base matched by API's split child");
  assert.deepEqual(r.missing, []);
}

// 4. empty / null trackings ignored, distinct de-dup
{
  const r = computeReverseCheck(
    ["AAA", "AAA", "", null, "BBB"],
    ["AAA"],
  );
  assert.equal(r.checked, 2, "AAA de-duped, empties skipped → AAA + BBB");
  assert.equal(r.present, 1);
  assert.deepEqual(r.missing, ["BBB"]);
}

// 5. all-present → no missing
{
  const r = computeReverseCheck(["X1", "X2"], ["X1", "X2", "X3"]);
  assert.equal(r.checked, 2);
  assert.equal(r.present, 2);
  assert.deepEqual(r.missing, []);
}

console.log("momo-packing-reverse-check.test.ts: all assertions passed");
