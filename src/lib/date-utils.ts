/**
 * Dönem (period) yardımcı fonksiyonlar.
 * Kategori bazlı aktif ay hesabı ve etiket üretimi.
 */

/**
 * Bir kategorinin aktif ay indekslerini döndürür.
 * Aktif ay: monthly_actual[i] > 0 olan aylar.
 * Fallback 1: hiç fiili yoksa budget > 0 olan aylar.
 * Fallback 2: hiçbiri yoksa tüm 12 ay (güvenli fallback).
 *
 * Örnekler:
 *   Güvenlik (3 ay fiili):   actual=[v,v,v,0,...] → [0,1,2]
 *   Temizlik (12 ay fiili):  actual=[v,...,v]     → [0..11]
 *   Yeni kategori (0 fiili): budget=[v,...,v]     → [0..11] (budget fallback)
 */
export function getActiveMonthIndices(
  budgetArr: number[],
  actualArr: number[]
): number[] {
  const actualIndices: number[] = [];
  for (let i = 0; i < 12; i++) {
    if ((actualArr[i] ?? 0) > 0) actualIndices.push(i);
  }
  if (actualIndices.length > 0) return actualIndices;

  // Fallback 1: fiili yoksa bütçenin tanımlı olduğu aylar
  const budgetIndices: number[] = [];
  for (let i = 0; i < 12; i++) {
    if ((budgetArr[i] ?? 0) > 0) budgetIndices.push(i);
  }
  if (budgetIndices.length > 0) return budgetIndices;

  // Fallback 2: tamamen boşsa tüm yıl
  return Array.from({ length: 12 }, (_, i) => i);
}

/**
 * Aktif ay indekslerinden dinamik dönem etiketi üretir.
 *
 * [0..11] (12 ay) → "Tum Yil 2025"
 * [0,1,2]        → "Aktif Donem: Ocak-Mart 2025"
 * [0]            → "Aktif Donem: Ocak 2025"
 * []             → "2025 (veri yok)"
 */
export function getActivePeriodLabel(
  activeIdxs: number[],
  reportYear: number,
  monthLabels: readonly string[]
): string {
  if (activeIdxs.length === 0) return `${reportYear} (veri yok)`;
  if (activeIdxs.length === 12) return `Tum Yil ${reportYear}`;
  const first = monthLabels[activeIdxs[0]] ?? String(activeIdxs[0] + 1);
  const last  = monthLabels[activeIdxs[activeIdxs.length - 1]] ?? String(activeIdxs[activeIdxs.length - 1] + 1);
  if (activeIdxs.length === 1) return `Aktif Donem: ${first} ${reportYear}`;
  return `Aktif Donem: ${first}-${last} ${reportYear}`;
}

// ── Geriye uyumluluk ─────────────────────────────────────────────────────────

/** @deprecated Kullanın: getActiveMonthIndices */
export function getYtdIndices(reportYear: number): number[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  if (currentYear > reportYear) return Array.from({ length: 12 }, (_, i) => i);
  if (currentYear < reportYear) return [];
  if (currentMonth === 0) return [0];
  return Array.from({ length: currentMonth }, (_, i) => i);
}

/** @deprecated Kullanın: getActivePeriodLabel */
export function getYtdPeriodLabel(
  ytdIdxs: number[],
  reportYear: number,
  monthLabels: readonly string[]
): string {
  if (ytdIdxs.length === 0) return `${reportYear} (veri yok)`;
  if (ytdIdxs.length === 12) return `Tum Yil ${reportYear}`;
  const first = monthLabels[ytdIdxs[0]] ?? String(ytdIdxs[0] + 1);
  const last  = monthLabels[ytdIdxs[ytdIdxs.length - 1]] ?? String(ytdIdxs[ytdIdxs.length - 1] + 1);
  return `YTD ${first}-${last} ${reportYear}`;
}
