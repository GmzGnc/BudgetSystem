export type Company = 'ICA' | 'ICE' | 'GRUP';
export type IndexType =
  | 'Asgari Ücret'
  | 'TÜFE+Gıda'
  | 'Motorin+Asgari'
  | 'TÜFE'
  | 'Motorin'
  | 'ÜFE';

export interface Category {
  id: string;
  name: string;
  indexType: IndexType;
  /** Beklenen 2026 artış oranı — yüzde (örn. 20 → %20) */
  rate: number;
}

export interface MonthlyEntry {
  month: string;
  monthLabel: string;
  [categoryId: string]: number | string;
}

export interface CompanyBudget {
  company: 'ICA' | 'ICE';
  monthlyData: MonthlyEntry[];
}

export interface ProjectionCoefficients {
  [categoryId: string]: number;
}
