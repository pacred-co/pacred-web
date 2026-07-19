# WeChat China-ops network — decrypted + ingested (2026-06-29)

> Owner 2026-06-29: "สำรองข้อมูล wechat ใส่คอมนี้แล้ว · อ่านโดยละเอียด · อ่านแบบ live ·
> เอาข้อมูลเข้า database · ทำเลินนิ่ง จาก source ที่มีให้ทั้งหมด." This is the
> source-grounded record of (1) HOW the decrypt was finally done, and (2) WHAT the
> chats reveal about Pacred's China-side operation — the partner network + the live
> flows that the platform's data (tb_forwarder / momo_* / taem_packing_line) is the
> downstream of. 24,428 cargo-relevant messages were ingested into
> `wechat_ops_message` (mig 0228 · prod+dev) and are searchable at `/admin/wechat-ops`.

## 1b. 2026-07-19 — the SAME job on a **Mac** is BLOCKED (hardened runtime), not just harder

The 2026-06-29 memory read used Windows `pymem`/`VirtualQueryEx` — a same-user process read
that Windows allows. On **macOS the live-memory read fails even as root**:
- Account + DBs are identical (`wxid_a47v4a2twg3e22_62d2` · `xwechat_files/…/db_storage/`,
  message_1.db grew to 45 MB · salts stable · same SQLCipher4 scheme).
- `sudo lldb -p <WeChat> -o "process save-core …"` → **`error: attach failed … Not allowed
  to attach to process`** — WeChat is signed with the **hardened runtime** (no
  `get-task-allow`), and **AMFI denies debugger attach even to root while SIP is enabled**.
  So `task_for_pid` / lldb / dylib-inject / core-dump are ALL blocked. The macOS malloc
  tools that DO inspect a hardened process (`heap`/`leaks`/`sample`) only emit summaries,
  not raw heap bytes → useless for key recovery. Keychain has no WeChat key.
- **The three real unlocks (owner picks · all reboot/modify/relocate):** (a) do it on a
  **Windows PC** logged into the same WeChat — the pymem method just works, no SIP; (b)
  temporarily **`csrutil disable`** from Recovery → dump → re-enable (2 reboots · reversible);
  (c) **re-sign WeChat.app** with a `get-task-allow` entitlement + relaunch (no reboot but
  modifies the app · Tencent anti-tamper may refuse). **DON'T** burn time re-trying `sudo
  lldb` on a hardened Mac app — it can't work with SIP on.
- Tooling is READY + committed: `scripts/wx-decrypt-mac-2026-07-19.py` (given a
  `/tmp/wx.core` memory dump: scans for each DB's derived `enc` via an entropy gate +
  the cheap page-1-MAC validator, tries HMAC-key dklen 64/32, decrypts → plain SQLite;
  crypto self-tested). Only the DUMP step is blocked. Owner paused it 2026-07-19.

## 1. The decrypt — WeChat 4.x (Weixin 4.1.9.57) SQLCipher, the account-mismatch trap

**The whole previous-session blocker was a wrong-account assumption, not crypto.**

- WeChat 4.x stores each chat DB (`db_storage/message/message_*.db`, `contact/contact.db`,
  …) as **SQLCipher4**: header = 16-byte salt, page 4096, **reserve 80**, KDF =
  PBKDF2-HMAC-SHA512 **256000 iters** → 32-byte page key `enc`; page-MAC key =
  `PBKDF2-SHA512(enc, salt XOR 0x3a, 2 iters)`; page MAC = `HMAC-SHA512(mac_key,
  ciphertext + iv + page_number_LE)`. (The prior session's `selftest.py` had already
  reverse-engineered this scheme correctly.)
- **Key recovery = scan the running `Weixin.exe` private heap for the DERIVED `enc`
  key, not the raw key.** Validating a raw-key candidate needs PBKDF2×256000 (~50ms)
  → infeasible across millions of candidates. But the derived `enc` is resident in
  memory while the DB is open, and validating it needs only the cheap
  `PBKDF2(enc, salt^0x3a, **2**)` + one HMAC → ~µs/candidate → a full heap scan
  (≈168 MB private-committed, 4-byte aligned, entropy pre-filtered) finishes in ~20s.
- 🔴 **THE TRAP that cost the previous session ~4 hours:** it scanned for, and tested
  against, **`wxid_d2k6itll6tiu12`** — whose `message_0.db` was last written
  **2026-01-23** (CLOSED · its key was never loaded into the current process). The
  **actually-logged-in account is `wxid_a47v4a2twg3e22_62d2`** (every DB `-shm`
  touched *today*). Targeting the active account, the key fell out in **22 seconds**.
  Tell-tale: the prior `wxkey.txt` value `45727d4f…` was in fact `message_0.db`'s
  correct key — it just never validated because it was tested against the wrong
  account's salt.
- **Lesson (reusable):** before any WeChat memory-scan, pick the account by
  `-shm`/`-wal` mtime (the live account's are seconds-old). An imported *backup*
  (`xwechat_files/Backup/…`, RMFH `.enc` blobs) is **device-key encrypted = a dead
  end on PC** — only the account the client currently has OPEN is decryptable.
- Decrypt = per page: `iv = page[4016:4032]`, `AES-256-CBC(enc, iv)` over
  `page[16 or 0 : 4016]`, prepend `"SQLite format 3\0"` to page 0. Each DB has its
  OWN salt → its own `enc`; collect them all in one heap pass (8/8 found in ~7 min).
- Tooling that worked: `pymem`/`ctypes` VirtualQueryEx + a hand-rolled validator +
  `pycryptodome` AES + `zstandard` (group-message bodies are **zstd-framed**,
  magic `0x28B52FFD` — decompress BEFORE decoding, else you read garbage and
  undercount ~10×: 2,510 → 24,435 messages once zstd was handled).
  Scripts live in the session scratchpad (`wx_findkey_active.py`,
  `wx_collectkeys.py`, `wx_decrypt.py`, `wx_extract2.py`). `pywxdump 3.x` does NOT
  support v4 — don't bother.

## 2. The China-ops partner network (who's who)

Pacred's China side is a web of forwarders + a warehouse + a payment agent + doc
teams. The platform's `tb_forwarder` / `momo_*` rows are the *downstream record* of
what these groups coordinate by hand in WeChat:

| Group (WeChat) | Role | Key contacts |
|---|---|---|
| **MOMO x PACRED** | Warehouse/consolidation — receives goods, **closes containers (ปิดตู้)**, emits tracking | 🖤林云云[BAM]🖤, 文杰 (liwenjie), 🐳梓🐬 ↔ PLOY-CS/aonn/Salespacred |
| **PCS CARGO** | Legacy cargo partner (the system Pacred ported from) | — |
| **AXELRA / HUAHAI (华海) / TTP** | Sea forwarders — consolidate + **bill Pacred a COMBINED invoice per shipment** | Axelra-Pricing, 25787625786 |
| **FEISHENG (飞晟) / 柏盛泰 (Bai Sheng Tai)** | EK (ทางรถ / road) freight + customs docs | Pricing EK AX |
| **利百川 (Libaichuan)** | **ฝากโอน yuan-payment agent** — executes 1688/Alipay on Pacred's behalf | 利百川🧩 ↔ NC-PIN |
| **yiwuCargo Center (Yiwu)** | Sourcing/consolidation hub | TPN |
| **退税 / 深圳叁伍 (Shenzhen 35)** | Export VAT **tax-refund** handling | — |

Container codes in chat == system codes: **GZS**=sea (เรือ), **GZE/EK**=road (รถ),
matching `lib/forwarder/cabinet-transport.ts`.

## 3. The live flows the chats reveal (operational reality)

- **ฝากโอน (yuan transfer) — `แลกหยวน Pacred`, live daily.** NC-PIN posts each job
  verbatim: *"PR207 P22333 ทำจ่าย 1688 ออเดอร์ 3310881924142004459 แอคเค้า
  tb4499018666 ยอดจ่ายร้านค้า 178.5 หยวน"* / *"PR10012 … ฝากโอน+ใบกำกับ จ่ายอาลีเพย์
  ยอด 14935.2 หยวน"* → 利百川 pays the 1688/Alipay order and returns the slip
  ("ขอสลิปค่ะ"). The `PR###`/`P#####` references are **real `tb_payment`/order rows** —
  this WeChat group is the manual execution layer behind the yuan-payment feature.
- **Container consolidation + COMBINED billing — `Pricing AX+HUAHAI SEA`.** Forwarders
  *"ส่งบิลรวมมา"* (send one combined invoice for many containers) → Pacred must
  **split per-container** before billing customers. Per-container cost is explicit:
  *"TTP GZS260401-1 / BMOU5017775 / 7200"* (container code / sea container# / ฿ or ¥
  7200). This is the cost basis that should reconcile against `tb_forwarder.fcosttotalprice` /
  the MOMO cost (2,500/CBM, mig 0194).
- **Shipping/customs doc flow — `DOC SHIPPING SEA/EK`.** Per container: booking# →
  container# → seal# → **OBD** → **BL SURRENDER / TELEX RELEASE** (e.g.
  `TELEX RELEASE NO.:RCNSZP64212`) → **报关费 (customs-declaration fee)** settle. This
  is the upstream of the ใบขน / customs-declaration work in the platform.
- **MOMO container-close coordination — the API-drop, from the horse's mouth.** CS
  chases per-PR arrival + close-date in WeChat (*"PR073 … ปิดตู้วันไหนคะ"*,
  *"***อย่าพึ่งปิดตู้นะคะ***"*) because the MOMO `import/track` API **drops records
  once status advances** — confirmed by 🐳梓🐬 *"目前陆运货物不够一条柜"* (road goods not
  yet a full container → it waits/combines, so trackings churn). This is the same
  gap the [[itam-drift-recovery]] / `taem_packing_line` + drift-queue work and ภูม's
  weight-backfill address: **iTAM (แต้ม) packing-list is the truth; MOMO API is lossy.**

## 4. What landed in the DB + where to read it

- **mig 0228** `wechat_ops_message` (reference table · RLS service-role only) +
  **24,428 rows** ingested **prod + dev** (`scripts/ingest-wechat-ops-2026-06-29.mjs`).
- Searchable at **`/admin/wechat-ops`** (super/ops/sales · pg_trgm ILIKE on content +
  per-chat filter chips) — search "ปิดตู้", a tracking, a `PR###`, `报关`, a container
  code. Read-only; writes nothing.
- 🟡 Follow-ups worth doing later: link `wechat_ops_message` PR/container/tracking
  mentions to the live rows (a "what did China say about this container?" panel on
  `/admin/forwarders/[fNo]`); the embedded `<img>`/file XML messages reference CDN
  blobs not downloaded here (text-only ingest).

Related: [[partner-apis-quirks]] (MOMO API drop) · [[itam-drift-recovery]] ·
`docs/learnings/taem-momo-containers-2026-06-29.md` · `pacred-operational-flow-2026-06-29.md`.
