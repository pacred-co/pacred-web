import type { SalesCard, DropdownSection } from '@/types/booking';

export const HERO_IMGS: Record<string, string> = {
  default:  '/images/hero-section/banner/default.png',
  lcl:      '/images/hero-section/banner/ship.png',
  fcl:      '/images/hero-section/banner/ship.png',
  truck:    '/images/hero-section/banner/car.png',
  air:      '/images/hero-section/banner/airbanner.png',
  customs:  '/images/hero-section/banner/customs.png',
  sourcing: '/images/hero-section/banner/shop.png',
  remit:    '/images/hero-section/banner/exchange.png',
};

export const HERO_CONTENT: Record<string, { title: string; sub: string }> = {
  default:  { title: 'บริการชิปปิ้ง นำเข้า-ส่งออกจีน <em>ครบวงจร</em>', sub: 'ขนส่งคาร์โก้มาตรฐาน โปร่งใส 13+ ปี · LCL · FCL · รถ DDP · อากาศ · เคลียร์ด่าน' },
  lcl:      { title: 'นำเข้าสินค้าจากจีน <em>LCL แชร์ตู้</em>', sub: 'ขนส่งสินค้าทางเรือ แชร์ตู้ จากจีน — ประหยัด ปลอดภัย ส่งถึงหน้าบ้าน' },
  fcl:      { title: 'นำเข้าสินค้าจากจีน <em>FCL เหมาตู้</em>', sub: 'เหมาตู้ 20ft / 40ft จากจีน — เร็ว ปลอดภัย รับ DDP ครบจบรวมภาษี' },
  truck:    { title: 'ขนส่งทางรถ <em>DDP จีน–ไทย</em>', sub: 'รถบรรทุกจีน–ไทย ส่งถึงหน้าบ้าน · แชร์รถประหยัด · เหมารถรวดเร็ว' },
  air:      { title: 'ขนส่งทางอากาศ <em>นำเข้า–ส่งออก</em>', sub: 'Air Freight ด่วน จากจีน ญี่ปุ่น และทั่วโลก · คำนวณ Chargeable Weight' },
  customs:  { title: 'เคลียร์ศุลกากร <em>ครบวงจร</em>', sub: 'เคลียร์สินค้าติดด่าน ทุกท่าเรือ สนามบิน ด่านชายแดน — ทีมงาน 13 ปี' },
  sourcing: { title: 'ฝากสั่งซื้อสินค้า <em>จากจีน</em>', sub: '1688 · Taobao · Alibaba · Tmall — ฝากซื้อ ชำระ นำส่ง ครบในที่เดียว' },
  remit:    { title: 'โอนเงินชำระ <em>ต่างประเทศ</em>', sub: 'โอน CNY / USD / EUR / JPY ตรงถึงซัพพลายเออร์ — เรทดีกว่าธนาคาร' },
};

export const SALES_CARDS: SalesCard[] = [
  { name: 'วิน',  slogan: 'นำเข้าทุก Port ทุก Term ปิดดีลให้จบในที่เดียว', phone: '066-125-3007', image: '/images/Character_Icon/win.png',  alt: 'เซลล์วิน Pacred',  link: 'https://lin.ee/Yg3fU0I', button: 'ทักวินเลย' },
  { name: 'แนท',  slogan: 'นำเข้าสั่งซื้อจีน ทุกแพลตฟอร์ม ครบจบในที่เดียว', phone: '066-125-3007', image: '/images/pacred-logo-red.png',     alt: 'เซลล์แนท Pacred',  link: 'https://lin.ee/Yg3fU0I', button: 'ทักแนทเลย' },
  { name: 'พลอย', slogan: 'เคลียร์สินค้าติดด่าน เร็ว ปลอดภัย การันตีจบ',    phone: '066-090-1217', image: '/images/Character_Icon/ploy.png', alt: 'เซลล์พลอย Pacred', link: 'https://lin.ee/Yg3fU0I', button: 'ทักพลอยเลย' },
];

export const ORIGIN_SECTIONS: DropdownSection[] = [
  {
    heading: 'โกดัง Pacred ในจีน',
    chips: [
      { value: 'guangzhou', label: 'กวางโจว — Guangzhou' },
      { value: 'yiwu',      label: 'อี้อู — Yiwu' },
    ],
  },
];

export const PRODUCT_SECTIONS_LCL: DropdownSection[] = [
  {
    heading: 'หมวดหมู่สินค้า',
    chips: [
      { value: 'general',  label: 'เสื้อผ้า / กระเป๋า / ของตกแต่ง' },
      { value: 'general',  label: 'อิเล็กทรอนิกส์ / IT' },
      { value: 'general',  label: 'เฟอร์นิเจอร์ / ของตกแต่งบ้าน' },
      { value: 'fda',      label: 'อาหาร / เครื่องสำอาง / อย.' },
      { value: 'tisi',     label: 'เครื่องใช้ไฟฟ้า / มอก.' },
      { value: 'machinery',label: 'เครื่องจักร / อุตสาหกรรม' },
      { value: 'special',  label: 'สินค้าพิเศษ / ต้องขออนุญาต' },
    ],
  },
];

export const PRODUCT_SECTIONS_FCL: DropdownSection[] = [
  {
    heading: 'หมวดหมู่สินค้า',
    chips: [
      { value: 'general',  label: 'สินค้าทั่วไป / แฟชั่น / เฟอร์นิเจอร์' },
      { value: 'fda',      label: 'อาหาร / เครื่องสำอาง / อย.' },
      { value: 'tisi',     label: 'เครื่องใช้ไฟฟ้า / มอก.' },
      { value: 'machinery',label: 'เครื่องจักร / อุตสาหกรรม' },
      { value: 'special',  label: 'สินค้าพิเศษ / อันตราย' },
    ],
  },
];

export const PRODUCT_SECTIONS_TRUCK: DropdownSection[] = [
  {
    heading: 'หมวดหมู่สินค้า',
    chips: [
      { value: 'general',  label: 'สินค้าทั่วไป' },
      { value: 'machinery',label: 'เครื่องจักร / หนักพิเศษ' },
      { value: 'special',  label: 'สินค้าพิเศษ / ต้องขออนุญาต' },
    ],
  },
];

export const TRUCK_DEST_SECTIONS: DropdownSection[] = [
  {
    heading: 'ปลายทางในไทย',
    chips: [
      { value: 'warehouse', label: 'โกดัง Pacred เพชรเกษม 77' },
      { value: 'bangkok',   label: 'กรุงเทพฯ / ปริมณฑล' },
      { value: 'upcountry', label: 'ต่างจังหวัด' },
    ],
  },
];

export const AIR_ORIGIN_CHIPS = [
  'จีน (กวางโจว CAN)',
  'จีน (เซินเจิ้น SZX)',
  'จีน (เซี่ยงไฮ้ PVG)',
  'ฮ่องกง (HKG)',
  'ไทย (สุวรรณภูมิ BKK)',
  'ไทย (ดอนเมือง DMK)',
  'ญี่ปุ่น (NRT/KIX)',
  'ยังไม่กำหนด',
];

export const AIR_DEST_CHIPS = [
  'ไทย (สุวรรณภูมิ BKK)',
  'ไทย (ดอนเมือง DMK)',
  'จีน (China)',
  'ญี่ปุ่น (Japan)',
  'ยุโรป (Europe)',
  'สหรัฐอเมริกา (USA)',
  'ยังไม่กำหนด',
];

export const CUSTOMS_PORT_SECTIONS: DropdownSection[] = [
  {
    heading: 'สนามบิน',
    chips: [
      { value: 'bkk_airport', label: 'สุวรรณภูมิ (BKK)' },
      { value: 'dmk_airport', label: 'ดอนเมือง (DMK)' },
    ],
  },
  {
    heading: 'ท่าเรือ',
    chips: [
      { value: 'laem_chabang',  label: 'แหลมฉบัง (LCBT)' },
      { value: 'bangkok_port',  label: 'ท่าเรือกรุงเทพ (PAT)' },
      { value: 'icd',           label: 'ICD ลาดกระบัง' },
    ],
  },
  {
    heading: 'ด่านชายแดน',
    chips: [
      { value: 'mukdahan',     label: 'มุกดาหาร' },
      { value: 'nakhonphanom', label: 'นครพนม / หนองคาย' },
      { value: 'aranyaprathet',label: 'อรัญประเทศ' },
      { value: 'maesai',       label: 'แม่สาย' },
    ],
  },
];

export const CUSTOMS_COUNTRY_SECTIONS: DropdownSection[] = [
  {
    heading: 'ประเทศต้นทาง',
    chips: [
      { value: 'china',  label: 'จีน' },
      { value: 'japan',  label: 'ญี่ปุ่น' },
      { value: 'usa',    label: 'สหรัฐอเมริกา' },
      { value: 'europe', label: 'ยุโรป' },
      { value: 'korea',  label: 'เกาหลีใต้' },
      { value: 'other',  label: 'ประเทศอื่น' },
    ],
  },
];

export const CUSTOMS_PRODUCT_SECTIONS: DropdownSection[] = [
  {
    heading: 'หมวดหมู่สินค้า',
    chips: [
      { value: 'general',  label: 'สินค้าทั่วไป' },
      { value: 'fda',      label: 'อาหาร / เครื่องสำอาง / อย.' },
      { value: 'tisi',     label: 'เครื่องใช้ไฟฟ้า / มอก.' },
      { value: 'machinery',label: 'เครื่องจักร / อุตสาหกรรม' },
      { value: 'special',  label: 'สินค้าพิเศษ / ต้องขออนุญาต' },
    ],
  },
];

export const PLATFORM_SECTIONS: DropdownSection[] = [
  {
    heading: 'เลือกแพลตฟอร์ม',
    chips: [
      { value: '1688',    label: '1688' },
      { value: 'taobao',  label: 'Taobao' },
      { value: 'tmall',   label: 'Tmall' },
      { value: 'alibaba', label: 'Alibaba' },
    ],
  },
];

export const CURRENCY_SECTIONS: DropdownSection[] = [
  {
    heading: 'สกุลเงิน',
    chips: [
      { value: 'cny', label: 'CNY (หยวน)' },
      { value: 'usd', label: 'USD (ดอลลาร์)' },
      { value: 'eur', label: 'EUR (ยูโร)' },
      { value: 'jpy', label: 'JPY (เยน)' },
    ],
  },
];
