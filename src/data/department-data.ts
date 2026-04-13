export const DEPARTMENTS = ['GYG', 'Operasyon', 'Kamu', 'OHT', 'İçtaş', 'Kilyos'] as const;
export type Department = typeof DEPARTMENTS[number];

export interface DeptEntry {
  categoryId: string;
  categoryName: string;
  GYG: number;
  Operasyon: number;
  Kamu: number;
  OHT: number;
  İçtaş: number;
  Kilyos: number;
}

/** ICA 2025 yıllık departman × kategori kırılımı */
export const ICA_DEPT: DeptEntry[] = [
  { categoryId: 'guvenlik',  categoryName: 'Güvenlik',      GYG: 26788811, Operasyon: 37140459, Kamu:        0, OHT: 18379074, İçtaş: 0, Kilyos: 56256287 },
  { categoryId: 'temizlik',  categoryName: 'Temizlik',      GYG:  3782384, Operasyon: 16163372, Kamu:  2701703, OHT: 29328373, İçtaş: 0, Kilyos: 14958657 },
  { categoryId: 'yemek',     categoryName: 'Yemek',         GYG:  2839525, Operasyon:  1101409, Kamu:  7903090, OHT:        0, İçtaş: 0, Kilyos: 78376961 },
  { categoryId: 'servis',    categoryName: 'Servis/Ulaşım', GYG: 14357381, Operasyon: 57429525, Kamu:        0, OHT:        0, İçtaş: 0, Kilyos: 20303000 },
  { categoryId: 'arac_kira', categoryName: 'Araç Kira',     GYG:  9619457, Operasyon: 20000000, Kamu: 15000000, OHT:        0, İçtaş: 0, Kilyos:  5084690 },
];

export const DEPT_COLORS: Record<Department, string> = {
  GYG:       '#6366f1',
  Operasyon: '#3b82f6',
  Kamu:      '#22c55e',
  OHT:       '#f59e0b',
  İçtaş:    '#ec4899',
  Kilyos:    '#8b5cf6',
};

export const DEPT_LABELS: Record<Department, string> = {
  GYG:       'GYG',
  Operasyon: 'Operasyon',
  Kamu:      'Kamu',
  OHT:       'OHT',
  İçtaş:    'İçtaş',
  Kilyos:    'Kilyos',
};
