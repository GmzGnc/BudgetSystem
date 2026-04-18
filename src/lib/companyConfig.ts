// ─── COMPANY CONFIG ────────────────────────────────────────────────────────
// Single source of truth for Excel row mappings per company + sheet.
// Budget cols: N–Y (0-based index 13–24), Actual cols: AC–AN (28–39)

export const BUDGET_COLS = [13,14,15,16,17,18,19,20,21,22,23,24];
export const ACTUAL_COLS = [28,29,30,31,32,33,34,35,36,37,38,39];
export const MONTH_LABELS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

export interface RowConfig {
  row: number;       // 1-based Excel row
  label: string;
  unit?: string;
}

export interface DeptConfig {
  code: string;
  row: number;
  label: string;
  itemRows?: RowConfig[];
}

export interface ParamConfig {
  code: string;
  row: number;
  label: string;
  unit: string;
}

export interface CategoryConfig {
  total: RowConfig;
  depts: DeptConfig[];
  params: ParamConfig[];
}

export interface SheetConfig {
  sheet: string;
  categories: Record<string, CategoryConfig>;
}

export const COMPANY_CONFIG: Record<string, SheetConfig> = {
  "2410": {
    sheet: "Model Gider",
    categories: {
      guvenlik: {
        total: { row: 20, label: "Güvenlik Giderleri", unit: "TL Karşılığı" },
        depts: [
          {
            code: "gyg", row: 72, label: "GYG",
            itemRows: [
              { row: 73, label: "Proje Müdürü", unit: "TL" },
              { row: 74, label: "Vardiya Amiri", unit: "TL" },
              { row: 75, label: "Nizamiye", unit: "TL" },
              { row: 76, label: "Helikopter Pisti Nizamiye", unit: "TL" },
              { row: 77, label: "Hyundai", unit: "TL" },
              { row: 78, label: "PMO Bina (Resepsiyonist)", unit: "TL" },
              { row: 79, label: "U-Turn Kuzey", unit: "TL" },
              { row: 80, label: "U-Turn Güney", unit: "TL" },
              { row: 81, label: "CCTV", unit: "TL" },
              { row: 82, label: "Araç Devriye", unit: "TL" },
            ],
          },
          {
            code: "oht", row: 84, label: "OHT",
            itemRows: [
              { row: 85, label: "OHT 1A Fenertepe", unit: "TL" },
              { row: 86, label: "OHT 1B Fenertepe", unit: "TL" },
              { row: 87, label: "OHT Başakşehir Opet", unit: "TL" },
              { row: 88, label: "OHT 2 Küçük Shell", unit: "TL" },
              { row: 89, label: "OHT 3 Çiftalân", unit: "TL" },
              { row: 90, label: "OHT Çekmeköy Opet B", unit: "TL" },
              { row: 91, label: "OHT Çekmeköy Opet A", unit: "TL" },
              { row: 92, label: "OHT Poyraz Opet A", unit: "TL" },
              { row: 93, label: "OHT Poyraz Opet B", unit: "TL" },
              { row: 94, label: "OHT 4 Reşadiye", unit: "TL" },
              { row: 95, label: "OHT 5 Ömerli", unit: "TL" },
            ],
          },
          {
            code: "ictas", row: 97, label: "İçtaş Güvenlik",
            itemRows: [
              { row: 98,  label: "Nizamiye Grubu 1", unit: "TL" },
              { row: 99,  label: "Güvenlik Grubu 1", unit: "TL" },
              { row: 100, label: "Nizamiye Grubu 2", unit: "TL" },
              { row: 101, label: "Güvenlik Grubu 2", unit: "TL" },
            ],
          },
          {
            code: "operasyon", row: 111, label: "Operasyon",
            itemRows: [
              { row: 112, label: "Bakım İşletme Odayeri", unit: "TL" },
              { row: 113, label: "Bakım İşletme Hüseynili", unit: "TL" },
              { row: 114, label: "G8 Araçlı Devriye", unit: "TL" },
              { row: 115, label: "Trafo Devriye Başakşehir", unit: "TL" },
              { row: 116, label: "Gişe-3 Ağaçlı", unit: "TL" },
              { row: 117, label: "Avrupa Kimyasal Tır Parkı", unit: "TL" },
              { row: 118, label: "Asya Kimyasal Tır Parkı", unit: "TL" },
              { row: 120, label: "Ek Giderler (araç+yakıt+amort.)", unit: "TL" },
            ],
          },
          {
            code: "kilyos", row: 123, label: "Kilyos",
            itemRows: [], // tek satır, endeks bağlı
          },
        ],
        params: [
          { code: "ucret_proje_muduru",  row: 21, label: "Proje Müdürü Ücret",       unit: "TL" },
          { code: "ucret_vardiya_amiri", row: 22, label: "Vardiya Amiri Ücret",      unit: "TL" },
          { code: "ucret_guvenlik",      row: 23, label: "Güvenlik Personeli Ücret", unit: "TL" },
          { code: "ucret_kandilli",      row: 24, label: "Proje (Kandilli) Ücret",   unit: "TL" },
          { code: "kisi_toplam",         row: 25, label: "Kişi Sayısı Toplam",       unit: "Kişi" },
          { code: "kisi_gyg",            row: 26, label: "GYG Kişi",                 unit: "Kişi" },
          { code: "kisi_gyg_proje",      row: 27, label: "Proje Müdürü Kişi",        unit: "Kişi" },
          { code: "kisi_gyg_vardiya",    row: 28, label: "Vardiya Amiri Kişi",       unit: "Kişi" },
          { code: "kisi_gyg_nizamiye",   row: 29, label: "Nizamiye Kişi",            unit: "Kişi" },
          { code: "kisi_gyg_heli",       row: 30, label: "Helikopter Pisti Kişi",    unit: "Kişi" },
          { code: "kisi_gyg_hyundai",    row: 31, label: "Hyundai Kişi",             unit: "Kişi" },
          { code: "kisi_gyg_pmo",        row: 32, label: "PMO Bina Kişi",            unit: "Kişi" },
          { code: "kisi_gyg_uturn_k",    row: 33, label: "U-Turn Kuzey Kişi",        unit: "Kişi" },
          { code: "kisi_gyg_uturn_g",    row: 34, label: "U-Turn Güney Kişi",        unit: "Kişi" },
          { code: "kisi_gyg_cctv",       row: 35, label: "CCTV Kişi",                unit: "Kişi" },
          { code: "kisi_gyg_arac",       row: 36, label: "Araç Devriye Kişi",        unit: "Kişi" },
          { code: "kisi_oht",            row: 37, label: "OHT Kişi",                 unit: "Kişi" },
          { code: "kisi_oht_1a",         row: 38, label: "OHT 1A Fenertepe Kişi",   unit: "Kişi" },
          { code: "kisi_oht_1b",         row: 39, label: "OHT 1B Fenertepe Kişi",   unit: "Kişi" },
          { code: "kisi_oht_bsk",        row: 40, label: "OHT Başakşehir Kişi",      unit: "Kişi" },
          { code: "kisi_oht_shell",      row: 41, label: "OHT Küçük Shell Kişi",     unit: "Kişi" },
          { code: "kisi_oht_cifta",      row: 42, label: "OHT Çiftalân Kişi",        unit: "Kişi" },
          { code: "kisi_oht_cek_b",      row: 43, label: "OHT Çekmeköy B Kişi",      unit: "Kişi" },
          { code: "kisi_oht_cek_a",      row: 44, label: "OHT Çekmeköy A Kişi",      unit: "Kişi" },
          { code: "kisi_oht_poy_a",      row: 45, label: "OHT Poyraz A Kişi",        unit: "Kişi" },
          { code: "kisi_oht_poy_b",      row: 46, label: "OHT Poyraz B Kişi",        unit: "Kişi" },
          { code: "kisi_oht_res",        row: 47, label: "OHT Reşadiye Kişi",         unit: "Kişi" },
          { code: "kisi_oht_omerli",     row: 48, label: "OHT Ömerli Kişi",           unit: "Kişi" },
          { code: "kisi_operasyon",      row: 62, label: "Operasyon Kişi",            unit: "Kişi" },
          { code: "kisi_ops_odayeri",    row: 63, label: "Bakım Odayeri Kişi",        unit: "Kişi" },
          { code: "kisi_ops_huseynili",  row: 64, label: "Bakım Hüseynili Kişi",      unit: "Kişi" },
          { code: "kisi_ops_g8",         row: 65, label: "G8 Devriye Kişi",           unit: "Kişi" },
          { code: "kisi_ops_trafo",      row: 66, label: "Trafo Devriye Kişi",        unit: "Kişi" },
          { code: "kisi_ops_gise",       row: 67, label: "Gişe-3 Kişi",               unit: "Kişi" },
          { code: "kisi_ops_avrupa",     row: 68, label: "Avrupa Tır Parkı Kişi",     unit: "Kişi" },
          { code: "kisi_ops_asya",       row: 69, label: "Asya Tır Parkı Kişi",       unit: "Kişi" },
        ],
      },
      temizlik: {
        total: { row: 124, label: "Temizlik Giderleri", unit: "TL Karşılığı" },
        depts: [
          { code: "gyg",       row: 149, label: "GYG",       itemRows: [] },
          { code: "ictas",     row: 153, label: "İçtaş",     itemRows: [] },
          { code: "kamu",      row: 156, label: "Kamu",       itemRows: [] },
          { code: "oht",       row: 160, label: "OHT",        itemRows: [] },
          { code: "operasyon", row: 169, label: "Operasyon",  itemRows: [] },
          { code: "kilyos",    row: 179, label: "Kilyos",     itemRows: [] },
        ],
        params: [],
      },
      yemek: {
        total: { row: 180, label: "Yemek Giderleri", unit: "TL Karşılığı" },
        depts: [
          { code: "ictas",     row: 218, label: "İçtaş",     itemRows: [] },
          { code: "operasyon", row: 220, label: "Operasyon",  itemRows: [] },
          { code: "kamu",      row: 224, label: "Kamu",       itemRows: [] },
          { code: "gyg",       row: 231, label: "GYG",        itemRows: [] },
          { code: "kilyos",    row: 237, label: "Kilyos",     itemRows: [] },
        ],
        params: [],
      },
      servis: {
        total: { row: 238, label: "Servis Giderleri", unit: "TL Karşılığı" },
        depts: [],
        params: [],
      },
      arac_kira: {
        total: { row: 606, label: "Araç Kira Giderleri", unit: "TL Karşılığı" },
        depts: [],
        params: [],
      },
      hgs: {
        total: { row: 785, label: "HGS Giderleri", unit: "TL Karşılığı" },
        depts: [],
        params: [],
      },
      arac_yakit: {
        total: { row: 970, label: "Araç Yakıt Giderleri", unit: "TL Karşılığı" },
        depts: [],
        params: [],
      },
      arac_bakim: {
        total: { row: 1163, label: "Taşıt Bakım Onarım", unit: "TL Karşılığı" },
        depts: [],
        params: [],
      },
      diger_hizmet: {
        total: { row: 1273, label: "Diğer Hizmet Giderleri", unit: "TL Karşılığı" },
        depts: [],
        params: [],
      },
      icme_suyu: {
        total: { row: 1312, label: "İçme Suyu Giderleri", unit: "TL Karşılığı" },
        depts: [],
        params: [],
      },
      diger_cesitli: {
        total: { row: 1337, label: "Diğer Çeşitli Giderler", unit: "TL Karşılığı" },
        depts: [],
        params: [],
      },
    },
  },
  "2415": {
    sheet: "Model",
    categories: {
      // ICE kategorileri — sonraki adımda eklenecek
    },
  },
};
