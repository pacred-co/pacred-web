# `line_webhook_events`

> 🆕 Pacred-native · referenced **2×** in code

LINE webhook event log (our 0131 schema, currently unused — Podeng_* is canonical).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `error_message` | ✏️ |  |
| `id` |  |  |
| `processed_at` | ✏️ |  |
| `processed_status` | ✏️ |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `app/api/webhooks/line/route.ts`
- …and more (2 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
