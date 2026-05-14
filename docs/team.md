# 👥 Pacred — Team & Permissions

> **CANONICAL** — single source of truth for roles, branches, and merge policy.
> ทุกไฟล์ MD ที่กล่าวถึง team/role/branch ต้อง link มาที่นี่ ห้าม duplicate

Last updated: 2026-05-13

---

## 1. Roles & Responsibilities

| คน | บทบาท | Primary branch (operating point) | สโคปงาน | สิทธิ์ main |
|---|---|---|---|---|
| **ก๊อต** (got) | Senior Advisor / Production Watcher | `main` | ที่ปรึกษา · code review · architectural decisions · ผสานงานน้องๆ กับเดฟ · คุม production · backup merger | ✅ Push to main |
| **เดฟ** (dave) | **Project Lead / Integrator** | `dave` | คุมทิศทางโปรเจคทั้งหมด · จ่ายงาน · run sprint · คนกลางรวม ภูม + ปอน ให้เสถียรก่อนขึ้น main · infrastructure · 3rd-party integrations · ไม่ปิดกั้นไอเดียน้อง ขอแค่ direction ไปทางเดียวกัน | ✅ Push to main |
| **ปอน** (podeng) | Frontend & SEO Specialist | `podeng` | **100% หน้าบ้าน** — landing pages ทุก service · acquisition funnel · SEO · marketing support · mobile UX · ทำให้ลูกค้าใช้ง่าย · ระบบอำนวยให้ลูกค้าเข้ามาง่าย+น่าใช้สุด · i18n · Lighthouse scores | ❌ Push only to `podeng` branch |
| **ภูม** (Poom) | Backend & Cargo Port Specialist | `Poom` | **100% หลังบ้าน** — auth/customer portal/admin · เชื่อม frontend ↔ customer backend ↔ admin backend · port PHP cargo 100% (phase 1) · DPX ERP upgrade (phase 2) | ❌ Push only to `Poom` branch |

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
5. อ่าน [`docs/PORT_PLAN.md`](PORT_PLAN.md) Part O (ของตัวเอง O2/O3/O4) + Part P (current snapshot) — งานที่ assign
6. Setup: clone → `pnpm install` → `cp .env.example .env.local` → fill values → `pnpm dev`
7. Test: เปิด `http://localhost:3000` + เปิด `/admin` (need admin role) — ตรวจว่า boot ok
8. Setup Claude Code (ดู §9 ด้านล่าง) — coordinate กับทีมผ่าน docs canonical
9. แจ้งเดฟ/ก๊อต — ทำ task แรกได้

---

## 9. Async collaboration via Claude Code (NEW 2026-05-14)

> **Pattern:** ทุกคนใช้ Claude Code instance ของตัวเอง — coordinate ผ่าน docs canonical (PORT_PLAN.md, team.md, conventions.md) แทน real-time chat. "Shared brain" = repo docs ใน main

### กฎ pattern นี้

1. **ทุกคนทำงานใน branch ของตัวเอง:**
   - ก๊อต operate จาก `main` (review + production watch)
   - เดฟ operate จาก `dave` (consolidation + integration)
   - ภูม operate จาก `Poom`
   - ปอน operate จาก `podeng`

2. **Docs canonical ใน main = single source of truth:**
   - งาน assign → [`docs/PORT_PLAN.md`](PORT_PLAN.md) Part O2 (ภูม) / O3 (ปอน) / O4 (เดฟ) + Part P (latest snapshot)
   - Role/workflow → ไฟล์นี้ (`docs/team.md`)
   - Code style → [`docs/conventions.md`](conventions.md)
   - Env → [`docs/env.md`](env.md)
   - Architecture → [`docs/architecture.md`](architecture.md) + [`docs/decisions/`](decisions/)

3. **Workflow ผ่าน Claude Code (ทำทุกครั้งที่กลับมาทำงาน):**
   ```
   Step 1 (เปิด Claude Code):
     - cd ไปยัง branch ของตัวเอง (~/pacred-web)
     - Sync main เข้า branch ตัวเองตาม §3
     - บอก Claude Code ว่า "เช็คงานใน main แล้วทำใน <ของตัวเอง>"
   
   Step 2 (Claude Code อ่าน docs):
     - Claude Code อ่าน CLAUDE.md → docs/PORT_PLAN.md Part P (latest snapshot) → ส่วน O2/O3/O4 ของตัวเอง
     - แสดง pending tasks + recent state
   
   Step 3 (ทำงาน):
     - Claude Code ช่วย implement task ตาม spec ใน PORT_PLAN
     - Lint+TS check + commit ตาม conventions
   
   Step 4 (ส่งงาน):
     - Push ขึ้น branch ตัวเอง
     - Claude Code อัพเดท PORT_PLAN Part P snapshot ว่าทำอะไรเสร็จ + ที่เหลือ
     - Commit doc update บน branch ตัวเอง
   
   Step 5 (เดฟ/ก๊อต integrate):
     - เดฟ pull งานทุกคนเข้า dave → verify → push main
     - ก๊อต watch main → review → ผ่าน
     - PORT_PLAN Part P snapshot บน main update เป็นตัวล่าสุด
     - คนถัดไปที่กลับมา → sync main → เห็น context ใหม่ทันที
   ```

4. **Etiquette:**
   - **ห้าม edit docs canonical (PORT_PLAN/team.md/conventions.md/env.md) บน branch ตัวเอง** ยกเว้น Part P snapshot ที่อัพเดทสถานะตัวเอง — ที่อื่นเป็น lead-only
   - ถ้าจะเสนอแก้ doc/architecture → propose ใน PR description หรือสร้าง ADR ใน `docs/decisions/`
   - Tag ในcommit message: `docs(port-plan): <name> Sprint X update — <what changed>` เพื่อให้ค้นย้อนได้
   - ถ้า Claude Code ของคุณบอกอะไรขัดกับ Claude Code ของเพื่อน → ดูว่า main มีอะไรใหม่ที่ตัวเองยัง sync ไม่ทัน

5. **เมื่อขัดกัน / decision ต้องการ:**
   - Tag เดฟ ใน LINE → เดฟ decide หรือ escalate ก๊อต
   - ห้าม Claude Code ของน้องตัดสินใจเรื่อง architectural / scope expansion เอง — ถ้า Claude Code ถาม "ควรทำ X หรือ Y?" → ตอบให้ Claude Code ส่งคำถามมาที่เดฟผ่านการ commit doc proposal

6. **Self-directed mode (NEW 2026-05-14 evening):**
   - **เมื่อไหร่:** task ใน PORT_PLAN.md ที่ marked `Decision? = No` หรือ marked `<name> decide` พร้อม recommended default — ลุยได้เลย ไม่ต้องรอ
   - **เมื่อไหร่ห้าม:** task ที่ marked `Decision? = Pacred owner` / `เดฟ + ก๊อต` หรือ scope expansion (เพิ่ม feature นอกเหนือสเปคของ task) → ห้าม implement
   - **กฎทอง:** ถ้าระหว่างทางเจอเรื่อง trade-off ที่ไม่แน่ใจ → ใช้ default ที่ง่ายกว่า + log decision ใน commit message ใต้ "DECISION:" header (เดฟ/ก๊อต ปรับย้อนหลังได้); อย่าหยุดเพื่อรอ
   - **Hand-off rule:** หลังจบ task — push branch + commit อัพเดท PORT_PLAN Part P snapshot (มี ✅ ของ task ที่เพิ่งจบ + note สั้นๆ) → next sync เห็นทันที
   - **Trigger limit:** ห้ามทำหลาย task ของ Priority 0 พร้อมกัน (lock contention เสี่ยง schema migration); Priority 1+ ทำคู่ขนานได้

### ทำไม pattern นี้ดี

- **Async-friendly:** ไม่ต้อง online พร้อมกัน — sync state ผ่าน docs ใน main
- **Auditable:** ทุก decision อยู่ใน git history
- **Onboarding cheap:** new dev เปิด Claude Code → docs ใน main ตอบทุกอย่างให้
- **AI-native:** Claude Code instance ของแต่ละคน follow docs เดียวกัน → coordinate convergent โดยไม่ต้อง chat

### ข้อจำกัด

- Docs ต้อง up-to-date — ถ้า Part P snapshot stale → Claude Code จะแนะนำผิด → ทุกคนรับผิดชอบอัพเดท snapshot หลังจบ session
- Real-time emergencies (production down, urgent customer issue) → LINE direct ก่อน Claude Code

---

**End of team.md** — questions ถามเดฟ
