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
// 🔁 อัพเดต 2026-08-03 — assertion เดิมอ้าง `knownMemberCode` ซึ่งถูกแทนที่ตั้งแต่งาน
// auto-resolve (2026-08-02 "มี PR แล้ว ทำไมไม่เติมให้เราเลย") → เทสค้างแดงเงียบๆ เพราะ
// ไฟล์นี้ไม่เคยถูกลงทะเบียนใน package.json. ตอนนี้ล็อก invariant ตัวปัจจุบันแทน:
// เจอ PR ที่ใช้ได้เมื่อไหร่ ต้องสลับกลับเป็นนำเข้าปกติ ห้ามปล่อยลงกอง NO CODE.
assert.match(core, /autoResolvedUserID = resolved;\s*\n\s*isSpecialNoCode = false;/);
// การตัดสิน "PR/ตู้ จากบอร์ด MOMO Live" ต้องมาจาก SOT เดียว — ทางเข้าที่ 2 คือหน้าอัพ
// ใบวางบิล MOMO ที่เพาะแถวที่ MOMO บิลแต่ระบบไม่มี (owner 2026-08-03) เรียกตัวเดียวกัน
assert.match(core, /import \{ pickMomoLivePrCode, pickMomoLiveContainer \} from "@\/lib\/admin\/momo-live-owner"/);
assert.match(core, /const livePr = pickMomoLivePrCode\(liveMeta\)/);
assert.match(core, /if \(liveContainer\) srcRow\.container_batch_no = liveContainer/);
assert.match(core, /if \(!isSpecialNoCode\) \{[\s\S]*?const rateRes = await computeAndFillForwarderImportRate/);
assert.match(core, /if \(!isSpecialNoCode\) \{[\s\S]*?await splitAggregatedMomoBoxRows/);

assert.match(commitAction, /export async function commitMomoNoCodeToSpecial/);
assert.match(commitAction, /mode: "special-no-code"/);
assert.match(momoUi, /commitMomoNoCodeToSpecial/);
assert.match(momoUi, /นำเข้าเป็นสถานะพิเศษ \/ NO CODE/);

assert.match(ownerAction, /isOwnerlessSpecial/);
assert.match(ownerAction, /assign_no_code_owner/);
// 🔁 อัพเดต 2026-08-03 — 2 invariant นี้ย้ายเข้าสมองกลางของการปลดล็อก NO CODE
// (lib/admin/activate-no-code-owner.ts · 2026-08-02) แต่ assertion เดิมยังชี้ไฟล์เก่า
// = เทสค้างแดงเงียบ (ไฟล์นี้ไม่เคยลงทะเบียนใน package.json). ตอนนี้ชี้ที่บ้านใหม่.
const activateNoCode = read("lib/admin/activate-no-code-owner.ts");
assert.match(activateNoCode, /NO CODE รายการนี้มียอดเงินก่อนระบุเจ้าของ/);
assert.match(activateNoCode, /const nextStatus = \(fwd\.fcabinetnumber \?\? ""\)\.trim\(\) \? "3" : "2"/);
assert.match(statusAction, /NO CODE ต้องใส่ PR ที่มีจริงก่อนออกจากสถานะพิเศษ/);
assert.match(statusAction, /NO CODE ต้องกด \"ใส่ PR → กลับเข้า flow\" ก่อน/);
assert.match(specialUi, /ใส่ PR → กลับเข้า flow/);

// ── ทางเข้าที่ 2 (owner 2026-08-03): เพาะแถวจากบรรทัดบนใบวางบิล MOMO ──────────
// invariant: ห้ามมีทางเขียนที่สอง — ต้อง delegate เข้า createMissingMomoForwarderRow
// และแถว NO CODE ที่เกิดจากทางนี้ ต้องไม่ถูกตั้งราคาจากตัวเลขบนใบ
const invoiceIngest = read("actions/admin/momo-invoice-ingest.ts");
const addMissing = read("actions/admin/momo-add-missing.ts");
assert.match(invoiceIngest, /export async function createForwarderRowFromInvoiceLine/);
assert.match(invoiceIngest, /createMissingMomoForwarderRow\(/);
assert.doesNotMatch(invoiceIngest, /\.from\("tb_forwarder"\)\s*\n\s*\.insert\(/);
assert.match(invoiceIngest, /skipAutoRate: true/);
assert.match(addMissing, /mode:\s+z\.enum\(\["normal", "special-no-code"\]\)/);
assert.match(addMissing, /const fStatusNew = isNoCode \? "99"/);
assert.match(addMissing, /if \(!isNoCode && !d\.skipAutoRate\)/);

console.log("✅ momo-no-code-flow-contract: special holding + PR activation invariants present");
