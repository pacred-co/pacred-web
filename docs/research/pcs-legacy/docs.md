# PCS Cargo — Developer Documentation

**Version:** 1.0 | **Stack:** Next.js 14 + TypeScript + Prisma + MySQL

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Database Schema](#2-database-schema)
3. [API Endpoints](#3-api-endpoints)
4. [Business Logic & Calculations](#4-business-logic--calculations)
5. [User Roles & Permissions](#5-user-roles--permissions)
6. [Notification System](#6-notification-system)
7. [Integration References](#7-integration-references)
8. [Glossary](#8-glossary)

---

## 1. Project Structure

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   │
│   ├── (member)/                # Protected: Auth Middleware
│   │   ├── dashboard/
│   │   ├── shops/               # Shopping Service
│   │   ├── cart/
│   │   ├── forwarder/           # Forwarding Service
│   │   ├── payment/             # Payment Service
│   │   ├── wallet/
│   │   └── address/
│   │
│   ├── (admin)/                 # Protected: Admin Auth Middleware
│   │   ├── dashboard/
│   │   ├── customers/
│   │   ├── orders/
│   │   └── reports/
│   │
│   └── api/
│       ├── auth/
│       ├── shops/
│       ├── forwarder/
│       ├── payment/
│       └── wallet/
│
├── prisma/
│   └── schema.prisma
│
├── lib/
│   ├── auth.ts                  # NextAuth config
│   ├── db.ts                    # Prisma client
│   ├── calculations.ts          # Price/shipping formulas
│   └── notifications.ts        # SMS/Email/Line helpers
│
└── middleware.ts                # Route protection
```

---

## 2. Database Schema

> Database: `pcsc_main` (MySQL)

### tb_user

| Column | Type | Description |
|--------|------|-------------|
| `userID` | VARCHAR(50) PK | Format: `PCS####` |
| `userName` | VARCHAR(200) | ชื่อ |
| `userLastName` | VARCHAR(200) | นามสกุล |
| `userEmail` | VARCHAR(255) UNIQUE | |
| `userTel` | VARCHAR(10) UNIQUE | |
| `userPass` | VARCHAR(80) | bcrypt hash |
| `userStatus` | VARCHAR(1) | `1`=active, `0`=inactive, `2`=pending |
| `creditUser` | TINYINT | `0`=ปกติ, `1`=VIP Credit |
| `adminIDSale` | VARCHAR(30) | Sales ที่ดูแล |
| `userRegistered` | DATETIME | |
| `userLastLogin` | DATETIME | |

### tb_admin

| Column | Type | Description |
|--------|------|-------------|
| `ID` | INT PK AUTO_INCREMENT | |
| `adminID` | VARCHAR(20) UNIQUE | Format: `admin_name` |
| `adminType` | VARCHAR(1) | `1`=Super, `2`=Manager, `3`=Section, `4`=Intern, `5`=Sales, `6`=Ops |
| `adminStatusSale` | VARCHAR(1) | สำหรับ Sales: `1`=ได้ commission |
| `adminStatusA` | VARCHAR(1) | `1`=active |
| `department` | VARCHAR(2) | |
| `section` | VARCHAR(2) | |

### tb_shops (Shopping Orders)

| Column | Type | Description |
|--------|------|-------------|
| `ID` | BIGINT PK | |
| `sDate` | DATETIME | วันสร้างออเดอร์ |
| `sStatus` | VARCHAR(2) | ดู status table |
| `sProvider` | VARCHAR(1) | `1`=1688, `2`=Taobao, `3`=Tmall, `4`=Shops, `5`=Nice |
| `sURL` | VARCHAR(300) | URL สินค้า |
| `sTitle` | VARCHAR(300) | ชื่อสินค้า |
| `sImages` | VARCHAR(300) | รูปสินค้า |
| `sPrice` | DECIMAL(10,2) | ราคา CNY |
| `sAmount` | INT | จำนวน |
| `sColor` | VARCHAR(200) | |
| `sSize` | VARCHAR(200) | |
| `sPriceTotal` | DECIMAL(10,2) | ราคา THB (price × rate × qty) |
| `sServiceFee` | DECIMAL(10,2) | ค่าบริการ |
| `sShipCHN` | DECIMAL(10,2) | ค่าส่งในจีน |
| `sPayTotal` | DECIMAL(10,2) | รวมทั้งหมด |
| `userID` | VARCHAR(30) FK | |

### tb_forwarder (Import Orders)

| Column | Type | Description |
|--------|------|-------------|
| `ID` | BIGINT PK | |
| `fDate` | DATETIME | |
| `fStatus` | VARCHAR(2) | ดู status table |
| `fWarehouseChina` | VARCHAR(1) | `1`=Guangzhou, `2`=Yiwu |
| `fWarehouseName` | VARCHAR(1) | `1`=SAI, `2`=CTT, `3`=MK, `4`=MX, `5`=JMF, `6`=GOGO, `7`=CargoCenter, `8`=MOMO |
| `fTransportType` | VARCHAR(1) | `1`=เรือ, `2`=เครื่องบิน, `3`=Express |
| `fTrackingCHN` | VARCHAR(50) | Tracking จีน |
| `fWeight` | DECIMAL(10,2) | น้ำหนักรวม (kg) |
| `fWidth/Length/Height` | DECIMAL(10,2) | ขนาด (cm) |
| `fVolume` | DECIMAL(10,5) | CBM |
| `fShippingService` | DECIMAL(10,2) | ค่าขนส่งรวม |
| `fShipBy` | VARCHAR(2) | `1`=DHL, `2`=Flash, `3`=JK, `4`=Kerry, `5`=Nim, `8`=SCG |
| `fTrackingThai` | VARCHAR(50) | Tracking ไทย |
| `paydeposit` | VARCHAR(1) | `1`=เครดิต VIP |
| `userID` | VARCHAR(50) FK | |

### tb_forwarder_item (Import Line Items)

| Column | Type | Description |
|--------|------|-------------|
| `ID` | BIGINT PK | |
| `fID` | BIGINT FK | → tb_forwarder |
| `productName` | VARCHAR(255) | |
| `productTracking` | VARCHAR(255) | |
| `productQTY` | INT | |
| `productWeightPerItem` | DECIMAL(10,2) | kg |
| `productWeightAll` | DECIMAL(10,2) | kg รวม |
| `productWidth/Length/Height` | DECIMAL(10,2) | cm |
| `productCBMPerItem` | DECIMAL(10,2) | |
| `productCBMAll` | DECIMAL(10,2) | |
| `chinaWoodenCrateFeeType` | VARCHAR(1) | `1`=ไม่มีลัง, `2`=ลังไม้ |
| `chinaWoodenCrateFee` | DECIMAL(10,2) | |
| `otherServiceFee` | DECIMAL(10,2) | ค่าบริการเสริม |
| `thailandDeliveryFee` | DECIMAL(10,2) | |
| `fRefPrice` | VARCHAR(1) | `1`=ใช้น้ำหนัก, `2`=ใช้ปริมาตร |
| `userID` | VARCHAR(50) FK | |

### tb_payment (Payment Requests)

| Column | Type | Description |
|--------|------|-------------|
| `ID` | BIGINT PK | |
| `pDate` | DATETIME | |
| `pStatus` | VARCHAR(2) | `1`=รอ, `2`=ดำเนินการ, `3`=สำเร็จ, `4`=ล้มเหลว, `5`=คืนเงิน |
| `pAmount` | DECIMAL(10,2) | จำนวน CNY |
| `pDetail` | TEXT | |
| `pServiceFee` | DECIMAL(10,2) | 3% |
| `pPayTotal` | DECIMAL(10,2) | รวม THB |
| `userID` | VARCHAR(30) FK | |

### tb_wallet (Wallet Transactions)

| Column | Type | Description |
|--------|------|-------------|
| `ID` | BIGINT PK | |
| `wDate` | DATETIME | |
| `wType` | VARCHAR(1) | `1`=เติม, `2`=ถอน, `3`=ชำระ, `4`=คืน, `5`=Commission, `6`=ปรับยอด |
| `wAmount` | DECIMAL(10,2) | |
| `wBalance` | DECIMAL(10,2) | ยอดหลัง transaction |
| `wDetail` | TEXT | |
| `wStatus` | VARCHAR(1) | `1`=สำเร็จ, `2`=รอ, `3`=ล้มเหลว |
| `userID` | VARCHAR(30) FK | |

### Entity Relationships

```
tb_user
  ├── 1:N → tb_address
  ├── 1:N → tb_cart
  ├── 1:N → tb_shops
  ├── 1:N → tb_forwarder
  │           ├── 1:N → tb_forwarder_item
  │           └── 1:N → tb_forwarder_img
  ├── 1:N → tb_payment
  └── 1:N → tb_wallet

tb_admin
  └── 1:N → tb_user (via adminIDSale)
```

---

## 3. API Endpoints

### Auth

```
POST /api/auth/login
  Body: { phone, password }
  Response: { success, token, user }

POST /api/auth/register
  Body: { firstName, lastName, phone, email, password, referralCode? }
  Response: { success, userId }

POST /api/auth/recover
  Body: { phone }
  Response: { success }

POST /api/auth/verify-otp
  Body: { phone, otp }
  Response: { success, resetToken }
```

### Shopping

```
GET  /api/shops               # รายการออเดอร์ของ user
POST /api/shops               # สร้างออเดอร์
GET  /api/shops/:id           # รายละเอียดออเดอร์
PUT  /api/shops/:id/status    # อัปเดตสถานะ (admin)
DEL  /api/shops/:id           # ยกเลิกออเดอร์

GET  /api/cart                # ดูตะกร้า
POST /api/cart                # เพิ่มสินค้า
PUT  /api/cart/:id            # แก้ไขจำนวน/variant
DEL  /api/cart/:id            # ลบสินค้า
POST /api/cart/checkout       # Checkout

GET  /api/product/scrape?url= # ดึงข้อมูลสินค้าจาก 1688/Taobao
```

### Forwarding

```
GET  /api/forwarder           # รายการนำเข้า
POST /api/forwarder           # สร้างรายการ
GET  /api/forwarder/:id       # รายละเอียด
PUT  /api/forwarder/:id       # แก้ไข
PUT  /api/forwarder/:id/status
POST /api/forwarder/:id/images
POST /api/forwarder/:id/pay   # ชำระเงิน
```

### Payment Service

```
GET  /api/payment             # รายการคำขอโอน
POST /api/payment             # สร้างคำขอ
GET  /api/payment/:id
PUT  /api/payment/:id/approve # Admin อนุมัติ
PUT  /api/payment/:id/reject
POST /api/payment/:id/pay
```

### Wallet

```
GET  /api/wallet              # ยอดคงเหลือ + ประวัติ
POST /api/wallet/topup        # ขอเติมเงิน (upload slip)
POST /api/wallet/withdraw     # ขอถอนเงิน
PUT  /api/wallet/topup/:id/approve    # Admin อนุมัติ
PUT  /api/wallet/withdraw/:id/process # Admin ดำเนินการ
```

### Exchange Rate

```
GET  /api/rates               # เรทปัจจุบัน
PUT  /api/rates               # Admin อัปเดต
GET  /api/rates/history       # ประวัติเรท
```

---

## 4. Business Logic & Calculations

### Shopping Service — Price Calculation

```typescript
// 1. แปลงราคา CNY → THB
const priceTHB = price_cny * exchange_rate * quantity;

// 2. ค่าบริการ
const serviceFeeRate = user.creditUser === 1 ? 0.03 : 0.05;
const serviceFee = priceTHB * serviceFeeRate;

// 3. ค่าส่งในจีน (ตามน้ำหนักสินค้า)
const chinaShipping = calculateChinaShipping(weight);

// 4. รวม
const payTotal = priceTHB + serviceFee + chinaShipping;
```

### Forwarding Service — Shipping Calculation

```typescript
// CBM
const cbm = (width * length * height) / 1_000_000; // cm → m³

// Volumetric Weight
const volumetricWeight = transport === 'air'
  ? (width * length * height) / 5000
  : (width * length * height) / 6000;

// Chargeable Weight
const chargeableWeight = Math.max(actualWeight, volumetricWeight);

// Rate per kg
const rates = { sea: 25, air: 45, express: 85 }; // THB/kg
const shippingCost = chargeableWeight * rates[transport];

// Add-ons
const crateFee      = hasCrate     ? cbm * 1000  : 0;
const inspectionFee = needsInspect ? 200          : 0;
const photoFee      = extraPhotos  ? 100          : 0;

// Thailand Delivery (by zone)
const deliveryFee   = calculateThaiDelivery(zipcode, chargeableWeight);

const total = shippingCost + crateFee + inspectionFee + photoFee + deliveryFee;
```

### Thailand Delivery Zones

```typescript
const zones: Record<string, { base: number; extra: number }[]> = {
  zone1: [
    { upTo: 5,  base: 60  },
    { upTo: 10, base: 80  },
    { upTo: 20, base: 120 },
    { upTo: Infinity, base: 120, extra: 5 }, // +5 THB/kg เกิน 20kg
  ],
  zone2: [
    { upTo: 5,  base: 80  },
    { upTo: 10, base: 100 },
    { upTo: 20, base: 150 },
    { upTo: Infinity, base: 150, extra: 6 },
  ],
  zone3: [
    { upTo: 5,  base: 100 },
    { upTo: 10, base: 130 },
    { upTo: 20, base: 180 },
    { upTo: Infinity, base: 180, extra: 7 },
  ],
};

// Free Shipping Thresholds
// > 5,000 THB → Zone 1 free
// > 10,000 THB → Zone 2 free
// > 20,000 THB → Zone 3 free
```

### Payment Service — Fee

```typescript
const amountTHB  = amount_cny * transfer_rate;
const serviceFee = Math.max(amountTHB * 0.03, 50); // min 50 THB
const total      = amountTHB + serviceFee;
```

### Credit System

```typescript
// ตรวจสอบสิทธิ์ VIP Credit
function isEligibleForCredit(user: User): boolean {
  return (
    user.accountAgeDays >= 30 &&
    user.completedOrders >= 10 &&
    user.totalOrderValue >= 50000 &&
    user.paymentIssues === 0
  );
}

// วงเงินเริ่มต้น
function initialCreditLimit(user: User): number {
  const avg = user.totalOrderValue / user.completedOrders;
  return Math.min(avg * 2, 10000);
}

// ดอกเบี้ยค้างชำระ
function overdueInterest(amount: number, daysOverdue: number): number {
  if (daysOverdue <= 7)  return amount * 0.02;
  if (daysOverdue <= 14) return amount * 0.05;
  return amount * 0.10;
}
```

### Agent Commission

```typescript
function commissionRate(monthlyVolume: number): number {
  if (monthlyVolume < 50000)  return 0.02;
  if (monthlyVolume < 100000) return 0.03;
  if (monthlyVolume < 200000) return 0.04;
  return 0.05;
}

// คำนวณจาก service fee เท่านั้น (ไม่รวมราคาสินค้า)
const commission = order.serviceFee * commissionRate(agentMonthlyVolume);

// Minimum payout: 500 THB
```

---

## 5. User Roles & Permissions

### Role Hierarchy

```
Super Admin (adminType=1)
  └─ Manager (adminType=2,3)
       └─ Sales (adminType=5)
            └─ Operations Staff (adminType=6)

VIP Customer (creditUser=1)
  └─ Regular Customer
       └─ Agent (referral partner)
```

### Permission Matrix

| Feature | Customer | VIP | Agent | Sales | Manager | Super Admin |
|---------|----------|-----|-------|-------|---------|-------------|
| ดูออเดอร์ตัวเอง | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| สร้างออเดอร์ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Credit Terms | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| ดูออเดอร์ทั้งหมด | ❌ | ❌ | ❌ | เฉพาะลูกค้าตัวเอง | ✅ | ✅ |
| แก้ไขออเดอร์ | ❌ | ❌ | ❌ | เฉพาะลูกค้าตัวเอง | ✅ | ✅ |
| Commission tracking | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Financial Reports | ❌ | ❌ | ❌ | จำกัด | ✅ | ✅ |
| User Management | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| System Settings | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 6. Notification System

### Channels

| Channel | ใช้เมื่อ |
|---------|----------|
| SMS | เหตุการณ์สำคัญทุกอย่าง |
| Email | ยืนยัน, Invoice, รายงาน |
| Line Notify | แจ้ง Admin + ลูกค้า |
| In-app | ทั่วไป |

### Trigger Events

| Event | SMS | Email | Line |
|-------|-----|-------|------|
| สร้างออเดอร์ | ✅ | ✅ | — |
| ชำระสำเร็จ | ✅ | ✅ | ✅ |
| สินค้าถึงคลังจีน | ✅ | — | — |
| ออกจัดส่งในไทย | ✅ | — | — |
| ส่งสำเร็จ | ✅ | ✅ | — |
| Invoice ออก (Forwarding) | ✅ | ✅ | ✅ |
| เตือนชำระ 3 วัน | ✅ | ✅ | — |
| ยืนยันเติม Wallet | ✅ | — | — |

---

## 7. Integration References

| Service | URL / Package |
|---------|---------------|
| Thai Address DB | https://github.com/konradit/thailand-addresses-database |
| Exchange Rate API | https://exchangerate-api.com |
| Payment Gateway (Omise) | https://www.omise.co |
| Payment Gateway (GB Prime) | https://www.gbprimepay.com |
| Flash Express API | https://flashexpress.com |
| Kerry Express API | https://th.kerryexpress.com |
| Line Notify | https://notify-bot.line.me |
| Line Messaging API | https://developers.line.biz |
| SMS Gateway | Thai provider (TBD) |

---

## 8. Glossary

| คำ | ความหมาย |
|----|----------|
| CBM | Cubic Meter — หน่วยวัดปริมาตร |
| Volumetric Weight | น้ำหนักตามปริมาตร (L×W×H / 5000 หรือ 6000) |
| Chargeable Weight | น้ำหนักที่คิดราคา = max(actual, volumetric) |
| ฝากสั่งสินค้า | Shopping Service |
| ฝากนำเข้า | Forwarding Service |
| ฝากชำระ/โอน | Payment Service |
| กระเป๋าสตางค์ | Digital Wallet |
| เรทลังซื้อ | Exchange rate สำหรับสั่งสินค้า |
| เรทโอน | Exchange rate สำหรับโอนเงิน |
| ตัวแทน (Agent) | Referral partner รับ commission |
| เซลล์ (Sales) | พนักงานขาย assigned ให้ลูกค้า |
| creditUser | Flag VIP Credit (0=ปกติ, 1=VIP) |
| adminIDSale | Sales admin ที่ดูแลลูกค้า |
