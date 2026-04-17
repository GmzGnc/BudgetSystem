/**
 * Güvenlik kategorisi statik referans verisi — ICA 2025 bütçe
 * Kaynak: Model Gider Excel, satır 20–123
 * NOT: Bu dosya runtime Excel okuması yapmaz; doğrudan hardcode değerler.
 */

export interface GuvenlikKalem {
  rowNum: number;
  name: string;
  budgetYearly: number;
  actualYTD: number;
}

export interface GuvenlikDept {
  id: string;
  name: string;
  budgetYearly: number;
  actualYTD: number;
  /** 12 aylık aylık bütçe */
  monthlyBudget: number[];
  /** 12 aylık fiili (Nis–Ara = 0) */
  monthlyActual: number[];
  /** Alt kalem detayları (Kilyos/İçtaş için boş dizi) */
  items: GuvenlikKalem[];
}

export interface GuvenlikUnitWage {
  rowNum: number;
  position: string;
  budgetMonthly: number;
  actualMonthly: number;
}

export interface GuvenlikHeadcountItem {
  name: string;
  budget: number;
  actual: number;
}

export interface GuvenlikHeadcount {
  group: string;
  budget: number;
  actual: number;
  items?: GuvenlikHeadcountItem[];
  /** Kişi bazlı hesap yerine gösterilecek açıklama notu (Kilyos gibi endeks bağlı deptlar için) */
  note?: string;
}

// ─── Toplam (Row 20) ──────────────────────────────────────────────────────────

export const GUVENLIK_TOTAL_BUDGET = 138_564_631;
/** YTD fiili: Ocak–Mart (row 20 değeri) */
export const GUVENLIK_TOTAL_ACTUAL_YTD = 38_484_846;

/**
 * Aylık bütçe — ICA_RAW.guvenlik ile aynı (Ocak–Aralık)
 * Toplam: 138,564,631 TL
 */
export const GUVENLIK_MONTHLY_BUDGET: number[] = [
  10_809_504, 10_812_616, 10_817_771, 10_821_831, 10_818_235, 10_844_770,
  11_287_060, 11_302_445, 11_803_756, 12_382_011, 13_048_751, 13_815_881,
];

/**
 * Aylık fiili — Ocak–Mart mevcut, Nisan–Aralık 0
 * Ocak+Şubat+Mart = 38,484,846
 */
export const GUVENLIK_MONTHLY_ACTUAL: number[] = [
  12_728_052, 12_744_837, 13_011_957, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

// ─── Departmanlar ─────────────────────────────────────────────────────────────

export const GUVENLIK_DEPTS: GuvenlikDept[] = [
  {
    id: 'gyg',
    name: 'GYG',
    budgetYearly: 26_788_811,
    actualYTD: 7_327_729,
    monthlyBudget: Array(12).fill(2_232_401) as number[],
    monthlyActual: [2_349_401, 2_416_408, 2_561_920, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    items: [
      { rowNum: 73, name: 'Proje Müdürü',                  budgetYearly: 1_173_678, actualYTD:   311_025 },
      { rowNum: 74, name: 'Vardiya Amiri',                  budgetYearly: 2_641_290, actualYTD:   785_050 },
      { rowNum: 75, name: 'Nizamiye',                       budgetYearly: 4_594_769, actualYTD: 1_340_141 },
      { rowNum: 76, name: 'Helikopter Pisti Nizamiye',      budgetYearly: 2_297_384, actualYTD:   603_063 },
      { rowNum: 77, name: 'Hyundai',                        budgetYearly: 2_297_384, actualYTD:   603_063 },
      { rowNum: 78, name: 'PMO Bina (Resepsiyonist)',       budgetYearly:   765_795, actualYTD:   201_021 },
      { rowNum: 79, name: 'U-Turn Kuzey',                   budgetYearly: 2_297_384, actualYTD:   603_063 },
      { rowNum: 80, name: 'U-Turn Güney',                   budgetYearly: 2_297_384, actualYTD:   603_063 },
      { rowNum: 81, name: 'CCTV',                           budgetYearly: 6_126_358, actualYTD: 1_675_176 },
      { rowNum: 82, name: 'Araç Devriye',                   budgetYearly: 2_297_384, actualYTD:   603_063 },
    ],
  },
  {
    id: 'oht',
    name: 'OHT',
    budgetYearly: 18_379_074,
    actualYTD: 4_891_514,
    monthlyBudget: Array(12).fill(1_531_590) as number[],
    monthlyActual: [1_608_169, 1_608_169, 1_675_176, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    items: [
      { rowNum:  85, name: 'OHT 1A Fenertepe',         budgetYearly: 2_297_384, actualYTD: 603_063 },
      { rowNum:  86, name: 'OHT 1B Fenertepe',         budgetYearly: 2_297_384, actualYTD: 603_063 },
      { rowNum:  87, name: 'OHT Başakşehir Opet',      budgetYearly:   765_795, actualYTD: 268_028 },
      { rowNum:  88, name: 'OHT 2 Küçük Shell',        budgetYearly: 1_531_590, actualYTD: 402_042 },
      { rowNum:  89, name: 'OHT 3 Çiftalân',           budgetYearly: 2_297_384, actualYTD: 603_063 },
      { rowNum:  90, name: 'OHT Çekmeköy Opet B',      budgetYearly: 1_531_590, actualYTD: 402_042 },
      { rowNum:  91, name: 'OHT Çekmeköy Opet A',      budgetYearly:   765_795, actualYTD: 201_021 },
      { rowNum:  92, name: 'OHT Poyraz Opet A',        budgetYearly: 1_531_590, actualYTD: 402_042 },
      { rowNum:  93, name: 'OHT Poyraz Opet B',        budgetYearly:   765_795, actualYTD: 201_021 },
      { rowNum:  94, name: 'OHT 4 Reşadiye',           budgetYearly: 2_297_384, actualYTD: 603_063 },
      { rowNum:  95, name: 'OHT 5 Ömerli',             budgetYearly: 2_297_384, actualYTD: 603_063 },
    ],
  },
  {
    id: 'ictas',
    name: 'İçtaş Güvenlik',
    budgetYearly: 13_784_306,
    actualYTD: 3_618_381,
    monthlyBudget: Array(12).fill(1_148_692) as number[],
    monthlyActual: [1_206_127, 1_206_127, 1_206_127, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    items: [], // K sütunu boş — alt kalem detayı yok
  },
  {
    id: 'operasyon',
    name: 'Operasyon',
    budgetYearly: 37_140_459,
    actualYTD: 10_006_864,
    monthlyBudget: Array(12).fill(3_095_038) as number[],
    monthlyActual: [3_290_950, 3_357_957, 3_357_957, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    items: [
      { rowNum: 112, name: 'Bakım İşletme Odayeri',                 budgetYearly:  4_594_769, actualYTD: 1_206_127 },
      { rowNum: 113, name: 'Bakım İşletme Hüseynili',               budgetYearly:  4_594_769, actualYTD: 1_340_141 },
      { rowNum: 114, name: 'G8 Bölgesi Araçlı Devriye',             budgetYearly:  2_297_384, actualYTD:   603_063 },
      { rowNum: 115, name: 'Trafo Devriye Başakşehir',              budgetYearly:  2_297_384, actualYTD:   603_063 },
      { rowNum: 116, name: 'Gişe-3 Ağaçlı',                        budgetYearly:  2_297_384, actualYTD:   603_063 },
      { rowNum: 117, name: 'Avrupa Kimyasal Tır Parkı',             budgetYearly:  2_297_384, actualYTD:   603_063 },
      { rowNum: 118, name: 'Asya Kimyasal Tır Parkı',               budgetYearly:  2_297_384, actualYTD:   603_063 },
      { rowNum: 120, name: 'Ek Giderler (araç kira+yakıt+amort.)',  budgetYearly: 16_464_000, actualYTD: 4_445_280 },
    ],
  },
  {
    id: 'kilyos',
    name: 'Kilyos',
    budgetYearly: 42_471_981,
    actualYTD: 9_021_980,
    monthlyBudget: [
      2_801_783, 2_804_895, 2_810_050, 2_814_111, 2_810_514, 2_837_049,
      3_279_340, 3_294_724, 3_796_035, 4_374_291, 5_041_030, 5_808_161,
    ],
    monthlyActual: [3_067_279, 2_950_050, 3_004_651, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    items: [], // tek satır dept
  },
];

// ─── Birim ücret parametreleri (Row 21–24) ────────────────────────────────────

export const GUVENLIK_UNIT_WAGES: GuvenlikUnitWage[] = [
  { rowNum: 21, position: 'Proje Müdürü Ücret',               budgetMonthly:  97_807, actualMonthly: 103_675 },
  { rowNum: 22, position: 'Vardiya Amiri Ücret',               budgetMonthly:  73_369, actualMonthly:  78_505 },
  { rowNum: 23, position: 'Güvenlik Personeli Ücret',          budgetMonthly:  63_816, actualMonthly:  67_007 },
  { rowNum: 24, position: 'Proje (Kandilli) Personeli Ücret',  budgetMonthly:       0, actualMonthly:       0 },
];

// ─── Kişi sayısı parametreleri (Row 25–62) ────────────────────────────────────

export const GUVENLIK_HEADCOUNT: GuvenlikHeadcount[] = [
  { group: 'Toplam', budget: 103, actual: 85 },
  {
    group: 'GYG',
    budget: 34,
    actual: 36,
    items: [
      { name: 'Proje Müdürü',              budget: 1, actual: 1 },
      { name: 'Vardiya Amiri',              budget: 3, actual: 3 },
      { name: 'Nizamiye',                  budget: 6, actual: 7 },
      { name: 'Helikopter Pisti Nizamiye', budget: 3, actual: 3 },
      { name: 'Hyundai',                   budget: 3, actual: 3 },
      { name: 'PMO Bina (Resepsiyonist)',  budget: 1, actual: 1 },
      { name: 'U-Turn Kuzey',              budget: 3, actual: 4 },
      { name: 'U-Turn Güney',              budget: 3, actual: 3 },
      { name: 'CCTV',                      budget: 8, actual: 8 },
      { name: 'Araç Devriye',              budget: 3, actual: 3 },
    ],
  },
  {
    group: 'OHT',
    budget: 24,
    actual: 24,
    items: [
      { name: 'OHT 1A Fenertepe',        budget: 3, actual: 3 },
      { name: 'OHT 1B Fenertepe',        budget: 3, actual: 3 },
      { name: 'OHT Başakşehir Opet',     budget: 1, actual: 1 },
      { name: 'OHT 2 Küçük Shell',       budget: 2, actual: 2 },
      { name: 'OHT 3 Çiftalân',          budget: 3, actual: 3 },
      { name: 'OHT Çekmeköy Opet B',     budget: 2, actual: 2 },
      { name: 'OHT Çekmeköy Opet A',     budget: 1, actual: 1 },
      { name: 'OHT Poyraz Opet A',       budget: 2, actual: 2 },
      { name: 'OHT Poyraz Opet B',       budget: 1, actual: 1 },
      { name: 'OHT 4 Reşadiye',          budget: 3, actual: 3 },
      { name: 'OHT 5 Ömerli',            budget: 3, actual: 3 },
    ],
  },
  {
    group: 'İçtaş',
    budget: 18,
    actual: 18,
    // row 98–101: birim ücret = 63,816/ay; kişi = aylık tutar ÷ birim ücret
    // row 98: 383,731/mo → 6 kişi | row 99: 191,449/mo → 3 kişi | row 100: 383,731 → 6 | row 101: 191,449 → 3
    items: [
      { name: 'Nizamiye Grubu 1', budget: 6, actual: 6 },
      { name: 'Güvenlik Grubu 1', budget: 3, actual: 3 },
      { name: 'Nizamiye Grubu 2', budget: 6, actual: 6 },
      { name: 'Güvenlik Grubu 2', budget: 3, actual: 3 },
    ],
  },
  {
    group: 'Operasyon',
    budget: 27,
    actual: 27,
    items: [
      { name: 'Bakım İşletme Odayeri',       budget: 6, actual: 6 },
      { name: 'Bakım İşletme Hüseynili',     budget: 6, actual: 6 },
      { name: 'G8 Araçlı Devriye',           budget: 3, actual: 3 },
      { name: 'Trafo Devriye Başakşehir',    budget: 3, actual: 3 },
      { name: 'Gişe-3 Ağaçlı',              budget: 3, actual: 3 },
      { name: 'Avrupa Kimyasal Tır Parkı',   budget: 3, actual: 3 },
      { name: 'Asya Kimyasal Tır Parkı',     budget: 3, actual: 3 },
    ],
  },
  {
    group: 'Kilyos',
    budget: 0,
    actual: 0,
    note: 'Kişi bazlı hesap yok — endeks bağlı toplam tutar (yıllık bütçe ₺42,471,981 | YTD fiili ₺9,021,980)',
  },
];

/** Donut renkleri — GUVENLIK_DEPTS dizisiyle sıra uyumlu */
export const GUVENLIK_DEPT_COLORS = [
  '#6366f1', // GYG — indigo
  '#f59e0b', // OHT — amber
  '#10b981', // İçtaş — emerald
  '#ef4444', // Operasyon — red
  '#8b5cf6', // Kilyos — violet
];

/** Fiili olan aktif ay indeksleri (Ocak=0, Şubat=1, Mart=2) */
export const GUVENLIK_ACTIVE_MONTHS = [0, 1, 2];
