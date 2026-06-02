# 🗄 Pacred Database — Schema Documentation

> **Source of truth = the running code, not the migration files.** This doc set
> was built by scanning every `.from("table")` / `.select` / `.insert` /
> `.update` call across `actions/`, `lib/`, and `app/` — *not* by reading
> `supabase/migrations/*.sql`. The migrations (especially `0081_pcs_legacy_schema.sql`)
> are known to **misrepresent column casing** — they show lowercase, but the
> legacy tables `tb_users` / `tb_admin` / `tb_co` are actually **camelCase on
> prod** (`userID`, `adminName`, `coID`). What the code reads/writes is what
> production actually has. See [§ Casing landmine](#-casing-landmine) below.

Last generated: **2026-06-02** · against `dave-pacred` @ `bb09a8b0`.

---

## 📑 Index

**One file per table**, split into two folders:

| Folder | Contents |
|---|---|
| [`legacy/`](legacy/README.md) | The **84 legacy `tb_*` tables** — the canonical data (8,898 customers, real orders/money). One `.md` per table. |
| [`native/`](native/README.md) | The **115 Pacred-native tables** — `freight_*`, `customs_*`, `momo_*`, LINE, admin/identity (`admins`, `profiles`, `partners`), CRM, accounting, commission, and rebuilt twins. One `.md` per table. |

Each table file has: a status badge (✅ live / 🆕 native / 💀 rebuilt twin), purpose,
casing note, a columns table (✏️ marks code-written columns), and the files that
reference it. This README is the overview: the two-schema model, the full
inventory, the spine relationship map, and the landmines.

---

## 🌍 Two coexisting schema worlds

Pacred is a **D1 faithful port** of the legacy PCS Cargo PHP system. Two table
families live side-by-side in the same Postgres/Supabase database:

### 1. Legacy `tb_*` tables — **CANONICAL, has the real data**
Ported verbatim from the legacy MySQL `pcsc_main` (migrations `0081`-`0083`).
~8,898 customers, years of orders, the live wallet ledger, the container flow.
**Every customer-portal + admin read of live data hits these.** Naming is
MySQL-era: lowercase snake-ish (`tb_forwarder`, `fstatus`, `wallettotal`) —
*except* the three big identity tables which are camelCase (see landmine below).

### 2. Rebuilt / Pacred-native tables — **mostly empty, or net-new features**
Two sub-groups:
- **Rebuilt twins of legacy tables** (`profiles`, `orders`, `forwarders`,
  `wallet`, `wallet_transactions`, `service_orders`, `yuan_payments`, …) —
  Pacred's clean-schema reimagining. **Most are empty in production** — they
  were never backfilled. ⚠️ See [§ Dead-write traps](#-dead-write-traps).
- **Net-new Pacred features** with no legacy equivalent — the **freight** stack
  (`freight_quotes`/`freight_shipments`/`freight_invoices`), **customs**
  (`customs_declarations`), the **MOMO** partner-sync isolated tables (`momo_*`),
  the unified-admin tables (`admins` + `admin_contact_extras`), CRM/work-board
  (`work_items`), broadcasts, partners directory, etc. These are real and live.

> **Rule of thumb:** if a stat card shows ฿0 or 0 rows, check which table the
> query hit — a rebuilt twin was never backfilled; the populated `tb_*` is
> canonical. (CLAUDE_TECHNICAL.md · AGENTS.md §0e)

---

## ⚠️ Casing landmine

`tsc` cannot verify Supabase column-name strings, so column casing bugs only
surface at runtime against prod. The hard-won rule (from `docs/learnings/php-port-patterns.md`):

| Table | Casing on prod | Example columns |
|---|---|---|
| `tb_users` | **camelCase** | `userID`, `userName`, `userTel`, `userPass`, `adminIDSale`, `wallettotal` |
| `tb_admin` | **camelCase** | `adminID`, `adminName`, `adminStatusSale`, `adminType` |
| `tb_co` | **camelCase** | `coID`, … |
| `tb_cnt` family | **camelCase** | `cntAmount`, `cntStatus`, `fCabinetNumber` |
| **all other `tb_*`** | **lowercase** | `fstatus`, `ftotalprice`, `paystatus`, `wallettotal` |
| Pacred-native | **snake_case** | `profile_id`, `member_code`, `created_at` |

> Migration file `0081` shows everything lowercase — **it lies.** The code is right.
> Many actions cast through `as unknown as T[]` (235 sites) precisely because the
> camelCase columns don't match generated lowercase types. DB tests that hit
> real prod are the only safety net for column-name correctness.

---

## 🩻 Dead-write traps (AGENTS.md §0e)

The most dangerous bug class in this codebase: a reachable admin edit wired to a
**0-row rebuilt twin** while the real consumers read the legacy `tb_*` twin →
staff edit, green toast, **nothing changes**. Before trusting any write surface:
grep the table the WRITE targets vs the table the READER reads — if they differ
(write→rebuilt, read→`tb_*`), it's a dead-write trap. A rebuilt table with 0 rows
is almost always the dead twin.

Known live↔dead twin pairs (the **live** one is what new code should use):

| Concern | ✅ LIVE (canonical) | 💀 dead/rebuilt twin |
|---|---|---|
| Wallet ledger | `tb_wallet` + `tb_wallet_hs` | `wallet` + `wallet_transactions` |
| Yuan transfer | `actions/admin/yuan-payments.ts` → `tb_payment` | `yuan_payments` table / `yuan-payments-tb.ts` |
| Shop orders | `tb_header_order` | `orders` · `service_orders` |
| Customer identity | `tb_users` (data) + `profiles` (auth bridge) | — |
| Forwarder/import | `tb_forwarder` | `forwarders` |

---

## 🦴 The spine — how the core tables relate

```
                         tb_users  (PR<n> customer · userID is the key everywhere)
                            │ userid
        ┌───────────────────┼────────────────────────┬──────────────────┐
        │                    │                         │                  │
   tb_forwarder        tb_header_order            tb_payment          tb_wallet
   (ฝากนำเข้า /        (ฝากสั่งซื้อ /            (ฝากโอน /          (balance:
    import · the       shop order ·              yuan transfer)      userid → wallettotal)
    47k-row spine)     hno is the key)               │                  │
        │                    │                         │                  │
        │ fid/idorco         │ hno                     └──────────┬───────┘
        ▼                    ▼                                    ▼
   tb_forwarder_item   tb_header_order items              tb_wallet_hs
   tb_cnt / tb_cnt_item  (cart lines)                     (every credit/debit
   (container ↔ order)                                     ledger row · type-coded)
        │
        ▼
   tb_receipt / tb_receipt_item   ← issued on payment-land (mark-paid)
   tb_forwarder_tax_invoice       ← forwarder tax-invoice (World-B)

   tb_corporate  ← juristic-customer profile (linked by userid)
   tb_admin / admins  ← staff (sales-attribution SOT = tb_admin via legacy_admin_id;
                         login SOT = admins). tb_users.adminIDSale = assigned sales rep.
   tb_cash_back / tb_credit  ← cashback ledger + credit line (offset against wallet)
```

**Money flow status codes** (the heart of the business — see [`legacy/tb_forwarder.md`](legacy/tb_forwarder.md) for the full flow):
- `tb_forwarder.fstatus`: 1=draft … **5=รอชำระเงิน (AR)** → **6=ชำระแล้ว** … 7=ส่งแล้ว
- `tb_wallet_hs.type`: coded ledger entry type (deposit / debit / cashback / withdraw …)
- `paystatus`: '0'=unpaid '1'=paid (on most money tables)

---

## 📋 Full table inventory

The complete, per-table inventory (sorted by code-reference count, with purpose)
lives in the two folder indexes — **one file per table:**

- **[`legacy/README.md`](legacy/README.md)** — all **84 legacy `tb_*`** tables
- **[`native/README.md`](native/README.md)** — all **115 Pacred-native** tables (freight/customs/momo/admin/CRM/accounting + rebuilt twins)

### Top tables by load (the ones to know first)

| Table | refs | What it is |
|---|--:|---|
| [`tb_forwarder`](legacy/tb_forwarder.md) | 267 | **ฝากนำเข้า / import orders** — the ~47k-row revenue spine |
| [`tb_users`](legacy/tb_users.md) | 218 | **Customers** (PR<n>) — identity, sales-rep, balance/credit mirror |
| [`tb_wallet_hs`](legacy/tb_wallet_hs.md) | 137 | **Wallet ledger** — every credit/debit (type-coded) |
| [`profiles`](native/profiles.md) | 122 | Supabase-auth profile (bridges to `tb_users`) |
| [`tb_header_order`](legacy/tb_header_order.md) | 116 | **ฝากสั่งซื้อ / shop orders** (`hno`) |
| [`tb_wallet`](legacy/tb_wallet.md) | 100 | **Wallet balance** (`userid → wallettotal`) |
| [`tb_corporate`](legacy/tb_corporate.md) | 60 | **Juristic customers** (SOT, ADR-0021) |
| [`tb_payment`](legacy/tb_payment.md) | 59 | **ฝากโอน / yuan transfer** |
| [`admins`](native/admins.md) | 58 | **Login + RBAC SOT** (PM-6 unified-admin) |
| [`tb_admin`](legacy/tb_admin.md) | 49 | **Sales-attribution SOT** (bridged to `admins`) |

---

## 🔬 How these docs were derived (methodology + caveats)

1. Scanned all `.from("…")` literals in `actions/`, `lib/`, `app/` → 199 tables.
2. For each table, parsed the chained `.select("a,b")`, `.eq/.order/.gte(…)`
   filter columns, and `.insert/.update({…})` object keys within the query
   statement window.
3. **WRITE columns are high-confidence** (literal object keys). **READ columns
   may contain bleed** from PostgREST embedded selects or adjacent queries —
   treated as "columns observed near this table," not a guaranteed exact schema.
4. Business meaning cross-referenced against `CLAUDE.md` / ADRs / `docs/learnings/`.

**Caveats:**
- Not every column is captured — only those the code touches. A legacy table may
  have columns no Pacred code reads yet.
- `.from(variableName)` dynamic references aren't counted (rare).
- This is a **living doc** — regenerate after large schema/feature changes.
