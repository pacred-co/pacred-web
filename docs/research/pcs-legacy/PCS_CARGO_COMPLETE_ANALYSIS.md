# PCS Cargo - Complete System Analysis & Specification

**Version:** 1.0  
**Date:** May 19, 2026  
**Purpose:** Full system documentation for AI-assisted development  
**Target:** Convert PHP system to Next.js 14 + TypeScript

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Business Overview](#business-overview)
3. [System Architecture](#system-architecture)
4. [User Roles & Permissions](#user-roles--permissions)
5. [Database Schema](#database-schema)
6. [Member System](#member-system)
7. [Admin System](#admin-system)
8. [Core Features](#core-features)
9. [Business Logic](#business-logic)
10. [API Endpoints](#api-endpoints)
11. [UI/UX Patterns](#uiux-patterns)
12. [Workflows](#workflows)
13. [Calculations & Formulas](#calculations--formulas)
14. [Integration Requirements](#integration-requirements)
15. [Technical Specifications](#technical-specifications)

---

## 1. Executive Summary

### 1.1 What is PCS Cargo?

**PCS Cargo** is a comprehensive import/export management platform specializing in helping Thai customers order and ship products from China (primarily 1688.com, Taobao, and Tmall).

### 1.2 Core Business Model

**Three Main Services:**

1. **Shopping Service (ฝากสั่งสินค้า)**
   - Customer finds products on Chinese e-commerce sites
   - PCS orders on their behalf
   - Consolidates orders and ships to Thailand

2. **Forwarding Service (ฝากนำเข้า)**
   - Customer already has products in China
   - PCS handles import logistics, customs, delivery
   - Weight/volume-based pricing

3. **Payment Service (ฝากชำระ/โอน)**
   - PCS makes payments to Chinese suppliers
   - Service fee applies

### 1.3 Revenue Model

- **Service Fees:** % of product value
- **Shipping Fees:** Based on weight/volume/destination
- **Payment Processing Fees:** % of payment amount
- **Value-Added Services:** Wooden crates, inspection, photos

### 1.4 Technology Stack (Current - PHP)

- **Backend:** PHP 7.x with MySQLi
- **Database:** MySQL (pcsc_main)
- **Frontend:** Bootstrap 4, jQuery
- **Session:** PHP Sessions
- **Files:** Local file storage

### 1.5 Technology Stack (Target - Next.js)

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** MySQL with Prisma ORM
- **Authentication:** NextAuth.js v5
- **UI:** Tailwind CSS + Radix UI
- **State:** Zustand + React Query
- **Forms:** React Hook Form + Zod

---

## 2. Business Overview

### 2.1 Target Customers

**Primary:**
- Thai individuals ordering from Chinese e-commerce
- Small business owners importing products
- Resellers and dropshippers

**Secondary:**
- Agents (earn commission from referrals)
- VIP customers (high volume, credit terms)

### 2.2 Value Proposition

**For Customers:**
- No Chinese language required
- No Chinese bank account needed
- Consolidated shipping (save costs)
- Insurance and tracking
- Local customer support in Thai

**For PCS:**
- High-margin service fees
- Recurring customer base
- Volume discounts from shipping partners
- Data on trending products

### 2.3 Competitive Advantages

- Established warehouse network in China
- Partnerships with multiple shipping providers
- Credit system for trusted customers
- Agent/referral program
- Comprehensive tracking system

### 2.4 Key Metrics (Dashboard Stats)

**Revenue Metrics:**
- Daily shopping orders value (ยอดฝากลังซื้อ)
- Daily import orders value (ยอดฝากนำเข้า)
- Daily transfer orders value (ยอดฝากโอน)
- Wallet balance (กระเป๋าสตางค์)

**Operational Metrics:**
- Active customers (ลูกค้าที่ใช้งานแล้ว)
- Inactive customers (ลูกค้าที่ยังไม่ใช้งาน)
- Cancelled orders (ออเดอร์ที่ถูกยกเลิก)

**Exchange Rates:**
- Buy rate (เรทลังซื้อ)
- Transfer rate (เรทโอน)
- Sale rate (เรท Sale)
- Monthly volume (ยอดตรวม)

---

## 3. System Architecture

### 3.1 Current Architecture (PHP)

```
Internet
    ↓
Apache/Nginx
    ↓
PHP Application
    ├── member/ (Customer Portal)
    │   ├── login.php
    │   ├── index.php (Dashboard)
    │   ├── shops.php (Orders)
    │   ├── cart.php (Shopping Cart)
    │   ├── forwarder.php (Imports)
    │   ├── payment.php (Payments)
    │   ├── wallet.php (Wallet)
    │   └── address.php (Addresses)
    │
    ├── member/pcs-admin/ (Admin Portal)
    │   ├── login/
    │   ├── Dashboard
    │   ├── Customer Management
    │   ├── Order Management
    │   └── Reports
    │
    ├── config/
    │   └── config.inc.php (DB connection)
    │
    ├── include/
    │   ├── function.php (Business logic)
    │   ├── header.php
    │   ├── left-menu.php
    │   └── pages/ (AJAX handlers)
    │
    └── api/
        ├── apiCalPrice.php
        └── ...
    ↓
MySQL Database (pcsc_main)
```

### 3.2 Target Architecture (Next.js)

```
Internet
    ↓
Next.js Server (Node.js)
    ↓
App Router
    ├── (auth)/
    │   ├── login/
    │   └── register/
    │
    ├── (member)/ [Middleware: Auth]
    │   ├── dashboard/
    │   ├── shops/
    │   ├── cart/
    │   ├── forwarder/
    │   ├── payment/
    │   ├── wallet/
    │   └── address/
    │
    ├── (admin)/ [Middleware: Admin Auth]
    │   ├── dashboard/
    │   ├── customers/
    │   ├── orders/
    │   └── reports/
    │
    └── api/
        ├── auth/
        ├── shops/
        ├── forwarder/
        ├── payment/
        └── wallet/
    ↓
Prisma ORM
    ↓
MySQL Database (pcsc_main)
```

### 3.3 Data Flow

**User Request → Middleware (Auth) → Page Component → Server Action/API Route → Prisma → Database → Response → Client**

### 3.4 File Storage

**Current:** Local filesystem (`/member/images/`, `/member/uploads/`)  
**Target:** 
- Option 1: Local filesystem (same as current)
- Option 2: S3-compatible storage (future upgrade)
- Option 3: Next.js public folder for static assets

### 3.5 Session Management

**Current:** PHP Sessions (server-side)  
**Target:** NextAuth.js (JWT + Database sessions)

---

## 4. User Roles & Permissions

### 4.1 Role Hierarchy

```
Super Admin
    ↓
Admin (Department Heads)
    ↓
Manager (Section Heads)
    ↓
Employee (Operations Staff)
    ↓
Sales (Customer Service)
    ↓
Agent (Referral Partners)
    ↓
VIP Customer (High Volume, Credit)
    ↓
Regular Customer
```

### 4.2 Member Roles

#### **4.2.1 Regular Customer**

**Permissions:**
- ✅ View own orders, imports, payments
- ✅ Place orders, create imports
- ✅ Add to cart, checkout
- ✅ Top-up wallet (cash only)
- ✅ Withdraw wallet funds
- ✅ Manage delivery addresses
- ✅ View transaction history
- ❌ Credit wallet access
- ❌ Agent features

**Restrictions:**
- Must pay before order processing
- No credit terms
- Standard service fees

#### **4.2.2 VIP Customer (creditUser = 1)**

**All Regular Customer permissions PLUS:**
- ✅ Credit wallet access
- ✅ Credit terms (pay later)
- ✅ View credit limit and due dates
- ✅ Credit transaction history
- ✅ Priority customer service

**Credit Rules:**
- Credit limit assigned by admin
- Due dates for payment
- Interest on overdue amounts
- Can be revoked if late payment

#### **4.2.3 Agent (Special userIDs)**

**All Regular Customer permissions PLUS:**
- ✅ View team members (referrals)
- ✅ View team's transaction history
- ✅ Commission tracking
- ✅ Commission withdrawal
- ✅ Team performance reports

**Commission Rules:**
- % of team member's transactions
- Paid weekly/monthly
- Minimum withdrawal amount

### 4.3 Admin Roles

#### **4.3.1 Super Admin (adminType = '1')**

**Full System Access:**
- ✅ All modules
- ✅ User management (create/delete admins)
- ✅ System settings
- ✅ Financial reports
- ✅ Database access
- ✅ Audit logs

#### **4.3.2 Manager (adminType = '2', '3')**

**Operational Management:**
- ✅ Customer management
- ✅ Order processing
- ✅ Import management
- ✅ Payment verification
- ✅ Reports (department-level)
- ❌ Cannot delete users
- ❌ Cannot change system settings

#### **4.3.3 Sales (adminType = '5', adminStatusSale = '1')**

**Customer Service:**
- ✅ Assign to customers (adminIDSale)
- ✅ View assigned customers' data
- ✅ Process orders for assigned customers
- ✅ Answer customer inquiries
- ✅ Commission tracking
- ❌ Cannot see other sales' customers
- ❌ Limited financial access

#### **4.3.4 Operations Staff (adminType = '6')**

**Task-Specific Access:**
- ✅ Warehouse operations
- ✅ Package scanning
- ✅ Delivery coordination
- ❌ Financial data
- ❌ Customer personal info (limited)

### 4.4 Permission Matrix

| Feature | Customer | VIP | Agent | Sales | Manager | Admin |
|---------|----------|-----|-------|-------|---------|-------|
| View Own Orders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Place Orders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Credit Terms | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| View All Orders | ❌ | ❌ | ❌ | Assigned | ✅ | ✅ |
| Edit Orders | ❌ | ❌ | ❌ | Assigned | ✅ | ✅ |
| Cancel Orders | Own | Own | Own | Assigned | ✅ | ✅ |
| View Commission | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Financial Reports | ❌ | ❌ | ❌ | Limited | ✅ | ✅ |
| User Management | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| System Settings | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 5. Database Schema

### 5.1 Entity Relationship Diagram

```
User (tb_user)
    ├── 1:N → Address (tb_address)
    ├── 1:N → Cart (tb_cart)
    ├── 1:N → Shop (tb_shops)
    ├── 1:N → Forwarder (tb_forwarder)
    │          ├── 1:N → ForwarderItem (tb_forwarder_item)
    │          └── 1:N → ForwarderImage (tb_forwarder_img)
    ├── 1:N → Payment (tb_payment)
    └── 1:N → Wallet (tb_wallet)

Admin (tb_admin)
    └── 1:N → Assigned Users (via adminIDSale)
```

### 5.2 Core Tables Detailed

#### **5.2.1 tb_user (Users/Customers)**

```sql
CREATE TABLE `tb_user` (
  userID VARCHAR(50) PRIMARY KEY,  -- Format: PCS#### (e.g., PCS2542)
  userName VARCHAR(200),
  userLastName VARCHAR(200),
  userEmail VARCHAR(255) UNIQUE,
  userTel VARCHAR(10) UNIQUE,
  userPass VARCHAR(80),  -- bcrypt hash
  userPicture VARCHAR(150) DEFAULT 'user.jpg',
  userRegistered DATETIME,
  userLastLogin DATETIME,
  userStatus VARCHAR(1) DEFAULT '1',  -- 1=active, 0=inactive
  creditUser TINYINT DEFAULT 0,  -- 0=regular, 1=VIP with credit
  adminIDSale VARCHAR(30),  -- Assigned sales person
  -- Additional fields...
)
```

**Key Fields:**
- `userID`: Auto-generated, format PCS + sequential number
- `creditUser`: Controls access to credit features
- `adminIDSale`: Links to assigned sales rep

**Status Values:**
- `userStatus='1'`: Active, can log in
- `userStatus='0'`: Inactive/suspended
- `userStatus='2'`: Pending verification

#### **5.2.2 tb_admin (Staff/Admins)**

```sql
CREATE TABLE `tb_admin` (
  ID INT PRIMARY KEY AUTO_INCREMENT,
  adminID VARCHAR(20) UNIQUE,  -- Format: admin_name (e.g., admin_pond)
  adminPass VARCHAR(80),
  adminName VARCHAR(255),
  adminLastName VARCHAR(255),
  adminEmail VARCHAR(255),
  adminTel VARCHAR(13),
  adminPicture VARCHAR(150) DEFAULT 'user.jpg',
  adminType VARCHAR(1),  -- 1=Super, 2=Manager, 5=Sales, 6=Staff
  adminStatusSale VARCHAR(1),  -- For sales: commission eligibility
  department VARCHAR(2),
  section VARCHAR(2),
  adminStatusA VARCHAR(1) DEFAULT '1',  -- 1=active, 0=inactive
  adminNickname VARCHAR(30),
  -- More fields...
)
```

**Admin Types:**
- `1`: Super Admin
- `2`: Department Manager
- `3`: Section Manager
- `4`: Intern
- `5`: Sales
- `6`: Operations Staff

#### **5.2.3 tb_address (Delivery Addresses)**

```sql
CREATE TABLE `tb_address` (
  addressID BIGINT PRIMARY KEY AUTO_INCREMENT,
  addressStatus VARCHAR(1) DEFAULT '1',  -- 1=active, 0=deleted
  addressName VARCHAR(200),
  addressLastname VARCHAR(200),
  addressTel VARCHAR(10),
  addressTel2 VARCHAR(10),
  addressNo VARCHAR(200),  -- House/building number
  addressSubDistrict VARCHAR(255),  -- ตำบล/แขวง
  addressDistrict VARCHAR(255),  -- อำเภอ/เขต
  addressProvince VARCHAR(255),  -- จังหวัด
  addressZIPCode VARCHAR(5),
  addressNote TEXT,  -- Delivery instructions
  userID VARCHAR(10),
  latitude DECIMAL(10,8),
  longitude DECIMAL(10,8),
  FOREIGN KEY (userID) REFERENCES tb_user(userID)
)
```

**Business Rules:**
- Each user can have multiple addresses
- One address is marked as default (handled in app logic)
- Lat/long for map integration
- ZIPCode determines shipping cost tier

#### **5.2.4 tb_cart (Shopping Cart)**

```sql
CREATE TABLE `tb_cart` (
  ID INT PRIMARY KEY AUTO_INCREMENT,
  cDetails TEXT,  -- Product description
  cURL VARCHAR(300),  -- Source URL (1688/Taobao/Tmall)
  cTitle VARCHAR(300),
  cNameShop VARCHAR(300) DEFAULT 'pcs',  -- Shop name on platform
  cProvider VARCHAR(1) DEFAULT '4',  -- 1=1688, 2=Taobao, 3=Tmall, 4=Shops, 5=Nice
  cImages VARCHAR(300),  -- Main product image URL
  cPrice DECIMAL(10,2),  -- Price in CNY
  cAmount INT,  -- Quantity
  cColor VARCHAR(200),
  cSize VARCHAR(200),
  userID VARCHAR(30),
  FOREIGN KEY (userID) REFERENCES tb_user(userID)
)
```

**Provider Mapping:**
- `1`: 1688.com
- `2`: Taobao
- `3`: Tmall
- `4`: Shops (PCS's own products or other sources)
- `5`: Nice (other Chinese platform)

**Cart Logic:**
- Items stay in cart until checked out or deleted
- No expiration
- Can add same item with different variations (color/size)

#### **5.2.5 tb_shops (Shopping Orders)**

```sql
CREATE TABLE `tb_shops` (
  ID BIGINT PRIMARY KEY AUTO_INCREMENT,
  sDate DATETIME,  -- Order creation date
  sStatus VARCHAR(2) DEFAULT '1',
  sProvider VARCHAR(1),
  sDetails TEXT,
  sURL VARCHAR(300),
  sTitle VARCHAR(300),
  sNameShop VARCHAR(300),
  sImages VARCHAR(300),
  sPrice DECIMAL(10,2),  -- Product price CNY
  sAmount INT,
  sColor VARCHAR(200),
  sSize VARCHAR(200),
  sPriceTotal DECIMAL(10,2),  -- sPrice * sAmount in THB
  sServiceFee DECIMAL(10,2) DEFAULT 0,  -- PCS service fee
  sShipCHN DECIMAL(10,2) DEFAULT 0,  -- China domestic shipping
  sPayTotal DECIMAL(10,2),  -- Total = sPriceTotal + sServiceFee + sShipCHN
  userID VARCHAR(30),
  FOREIGN KEY (userID) REFERENCES tb_user(userID)
)
```

**Status Values:**
- `1`: Cart / Pending
- `2`: Waiting Payment
- `3`: Paid, Processing
- `4`: Ordered from supplier
- `5`: Arrived China warehouse
- `6`: Shipped to Thailand
- `7`: Arrived Thailand
- `8`: Out for delivery
- `9`: Delivered
- `0`: Cancelled

**Price Calculation:**
```
sPriceTotal = sPrice (CNY) * exchangeRate * sAmount
sServiceFee = sPriceTotal * serviceFeeRate (e.g., 5%)
sPayTotal = sPriceTotal + sServiceFee + sShipCHN
```

#### **5.2.6 tb_forwarder (Import Orders)**

```sql
CREATE TABLE `tb_forwarder` (
  ID BIGINT PRIMARY KEY AUTO_INCREMENT,
  fDate DATETIME,
  fStatus VARCHAR(2) DEFAULT '1',
  paydeposit VARCHAR(1),  -- 1=deposit payment required
  fPallet VARCHAR(100),  -- Pallet/Container number
  fDateStatus2 DATETIME,  -- Date entered each status
  fDateStatus3 DATETIME,
  fDateStatus4 DATETIME,  -- Arrived Thailand
  fDateStatus5 DATETIME,
  fDateStatus6 DATETIME,
  fDateStatus7 DATETIME,
  fDateKey DATETIME,  -- Date tracking entered
  fWarehouseChina VARCHAR(1),  -- 1=Guangzhou, 2=Yiwu
  fWarehouseName VARCHAR(1),  -- 1=SAI, 2=CTT, 3=MK, 4=MX, etc.
  fTransportType VARCHAR(1),  -- 1=Sea, 2=Air, 3=Express
  fCabinetNumber VARCHAR(300),  -- Container/Flight number
  fIDorCO VARCHAR(30),  -- Container ID or other ref
  fTrackingCHN VARCHAR(50),  -- China tracking
  fTrackingCHN2 VARCHAR(100),  -- Alternate tracking
  fDateToThai DATETIME,  -- Estimated arrival Thailand
  fDateContainerClose DATETIME,  -- Container closing date
  fAmount INT,  -- Number of items
  fDetail TEXT,
  fCover VARCHAR(255),  -- Cover image
  fProductsType VARCHAR(1),  -- Type of goods
  fWeight DECIMAL(10,2),  -- Total weight (kg)
  fWidth DECIMAL(10,2),  -- cm
  fLength DECIMAL(10,2),  -- cm
  fHeight DECIMAL(10,2),  -- cm
  fVolume DECIMAL(10,5),  -- CBM (cubic meters)
  fShippingService DECIMAL(10,2),  -- Total shipping cost
  fShipBy VARCHAR(2),  -- Shipping provider (DHL, Flash, Kerry, etc.)
  fTrackingThai VARCHAR(50),  -- Thailand tracking
  userID VARCHAR(50),
  FOREIGN KEY (userID) REFERENCES tb_user(userID)
)
```

**Status Flow:**
- `1`: Draft / Info pending
- `2`: Tracking received, waiting goods
- `3`: Goods received China warehouse
- `4`: Arrived Thailand
- `5`: Waiting payment
- `6`: Paid, ready to ship
- `7`: Out for delivery
- `8`: Delivered

**Warehouse China:**
- `1`: Guangzhou (广州)
- `2`: Yiwu (义乌)

**Warehouse Names (Partners):**
- `1`: SAI
- `2`: CTT
- `3`: MK
- `4`: MX
- `5`: JMF
- `6`: GOGO
- `7`: CargoCenter
- `8`: MOMO

**Transport Type:**
- `1`: Sea freight (ทางเรือ) - Cheapest, slowest
- `2`: Air freight (ทางเครื่องบิน) - Mid-range
- `3`: Express (ด่วนพิเศษ) - Fastest, most expensive

**Shipping Provider (fShipBy):**
- `1`: DHL Express
- `2`: Flash Express
- `3`: J.K. เอ็กซ์เพรส
- `4`: Kerry Express
- `5`: Nim Express
- `6`: S & J ขนส่งด่วนสุพรรณบุรี
- `7`: SB สมใจขนส่ง
- `8`: SCG Express

#### **5.2.7 tb_forwarder_item (Import Line Items)**

```sql
CREATE TABLE `tb_forwarder_item` (
  ID BIGINT PRIMARY KEY AUTO_INCREMENT,
  productID BIGINT,
  productName VARCHAR(255),
  productTracking VARCHAR(255),
  productTrackingNote TEXT,
  productQTY INT,
  productBagID BIGINT,  -- Bag/Package ID in warehouse
  productWidth DECIMAL(10,2),  -- Per item dimensions
  productLength DECIMAL(10,2),
  productHeight DECIMAL(10,2),
  productWeightPerItem DECIMAL(10,2),
  productWeightAll DECIMAL(10,2),  -- Total weight
  productCBMPerItem DECIMAL(10,2),
  productCBMAll DECIMAL(10,2),  -- Total volume
  productWeightFormat VARCHAR(100),  -- Display format
  productTypeCode VARCHAR(5),
  containerCode VARCHAR(200),
  userID VARCHAR(50),
  fID BIGINT,  -- Foreign key to tb_forwarder
  date DATETIME,
  lastTimeUpdated DATETIME,
  adminID VARCHAR(50),  -- Admin who created
  adminIDUpdated VARCHAR(50),  -- Admin who last updated
  domesticShippingChina DECIMAL(10,2),  -- China domestic shipping cost
  chinaWoodenCrateFeeType VARCHAR(1),  -- 1=no crate, 2=wooden crate
  chinaWoodenCrateFee DECIMAL(10,2),
  locationWTH VARCHAR(20),  -- Location WxTxH
  otherServiceFee DECIMAL(10,2),  -- Other services (inspection, photos, etc.)
  thailandDeliveryFee DECIMAL(10,2),  -- Delivery within Thailand
  fRefPrice VARCHAR(1),  -- 1=use weight, 2=use volume
  FOREIGN KEY (fID) REFERENCES tb_forwarder(ID),
  FOREIGN KEY (userID) REFERENCES tb_user(userID)
)
```

**CBM Calculation:**
```
CBM (m³) = (Width cm × Length cm × Height cm) / 1,000,000
CBM All = CBM Per Item × Quantity
```

**Weight Format:**
- Actual weight vs Volumetric weight
- Takes higher of the two for pricing

**Crate Options:**
- `1`: No crate (standard cardboard)
- `2`: Wooden crate (extra protection, required for fragile/heavy items)

#### **5.2.8 tb_forwarder_img (Import Images)**

```sql
CREATE TABLE `tb_forwarder_img` (
  ID BIGINT PRIMARY KEY AUTO_INCREMENT,
  img VARCHAR(255),  -- Image filename
  fID BIGINT,
  FOREIGN KEY (fID) REFERENCES tb_forwarder(ID)
)
```

**Image Types:**
- Package photos from China warehouse
- Inspection photos
- Damage reports
- Delivery confirmation

#### **5.2.9 tb_payment (Payment Requests)**

```sql
CREATE TABLE `tb_payment` (
  ID BIGINT PRIMARY KEY AUTO_INCREMENT,
  pDate DATETIME,
  pStatus VARCHAR(2) DEFAULT '1',
  pAmount DECIMAL(10,2),  -- Amount to pay in CNY
  pDetail TEXT,  -- Payment description
  pServiceFee DECIMAL(10,2) DEFAULT 0,  -- PCS service fee
  pPayTotal DECIMAL(10,2),  -- Total in THB
  userID VARCHAR(30),
  FOREIGN KEY (userID) REFERENCES tb_user(userID)
)
```

**Status:**
- `1`: Pending
- `2`: Processing
- `3`: Paid
- `4`: Failed
- `5`: Refunded

**Use Cases:**
- Pay Chinese supplier directly
- Top-up Taobao/Alipay account
- Pay shipping fees in China
- Buy products customer can't buy themselves

#### **5.2.10 tb_wallet (Wallet Transactions)**

```sql
CREATE TABLE `tb_wallet` (
  ID BIGINT PRIMARY KEY AUTO_INCREMENT,
  wDate DATETIME,
  wType VARCHAR(1),  -- 1=top-up, 2=withdraw, 3=payment, 4=refund
  wAmount DECIMAL(10,2),  -- Transaction amount
  wBalance DECIMAL(10,2),  -- Balance after transaction
  wDetail TEXT,
  wStatus VARCHAR(1) DEFAULT '1',  -- 1=completed, 2=pending, 3=failed
  userID VARCHAR(30),
  FOREIGN KEY (userID) REFERENCES tb_user(userID)
)
```

**Transaction Types:**
- `1`: Top-up (เติมเงิน) - Customer adds money
- `2`: Withdraw (ถอนเงิน) - Customer withdraws
- `3`: Payment (ชำระ) - Used for order payment
- `4`: Refund (คืนเงิน) - Order cancelled
- `5`: Commission (คอมมิชชั่น) - Agent earnings
- `6`: Adjustment (ปรับยอด) - Admin correction

**Balance Calculation:**
- Running balance maintained
- Each transaction updates wBalance
- Negative balance not allowed (except VIP credit)

#### **5.2.11 tb_account_pcs (Company Bank Accounts)**

```sql
CREATE TABLE `tb_account_pcs` (
  ID BIGINT PRIMARY KEY AUTO_INCREMENT,
  bankName VARCHAR(300),  -- Bank name or type
  accountNumber VARCHAR(300),
  accountName VARCHAR(300),  -- Account holder name
  adminID VARCHAR(30),  -- Admin who added
  FOREIGN KEY (adminID) REFERENCES tb_admin(adminID)
)
```

**Bank Name Codes:**
- `1`: Chinese bank account (CNY)
- `2`: Kasikorn Bank (THB)
- `3`: SCB (THB)
- `4`: Bangkok Bank (THB)
- `5`: Krungthai Bank (THB)
- `8`: PromptPay

---

## 6. Member System

### 6.1 Member Dashboard Overview

**URL:** `/member/` or `/member/index.php`

**Layout:**
- Header (Red bar): Exchange rates, user menu
- Sidebar (Dark): Navigation menu
- Main Content: Stats cards + Recent orders table

**Dashboard Components:**

1. **Stats Cards (6-8 cards):**
   - Total orders value this month
   - Pending payments
   - Wallet balance
   - Active imports
   - Recent activity count

2. **Filter Tabs:**
   - All orders
   - Waiting payment
   - Processing
   - Shipped
   - Delivered

3. **Orders Table:**
   - Order ID (clickable)
   - Date
   - Customer info
   - Status badge
   - Amount
   - Actions (view, cancel)

4. **Notification Popups:**
   - Credit due reminders (1 day, 3 days)
   - Past due warnings
   - Order status updates
   - Promotional announcements

### 6.2 Authentication

#### **6.2.1 Login Page**

**URL:** `/member/login.php`

**Form Fields:**
- Phone number OR email
- Password
- Remember me (checkbox)

**Validation:**
- Phone: 10 digits, starts with 0
- Email: valid email format
- Password: minimum 6 characters

**Backend Process:**
```php
1. Sanitize inputs
2. Query tb_user by phone OR email
3. Verify password (bcrypt)
4. Check userStatus = '1' (active)
5. Update userLastLogin
6. Create PHP session
7. Redirect to dashboard
```

**Error Messages:**
- "เบอร์โทรหรืออีเมลไม่ถูกต้อง" - Wrong phone/email
- "รหัสผ่านไม่ถูกต้อง" - Wrong password
- "บัญชีถูกระงับ" - Account suspended

#### **6.2.2 Registration**

**URL:** `/member/register.php`

**Form Fields:**
- First name
- Last name
- Phone number (unique)
- Email (unique)
- Password
- Confirm password
- (Optional) Referral code

**Validation:**
- All fields required
- Phone: 10 digits, not already registered
- Email: valid format, not already registered
- Password: min 6 chars, match confirm
- Referral code: must exist in agent list

**Backend Process:**
```php
1. Validate all inputs
2. Check phone/email uniqueness
3. Hash password (bcrypt)
4. Generate userID (PCS + next sequential number)
5. Insert into tb_user
6. If referral code: link to agent
7. Send welcome SMS/email
8. Auto-login
9. Redirect to tutorial/dashboard
```

#### **6.2.3 Password Recovery**

**URL:** `/member/recover.php`

**Process:**
1. Enter phone number
2. System sends OTP via SMS
3. Verify OTP
4. Set new password
5. Redirect to login

**OTP Details:**
- 6-digit code
- Valid for 5 minutes
- Max 3 attempts
- Rate limit: 1 OTP per minute

### 6.3 Shopping Service (ฝากสั่งสินค้า)

#### **6.3.1 Product Search**

**Features:**
- Search by URL (paste 1688/Taobao link)
- Search by keyword
- Search by image upload
- Browse trending products

**URL Parsing:**
```javascript
// Extract product ID from various URL formats
1688: detail.1688.com/offer/[PRODUCT_ID].html
Taobao: item.taobao.com/item.htm?id=[PRODUCT_ID]
Tmall: detail.tmall.com/item.htm?id=[PRODUCT_ID]
```

**Data Scraped:**
- Product title
- Main image + gallery images
- Price (range if variants)
- Shop name
- Available colors/sizes
- Stock status
- Shipping options

#### **6.3.2 Shopping Cart**

**URL:** `/member/cart.php`

**Features:**
- Add items from search
- Update quantity
- Select color/size variants
- Remove items
- Save for later
- Bulk actions (select multiple items)

**Cart Calculations:**
```javascript
// Per item
itemSubtotal = price_cny * exchange_rate * quantity

// Cart totals
subtotal = sum(all itemSubtotals)
service_fee = subtotal * service_fee_rate (e.g., 5%)
china_shipping = calculated based on items
total = subtotal + service_fee + china_shipping
```

**UI Elements:**
- Product image thumbnail
- Title (truncated)
- Price in CNY and THB
- Color/size dropdowns
- Quantity spinner
- Remove button
- Subtotal per item

**Actions:**
- "เพิ่มสินค้า" - Add more items
- "คำนวณราคา" - Recalculate
- "สั่งซื้อ" - Checkout

#### **6.3.3 Checkout**

**URL:** `/member/cart.php?action=checkout`

**Steps:**

**Step 1: Review Items**
- List all cart items
- Show individual prices
- Allow last-minute qty changes

**Step 2: Price Breakdown**
```
สินค้า (Product):          ¥1,234.56 = ฿5,432.10
ค่าบริการ (Service 5%):              ฿271.61
ค่าส่งจีน (China Ship):              ฿150.00
─────────────────────────────────────────────
รวมทั้งหมด (Total):                   ฿5,853.71
```

**Step 3: Payment Method**
- Wallet balance (if sufficient)
- Bank transfer (show account details)
- Credit (if VIP)

**Step 4: Confirmation**
- Generate order number
- Deduct from wallet OR mark "waiting payment"
- Send confirmation SMS/email
- Clear cart
- Redirect to order details

#### **6.3.4 Orders List**

**URL:** `/member/shops.php`

**Filters:**
- All orders
- Waiting payment (status=2)
- Processing (status=3,4,5)
- Shipping (status=6,7,8)
- Delivered (status=9)
- Cancelled (status=0)

**Table Columns:**
- Order ID (PCS######)
- Date
- Product (image + title)
- Quantity
- Amount
- Status badge
- Actions

**Status Badges:**
```html
<span class="badge badge-warning">รอชำระเงิน</span>
<span class="badge badge-info">กำลังดำเนินการ</span>
<span class="badge badge-primary">จัดส่งแล้ว</span>
<span class="badge badge-success">สำเร็จ</span>
<span class="badge badge-danger">ยกเลิก</span>
```

**Actions:**
- View details
- Track shipping
- Cancel (if status < 4)
- Reorder
- Contact support

#### **6.3.5 Order Details**

**URL:** `/member/shops.php?id=[ORDER_ID]`

**Information Displayed:**

**Order Summary:**
- Order number
- Order date
- Current status
- Estimated delivery

**Product Details:**
- Images
- Title
- Shop name
- Color/Size selected
- Quantity
- Unit price (CNY)
- Subtotal (THB)

**Tracking Timeline:**
```
✅ สั่งซื้อเรียบร้อย          2026-05-15 10:30
⏳ ชำระเงิน                 2026-05-15 14:20
⏳ สั่งซื้อจากร้านค้า         รอดำเนินการ
⭕ ได้รับสินค้าที่คลังจีน     -
⭕ จัดส่งจากจีน              -
⭕ ถึงไทย                   -
⭕ จัดส่งภายในไทย            -
⭕ ส่งสำเร็จ                 -
```

**Payment Details:**
- Payment method
- Amount paid
- Transaction ID
- Date paid

**Delivery Info:**
- Delivery address
- Recipient name
- Phone number
- Tracking number (when available)

**Actions:**
- Download invoice
- Contact support
- Cancel order (if eligible)

### 6.4 Forwarding Service (ฝากนำเข้า)

#### **6.4.1 Create Import Order**

**URL:** `/member/forwarder/add/` or `/member/forwarder.php?action=add`

**Form Fields:**

**Section 1: Warehouse Info**
- Warehouse location: (Guangzhou / Yiwu)
- Warehouse name: (SAI / CTT / MK / etc.)
- China tracking number(s)
- Expected arrival date at warehouse

**Section 2: Transport**
- Transport type: (Sea / Air / Express)
- Container/Flight number (if known)

**Section 3: Package Details (Can add multiple items)**
Per Item:
- Item name/description
- Tracking number (China)
- Quantity
- Dimensions: Width × Length × Height (cm)
- Weight per item (kg)
- Upload images (optional)

**Section 4: Value-Added Services**
- Wooden crate? (Yes/No) - Extra fee
- Inspection? (Yes/No) - Extra fee
- Extra photos? (Yes/No) - Extra fee
- Insurance? (Yes/No) - % of value

**Section 5: Delivery in Thailand**
- Delivery address (select from saved addresses)
- Shipping provider (DHL/Flash/Kerry/etc.)
- Delivery speed (Standard/Express)

**Calculations:**
```javascript
// Shipping Cost Calculation
weight_kg = sum(all item weights)
volume_cbm = sum((W × L × H) / 1000000 for all items)

// Volumetric weight
volumetric_weight = volume_cbm * 167 (air) or * 1000 (sea)

// Chargeable weight
chargeable_weight = max(actual_weight, volumetric_weight)

// Base shipping cost
if (transport_type === 'sea') {
  base_rate = 25 THB/kg  // Example rate
} else if (transport_type === 'air') {
  base_rate = 45 THB/kg
} else {  // express
  base_rate = 85 THB/kg
}

shipping_cost = chargeable_weight * base_rate

// Add-ons
crate_fee = has_crate ? (volume_cbm * 1000) : 0  // 1000 THB/CBM
inspection_fee = needs_inspection ? 200 : 0
photo_fee = extra_photos ? 100 : 0

// Thailand delivery
delivery_fee = calculate_by_zone_and_weight(zipcode, weight_kg)

// Total
total = shipping_cost + crate_fee + inspection_fee + photo_fee + delivery_fee
```

**Validation:**
- At least one item required
- Tracking number mandatory
- Dimensions mandatory (for cost calculation)
- Weight mandatory

**Submission:**
1. Save to `tb_forwarder` (main record)
2. Save items to `tb_forwarder_item`
3. Set status = '1' (draft)
4. Generate import ID (auto-increment)
5. Show price estimate
6. Await goods arrival at China warehouse

#### **6.4.2 Import Orders List**

**URL:** `/member/forwarder.php`

**Filters:**
- All imports
- Draft (status=1)
- Waiting goods (status=2)
- Arrived China (status=3)
- Arrived Thailand (status=4)
- Waiting payment (status=5)
- Ready to ship (status=6)
- Shipping (status=7)
- Delivered (status=8)

**Credit Filter (VIP only):**
- Credit orders (paydeposit=1)

**Table Columns:**
- Import ID
- Tracking numbers (China)
- Status
- Weight/Volume
- Amount
- Delivery address
- Actions

**Actions:**
- View details
- Upload images
- Update tracking
- Pay now (if status=5)
- Cancel (if status < 4)

#### **6.4.3 Import Details**

**URL:** `/member/forwarder.php?id=[IMPORT_ID]`

**Displayed Info:**

**Import Summary:**
- Import ID
- Creation date
- Current status
- Warehouse location
- Transport type

**Package Information:**
- Total items
- Total weight
- Total volume (CBM)
- Container/Flight number
- China tracking numbers
- Thailand tracking number (when available)

**Items List Table:**
- Item name
- Tracking
- Dimensions
- Weight
- Images

**Cost Breakdown:**
```
ค่าขนส่งจีน-ไทย (Shipping):           ฿1,250.00
ค่าตีลังไม้ (Wooden Crate):            ฿300.00
ค่าตรวจสอบสินค้า (Inspection):         ฿200.00
ค่าจัดส่งในไทย (Thailand Delivery):    ฿150.00
─────────────────────────────────────────────
รวมทั้งหมด (Total):                      ฿1,900.00
```

**Status Timeline:**
```
✅ สร้างรายการ             2026-05-15 09:00
✅ กรอกเลขพัสดุจีน          2026-05-15 09:15
✅ ได้รับสินค้าที่คลังจีน    2026-05-17 16:30
⏳ ถึงไทย                  2026-05-22 (คาดการณ์)
⭕ ชำระเงิน                รอ
⭕ จัดส่งในไทย              -
⭕ ส่งสำเร็จ                -
```

**Images Gallery:**
- Package photos from China warehouse
- Inspection photos (if requested)
- Delivery confirmation

**Actions:**
- Download receipt
- Pay now
- Update tracking
- Contact support
- Print label

#### **6.4.4 Payment Process**

When status changes to '5' (Waiting Payment):

**Notification:**
- SMS: "รายการนำเข้า F##### มีค่าใช้จ่าย ฿1,900 กรุณาชำระภายใน 3 วัน"
- Email with payment details
- In-app notification

**Payment Page:**
- Show final cost breakdown
- Payment methods:
  - Wallet (if balance sufficient)
  - Bank transfer
  - Credit (if VIP)

**After Payment:**
- Status → '6' (Ready to ship)
- Notify warehouse staff
- Prepare for Thailand delivery

### 6.5 Payment Service (ฝากชำระ/โอน)

#### **6.5.1 Create Payment Request**

**URL:** `/member/payment/add/`

**Use Cases:**
- Pay Chinese supplier directly
- Top-up Alipay/WeChat
- Buy products customer can't purchase
- Pay shipping fees in China

**Form:**
- Amount to pay (CNY)
- Recipient info:
  - Name
  - Alipay/WeChat ID OR
  - Bank account (China)
- Purpose/Description
- Upload supporting documents:
  - Invoice
  - Supplier chat screenshot
  - Payment instructions

**Calculation:**
```javascript
amount_cny = input_amount
amount_thb = amount_cny * exchange_rate
service_fee = amount_thb * 0.03  // 3% fee
total = amount_thb + service_fee
```

**Submission:**
1. Create record in `tb_payment`
2. Status = '1' (Pending review)
3. Admin reviews within 24 hours
4. If approved → customer pays
5. PCS makes payment in China
6. Upload payment proof
7. Status = '3' (Completed)

#### **6.5.2 Payment Requests List**

**URL:** `/member/payment/`

**Table:**
- Request ID
- Date
- Amount (CNY → THB)
- Recipient
- Status
- Actions

**Actions:**
- View details
- Pay now (if approved)
- Cancel (if pending)
- View proof (if completed)

### 6.6 Wallet System

#### **6.6.1 Wallet Dashboard**

**URL:** `/member/wallet/`

**Main Display:**
```
┌─────────────────────────────────────┐
│  กระเป๋าสตางค์เงินสด (Cash Wallet)  │
│                                     │
│  ยอดคงเหลือ:  ฿12,345.67           │
│                                     │
│  [เติมเงิน]  [ถอนเงิน]              │
└─────────────────────────────────────┘

รายการเดินบัญชี:
─────────────────────────────────────
วันที่              | รายการ           | จำนวน      | คงเหลือ
2026-05-19 10:30  | เติมเงิน          | +5,000.00 | 12,345.67
2026-05-18 14:20  | ชำระค่าสินค้า      | -2,500.00 |  7,345.67
2026-05-17 09:15  | คืนเงินยกเลิก      | +1,200.00 |  9,845.67
```

**Filter Options:**
- Date range
- Transaction type (all/top-up/withdraw/payment/refund)
- Amount range

**Export:**
- Download as PDF
- Download as Excel

#### **6.6.2 Top-up (เติมเงิน)**

**URL:** `/member/wallet/add/`

**Methods:**

**1. Bank Transfer:**
- Show PCS bank accounts
- Customer transfers money
- Upload slip
- Admin verifies (manual or auto via QR)
- Wallet credited

**2. QR Code Payment (PromptPay):**
- Enter amount
- Generate QR code
- Customer scans & pays
- Auto-verification via payment gateway
- Instant credit

**Process:**
```
1. Customer enters amount (min 100 THB)
2. System shows payment instructions
3. Customer makes payment
4. Upload slip OR auto-verify
5. Admin approves (if manual)
6. Create wallet transaction (wType='1')
7. Update wallet balance
8. Send confirmation SMS/email
```

**Limits:**
- Minimum: 100 THB
- Maximum: 100,000 THB per transaction
- Daily limit: 200,000 THB

#### **6.6.3 Withdraw (ถอนเงิน)**

**URL:** `/member/wallet/withdraw/`

**Requirements:**
- Minimum balance: 100 THB
- Verified bank account

**Form:**
- Withdrawal amount
- Bank account (select from saved)
- Purpose/Note (optional)

**Validation:**
- Amount ≤ current balance
- Amount ≥ 100 THB
- Bank account verified

**Process:**
```
1. Customer submits request
2. Create wallet transaction (wType='2', wStatus='2' pending)
3. Admin reviews (check for fraud)
4. Admin transfers money
5. Update transaction status to '1' (completed)
6. Deduct from wallet balance
7. Send confirmation
```

**Processing Time:**
- Business days: 2-4 hours
- Weekends/Holidays: Next business day

**Fees:**
- Free for amounts > 500 THB
- 20 THB fee for amounts < 500 THB

#### **6.6.4 Credit Wallet (VIP Only)**

**URL:** `/member/wallet-credit/`

**Differences from Cash Wallet:**
- Negative balance allowed (up to credit limit)
- Due dates for payment
- Interest on overdue amounts
- Payment history tracking

**Credit Info Display:**
```
┌──────────────────────────────────────┐
│  กระเป๋าสตางค์เครดิต (Credit Wallet) │
│                                      │
│  วงเงินเครดิต:     ฿50,000.00        │
│  ใช้ไปแล้ว:        ฿12,345.67        │
│  คงเหลือ:          ฿37,654.33        │
│                                      │
│  ครั้งถัดไปครบกำหนด: 2026-05-25     │
│  ยอดที่ต้องชำระ:    ฿8,500.00        │
└──────────────────────────────────────┘
```

**Payment Schedule:**
- Net 7: Pay within 7 days
- Net 15: Pay within 15 days
- Net 30: Pay within 30 days (VIP only)

**Overdue Penalties:**
- 1-7 days late: 2% interest
- 8-14 days late: 5% interest
- 15+ days late: 10% interest + credit suspended

**Credit Limit Calculation:**
- Based on order history
- Reviewed monthly
- Can be increased upon request (with approval)

### 6.7 Address Management

#### **6.7.1 Address List**

**URL:** `/member/address/`

**Display:**
- Cards layout
- Each card shows:
  - Recipient name
  - Phone number
  - Full address
  - "Default" badge (if default address)
  - Edit/Delete buttons

**Actions:**
- Add new address
- Edit existing
- Delete
- Set as default

#### **6.7.2 Add/Edit Address**

**URL:** `/member/address/add/` or `/member/address/edit/[ID]`

**Form Fields:**
- Recipient name
- Last name
- Phone number
- Alternative phone (optional)
- Address line (house/building number, soi, road)
- Sub-district (ตำบล/แขวง) - Autocomplete
- District (อำเภอ/เขต) - Autocomplete
- Province (จังหวัด) - Autocomplete
- ZIP Code - Auto-filled from district
- Delivery notes (optional)
- Set as default (checkbox)

**Validation:**
- All required fields must be filled
- Phone: 10 digits
- ZIP code: 5 digits
- Province/District/Sub-district must match

**Address Autocomplete:**
- Uses Thai address database
- Type district → suggests provinces
- Select district → auto-fills ZIP

**Map Integration (Future):**
- Show pin on map
- Adjust location
- Save lat/long for delivery optimization

### 6.8 Profile & Settings

#### **6.8.1 Profile Page**

**URL:** `/member/profile/`

**Sections:**

**Personal Information:**
- Profile picture (upload/change)
- First name
- Last name
- Email (verified badge)
- Phone (verified badge)
- Date of birth
- Gender

**Account Information:**
- User ID (PCS####)
- Member since
- Account status (Active/VIP)
- Assigned sales rep (name + phone)

**Verification Status:**
- Email verified: ✅/❌
- Phone verified: ✅/❌
- ID card verified: ✅/❌ (For VIP upgrade)

**Actions:**
- Edit profile
- Change password
- Verify email
- Verify phone
- Upload ID card

#### **6.8.2 Account Settings**

**URL:** `/member/account-settings/`

**Security:**
- Change password
- Two-factor authentication (future)
- Active sessions
- Login history

**Notifications:**
- Email notifications (on/off)
- SMS notifications (on/off)
- Push notifications (mobile app)
- Notification preferences:
  - Order updates
  - Payment confirmations
  - Promotions
  - System announcements

**Language:**
- Thai (default)
- English (future)
- Chinese (future)

**Privacy:**
- Make profile public/private
- Show/hide order history to agent
- Data download request (GDPR)

---

## 7. Admin System

### 7.1 Admin Dashboard

**URL:** `/member/pcs-admin/`

**Layout Similar to Member:**
- Red header with stats
- Dark sidebar with admin menus
- Main content area

**Dashboard Stats:**
```
┌─────────────────────────────────────────────────────┐
│  ฝากลัง: 4.97  |  ฝากโอน: 4.93  |  Sale: 4.95  |  Pro: 4.92  │
└─────────────────────────────────────────────────────┘

┌──────────────────┬──────────────────┬──────────────────┐
│  ฿3,271,251.06   │  ฿94,995.18      │  ฿0              │
│  ยอดฝากลังซื้อ    │  ยอดฝากนำเข้า     │  ยอดฝากโอน       │
│  พฤษภาคม 2026   │  วันนี้           │  วันนี้           │
└──────────────────┴──────────────────┴──────────────────┘

┌──────────────────┬──────────────────┬──────────────────┐
│  137,269.15 บาท  │  1,964           │  6,945           │
│  กระเป๋าสตางค์    │  ลูกค้าใช้งานแล้ว │  ลูกค้ายังไม่ใช้งาน│
└──────────────────┴──────────────────┴──────────────────┘
```

**Quick Filters (Tabs with Counts):**
- ลูกค้าที่ยังไม่ใช้งาน (449)
- เติมเงิน (2)
- เครดิตคงเหลือ
- ตอบชม (1)
- ส่งต่อระบบอินพอร์ต (2)
- รอชำระเงินอินพอร์ต (33)
- รอชำเนิบอด (3)
- รอมีให้กับเด็บ (77)
- รอได้โอนวันนั้น (1181)
- เครดิตอ่อ (273)
- กำลังขนถ่ายทับมูร (15)
- รางที่หวจ (1252)

**Orders Table:**
- Similar to member view
- But shows ALL customers
- Additional columns:
  - Customer ID
  - Assigned sales
- Additional actions:
  - Edit order
  - Change status
  - Assign to sales
  - Print documents

### 7.2 Admin Sidebar Menu

**Dashboard**
- Main dashboard (stats overview)

**Cargo & Freight Section:**

**ฝากบริพยากรบุคคล** (HR/Staff Management)
- List all admins
- Add/edit/deactivate staff
- Assign roles and permissions
- View staff activity logs

**QA & QC**
- Quality assurance dashboard
- Inspect imports before shipping
- Mark issues/damages
- Photo documentation
- Approve/reject for shipping

**จัดตระลูกค้า (5)** (Customer Management)
- Search customers
- View customer details
- Customer activity history
- Assign to sales reps
- Upgrade to VIP
- Credit limit management
- Suspend/activate accounts

**รายการปกแก้น (21)** (Problem Orders)
- Orders with issues
- Missing information
- Payment problems
- Disputes
- Refund requests

**Freight Section:**

**ระบบบันฑิตฺ Freight**
- Freight shipment management
- Container tracking
- Customs documentation
- Arrival schedules

**Cargo Section:**

**กระเป๋าสตางค์ (8)** (Wallet Management)
- Pending top-up approvals (8)
- Verify bank slips
- Approve/reject top-ups
- Process withdrawals
- View all wallet transactions
- Adjust balances (with reason)

**บริการฝากลังสินค้า (2)** (Shopping Service Orders)
- All shopping orders
- Filter by status
- Bulk actions
- Export to Excel

**ค้นหาฝากลังซื้อ** (Search Orders)
- Advanced search
- By order ID
- By customer
- By date range
- By product
- By status

**รายการส่งสินค้าทั่วไหน** (Delivery Management)
- Prepare packages for delivery
- Print shipping labels
- Assign to delivery drivers
- Track deliveries

**รอชำเนิมบัน (2)** (Waiting Payment)
- Orders awaiting payment
- Send payment reminders
- Mark as paid
- Cancel overdue

**รถเข็นสินค้า** (All Carts)
- View all users' carts
- Abandoned cart analysis
- Convert to orders (assist customer)

**เพิ่มสินค้าที่ในรถเข็น** (Add to Cart for Customer)
- Admin can add items to customer cart
- Helps customers who can't navigate Chinese sites

**หนายแทคฝากง่าเด้ง (13)** (Warehouse Operations)
- Receive goods at China warehouse
- Scan barcodes
- Update tracking
- Take photos
- Mark ready to ship

**บริการฝากน่าเข้า (273)** (Forwarding Service)
- All import orders
- Filter by status
- Update tracking
- Process payments
- Assign delivery

**บริการฝากโอน/ย้าระ (13)** (Payment Service)
- Payment requests
- Review and approve
- Make payments in China
- Upload proof
- Mark completed

**ออกรายงาน** (Reports)
- Financial reports
- Sales reports
- Customer analytics
- Inventory reports
- Performance metrics

**รายงานรับรู้รายได้ Cargo** (Revenue Recognition)
- Accrual accounting
- Revenue by service type
- Pending recognition
- Recognized revenue
- Export for accounting

**ระบบบันฑิตฺ Cargo**
- Cargo manifest management
- Container loading plans
- Customs declarations

### 7.3 Customer Management

#### **7.3.1 Customer List**

**URL:** `/member/pcs-admin/customers/`

**Table Columns:**
- User ID (PCS####)
- Name
- Phone
- Email
- Registration date
- Last login
- Status (Active/Inactive/VIP)
- Credit status
- Assigned sales
- Total orders
- Total value
- Wallet balance
- Actions

**Filters:**
- Status: All/Active/Inactive/VIP
- Credit: Has credit/No credit/Overdue
- Sales rep: All/By sales person
- Registration: Date range
- Activity: Last 7d/30d/90d/Never

**Search:**
- By user ID
- By name
- By phone
- By email

**Bulk Actions:**
- Send notification
- Assign to sales
- Export to Excel
- Send promotion

#### **7.3.2 Customer Details**

**URL:** `/member/pcs-admin/customers/[USER_ID]`

**Tabs:**

**Overview:**
- Basic info
- Profile picture
- Status badges (VIP/Credit/Verified)
- Quick stats (orders, value, wallet)
- Assigned sales rep
- Registration date
- Last activity

**Orders:**
- All orders (shopping + imports + payments)
- Filter by type
- Filter by status
- Timeline view
- Total values

**Transactions:**
- Wallet history
- Payment history
- Refunds
- Adjustments

**Addresses:**
- All saved addresses
- Default marked
- Edit/delete

**Notes & Communication:**
- Admin notes (internal only)
- Communication history
- Phone calls logged
- Emails sent
- Support tickets

**Credit Info (if VIP):**
- Credit limit
- Used amount
- Available credit
- Payment schedule
- Payment history
- Overdue amounts

**Actions:**
- Edit customer info
- Send email/SMS
- Change status
- Upgrade to VIP
- Set credit limit
- Assign to sales
- Suspend account
- Delete account (with confirmation)

#### **7.3.3 Assign to Sales**

**Process:**
1. Select customer(s)
2. Choose sales rep from dropdown
3. Confirm assignment
4. Update tb_user.adminIDSale
5. Notify sales rep
6. Notify customer

**Rules:**
- One customer = one sales rep
- Can reassign at any time
- Sales earns commission on assigned customers' orders

#### **7.3.4 VIP Upgrade**

**Requirements:**
- Account active for 30+ days
- 10+ completed orders
- Total order value > 50,000 THB
- No payment issues
- ID verification completed

**Process:**
1. Review customer history
2. Verify ID documents
3. Set initial credit limit (e.g., 10,000 THB)
4. Set credit terms (Net 7/15/30)
5. Update tb_user.creditUser = 1
6. Notify customer
7. Explain credit terms

**Credit Limit Adjustment:**
- Review monthly
- Based on payment history
- Can increase/decrease
- Notify customer of changes

### 7.4 Order Management

#### **7.4.1 Shopping Orders**

**URL:** `/member/pcs-admin/shops/`

**Admin Actions:**

**Status Changes:**
- Mark as paid
- Change to processing
- Mark shipped
- Mark delivered
- Cancel order

**Edit Order:**
- Update quantity
- Update price
- Add/remove items
- Change delivery address

**Payment Verification:**
- View uploaded bank slip
- Verify payment
- Mark as paid OR reject with reason

**Customer Communication:**
- Send order update
- Request more info
- Notify of delays

**Bulk Actions:**
- Export selected orders
- Change status (multiple)
- Print packing lists
- Generate invoices

#### **7.4.2 Import Orders**

**URL:** `/member/pcs-admin/forwarder/`

**Additional Admin Features:**

**Warehouse Operations:**
- Scan packages in
- Take receiving photos
- Measure dimensions
- Weigh packages
- Check damages
- Update actual vs estimated

**Status Updates:**
- Goods received China
- Shipped to Thailand
- Arrived Thailand warehouse
- Payment confirmed
- Out for delivery
- Delivered

**Cost Adjustments:**
- If actual weight/volume differs from estimate
- Recalculate costs
- Notify customer of changes
- Request additional payment if needed

**Delivery Assignment:**
- Assign to delivery driver
- Generate delivery list
- Print shipping labels
- Track delivery status

#### **7.4.3 Payment Requests**

**URL:** `/member/pcs-admin/payments/`

**Review Process:**
1. Admin receives payment request
2. Review:
   - Amount reasonable?
   - Supporting documents valid?
   - Recipient info correct?
   - Any red flags?
3. Approve OR Reject with reason
4. If approved:
   - Customer pays PCS
   - PCS makes payment in China
   - Upload payment proof
   - Mark completed

**Rejection Reasons:**
- Insufficient documentation
- Suspicious recipient
- Amount too high (request verification)
- Duplicate request

### 7.5 Financial Management

#### **7.5.1 Wallet Approvals**

**URL:** `/member/pcs-admin/wallet/approvals/`

**Top-up Verification:**
- View uploaded bank slip
- Check amount matches
- Check transfer account matches
- Verify date/time
- Approve → credit wallet
- Reject → notify customer to resubmit

**Auto-verification (QR Code):**
- Payment gateway sends confirmation
- Auto-credit wallet
- Manual review only if flagged

**Withdrawal Processing:**
- Review withdrawal request
- Check customer balance
- Verify bank account
- Transfer money
- Upload transfer slip
- Mark completed
- Deduct from wallet

#### **7.5.2 Reports**

**Daily Sales Report:**
- Total orders by type
- Total revenue
- Total payments received
- Total payouts
- Net revenue

**Customer Analytics:**
- New customers today/week/month
- Active customers
- Churn rate
- Customer lifetime value
- Top customers

**Product Analytics:**
- Top products ordered
- Top shops/brands
- Average order value
- Order frequency

**Financial Reports:**
- Revenue by service type
- Exchange rate gains/losses
- Commission payouts
- Operating costs
- Profit margins

**Export Options:**
- PDF
- Excel
- CSV
- Send via email

---

## 8. Core Features

### 8.1 Exchange Rate Management

**Exchange Rates Display:**
- Buy rate (เรทลังซื้อ): Used when customer orders products
- Transfer rate (เรทโอน): Used for payment service
- Sale rate (เรท Sale): Special promotional rate
- Pro rate (เรท Pro): VIP/bulk order rate

**Rate Sources:**
- Manual entry by admin
- API integration (future)
- Updated daily
- Historical rates stored

**Rate Application:**
```javascript
// Shopping orders
thb_price = cny_price * buy_rate

// Payment service
thb_price = cny_price * transfer_rate

// VIP customers
thb_price = cny_price * pro_rate
```

### 8.2 Service Fee Calculation

**Shopping Service:**
```
Service Fee = Product Total × 5% (standard)
            = Product Total × 3% (VIP)
            = Product Total × 0% (promotional)
```

**Forwarding Service:**
```
Base Rate = Weight(kg) × Rate(THB/kg)
OR
Base Rate = Volume(CBM) × Rate(THB/CBM)
(Whichever is higher)

Additional:
+ Wooden Crate Fee (if selected)
+ Inspection Fee (if selected)
+ Extra Photos Fee (if selected)
+ Insurance (optional, % of value)
+ Thailand Delivery Fee (by zone)
```

**Payment Service:**
```
Service Fee = Amount × 3%
Minimum Fee = 50 THB
```

### 8.3 Shipping Cost Calculation

**China Domestic Shipping:**
- Based on seller's province
- Weight-based tiers
- Added to order total

**International Shipping (China → Thailand):**

**Sea Freight:**
- Rate: ~25 THB/kg
- Minimum: 30 days
- Best for heavy/bulky items

**Air Freight:**
- Rate: ~45 THB/kg
- Delivery: 7-14 days
- Balance of cost/speed

**Express:**
- Rate: ~85 THB/kg
- Delivery: 3-5 days
- Premium service

**Volumetric Weight:**
```
Volumetric Weight = (L × W × H cm) / 5000 (air)
                  = (L × W × H cm) / 6000 (sea)

Chargeable Weight = max(Actual Weight, Volumetric Weight)
```

**Thailand Domestic Delivery:**

**Zone Classification:**
```
Zone 1: Bangkok & vicinity
Zone 2: Central region
Zone 3: North/Northeast/South
Zone 4: Remote areas
```

**Rates by Zone & Weight:**
```
Zone 1:
  0-5 kg:    60 THB
  5-10 kg:   80 THB
  10-20 kg:  120 THB
  20+ kg:    120 + (excess × 5 THB/kg)

Zone 2:
  0-5 kg:    80 THB
  5-10 kg:   100 THB
  10-20 kg:  150 THB
  20+ kg:    150 + (excess × 6 THB/kg)

Zone 3:
  0-5 kg:    100 THB
  5-10 kg:   130 THB
  10-20 kg:  180 THB
  20+ kg:    180 + (excess × 7 THB/kg)

Zone 4:
  Contact for quote
```

**Free Shipping Thresholds:**
```
Orders > 5,000 THB: Free Zone 1
Orders > 10,000 THB: Free Zone 2
Orders > 20,000 THB: Free Zone 3
```

### 8.4 Promotions & Discounts

**Types:**

**Exchange Rate Promotions:**
- Special rates during festivals (e.g., 11.11, 12.12)
- Announced on dashboard
- Time-limited
- Applied automatically

**Service Fee Discounts:**
- New customer: First order free service fee
- VIP: Permanently reduced rate
- Bulk orders: Negotiate custom rate
- Referral: Fee discount for referrer & referee

**Shipping Promotions:**
- Free shipping weekends
- Minimum order for free shipping
- First import free crate

**Coupon System (Future):**
- Coupon codes
- Auto-apply based on conditions
- Single-use or multi-use
- Expiration dates

### 8.5 Notifications System

**Channels:**
- SMS (via Thai SMS gateway)
- Email (via PHPMailer)
- Line Notify (via Line API)
- In-app notifications
- Push notifications (mobile app)

**Trigger Events:**

**Order Updates:**
- Order confirmed
- Payment received
- Order placed with supplier
- Shipped from China
- Arrived Thailand
- Out for delivery
- Delivered

**Payment:**
- Payment due reminder (3 days before)
- Payment overdue
- Payment received
- Refund processed

**Wallet:**
- Top-up approved
- Withdrawal processed
- Low balance warning

**Promotions:**
- New promotion available
- Flash sale alert
- Expiring soon

**Admin:**
- New order requires review
- Customer service inquiry
- System alerts

### 8.6 Search & Filtering

**Product Search:**
- Parse URL (1688/Taobao/Tmall)
- Extract product ID
- Scrape product data
- Display in PCS format

**Image Search:**
- Upload image
- Reverse image search on Taobao/1688
- Show similar products
- Select to add to cart

**Keyword Search:**
- Search on 1688/Taobao
- Translate Thai → Chinese (basic)
- Display results
- Filter by price, rating, sales

**Order Search (Admin):**
- By order ID
- By customer name/ID/phone
- By product name
- By date range
- By status
- By amount range
- By assigned sales

---

## 9. Business Logic

### 9.1 Order Workflow - Shopping Service

```
1. Customer adds items to cart
   - Multiple items allowed
   - Can edit quantities/variants

2. Customer proceeds to checkout
   - Review cart
   - Calculate totals

3. Customer selects payment method
   a) Wallet: Deduct immediately, status → Processing
   b) Bank Transfer: Status → Waiting Payment
   c) Credit: Reserve credit, status → Processing

4. If bank transfer:
   - Customer uploads slip
   - Admin verifies (manual or auto)
   - If valid: status → Processing
   - If invalid: Request resubmission

5. PCS orders from Chinese supplier
   - Status → Ordered
   - Track supplier shipment

6. Goods arrive China warehouse
   - Status → Arrived China
   - Scan, inspect, photograph

7. Consolidate & ship to Thailand
   - Combine multiple orders if same customer
   - Status → Shipped to Thailand

8. Arrive Thailand warehouse
   - Status → Arrived Thailand
   - Prepare for delivery

9. Deliver to customer
   - Assign delivery driver
   - Status → Out for Delivery
   - Update tracking

10. Customer receives
    - Status → Delivered
    - Can rate/review

11. If problem at any stage:
    - Customer service intervenes
    - May cancel/refund
    - Status → Cancelled (if cancelled)
```

### 9.2 Order Workflow - Forwarding Service

```
1. Customer creates import order
   - Enter tracking numbers
   - Enter package details
   - Status → Draft

2. Customer submits
   - System calculates estimated cost
   - Status → Waiting Goods

3. Goods arrive China warehouse
   - Warehouse scans in
   - Take photos
   - Measure actual dimensions
   - Weigh
   - Status → Arrived China

4. Recalculate cost (if dimensions differ)
   - Notify customer if cost increased
   - Customer can cancel at this point

5. Ship to Thailand
   - Add to container/flight
   - Status → Shipped to Thailand
   - Update tracking

6. Arrive Thailand
   - Clear customs
   - Status → Arrived Thailand

7. Cost finalized
   - Status → Waiting Payment
   - Send invoice

8. Customer pays
   - Wallet OR Bank Transfer OR Credit
   - Status → Paid, Ready to Ship

9. Prepare for delivery
   - Assign shipping provider
   - Generate label
   - Status → Ready to Ship

10. Out for delivery
    - Status → Out for Delivery
    - SMS tracking to customer

11. Delivered
    - Signature/photo proof
    - Status → Delivered
```

### 9.3 Credit System Logic

**Credit Eligibility:**
```javascript
function isEligibleForCredit(user) {
  // Must meet ALL conditions
  return (
    user.accountAge >= 30 days AND
    user.completedOrders >= 10 AND
    user.totalOrderValue >= 50000 THB AND
    user.paymentIssues === 0 AND
    user.idVerified === true
  )
}
```

**Initial Credit Limit:**
```javascript
function calculateInitialCreditLimit(user) {
  avgOrderValue = user.totalOrderValue / user.completedOrders
  
  // 2x average order value, max 10,000 THB
  return min(avgOrderValue * 2, 10000)
}
```

**Credit Limit Increase:**
```javascript
function canIncreaseCredit(user) {
  return (
    user.creditUtilization < 80% AND
    user.onTimePayments >= 95% AND
    user.accountAge >= 90 days
  )
}

function calculateNewCreditLimit(user, currentLimit) {
  if (canIncreaseCredit(user)) {
    // Increase by 50%, max 100,000 THB
    return min(currentLimit * 1.5, 100000)
  }
  return currentLimit
}
```

**Payment Due Date:**
```javascript
function calculateDueDate(orderDate, terms) {
  switch(terms) {
    case 'Net7':
      return orderDate + 7 days
    case 'Net15':
      return orderDate + 15 days
    case 'Net30':
      return orderDate + 30 days
    default:
      return orderDate + 7 days
  }
}
```

**Overdue Interest:**
```javascript
function calculateOverdueInterest(amount, daysOverdue) {
  if (daysOverdue <= 7) {
    return amount * 0.02  // 2%
  } else if (daysOverdue <= 14) {
    return amount * 0.05  // 5%
  } else {
    return amount * 0.10  // 10%
  }
}
```

**Credit Suspension:**
```javascript
function shouldSuspendCredit(user) {
  return (
    user.daysOverdue > 14 OR
    user.missedPayments >= 3 OR
    user.overdueAmount > user.creditLimit * 0.5
  )
}
```

### 9.4 Commission Calculation (Agents)

**Agent Commission Structure:**
```javascript
// Commission tiers based on team monthly volume
function getCommissionRate(monthlyVolume) {
  if (monthlyVolume < 50000) return 0.02  // 2%
  if (monthlyVolume < 100000) return 0.03  // 3%
  if (monthlyVolume < 200000) return 0.04  // 4%
  return 0.05  // 5% for top performers
}

// Calculate agent commission
function calculateCommission(order) {
  // Only on service fees, not product cost
  serviceFee = order.serviceFee
  
  // Get agent's team volume this month
  agent = getAgent(order.referredBy)
  monthlyVolume = getTeamMonthlyVolume(agent.id)
  rate = getCommissionRate(monthlyVolume)
  
  commission = serviceFee * rate
  
  return commission
}
```

**Commission Payout:**
```javascript
// Process monthly commissions
function processMonthlyCommissions() {
  agents = getActiveAgents()
  
  for (agent of agents) {
    totalCommission = getMonthlyCommission(agent.id)
    
    if (totalCommission >= 500) {  // Minimum payout
      // Create wallet transaction
      creditAgentWallet(agent.userId, totalCommission, 'Commission')
      
      // Send notification
      notifyAgent(agent, totalCommission)
    }
  }
}
```

### 9.5 Inventory Management (Future)

**Currently:**
- No inventory tracking
- Orders placed on-demand

**Future Enhancement:**
- Track popular products
- Pre-purchase & stock in warehouse
- Faster delivery for stocked items
- Bulk discounts passed to customers

---

## 10. API Endpoints

### 10.1 Authentication APIs

```
POST /api/auth/login
Body: { phone, password }
Response: { success, token, user }

POST /api/auth/register
Body: { name, lastName, phone, email, password, referral }
Response: { success, userId, token }

POST /api/auth/logout
Response: { success }

POST /api/auth/forgot-password
Body: { phone }
Response: { success, message }

POST /api/auth/verify-otp
Body: { phone, otp }
Response: { success, resetToken }

POST /api/auth/reset-password
Body: { resetToken, newPassword }
Response: { success }
```

### 10.2 Shopping APIs

```
GET /api/shops
Query: { status, page, limit }
Response: { orders[], total, page }

GET /api/shops/[id]
Response: { order }

POST /api/shops/search
Body: { url OR keyword OR image }
Response: { products[] }

POST /api/cart
Body: { productId, title, price, amount, color, size, images, url }
Response: { success, cartId }

GET /api/cart
Response: { items[], subtotal, serviceFee, total }

PUT /api/cart/[id]
Body: { amount, color, size }
Response: { success, updatedItem }

DELETE /api/cart/[id]
Response: { success }

POST /api/cart/checkout
Body: { items[], paymentMethod, addressId }
Response: { success, orderId, amount }

POST /api/shops/calculate
Body: { items[] }
Response: { subtotal, serviceFee, shippingCHN, total }

POST /api/shops/[id]/cancel
Response: { success }
```

### 10.3 Forwarding APIs

```
GET /api/forwarder
Query: { status, page, limit }
Response: { imports[], total, page }

GET /api/forwarder/[id]
Response: { import, items[], images[] }

POST /api/forwarder
Body: { 
  warehouse, transportType, tracking[], 
  items: [{ name, qty, dimensions, weight }],
  services: { crate, inspection, photos },
  addressId
}
Response: { success, importId, estimatedCost }

PUT /api/forwarder/[id]
Body: { tracking, items, services }
Response: { success, updatedCost }

POST /api/forwarder/[id]/calculate
Response: { 
  shippingCost, crateFee, serviceFees, 
  deliveryFee, total 
}

POST /api/forwarder/[id]/images
Body: FormData with images
Response: { success, imageUrls[] }

POST /api/forwarder/[id]/pay
Body: { paymentMethod }
Response: { success, receiptId }
```

### 10.4 Payment APIs

```
GET /api/payment
Query: { status, page }
Response: { payments[], total }

GET /api/payment/[id]
Response: { payment }

POST /api/payment
Body: { 
  amountCNY, recipientType, recipientInfo, 
  purpose, documents[] 
}
Response: { success, paymentId, estimatedCost }

POST /api/payment/[id]/approve (Admin)
Response: { success }

POST /api/payment/[id]/reject (Admin)
Body: { reason }
Response: { success }

POST /api/payment/[id]/complete (Admin)
Body: { proofImage }
Response: { success }
```

### 10.5 Wallet APIs

```
GET /api/wallet
Response: { balance, transactions[] }

GET /api/wallet/transactions
Query: { type, dateFrom, dateTo, page }
Response: { transactions[], total }

POST /api/wallet/topup
Body: { amount, method: 'bank' | 'qr' }
Response: { 
  success, 
  bankAccounts[] | qrCode,
  transactionId 
}

POST /api/wallet/topup/confirm
Body: { transactionId, slipImage }
Response: { success, status: 'pending' }

POST /api/wallet/withdraw
Body: { amount, bankAccountId }
Response: { success, withdrawalId }

GET /api/wallet/credit (VIP only)
Response: { 
  limit, used, available, 
  nextDueDate, nextDueAmount,
  overdueAmount, interestRate 
}

POST /api/wallet/credit/pay (VIP only)
Body: { amount }
Response: { success, newBalance }
```

### 10.6 Address APIs

```
GET /api/address
Response: { addresses[] }

GET /api/address/[id]
Response: { address }

POST /api/address
Body: { 
  name, lastName, phone, phone2,
  addressNo, subDistrict, district, province, zipCode,
  notes, isDefault 
}
Response: { success, addressId }

PUT /api/address/[id]
Body: { ...addressFields }
Response: { success }

DELETE /api/address/[id]
Response: { success }

POST /api/address/[id]/set-default
Response: { success }

GET /api/address/autocomplete
Query: { query, type: 'district' | 'province' }
Response: { suggestions[] }
```

### 10.7 User APIs

```
GET /api/user/profile
Response: { user }

PUT /api/user/profile
Body: { name, lastName, email, birthday, gender }
Response: { success, user }

POST /api/user/profile/picture
Body: FormData with image
Response: { success, pictureUrl }

PUT /api/user/password
Body: { currentPassword, newPassword }
Response: { success }

GET /api/user/settings
Response: { settings }

PUT /api/user/settings
Body: { emailNotif, smsNotif, pushNotif, language }
Response: { success }

POST /api/user/verify-email
Response: { success, message: 'Verification email sent' }

POST /api/user/verify-email/confirm
Body: { token }
Response: { success }

POST /api/user/verify-phone
Response: { success, message: 'OTP sent' }

POST /api/user/verify-phone/confirm
Body: { otp }
Response: { success }
```

### 10.8 Admin APIs

```
GET /api/admin/customers
Query: { status, search, salesRep, page, limit }
Response: { customers[], total }

GET /api/admin/customers/[id]
Response: { customer, stats, orders[], transactions[] }

PUT /api/admin/customers/[id]
Body: { status, creditUser, creditLimit, adminIDSale }
Response: { success }

POST /api/admin/customers/[id]/note
Body: { note, isInternal }
Response: { success, noteId }

GET /api/admin/orders
Query: { type, status, customer, dateFrom, dateTo, page }
Response: { orders[], total }

PUT /api/admin/orders/[id]/status
Body: { status, note }
Response: { success }

POST /api/admin/wallet/topup/[id]/approve
Response: { success }

POST /api/admin/wallet/topup/[id]/reject
Body: { reason }
Response: { success }

POST /api/admin/wallet/withdraw/[id]/process
Body: { proofImage }
Response: { success }

GET /api/admin/reports/daily
Query: { date }
Response: { 
  ordersCount, revenue, payments,
  newCustomers, activeCustomers 
}

GET /api/admin/reports/customer-analytics
Query: { dateFrom, dateTo }
Response: { 
  newCustomers, churn, ltv, 
  topCustomers[], segments[] 
}

POST /api/admin/notifications/send
Body: { 
  recipients: 'all' | 'vip' | [userIds],
  title, message, type 
}
Response: { success, sentCount }
```

### 10.9 Integration APIs (Internal)

```
POST /api/integrations/line/notify
Body: { userId, message }
Response: { success }

POST /api/integrations/sms/send
Body: { phone, message }
Response: { success, messageId }

POST /api/integrations/email/send
Body: { to, subject, html }
Response: { success, messageId }

GET /api/integrations/exchange-rate
Response: { 
  buy, sell, transfer, pro,
  updatedAt 
}

POST /api/integrations/product/scrape
Body: { url }
Response: { product: { title, price, images, variants } }

POST /api/integrations/shipping/calculate
Body: { 
  origin, destination, 
  weight, dimensions 
}
Response: { 
  providers: [{ name, cost, days }]
}
```

---

## 11. UI/UX Patterns

### 11.1 Design System

**Colors:**
```css
/* Primary (PCS Red) */
--primary: #E74C3C;
--primary-hover: #C0392B;
--primary-light: #FADBD8;

/* Sidebar */
--sidebar-bg: #2C3E50;  /* Dark slate */
--sidebar-text: #ECF0F1;
--sidebar-hover: #34495E;
--sidebar-active: #E74C3C;

/* Backgrounds */
--bg-main: #ECF0F1;  /* Light gray */
--bg-card: #FFFFFF;
--bg-hover: #F8F9FA;

/* Text */
--text-primary: #2C3E50;
--text-secondary: #7F8C8D;
--text-muted: #BDC3C7;

/* Status Colors */
--status-success: #27AE60;  /* Green */
--status-warning: #F39C12;  /* Orange */
--status-danger: #E74C3C;   /* Red */
--status-info: #3498DB;     /* Blue */
--status-pending: #95A5A6;  /* Gray */

/* Borders */
--border: #E0E0E0;
--border-light: #F0F0F0;
```

**Typography:**
```css
/* Font Family */
--font-primary: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif;

/* Font Sizes */
--text-xs: 12px;
--text-sm: 14px;
--text-base: 16px;
--text-lg: 18px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 30px;

/* Font Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

**Spacing:**
```css
/* Padding/Margin Scale */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

### 11.2 Component Patterns

**Stats Card:**
```jsx
<div class="stats-card">
  <div class="stats-icon">
    <ShoppingCart /> {/* Icon */}
  </div>
  <div class="stats-content">
    <div class="stats-value">฿3,271,251.06</div>
    <div class="stats-label">ยอดฝากลังซื้อ พฤษภาคม 2026</div>
  </div>
  <div class="stats-progress">
    <div class="progress-bar" style="width: 75%"></div>
  </div>
</div>
```

**Status Badge:**
```jsx
{/* Dynamic color based on status */}
<span class={`badge badge-${getStatusColor(status)}`}>
  {statusText}
</span>

{/* With count */}
<span class="badge badge-primary">
  รอชำระเงิน <span class="badge-count">5</span>
</span>
```

**Data Table:**
```jsx
<table class="table">
  <thead>
    <tr>
      <th>ลำดับ</th>
      <th>วันที่สร้าง <SortIcon /></th>
      <th>ข้อมูลรายการ</th>
      <th>สถานะ</th>
      <th class="text-right">จำนวนเงิน</th>
      <th>การกระทำ</th>
    </tr>
  </thead>
  <tbody>
    {items.map((item, index) => (
      <tr key={item.id} class={index % 2 === 0 ? 'bg-gray-50' : ''}>
        <td>{index + 1}</td>
        <td>{formatDate(item.date)}</td>
        <td>
          <div class="flex items-center gap-2">
            <img src={item.image} class="w-12 h-12 rounded" />
            <div>
              <div class="font-medium">{item.title}</div>
              <div class="text-sm text-gray-500">{item.subtitle}</div>
            </div>
          </div>
        </td>
        <td>
          <Badge variant={item.statusColor}>
            {item.statusText}
          </Badge>
        </td>
        <td class="text-right font-medium">
          ฿{formatPrice(item.amount)}
        </td>
        <td>
          <ActionDropdown>
            <DropdownItem>ดูรายละเอียด</DropdownItem>
            <DropdownItem>แก้ไข</DropdownItem>
            <DropdownItem variant="danger">ยกเลิก</DropdownItem>
          </ActionDropdown>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

**Form:**
```jsx
<form class="form">
  <div class="form-group">
    <label class="form-label">
      ชื่อ <span class="text-red-500">*</span>
    </label>
    <input 
      type="text" 
      class="form-input"
      placeholder="กรอกชื่อ"
      required
    />
    {error && (
      <div class="form-error">กรุณากรอกชื่อ</div>
    )}
  </div>
  
  <div class="form-group">
    <label class="form-label">จังหวัด</label>
    <select class="form-select">
      <option value="">เลือกจังหวัด</option>
      {provinces.map(p => (
        <option value={p.id}>{p.name}</option>
      ))}
    </select>
  </div>
  
  <div class="form-actions">
    <button type="button" class="btn btn-secondary">
      ยกเลิก
    </button>
    <button type="submit" class="btn btn-primary">
      บันทึก
    </button>
  </div>
</form>
```

**Modal:**
```jsx
<Modal open={isOpen} onClose={handleClose}>
  <Modal.Header>
    <Modal.Title>ยืนยันการยกเลิก</Modal.Title>
    <Modal.Close />
  </Modal.Header>
  
  <Modal.Body>
    <p>คุณต้องการยกเลิกรายการนี้หรือไม่?</p>
    <p class="text-sm text-gray-500">
      การยกเลิกไม่สามารถทำย้อนกลับได้
    </p>
  </Modal.Body>
  
  <Modal.Footer>
    <button class="btn btn-secondary" onClick={handleClose}>
      ไม่ยกเลิก
    </button>
    <button class="btn btn-danger" onClick={handleConfirm}>
      ยืนยันการยกเลิก
    </button>
  </Modal.Footer>
</Modal>
```

### 11.3 Responsive Design

**Breakpoints:**
```css
/* Mobile First */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }
```

**Sidebar Behavior:**
```
Mobile (< 768px):
- Sidebar hidden by default
- Hamburger menu icon
- Overlay sidebar when opened
- Backdrop closes on click

Desktop (>= 768px):
- Sidebar always visible
- 256px width
- Fixed position
- Main content has 256px left margin
```

**Table Behavior:**
```
Mobile:
- Cards layout instead of table
- Stack information vertically
- Action buttons full-width

Desktop:
- Standard table layout
- Sortable columns
- Bulk selection checkboxes
```

### 11.4 Loading States

**Skeleton Loaders:**
```jsx
{/* Loading state for cards */}
<div class="animate-pulse">
  <div class="h-24 bg-gray-200 rounded"></div>
</div>

{/* Loading state for table */}
<table>
  <tbody>
    {[1,2,3,4,5].map(i => (
      <tr key={i}>
        <td><div class="h-4 bg-gray-200 rounded w-3/4"></div></td>
        <td><div class="h-4 bg-gray-200 rounded w-1/2"></div></td>
      </tr>
    ))}
  </tbody>
</table>
```

**Spinner:**
```jsx
<div class="spinner">
  <LoadingIcon class="animate-spin" />
  <span>กำลังโหลด...</span>
</div>
```

### 11.5 Empty States

```jsx
<div class="empty-state">
  <EmptyBoxIcon size={64} />
  <h3>ไม่พบรายการ</h3>
  <p>คุณยังไม่มีรายการในขณะนี้</p>
  <button class="btn btn-primary">
    เพิ่มรายการแรก
  </button>
</div>
```

### 11.6 Error States

```jsx
<div class="error-state">
  <ErrorIcon size={64} color="red" />
  <h3>เกิดข้อผิดพลาด</h3>
  <p>{errorMessage}</p>
  <button class="btn btn-primary" onClick={handleRetry}>
    ลองอีกครั้ง
  </button>
</div>
```

---

## 12. Workflows

### 12.1 New Customer Onboarding

```
1. Customer discovers PCS Cargo
   - Google search
   - Social media
   - Referral from friend/agent
   - Facebook/Instagram ads

2. Register account
   - Enter basic info
   - Verify phone (OTP)
   - Optional: Verify email

3. Welcome tutorial (optional)
   - Brief video/slides
   - How to use each service
   - Where to find help

4. First action prompt
   - "Start by adding products to cart"
   - "Create your first import order"
   - "Top-up wallet for faster checkout"

5. Incentive
   - First order: Free service fee
   - Referral credit (if referred)
   - Welcome discount

6. Assigned to sales rep
   - System auto-assigns based on load balancing
   - Welcome message from sales rep
   - Contact info provided

7. First order placed
   - Extra hand-holding by sales
   - Quick response to inquiries
   - Follow-up after delivery

8. Feedback request
   - Rate first experience
   - Suggest improvements
   - Offer to upgrade to VIP (if eligible)
```

### 12.2 VIP Upgrade Process

```
1. Trigger: Customer meets criteria
   - 30+ days, 10+ orders, 50K+ THB
   
2. System notification to admin
   - "Customer [ID] eligible for VIP"
   
3. Admin reviews
   - Check order history
   - Check payment history
   - Verify ID documents
   
4. Admin decides
   - Approve: Set creditUser=1, set limit
   - Defer: Request more orders/time
   - Reject: If payment issues
   
5. If approved:
   - Update database
   - Send congratulations email/SMS
   - Explain credit terms
   - Notify assigned sales rep
   
6. Customer sees changes
   - "Credit Wallet" menu appears
   - Can use credit at checkout
   - Dashboard shows credit info
   
7. First credit use
   - Sales monitors closely
   - Ensure customer understands due dates
   
8. Monthly review
   - Payment history
   - Usage patterns
   - Consider limit increase
```

### 12.3 Problem Resolution

```
Customer Reports Issue:

1. Customer contacts support
   - Line chat
   - Phone call
   - Email
   - In-app message
   
2. Sales rep receives
   - Log ticket
   - Categorize: Order/Payment/Delivery/Other
   - Priority: Low/Medium/High/Urgent
   
3. Initial response
   - Acknowledge within 1 hour
   - Gather details
   - Set expectations
   
4. Investigation
   - Check order details
   - Contact China warehouse if needed
   - Review transaction history
   
5. Resolution options
   a) Simple: Answer question
   b) Refund: Process refund
   c) Replacement: Order replacement
   d) Compensation: Discount/credit
   e) Escalate: Manager review
   
6. Implement solution
   - Update order status
   - Process refund/credit
   - Arrange replacement
   
7. Follow-up
   - Confirm customer satisfied
   - Close ticket
   - Internal review if systemic issue
   
8. Prevent recurrence
   - Update documentation
   - Train staff
   - Improve process
```

---

## 13. Calculations & Formulas

### 13.1 Price Calculations

**Shopping Order Total:**
```javascript
// Per item
itemPriceCNY = productPrice
itemPriceTHB = itemPriceCNY * exchangeRateBuy
itemSubtotal = itemPriceTHB * quantity

// Order totals
subtotal = sum(all itemSubtotals)

// Service fee
if (user.isVIP) {
  serviceFeeRate = 0.03  // 3%
} else {
  serviceFeeRate = 0.05  // 5%
}
serviceFee = subtotal * serviceFeeRate

// China shipping (simplified)
chinaShipping = estimatedBySeller

// Grand total
total = subtotal + serviceFee + chinaShipping

// Display breakdown
return {
  items: itemSubtotals,
  subtotal: subtotal,
  serviceFee: serviceFee,
  chinaShipping: chinaShipping,
  total: total
}
```

**Import Order Cost:**
```javascript
// Calculate chargeable weight
actualWeight = sum(all item weights in kg)
volumeCBM = sum(all item CBM)

if (transportType === 'sea') {
  volumetricWeight = volumeCBM * 1000
  conversionFactor = 1000
} else if (transportType === 'air') {
  volumetricWeight = volumeCBM * 167
  conversionFactor = 167
} else {  // express
  volumetricWeight = volumeCBM * 200
  conversionFactor = 200
}

chargeableWeight = max(actualWeight, volumetricWeight)

// Get rate
if (transportType === 'sea') {
  ratePerKG = 25
} else if (transportType === 'air') {
  ratePerKG = 45
} else {
  ratePerKG = 85
}

// Base shipping cost
shippingCost = chargeableWeight * ratePerKG

// Add-on services
crateFee = 0
if (needsCrate) {
  crateFee = volumeCBM * 1000  // 1000 THB per CBM
}

inspectionFee = needsInspection ? 200 : 0
photoFee = needsPhotos ? 100 : 0

// Thailand delivery
deliveryFee = calculateThailandDelivery(
  destinationZipCode, 
  actualWeight
)

// Total
total = shippingCost + crateFee + inspectionFee + photoFee + deliveryFee

return {
  chargeableWeight: chargeableWeight,
  shippingCost: shippingCost,
  crateFee: crateFee,
  inspectionFee: inspectionFee,
  photoFee: photoFee,
  deliveryFee: deliveryFee,
  total: total
}
```

**Thailand Delivery Cost:**
```javascript
function calculateThailandDelivery(zipCode, weight) {
  // Determine zone
  zone = getZoneFromZipCode(zipCode)
  
  // Zone rates
  rates = {
    1: { base: 60, perKG: 5, threshold: 5 },   // Bangkok
    2: { base: 80, perKG: 6, threshold: 5 },   // Central
    3: { base: 100, perKG: 7, threshold: 5 },  // Other
    4: { contact: true }  // Remote
  }
  
  if (zone === 4) {
    return 'ติดต่อสอบถาม'
  }
  
  zoneRate = rates[zone]
  
  if (weight <= zoneRate.threshold) {
    return zoneRate.base
  } else {
    excess = weight - zoneRate.threshold
    return zoneRate.base + (excess * zoneRate.perKG)
  }
}

function getZoneFromZipCode(zipCode) {
  // Bangkok & vicinity
  bangkokZips = [10XXX, 11XXX, 12XXX, ...]
  if (bangkokZips.includes(zipCode)) return 1
  
  // Central region
  centralZips = [13XXX, 14XXX, ...]
  if (centralZips.includes(zipCode)) return 2
  
  // Other regions
  return 3
}
```

### 13.2 Commission Calculations

```javascript
function calculateAgentCommission(order) {
  // Only commission on service fees
  commissionableAmount = order.serviceFee
  
  // Get agent
  agent = getAgentByUserId(order.userId)
  if (!agent) return 0
  
  // Get team monthly volume
  thisMonth = getCurrentMonth()
  teamVolume = getTeamMonthlyVolume(agent.id, thisMonth)
  
  // Tier rates
  if (teamVolume < 50000) {
    rate = 0.02  // 2%
  } else if (teamVolume < 100000) {
    rate = 0.03  // 3%
  } else if (teamVolume < 200000) {
    rate = 0.04  // 4%
  } else {
    rate = 0.05  // 5%
  }
  
  commission = commissionableAmount * rate
  
  // Record for payout
  recordCommission(agent.id, order.id, commission)
  
  return commission
}

function getTeamMonthlyVolume(agentId, month) {
  // Get all team members
  teamMembers = getTeamMembers(agentId)
  
  // Sum their orders' service fees for the month
  totalVolume = 0
  for (member of teamMembers) {
    orders = getOrdersByUserAndMonth(member.userId, month)
    for (order of orders) {
      totalVolume += order.serviceFee
    }
  }
  
  return totalVolume
}
```

### 13.3 Credit Calculations

```javascript
function calculateCreditDue(userId) {
  // Get all credit transactions
  creditTransactions = getCreditTransactions(userId, {
    status: 'unpaid'
  })
  
  now = new Date()
  
  let totalDue = 0
  let totalOverdue = 0
  let totalInterest = 0
  
  for (transaction of creditTransactions) {
    dueDate = transaction.dueDate
    amount = transaction.amount
    
    if (now > dueDate) {
      // Overdue
      daysOverdue = daysBetween(dueDate, now)
      interest = calculateInterest(amount, daysOverdue)
      
      totalOverdue += amount
      totalInterest += interest
    }
    
    totalDue += amount
  }
  
  return {
    totalDue: totalDue,
    totalOverdue: totalOverdue,
    totalInterest: totalInterest,
    grandTotal: totalDue + totalInterest
  }
}

function calculateInterest(amount, daysOverdue) {
  if (daysOverdue <= 0) return 0
  
  if (daysOverdue <= 7) {
    rate = 0.02  // 2%
  } else if (daysOverdue <= 14) {
    rate = 0.05  // 5%
  } else {
    rate = 0.10  // 10%
  }
  
  return amount * rate
}
```

---

## 14. Integration Requirements

### 14.1 Line Integration

**Line Notify:**
- Send notifications to customers
- Order updates
- Payment confirmations
- Promotional messages

**Line OA (Official Account):**
- Customer support chat
- Two-way communication
- Bot responses for FAQs
- Escalate to human agent

**Implementation:**
- Line Notify Token per user (optional)
- Line OA Channel ID & Secret
- Webhook for incoming messages
- Message templates

### 14.2 SMS Integration

**Thai SMS Gateway:**
- OTP for verification
- Payment confirmations
- Delivery notifications
- Critical alerts

**Providers:**
- Current: (Thai SMS provider)
- Alternatives: Twilio, AWS SNS

**Requirements:**
- API Key
- Sender ID: "PCS CARGO"
- Rate limit handling
- Message templates
- Delivery reports

### 14.3 Email Integration

**PHPMailer (Current):**
- Order confirmations
- Receipts
- Newsletters
- Password resets

**Migration Target:**
- SendGrid OR
- AWS SES OR
- Resend

**Email Types:**
- Transactional (high priority)
- Marketing (newsletters)
- System (alerts, reports)

**Requirements:**
- SMTP credentials
- Email templates (HTML + plain text)
- Unsubscribe mechanism
- Bounce handling
- Click tracking

### 14.4 Payment Gateway

**PromptPay QR:**
- Generate QR codes
- Auto-verification via bank API
- Instant confirmation

**Bank Transfer:**
- Manual verification
- Bank slip upload
- OCR for slip parsing (future)

**Future:**
- Credit card (Omise, 2C2P)
- E-wallets (TrueMoney, Rabbit LINE Pay)
- Buy now, pay later (Atome, Pace)

### 14.5 Shipping Integration

**Current:**
- Manual tracking entry
- No direct API integration

**Future Integration:**
- Flash Express API
- Kerry Express API
- DHL API
- Thailand Post API

**Features:**
- Auto-generate shipping labels
- Real-time tracking updates
- Delivery confirmation
- COD management

### 14.6 Product Scraping

**Sources:**
- 1688.com
- Taobao
- Tmall

**Data Extracted:**
- Product title
- Price (with variants)
- Images
- Specifications
- Shop info
- Ratings/reviews

**Challenges:**
- Anti-scraping measures
- CAPTCHA
- Rate limiting
- IP blocking

**Solutions:**
- Rotating proxies
- Browser automation (Puppeteer)
- Respect robots.txt
- Cache results

### 14.7 Currency Exchange

**Current:**
- Manual rate entry by admin

**Future:**
- API integration (ExchangeRate-API, Fixer.io)
- Auto-update daily
- Historical rates stored

### 14.8 Maps & Geocoding

**Google Maps API:**
- Geocode addresses
- Display delivery locations
- Route optimization for drivers
- Distance calculations

**Alternative:**
- Longdo Map (Thai)

### 14.9 File Storage

**Current:**
- Local filesystem

**Migration:**
- AWS S3
- DigitalOcean Spaces
- Cloudflare R2

**Files:**
- Product images
- User uploads (bank slips, ID cards)
- Import photos
- Receipts (PDF)
- Profile pictures

---

## 15. Technical Specifications

### 15.1 Performance Requirements

**Page Load:**
- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Time to Interactive: < 3.5s

**API Response:**
- Simple queries: < 200ms
- Complex queries: < 1s
- File uploads: < 5s

**Database:**
- Query optimization with indexes
- Connection pooling
- Caching for frequent queries (Redis)

### 15.2 Security Requirements

**Authentication:**
- bcrypt for password hashing (cost factor 10)
- JWT tokens (1 hour expiry)
- Refresh tokens (7 days)
- Rate limiting on login attempts
- CAPTCHA after 3 failed attempts

**Authorization:**
- Role-based access control (RBAC)
- Permission checks on every API call
- User context in all database queries

**Data Protection:**
- Encrypt sensitive data at rest
- TLS 1.3 for all connections
- PCI DSS compliance for payment data
- GDPR compliance for EU customers

**Input Validation:**
- Sanitize all user inputs
- Validate on both client and server
- Prevent SQL injection (use parameterized queries)
- Prevent XSS (escape outputs)
- CSRF tokens for forms

**File Upload Security:**
- Validate file types
- Scan for malware
- Limit file sizes
- Store with random filenames
- Serve via CDN or separate domain

### 15.3 Scalability Considerations

**Horizontal Scaling:**
- Stateless application servers
- Load balancer (Nginx, Cloudflare)
- Session store in Redis (not server memory)

**Database Scaling:**
- Read replicas for reporting queries
- Partition large tables (orders, transactions)
- Archive old data

**Caching Strategy:**
- Redis for session data
- Cache exchange rates (1 hour)
- Cache product search results (15 minutes)
- CDN for static assets

**Async Processing:**
- Queue for email sending (Bull, BullMQ)
- Queue for notifications
- Background jobs for reports
- Cron for scheduled tasks

### 15.4 Monitoring & Logging

**Application Monitoring:**
- Error tracking (Sentry)
- Performance monitoring (New Relic, Datadog)
- Uptime monitoring (UptimeRobot)

**Logs:**
- Structured logging (JSON format)
- Log levels: debug, info, warn, error
- Log rotation
- Centralized logging (ELK, Loki)

**Metrics:**
- Request count
- Response times
- Error rates
- Active users
- Queue lengths
- Database query times

**Alerts:**
- Error rate spike
- Response time degradation
- Service downtime
- Database issues
- Disk space low

### 15.5 Testing Requirements

**Unit Tests:**
- All helper functions
- Price calculation logic
- Commission calculations
- Validation functions
- Target: 80% coverage

**Integration Tests:**
- API endpoints
- Database operations
- Third-party integrations
- Authentication flows

**E2E Tests:**
- Critical user journeys
- Shopping flow
- Import flow
- Payment flow

**Load Testing:**
- Simulate 1000 concurrent users
- Identify bottlenecks
- Optimize before launch

### 15.6 Deployment

**Environment:**
- Development (local)
- Staging (pre-production testing)
- Production (live)

**CI/CD Pipeline:**
- GitHub Actions / GitLab CI
- Automated tests on push
- Deploy to staging on merge to develop
- Deploy to production on merge to main

**Database Migrations:**
- Prisma migrations
- Backup before migration
- Rollback plan

**Zero-Downtime Deployment:**
- Blue-green deployment
- Health check endpoint
- Graceful shutdown

### 15.7 Backup & Disaster Recovery

**Database Backups:**
- Daily automated backups
- Weekly full backups
- Retain 30 days
- Test restore quarterly

**File Backups:**
- Daily backup of uploaded files
- Sync to cloud storage

**Disaster Recovery:**
- RTO (Recovery Time Objective): 4 hours
- RPO (Recovery Point Objective): 24 hours
- Documented recovery procedures
- Annual DR drill

### 15.8 Documentation

**Code Documentation:**
- JSDoc for functions
- README for each module
- API documentation (OpenAPI/Swagger)

**User Documentation:**
- User manual (Thai)
- Video tutorials
- FAQ
- Troubleshooting guide

**Admin Documentation:**
- Admin manual
- Process documentation
- Runbook for common tasks

---

## 16. Migration Strategy (PHP → Next.js)

### 16.1 Parallel Running

**Phase 1: Setup**
- Deploy Next.js on separate subdomain (e.g., beta.pcscargo.co.th)
- Same database as PHP version
- Internal testing

**Phase 2: Limited Beta**
- Invite select customers to try new version
- Both versions running simultaneously
- Gather feedback
- Fix bugs

**Phase 3: Gradual Rollout**
- 10% of traffic to Next.js
- Monitor performance, errors
- Increase to 25%, 50%, 75%
- Rollback capability at each step

**Phase 4: Full Migration**
- 100% traffic to Next.js
- PHP version becomes read-only fallback
- After 30 days of stability, deprecate PHP

### 16.2 Data Migration

**No migration needed:**
- Using same database
- Prisma maps to existing tables
- New features add new tables/columns

**Database Changes:**
- Add new columns with defaults
- Never delete columns (backward compatibility)
- Create new tables as needed

### 16.3 Feature Parity Checklist

**Must-Have (MVP):**
- [ ] Authentication
- [ ] Dashboard
- [ ] Shopping cart
- [ ] Order placement
- [ ] Order listing
- [ ] Import order creation
- [ ] Import order management
- [ ] Wallet top-up
- [ ] Wallet transactions
- [ ] Address management
- [ ] User profile

**Nice-to-Have (Post-MVP):**
- [ ] Advanced search
- [ ] Image search
- [ ] Commission tracking
- [ ] Reports
- [ ] Admin dashboard
- [ ] Customer management
- [ ] Notifications

**Future Enhancements:**
- [ ] Mobile app (React Native)
- [ ] Inventory system
- [ ] AI recommendations
- [ ] Chatbot
- [ ] Loyalty program

---

## 17. Glossary

**Thai Terms:**
- **ฝากสั่งสินค้า (Shopping Service):** Order products on behalf of customer
- **ฝากนำเข้า (Forwarding Service):** Import logistics service
- **ฝากชำระ/โอน (Payment Service):** Make payments in China for customer
- **กระเป๋าสตางค์ (Wallet):** Digital wallet for prepayment
- **เติมเงิน (Top-up):** Add money to wallet
- **ถอนเงิน (Withdraw):** Withdraw money from wallet
- **เครดิต (Credit):** Credit line for VIP customers
- **ตัวแทน (Agent):** Referral partner earning commission
- **เซลล์ (Sales):** Sales representative assigned to customers
- **รอชำระเงิน (Waiting Payment):** Order awaiting payment
- **กำลังดำเนินการ (Processing):** Order being processed
- **จัดส่งแล้ว (Shipped):** Order shipped
- **สำเร็จ (Completed):** Order completed successfully
- **ยกเลิก (Cancelled):** Order cancelled

**Technical Terms:**
- **CBM (Cubic Meter):** Volume measurement for shipping
- **Volumetric Weight:** Calculated weight based on package dimensions
- **Chargeable Weight:** Higher of actual or volumetric weight
- **FOB (Free On Board):** Price including loading onto ship
- **CIF (Cost, Insurance, Freight):** Price including shipping & insurance
- **HS Code:** Harmonized System code for customs classification

---

## 18. Appendix

### 18.1 Sample Data

**User:**
```json
{
  "userID": "PCS2542",
  "userName": "สมชาย",
  "userLastName": "ใจดี",
  "userEmail": "somchai@example.com",
  "userTel": "0812345678",
  "creditUser": 1,
  "adminIDSale": "admin_pop"
}
```

**Shopping Order:**
```json
{
  "ID": 12345,
  "sDate": "2026-05-19T10:30:00Z",
  "sStatus": "3",
  "sProvider": "1",
  "sTitle": "เสื้อยืดคอกลม แขนสั้น",
  "sPrice": 29.90,
  "sAmount": 5,
  "sPriceTotal": 745.50,
  "sServiceFee": 37.28,
  "sShipCHN": 50.00,
  "sPayTotal": 832.78,
  "userID": "PCS2542"
}
```

**Import Order:**
```json
{
  "ID": 67890,
  "fDate": "2026-05-15T09:00:00Z",
  "fStatus": "5",
  "fWarehouseChina": "1",
  "fWarehouseName": "1",
  "fTransportType": "2",
  "fTrackingCHN": "SF1234567890",
  "fWeight": 15.5,
  "fVolume": 0.125,
  "fShippingService": 1250.00,
  "userID": "PCS2542"
}
```

### 18.2 Reference Links

**Thai Address Database:**
- https://github.com/konradit/thailand-addresses-database

**Exchange Rate API:**
- https://exchangerate-api.com
- https://fixer.io

**Payment Gateways:**
- Omise: https://www.omise.co
- 2C2P: https://www.2c2p.com
- GB Prime Pay: https://www.gbprimepay.com

**Shipping APIs:**
- Flash Express: https://flashexpress.com
- Kerry Express: https://th.kerryexpress.com

**Line Integration:**
- Line Notify: https://notify-bot.line.me
- Line Messaging API: https://developers.line.biz

---

## 19. Development Checklist

### 19.1 Phase 1: Foundation (Week 1-2)
- [ ] Next.js project setup
- [ ] Prisma schema
- [ ] Database connection
- [ ] Authentication (NextAuth.js)
- [ ] Layout components (Header, Sidebar)
- [ ] Routing structure
- [ ] Utility functions

### 19.2 Phase 2: Member Core (Week 3-4)
- [ ] Dashboard page
- [ ] Shopping cart
- [ ] Order placement
- [ ] Order listing
- [ ] Order details
- [ ] Wallet (basic)
- [ ] Address management

### 19.3 Phase 3: Member Advanced (Week 5-6)
- [ ] Product search
- [ ] Import order creation
- [ ] Import order management
- [ ] Payment service
- [ ] Wallet (full features)
- [ ] User profile

### 19.4 Phase 4: Admin Core (Week 7-8)
- [ ] Admin authentication
- [ ] Admin dashboard
- [ ] Customer management
- [ ] Order management
- [ ] Wallet approvals

### 19.5 Phase 5: Admin Advanced (Week 9-10)
- [ ] Reports
- [ ] Analytics
- [ ] Notifications system
- [ ] Settings management

### 19.6 Phase 6: Integrations (Week 11-12)
- [ ] Line Notify
- [ ] SMS gateway
- [ ] Email service
- [ ] Payment gateway
- [ ] Exchange rate API

### 19.7 Phase 7: Testing & Polish (Week 13-14)
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] Performance optimization
- [ ] Security audit
- [ ] User acceptance testing
- [ ] Documentation
- [ ] Deployment

---

## 20. Success Metrics

**Technical:**
- [ ] 99.9% uptime
- [ ] < 2s average page load
- [ ] < 500ms average API response
- [ ] 0 critical security vulnerabilities
- [ ] 80%+ test coverage

**Business:**
- [ ] 100% feature parity with PHP version
- [ ] 0 data loss during migration
- [ ] < 5% customer churn during migration
- [ ] 90%+ customer satisfaction
- [ ] 50%+ reduction in support tickets (better UX)

**User Experience:**
- [ ] Intuitive navigation
- [ ] Clear error messages
- [ ] Fast page transitions
- [ ] Mobile-friendly
- [ ] Accessibility compliant (WCAG 2.1 AA)

---

## FINAL NOTES FOR AI DEVELOPER

This document contains:
- ✅ Complete business context
- ✅ Database schema with all relationships
- ✅ User roles and permissions matrix
- ✅ Every feature specification
- ✅ All business logic and calculations
- ✅ API endpoint specifications
- ✅ UI/UX patterns and component examples
- ✅ Workflows and user journeys
- ✅ Integration requirements
- ✅ Technical specifications
- ✅ Migration strategy
- ✅ Development checklist

**What you should do:**
1. Read this document thoroughly
2. Ask clarifying questions if anything is unclear
3. Start with Phase 1 (Foundation)
4. Build incrementally, testing as you go
5. Refer back to this doc frequently
6. When in doubt about business logic, check here first

**What NOT to do:**
- Don't skip the database schema section
- Don't ignore user roles/permissions
- Don't implement features not documented here
- Don't guess on calculations - they're all specified
- Don't skip testing

**Remember:**
- This is a CLONE of existing system
- UI must match screenshots exactly
- All business logic must work identically
- No data loss during migration
- PHP and Next.js will run in parallel

**Good luck! 🚀**

---

**Document End**
