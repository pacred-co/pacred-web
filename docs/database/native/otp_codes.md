# `otp_codes`

> 🆕 Pacred-native · referenced **18×** in code

Pacred-native OTP (sha256+pepper, TTL 5min).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `attempts` |  |  |
| `code_hash` |  |  |
| `created_at` |  |  |
| `expires_at` |  |  |
| `id` |  |  |
| `phone` |  |  |
| `purpose` |  |  |
| `used` | ✏️ |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/otp.ts`
- `lib/auth/otp.test.ts`
- …and more (18 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
