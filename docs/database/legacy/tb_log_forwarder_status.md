# `tb_log_forwarder_status`

> ✅ canonical / live · **lowercase** columns · referenced **2×** in code

Forwarder status-change audit log.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `fdatechange` |  |  |
| `fid` |  |  |
| `fstatusnew` |  |  |
| `fstatusold` |  |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/forwarders.ts`
- `lib/notifications/status-flip-helper.ts`

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
