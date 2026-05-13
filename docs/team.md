# 👥 Pacred — Team & Permissions

> **CANONICAL** — single source of truth for roles, branches, and merge policy.
> ทุกไฟล์ MD ที่กล่าวถึง team/role/branch ต้อง link มาที่นี่ ห้าม duplicate

Last updated: 2026-05-13

---

## 1. Roles & Responsibilities

| คน | บทบาท | สโคปงาน | สิทธิ์ main |
|---|---|---|---|
| **ก๊อต** (got) | Senior Advisor / Co-Lead | ที่ปรึกษา · code review · architectural decisions · backup merger | ✅ Push to main |
| **เดฟ** (dave) | **Project Lead** | คุมงาน · จ่ายงาน · run sprint · merge to main · infrastructure · integrations · coordination | ✅ Push to main |
| **ปอน** (podeng) | Frontend & SEO Specialist | **100% หน้าบ้าน** — landing pages ทุก service · marketing · SEO · acquisition funnel · i18n · mobile UX · Lighthouse scores | ❌ Push only to `podeng` branch |
| **ภูม** (Poom) | Backend & Cargo Port Specialist | **100% หลังบ้าน** — auth/customer portal/admin · เชื่อม frontend ↔ customer backend ↔ admin backend · port PHP cargo 100% (phase 1) · DPX ERP upgrade (phase 2) | ❌ Push only to `Poom` branch |

### Phase mapping ของภูม
- **Phase 1 (ปัจจุบัน):** Port PHP cargo system → Pacred Next.js ให้ครบ 100% (auth, profile, wallet, service-order, service-import, service-payment, sales, admin ops)
- **Phase 2 (หลัง phase 1 stable):** DPX ERP full upgrade — ขยายเกินขอบเขต cargo เดิม

### Scope boundaries
- ✋ **ปอน ไม่แก้:** `actions/`, `lib/`, `app/[locale]/(auth|protected|admin)/`, `supabase/migrations/`, `app/api/`
- ✋ **ภูม ไม่แก้:** `app/[locale]/(public)/`, `components/sections/`, `components/booking/`, `components/knowledge/`, `messages/*.json` (i18n keys)
- ✋ **ทั้งคู่ไม่แก้:** `CLAUDE.md`, `docs/team.md`, `docs/conventions.md`, `docs/env.md`, `docs/PORT_PLAN.md`, `package.json`, `.github/`, `next.config.ts`, `eslint.config.mjs`, `proxy.ts`, `vercel.json` (lead-only)

ถ้าจำเป็นต้องข้ามขอบเขต — ขออนุญาตเดฟ/ก๊อตก่อน

---

## 2. Branch policy

| Branch | Owner | Purpose |
|---|---|---|
| `main` | เดฟ + ก๊อต (only) | Production-ready. Protected. Need approval from lead. |
| `dave` | เดฟ | Lead's working branch — consolidation point ก่อน merge เข้า main |
| `podeng` | ปอน | ปอน's working branch |
| `Poom` | ภูม | ภูม's working branch |
| `claude/*` | (auto) | Claude Code session worktrees — auto-cleaned, don't push |

**กฎทอง:**
1. ปอน + ภูม commit/push **เฉพาะ branch ตัวเอง** (`podeng` / `Poom`) — ห้าม push เข้า main หรือ dave
2. เมื่อ feature/phase เสร็จ → push ขึ้น branch ตัวเอง → แจ้งเดฟ/ก๊อตให้ review
3. เดฟ/ก๊อต merge งานทุกคนเข้า dave ก่อน → verify lint + build → push เข้า main
4. ห้าม `--force` push ทุก branch ยกเว้น branch ของตัวเองและรู้ว่าทำอะไรอยู่
5. ห้าม `git reset --hard` หรือลบ commit เพื่อนคนอื่น

---

## 3. Daily workflow

### ทุกคน (ปอน/ภูม/เดฟ) — ก่อนเริ่มงาน

```bash
# Step 1: อัพเดท main ก่อน
git checkout main
git pull origin main

# Step 2: กลับ branch ตัวเอง + merge main เข้ามา
git checkout <my-branch>          # dave / podeng / Poom
git status                        # ต้องสะอาด — ถ้ามีไฟล์ค้างให้ commit/stash ก่อน
git pull origin <my-branch>       # ดึง branch ตัวเองล่าสุด
git merge main                    # รวม main เข้ามา
git push origin <my-branch>       # อัพ branch ตัวเอง
```

→ ทำไมแยก 2 ขั้น? จะได้เห็นชัดว่า main มีอะไรใหม่ก่อน merge เข้า branch ตัวเอง

**แนะนำ:** sync ทุกเช้าก่อนเริ่มงาน หรืออย่างน้อย 1 ครั้ง/วัน

### ตอนทำงาน

- Commit เป็นระยะ (อย่ารอเย็น) — pattern: `<type>(<scope>): <message>` (ดู [`conventions.md`](conventions.md))
- ทำงานเสร็จ feature → push ขึ้น branch ตัวเอง
- แจ้งเดฟ/ก๊อตให้ review (LINE/Slack/PR comment)

### ตอนเดฟ/ก๊อต merge เข้า main

```bash
# จาก dave branch (lead working tree)
git checkout dave
git pull origin dave

# Merge งานคนอื่นเข้า dave (ถ้ามี)
git fetch origin
git merge origin/podeng   # ถ้ามีงาน ปอน ใหม่
git merge origin/Poom     # ถ้ามีงาน ภูม ใหม่

# Verify
pnpm install --frozen-lockfile
pnpm lint
pnpm build

# ถ้า pass — push dave + merge เข้า main
git push origin dave
git checkout main
git pull origin main
git merge dave
git push origin main
```

---

## 4. Pull files from teammate's branch (without merging via main)

ถ้าจะดึงไฟล์จากเพื่อนก่อนเดฟจะ merge เข้า main:

```bash
git status                           # งานตัวเองต้อง clean (commit/stash ก่อน)
git fetch origin
git checkout <my-branch>
git merge origin/<teammate-branch>   # เช่น origin/dave (ปลอดภัยสุด เพราะ dave มีของทุกคน)
git push origin <my-branch>
```

**กฎ:** ถ้าเจอ conflict → หยุด ถามเดฟ/ก๊อตก่อน อย่าแก้เอง

---

## 5. Code Review & Merge to main

### Workflow
1. ปอน/ภูม push branch ตัวเอง
2. แจ้งเดฟ/ก๊อต (ระบุ feature + acceptance ที่ทำ)
3. เดฟ/ก๊อต pull งานเข้า dave → review code + test
4. ถ้าผ่าน → merge เข้า main
5. ถ้าไม่ผ่าน → comment + ส่งกลับให้แก้บน branch ตัวเอง

### Pre-merge checklist (เดฟ/ก๊อตเช็คก่อน merge)
- [ ] `pnpm install --frozen-lockfile` succeeds
- [ ] `pnpm lint` clean (0 errors, 0 warnings)
- [ ] `pnpm build` succeeds
- [ ] (เมื่อมี) `pnpm test` passes
- [ ] Manual smoke test ใน `pnpm dev` ของ feature ใหม่
- [ ] Audit log + RLS check ถ้าเป็น admin action
- [ ] i18n key มีทั้ง th + en (ถ้า touch UI)

### Branch protection (GitHub UI — ก๊อตตั้ง)
- `main` branch: require PR + 1 review จาก CODEOWNER
- ห้าม force-push เข้า main
- ห้ามลบ main

---

## 6. Decision-making

| ระดับ decision | ใครตัดสิน |
|---|---|
| Code style / file structure | เดฟ (ตาม [`conventions.md`](conventions.md)) |
| Architecture / DB schema | เดฟ + ก๊อต (มี ADR ใน `decisions/`) |
| Feature scope / cut features | เดฟ |
| Third-party service / API | เดฟ + Pacred owner |
| Pacred ecosystem direction | Pacred owner + ก๊อต |
| Phase 2 DPX ERP scope | Pacred owner + เดฟ + ก๊อต |
| Emergency hotfix bypass | เดฟ หรือ ก๊อต |

---

## 7. Communication channels

(บอกเดฟถ้าจะเปลี่ยนช่อง)

- **Daily standup:** LINE group (Pacred Dev)
- **Code review:** GitHub PR comments
- **Architecture discussion:** ADR file ใน `docs/decisions/`
- **Bug report (urgent):** LINE → เดฟ
- **Bug report (regular):** GitHub Issue

---

## 8. Onboarding new dev

ทำตามลำดับ:
1. อ่าน [`docs/HANDBOOK.md`](HANDBOOK.md) — ภาพรวม
2. อ่าน [`docs/team.md`](team.md) (ไฟล์นี้) — role + workflow
3. อ่าน [`docs/conventions.md`](conventions.md) — code style + commit format
4. อ่าน [`docs/env.md`](env.md) — env vars ที่ต้องตั้ง
5. อ่าน [`docs/PORT_PLAN.md`](PORT_PLAN.md) Part E + Part N6 — งานที่ assign
6. Setup: clone → `pnpm install` → `cp .env.example .env.local` → fill values → `pnpm dev`
7. Test: เปิด `http://localhost:3000` + เปิด `/admin` (need admin role) — ตรวจว่า boot ok
8. แจ้งเดฟ/ก๊อต — ทำ task แรกได้

---

**End of team.md** — questions ถามเดฟ
