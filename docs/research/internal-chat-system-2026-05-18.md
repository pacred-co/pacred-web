# 💬 Pacred Internal Chat — per-job work-communication + status-visibility layer

> **Produced 2026-05-18** for เดฟ, on the owner's (พี่ป๊อป) ask. **What this is:**
> the design for an **internal org chat scoped per-job** — the conversation +
> visibility layer that lets the whole organisation discuss work job-by-job,
> see every job's status org-wide (current owner · what it is stuck on · which
> dept/person it waits on · *what for*), and close jobs one at a time. It cures
> the legacy "ของอยู่ไหน / รอใครเฟิม" relay failure.
>
> **What this is NOT:** a standalone messenger, and not a re-spec of the
> work-board. It is the **comment/thread layer that pairs with the
> cross-department work-board** — the `work_items` job-assignment spine that
> [`operating-system-analysis-2026-05-18.md`](operating-system-analysis-2026-05-18.md)
> §1.4 specifies and a parallel agent is building (migration `0080_work_items`,
> `/admin/board`, `actions/admin/work-items.ts`). This doc designs the *talk*
> and the *waiting-for* signal that ride on that *spine*.
>
> **Where facts already live, this links — it does not duplicate.** The
> work-board spine is owned by `operating-system-analysis-2026-05-18.md` §1.4;
> the RBAC role enum by §7; the legacy relay pain by
> [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
> and [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md); the
> notification delivery rails by
> [ADR-0001](../decisions/0001-line-notify-replacement.md).

---

## 0. TL;DR

**The spine in one sentence:** a `work_item_messages` table — a chat thread
keyed to a `work_item` (and, transitively, to the order / container / invoice
that work-item indexes) — plus a small **`waiting_for` status block on the
`work_item` itself**. Staff talk *on the job*; the job *displays why it is
stuck*; the board, the detail pages, and a per-role inbox all read the same two
things.

**Why it must pair with the work-board, not stand alone.** A standalone chat
re-creates LINE inside Pacred — searchable, but still a soup of messages with
no structure. The legacy failure was never "no chat"; the team *had* LINE. The
failure was that **the conversation was detached from the job**: nobody could
answer "ของ order นี้อยู่ไหน, รอใคร, รอเรื่องอะไร" without scrolling a chat.
Pairing chat to `work_items` means every message is *already* filed under a
job, and the job *already* carries a machine-readable "blocked-on / waiting-for"
state. The chat is the human nuance; the `work_item` fields are the structured
truth. One without the other is half a system.

**Four deliverables of this design:**

1. **Schema** — `work_item_messages` (thread) + `work_item_message_mentions`
   (@mention fan-out) + three new columns on `work_items`
   (`blocked_on_role`, `blocked_on_admin`, `waiting_reason`). §2.
2. **The status-visibility model** — every job surfaces *owner · blocked-on
   (dept/person) · waiting-for (a reason category: confirm · disbursement ·
   follow-up · billing · …)*. §3.
3. **Integration** — with the `work_items` board, `lib/notifications/`, the
   admin RBAC roles, the container/shipment model. §4.
4. **UI surface** — board card badge · work-item / shipment detail thread ·
   per-role "waiting on me" inbox. §5. **Build phases** — §6.

**Minimal-viable (Phase IC-1):** the `work_item_messages` thread + `@mention` +
the `waiting_for` block + a thread panel on the work-item detail + a board
badge. That alone kills the relay failure. Everything else (a global staff
firehose, reactions, file attach, read-receipts, LINE bridge) is later.

---

## 1. The problem, grounded

### 1.1 The legacy relay failure — what actually broke

[`cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
§4 and [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) decode
eight months of LINE chat. The recurring shape is **a status-relay failure**:

- A2 — *no status rollback*: a job advanced wrongly, and correcting it meant
  a LINE message to the developer; meanwhile the job's true state lived only in
  someone's head.
- A3 — *paid-but-unpaid desync*: money arrived, the order still read "เครดิต
  ค้างนำเข้า"; the only place the truth existed was a LINE thread.
- A6 — *withholding tax*: a juristic customer deducts WHT, the slip won't
  match, and **"ตามแทบไม่ได้เลย"** — chasing the WHT certificate is nearly
  impossible. The job is *waiting for a document* and nothing in the system
  *says so*.
- C3 — *"ตัดตู้" fails silently*: the job is blocked on a missing close-date;
  the UI neither shows it nor says who must fix it.

`operating-system-analysis-2026-05-18.md` §1.2 names the staff-side hole
precisely: **"A hand-off is a phone call or a LINE message. The system shows
*state*; it does not surface *'this is now your job'*."** And §1.2 point 3:
*"A container arriving does not appear on accounting's desk; accounting
notices."*

The common denominator: **the job's status, its blocker, and the conversation
about it are three separate things in three separate places** (a domain table,
nobody's head, and LINE). Pacred's DNA promise — *"ทุกคนเห็นงานผ่านระบบ ไม่ต้อง
ตาม"* — fails the moment a job needs a hand-off or a clarification.

### 1.2 What the work-board fixes — and what it leaves open

The `work_items` spine (`operating-system-analysis-2026-05-18.md` §1.4) fixes
**assignment + indexing**: a DB trigger opens / advances / closes a `work_item`
on every domain status change, so a job *appears* on the next department's
board instead of being noticed. `/admin/board` shows every live job by stage;
a per-role landing shows "your N open items".

**What the board alone does not give:**

1. **A place to *talk about the specific job*.** The board says *order X is at
   stage `awaiting_billing`, owned by accounting*. It does not let the
   warehouse staffer who handed it over write *"customer disputes the CBM — 16.79
   vs 21.28, see container GZE260422-1, please re-bill from the manifest figure"*.
   Without that, the talk goes back to LINE and the detach returns.
2. **A *why-stuck* signal richer than the stage name.** A stage is
   `awaiting_billing`; that does not say the job is *waiting for the customer's
   WHT certificate* vs *waiting for a disbursement approval* vs *waiting for an
   internal confirm*. "Blocked-on whom + waiting for what" is a different axis
   from "what stage".
3. **A "needs me" pull that includes *mentions and waits*, not just
   assignment.** `assigned_to` answers "whose job is it". It does not answer
   "which jobs is someone *waiting on me* to unblock" — the accountant who must
   approve a disbursement, the manager who must confirm a rate.

This doc designs exactly those three: **the thread, the `waiting_for` block,
and the inbox that reads both.**

### 1.3 Codebase reality check (what exists today)

| Asset | State | Source |
|---|---|---|
| `work_items` spine + `/admin/board` + `actions/admin/work-items.ts` | **being built in parallel** (migration `0080`) | `operating-system-analysis-2026-05-18.md` §1.4 |
| Customer-facing `notifications` + `notification_reads` + `lib/notifications/` sender | ✅ shipped (migration `0014`; `delivery_status` added by `0070`) | [ADR-0001](../decisions/0001-line-notify-replacement.md) |
| `contact_messages` — inbound customer→admin, 4-state, **no assignee, no thread** | ✅ shipped (migration `0022`) | — |
| `broadcasts` — outbound admin→customer push | ✅ shipped (migration `0055`) | — |
| `admins` table + `is_admin(role[])` SECURITY DEFINER helper | ✅ shipped (migration `0015`) | [ADR-0002](../decisions/0002-admin-architecture.md) |
| `admin_audit_log` — admin action trail (`admin_id · action · target_type · target_id · payload`) | ✅ shipped (migration `0015`) | — |
| Container / shipment spine (`cargo_containers` / `cargo_shipments` / `cargo_shipment_tracking`) | ✅ shipped (migration `0033`, unified `0059`) | [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md) |

**Two facts shape every schema choice below:**

- **There is no internal staff↔staff message table.** `notifications` is
  one-way (system→user, `profile_id` is the *recipient*, no author, no thread).
  `contact_messages` is customer→admin. `broadcasts` is admin→customer. An
  internal **per-job thread is genuinely net-new** — but it reuses the
  `notifications` *delivery* rails and the `admins`/`is_admin()` *identity*
  rails, so it is additive, not a parallel system.
- **The migration after `0072` is free.** The parallel agent takes `0080` for
  `work_items`; this chat layer is the **next migration after that** — number
  it `0081_work_item_messages.sql` and make it depend on `0080`.

---

## 2. Schema

### 2.1 Design constraints

1. **The thread hangs off `work_items`, not off domain tables directly.** A
   `work_item` already indexes *one* of `forwarder` / `service_order` /
   `freight_shipment` / `customs_declaration` / `freight_invoice` /
   `contact_message` / `refund_request` / `qa_inspection`
   (`operating-system-analysis-2026-05-18.md` §1.4 (a)). Keying the thread to
   `work_item_id` means **one chat model covers all eight entity types** —
   no `if entity_type == ...` branching, no eight message tables. When the
   board opens a `work_item` for an arrived container, the thread is there
   automatically.
2. **Org-wide read for staff; authorship is real.** Every active admin reads
   every thread (the DNA promise — "every staff member sees every job"). Writes
   are role-checked: any active admin may post; the `waiting_for` *resolution*
   is gated to the role that owns the blocker (§3.3).
3. **Append-only, like `notifications` and `admin_audit_log`.** A message is
   never edited or hard-deleted; a `deleted_at` soft-delete is enough (audit
   integrity — same posture as the rest of the system).
4. **`@mention` is a first-class fan-out, not a substring.** Parsing `@name`
   out of body text at read time is fragile (renames, ambiguity). Store
   mentions in a child table written at post time — it doubles as the
   notification trigger and the "mentioned me" inbox filter.

### 2.2 Tables

```
-- ════════════════════════════════════════════════════════════
-- 0081_work_item_messages.sql  — internal per-job chat thread.
-- DEPENDS ON 0080_work_items.sql (work_items table + enums).
-- ════════════════════════════════════════════════════════════

-- ── work_item_messages ── the thread. One row = one staff message
--    (or one system event line) on one job.
create table public.work_item_messages (
  id              uuid primary key default gen_random_uuid(),
  work_item_id    uuid not null references public.work_items(id) on delete cascade,

  -- Author. NULL author + kind='system' = a machine-generated line
  -- (stage advanced, assignee changed) so the human chat and the
  -- job's event log are ONE timeline (see §3.4).
  author_admin_id uuid references public.profiles(id) on delete set null,

  kind            text not null default 'comment'
                    check (kind in ('comment','system','status_note')),
  --   comment      — a human message
  --   system       — auto event line (stage change, assignment, waiting-for set)
  --   status_note  — a human message that ALSO sets/clears the waiting_for
  --                  block in the same action (§3.3); rendered with emphasis

  body            text not null,                 -- markdown-light, like notifications.body

  -- When kind='status_note', the waiting_for fields this message set
  -- (denormalised copy for the timeline; the live value lives on work_items).
  set_waiting_reason text,                        -- mirrors work_items.waiting_reason
  set_blocked_role   text,                        -- mirrors work_items.blocked_on_role

  deleted_at      timestamptz,                    -- soft-delete; never hard-delete
  created_at      timestamptz not null default now()
);

create index work_item_messages_thread_idx
  on public.work_item_messages(work_item_id, created_at);
create index work_item_messages_author_idx
  on public.work_item_messages(author_admin_id, created_at desc)
  where deleted_at is null;

-- ── work_item_message_mentions ── @mention fan-out.
--    One row per (message, mentioned staff). Written at post time by
--    actions/admin/work-item-messages.ts after it parses @handles.
create table public.work_item_message_mentions (
  message_id        uuid not null references public.work_item_messages(id) on delete cascade,
  mentioned_admin_id uuid not null references public.profiles(id) on delete cascade,
  -- denormalised so the "mentioned me" inbox query needs no join to messages
  work_item_id      uuid not null references public.work_items(id) on delete cascade,
  notified_at       timestamptz,                  -- set when the notification fired
  seen_at           timestamptz,                  -- set when the mentioned staff opened the thread
  created_at        timestamptz not null default now(),
  primary key (message_id, mentioned_admin_id)
);

create index work_item_message_mentions_inbox_idx
  on public.work_item_message_mentions(mentioned_admin_id, created_at desc)
  where seen_at is null;
```

### 2.3 The `waiting_for` block — three columns ON `work_items`

The blocked-on / waiting-for state is **a property of the job**, not of a
message — so it lives on `work_items`, set by an `ALTER TABLE` in the same
`0081` migration. (It is *additive* to whatever `0080` ships; `0081` only adds
columns, so it cannot conflict with the parallel build.)

```
-- 0081 also extends work_items with the waiting-for block:
alter table public.work_items
  add column if not exists blocked_on_role  text,    -- which DEPT must act
  add column if not exists blocked_on_admin uuid references public.profiles(id),
                                                     -- optional: a specific PERSON
  add column if not exists waiting_reason   text;    -- WHY (category — see §3.2)

-- waiting_reason vocabulary (CHECK):
--   'confirm'       — needs an internal confirmation / sign-off / approval-to-proceed
--   'disbursement'  — needs a เบิกจ่าย / disbursement approval or payout
--   'billing'       — needs an invoice issued / a วางบิล / a bill placed
--   'follow_up'     — needs a customer / partner follow-up (ตามลูกค้า / ตามคู่ค้า)
--   'document'      — needs a document (WHT cert / Form E / D/O / slip) — covers A6
--   'payment'       — needs a customer payment / slip before it can move
--   'rate_fix'      — needs a price / rate correction (the A2/A4 case)
--   'external'      — blocked on a 3rd party out of Pacred's control (customs, carrier)
--   null            — NOT blocked; the job is moving normally

alter table public.work_items
  add constraint work_items_waiting_reason_chk
  check (waiting_reason is null or waiting_reason in
    ('confirm','disbursement','billing','follow_up','document',
     'payment','rate_fix','external'));

-- A partial index so "all jobs currently blocked on dept X" is one scan:
create index work_items_blocked_idx
  on public.work_items(blocked_on_role, waiting_reason)
  where waiting_reason is not null;
```

**Why columns and not a separate `blocks` table.** A `work_item` has **at most
one active blocker at a time** — operationally a job is "stuck on one thing";
when that clears it either moves or hits the next thing. Three nullable columns
model that exactly, keep the board query a single table scan, and keep the
`status_note` message ↔ block update atomic in one `UPDATE`. A history of past
blockers is not lost — every `set`/`clear` writes a `kind='system'` or
`status_note` message row, so the *thread itself* is the blocker history.

### 2.4 RLS

Mirror the established patterns: `is_admin()` for the org-wide read,
`is_admin([roles])` for scoped writes. All inserts/updates go through Server
Actions on the **service-role** client (like `notifications` and
`admin_audit_log`) — so the policies below are the *defence-in-depth* floor,
and the Server Action is where the real role logic lives.

```
alter table public.work_item_messages         enable row level security;
alter table public.work_item_message_mentions enable row level security;

-- READ: every active admin sees every thread — the DNA promise.
--   "every staff member sees every job — its full status".
create policy work_item_messages_admin_read
  on public.work_item_messages for select
  using (public.is_admin());

-- WRITE: any active admin may post a comment on any job (org-wide
--   collaboration). The service-role action is the real gate; this
--   policy is the floor — no role array, because ALL staff may talk.
create policy work_item_messages_admin_write
  on public.work_item_messages for insert
  with check (public.is_admin() and author_admin_id = auth.uid());

-- No UPDATE/DELETE policy — soft-delete (set deleted_at) goes through
-- the service-role action, gated to author-or-super in app code.

-- mentions: readable by any admin (the thread is org-wide anyway);
-- the mentioned person additionally needs to flip seen_at.
create policy work_item_message_mentions_admin_read
  on public.work_item_message_mentions for select
  using (public.is_admin());

create policy work_item_message_mentions_mark_seen
  on public.work_item_message_mentions for update
  using (mentioned_admin_id = auth.uid())
  with check (mentioned_admin_id = auth.uid());
```

> **Customer visibility = none.** This is an *internal* org chat. Customers
> never read `work_item_messages` (no customer-side policy). The customer's
> visibility is the existing shipment timeline + `notifications` — already
> 🟢 strong per `operating-system-analysis-2026-05-18.md` §1.1. The internal
> thread may *reference* a customer-visible fact, but customer-facing copy is
> always a separate, deliberate `sendNotification()` call (§4.2).

### 2.5 The Server Action surface (no code — the shape)

A new `actions/admin/work-item-messages.ts`, sibling to the parallel agent's
`actions/admin/work-items.ts`:

| Action | Does | Gate |
|---|---|---|
| `postMessage(workItemId, body)` | parse `@handles` → insert `work_item_messages` (`kind='comment'`) + insert `work_item_message_mentions` rows → fire mention notifications (§4.2) | any active admin |
| `postStatusNote(workItemId, body, { waitingReason, blockedRole, blockedAdmin })` | insert `kind='status_note'` message **and** `UPDATE work_items` waiting-for block in one transaction → notify the blocked-on dept/person | any active admin (the *resolver* side is gated — see §3.3) |
| `clearWaiting(workItemId, body)` | `UPDATE work_items` set `waiting_reason = null` + insert a `status_note` "unblocked" message → notify the prior owner | the blocked-on role, or `super` |
| `softDeleteMessage(messageId)` | set `deleted_at` | message author, or `super` |
| `markThreadSeen(workItemId)` | flip `seen_at` on the caller's unseen mention rows for that job | the mentioned admin |

---

## 3. The status-visibility model

This is the core of the owner's ask: *every job surfaces current owner ·
blocked-on (dept/person) · waiting-for (a reason category)*.

### 3.1 Three orthogonal axes — keep them separate

A job's visible state is **three independent things**; conflating them is the
legacy mistake (legacy had only a single linear `status`).

| Axis | Question it answers | Where it lives | Set by |
|---|---|---|---|
| **Stage** | "what step is the job at" | `work_items.current_stage` (owned by `0080`) | the domain status-change trigger |
| **Owner** | "whose desk is it on *now*" | `work_items.assigned_role` + `assigned_to` (owned by `0080`) | assignment action / trigger |
| **Waiting-for** | "is it *stuck*, on *whom*, for *what*" | `work_items.blocked_on_role` + `blocked_on_admin` + `waiting_reason` (added by `0081`, §2.3) | a `status_note` message (§3.3) |

A job at stage `awaiting_billing`, owned by `accounting`, can *also* be
`waiting_reason='document'` blocked on the *customer* — three facts, three
fields. The board card shows all three (§5.1). This is the model that makes
"รอใคร รอเรื่องอะไร" answerable at a glance.

### 3.2 The `waiting_reason` vocabulary — the owner's "what for"

The owner's ask lists the reasons explicitly: *"a confirmation? an extra
disbursement (เบิกจ่าย)? a follow-up? a bill (วางบิล)?"*. That list **is** the
enum — §2.3 fixes it to eight values. Each maps to a real legacy pain:

| `waiting_reason` | Thai | Real legacy case it names |
|---|---|---|
| `confirm` | รอเฟิม / รออนุมัติให้ทำต่อ | the generic "รอใครเฟิม" — the relay failure itself |
| `disbursement` | รอเบิกจ่าย | a container cost / vendor payout awaiting AP approval |
| `billing` | รอวางบิล / รอออกใบแจ้งหนี้ | invoice not yet issued — blocks the customer paying |
| `follow_up` | รอตามลูกค้า / ตามคู่ค้า | chasing a customer or a China supplier for an answer |
| `document` | รอเอกสาร | **A6** — the WHT certificate "ตามแทบไม่ได้เลย"; also Form E / D/O / slip |
| `payment` | รอลูกค้าชำระ | the customer has not transferred / not sent the slip yet |
| `rate_fix` | รอแก้เรท / แก้ราคา | **A2 / A4** — a wrong rate must be corrected before billing |
| `external` | รอหน่วยงานภายนอก | customs / carrier / port — out of Pacred's hands |

`null` = the job is **not** blocked — it is simply moving. The board renders a
`null`-waiting job in normal colour; a non-`null` one gets a coloured "รอ:
<reason>" badge (§5.1). The eight-value list is deliberately *small and fixed*
— a free-text "why" defeats the at-a-glance scan and the per-reason filter.
Nuance goes in the `status_note` message *body*; the *category* stays an enum.

### 3.3 Setting and clearing a wait — the `status_note` mechanic

A wait is never set silently. It is **always** set by posting a `status_note`
message — one action, one transaction:

1. Staff on the work-item detail picks **"mark this job as waiting"**, chooses
   a `waiting_reason`, optionally a `blocked_on_role` / a specific
   `blocked_on_admin`, and types the human nuance ("customer's WHT cert
   missing — emailed 2026-05-17, no reply").
2. `postStatusNote()` (§2.5) does, atomically:
   - `INSERT work_item_messages` with `kind='status_note'`, the body, and
     `set_waiting_reason` / `set_blocked_role` mirrored.
   - `UPDATE work_items SET waiting_reason=…, blocked_on_role=…,
     blocked_on_admin=…`.
   - fire a notification to the blocked-on dept/person (§4.2).
3. The job now shows "รอ: เอกสาร — บล็อกที่ บัญชี" on the board, on the detail
   page, and in the blocked-on person's inbox.

**Clearing** is symmetric and **role-gated**: only the **blocked-on role**
(or `super`) may call `clearWaiting()` — because the person who *owns the
blocker* is the one who knows it is resolved. Clearing posts an "unblocked"
`status_note`, sets `waiting_reason=null`, and notifies the job's owner that
they can proceed. This is the structural cure for "รอใครเฟิม": the wait is
*visible*, *attributed*, and *only the right person can lift it*.

> **Anti-pattern guard.** A stage change (`current_stage`) is *not* a wait. A
> job advancing normally has `waiting_reason=null`. `waiting_reason` is *only*
> for "stuck, needs a named party to do a named thing". Keeping the two axes
> separate (§3.1) is what stops the board from drowning in false-red.

### 3.4 One timeline — chat + system events interleaved

Because `work_item_messages.kind` includes `'system'`, the **`work_items`
status trigger** (`0080`) writes a `kind='system'` message on every stage
change / assignment hop — and the `0081` actions write `'comment'` and
`'status_note'` rows. The thread is therefore **a single chronological
timeline**: "stage → packed" · "assigned to ภูม" · *human comment* · "waiting:
document" · *human comment* · "unblocked" · "stage → billed". Staff read one
panel and see *both* what the system did and what people said — exactly the
"see the work through our system" promise. No separate "activity log" tab.

> **Implementation note for the `0080` author.** The system-line write is a
> tiny addition: wherever the `work_items` trigger advances a stage or changes
> `assigned_to`, also `INSERT public.work_item_messages(work_item_id, kind,
> body)` with `kind='system'`. `0081` creates the table; if `0080` ships first
> the trigger can be amended in `0081` itself (a `CREATE OR REPLACE` of the
> trigger function). Either ordering works — `0081` depends on `0080`.

### 3.5 Closing a job, one by one

The owner's ask: *"closes jobs one-by-one"*. Closing a `work_item` is `0080`'s
mechanic (`closed_at`), fired when the domain entity reaches a terminal stage.
This layer adds two guards so a close is *clean*:

- **A job with `waiting_reason IS NOT NULL` should not silently close.** The
  close action warns ("this job is still marked รอ: <reason> — clear it
  first?"). A real close clears the wait.
- **Closing posts a final `kind='system'` message** ("job closed by <name>")
  so the thread has a definite end. The board's default view hides
  `closed_at IS NOT NULL` items; a "closed this week" filter brings them back
  (read-only thread).

---

## 4. Integration

### 4.1 With the work-board (`work_items`) — the pairing

This is the load-bearing integration. The chat **does not exist without
`work_items`**:

- **Keying:** `work_item_messages.work_item_id` FK → `work_items.id`. Every
  thread is a job; every job *is* a `work_item` (which itself indexes an
  order / container / invoice / declaration / ticket / refund / QA row).
- **The board reads the chat's two signals:** the board card (§5.1) shows
  (a) an unread-comment count and (b) the `waiting_reason` badge — both are
  cheap reads against the indexes in §2.2 / §2.3. The board's per-stage columns
  are unchanged; the chat just *decorates* the cards.
- **The board's filters extend by one axis:** `/admin/board?waiting=document`
  ("show every job stuck on a document"), `?waiting=disbursement`, etc. — a
  single indexed scan on `work_items_blocked_idx`.
- **No domain-table coupling.** Because the thread keys to `work_item_id` and
  `work_items` already abstracts the eight entity types, the chat needs **zero
  knowledge** of `service_orders` vs `freight_invoices` vs `cargo_containers`.
  When `0080` adds a ninth `entity_type`, the chat covers it for free.

### 4.2 With the notification system (`lib/notifications/`)

The chat **reuses the shipped `sendNotification()` pipeline** — it does *not*
build a second delivery system. But there is a real gap to close:

- **Today `notifications` is customer-only.** `sendNotification(profileId, …)`
  inserts a row the *recipient* reads via `notifications_select_own`
  (`auth.uid() = profile_id`). An **admin** *is* a `profiles` row, so
  `sendNotification(adminProfileId, …)` already works mechanically — and
  migration `0015` already added `notifications_admin_all` (admins may read +
  insert any notification). **So staff-targeted notifications need no new
  table** — only a new `NotifyCategory`.
- **Add one category + reference type** to `lib/notifications/types.ts` and the
  `0014` CHECK (a tiny `0081` `ALTER`):
  - `NotifyCategory` += `'work_chat'`.
  - `NotifyReferenceType` += `'work_item'` (so the deep-link is
    `/admin/board/<work_item_id>` or the work-item detail).
- **Three triggers fire a staff notification:**
  1. **`@mention`** — for each `work_item_message_mentions` row,
     `sendNotification(mentioned_admin_id, { category:'work_chat', title:'@you
     on <job>', body:<excerpt>, link_href:<work-item detail>,
     reference_type:'work_item', reference_id:<id> })`. Set
     `mentions.notified_at`.
  2. **`waiting_for` set** — when `postStatusNote()` blocks a job on a
     dept/person, notify `blocked_on_admin` (if a person was named) **or** every
     active admin in `blocked_on_role` (if only a dept). This is the
     "the job appears on your desk" mechanic — the cure for "accounting
     *notices*" (§1.1).
  3. **`waiting_for` cleared** — notify the job's `assigned_to` owner that they
     may proceed.
- **Delivery rides the existing rails.** `sendNotification()` already does
  in-app row + LINE-Messaging-API push + email fallback, gated by
  `LINE_PUSH_BYPASS` and the recipient's `notify_channels`
  ([ADR-0001](../decisions/0001-line-notify-replacement.md)). Staff get the
  *same* delivery customers get — including LINE push to the staffer's own LINE
  once channel tokens land. **Zero new delivery code.**
- **Internal vs customer-facing copy stays separate.** A `work_item_messages`
  row is *never* shown to a customer. If a job's progress should tell the
  customer something, that is a *deliberate, separate* `sendNotification(
  customerProfileId, …)` call from the domain action — not a side effect of an
  internal comment. The two channels never cross.

### 4.3 With the admin RBAC roles

- **Identity = `admins` + `is_admin()`** ([ADR-0002](../decisions/0002-admin-architecture.md)).
  `author_admin_id`, `blocked_on_admin`, `mentioned_admin_id` are all
  `profiles.id` of a row in `admins`. The thread's org-wide read is literally
  `using (public.is_admin())`.
- **`blocked_on_role` draws from the `admins.role` vocabulary** — and here this
  design has a **hard dependency on the RBAC gap**:
  `operating-system-analysis-2026-05-18.md` §7 documents that the
  `admins.role` CHECK is still the stale 4 values (`super, ops, accounting,
  sales_admin`), while `requireAdmin`'s `AdminRole` type already lists
  `warehouse, driver, interpreter`. **`blocked_on_role` is only as expressive
  as the role enum.** If a job is blocked on the docs team but `docs_admin`
  does not exist, the wait cannot name them.
  - **Phase IC-1 (minimal) ships against today's enum** — `blocked_on_role`
    accepts whatever values `admins.role` currently allows. It is *useful
    immediately*: most waits are `confirm` / `billing` / `disbursement` →
    `accounting`, `ops`, `super` — all of which exist today.
  - **The role-enum extension (§7 of the OS analysis: add `cs_admin`,
    `docs_admin`, `logistics_admin`, `warehouse`, `driver`, `marketing`) makes
    `blocked_on_role` fully expressive.** This design *does not* re-spec that
    work — it consumes it. Note the dependency; do not block IC-1 on it.
- **`@mention` is org-wide.** Any staffer can mention any other — the chat is
  the cross-department layer, so mention scope is not role-limited. (A future
  refinement could rank the `@`-autocomplete by the job's relevant departments;
  not IC-1.)
- **No new role is needed for the chat itself.** Reading + posting is "any
  active admin". Only `clearWaiting` is role-gated, and it gates on the
  *job's `blocked_on_role`*, computed per-job — not a static role.

### 4.4 With the shipment / container model

The chat reaches the container/shipment spine **transitively, through
`work_items`** — never by its own FK:

- A `work_item` with `entity_type='freight_shipment'` (or
  `'customs_declaration'`, etc.) already points at the domain row; that row
  links to a `cargo_container` per
  [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md).
- So a thread on a shipment work-item is, in effect, a thread *about that
  shipment in its container* — and the work-item / shipment detail page (§5.2)
  can show the container context (mode / ETA / `close_at`) **above** the
  thread, because it already loads it.
- **The CBM-dispute case (`cargo-ops-forensics` D1) becomes a chat thread:**
  warehouse posts a `status_note` on the container's work-item —
  `waiting_reason='confirm'`, body *"manifest 21.28 vs API 16.79 — which do we
  bill? @<accounting-lead>"* — accounting replies, decides, clears the wait.
  The dispute that legacy ran in LINE now lives *on the container's job*,
  searchable, attributed, with the container code one click away.
- **Deliberately no direct `container_id` on the message table.** Adding one
  would fork the model ("is this thread keyed to the work-item or the
  container?"). One key — `work_item_id` — keeps it clean. A container with
  several work-items (e.g. an arrival job + a billing job) correctly has
  several threads, each scoped to its own job.

---

## 5. The UI surface — where staff see it

Three surfaces, all reading the same `work_item_messages` + `work_items`
waiting-for block.

### 5.1 On `/admin/board` — the card decoration

The cross-department board (`operating-system-analysis-2026-05-18.md` §1.4 (b))
is columns-of-stages, card-per-`work_item`. The chat adds **two badges** to
each card — no new screen:

```
┌─ work_item card ──────────────────────────┐
│ 🚚 GZE260422-1 · container arrival        │
│ stage: awaiting_billing                   │
│ owner: 👤 ภูม (accounting)                │   ← from work_items (0080)
│ 🔴 รอ: เอกสาร · บล็อกที่ บัญชี            │   ← waiting_reason badge (0081)
│ 💬 3                                       │   ← unread-comment count
└────────────────────────────────────────────┘
```

- The **`รอ:` badge** is the headline: colour-coded by `waiting_reason`, shown
  only when `waiting_reason IS NOT NULL`. A non-blocked job has no badge — the
  board stays calm and the red genuinely means "stuck".
- The **`💬` count** is unread comments for the viewing staffer (messages newer
  than their last `markThreadSeen` for that job).
- **Board filter** gains the waiting axis: `?waiting=document`,
  `?waiting=disbursement`, `?blocked_role=accounting` — "show me everything my
  department is holding up". Backed by `work_items_blocked_idx` (§2.3).
- Clicking the card → the work-item detail (§5.2) with the thread open.

### 5.2 On the work-item / shipment detail — the thread panel

The primary surface. The work-item detail page (and the shipment / order /
invoice detail it mirrors) gets a **thread panel**, right-hand side or below
the domain data:

```
┌─ Order O260513-12 · domain data ─┐ ┌─ 💬 Thread ─────────────────┐
│ customer · items · amounts · …   │ │ ▸ [system] stage → packed   │
│ container: GZE260422-1 (truck)   │ │ ▸ ภูม: rate looks doubled,  │
│ ETA 2026-05-22 · close 05-20     │ │   @ก๊อต can you confirm?     │
│                                  │ │ ▸ [status_note · 🔴รอ:เฟิม] │
│ [advance stage] [assign] [close] │ │   ก๊อต please verify B-rate │
│                                  │ │ ▸ ก๊อต: confirmed, 12.5 ✓   │
│                                  │ │ ▸ [system · ✅ unblocked]   │
│                                  │ │ ────────────────────────── │
│                                  │ │ [type a message… @mention] │
│                                  │ │ [⚑ mark waiting ▾]          │
│                                  │ └─────────────────────────────┘
└──────────────────────────────────┘
```

- **One interleaved timeline** — `comment`, `system`, `status_note` rows in
  `created_at` order (§3.4); `status_note` and `system` rows rendered with an
  icon + emphasis so the eye finds state changes.
- **Composer** — a text box with `@`-autocomplete over active `admins`
  (resolves to `work_item_message_mentions` rows). A **"⚑ mark waiting"**
  control opens the `waiting_reason` picker + optional dept/person → calls
  `postStatusNote()` (§3.3). When a wait is active, the panel header shows it
  and offers **"✅ mark unblocked"** to the blocked-on role.
- **The same panel is embedded on the domain detail pages** — `/admin/orders`,
  `/admin/freight/shipments/[id]`, `/admin/warehouse/containers/[code]`,
  `/admin/contact-messages`, etc. Each resolves its `work_item_id` from the
  entity and renders the identical `<WorkItemThread workItemId=… />`
  component. Staff discuss the job *where they already work*; they are not sent
  to a separate chat app.

### 5.3 The per-role inbox — "waiting on me"

`operating-system-analysis-2026-05-18.md` §1.4 (b) calls for a per-role landing
("your N open items"). The chat layer contributes a **second tab** to that
landing — the "needs me *now*" pull that `assigned_to` alone cannot give:

```
/admin  →  "My work"
  ├─ Tab: Assigned to me        (work_items.assigned_to = me — from 0080)
  └─ Tab: Waiting on me               ← this layer
       ├─ 🔴 Jobs blocked on my dept   (work_items.blocked_on_role = my role
       │      AND waiting_reason IS NOT NULL)         → I must unblock these
       ├─ 🔴 Jobs blocked on me        (work_items.blocked_on_admin = me)
       └─ 💬 Mentions                  (work_item_message_mentions where
              mentioned_admin_id = me AND seen_at IS NULL)
```

- **"Blocked on my dept / me"** is the operating cure for "รอใครเฟิม": the
  accountant logs in and *sees* "3 jobs waiting on accounting for a
  disbursement" — without anyone phoning. Each row links to §5.2.
- **"Mentions"** is the lightweight "someone needs my eyes here" pull —
  distinct from a formal block.
- Each row deep-links to the work-item thread; acting there
  (`clearWaiting` / replying) drains the inbox.
- This tab is **a pure query** over the §2 indexes — no new table, no
  materialised view. It is the highest-value-per-line screen in the design.

### 5.4 What this design deliberately does NOT build

- **No global staff chat / firehose / DM.** This is a *per-job* chat. There is
  no "general" channel and no direct messages — those re-create LINE's
  unstructured soup. Cross-job talk that matters becomes an `@mention` on the
  relevant job.
- **No customer-facing surface.** Covered — §2.4, §4.2.
- **No real-time typing indicators / presence** in IC-1. A Supabase Realtime
  subscription on the thread (so new messages appear without refresh) is a
  *nice* IC-2 add, not minimal-viable — polling on panel open is fine first.

---

## 6. Build phases

Sequenced by the revenue lens (*"does this get cargo customers faster?"* —
[`../../AGENTS.md`](../../AGENTS.md)). The relay failure *directly* freezes
revenue (a disputed bill, an un-cleared WHT) — so the minimal phase is genuinely
P1, right behind the `work_items` board it rides on.

### Phase IC-1 — minimal-viable (the relay-failure cure)

**Hard prerequisite:** `0080_work_items` + `/admin/board` merged (the parallel
build). IC-1 *cannot* land before the spine.

| # | Deliverable | Notes |
|---|---|---|
| IC-1.1 | Migration `0081_work_item_messages.sql` — `work_item_messages` + `work_item_message_mentions` tables + the three `waiting_for` columns on `work_items` + RLS (§2) | additive; depends on `0080` |
| IC-1.2 | `0081` also: `+'work_chat'` to `notifications.category` CHECK; `+'work_item'` to `reference_type` CHECK; mirror both into `lib/notifications/types.ts` | tiny ALTER + type edit |
| IC-1.3 | `actions/admin/work-item-messages.ts` — `postMessage` · `postStatusNote` · `clearWaiting` · `softDeleteMessage` · `markThreadSeen` (§2.5) | service-role; sibling of `work-items.ts` |
| IC-1.4 | `<WorkItemThread>` component — interleaved timeline + composer + `@`-autocomplete + "⚑ mark waiting" / "✅ unblock" (§5.2) | one component, embedded everywhere |
| IC-1.5 | Embed `<WorkItemThread>` on the work-item detail **and** on `/admin/warehouse/containers/[code]`, `/admin/freight/shipments/[id]`, `/admin/orders/*`, `/admin/contact-messages` | resolve `work_item_id` per entity |
| IC-1.6 | `/admin/board` card badges — `รอ:` `waiting_reason` badge + `💬` unread count + `?waiting=` / `?blocked_role=` filters (§5.1) | decorates existing cards |
| IC-1.7 | `/admin` "Waiting on me" tab — blocked-on-dept · blocked-on-me · unseen mentions (§5.3) | pure query |
| IC-1.8 | `@mention` + waiting-set + waiting-clear notifications via existing `sendNotification()` (§4.2) | reuses shipped pipeline |
| IC-1.9 | i18n th/en for all new strings; the `waiting_reason` vocabulary gets a TH label map (§3.2) | `pnpm audit:i18n` gate |

**IC-1 delivers the owner's ask in full:** every job has a thread, a visible
owner, a visible blocked-on dept/person, and a visible waiting-for reason; staff
discuss job-by-job; the "waiting on me" inbox ends the chase; jobs close one by
one. Effort: **M** (one migration, one action file, one component embedded in
~5 places, one inbox tab) — small because it *rides* the board and the
notification rails rather than rebuilding them.

### Phase IC-2 — depth (post-launch polish)

| # | Deliverable | Why later |
|---|---|---|
| IC-2.1 | **Supabase Realtime** on the thread — messages + badge counts update live, no refresh | quality-of-life; polling works first |
| IC-2.2 | **File / image attach** on a message (reuse the `member-docs` private bucket pattern) — attach a slip, a manifest, a WHT cert right in the thread | useful, not blocking; needs a storage-RLS pass |
| IC-2.3 | **Reactions / ack** (a lightweight 👍 so "seen, agreed" needs no message) | nicety |
| IC-2.4 | **Saved board views per role** ("docs: everything `waiting=document`") | depends on the §7 role-enum extension landing |
| IC-2.5 | **Thread digest in the daily email** — "5 jobs still waiting on you" rolled into the existing notification digest | extends the shipped digest cron |
| IC-2.6 | **`@`-autocomplete ranked by the job's relevant departments** | refinement of IC-1.4 |
| IC-2.7 | **SLA timer on a wait** — `waiting_since` age + escalation when a wait sits > N days (the §1.2 "no SLA signal" gap) | a genuine feature; pairs with the board's SLA work |

### Phase IC-3 — reach (later, optional)

| # | Deliverable | Why last |
|---|---|---|
| IC-3.1 | **LINE-bridge for staff** — a staffer replies to a `work_chat` LINE push and it lands back as a `work_item_messages` row (a staff-side mirror of the §5 of the OS analysis omni-channel idea) | needs the LINE Messaging API webhook harness; real value but real cost |
| IC-3.2 | **Customer-visible "job note"** — a deliberate flag on a `status_note` that *also* emits a curated customer notification (tighten the §4.2 boundary into a one-click bridge, still author-controlled) | only after IC-1 proves the internal model |

---

## 7. Risks & guard-rails

| Risk | Guard |
|---|---|
| **Chat becomes the new LINE soup** — staff post chit-chat, the signal drowns | The chat is *per-job only* — no general channel, no DM (§5.4). Every message is filed under a `work_item`. The `waiting_reason` enum (not free text) keeps the *why* machine-readable. |
| **`waiting_reason` false-red** — staff mark every in-progress job as "waiting" | §3.1 / §3.3 anti-pattern guard: a *stage change* is not a wait; `waiting_reason=null` is the normal state; only "stuck on a named party" sets it. Train on the eight categories. |
| **Depends on a spine still being built** (`0080_work_items`) | IC-1 is explicitly gated on `0080` merging (§6). This doc is the *design*; scheduling waits for the spine. The `waiting_for` columns are an additive `ALTER` on `work_items`, so `0081` cannot conflict with `0080`. |
| **`blocked_on_role` under-expressive** until the role enum is extended | §4.3: IC-1 ships against today's enum (useful immediately for `accounting`/`ops`/`super` waits); full expressiveness arrives with the `operating-system-analysis-2026-05-18.md` §7 RBAC extension — a *consumed* dependency, not a re-spec, and not an IC-1 blocker. |
| **Notification volume** — every mention + every wait pings | Rides the existing `notify_channels` per-user prefs ([ADR-0001](../decisions/0001-line-notify-replacement.md)); IC-2.5 rolls low-urgency ones into the daily digest. |
| **Customer data leak via an internal thread** | No customer RLS policy on `work_item_messages` (§2.4); customer-facing copy is always a separate, deliberate `sendNotification()` (§4.2). |

---

## 8. Cross-references

- 🧭 The work-board spine this rides on → [`operating-system-analysis-2026-05-18.md`](operating-system-analysis-2026-05-18.md) §1.4 (`work_items`, `/admin/board`) + §7 (RBAC role enum — the `blocked_on_role` dependency)
- 🔬 The legacy relay failure decoded → [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §4 (A2/A3/A6/C3) · [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md)
- 🔔 Notification delivery rails reused → [ADR-0001](../decisions/0001-line-notify-replacement.md) · `lib/notifications/` · migration `0014`
- 🔐 Admin identity + `is_admin()` → [ADR-0002](../decisions/0002-admin-architecture.md) · migration `0015`
- 🔁 State-change audit posture → [ADR-0014](../decisions/0014-customer-self-service-state-transitions.md)
- 🏗 Container / shipment spine (reached transitively) → [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- 👷 The 14 staff-role workspaces (where the per-role inbox lands) → [`../briefs/ops-roles.md`](../briefs/ops-roles.md)
- 📋 Scheduling → [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) Phase U4 (supervisory layer — the work-board's home; schedule IC-1 alongside) · [`../PORT_PLAN.md`](../PORT_PLAN.md)

**End — `internal-chat-system-2026-05-18.md`.** Spine: a `work_item_messages`
thread keyed to the `work_items` board + a `waiting_for` block
(`blocked_on_role` · `blocked_on_admin` · `waiting_reason`) on the job itself.
It pairs with — never replaces — the cross-department work-board: the board
shows *state*, this layer adds the *talk* and the *why-stuck*. Minimal-viable
(IC-1): thread + `@mention` + `waiting_for` + a detail-page thread panel + a
board badge + a "waiting on me" inbox — the structural cure for "ของอยู่ไหน /
รอใครเฟิม".
