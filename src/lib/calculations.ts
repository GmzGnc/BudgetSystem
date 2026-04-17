import type { MonthlyEntry, ProjectionCoefficients } from '@/types';
import { CATEGORIES } from '@/data/categories';
import type { FoodDepartment } from '@/config/companyConfigs';

export function categoryIds(): string[] {
  return CATEGORIES.map((c) => c.id);
}

/** Sum of all categories across all months */
export function totalAnnual(monthlyData: MonthlyEntry[]): number {
  return monthlyData.reduce((sum, row) => {
    return sum + categoryIds().reduce((s, id) => s + ((row[id] as number) ?? 0), 0);
  }, 0);
}

/** Sum of a single category across all months */
export function categoryAnnual(monthlyData: MonthlyEntry[], catId: string): number {
  return monthlyData.reduce((sum, row) => sum + ((row[catId] as number) ?? 0), 0);
}

/** Monthly average spend (all categories) */
export function monthlyAverage(monthlyData: MonthlyEntry[]): number {
  if (monthlyData.length === 0) return 0;
  return totalAnnual(monthlyData) / monthlyData.length;
}

/**
 * Build 2026 projected monthly data by applying per-category coefficients
 * to the last month's actuals (Aralık 2025 as base).
 */
export function buildProjection2026(
  monthlyData: MonthlyEntry[],
  coefficients: ProjectionCoefficients,
): MonthlyEntry[] {
  const base = monthlyData[monthlyData.length - 1]; // Aralık 2025

  const MONTHS_2026 = [
    'Oca 26','Şub 26','Mar 26','Nis 26','May 26','Haz 26',
    'Tem 26','Ağu 26','Eyl 26','Eki 26','Kas 26','Ara 26',
  ];

  return MONTHS_2026.map((label, i) => {
    const entry: MonthlyEntry = { month: `2026-${String(i + 1).padStart(2, '0')}`, monthLabel: label };
    for (const id of categoryIds()) {
      const baseVal = (base[id] as number) ?? 0;
      const coeff = coefficients[id] ?? 1.2;
      // distribute evenly; slight ramp through year
      entry[id] = Math.round(baseVal * coeff * (1 + i * 0.002));
    }
    return entry;
  });
}

/** Variance between two totals as percentage */
export function variancePct(base: number, comparison: number): number {
  if (base === 0) return 0;
  return ((comparison - base) / base) * 100;
}

/** Per-category share of grand total (0-100) */
export function categoryShare(catTotal: number, grandTotal: number): number {
  if (grandTotal === 0) return 0;
  return (catTotal / grandTotal) * 100;
}

/** Aggregate monthly data for trend chart: sum all categories per month */
export function aggregateMonthly(monthlyData: MonthlyEntry[]): { monthLabel: string; total: number }[] {
  return monthlyData.map((row) => ({
    monthLabel: row.monthLabel as string,
    total: categoryIds().reduce((s, id) => s + ((row[id] as number) ?? 0), 0),
  }));
}

/**
 * Yemek bütçesi formülü — TEK AY için hesaplama.
 * Formula: Σ (meal × day × price) per active department.
 *
 * Kurallar:
 * - isActive=false → atlanır
 * - isSpecial=true → direkt specials[dept.name] değeri kullanılır (Kilyos gibi)
 * - meal=0 || day=0 → o dept o ay için atlanır (activeMonths yerine runtime kontrol)
 * - ICA: prices['global'] tüm departmanlar için kullanılır
 * - ICE: prices[dept.name] her departman için ayrı fiyat
 *
 * @param depts   companyConfigs'ten gelen FoodDepartment dizisi
 * @param meals   { deptName: mealCount }  — bu ay için öğün sayıları
 * @param days    { deptName: dayCount }   — bu ay için gün sayıları
 * @param prices  { deptName: unitPrice } | { global: price }
 * @param specials { deptName: directTL } — isSpecial=true olan departmanlar
 */
export function calculateFoodBudget(
  depts: FoodDepartment[],
  meals: Record<string, number>,
  days: Record<string, number>,
  prices: Record<string, number>,
  specials: Record<string, number>,
): number {
  let total = 0;
  for (const dept of depts) {
    if (!dept.isActive) continue;
    if (dept.isSpecial) {
      total += specials[dept.name] ?? 0;
      continue;
    }
    const meal = meals[dept.name] ?? 0;
    const day  = days[dept.name]  ?? 0;
    if (meal === 0 || day === 0) continue; // aktif ay değil (runtime skip)
    // ICA: prices['global'] | ICE: prices[dept.name]
    const price = prices[dept.name] ?? prices['global'] ?? 0;
    total += meal * day * price;
  }
  return total;
}
