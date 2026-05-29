#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ภูม setup — pacred-admin-next / admin lane (NEW repo)
# ─────────────────────────────────────────────────────────────
# รันครั้งเดียวตอน setup เครื่อง · เป็น repo ใหม่ (ไม่ใช่ pacred-web)
# Usage:  bash setup-poom-admin.sh  (จาก folder pacred-admin-next)
# ─────────────────────────────────────────────────────────────

set -e

echo "🟠 ภูม setup — pacred-admin-next / admin"
echo ""

# ─── 1. Repo ตรวจสอบ ───
if [ ! -d ".git" ] || ! grep -q "pacred-admin-next" package.json 2>/dev/null; then
  echo "❌ ไม่ได้อยู่ใน pacred-admin-next · ทำตามนี้:"
  echo ""
  echo "   cd C:\\Users\\Admin               # หรือที่ไหนก็ได้ (แต่อย่าซ้อน pacred-web)"
  echo "   git clone https://github.com/pacred-co/pacred-admin-next"
  echo "   cd pacred-admin-next"
  echo "   bash setup-poom-admin.sh"
  exit 1
fi

# ─── 2. Branch ───
echo "🟠 (1/5) Switch to admin branch..."
git fetch origin --prune
git checkout admin 2>/dev/null || git checkout -b admin origin/admin

# ─── 3. Pull admin ล่าสุด ───
echo "🟠 (2/5) Pull งาน admin ล่าสุด..."
git pull origin admin --no-edit || {
  echo "⚠️  Conflict — ภูม แก้แล้ว rerun"
  exit 1
}

# ─── 4. Node version bypass ───
echo "🟠 (3/5) Bypass Node 22 lock (ภูม น่าจะมี Node 24)..."
if [ ! -f ".npmrc" ]; then
  echo "engine-strict=false" > .npmrc
  echo "    ✅ .npmrc สร้างให้แล้ว"
else
  grep -q "engine-strict=false" .npmrc || echo "engine-strict=false" >> .npmrc
  echo "    ✅ .npmrc มี engine-strict=false แล้ว"
fi

# ─── 5. pnpm install ───
echo "🟠 (4/5) pnpm install... (~30s · ignore Unsupported engine warning)"
pnpm install --frozen-lockfile

# ─── 6. .env.local check ───
echo "🟠 (5/5) ตรวจ .env.local..."
if [ ! -f ".env.local" ]; then
  echo "⚠️  ไม่มี .env.local — ขอจากเดฟทาง chat"
  echo "    Vars ที่ต้องมี:"
  echo "     • NEXT_PUBLIC_SUPABASE_URL=https://pprrlabgebrnocthwdmg.supabase.co"
  echo "     • NEXT_PUBLIC_SUPABASE_ANON_KEY=..."
  echo "     • SUPABASE_SERVICE_ROLE_KEY=..."
  echo "     • AUTH_SECRET=<random 32 bytes base64>     ← NextAuth"
  echo "     • AUTH_TRUST_HOST=true"
  echo "     • NEXTAUTH_URL=http://localhost:3001"
  echo "     • DEV_BYPASS=true                          ← skip login ใน dev"
  echo "     • OTP_BYPASS=true · LINE_PUSH_BYPASS=true"
else
  echo "    ✅ .env.local มีแล้ว"
fi

echo ""
echo "─────────────────────────────────────────"
echo "✅ Setup เสร็จ"
echo "─────────────────────────────────────────"
echo ""
echo "🚀 เริ่มทำงาน:"
echo "   pnpm dev --port 3001          # → http://localhost:3001"
echo "   DEV_BYPASS=true → เข้า /dashboard ได้ทันที ไม่ต้อง login"
echo ""
echo "📁 Routes ไม่มี /admin prefix แล้ว (ทั้ง repo คือ admin):"
echo "   /dashboard · /admins · /accounting · /api-forwarder-momo"
echo "   /barcode · /acc-payment · /acc-shop · /api-forwarder-jmf"
echo ""
echo "📚 เปิด 3 windows ควบกัน:"
echo "   1.  pacred-admin-next  (กำลังแก้)"
echo "   2.  D:\\REALSHITDATAPCS\\pcsc\\public_html\\member\\pcs-admin\\*.php  (legacy reference)"
echo "   3.  C:\\Users\\Admin\\pacred-web\\  (Pacred infra reference — Supabase helpers · auth)"
echo ""
echo "🎯 เป้า: 246 admin pages 1:1 — ก๊อต baseline 63% มี real impl แล้ว · เติมที่เหลือ"
echo ""
echo "📤 Push งาน (save-point only):"
echo "   git push origin admin"
echo "   (ก๊อต/เดฟ จะ gate → merge admin → main เป็นรอบๆ)"
echo ""
echo "⚠️  ห้ามแก้ schema เอง — บอกเดฟก่อน (migrations อยู่ที่ pacred-web/supabase/migrations/)"
echo ""
