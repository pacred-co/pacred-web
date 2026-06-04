# `tb_rate_custom_cbm`

> ✅ canonical / live · **lowercase** columns · referenced **13×** in code

Per-customer custom rate (CBM) + history.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `adminidupdate` | ✏️ |  |
| `id` |  |  |
| `rcbm` | ✏️ |  |
| `rproductstype` |  |  |
| `rtransporttype` |  |  |
| `sourcewarehouse` |  |  |
| `userid` |  |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/customer-rate.ts`
- `actions/admin/tb-settings.ts`
- `actions/admin/quote-comparison.ts`
- `actions/admin/forwarders-edit.ts`
- `lib/legacy/pcs-chrome.ts`
- …and more (13 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
