# BudgetSystem — Handoff Özeti v2 (2026-04-21 Akşam)

> **Kime:** Yeni chat oturumunda devralacak Claude  
> **Kimden:** 2026-04-21 akşam oturumu (Detay Rapor PDF YTD + Derin Analiz refaktoru)  
> **Önceki Handoff:** `docs/BudgetSystem_handoff_2026-04-21.md` — bugünün öğleden öncesi  
> **Repo:** `GmzGnc/BudgetSystem` — main branch  
> **Kullanıcı:** GAMZE — Windows, `C:/Users/GAMZE/budget-system`  
> **Supabase:** `sb-cobetaywhltbrrrkeqiu`  
> **Prod URL:** `https://budget-system-wine.vercel.app`  
> **Local dev:** `localhost:3002`

---

## 1. Çalışma Modeli (Değişmedi)

- GAMZE makinede Claude Code çalıştırıyor; bu handoff'u okuyan Claude doğrudan araçlara erişimi var.
- Her değişiklikten sonra **ICA ve GRUP test edilmeli**; ICE tekli regression henüz bu oturumda yapılmadı.
- `lineItemsData` ana state — tüm şirket verisi burada, her satırda `company: 'ICA' | 'ICE'` tag'i var.
- AI entegrasyonu: `/api/analyze-variance` → Claude Sonnet 4.6, şu an `max_tokens: 32000`.

---

## 2. Bugün Atılan Commit'ler (Öğleden Önce → Akşam Sonu)

| Hash | Mesaj | Ne Çözdü |
|---|---|---|
| `363f40a` | fix(grup): send companyBreakdown + isGroupView to PDF AI prompts | Detay Rapor PDF AI prompt'una ICA/ICE kırılımı eklendi |
| `87fc31f` | fix(api): raise AI max_tokens to 8000 | JSON truncation engeli kaldırıldı (sonradan 32000'e çıkarıldı) |
| `916925d` | fix(grup): dedup lineItemsData by (company, id) compound key | `loadFromDb` GRUP fetch'inde tekrarlayan satırlar önlendi |
| `8a0391a` | fix(pdf): handleFullPdf yillik butceyi aktif aylara gore kirpiyordu | Güvenlik 32.4M bug — aktif ay hesabı düzeltildi |
| `eab95cb` | feat(api): YTD period + monthly deep analysis + year-end projection | `analyze-variance` route'una `ytdMonthlyData`, `annualBudget`, `monthlyAnalysis[]`, `yearEndProjection` eklendi; max_tokens → 32000 |
| `62a7448` | feat(pdf): YTD-based Detay Rapor with monthly deep analysis | `date-utils.ts` oluşturuldu; handleFullPdf YTD veri geçiyor; PDF'e "Aylık Derin Analiz" + "Yıl Sonu Projeksiyon" bölümleri eklendi |
| `b340532` | fix(pdf): per-category active period replaces forced full-year default | `getActiveMonthIndices` ile her kategorinin kendi aktif ayları; Yönetici Özeti'ne "Aktif Dönem" kolonu |
| *(deps fix)* | *(commits arası)* | `lineItemsData` `handleFullPdf` useCallback deps'e eklendi — GRUP stale closure fix |
| *(sayı format)* | fix(api): enforce pure JSON number format | SYSTEM_PROMPT'a JSON sayı format kuralı eklendi; Güvenlik `153.939.384` hatası giderildi |
| `f3fef48` | chore: remove Guvenlik AI diagnostic logs | Geçici debug logları temizlendi, error response production shape'e döndü |

> Not: Gün içinde birkaç commit hash'i kesin sırayla yukarıda değil; `git log --oneline` ile teyit et.

---

## 3. Mevcut Kod Durumu

### 3.1 `src/lib/date-utils.ts` — Yeni Dosya

```ts
export function getActiveMonthIndices(budgetArr: number[], actualArr: number[]): number[] {
  // Önce: actual > 0 olan aylar
  // Fallback 1: actual yoksa budget > 0 olan aylar
  // Fallback 2: hiçbiri yoksa tüm 12 ay
}

export function getActivePeriodLabel(
  activeIdxs: number[], reportYear: number, monthLabels: readonly string[]
): string {
  // [0..11] → "Tum Yil 2025"
  // [0,1,2] → "Aktif Donem: Ocak-Mart 2025"
  // [0]     → "Aktif Donem: Ocak 2025"
}

// @deprecated — backward compat için bırakıldı:
export function getYtdIndices(reportYear: number): number[]
export function getYtdPeriodLabel(ytdIdxs, reportYear, monthLabels: readonly string[]): string
```

**Neden önemli:** Her kategori kendi aktif aylarını hesaplar. Güvenlik 3 ay (Oca-Mar), Temizlik 12 ay, yeni kategori 0 fiili → budget fallback. Önceki sistemde `[0..11]` hardcode vardı.

---

### 3.2 `src/app/page.tsx` — `handleFullPdf` (Büyük Değişiklik)

**useCallback deps (kritik):**
```tsx
}, [importedModelData, monthlyData, companyLabel, company, varDrawerResult, isDetailPdfLoading, lineItemsData]);
```
`lineItemsData` deps'e eklendi — önceden stale closure nedeniyle GRUP'ta ICE satırları görünmüyordu.

**Her kategori iterasyonunda aktif dönem hesabı:**
```tsx
const activeIdxs = getActiveMonthIndices(totalBudget, totalActual);
const activePeriodLabel = getActivePeriodLabel(activeIdxs, reportYear, MONTH_LABELS);
const isFullYear = activeIdxs.length === 12;

// Aktif dönem toplamları (AI + PDF için):
const cActual = activeIdxs.reduce((s, i) => s + (totalActual[i] ?? 0), 0);
const cBudget = activeIdxs.reduce((s, i) => s + (totalBudget[i] ?? 0), 0);
const annualBudget = totalBudget.reduce((s, v) => s + v, 0);

// YTD aylık detay (AI derin analiz için):
const monthlyDataForAI = activeIdxs.map((i) => ({
  monthIdx: i, monthLabel: MONTH_LABELS[i],
  budget: totalBudget[i] ?? 0, actual: totalActual[i] ?? 0,
  variance: ..., variancePct: ..., isActualMissing: ...
}));
```

**`analyze-variance` fetch body'sine eklenen alanlar:**
```tsx
ytdMonthlyData: monthlyDataForAI,
annualBudget,
reportDate: reportDateStr,
activeMonths: activeIdxs,
companyBreakdown,           // GRUP: ICA/ICE/net triple
isGroupView: company === 'GRUP',
periodLabel: activePeriodLabel,
deepAnalysis: true,
```

**pdfCategories return'e eklenen alanlar:**
```tsx
ytdBudget, ytdActual, ytdVariance, ytdVariancePct,
annualBudget, isFullYear, activePeriodLabel,
activeMonthsCount: activeIdxs.length,
periodLabel: activePeriodLabel,
reportDate: reportDateStr,
// aiAnalysis içinde:
monthlyAnalysis: (ai as any).monthlyAnalysis ?? null,
yearEndProjection: (ai as any).yearEndProjection ?? null,
```

---

### 3.3 `src/app/api/analyze-variance/route.ts`

**Yeni request alanları:**
```ts
annualBudget?: number;
ytdMonthlyData?: Array<{ monthIdx, monthLabel, budget, actual, variance, variancePct, isActualMissing }>;
reportDate?: string;
```

**Yeni response alanları:**
```ts
monthlyAnalysis?: Array<{
  monthLabel, budget, actual, variance, variancePct,
  isDataMissing, analysis, trendNote
}> | null;
yearEndProjection?: {
  projectedAnnualActual, projectedVariancePct,
  criticalThresholdMonth: string | null, description
} | null;
```

**`max_tokens`: 32000** (önceden 4000 → 8000 → 32000)

**`ytdAnalysisBlock`** — `ytdMonthlyData && ytdMonthlyData.length > 0 && annualBudget !== undefined` koşulunda prompt'a eklenir. Her aktif ay için 5-7 cümle analiz + yıl sonu projeksiyon talep eder.

**JSON sayı format kuralı (yeni):**
```
JSON icindeki TUM sayi alanlari SAF SAYI olmalidir.
DOGRU:   "projectedAnnualActual": 153939384
YANLIS:  "projectedAnnualActual": 153.939.384   (ikinci nokta JSON hatasi)
```
Bu kural Güvenlik'in `yearEndProjection` alanında Türkçe format (`153.939.384`) üretmesinden kaynaklanan JSON parse 500 hatasını gideriyor.

---

### 3.4 `src/components/pdf/generateBudgetPDF.ts`

**`CategoryPDFData` interface'ine eklenen alanlar:**
```ts
ytdBudget?: number; ytdActual?: number; ytdVariance?: number; ytdVariancePct?: number;
annualBudget?: number; isFullYear?: boolean; activePeriodLabel?: string;
activeMonthsCount?: number; periodLabel?: string; reportDate?: string;
aiAnalysis.monthlyAnalysis?: Array<{...}> | null;
aiAnalysis.yearEndProjection?: {projectedAnnualActual, projectedVariancePct, criticalThresholdMonth, description} | null;
```

**`addExecutiveSummaryPage`:**
- 7 sütunlu tablo (eklendi: "Aktif Dönem" kolonu): `[14, 73, 113, 153, 191, 226, 250]`
- Satır bütçesi: `cat.ytdBudget ?? cat.budgetTotal`
- Dönem metni: `activePeriodLabel` — "Tum Yil" veya "Oca-Mar 2025"

**`addCategoryPage` özet satırı:** 
- `isFullYear = true` → tek satır "Yillik Butce / Fiili / Sapma"
- `isFullYear = false` → iki satır: aktif dönem + "Yillik Butce (ref): X | Fiili girilmemis: N ay"

**`addCategoryAiPage` yeni bölümler:**
1. **"Aylık Derin Analiz"** — `aiAnalysis.monthlyAnalysis` varsa, her aktif ay için ayrı kart (5-7 cümle analiz + trendNote)
2. **"Yıl Sonu Projeksiyon"** — `aiAnalysis.yearEndProjection` varsa, projekte edilen yıllık fiili + açıklama (eski `yearEndForecast` string'ini override eder)

---

### 3.5 `mergeTotalRows` (Değişmedi, Hatırlatma)

```tsx
// src/app/page.tsx ~satır 115
function mergeTotalRows(rows: any[]): any {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  // element-wise sum monthly_budget + monthly_actual, company: 'GRUP'
}
```

GRUP'ta ICA + ICE iki total satırı → toplanır. Tekli modda `length === 1` → orijinal döner.

---

## 4. Açık Backlog

| # | Görev | Öncelik | Not |
|---|---|---|---|
| 1 | **ICA/ICE tekli mod Sapma Raporu regression testi** | Yüksek | Bu oturumda yapılmadı; handleFullPdf değişikliklerinin tekli moda etkisi kontrol edilmeli |
| 2 | **Yönetici Özeti PDF YTD teyit** | Orta | Ayrı buton (Detay Rapor değil); aktif dönem mantığını uyguluyor mu bilinmiyor |
| 3 | **Kategori PDF cache-miss dalı teyit** | Orta | `varDrawerResult` cache yokken direkt fetch yapıyor; bu path handleFullPdf ile tutarlı mı? |
| 4 | **React key uyarıları — `diger_cesitli`** | Düşük | `cay_ocagi`, `temizlik_malzeme` vs. duplicate key; fonksiyonel sorun yok |
| 5 | **KPI Aşama 3+** | Planlanmadı | — |

---

## 5. Bu Oturumdan Öğrenilen Pattern'ler

### 5.1 "UI doğruysa veri state'te vardır"
UI'nın kategori kartı doğru rakamı (58.8M) gösterirken handleFullPdf 49.7M gösteriyordu. Sebep: `lineItemsData` `useCallback` deps'te yoktu → stale closure. Her zaman önce: "UI nasıl hesaplıyor?" sorusunu sor, aynı path'i PDF handler'da kullan.

### 5.2 Türkçe sayı format refleksi (prompt disiplini)
Claude, `yearEndProjection.projectedAnnualActual` gibi büyük sayılarda Türkçe binlik ayırıcı (nokta) kullanabiliyor: `153.939.384`. JSON parser ikinci noktada patlıyor. Fix: SYSTEM_PROMPT'a açık sayı format kuralı ekle; örnekte saf sayı göster (`153939384`). Bu özellikle ICA-only + kısmi ay (Güvenlik) gibi complex projeksiyon hesaplarında tetikleniyor.

### 5.3 useCallback deps stale closure tuzağı
`lineItemsData` gibi async yüklenen state, `useCallback`'in deps dizisinde yoksa callback eski snapshot'ı tutmaya devam eder. Şirket değişince `company` deps'te olduğu için callback yenilenir ama async fetch henüz tamamlanmamışsa ICE satırları hâlâ yoktur. Çözüm: data-dependent callback'lerde veri state'ini de deps'e ekle.

### 5.4 Kategori-bazlı aktif dönem vs. sistem-geneli YTD
Sistem-geneli YTD (sistem saatine göre "bu yıl bu güne kadar") farklı kategoriler için yanlış olur: Güvenlik 3 ay fiili girerken Temizlik 12 ay girmiş olabilir. Doğru yaklaşım: her kategori için `getActiveMonthIndices(budget, actual)` — "fiili girilmiş aylar" dönem anlamına gelir.

---

## 6. Teknik Borç

- **`handleFullPdf` çok uzadı**: UI kategori kartı hesabıyla ortak bir helper'a çıkarılabilir. Şu an iki ayrı `CATEGORIES.map` döngüsü var (AI istekleri + PDF veri hazırlama); benzer hesaplar tekrar ediyor.
- **Error response basitleştirildi**: Debug sürecinde `details`, `rawTextPreview`, `errorContext` eklenmişti; temizlendi. Prod'da hata yakalaması için telemetry/structured logging eklemek iyi fikir.
- **`importedModelData` kalıntısı**: Hâlâ endeks kolonunda kullanılıyor (page.tsx L1334-1362 civarı). Statik fallback verilerle birlikte teknik borç.

---

## 7. Günlük Notlar (Appendix)

```
=== Journal Entry 2026-04-21 (akşam) ===
Detay Rapor PDF GRUP modu YTD + derin analiz refaktoru tamamlandı.
Tamamlanan: aktif dönem mantığı, ICA+ICE konsolidasyon (useCallback deps),
max_tokens 32000, Aylık Derin Analiz + Yıl Sonu Projeksiyon bölümleri,
Güvenlik AI (JSON Türkçe format disiplini), Yönetici Özeti "Aktif Dönem" kolonu,
mergeTotalRows compound key dedup.
Açık: tekli mod regression testi, Yönetici Özeti PDF YTD teyit,
kategori PDF cache-miss, React key uyarıları, KPI Aşama 3+.
```
