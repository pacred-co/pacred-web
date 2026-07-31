import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const core = read("lib/admin/commit-momo-row-core.ts");
const commitAction = read("actions/admin/momo-commit.ts");
const ownerAction = read("actions/admin/forwarders-field-edits.ts");
const statusAction = read("actions/admin/forwarders.ts");
const momoUi = read("app/[locale]/(admin)/admin/momo-containers/momo-containers-client.tsx");
const specialUi = read("app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx");

assert.match(core, /mode:\s+z\.enum\(\["normal", "special-no-code"\]\)/);
assert.match(core, /const fStatusNew = isSpecialNoCode \? "99"/);
assert.match(core, /commit_userid: isSpecialNoCode \? null : customer\.userID/);
assert.match(core, /pricecrate:\s+isSpecialNoCode \? 0 : momoCrate\.pricecrate/);
assert.match(core, /\.from\("momo_box_detail"\)[\s\S]*?\.select\("member_code, container_name"\)/);
assert.match(core, /if \(knownMemberCode\)[\s\S]*?ห้ามส่งเข้ากอง NO CODE/);
assert.match(core, /if \(liveContainer\) srcRow\.container_batch_no = liveContainer/);
assert.match(core, /if \(!isSpecialNoCode\) \{[\s\S]*?const rateRes = await computeAndFillForwarderImportRate/);
assert.match(core, /if \(!isSpecialNoCode\) \{[\s\S]*?await splitAggregatedMomoBoxRows/);

assert.match(commitAction, /export async function commitMomoNoCodeToSpecial/);
assert.match(commitAction, /mode: "special-no-code"/);
assert.match(momoUi, /commitMomoNoCodeToSpecial/);
assert.match(momoUi, /นำเข้าเป็นสถานะพิเศษ \/ NO CODE/);

assert.match(ownerAction, /isOwnerlessSpecial/);
assert.match(ownerAction, /NO CODE รายการนี้มียอดเงินก่อนระบุเจ้าของ/);
assert.match(ownerAction, /const nextStatus = \(fwd\.fcabinetnumber \?\? ""\)\.trim\(\) \? "3" : "2"/);
assert.match(ownerAction, /assign_no_code_owner/);
assert.match(statusAction, /NO CODE ต้องใส่ PR ที่มีจริงก่อนออกจากสถานะพิเศษ/);
assert.match(statusAction, /NO CODE ต้องกด \"ใส่ PR → กลับเข้า flow\" ก่อน/);
assert.match(specialUi, /ใส่ PR → กลับเข้า flow/);

console.log("✅ momo-no-code-flow-contract: special holding + PR activation invariants present");
