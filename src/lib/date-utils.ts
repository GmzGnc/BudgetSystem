/**
 * YTD (Year-To-Date) yardımcı fonksiyonlar.
 * Sistem tarihine ve rapor yılına göre dahil edilecek ay indekslerini hesaplar.
 */

/**
 * Belirtilen rapor yılına göre YTD ay indekslerini (0-indexed) döndürür.
 * Sistem tarihinin son tamamlanmış ayına kadar dahildir.
 *
 * Örnekler (sistem tarihi 21 Nisan 2026):
 *   reportYear = 2026 → [0, 1, 2]  (Ocak, Şubat, Mart)
 *   reportYear = 2025 → [0..11]    (geçmiş yıl, tam yıl)
 *
 * Edge case (sistem tarihi 5 Ocak 2026):
 *   reportYear = 2026 → [0]        (Ocak başı fallback)
 */
export function getYtdIndices(reportYear: number): number[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  if (currentYear > reportYear) {
    // Geçmiş yıl — tüm 12 ay dahil
    return Array.from({ length: 12 }, (_, i) => i);
  }
  if (currentYear < reportYear) {
    // Gelecek yıl — henüz veri yok
    return [];
  }
  // Aynı yıl: son tamamlanmış aya kadar (Ocak = 0, Şubat = 1, ...)
  if (currentMonth === 0) {
    return [0]; // Yılın ilk ayı — en az Ocak dahil
  }
  return Array.from({ length: currentMonth }, (_, i) => i);
}

/**
 * YTD için dinamik periodLabel oluşturur.
 * Örn: [0,1,2] → "YTD Ocak-Mart 2026"
 */
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
