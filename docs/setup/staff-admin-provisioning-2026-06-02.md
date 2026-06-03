# 🧑‍💼 Staff/Admin provisioning + settings overhaul — 2026-06-02 (owner directive)

> Owner (พี่ป๊อป) directive for morning delivery. **Clear ALL legacy admins**, create the
> roster below, wire sales-auto-assign on register + customer-reset-to-central + user CRUD.
> Everyone = `super` for now (role-scoping = later). Default password `123456` (users change after).
> Credentials (Supabase/S3/DB) owner-provided live in `.env.local` (gitignored) — NEVER in this doc/repo.

## The new admin roster (15) — all `super`, password `123456`
| username | person | role (future scope · all `super` now) | phone |
|---|---|---|---|
| `admin_pop` | พี่ป๊อป | OWNER / CEO | 0948782006 |
| `admin_dev` | เดฟ | ทุกอย่าง (lead) | 0991921177 |
| `admin_pond` | ปอน | การตลาด · data-analysis · frontend | 0958612835 |
| `admin_got` | กอต | super-senior devops · fullstack | 0944798231 |
| `admin_poom` | ภูมิ | การตลาด + backend | TBD (find on website) |
| `admin_win` | วิน | docs · cs · warehouse · driver · express · ผจก | 0627020448 (ส่วนตัว 0928362555) |
| `admin_nat` | พี่แนท | บัญชี · hr · cs · doc · ภาพรวม (co-owner) | 0941178515 |
| `admin_vam` | แวม | HR (กฎระเบียบ · สรรหา · อบรม · ใบเตือน) | TBD |
| `admin_web` | เว็บ | pricing · สั่งซื้อจีน · เฟรทจีน · โกดังจีน | TBD |
| `admin_jane` | เจน | บัญชีรายจ่าย | TBD |
| `admin_aom` | ออม | บัญชีรายรับ | TBD |
| `admin_may` | เมย์ | **หัวหน้า SALES** (รับลูกค้าใหม่ + รับงาน) | 0661253006 |
| `admin_pee` | พี | **SALES** (รับลูกค้าใหม่ + รับงาน) | 0617799299 |
| `admin_ploy` | พลอย | **CS** (ประสานงาน · แจ้งสถานะ · ถือลูกค้าได้) | TBD (website) |
| `admin_gring` | กริ้ง | Docs (ใบขน · พิกัด · invoice · packing · Form E · DO · BL) | TBD |

TBD phones → find on the website data (`components/seo/site.ts` / `docs/pacred-info.md` / team page).

## Settings flow (the overhaul — for morning)
1. **Clear ALL legacy admins** — `tb_admin` + old rebuilt `admins` rows (e.g. admin_admin, admin_tam, admin_but, admin_ploy(old), admin_mew, admin_admin_pee — all of them).
2. **Create the 15 above** — must LOGIN (`admin_xxx` / `123456`), ยศ `super`. (login + sales-attribution must use ONE unified admin SOT — no death.)
3. **Sales auto-assign on register** — round-robin among SALES reps = พี (`admin_pee`) + เมย์ (`admin_may`); CS พลอย (`admin_ploy`) can hold customers but assigned later. + a **central/default sales** fallback.
4. **Register-success popup** — "สมัครสำเร็จ · user `PR...` · เซลที่ดูแล Sales [name] · เบอร์ [phone] · Sale จะติดต่อกลับโดยไวที่สุด."
5. **Reset ALL existing customers** → central/default sales. Sales re-assigns later; the customer-profile sales-rep change must update everywhere.
6. **User CRUD** — add/remove staff · admin · customer · partner.
7. **No death** — every function connected end-to-end across the whole system.
8. **No work-type segregation** — everyone handles รถ/เรือ/แอร์/เฟรท/คาร์โก้/นำเข้า/ส่งออก.
