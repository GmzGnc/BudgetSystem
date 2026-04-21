# BudgetSystem — Handoff Özeti (2026-04-21)

> **Kime:** Yeni chat oturumunda devralacak Claude  
> **Kimden:** Bir önceki chat Claude (Opus 4.7)  
> **Repo:** `GmzGnc/BudgetSystem` — main branch  
> **Kullanıcı:** GAMZE — Windows, `C:/Users/GAMZE/budget-system`  
> **Supabase:** `sb-cobetaywhltbrrrkeqiu`  
> **Prod URL:** `https://budget-system-wine.vercel.app`  
> **Local dev:** `localhost:3002`

## 🔑 Çalışma Modeli

1. Kullanıcı (GAMZE) Claude Code'u kendi makinesinde çalıştırıyor.
2. **Claude Web (sen) = analiz + prompt hazırlayıcı**. Doğrudan kullanıcının repo'suna yazmıyorsun; her işi bir markdown prompt'una dökersin ve kullanıcı bunu Claude Code'a yapıştırır.
3. Claude Code değişiklikleri uygular, commit'ler, push'lar. Kullanıcı sonucu ekran görüntüsü veya metin olarak paylaşır.
4. Her değişiklikten sonra hem görsel hem veri testi yapılır. Regression riskine karşı **ICA ve ICE tekli modlar her fix'te kontrol edilir**.
5. Memory sistemi kapalı — transcript'ler `/mnt/transcripts/` altında kalıyor.

## 🏗️ Mimari Özeti

- **Excel → Supabase `budget_line_items` → UI** (Next.js 15, TypeScript, Tailwind, shadcn)
- `lineItemsData` ana state — tüm veriyi tutar
- `row_type`: `total`, `dept`, `item`, `param`
- Şirketler: **ICA (2410)**, **ICE (2415)**, **GRUP** (konsolide görünüm)
- Kritik kural: **"ICA'yı bozmadan ICE'ı ICA'ya uyarla"** — her değişiklik `company === 'GRUP'` veya `company !== 'ICE'` koşullarıyla ICA davranışını korur
- AI entegrasyonu: `/api/analyze-variance` → Claude Sonnet 4.6 (`claude-sonnet-4-6`), max_tokens 4000
- PDF: jsPDF + Roboto font (Türkçe karakter desteği için)

---

# 1. Journal.txt (Tüm Oturumlar)

```
=== Journal Entry 2026-04-20T15:14:09 ===
2026-04-20-15-14-09-budget-system-ice-grup-integration.txt
[Multi-session BudgetSystem development covering ICE (2415) company integration 
and GRUP (ICA+ICE) consolidation view. Contains Excel parser analysis, Supabase 
schema work, UI refactor for two-level ICA/ICE hierarchy, and debugging sessions 
for data structure issues. Includes handoff prompts for Claude Code execution.]

=== Journal Entry 2026-04-21T14:44:19 ===
2026-04-21-14-44-18-budget-system-grup-consolidation.txt
[Multi-day Turkish BudgetSystem development session covering ICE (2415) company 
integration, GRUP (ICA+ICE) consolidation refactor, Sapma Raporu period selector 
+ AI prompt enhancement, and PDF Turkish font fix. Contains 12+ commits with bug 
fixes, UI refactors, and AI prompt engineering for consolidated variance analysis.]
```

---

# 2. Transcript Özetleri

## 2.1 — 2026-04-20: ICE + İlk GRUP Entegrasyonu

### Kritik Kararlar

1. **ICE (2415) bir ikinci şirket olarak eklendi**, ICA (2410) ile aynı veri yapısını paylaşır. 
2. **Excel parser'a virtual dept desteği eklendi** — ICE'ın bazı kategorilerinde (yemek, servis, temizlik) fiziksel dept satırı yerine "virtual" departman (ör. "Ana") kullanılır.
3. **COMPANY_CONFIG['2415']** oluşturuldu (654 satır, 9 kategori): servis, yemek, arac_yakit, icme_suyu, arac_bakim, hgs, arac_kira, temizlik, diger_cesitli. 16 bütçe kodu, 31 servis güzergahı, 22 araç.
4. **GRUP view eklendi** (üçüncü şirket seçeneği) — `loadFromDb` paralel ICA+ICE fetch yapıyor, her `lineItem`'a `company: 'ICA' | 'ICE'` tag'i ekliyor.
5. **GRUP modunda Excel import kapatıldı** — handleImport early return + alert.
6. **"ICA'yı bozma" prensibi benimsendi**: ICE-özel davranışlar `company === 'ICE'` koşuluyla, GRUP-özel davranışlar `company === 'GRUP'` koşuluyla gated edildi.

### Değişen Dosyalar (belli başlı commit'ler)

- `275015a` — `src/lib/excel-parser.ts` + `src/data/company-config.ts`: ICE config + virtual dept support
- `e577fcc` — `src/app/page.tsx`: ICE'ın servis/yemek/temizlik'i `GenericCategoryPanel`'e route edildi (eski ICA-özel panel'lere dokunulmadı, `company !== 'ICE'` kontrolü eklendi)
- `59229fc` — `loadFromDb` GRUP için 6 Promise paralel fetch; monthly/SAP/lineItems merge
- `03f7a2b` — GRUP kategori detayında "Şirket Kırılımı" tablosu + "Departman Detayı" accordion
- `c131725` — "Aylık Alt Kalem Detayı" üç seviyeli hiyerarşi (Şirket → Dept → Item) GRUP'ta
- `7ec65ef` — **Bug fix**: `diger_cesitli`'de ICA ve ICE aynı `dept_code`'ları paylaşıyordu (temizlik_malzeme, cay_ocagi vs.) → **compound key** `COMPANY__dept_code` kullanıldı (`makeGroupKey` helper)
- `b114089` — **Bug fix**: `diger_cesitli`'de `catItems.length === 0` early-return dept-fallback injection'ı kırıyordu; early-return kaldırıldı
- `4ab4db6` — Parametre Detayı GRUP modunda iki üst accordion (ICA Departmanları / ICE Departmanları)

### Açık Kalan Sorunlar (oturum sonunda)

- ICA/ICE tekli regression testleri kısmen yapıldı
- Sapma Raporu ve Varyans Analizi GRUP'ta henüz konsolide değildi → bu ikinci oturumun konusu oldu

---

## 2.2 — 2026-04-21: GRUP Konsolidasyon + Sapma Raporu + PDF

### Kritik Kararlar

1. **PDF Türkçe karakter sorunu çözüldü**: `public/fonts/Roboto-Regular.ttf` + `Roboto-Bold.ttf` eklendi (~578 KB). `generateBudgetPDF.ts`'e `loadRobotoFont(doc)` helper + `setDocFont(doc, weight)` wrapper. `USE_UNICODE_FONT` flag'i ile koşullu. 76 `setFont` çağrısı güncellendi. Commit `9add3be`.

2. **Detay Rapor PDF'te "importedModelData yüklenmedi" uyarısı kaldırıldı** — buton artık `lineItemsData` üzerinden çalışıyor. Commit `913e421`.

3. **GRUP Sapma Raporu tamamen refactor edildi** (Commit `29b8a19`):
   - Frontend: `varTotal` GRUP için `icaTotal + iceTotal` element-wise sum
   - `departmentBreakdown` ve `parameters`'a `company` field eklendi
   - Yeni `companyBreakdown` objesi: ICA/ICE/net triple + `balanced` flag
   - Fetch body'sine `isGroupView` + `companyBreakdown` eklendi
   - Backend: interface'e yeni alanlar, `paramLines` ve `deptBreakdownLines`'a `[ICA]`/`[ICE]` prefix, yeni `groupAnalysisBlock` prompt bloğu (konsolide tablo + dengeleme uyarısı + 5 maddelik analiz talimatı)

4. **Öneri prefix'leri eklendi** (Commit `aff084f`): AI prompt'unda her öneri `GRUP:`/`ICA:`/`ICE:` prefix'iyle başlamalı. Flat array yapısı korundu.

5. **Period seçici eklendi** (henüz kod-dışı commit) — Sapma Raporu butonunun yanında segment: `[Tek Ay | YTD | Yıl]`, default `Tek Ay`. Tüm data (params, totals, breakdowns) aynı `periodIdxs`'ten türetilir. Backend'e `periodLabel` gönderilir, prompt'a `📅 ANALİZ DÖNEMİ` notu eklenir.

6. **🏆 En kritik bug fix: `mergeTotalRows` helper** (Commit `94d5adb`):
   - **Tespit**: page.tsx'te **6 yerde** `cItems.find(row_type === 'total')` pattern'i vardı. GRUP'ta `.find()` ilk total'ı (ICA) alıp ICE'ı atlıyordu. Sonuç: GRUP Araç Kira kategori listesinde **49.7M görünüyordu** (olması gereken **58.8M**).
   - **Fix**: `mergeTotalRows(rows)` helper eklendi (~satır 115). `length === 1` → rows[0], `length >= 2` → element-wise sum + `company: 'GRUP'` tag.
   - **Değiştirilen 6 callsite**: L821 (handleFullPdf AI), L906 (handleFullPdf PDF data), L1177 (Detay PDF AI), L1222 (Detay PDF data), L1311 (kategori listesi liTotalItem), L1345 (cat2025Actual liTotal).
   - **Sonuç**: GRUP Araç Kira artık 58.810.242 TL bütçe, 64.948.244 TL fiili, +6.138.002 TL fark (%10,4) gösteriyor.

### Test Sonuçları — Doğrulanmış

| Test | Sonuç |
|---|---|
| ICA tekli Sapma Raporu | ✅ Eski davranış korundu |
| GRUP + Araç Kira + Tek Ay (Ocak) | ✅ 150.659 TL sapma, ICA tasarruf/ICE aşım dengeleme tespit edildi |
| GRUP + Araç Kira + YTD/Yıl | ✅ 6.138.002 TL, 12 ay trend analizi |
| GRUP + Araç Kira + Kategori PDF | ✅ 58.8M/64.9M, [ICA]/[ICE] etiketleri, senaryolar kategorize |
| GRUP kategori listesinde Araç Kira | ✅ 58.810.242 TL (önceden 49.7M gösteriyordu) |

### Açık Kalan Sorunlar (bu oturumun sonu)

- **⚠️ Detay Rapor PDF ve Yönetici Özeti PDF henüz `companyBreakdown`/`isGroupView` göndermiyor.** Yani mergeTotalRows sayesinde totals konsolide ama AI prompt "eski tarz" çalışıyor — `[ICA]/[ICE]` etiketleri gelmeyebilir. Bu test edilmedi.
- Kategori PDF (Varyans Analizi → PDF Raporu İndir) **dolaylı yoldan doğru çalışıyor**: `varDrawerResult` cache'lenmişse onu kullanıyor (satır 2624). Ama cache yoksa direkt fetch ediyor ve o fetch'te de parametreler eksik.
- **React key uyarıları** (console'da): `diger_cesitli` render'ında `cay_ocagi`, `cep_telefonu`, `diger_kamu`, `kirtasiye`, `kucuk_demirbas`, `posta_kargo`, `sehirici_ulasim`, `temizlik_malzeme` için duplicate key. Minör, fonksiyonellik sorunu yok.
- Teknik borç: `importedModelData` (endeks kolonunda hala kullanılıyor L1334-1362), `ICA_BUDGET/ICE_BUDGET/GROUP_MONTHLY` statik fallback, `ICA_DEPT/DEPARTMENTS` statik. Seviye 1/2/3 analizi `teknik_borc_analizi.md`'de.

---
# 3. Mevcut Kod Durumu (GRUP/ICA/ICE Odaklı)

## 3.1 — `mergeTotalRows` Helper (src/app/page.tsx, satır 115-139)

GRUP'ta ICA + ICE iki ayrı total satırı üretir. Bu helper element-wise toplayarak tek bir sanal satır döndürür.

```tsx
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeTotalRows(rows: any[]): any {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  const parseArr = (v: unknown): number[] => {
    if (!v) return [];
    if (typeof v === 'string') { try { return JSON.parse(v) as number[]; } catch { return []; } }
    return Array.isArray(v) ? (v as number[]) : [];
  };
  const sumArrays = (arrays: number[][]): number[] => {
    const maxLen = Math.max(...arrays.map((a) => a.length), 12);
    return Array.from({ length: maxLen }, (_, i) => arrays.reduce((s, a) => s + (a[i] ?? 0), 0));
  };
  return {
    ...rows[0],
    monthly_budget: sumArrays(rows.map((r) => parseArr(r.monthly_budget))),
    monthly_actual: sumArrays(rows.map((r) => parseArr(r.monthly_actual))),
    company: 'GRUP',
  };
}
```

**Kullanımı** (6 callsite'ta):
```tsx
const cTotal = mergeTotalRows(cItems.filter((i: any) => i.row_type === 'total'));
```

ICA/ICE tekli modlarda `rows.length === 1` → orijinal satır döner, davranış değişmez. GRUP'ta `length === 2` → toplanır.

---

## 3.2 — `handleFullPdf` Fonksiyonu (Detay Rapor PDF)

**Konum:** `src/app/page.tsx`, satır 826-961  
**Ne yapıyor:** CATEGORIES üzerinde `Promise.allSettled` ile her kategori için paralel AI analizi yapar, sonra `generateBudgetPDF` ile tek PDF oluşturur.

### Özel not — Fetch Body'si (Satır 898-915)

```tsx
const res = await fetch('/api/analyze-variance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'category',
    categoryName: c.name,
    budgetTotal: cBudget,
    actualTotal: cActual,
    varianceAmount: cVar,
    variancePercent: cVarPct,
    monthlyData: monthly,
    parameters: params,
    monthBreakdown,
    departmentBreakdown,
    analysisScope: 'full',
    activeMonths: activeIdxs,
  }),
});
```

### ⚠️ Eksik Olanlar (AKTİF GÖREV BAĞLAMINDA KRİTİK)

Bu fetch body'sinde şu alanlar **yok**:
- ❌ `isGroupView: company === 'GRUP'`
- ❌ `companyBreakdown: {...}` (ICA/ICE/net triple + balanced flag)
- ❌ `periodLabel` (örn. "Tüm Yıl")
- ❌ `departmentBreakdown[].company` (her dept'in `company` alanı)
- ❌ `parameters[].company` (her param'ın `company` alanı)

**Ne oluyor:** handleFullPdf `mergeTotalRows` sayesinde GRUP'ta doğru toplam rakamlarını alıyor (58.8M vb.), ama AI'a "bu GRUP raporu" demediği için:
- `[ICA]`/`[ICE]` etiketleri dept/param listelerinde görünmez
- AI dengeleme analizi yapamaz
- Öneriler GRUP/ICA/ICE olarak kategorize edilmez
- Raporda "ICA + ICE KONSOLİDE" başlığı çıkmaz

**Çözüm desiği:** Satır 2488-2525'teki Sapma Raporu button handler'ındaki mantığı kopyala — aynı `companyBreakdown` hesabı, aynı fetch body'si.

### `mergeTotalRows` Kullanımı (Satır 847 ve 931)

İki yerde de doğru kullanılıyor (commit `94d5adb`). Yalnızca yukarıdaki AI-prompt parametreleri eksik.

---

## 3.3 — Yönetici Özeti PDF Button (Satır 1178-1300 civarı)

**Aynı sorun:** Satır 1227'deki fetch body'sinde `isGroupView`, `companyBreakdown` yok.

---

## 3.4 — Kategori PDF Button (Varyans Analizi → PDF Raporu İndir)

**Konum:** Satır 2583-2760 civarı  
**Fetch yeri:** Satır 2626-2648

```tsx
let aiResult: typeof varDrawerResult | null = varDrawerResult ?? null;
if (!aiResult) {
  const res = await fetch('/api/analyze-variance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'category',
      categoryName: cat.name,
      budgetTotal: activeBudget,
      actualTotal: activeActual,
      varianceAmount: activeVar,
      variancePercent: activeVarPct,
      monthlyData: monthly,
      parameters: allParams...,
      monthBreakdown,
      departmentBreakdown,
      activeMonths: activeIdxs,
      analysisScope: 'full',
      deepAnalysis: true,
    }),
  });
  aiResult = res.ok ? await res.json() : null;
}
```

**⚠️ Burada da `companyBreakdown`, `isGroupView`, `periodLabel` yok.**

**Ama dolaylı doğru çalışabilir:** Eğer kullanıcı önce drawer'da Sapma Raporu ürettiyse, `varDrawerResult` cache'li ve PDF ondan GRUP-farkındalıklı data okur. Cache yoksa (örn. sayfa yenileme sonrası), ham fetch yapılır ve GRUP bilgisi kaybolur.

---

## 3.5 — Sapma Raporu Button (Satır 2394-2550) — DOĞRU ÇALIŞAN

**Bu callsite tamamen refactor edildi ve test edildi — referans implementasyon.**

### `periodIdxs` Hesaplama (~Satır 2400-2408)

```tsx
const fullMonthIdxs = Array.from({ length: 12 }, (_, i) => i);
const ytdMonthIdxs = MONTH_LABELS
  .map((_, mi) => mi)
  .filter((mi) => (totalActualArr[mi] ?? 0) > 0);

const periodIdxs: number[] = sapmaPeriod === 'month'
  ? [safeMonth]
  : sapmaPeriod === 'ytd'
    ? ytdMonthIdxs
    : fullMonthIdxs;

const periodLabel: string = sapmaPeriod === 'month'
  ? `${MONTH_LABELS[safeMonth]}`
  : sapmaPeriod === 'ytd'
    ? `YTD (${MONTH_LABELS[ytdMonthIdxs[0] ?? 0]}-${MONTH_LABELS[ytdMonthIdxs[ytdMonthIdxs.length - 1] ?? 0]})`
    : 'Tüm Yıl';
```

### `companyBreakdown` Hesaplama (~Satır 2466-2488)

```tsx
const companyBreakdown = company === 'GRUP' && (icaTotal || iceTotal) ? (() => {
  const icaPB = periodIdxs.reduce((s, i) => s + (icaBudget[i] ?? 0), 0);
  const icaPA = periodIdxs.reduce((s, i) => s + (icaActual[i] ?? 0), 0);
  const icePB = periodIdxs.reduce((s, i) => s + (iceBudget[i] ?? 0), 0);
  const icePA = periodIdxs.reduce((s, i) => s + (iceActual[i] ?? 0), 0);
  const icaVar = icaPA - icaPB;
  const iceVar = icePA - icePB;
  const netVar = icaVar + iceVar;
  const netBudget = icaPB + icePB;
  return {
    ICA: { budget: icaPB, actual: icaPA, variance: icaVar, 
           variancePercent: icaPB > 0 ? (icaVar / icaPB) * 100 : 0 },
    ICE: { budget: icePB, actual: icePA, variance: iceVar, 
           variancePercent: icePB > 0 ? (iceVar / icePB) * 100 : 0 },
    net: { 
      budget: netBudget, 
      actual: icaPA + icePA, 
      variance: netVar, 
      variancePercent: netBudget > 0 ? (netVar / netBudget) * 100 : 0, 
      balanced: (icaVar * iceVar < 0) 
    },
  };
})() : null;
```

### Fetch Body (Satır 2508-2528)

```tsx
fetch('/api/analyze-variance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'category',
    categoryName: cat.name,
    budgetTotal: activeBudgetTotal,
    actualTotal: activeActualTotal,
    varianceAmount: activeVarianceAmount,
    variancePercent: activeVariancePct,
    monthlyData: monthly,
    parameters: params,                    // ← her p'nin company alanı var
    subItems: subItems.length > 0 ? subItems : undefined,
    monthBreakdown,
    departmentBreakdown,                   // ← her d'nin company alanı var
    analysisScope: 'full',
    activeMonths: periodIdxs,              // ← periodIdxs
    companyBreakdown,                      // ← YENİ
    isGroupView: company === 'GRUP',       // ← YENİ
    periodLabel,                           // ← YENİ
  }),
});
```

---

## 3.6 — Backend — `/api/analyze-variance/route.ts`

### Interface Güncellemeleri

```ts
export interface VarianceAnalysisRequest {
  mode: 'category' | 'department';
  categoryName: string;
  // ... mevcut alanlar
  
  // GRUP-awareness
  isGroupView?: boolean;
  companyBreakdown?: {
    ICA: { budget: number; actual: number; variance: number; variancePercent: number };
    ICE: { budget: number; actual: number; variance: number; variancePercent: number };
    net: { budget: number; actual: number; variance: number; variancePercent: number; balanced: boolean };
  } | null;
  periodLabel?: string;
  
  departmentBreakdown?: Array<{
    name: string;
    company?: 'ICA' | 'ICE' | null;
    budget: number;
    actual: number;
    variance: number;
    variancePercent: number;
  }>;
}
```

### `deptBreakdownLines` ve `paramLines` — Company Tag

```ts
// departmentBreakdown
const deptBreakdownLines = departmentBreakdown && departmentBreakdown.length > 0
  ? '\nDEPARTMAN BREAKDOWN:\n' + departmentBreakdown
      .map((d: any) => {
        const companyTag = d.company ? `[${d.company}] ` : '';
        return `  ${companyTag}${d.name}: Bütçe ${...}`;
      })
      .join('\n')
  : '';

// paramLines benzer şekilde, (p as any).company varsa [ICA]/[ICE] prefix
```

### `groupAnalysisBlock` Prompt Parçası (Satır 345-371)

```ts
const groupAnalysisBlock = (isGroupView && companyBreakdown) ? `

═══════════════════════════════════════════════════════════════
⚠️ BU RAPOR ICA + ICE ŞİRKETLERİNİN KONSOLİDE (GRUP) VERİSİDİR
═══════════════════════════════════════════════════════════════

ŞİRKET BAZLI KIRILIM (AKTİF DÖNEM):
- ICA:  Bütçe ... TL, Fiili ... TL, Varyans ±... TL (±...%)
- ICE:  Bütçe ... TL, Fiili ... TL, Varyans ±... TL (±...%)
- NET GRUP: Bütçe ... TL, Fiili ... TL, Net Varyans ±... TL (±...%)
${companyBreakdown.net.balanced ? `
🔔 DENGELEME ETKİSİ TESPİT EDİLDİ: Bir şirket aşımda, diğeri tasarrufta.
` : ''}

ANALİZİN GRUP-ÖZEL BEKLENTİLERİ:
1. Departman ve parametre listesinde her öğenin başında [ICA] veya [ICE] etiketi var — bunları karıştırma.
2. "Baskın Etken", "İkincil Etken", "Karma Etki" bölümlerinde hangi şirketten kaynaklandığını belirt.
3. "Öneriler" (recommendations array) bölümünde her öneri string'inin BAŞINA şu etiketlerden birini ekle:
   - "GRUP:" → konsolide / her iki şirkete dokunan öneriler için
   - "ICA:"  → sadece ICA'ya özel aksiyon maddeleri için
   - "ICE:"  → sadece ICE'a özel aksiyon maddeleri için
   Sıralama: önce GRUP, sonra ICA, sonra ICE.
4. Optimizasyon senaryolarında her öğenin adında [ICA]/[ICE] prefix olsun.
5. Dengeleme tespit edildiyse: tasarruf sağlayan şirketin mevcut disiplinini koruma önerisini ekle.

` : '';
```

### `periodNote` Prompt Parçası

```ts
const periodNote = periodLabel 
  ? `\n📅 ANALİZ DÖNEMİ: ${periodLabel}\nTüm rakamlar bu döneme aittir. Rapor başlığında ve yorumda bu dönemi mutlaka belirt.\n`
  : '';

const userMessage = `${depthNote}${periodNote}${groupAnalysisBlock}Analiz konusu: ${subject} ...`;
```

### Backend Davranışı — Backward Compatible

- `isGroupView` veya `companyBreakdown` yoksa → `groupAnalysisBlock` = `''` (hiç etkilemez)
- `periodLabel` yoksa → `periodNote` = `''`
- `d.company` veya `p.company` yoksa → tag yok (eski davranış)

Yani **frontend'in 3 eksik callsite'ı** bu alanları gönderdiğinde backend anında doğru çalışacak — backend refactor gerekmiyor.

---

# 4. Son Commit'ler

```
94d5adb fix(grup): sum ICA+ICE total rows instead of picking the first
aff084f feat(grup): prefix recommendations with GRUP:/ICA:/ICE: labels
29b8a19 feat(grup): consolidated ICA+ICE data for Sapma Raporu + AI prompt awareness
913e421 fix(pdf): remove importedModelData guard from Detay Rapor PDF button
9add3be fix(pdf): add Roboto font for proper Turkish character rendering
4ab4db6 feat(grup): two-level ICA/ICE grouping in Parametre Detayı
b114089 fix(diger_cesitli): don't early-return when catItems is empty
7ec65ef fix(grup): compound key (COMPANY__dept_code) for Aylık Alt Kalem groupMap
c131725 feat(grup): three-level Şirket→Dept→Item hierarchy in Aylık Alt Kalem Detayı
03f7a2b feat(grup): show Şirket + Dept breakdown in GRUP category detail
59229fc feat(grup): parallel load ICA+ICE for Grup Konsolide view
e577fcc feat(ice): route ICE's servis/yemek/temizlik to GenericCategoryPanel
275015a feat(ice): add 2415 (ICE) category config + virtual dept support in parser
```

---

# 5. Açık Backlog (Öncelik Sırasıyla)

## 5.1 — [AKTİF] GRUP Detay Rapor PDF Testi (Yüksek Öncelik)

### Durum
Kullanıcı az önce Kategori PDF'ini (Araç Kira için) test etti ve **doğru** çıktı. Ama bu dolaylı yoldan `varDrawerResult` cache'i üzerinden çalıştı.

### Yapılacak
1. **GRUP'ta Detay Rapor PDF butonuna bas** (tüm kategoriler için AI analizi çalıştırır, ~1-2 dakika)
2. PDF'i incele:
   - Her kategoride GRUP rakamları konsolide mi (58.8M vb.)?
   - AI yorumunda `[ICA]` / `[ICE]` etiketleri var mı?
   - Öneriler `GRUP:` / `ICA:` / `ICE:` ile mi başlıyor?
   - Dengeleme tespiti yapılmış mı?

### Beklenen Sonuç
**Büyük olasılıkla AI yorumu eksik** çünkü fetch body'sinde `companyBreakdown`/`isGroupView` yok. Totals doğru (mergeTotalRows sayesinde) ama prompt "eski tarz".

### Fix Prompt Şablonu
Eksiklik doğrulanırsa, `src/app/page.tsx`'teki üç callsite (L898, L1227, L2626) için aynı mantık:

1. `icaTotal` / `iceTotal` / `icaBudget[]` vb. bölümlü veriyi hazırla (Sapma button'daki gibi)
2. `departmentBreakdown` ve `parameters`'a `company` alanını ekle
3. `companyBreakdown` objesini hesapla
4. Fetch body'sine `companyBreakdown`, `isGroupView: company === 'GRUP'`, `periodLabel: 'Tüm Yıl'` (veya handleFullPdf için statik) ekle

**Referans:** Satır 2394-2550 arası Sapma button handler'ı. Özellikle 2400-2528.

---

## 5.2 — ICA/ICE Tekli Mod Sapma Raporu Regression (Orta Öncelik)

Kullanıcı bugün GRUP'u tek tek test etti ama tekli ICA/ICE için Sapma Raporu'nu tekrar test etmedi (önceden çalışıyordu).

### Yapılacak
- ICA seç → herhangi bir kategori → Sapma Raporu (her period'da)
- Raporda **"KONSOLİDE" / `[ICA]` / `[ICE]` / `GRUP:` / `ICA:` / `ICE:` prefix'leri OLMAMALI**
- Rakamlar eski haliyle (sadece ICA verisi)
- ICE için de aynısı

Eğer herhangi bir regression görülürse, koşullu (`isGroupView` yoksa) davranış bozulmuş demektir — backend'deki `(isGroupView && companyBreakdown)` guard'ını kontrol et.

---

## 5.3 — Yönetici Özeti PDF GRUP Testi (Orta Öncelik)

5.1 ile aynı sorun burada da var. Detay Rapor fix uygulanırsa aynı pattern'i buraya da yaymak gerekecek.

---

## 5.4 — React Key Uyarıları (Düşük Öncelik — Minör)

Console'da GRUP modunda `diger_cesitli` render edildiğinde:

```
Encountered two children with the same key, `cay_ocagi`.
Encountered two children with the same key, `cep_telefonu`.
... (toplam 8 dept)
```

Fonksiyonel etkisi yok ama teknik borç. Faz 2'deki "Şirket Kırılımı / Departman Detayı" tablosunda bir yerde sadece `dept_code` key kullanılıyor, `${company}_${dept_code}` yapılmalı. Spesifik lokasyon henüz tespit edilmedi.

---

## 5.5 — KPI Aşama 3-4-5 (Planlama)

Bir önceki seslenmede 5 aşamalı KPI refactor planı vardı. Aşama 1-2 tamamlandı (servis endeksi eklendi). Aşama 3+ planlama bekliyor — büyük ihtimalle servis endeks KPI kartlarını diğer kategorilere yaymak ve yeni KPI tipleri eklemek.

---

## 5.6 — Araç Yakıt / Araç Bakım itemRows Kontrol (Düşük)

ICA tarafında bazı `itemRows` alanlarının `[]` boş olduğu tespit edilmişti. Veri akışı tekrar kontrol edilmeli.

---

## 5.7 — Teknik Borç (İleride — Rapor Hazır)

`teknik_borc_analizi.md` 3 seviyeli plan içeriyor:
- **Seviye 1 (Güvenli):** handleFullPdf useCallback deps'ten importedModelData çıkar, ölü yorumlar
- **Seviye 2 (Orta):** Kategori özet tablosunda endeks kolonunu lineItemsData'ya taşı (L1334-1362), ICA_DEPT dinamik
- **Seviye 3 (Yüksek):** ICA_BUDGET/ICE_BUDGET/GROUP_MONTHLY statik fallback kaldır, DEPARTMENTS dinamik

Kullanıcı "endeks bug'ı çıkınca ele alırız" dedi — şimdilik dokunulmayacak.

---

# 6. Referans Dosyalar (/mnt/user-data/outputs/)

- `grup_sapma_analiz.md` — GRUP Sapma Raporu tasarım dokümanı (bu chat'te üretildi)
- `grup_sapma_fix.md` — Data konsolide + AI prompt uygulama prompt'u
- `sapma_period_fix.md` — Period seçici (Tek Ay/YTD/Yıl) uygulama prompt'u
- `grup_total_merge_fix.md` — mergeTotalRows helper + 6 callsite fix
- `teknik_borc_analizi.md` — 3 seviyeli temizlik raporu
- `pdf_font_fix.md` — Roboto font eklenmesi
- `faz_param_refactor.md` — Parametre Detayı GRUP refactor
- `grup_panel_refactor_commit1.md`, `..._commit2.md` — GenericCategoryPanel GRUP refactor
- `faz2_prompt.md` — Şirket Kırılımı / Departman Detayı tablosu
- `GRUP_analiz_raporu.md` — GRUP problem analizi (ilk başta)
- `veri_teshis.md`, `sanity_check_commits.md` — Debug komutları

Bu dosyaların dördü aşağıda tam olarak embedded:

---

# 7. Embedded Markdown Referansları

## 7.1 — grup_sapma_analiz.md

# GRUP Konsolide — Sapma Raporu Tasarım Raporu

## Mevcut Durum (Bug)

Kullanıcı GRUP seçiliyken bir kategoride "Sapma Raporu Oluştur" butonuna bastığında, AI raporu **sadece ICA'nın verilerine** bakarak hazırlanıyor. Örnek: Araç Kira kategorisinde:

| Veri | Gerçek GRUP | AI'ın Gördüğü |
|---|---|---|
| Bütçe | 49.7M + 9.1M = **58.8M** | 49.7M (sadece ICA) |
| Fiili | 54.9M + 10M = **64.9M** | 54.9M (sadece ICA) |
| Sapma | 5.2M + 0.9M = **6.1M** | 5.2M |

### Kök Neden

`src/app/page.tsx` satır 2199:

```ts
const varTotal = varLineItems.find((i: any) => i.row_type === 'total');
```

GRUP'ta `varLineItems`'de **iki total satırı var** (ICA ve ICE). `.find()` ilkini alıyor → sadece ICA. Aynı sorun `varDepts` ve `varParams`'ta da var — ICA+ICE satırları karışık listeleniyor, AI bunları tek şirketin dept'leri sanıp yorumluyor.

---

## Kullanıcı Vizyonu

Senden aldığım yönerge:
1. **Rakamlar tam konsolide olmalı** — bütçe, fiili, sapma hepsi ICA+ICE birleşik
2. **Dengeleme etkisi görünmeli** — ICA aşımda + ICE tasarrufta gibi durumlarda net sapma dışında dengeleme de belirtilmeli
3. **Şirket bazlı öngörü** — AI hem konsolide hem şirket bazlı aksiyon önerebilir
4. **GRUP'a özel rapor mantığı** — ICA/ICE tekli raporlarla aynı olmamalı

---

## Teknik Plan — 3 Katmanlı Çözüm

### Katman 1: Veri Hazırlık (Frontend — page.tsx)

Sapma Raporu butonuna basıldığında gönderilen data'yı GRUP için zenginleştir:

#### 1A. Total satırını konsolide et
```ts
// MEVCUT (bug'lı):
const varTotal = varLineItems.find((i) => i.row_type === 'total');

// YENİ:
const totalRows = varLineItems.filter((i) => i.row_type === 'total');
const varTotal = company === 'GRUP'
  ? consolidateTotals(totalRows)   // ICA total + ICE total → tek total
  : totalRows[0];
```

#### 1B. Dept breakdown'u şirket bilgisiyle zenginleştir

`departmentBreakdown` gönderimini iki katmanlı yap:

```ts
const departmentBreakdown = varDepts.map((d) => ({
  name: d.label,
  company: d.company,      // ← GRUP için: 'ICA' veya 'ICE'
  budget: activeBudget,
  actual: activeActual,
  variance: activeActual - activeBudget,
  variancePercent: ...,
}));
```

Aynı dept_code iki şirkette varsa (örn. `cay_ocagi`), her birinin kendi şirketi etiketli kalır.

#### 1C. Param breakdown aynı şekilde
ICA'nın paramları + ICE'nın paramları company tag'li. AI "bunun biri ICA, biri ICE" bilerek yorumlayabilir.

#### 1D. Yeni alan: `companyBreakdown`

```ts
const companyBreakdown = company === 'GRUP' ? {
  ICA: { 
    budget: icaTotalBudget, 
    actual: icaTotalActual, 
    variance: icaTotalActual - icaTotalBudget,
    variancePercent: ...,
  },
  ICE: { 
    budget: iceTotalBudget, 
    actual: iceTotalActual,
    variance: iceTotalActual - iceTotalBudget,
    variancePercent: ...,
  },
  net: {
    budget: icaTotalBudget + iceTotalBudget,   // konsolide
    actual: icaTotalActual + iceTotalActual,
    variance: ...,
    balanced: (icaVar * iceVar < 0),  // ← dengeleme etkisi var mı?
  }
} : null;
```

`balanced: true` olduğunda ICA aşımda + ICE tasarrufta (veya tersi) — AI buna dikkat edecek.

#### 1E. API isteğine yeni alan: `analysisScope: 'group'`

`/api/analyze-variance` endpoint'i scope'u görünce özel prompt kullanır.

---

### Katman 2: AI Prompt (Backend — /api/analyze-variance)

Mevcut prompt ICA/ICE tekli mantığına göre yazılmış. GRUP için özel bir prompt bloğu:

```
Eğer analysisScope === 'group':
  "Bu rapor ICA ve ICE şirketlerinin konsolide GRUP verisidir.
   companyBreakdown.ICA ve companyBreakdown.ICE ayrı ayrı performansı gösteriyor.
   companyBreakdown.net konsolide toplamdır.
   
   ÖNEMLİ ANALİZ NOKTALARI:
   - Eğer companyBreakdown.net.balanced === true, dengeleme etkisi var — 
     bir şirket aşımdayken diğeri tasarrufta. Bunu açıkça belirt.
   - Departman listesinde her dept'in `company` alanı var — ICA'nın mı ICE'ın mı 
     olduğunu belirt.
   - Öneriler hem konsolide hem şirket bazında olmalı:
     * 'ICA tarafında yapılması gerekenler...' 
     * 'ICE tarafında yapılması gerekenler...'
     * 'Konsolide olarak GRUP stratejisi...'"
```

### Katman 3: Rapor Görünümü (Sapma Drawer)

AI cevabı geldikten sonra gösterilen drawer (Varyans Drawer). GRUP için:

1. Üstte **Şirket Kırılımı kartı** (yeni): "ICA: +5.2M aşım, ICE: +0.9M aşım, Net: +6.1M" gibi
2. Dengeleme varsa özel banner: "⚖️ Dengeleme Etkisi: ICA 5M aşım, ICE 1M tasarruf, Net 4M aşım"
3. Dept breakdown'da şirket badge'leri (ICA indigo, ICE sky)
4. AI'ın konsolide + şirket bazlı önerileri ayrı bölümler halinde

---

## Uygulama Önceliği

Bu 3 katman hem önemli hem de ayrı ayrı test edilebilir. Sırayı şöyle öneriyorum:

### Adım 1 (kritik): Data konsolide (Katman 1A-1D)
Toplamlar doğrusun — AI raporu en azından doğru sayılara baksın. Mevcut prompt sade de olsa bu aşamada kabul edilebilir sonuç verir.

**Commit:** `fix(grup): consolidate ICA+ICE totals in sapma report data`

### Adım 2 (AI kalitesi): Backend prompt güncelle (Katman 2)
AI'a "bu GRUP raporu" diyelim, şirket bilincinde analiz yapsın.

**Commit:** `feat(grup): AI prompt awareness for consolidated analysis`

### Adım 3 (görsel): Drawer UI (Katman 3)
Şirket kırılım kartı, dengeleme bannerı, dept badge'leri.

**Commit:** `feat(grup): company breakdown card in Sapma drawer`

### Adım 4 (Opsiyonel): Sapma Raporu PDF için de aynı mantık
Şu an sadece drawer'daki AI raporu. PDF üretimi yapılıyorsa bu da GRUP-aware olmalı.

---

## Riskler ve Dikkat

1. **ICA/ICE tekli raporlar bozulmamalı** — tüm değişiklikler `company === 'GRUP'` koşuluna bağlı
2. **AI API endpoint'i değişiyor** — ama backward compatible olmalı (companyBreakdown optional)
3. **Dengeleme hesabı (balanced flag)** — nadiren karşılaşılacak ama ortaya çıkınca değerli rapor sağlar
4. **Param listesinde duplicate** — ICA'nın "TÜFE" + ICE'nın "TÜFE" gibi aynı isim farklı değerler olabilir, label'da şirket eki gerekebilir

---

## Sonraki Adım

Eğer bu plan uygun görünüyorsa, **Adım 1** için Claude Code prompt'u hazırlayabilirim. O prompt ile data konsolide olur, AI hemen doğru rakamları görür, rapor en azından teknik olarak doğru olur. Sonra Adım 2 ile AI'ın rapor kalitesini iyileştiririz.

---

## 7.2 — grup_sapma_fix.md

# GRUP Konsolide Sapma Raporu — Data Konsolide + AI Prompt

## Sorun

GRUP seçiliyken kategori detayında "Sapma Raporu Oluştur" butonuna basılınca AI raporu **sadece ICA'nın verilerine** bakıyor:

- `varLineItems.find(row_type==='total')` iki total'dan ilkini alıyor → sadece ICA
- `departmentBreakdown` ICA+ICE dept'leri flat list — AI karışık yorumluyor
- `parameters` aynı sorun

## Hedef

GRUP modunda:
1. **Kategori totalları konsolide** (ICA+ICE bütçe/fiili toplam)
2. **Dept ve param listeleri** şirket bilgisiyle zenginleştirilmiş
3. **Yeni `companyBreakdown`** alanı → AI ICA vs ICE performansını ayrı ayrı görüp analiz edebilsin
4. **Dengeleme bilinci** → Eğer biri aşımda biri tasarrufta ise AI'ın buna dikkat çekmesi
5. **ICA/ICE tekli davranış DEĞİŞMEYECEK**

---

## Dosya 1: `src/app/page.tsx` — Data hazırlığı

### Değişiklik 1A: `varTotal` konsolide et (yaklaşık satır 2199)

Mevcut:

```tsx
const varLineItems = (lineItemsData as any[]).filter((i: any) => i.category_code === cat.id);
const varTotal = varLineItems.find((i: any) => i.row_type === 'total');
const varDepts  = varLineItems.filter((i: any) => i.row_type === 'dept');
const varParams = varLineItems.filter((i: any) => i.row_type === 'param');
if (!varTotal) {
  return (
    <div ...>Bu kategori için veri bulunamadı</div>
  );
}
const totalBudgetArr = ensureArr(varTotal.monthly_budget);
const totalActualArr = ensureArr(varTotal.monthly_actual);
```

Yeni (GRUP için total'ları topla):

```tsx
const varLineItems = (lineItemsData as any[]).filter((i: any) => i.category_code === cat.id);
const allTotalRows = varLineItems.filter((i: any) => i.row_type === 'total');

// GRUP'ta iki total var (ICA + ICE) — topla. Tekli şirkette tek total var.
const icaTotal = allTotalRows.find((t: any) => t.company === 'ICA') ?? null;
const iceTotal = allTotalRows.find((t: any) => t.company === 'ICE') ?? null;
const singleTotal = allTotalRows[0] ?? null;  // ICA/ICE tekli mod için fallback

const varTotal = company === 'GRUP'
  ? (icaTotal || iceTotal)  // en az biri olmalı; altta birleştirme yapıyoruz
  : singleTotal;

const varDepts  = varLineItems.filter((i: any) => i.row_type === 'dept');
const varParams = varLineItems.filter((i: any) => i.row_type === 'param');

if (!varTotal) {
  return (
    <div ...>Bu kategori için veri bulunamadı</div>
  );
}

// GRUP'ta totalBudgetArr ve totalActualArr ICA+ICE toplamı
const icaBudget = icaTotal ? ensureArr(icaTotal.monthly_budget) : Array(12).fill(0);
const icaActual = icaTotal ? ensureArr(icaTotal.monthly_actual) : Array(12).fill(0);
const iceBudget = iceTotal ? ensureArr(iceTotal.monthly_budget) : Array(12).fill(0);
const iceActual = iceTotal ? ensureArr(iceTotal.monthly_actual) : Array(12).fill(0);

const totalBudgetArr = company === 'GRUP'
  ? icaBudget.map((v, i) => v + iceBudget[i])
  : ensureArr(varTotal.monthly_budget);

const totalActualArr = company === 'GRUP'
  ? icaActual.map((v, i) => v + iceActual[i])
  : ensureArr(varTotal.monthly_actual);
```

Bu değişiklik sayesinde ekrandaki KPI kartları, aylık grafikler, tüm hesaplar GRUP'ta doğru konsolide rakamları kullanır — **daha başlangıçta her yerde doğru değer var.**

### Değişiklik 1B: `departmentBreakdown`'a company alanı ekle (satır ~2382-2394)

Mevcut:

```tsx
const departmentBreakdown = (varDepts as any[]).map((d) => {
  const dBudget = ensureArr(d.monthly_budget);
  const dActual = ensureArr(d.monthly_actual);
  const activeBudget = activeMonthIdxs.reduce((s, i) => s + (dBudget[i] ?? 0), 0);
  const activeActual = activeMonthIdxs.reduce((s, i) => s + (dActual[i] ?? 0), 0);
  return {
    name: d.label,
    budget: activeBudget,
    actual: activeActual,
    variance: activeActual - activeBudget,
    variancePercent: activeBudget > 0 ? ((activeActual - activeBudget) / activeBudget) * 100 : 0,
  };
});
```

Yeni:

```tsx
const departmentBreakdown = (varDepts as any[]).map((d) => {
  const dBudget = ensureArr(d.monthly_budget);
  const dActual = ensureArr(d.monthly_actual);
  const activeBudget = activeMonthIdxs.reduce((s, i) => s + (dBudget[i] ?? 0), 0);
  const activeActual = activeMonthIdxs.reduce((s, i) => s + (dActual[i] ?? 0), 0);
  return {
    name: d.label,
    company: d.company ?? null,  // ← GRUP'ta 'ICA' veya 'ICE', tekli modda null
    budget: activeBudget,
    actual: activeActual,
    variance: activeActual - activeBudget,
    variancePercent: activeBudget > 0 ? ((activeActual - activeBudget) / activeBudget) * 100 : 0,
  };
});
```

### Değişiklik 1C: `params`'a da company alanı ekle (satır ~2348-2358)

Mevcut:

```tsx
const params = (varParams as any[])
  .map((r) => {
    const bv = ensureArr(r.monthly_budget)[safeMonth] ?? 0;
    const av = ensureArr(r.monthly_actual)[safeMonth] ?? 0;
    const dv = av - bv;
    const pName = (r.label ?? r.param_code ?? '') as string;
    return { paramName: pName, unitType: (r.unit_type ?? 'TL') as string, budget: bv, actual: av, diff: dv, diffPct: bv > 0 ? (dv / bv) * 100 : null };
  })
  ...
```

Yeni (`company` alanı eklenecek):

```tsx
const params = (varParams as any[])
  .map((r) => {
    const bv = ensureArr(r.monthly_budget)[safeMonth] ?? 0;
    const av = ensureArr(r.monthly_actual)[safeMonth] ?? 0;
    const dv = av - bv;
    const pName = (r.label ?? r.param_code ?? '') as string;
    return { 
      paramName: pName, 
      unitType: (r.unit_type ?? 'TL') as string, 
      company: r.company ?? null,  // ← yeni
      budget: bv, 
      actual: av, 
      diff: dv, 
      diffPct: bv > 0 ? (dv / bv) * 100 : null 
    };
  })
  ...
```

### Değişiklik 1D: `companyBreakdown` hesapla ve fetch'e ekle (satır ~2429 civarı)

`fetch('/api/analyze-variance', ...)` çağrısından ÖNCE (yaklaşık 2428):

```tsx
// GRUP için şirket bazlı kırılım + dengeleme flag
const companyBreakdown = company === 'GRUP' && (icaTotal || iceTotal) ? (() => {
  const icaActiveBudget = activeMonthIdxs.reduce((s: number, i: number) => s + (icaBudget[i] ?? 0), 0);
  const icaActiveActual = activeMonthIdxs.reduce((s: number, i: number) => s + (icaActual[i] ?? 0), 0);
  const iceActiveBudget = activeMonthIdxs.reduce((s: number, i: number) => s + (iceBudget[i] ?? 0), 0);
  const iceActiveActual = activeMonthIdxs.reduce((s: number, i: number) => s + (iceActual[i] ?? 0), 0);
  
  const icaVar = icaActiveActual - icaActiveBudget;
  const iceVar = iceActiveActual - iceActiveBudget;
  const netVar = icaVar + iceVar;
  const netBudget = icaActiveBudget + iceActiveBudget;
  
  // Dengeleme: biri aşım biri tasarruf
  const balanced = (icaVar * iceVar < 0);
  
  return {
    ICA: {
      budget: icaActiveBudget,
      actual: icaActiveActual,
      variance: icaVar,
      variancePercent: icaActiveBudget > 0 ? (icaVar / icaActiveBudget) * 100 : 0,
    },
    ICE: {
      budget: iceActiveBudget,
      actual: iceActiveActual,
      variance: iceVar,
      variancePercent: iceActiveBudget > 0 ? (iceVar / iceActiveBudget) * 100 : 0,
    },
    net: {
      budget: netBudget,
      actual: icaActiveActual + iceActiveActual,
      variance: netVar,
      variancePercent: netBudget > 0 ? (netVar / netBudget) * 100 : 0,
      balanced,  // dengeleme etkisi var mı?
    },
  };
})() : null;
```

Sonra fetch body'sine ekle:

```tsx
fetch('/api/analyze-variance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'category',
    categoryName: cat.name,
    budgetTotal: activeBudgetTotal,
    actualTotal: activeActualTotal,
    varianceAmount: activeVarianceAmount,
    variancePercent: activeVariancePct,
    monthlyData: monthly,
    parameters: params,
    subItems: subItems.length > 0 ? subItems : undefined,
    monthBreakdown,
    departmentBreakdown,
    analysisScope: 'full',
    activeMonths: activeMonthIdxs,
    companyBreakdown,           // ← YENİ
    isGroupView: company === 'GRUP',  // ← YENİ, backend kontrolü için
  }),
})
```

---

## Dosya 2: `src/app/api/analyze-variance/route.ts` — AI Prompt güncelle

### Değişiklik 2A: Interface'e yeni alanları ekle (satır ~50)

```ts
export interface VarianceAnalysisRequest {
  // ... mevcut alanlar
  analysisScope?: 'category' | 'department' | 'monthly' | 'full';
  
  // YENİ: GRUP için şirket bazlı kırılım
  isGroupView?: boolean;
  companyBreakdown?: {
    ICA: { budget: number; actual: number; variance: number; variancePercent: number };
    ICE: { budget: number; actual: number; variance: number; variancePercent: number };
    net: { budget: number; actual: number; variance: number; variancePercent: number; balanced: boolean };
  } | null;
}

// departmentBreakdown tipine company alanı ekle:
departmentBreakdown?: Array<{
  name: string;
  company?: 'ICA' | 'ICE' | null;  // ← GRUP'ta dolu, tekli modda null
  budget: number;
  actual: number;
  variance: number;
  variancePercent: number;
}>;
```

### Değişiklik 2B: Prompt'a GRUP bloğu ekle (satır ~320)

`deptBreakdownLines` oluşturan bloğu şirket bilgisiyle zenginleştir:

```ts
const deptBreakdownLines = departmentBreakdown && departmentBreakdown.length > 0
  ? '\nDEPARTMAN BREAKDOWN:\n' + departmentBreakdown
      .map((d) => {
        const companyTag = d.company ? `[${d.company}] ` : '';  // ← GRUP'ta ICA/ICE prefix
        return `  ${companyTag}${d.name}: Bütçe ${d.budget.toLocaleString('tr-TR')} ₺, Fiili ${d.actual.toLocaleString('tr-TR')} ₺, Varyans ${d.variance >= 0 ? '+' : ''}${d.variance.toLocaleString('tr-TR')} ₺`;
      })
      .join('\n')
  : '';
```

Aynı şekilde `paramLines` için (satır ~306):

```ts
const paramLines = parameters
  .slice(0, 30)
  .map((p) => {
    const pctStr = p.diffPct !== null ? ` (${p.diffPct >= 0 ? '+' : ''}${p.diffPct.toFixed(1)}%)` : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const companyTag = (p as any).company ? `[${(p as any).company}] ` : '';
    return `  ${companyTag}[${p.unitType || 'adet'}] ${p.paramName}: Bütçe ${p.budget.toLocaleString('tr-TR')}, Fiili ${p.actual.toLocaleString('tr-TR')}, Fark ${p.diff >= 0 ? '+' : ''}${p.diff.toLocaleString('tr-TR')}${pctStr}`;
  })
  .join('\n');
```

### Değişiklik 2C: GRUP'a özel prompt bloğu (satır ~342 civarı)

Body'den yeni alanları da çek:

```ts
const {
  mode, categoryName, departmentName, budgetTotal, actualTotal,
  varianceAmount, variancePercent, monthlyData, parameters,
  subItems, monthBreakdown, departmentBreakdown,
  isGroupView, companyBreakdown,   // ← YENİ
} = body;
```

Sonra yeni bir prompt parçası oluştur:

```ts
const groupAnalysisBlock = (isGroupView && companyBreakdown) ? `

═══════════════════════════════════════════════════════════════
⚠️ BU RAPOR ICA + ICE ŞİRKETLERİNİN KONSOLİDE (GRUP) VERİSİDİR
═══════════════════════════════════════════════════════════════

ŞİRKET BAZLI KIRILIM:
- ICA:  Bütçe ${companyBreakdown.ICA.budget.toLocaleString('tr-TR')} ₺, Fiili ${companyBreakdown.ICA.actual.toLocaleString('tr-TR')} ₺, Varyans ${companyBreakdown.ICA.variance >= 0 ? '+' : ''}${companyBreakdown.ICA.variance.toLocaleString('tr-TR')} ₺ (${companyBreakdown.ICA.variancePercent >= 0 ? '+' : ''}${companyBreakdown.ICA.variancePercent.toFixed(1)}%)
- ICE:  Bütçe ${companyBreakdown.ICE.budget.toLocaleString('tr-TR')} ₺, Fiili ${companyBreakdown.ICE.actual.toLocaleString('tr-TR')} ₺, Varyans ${companyBreakdown.ICE.variance >= 0 ? '+' : ''}${companyBreakdown.ICE.variance.toLocaleString('tr-TR')} ₺ (${companyBreakdown.ICE.variancePercent >= 0 ? '+' : ''}${companyBreakdown.ICE.variancePercent.toFixed(1)}%)
- NET GRUP: Bütçe ${companyBreakdown.net.budget.toLocaleString('tr-TR')} ₺, Fiili ${companyBreakdown.net.actual.toLocaleString('tr-TR')} ₺, Net Varyans ${companyBreakdown.net.variance >= 0 ? '+' : ''}${companyBreakdown.net.variance.toLocaleString('tr-TR')} ₺ (${companyBreakdown.net.variancePercent.toFixed(1)}%)

${companyBreakdown.net.balanced ? `
🔔 DENGELEME ETKİSİ TESPİT EDİLDİ: Bir şirket aşımda, diğeri tasarrufta.
Bu durumda net GRUP varyansı iki şirketin farklı yönlerdeki performansının toplamıdır.
Raporda mutlaka belirt: "X şirketi aşım yapıyor ama Y şirketi tasarruf sağlayarak kısmen dengeliyor" gibi.
` : ''}

ANALİZİN GRUP-ÖZEL BEKLENTİLERİ:
1. Departman ve parametre listesinde her öğenin başında [ICA] veya [ICE] etiketi var. Bunları karıştırma.
2. "Baskın Etken", "İkincil Etken", "Karma Etki Analizi" gibi bölümlerde hangi şirketten kaynaklandığını belirt.
3. "Öneriler" bölümünde:
   - ICA tarafında yapılması gerekenleri ayrı bir başlık altında ver
   - ICE tarafında yapılması gerekenleri ayrı bir başlık altında ver
   - Varsa konsolide (GRUP stratejisi) önerileri ayrı ver
4. "Optimizasyon Senaryoları" tablolarında şirket kolonu olsun veya her öğenin adında [ICA]/[ICE] prefix olsun.
5. Dengeleme varsa: tasarruf sağlayan şirketin mevcut disiplinini koruma önerisi ekle.

` : '';
```

Sonra `userMessage`'a bu bloğu ekle (yaklaşık satır 342 civarı):

```ts
const userMessage = `${depthNote}${groupAnalysisBlock}Analiz konusu: ${subject}

ÖZET (TÜM YIL):
...
```

---

## Test Senaryoları

### Test 1: ICA/ICE tekli — değişmemeli
- ICA seç → Araç Kira → Sapma Raporu Oluştur
- AI raporu eskisi gibi çıkmalı, "GRUP" veya "ICE" kelimesi geçmemeli
- Rakamlar doğru olmalı (eski davranış)

### Test 2: GRUP + Araç Kira — YENİ davranış
- GRUP seç → Araç Kira → Sapma Raporu Oluştur
- Raporun başında "ICA + ICE KONSOLİDE" notu geçmeli
- Toplam bütçe **58.8M** (ICA 49.7M + ICE 9.1M) olmalı — eski 49.7M bug'ı gitmeli
- Dept listesinde her dept'in başında [ICA] veya [ICE] prefix olmalı
- Öneriler bölümünde ICA / ICE / GRUP ayrı başlıklar olmalı

### Test 3: Dengeleme senaryosu (eğer varsa)
- Bir kategoride ICA aşımda + ICE tasarrufta olan bir durum bul
- GRUP'ta o kategorinin Sapma Raporu'nu aç
- Raporda "DENGELEME ETKİSİ" notu bulunmalı

### Test 4: Tek şirkete özel kategori
- Güvenlik ICA'da var, ICE'de yok
- GRUP'ta Güvenlik → Sapma Raporu
- companyBreakdown.ICE.budget = 0, balanced = false (ICE varyansı 0)
- AI anlamlı analiz yapmalı, "ICE tarafında bu kategori yok" diyebilir

---

## Commit Mesajı

```
feat(grup): consolidated ICA+ICE data for Sapma Raporu + AI prompt awareness

Previously GRUP mode showed only ICA's numbers in the Sapma Raporu because
varLineItems.find(row_type='total') grabbed the first total and ignored ICE.
This produced wildly incorrect AI analysis (e.g. Araç Kira showed 49.7M budget
when the true GRUP budget was 58.8M).

Frontend (page.tsx):
- Split totalRows into icaTotal + iceTotal. For GRUP, sum monthly arrays
  element-wise to produce consolidated totalBudgetArr/totalActualArr.
  This fix propagates to all downstream calculations (KPIs, charts, breakdowns).
- Add `company` field to departmentBreakdown and parameters sent to AI.
- Compute new `companyBreakdown` object for GRUP: ICA/ICE/net triple with
  a `balanced` flag signaling offsetting variances.
- Send `isGroupView` and `companyBreakdown` in the fetch payload.

Backend (/api/analyze-variance):
- Extend VarianceAnalysisRequest interface with isGroupView + companyBreakdown.
- Add [ICA]/[ICE] prefix to department and parameter lines when company is set.
- Prepend a GRUP-specific block to the user message that:
  * spells out the ICA/ICE/net split and percentages,
  * signals DENGELEME when variances have opposite signs,
  * instructs the model to keep [ICA]/[ICE] tags, separate recommendations
    per company, and flag offsetting patterns explicitly.

Single-company (ICA/ICE) behavior unchanged — companyBreakdown is null,
isGroupView is false, and the GRUP-specific prompt block is omitted.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

```bash
git add src/app/page.tsx src/app/api/analyze-variance/route.ts
git commit -m "..."
git push
```

---

## 7.3 — sapma_period_fix.md

# Sapma Raporu — Period Seçici + Data Tutarlılığı

## Sorun

Şu an Sapma Raporu'nda iki sorun var:

1. **Tutarsız data:** `parameters` tek ay (safeMonth) verisinden alınıyor ama `budgetTotal`, `monthBreakdown`, `departmentBreakdown`, `companyBreakdown` aktif aylar toplamı (YTD) üzerinden hesaplanıyor. AI karışık data okuyor.

2. **Belirsiz scope:** Kullanıcı ekranda "Varyans Analizi" sekmesinde bir ay seçiyor (örn. Ocak) ama AI raporu "yıl geneli" üretiyor. Kullanıcı ne üzerinden analiz aldığını bilmiyor.

## Hedef

Kullanıcı Sapma Raporu üretirken **period seçsin**:
- **Tek Ay** (varsayılan) — ekranda seçili ayın verisine göre analiz
- **YTD** — yıl başından seçili aya kadar kümülatif (aktif aylar)
- **Tüm Yıl** — 12 ayın tamamı

Tüm data (params, totals, breakdowns) **seçilen period'a göre tutarlı** hesaplansın.

---

## UI Tasarım

Mevcut `Sapma Raporu Oluştur` butonunun **sol tarafına** period segment seçici eklenecek:

```
[ Tek Ay | YTD | Yıl ]   [Sapma Raporu Oluştur]
```

Varsayılan **"Tek Ay"** seçili. Aktif buton indigo arka plan, diğerleri gri.

---

## Değişiklikler

### Dosya 1: `src/app/page.tsx`

#### 1A. Period state'i ekle

`VarDrawer` state'lerinin yanına (yaklaşık satır 146-170 civarı):

```tsx
const [sapmaPeriod, setSapmaPeriod] = useState<'month' | 'ytd' | 'year'>('month');
```

#### 1B. UI — Period Segment

"Sapma Raporu Oluştur" butonunun olduğu satırda (yaklaşık satır 2336-2340), butondan hemen önce segment ekle:

```tsx
{hasActual && (
  <div className="flex items-center justify-end gap-2">
    {/* Period segment */}
    <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
      {[
        { id: 'month' as const, label: 'Tek Ay' },
        { id: 'ytd'   as const, label: 'YTD' },
        { id: 'year'  as const, label: 'Yıl' },
      ].map((opt) => (
        <button
          key={opt.id}
          onClick={(e) => { e.stopPropagation(); setSapmaPeriod(opt.id); }}
          className={`px-3 py-1.5 transition-colors ${
            sapmaPeriod === opt.id
              ? 'bg-indigo-600 text-white font-semibold'
              : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
    
    {/* Sapma Raporu Oluştur butonu — mevcut kod aynen */}
    <button
      onClick={(e) => {
        e.stopPropagation();
        // ... mevcut mantık, aşağıdaki değişikliklerle
      }}
      ...
    >
      Sapma Raporu Oluştur
    </button>
    ...
  </div>
)}
```

#### 1C. Period'a göre periodIdxs hesapla

`onClick` handler'ının başında, `setVarDrawerLoading(true)`'dan hemen sonra:

```tsx
// Period'a göre hangi ay indexleri kullanılacak
const fullMonthIdxs = Array.from({ length: 12 }, (_, i) => i);
const ytdMonthIdxs = MONTH_LABELS
  .map((_, mi) => mi)
  .filter((mi) => (totalActualArr[mi] ?? 0) > 0);

const periodIdxs: number[] = sapmaPeriod === 'month'
  ? [safeMonth]                      // sadece seçili ay
  : sapmaPeriod === 'ytd'
    ? ytdMonthIdxs                   // YTD: fiili veri olan aylar
    : fullMonthIdxs;                 // tüm yıl

const periodLabel = sapmaPeriod === 'month'
  ? `${MONTH_LABELS[safeMonth]}`
  : sapmaPeriod === 'ytd'
    ? `YTD (${MONTH_LABELS[ytdMonthIdxs[0] ?? 0]}-${MONTH_LABELS[ytdMonthIdxs[ytdMonthIdxs.length - 1] ?? 0]})`
    : 'Tüm Yıl';
```

#### 1D. `params`'ı period'a göre hesapla (önceki tek ay mantığını değiştir)

Mevcut:

```tsx
const params = (varParams as any[])
  .map((r) => {
    const bv = ensureArr(r.monthly_budget)[safeMonth] ?? 0;
    const av = ensureArr(r.monthly_actual)[safeMonth] ?? 0;
    ...
  })
```

Yeni (period'a göre topla):

```tsx
const params = (varParams as any[])
  .map((r) => {
    const bArr = ensureArr(r.monthly_budget);
    const aArr = ensureArr(r.monthly_actual);
    const bv = periodIdxs.reduce((s, i) => s + (bArr[i] ?? 0), 0);
    const av = periodIdxs.reduce((s, i) => s + (aArr[i] ?? 0), 0);
    const dv = av - bv;
    const pName = (r.label ?? r.param_code ?? '') as string;
    return { 
      paramName: pName, 
      unitType: (r.unit_type ?? 'TL') as string, 
      company: r.company ?? null, 
      budget: bv, 
      actual: av, 
      diff: dv, 
      diffPct: bv > 0 ? (dv / bv) * 100 : null 
    };
  })
  .filter((p) => p.budget !== 0 || p.actual !== 0)
  ...
```

**Not:** Adet paramları için (kişi, araç sayısı vb.) toplama anlamlı değil — ayın ortalaması veya max'i daha doğru. Ama şimdilik basit tutalım — toplama yapsın, AI yorumlarken `[Adet]` etiketinden görecektir. İlerde iyileştirilebilir.

#### 1E. `monthBreakdown`'da da period'u yansıt

Mevcut:

```tsx
const monthBreakdown = MONTH_LABELS.map((m, mi) => {
  const bv = totalBudgetArr[mi] ?? 0;
  const av = totalActualArr[mi] ?? 0;
  ...
});
```

Yeni (period dışı ayları filtreleme):

```tsx
const monthBreakdown = MONTH_LABELS
  .map((m, mi) => ({ m, mi }))
  .filter(({ mi }) => periodIdxs.includes(mi))
  .map(({ m, mi }) => {
    const bv = totalBudgetArr[mi] ?? 0;
    const av = totalActualArr[mi] ?? 0;
    const vv = av - bv;
    return {
      month: m,
      budget: bv,
      actual: av,
      variance: vv,
      variancePct: bv > 0 ? (vv / bv) * 100 : 0,
    };
  });
```

#### 1F. `departmentBreakdown`, `activeBudgetTotal`, `activeActualTotal`'ı periodIdxs'e göre

Mevcut `activeMonthIdxs` kullanan yerlerin tamamını `periodIdxs` ile değiştir:

```tsx
// Eski:
const activeMonthIdxs = MONTH_LABELS
  .map((_, mi) => mi)
  .filter((mi) => (totalActualArr[mi] ?? 0) > 0);

// Yeni — activeMonthIdxs'i periodIdxs ile değiştir
// ARTIK HESAPLANMIYOR, periodIdxs kullanılıyor

const departmentBreakdown = (varDepts as any[]).map((d) => {
  const dBudget = ensureArr(d.monthly_budget);
  const dActual = ensureArr(d.monthly_actual);
  const pBudget = periodIdxs.reduce((s, i) => s + (dBudget[i] ?? 0), 0);
  const pActual = periodIdxs.reduce((s, i) => s + (dActual[i] ?? 0), 0);
  return {
    name: d.label,
    company: d.company ?? null,
    budget: pBudget,
    actual: pActual,
    variance: pActual - pBudget,
    variancePercent: pBudget > 0 ? ((pActual - pBudget) / pBudget) * 100 : 0,
  };
});

const activeBudgetTotal = periodIdxs.reduce((s, mi) => s + (totalBudgetArr[mi] ?? 0), 0);
const activeActualTotal = periodIdxs.reduce((s, mi) => s + (totalActualArr[mi] ?? 0), 0);
const activeVarianceAmount = activeActualTotal - activeBudgetTotal;
const activeVariancePct = activeBudgetTotal > 0 ? (activeVarianceAmount / activeBudgetTotal) * 100 : 0;
```

#### 1G. `companyBreakdown`'ı periodIdxs ile hesapla

```tsx
const companyBreakdown = company === 'GRUP' && (icaTotal || iceTotal) ? (() => {
  const icaPB = periodIdxs.reduce((s, i) => s + (icaBudget[i] ?? 0), 0);
  const icaPA = periodIdxs.reduce((s, i) => s + (icaActual[i] ?? 0), 0);
  const icePB = periodIdxs.reduce((s, i) => s + (iceBudget[i] ?? 0), 0);
  const icePA = periodIdxs.reduce((s, i) => s + (iceActual[i] ?? 0), 0);
  const icaVar = icaPA - icaPB;
  const iceVar = icePA - icePB;
  const netVar = icaVar + iceVar;
  const netBudget = icaPB + icePB;
  return {
    ICA: { budget: icaPB, actual: icaPA, variance: icaVar, variancePercent: icaPB > 0 ? (icaVar / icaPB) * 100 : 0 },
    ICE: { budget: icePB, actual: icePA, variance: iceVar, variancePercent: icePB > 0 ? (iceVar / icePB) * 100 : 0 },
    net: { 
      budget: netBudget, 
      actual: icaPA + icePA, 
      variance: netVar, 
      variancePercent: netBudget > 0 ? (netVar / netBudget) * 100 : 0, 
      balanced: (icaVar * iceVar < 0) 
    },
  };
})() : null;
```

#### 1H. Fetch body'sine `periodLabel` ekle

```tsx
fetch('/api/analyze-variance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'category',
    categoryName: cat.name,
    budgetTotal: activeBudgetTotal,
    actualTotal: activeActualTotal,
    varianceAmount: activeVarianceAmount,
    variancePercent: activeVariancePct,
    monthlyData: monthly,
    parameters: params,
    subItems: subItems.length > 0 ? subItems : undefined,
    monthBreakdown,
    departmentBreakdown,
    analysisScope: 'full',
    activeMonths: periodIdxs,     // ← artık periodIdxs
    companyBreakdown,
    isGroupView: company === 'GRUP',
    periodLabel,                  // ← YENİ: "Ocak 2025" / "YTD (Oca-Nis)" / "Tüm Yıl"
  }),
})
```

---

### Dosya 2: `src/app/api/analyze-variance/route.ts`

#### 2A. Interface'e `periodLabel` ekle

```ts
export interface VarianceAnalysisRequest {
  // ... mevcut alanlar
  periodLabel?: string;  // "Ocak 2025", "YTD (Oca-Nis)", "Tüm Yıl"
}
```

#### 2B. Body destructure'a ekle

```ts
const {
  mode, categoryName, departmentName, budgetTotal, actualTotal,
  varianceAmount, variancePercent, monthlyData, parameters,
  subItems, monthBreakdown, departmentBreakdown,
  isGroupView, companyBreakdown,
  periodLabel,  // ← YENİ
} = body;
```

#### 2C. Prompt'ta periodLabel'ı kullan

`userMessage`'ın başına period notunu ekle (groupAnalysisBlock'tan önce):

```ts
const periodNote = periodLabel 
  ? `\n📅 ANALİZ DÖNEMİ: ${periodLabel}\nTüm rakamlar bu döneme aittir. Rapor başlığında ve yorumda bu dönemi mutlaka belirt.\n`
  : '';

const userMessage = `${depthNote}${periodNote}${groupAnalysisBlock}Analiz konusu: ${subject}
...
```

---

## Test Senaryoları

### Test 1: Tek Ay (varsayılan)
- Kategori detayına tıkla → "Varyans Analizi" sekmesine geç
- Period segment'te "Tek Ay" seçili olmalı
- Sapma Raporu Oluştur → AI raporunun başında "📅 ANALİZ DÖNEMİ: Ocak" (veya seçili ay) geçmeli
- Rakamlar tek ay bazlı (küçük değerler)

### Test 2: YTD
- Period segment'ten "YTD" seç
- Sapma Raporu Oluştur → "📅 ANALİZ DÖNEMİ: YTD (Oca-Ara)" gibi
- Rakamlar YTD toplamı

### Test 3: Tüm Yıl
- "Yıl" seç → Sapma Raporu
- 12 ay tamamı (fiili verisi olmayan aylar 0 olarak)
- Rapor "Tüm Yıl" dönemi adı altında

### Test 4: GRUP + YTD
- GRUP + Araç Kira + YTD
- Hem period'a göre konsolide rakamlar hem ICA/ICE prefix'leri çalışmalı

---

## Commit

```
feat(sapma): add period selector (month/YTD/year) + consistent data across fields

The Sapma Raporu was sending inconsistent data to the AI: parameters were
tek-ay (safeMonth) values while totals, monthBreakdown, and departmentBreakdown
used the full YTD (active months) sum. The AI had no way to know what "period"
it was analyzing.

This commit adds a period selector segmented control (Tek Ay / YTD / Yıl) next
to the "Sapma Raporu Oluştur" button, defaulting to "Tek Ay". All data sent
to the AI is now computed from the same `periodIdxs` array:
- parameters budget/actual summed across selected months
- monthBreakdown filtered to selected months only
- departmentBreakdown summed across selected months
- companyBreakdown (GRUP) summed across selected months
- activeBudgetTotal / activeActualTotal computed from selected months

Backend accepts a new `periodLabel` string and prepends a "ANALİZ DÖNEMİ"
note to the prompt so the AI anchors its narrative to the right window.

ICA/ICE single-company and GRUP behavior unchanged in structure — only
the selected period controls the numbers.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

```bash
git add src/app/page.tsx src/app/api/analyze-variance/route.ts
git commit -m "..."
git push
```

---

## 7.4 — grup_total_merge_fix.md

# GRUP Total Satır Birleştirme — 5 Yerde Fix

## Sorun

`src/app/page.tsx` içinde **5 yerde** şu anti-pattern var:

```ts
const cTotal = cItems.find((i: any) => i.row_type === 'total');
```

GRUP modunda `cItems` hem ICA'nın hem ICE'ın satırlarını içerir. İki `row_type === 'total'` satırı var. `.find()` ilkini alır → **sadece ICA**. Bu yüzden:

- Kategori listesinde Araç Kira 49.7M görünüyor (olması gereken 58.8M)
- handleFullPdf (tüm kategoriler PDF) GRUP'ta ICA verisi üretiyor
- Varyans analizi fetch'lerinde eksik veri gönderiliyor
- 2025 fiili hesabında ICE yok

## Etkilenen 5 Konum

```
  821: const cTotal = cItems.find((i: any) => i.row_type === 'total');
  906: const cTotal = cItems.find((i: any) => i.row_type === 'total');
 1177: const cTotal = cItems.find((i: any) => i.row_type === 'total');
 1222: const cTotal = cItems.find((i: any) => i.row_type === 'total');
 1311: const liTotalItem = liCategories.includes(cat.id) ? (lineItemsData as any[]).find(...)
 1345: const liTotal = liItems.find((i: any) => i.row_type === 'total');
```

(Toplam 5-6 yer — 1311'deki biraz farklı yapıda, `lineItemsData`'dan direkt filter)

## Fix Stratejisi

Her konumda **inline fix** yap. Merkezi helper yapmaya gerek yok çünkü her noktanın değişken isimleri farklı (cItems, liItems). Temel pattern şu:

**ESKİ:**
```ts
const cTotal = cItems.find((i: any) => i.row_type === 'total');
```

**YENİ:**
```ts
// GRUP'ta ICA ve ICE iki ayrı total satırı üretir — element-wise topla
const totalRows = cItems.filter((i: any) => i.row_type === 'total');
const cTotal = totalRows.length > 1
  ? {
      ...totalRows[0],
      monthly_budget: totalRows.reduce<number[]>((acc, r) => {
        const arr = Array.isArray(r.monthly_budget) 
          ? r.monthly_budget 
          : (typeof r.monthly_budget === 'string' ? JSON.parse(r.monthly_budget || '[]') : []);
        return acc.length === 0 ? [...arr] : acc.map((v, i) => v + (arr[i] ?? 0));
      }, []),
      monthly_actual: totalRows.reduce<number[]>((acc, r) => {
        const arr = Array.isArray(r.monthly_actual) 
          ? r.monthly_actual 
          : (typeof r.monthly_actual === 'string' ? JSON.parse(r.monthly_actual || '[]') : []);
        return acc.length === 0 ? [...arr] : acc.map((v, i) => v + (arr[i] ?? 0));
      }, []),
    }
  : totalRows[0];
```

**Daha temiz:** Dosyanın üstüne bir helper fonksiyon ekle:

```ts
/**
 * Birden fazla total satırını (örn. GRUP'ta ICA + ICE) element-wise toplayarak
 * tek bir total satırı döndürür. Tek satır varsa onu döndürür.
 */
function mergeTotalRows(rows: any[]): any {  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  
  const parseArr = (v: unknown): number[] => {
    if (!v) return [];
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
    return Array.isArray(v) ? v as number[] : [];
  };
  
  const sumArrays = (arrays: number[][]): number[] => {
    const maxLen = Math.max(...arrays.map((a) => a.length), 12);
    return Array.from({ length: maxLen }, (_, i) => 
      arrays.reduce((s, a) => s + (a[i] ?? 0), 0)
    );
  };
  
  return {
    ...rows[0],
    monthly_budget: sumArrays(rows.map((r) => parseArr(r.monthly_budget))),
    monthly_actual: sumArrays(rows.map((r) => parseArr(r.monthly_actual))),
    company: rows.length > 1 ? 'GRUP' : rows[0].company,  // etiket GRUP olsun
  };
}
```

Bu fonksiyon dosyada bir yerde (tercihen component'in dışında, dosya üstünde diğer utility'lerin yanına) tanımlanmalı. Component içinde `const handleFullPdf = useCallback(...)` üst kısmında da olabilir — scope'a erişebildiği yerde.

Sonra her kullanım yerinde:

```ts
// ESKİ:
const cTotal = cItems.find((i: any) => i.row_type === 'total');

// YENİ:
const cTotal = mergeTotalRows(cItems.filter((i: any) => i.row_type === 'total'));
```

### Satır 1311'deki farklı pattern

Bu satırda `cItems` yok, direkt `lineItemsData`'dan filter yapılıyor:

```ts
const liTotalItem = liCategories.includes(cat.id)
  ? (lineItemsData as any[]).find(
      (i: any) => i.category_code === cat.id && i.row_type === 'total'
    )
  : null;
```

Değiştir:

```ts
const liTotalItem = liCategories.includes(cat.id)
  ? mergeTotalRows(
      (lineItemsData as any[]).filter(
        (i: any) => i.category_code === cat.id && i.row_type === 'total'
      )
    )
  : null;
```

## Güvenlik Testi

Eğer `totalRows.length === 0`, `mergeTotalRows` null döner — ICA/ICE/GRUP tekli mod için davranış aynı kalır.

Eğer `totalRows.length === 1` (ICA veya ICE tekli seçim), ilk satır döner — eski davranışla identik.

Eğer `totalRows.length >= 2` (GRUP), element-wise toplam yapılır.

## Test Senaryoları

### Test 1: ICA tekli — DEĞİŞMEMELİ
- ICA seç → Araç Kira kategori listesinde 49.7M (eski davranış)
- PDF butonları çalışmalı

### Test 2: ICE tekli — DEĞİŞMEMELİ
- ICE seç → Araç Kira 9.1M (eski davranış)

### Test 3: GRUP + Araç Kira — YENİ DOĞRU RAKAM
- GRUP seç → Araç Kira satırında **58.8M** (49.7M + 9.1M)
- Kategori detayına tıkla → Üst kartlardaki "2025 Bütçe" **58.8M**
- Sapma Raporu Oluştur → AI'a giden data ICA+ICE konsolide (önceki bug zaten düzelmişti)

### Test 4: GRUP + Güvenlik (sadece ICA'da var) — aynen
- ICE'da Güvenlik olmadığı için totalRows'ta sadece ICA total var
- `length === 1` dönecek → eski davranış
- Rakam: 138.5M gibi (sadece ICA)

### Test 5: Tüm kategoriler için PDF
- GRUP seçili → "Detay Rapor PDF" butonuna bas
- PDF içindeki her kategori rakamları ICA+ICE konsolide olmalı
- Araç Kira sayfasında 58.8M bütçe görünmeli, 49.7M değil

### Test 6: Varyans Analizi (AI Analiz)
- GRUP + bir kategori → "Varyans Analizi" sekmesi
- KPI kartları (bütçe/fiili) konsolide olmalı

## Commit Mesajı

```
fix(grup): sum ICA+ICE total rows instead of picking the first

Multiple places in page.tsx used `.find(row_type === 'total')` to grab the
category total, which in GRUP mode returns only the first (ICA) row and
silently ignores ICE. This caused several visible bugs:
- Category list showed ICA-only totals (e.g. Araç Kira 49.7M instead of 58.8M)
- Detail panel KPI cards ("2025 Bütçe") showed ICA-only figures
- handleFullPdf (all-categories PDF) omitted ICE numbers
- 2025 Fiili calculations under the category summary mismatched GRUP view

Added a `mergeTotalRows` helper that element-wise sums multiple total rows
when more than one exists (GRUP case with ICA + ICE) and returns the single
row unchanged for ICA/ICE single-company views.

Replaced 6 callsites:
- L821 (handleFullPdf)
- L906 (handleFullPdf deep analysis)
- L1177, L1222 (variance analysis drawer)
- L1311 (category list liTotalItem)
- L1345 (2025 Fiili calc)

ICA/ICE single-company behavior unchanged — totalRows.length === 1 short-
circuits to the original row.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

```bash
git add src/app/page.tsx
git commit -m "..."
git push
```

---

# 8. Yeni Chat İçin Başlangıç Prompt'u

Yeni chat'te ilk mesajda şunu kullanabilirsin:

```
Merhaba, BudgetSystem projesini devralıyorsun. Bu handoff dosyası
(BudgetSystem_handoff_2026-04-21.md) tüm bağlamı içeriyor. Okuduktan sonra
'hazırım' de.

Aktif görev: GRUP Detay Rapor PDF testi.

Kontrol etmem gerekenler:
- handleFullPdf (src/app/page.tsx satır 898) fetch body'si companyBreakdown
  ve isGroupView gönderiyor mu?
- Yönetici Özeti PDF (satır 1227) aynısı
- Detay Rapor PDF (satır 2626) aynısı

Test ederim, eksikse aynı Sapma Raporu button handler'ındaki (satır 2394-2550)
mantığı bu 3 callsite'a yaymak için Claude Code prompt'u hazırlarsın.

Sonra backlog:
1. ICA/ICE tekli mod Sapma regression
2. React key uyarıları
3. KPI Aşama 3+
```

