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
  noRound?: boolean; // true for decimal ratio/percentage params (prevents Math.round mangling)
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
          {
            code: "gyg", row: 149, label: "GYG",
            itemRows: [
              { row: 150, label: "AKM Binası", unit: "TL" },
              { row: 151, label: "PMO Binası + VIP Ofis", unit: "TL" },
            ],
          },
          {
            code: "ictas", row: 153, label: "İçtaş",
            itemRows: [
              { row: 154, label: "İçtaş Temizlik", unit: "TL" },
            ],
          },
          {
            code: "kamu", row: 156, label: "Kamu",
            itemRows: [
              { row: 157, label: "Köprü Koruma Amirliği", unit: "TL" },
              { row: 158, label: "KGM Binası", unit: "TL" },
            ],
          },
          {
            code: "oht", row: 160, label: "OHT",
            itemRows: [
              { row: 161, label: "OHT", unit: "TL" },
              { row: 162, label: "OHT Ekip Sorumlusu", unit: "TL" },
              { row: 163, label: "OHT Mesai Giderleri", unit: "TL" },
              { row: 164, label: "OHT Ek Giderler (araç+yakıt)", unit: "TL" },
            ],
            // Note: rows 167-168 are negative allocation rows (-441,884 / -462,000)
            // These are included in OHT total (row 160) already, skip as items
          },
          {
            code: "operasyon", row: 169, label: "Operasyon",
            itemRows: [
              { row: 170, label: "Bahçıvan", unit: "TL" },
              { row: 171, label: "AKM Çevre", unit: "TL" },
              { row: 172, label: "Odayeri BİM", unit: "TL" },
              { row: 173, label: "Hüseynili BİM", unit: "TL" },
              { row: 174, label: "Hyundai Binası", unit: "TL" },
              { row: 175, label: "Kimyasal", unit: "TL" },
              { row: 176, label: "Mesai Giderleri", unit: "TL" },
              { row: 177, label: "Ek Giderler (2 mobil ekip+araç+yakıt)", unit: "TL" },
            ],
          },
          {
            code: "kilyos", row: 179, label: "Kilyos",
            itemRows: [],
          },
        ],
        params: [
          { code: "ucret_oht_ekip_sorumlusu", row: 125, label: "OHT Ekip Sorumlusu Ücret",  unit: "TL" },
          { code: "ucret_oht_personel",        row: 126, label: "OHT Personel Ücret",         unit: "TL" },
          { code: "ucret_danisma",             row: 127, label: "Danışma Tarabya Yalı Ücret", unit: "TL" },
          { code: "ucret_temizlik_personel",   row: 128, label: "Temizlik Personel Ücret",    unit: "TL" },
          { code: "kisi_toplam",     row: 129, label: "Kişi Sayısı Toplam",       unit: "Kişi" },
          { code: "kisi_gyg",        row: 130, label: "GYG Kişi",                 unit: "Kişi" },
          { code: "kisi_gyg_akm",    row: 131, label: "AKM Binası Kişi",          unit: "Kişi" },
          { code: "kisi_gyg_pmo",    row: 132, label: "PMO Binası Kişi",          unit: "Kişi" },
          { code: "kisi_kamu",       row: 135, label: "Kamu Kişi",                unit: "Kişi" },
          { code: "kisi_kamu_kopru", row: 136, label: "Köprü Koruma Kişi",        unit: "Kişi" },
          { code: "kisi_kamu_kgm",   row: 137, label: "KGM Binası Kişi",          unit: "Kişi" },
          { code: "kisi_oht",        row: 138, label: "OHT Kişi",                 unit: "Kişi" },
          { code: "kisi_oht_main",   row: 139, label: "OHT Ana Kişi",             unit: "Kişi" },
          { code: "kisi_oht_ekip",   row: 140, label: "OHT Ekip Sorumlusu Kişi",  unit: "Kişi" },
          { code: "kisi_operasyon",  row: 141, label: "Operasyon Kişi",           unit: "Kişi" },
          { code: "kisi_ops_bah",    row: 142, label: "Bahçıvan Kişi",            unit: "Kişi" },
          { code: "kisi_ops_akm",    row: 143, label: "AKM Çevre Kişi",           unit: "Kişi" },
          { code: "kisi_ops_oda",    row: 144, label: "Odayeri BİM Kişi",         unit: "Kişi" },
          { code: "kisi_ops_hus",    row: 145, label: "Hüseynili BİM Kişi",       unit: "Kişi" },
          { code: "kisi_ops_hyu",    row: 146, label: "Hyundai Kişi",             unit: "Kişi" },
          { code: "kisi_ops_kim",    row: 147, label: "Kimyasal Kişi",            unit: "Kişi" },
        ],
      },
      yemek: {
        total: { row: 180, label: "Yemek Giderleri", unit: "TL Karşılığı" },
        depts: [
          {
            code: "ictas", row: 218, label: "İçtaş",
            itemRows: [
              { row: 219, label: "İçtaş Yemek", unit: "TL" },
            ],
          },
          {
            code: "operasyon", row: 220, label: "Operasyon",
            itemRows: [
              { row: 221, label: "CCN Güvenlik", unit: "TL" },
              { row: 222, label: "Taşeron",       unit: "TL" },
            ],
          },
          {
            code: "kamu", row: 224, label: "Kamu",
            itemRows: [
              { row: 225, label: "Karayolları",                        unit: "TL" },
              { row: 226, label: "Köprü Koruma (Emniyet) Poyraz",     unit: "TL" },
              { row: 227, label: "Sahil Güvenlik",                    unit: "TL" },
              { row: 228, label: "Diğer Kamu (İBB+PTT+Orman)",       unit: "TL" },
              { row: 229, label: "Asya Trafik Jandarma",              unit: "TL" },
              { row: 230, label: "Rumelihisarı Jandarma",             unit: "TL" },
            ],
          },
          {
            code: "gyg", row: 231, label: "GYG",
            itemRows: [
              { row: 232, label: "ICA",                  unit: "TL" },
              { row: 233, label: "Cafe Personeli Gideri", unit: "TL" },
            ],
          },
          {
            code: "kilyos", row: 237, label: "Kilyos",
            itemRows: [],
            // note: Kilyos is dominant (86% of total), single row, endeks-based
          },
        ],
        params: [
          { code: "birim_fiyat",     row: 181, label: "Birim Fiyat (TL/öğün)",       unit: "TL"   },
          { code: "ogun_toplam",     row: 185, label: "Günlük Öğün Sayısı Toplam",   unit: "Öğün" },
          { code: "ogun_gyg",        row: 186, label: "GYG Öğün",                    unit: "Öğün" },
          { code: "ogun_ictas",      row: 187, label: "İçtaş Öğün",                  unit: "Öğün" },
          { code: "ogun_operasyon",  row: 188, label: "Operasyon Öğün Toplam",        unit: "Öğün" },
          { code: "ogun_ops_ccn",    row: 189, label: "CCN Güvenlik Öğün",           unit: "Öğün" },
          { code: "ogun_ops_tase",   row: 190, label: "Taşeron Öğün",                unit: "Öğün" },
          { code: "ogun_kamu",       row: 192, label: "Kamu Öğün Toplam",            unit: "Öğün" },
          { code: "ogun_kamu_kara",  row: 193, label: "Karayolları Öğün",            unit: "Öğün" },
          { code: "ogun_kamu_kopru", row: 194, label: "Köprü Koruma Öğün",           unit: "Öğün" },
          { code: "ogun_kamu_sahil", row: 195, label: "Sahil Güvenlik Öğün",         unit: "Öğün" },
          { code: "ogun_kamu_diger", row: 196, label: "Diğer Kamu Öğün",             unit: "Öğün" },
          { code: "ogun_kamu_asya",  row: 197, label: "Asya Trafik Jandarma Öğün",  unit: "Öğün" },
          { code: "ogun_kamu_rume",  row: 198, label: "Rumelihisarı Jandarma Öğün", unit: "Öğün" },
          { code: "ogun_gyg_ica",    row: 199, label: "GYG Öğün Toplam",             unit: "Öğün" },
          { code: "gun_gyg",         row: 201, label: "Gün Sayısı GYG Ort.",         unit: "Gün"  },
          { code: "gun_ictas",       row: 202, label: "Gün Sayısı İçtaş",            unit: "Gün"  },
          { code: "gun_operasyon",   row: 204, label: "Operasyon Gün Ort.",           unit: "Gün"  },
          { code: "gun_kamu",        row: 208, label: "Kamu Gün Ort.",               unit: "Gün"  },
        ],
      },
      servis: {
        total: { row: 238, label: "Servis Giderleri", unit: "TL Karşılığı" },
        depts: [
          {
            code: "gyg", row: 239, label: "GYG",
            itemRows: [],
            // GYG = merkez binaları servisi. Rotalar detay blokları içinde (rows 295+)
          },
          {
            code: "operasyon", row: 240, label: "Operasyon",
            itemRows: [],
            // Operasyon = saha servisi. ~41 rota, rows 247-293 (özet), 295-603 (detay)
          },
          {
            code: "kilyos", row: 604, label: "Kilyos",
            itemRows: [],
          },
        ],
        params: [
          { code: "tufe_ufe_kumulatif", row: 241, label: "TÜFE+ÜFE Kümülatif Oran",            unit: "%",    noRound: true },
          { code: "tufe_ufe_uygulama",  row: 242, label: "TÜFE+ÜFE Uygulama Oranı (%70)",      unit: "%",    noRound: true },
          { code: "yakit_asim_bayrak",  row: 243, label: "Yakıt Aşım Bayrağı",                 unit: "Flag"              },
          { code: "yakit_uygulama",     row: 244, label: "Yakıt Uygulama Oranı (1/3)",          unit: "%",    noRound: true },
          { code: "asgari_ucret_fark",  row: 245, label: "Asgari Ücret Farkı (TL/araç)",        unit: "TL"                },
          { code: "birim_fiyat_ort",    row: 246, label: "Birim Fiyat Ort. (TL/araç/ay)",       unit: "TL"                },
          { code: "arac_sayisi",        row: 605, label: "Kiralık Araç Sayısı",                  unit: "Adet"              },
        ],
      },
      arac_kira: {
        total: { row: 606, label: "Araç Kira Giderleri", unit: "TL Karşılığı" },
        depts: [
          { code: "gyg",       row: 608, label: "GYG",       itemRows: [] },
          { code: "operasyon", row: 635, label: "Operasyon", itemRows: [] },
          { code: "ictas",     row: 689, label: "İçtaş",     itemRows: [] },
          { code: "kamu",      row: 711, label: "Kamu",      itemRows: [] },
          { code: "kilyos",    row: 728, label: "Kilyos",    itemRows: [] },
        ],
        params: [
          { code: "arac_sayisi_gyg",  row: 607, label: "GYG Araç Sayısı",       unit: "Adet" },
          { code: "arac_sayisi_ops",  row: 632, label: "Operasyon Araç Sayısı",  unit: "Adet" },
          { code: "arac_sayisi_kamu", row: 710, label: "Kamu Araç Sayısı",       unit: "Adet" },
          { code: "arac_sayisi_kil",  row: 727, label: "Kilyos Araç Sayısı",     unit: "Adet" },
          { code: "hgs_arac_toplam",  row: 784, label: "HGS Araç Toplam",        unit: "Adet" },
        ],
      },
      hgs: {
        total: { row: 785, label: "HGS Giderleri", unit: "TL Karşılığı" },
        depts: [
          { code: "gyg",       row: 787, label: "Genel Yönetim", itemRows: [] },
          { code: "operasyon", row: 815, label: "Operasyon",     itemRows: [] },
          { code: "ictas",     row: 871, label: "İçtaş",         itemRows: [] },
          { code: "kamu",      row: 893, label: "Kamu",          itemRows: [] },
          { code: "kilyos",    row: 910, label: "Kilyos",        itemRows: [] },
        ],
        params: [],
      },
      arac_yakit: {
        total: { row: 970, label: "Araç Yakıt Giderleri", unit: "TL Karşılığı" },
        depts: [
          { code: "gyg",       row: 973,  label: "GYG",       itemRows: [] },
          { code: "operasyon", row: 1025, label: "Operasyon", itemRows: [] },
          { code: "kamu",      row: 1128, label: "Kamu",      itemRows: [] },
        ],
        params: [],
      },
      arac_bakim: {
        total: { row: 1163, label: "Taşıt Bakım Onarım", unit: "TL Karşılığı" },
        depts: [
          { code: "gyg",       row: 1165, label: "Genel Müdürlük", itemRows: [] },
          { code: "kamu",      row: 1191, label: "Kamu",            itemRows: [] },
          { code: "operasyon", row: 1207, label: "Operasyon",       itemRows: [] },
        ],
        params: [],
      },
      diger_hizmet: {
        total: { row: 1273, label: "Diğer Hizmet Giderleri", unit: "TL Karşılığı" },
        depts: [
          { code: "cop_kamyon", row: 1274, label: "Kiralık Çöp Kamyoneti + Çöp Döküm", itemRows: [] },
          { code: "su_nakliye", row: 1303, label: "Su Nakliye Giderleri-Operasyon",     itemRows: [] },
        ],
        params: [],
      },
      icme_suyu: {
        total: { row: 1312, label: "İçme Suyu Giderleri", unit: "TL Karşılığı" },
        depts: [
          { code: "gyg", row: 1313, label: "GYG",          itemRows: [] },
          { code: "oht", row: 1329, label: "OHT İçme Suyu", itemRows: [] },
        ],
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
