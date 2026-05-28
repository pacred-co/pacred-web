#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ปอน setup — pacred-web / InwPond007 lane
# ─────────────────────────────────────────────────────────────
# รันครั้งเดียวตอน setup เครื่องใหม่ · หรือเปิดมาดู step ก็ได้
# Usage:  bash scripts/setup-podeng.sh
# ─────────────────────────────────────────────────────────────

set -e

echo "🟢 ปอน setup — pacred-web / InwPond007"
echo ""

# ─── 1. Repo ตรวจสอบ ───
if [ ! -d ".git" ]; then
  echo "❌ ไม่อยู่ใน repo · ทำตามนี้:"
  echo ""
  echo "   git clone https://github.com/pacred-co/pacred-web"
  echo "   cd pacred-web"
  echo "   bash scripts/setup-podeng.sh"
  exit 1
fi

# ─── 2. Branch ───
echo "🟢 (1/4) Switch to InwPond007 branch..."
git fetch origin --prune
git checkout InwPond007 2>/dev/null || git checkout -b InwPond007 origin/InwPond007

# ─── 3. Sync from dave-pacred (= main) ───
echo "🟢 (2/4) Pull งาน main ล่าสุด (เดฟ integrator)..."
git pull origin dave-pacred --no-edit || {
  echo "⚠️  Conflict — ปอน กรุณาแก้ conflict แล้ว rerun script"
  exit 1
}

# ─── 4. pnpm install ───
echo "🟢 (3/4) pnpm install..."
pnpm install --frozen-lockfile

# ─── 5. .env.local check ───
echo "🟢 (4/4) ตรวจ .env.local..."
if [ ! -f ".env.local" ]; then
  echo "⚠️  ไม่มี .env.local — ขอจากเดฟทาง chat"
  echo "    (มี Supabase prod keys + LINE + S3 + OTP_BYPASS=true)"
else
  echo "    ✅ .env.local มีแล้ว"
fi

echo ""
echo "─────────────────────────────────────────"
echo "✅ Setup เสร็จ"
echo "─────────────────────────────────────────"
echo ""
echo "🚀 เริ่มทำงาน:"
echo "   pnpm dev                      # → http://localhost:3000"
echo ""
echo "📁 Scope ทำได้:"
echo "   ✅  app/[locale]/(public)/**        — marketing + landing"
echo "   ✅  app/[locale]/(auth)/**          — login/register/forgot"
echo "   ✅  app/[locale]/(protected)/**     — customer portal ทั้งหมด"
echo "   ✅  components/sections/** + ui/**  — components"
echo "   ✅  messages/{th,en}.json           — i18n"
echo ""
echo "📁 ห้ามแตะ (= ภูม lane ที่ pacred-admin-next):"
echo "   ❌  app/[locale]/(admin)/admin/**   — admin pages ย้ายไปที่อื่นแล้ว"
echo "   ❌  supabase/migrations/**          — บอกเดฟก่อนถ้าจะแก้ schema"
echo ""
echo "📤 Push งาน (save-point only):"
echo "   git push origin InwPond007"
echo "   (เดฟ จะ merge InwPond007 → dave-pacred → main เป็นรอบๆ)"
echo ""
