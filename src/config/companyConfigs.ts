// ─── Şirket bazlı Excel yapı konfigürasyonu ──────────────────────────────────
// Her şirketin Excel sheet adları, satır numaraları ve kategori yapıları burada
// tanımlanır. Yeni kategori veya şirket eklemek için yalnızca bu dosyayı güncelle.

export type FormulaType = 'person_x_wage' | 'meal_x_day_x_price' | 'raw_total';

// ─── Yemek kategorisi tipleri ─────────────────────────────────────────────────

export interface FoodDepartment {
  name: string;
  groupName?: string;       // ICA'da dept grupları var (İçtaş, Operasyon, Kamu, GYG)
  mealCountRow: number;     // Öğün sayısı Excel satırı (1-based)
  dayCountRow: number;      // Gün sayısı Excel satırı
  unitPriceRow: number;     // Birim fiyat satırı — ICA'da tümü 181, ICE'de dept başına
  resultRow: number;        // Hesaplanan TL sonucu satırı
  isActive: boolean;        // false → hesaplamadan çıkar (inaktif kalemler)
  isSpecial?: boolean;      // true → formül YOK, doğrudan TL değeri oku (Kilyos gibi)
  specialValueRow?: number; // isSpecial=true ise değerin okunacağı satır
  // Not: activeMonths kaldırıldı — runtime'da meal=0 || day=0 ise dept o ay için atlanır
}

export interface FoodCategoryConfig {
  id: 'yemek';
  sheetName: string;
  titleRow: number;
  globalUnitPriceRow?: number; // ICA: 181 (tek global fiyat); ICE: undefined (dept başına fiyat)
  summaryMealRow?: number;     // Gösterim için toplam öğün satırı (ICA: 185)
  summaryDayRow?: number;      // Gösterim için toplam gün satırı (ICA: 201)
  totalTLRow: number;          // Yemek Giderleri Toplam satırı (ICA: 217, ICE: 289)
  departments: FoodDepartment[];
}

// ─── Genel kategori konfigürasyonu ───────────────────────────────────────────

export interface CategoryConfig {
  id: string;
  excelTitle: string;
  startRow: number;
  endRow: number;
  formulaType: FormulaType;
  food?: FoodCategoryConfig;
  // TODO: personConfig eklenecek (Güvenlik/Temizlik için person_x_wage parametreleri)
}

export interface CompanyConfig {
  code: string;       // '2410' | '2415'
  name: 'ICA' | 'ICE';
  sheetName: string;  // Excel sheet adı
  categories: CategoryConfig[];
}

// ─── ICA 2410 ─────────────────────────────────────────────────────────────────

const ICA_YEMEK_CONFIG: FoodCategoryConfig = {
  id: 'yemek',
  sheetName: 'Model Gider',
  titleRow: 180,
  globalUnitPriceRow: 181,  // Tek birim fiyat — tüm departmanlar için ortak
  summaryMealRow: 185,
  summaryDayRow: 201,
  totalTLRow: 217,
  departments: [
    // ── İçtaş grubu ──────────────────────────────────────────────────────────
    {
      name: 'İçtaş', groupName: 'İçtaş',
      mealCountRow: 187, dayCountRow: 203, unitPriceRow: 181, resultRow: 219,
      isActive: true,
    },
    // ── Operasyon grubu ───────────────────────────────────────────────────────
    {
      name: 'CCN GÜVENLİK', groupName: 'Operasyon',
      mealCountRow: 189, dayCountRow: 205, unitPriceRow: 181, resultRow: 221,
      isActive: true,
    },
    {
      name: 'TAŞERON', groupName: 'Operasyon',
      mealCountRow: 190, dayCountRow: 206, unitPriceRow: 181, resultRow: 222,
      isActive: true,
    },
    {
      name: 'OPSİYON (IT)', groupName: 'Operasyon',
      mealCountRow: 191, dayCountRow: 207, unitPriceRow: 181, resultRow: 223,
      isActive: false,  // Excel'de pasif satır
    },
    // ── Kamu grubu ────────────────────────────────────────────────────────────
    {
      name: 'KARAYOLLARI', groupName: 'Kamu',
      mealCountRow: 193, dayCountRow: 209, unitPriceRow: 181, resultRow: 225,
      isActive: true,
    },
    {
      name: 'KÖPRÜ KORUMA EMNİYET POYRAZ', groupName: 'Kamu',
      mealCountRow: 194, dayCountRow: 210, unitPriceRow: 181, resultRow: 226,
      isActive: true,
    },
    {
      name: 'SAHİL GÜVENLİK', groupName: 'Kamu',
      mealCountRow: 195, dayCountRow: 211, unitPriceRow: 181, resultRow: 227,
      isActive: true,
    },
    {
      name: 'DİĞER KAMU', groupName: 'Kamu',
      mealCountRow: 196, dayCountRow: 212, unitPriceRow: 181, resultRow: 228,
      isActive: true,
    },
    {
      name: 'ASYA TRAFİK JANDARMA', groupName: 'Kamu',
      mealCountRow: 197, dayCountRow: 213, unitPriceRow: 181, resultRow: 229,
      isActive: true,
    },
    {
      name: 'RUMELİFENERİ JANDARMA', groupName: 'Kamu',
      mealCountRow: 198, dayCountRow: 214, unitPriceRow: 181, resultRow: 230,
      isActive: true,
    },
    // ── GYG grubu ─────────────────────────────────────────────────────────────
    {
      name: 'ICA', groupName: 'GYG',
      mealCountRow: 200, dayCountRow: 216, unitPriceRow: 181, resultRow: 232,
      isActive: true,
    },
    // ── Özel ─────────────────────────────────────────────────────────────────
    {
      name: 'Kilyos Yemek Gideri', groupName: undefined,
      mealCountRow: 0, dayCountRow: 0, unitPriceRow: 0, resultRow: 237,
      isActive: true, isSpecial: true, specialValueRow: 237,
    },
  ],
};

// ─── ICE 2415 ─────────────────────────────────────────────────────────────────

const ICE_YEMEK_CONFIG: FoodCategoryConfig = {
  id: 'yemek',
  sheetName: 'Model',
  titleRow: 246,
  // globalUnitPriceRow: undefined — her departmanın kendi birim fiyat satırı var
  summaryMealRow: 263,
  summaryDayRow: 276,
  totalTLRow: 289,
  departments: [
    // Öğün: 264-275 (12 satır)  |  Gün: 277-288 (12 satır)  |  TL: 290-301 (12 satır)
    // Birim fiyat: 248-262 (sırasıyla 248, 252-262)
    // Row 302 = 'DİĞER GİDERLER' boş satır — SUM'a dahil değil, IGNORE
    {
      name: 'ICA ALTYAPI',
      mealCountRow: 264, dayCountRow: 277, unitPriceRow: 248, resultRow: 290,
      isActive: true,
    },
    {
      name: 'ALTYAPI TAŞERON',
      mealCountRow: 265, dayCountRow: 278, unitPriceRow: 252, resultRow: 291,
      isActive: true,
    },
    {
      name: 'SAHUR',
      mealCountRow: 266, dayCountRow: 279, unitPriceRow: 253, resultRow: 292,
      isActive: true,  // Aktif aylar Excel'de 0 gelince runtime'da atlanır
    },
    {
      name: 'İFTAR',
      mealCountRow: 267, dayCountRow: 280, unitPriceRow: 254, resultRow: 293,
      isActive: true,
    },
    {
      name: 'İFTAR YEMEĞİ BİM',
      mealCountRow: 268, dayCountRow: 281, unitPriceRow: 255, resultRow: 294,
      isActive: true,
    },
    {
      name: 'BAKIM MERKEZİ MANGAL ORG.',
      mealCountRow: 269, dayCountRow: 282, unitPriceRow: 256, resultRow: 295,
      isActive: true,
    },
    {
      name: 'CCN PEYZAJ',
      mealCountRow: 270, dayCountRow: 283, unitPriceRow: 257, resultRow: 296,
      isActive: true,
    },
    {
      name: 'ODAYERİ CCN',
      mealCountRow: 271, dayCountRow: 284, unitPriceRow: 258, resultRow: 297,
      isActive: true,
    },
    {
      name: 'HÜSEYİNLİ CCN',
      mealCountRow: 272, dayCountRow: 285, unitPriceRow: 259, resultRow: 298,
      isActive: true,
    },
    {
      name: 'KARLA MÜCADELE KUMANYA',
      mealCountRow: 273, dayCountRow: 286, unitPriceRow: 260, resultRow: 299,
      isActive: true,
    },
    {
      name: 'İDARİ İŞLER PERSONELİ ORG. 1',
      mealCountRow: 274, dayCountRow: 287, unitPriceRow: 261, resultRow: 300,
      isActive: true,
    },
    {
      name: 'İDARİ İŞLER PERSONELİ ORG. 2',
      mealCountRow: 275, dayCountRow: 288, unitPriceRow: 262, resultRow: 301,
      isActive: true,
    },
  ],
};

// ─── Ana config haritası ──────────────────────────────────────────────────────

export const COMPANY_CONFIGS: Record<string, CompanyConfig> = {
  '2410': {
    code: '2410', name: 'ICA', sheetName: 'Model Gider',
    categories: [
      {
        id: 'guvenlik', excelTitle: 'Güvenlik Hizmetleri',
        startRow: 20, endRow: 123, formulaType: 'person_x_wage',
        // TODO: personConfig (Kişi Sayısı/Ücret satırları — bir sonraki sprint)
      },
      {
        id: 'temizlik', excelTitle: 'Temizlik Hizmetleri',
        startRow: 124, endRow: 179, formulaType: 'person_x_wage',
        // TODO: personConfig
      },
      {
        id: 'yemek', excelTitle: 'Yemek Giderleri',
        startRow: 180, endRow: 237, formulaType: 'meal_x_day_x_price',
        food: ICA_YEMEK_CONFIG,
      },
      // TODO: servis        startRow:238  endRow:605
      // TODO: arac_kira     startRow:606  endRow:784
      // TODO: hgs           startRow:785  endRow:966
      // TODO: arac_yakit    startRow:970  endRow:1162
      // TODO: arac_bakim    startRow:1163 endRow:1272
      // TODO: diger_hizmet  startRow:1273 endRow:1336
      // TODO: diger_cesitli startRow:1337 endRow:1376
    ],
  },

  '2415': {
    code: '2415', name: 'ICE', sheetName: 'Model',
    categories: [
      // NOT: ICE'de Güvenlik ve Temizlik kategorisi YOK
      {
        id: 'yemek', excelTitle: 'Personel Yemek Giderleri',
        startRow: 246, endRow: 302, formulaType: 'meal_x_day_x_price',
        food: ICE_YEMEK_CONFIG,
      },
      // TODO: servis, arac_kira, hgs, arac_yakit, arac_bakim, diger_hizmet, diger_cesitli
    ],
  },
};

// ─── Helper: şirkete göre Yemek config'i getir ───────────────────────────────

export function getFoodConfig(companyCode: '2410' | '2415'): FoodCategoryConfig | null {
  const cfg = COMPANY_CONFIGS[companyCode];
  if (!cfg) return null;
  const yemekCat = cfg.categories.find((c) => c.id === 'yemek');
  return yemekCat?.food ?? null;
}
