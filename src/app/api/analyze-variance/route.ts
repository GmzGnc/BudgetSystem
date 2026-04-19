import { NextRequest, NextResponse } from 'next/server';

export interface VarianceAnalysisRequest {
  mode: 'category' | 'department';
  categoryName: string;
  departmentName?: string;
  budgetTotal: number;
  actualTotal: number;
  varianceAmount: number;
  variancePercent: number;
  monthlyData: Array<{
    month: string;
    budget: number;
    actual: number;
  }>;
  parameters: Array<{
    paramName: string;
    unitType: string;
    budget: number;
    actual: number;
    diff: number;
    diffPct: number | null;
  }>;
  subItems?: Array<{
    name: string;
    adet: number;
    birimFiyat: number;
    toplam: number;
    budgetAdet?: number;
    budgetBirimFiyat?: number;
    budgetToplam?: number;
  }>;
  categoryFormula?: string;
  activeMonths?: number[];  // fiili verisi olan ay indeksleri (0-based)
  deepAnalysis?: boolean;   // tek kategori derin analiz modu
  monthBreakdown?: Array<{
    month: string;
    budget: number;
    actual: number;
    variance: number;
    variancePct: number;
  }>;
  departmentBreakdown?: Array<{
    name: string;
    budget: number;
    actual: number;
    variance: number;
    variancePercent: number;
  }>;
  analysisScope?: 'category' | 'department' | 'monthly' | 'full';
}

export interface VarianceEffect {
  name: string;
  amount: number;
  explanation: string;
  driver: string;
}

export interface OptScenarioItem {
  name: string;
  currentAdet?: number;
  targetAdet?: number;
  currentFiyat?: number;
  targetFiyat?: number;
  saving: number;
}

export interface OptScenario {
  title: string;
  actions: string[];
  newTotal: number;
  feasibility: string;
  savings: string;
  items?: OptScenarioItem[];
}

export interface VarianceAnalysisResponse {
  summary: string;
  totalVariance: number;
  direction: 'over' | 'under' | 'on_budget';
  effects: VarianceEffect[];
  monthlyTrend: string;
  recommendations: string[];
  interRelations: string;
  departmentInsights: string;
  monthlyInsights: string;
  karmaEffect: {
    description: string;
    dominantFactor: string;
    secondaryFactor: string;
  };
  optimization?: {
    scenarioA: OptScenario;
    scenarioB: OptScenario;
    scenarioC: OptScenario;
    optimalPath: string;
    riskNote: string;
    yearEndForecast: string;
  };
}

const SYSTEM_PROMPT = `Sen deneyimli bir Turk finans analistisin. Butce varyans analizleri ve maliyet optimizasyonu konusunda uzmansın.

Kullanici sana bir maliyet kategorisinin butce vs fiili harcama verilerini verecek.

=== BOLUM 1: VARYANS AYRISTIRMASI ===

Su etkilere gore varyansı ayrıstır:
1. Miktar/Hacim Etkisi: Hizmet alınan personel sayısı, arac adedi, yemek sayısı vb. miktarlardaki degisimden kaynaklanan fark
   - Formul: (Fiili Adet - Butce Adet) x Butce Birim Fiyat
2. Fiyat/Birim Maliyet Etkisi: Birim fiyat, sozlesme bedeli degisimlerinden kaynaklanan fark
   - Formul: (Fiili Fiyat - Butce Fiyat) x Butce Adet
3. Karisim Etkisi: Departmanlar veya alt kalemler arasındaki dagilim degisiminden kaynaklanan fark
4. Kombine/Capraz Etki: Miktar ve fiyat degisimlerinin birlikte yarattigi ikincil etki
   - Formul: (Fiili Adet - Butce Adet) x (Fiili Fiyat - Butce Fiyat)

=== BOLUM 2: SENARYO OPTIMIZASYONU (A/B/C) ===

Eger hem miktar (adet/kisi) hem fiyat (birim ucret/fiyat) parametreleri mevcutsa, UC senaryo olustur:

SENARYO A — Miktar Odakli:
- Sadece adet/kisi sayılarını azaltarak butceye donmeyi hedefle
- Her alt kalem icin: hangi kalemin kac adet azaltilacagini belirt
- items dizisinde her kalem icin currentAdet, targetAdet, saving goster

SENARYO B — Fiyat Odakli:
- Sadece birim fiyatları renegosiye ederek butceye donmeyi hedefle
- Her alt kalem icin: hangi fiyatin ne kadar indirileceğini belirt
- items dizisinde her kalem icin currentFiyat, targetFiyat, saving goster

SENARYO C — Kombine (A+B dengeli):
- Hem adet hem fiyat uzerinde orta duzey degisikliklerle en gercekci senaryo
- items dizisinde hem adet hem fiyat hedeflerini goster

=== BOLUM 3: RISK VE FIZIBILITE ===

Her senaryo icin:
- feasibility: "Yuksek" (hemen uygulanabilir), "Orta" (1-3 ay), "Dusuk" (stratejik/uzun vadeli)
- Yil sonu prognozu: aktif aylar baz alinarak yil sonunda toplam ne olur?

=== JSON FORMAT ===

Yanitini MUTLAKA su JSON formatinda ver (baska hicbir metin ekleme):
{
  "summary": "2-3 cumlelik Turkce ozet. Ana sapma nedenini ve buyuklugunu belirt.",
  "totalVariance": <fiili - butce, sayisal>,
  "direction": "over | under | on_budget",
  "effects": [
    {
      "name": "Miktar Etkisi | Fiyat Etkisi | Karisim Etkisi | Kombine Etki",
      "amount": <TL cinsinden etki tutari, pozitif=asim, negatif=tasarruf>,
      "explanation": "Bu etkinin kaynagini 1 cumlede acikla",
      "driver": "En onemli surucuyu kisa belirt (or: 'Guvenlik personel sayisi +12%')"
    }
  ],
  "monthlyTrend": "Her aktif ay icin ayri ayri yorum. Ocak, Subat gibi ay isimleri kullan, sapma miktarini ve yuzdesini belirt.",
  "recommendations": [
    "Somut ve olcumlenebilir oneri 1",
    "Somut ve olcumlenebilir oneri 2",
    "Somut ve olcumlenebilir oneri 3",
    "Somut ve olcumlenebilir oneri 4"
  ],
  "interRelations": "Etkiler arasindaki iliskileri acikla.",
  "departmentInsights": "Departman bazli bulgu (veri yoksa bos string)",
  "monthlyInsights": "Ay bazli bulgu (veri yoksa bos string)",
  "karmaEffect": {
    "description": "Fiyat x Miktar x Departman etkilerinin kesisimi",
    "dominantFactor": "En baskin etken",
    "secondaryFactor": "Ikincil etken"
  },
KRİTİK: optimization.scenarioA, scenarioB ve scenarioC alanlari MUTLAKA doldurulmalidir.
Bu alanlar bos veya eksik birakilamaz. Her senaryo icin:
- title: string (zorunlu)
- actions: string[] en az 2 madde (zorunlu)
- items: array en az 2 kalem (zorunlu)
- newTotal: number (zorunlu, actualTotal - sum(items saving))
- savings: string 'X.XXX TL tasarruf' formatinda (zorunlu)
- feasibility: 'Yuksek' | 'Orta' | 'Dusuk' (zorunlu)

Eger miktar bilgisi yoksa Senaryo A icin tahmini adet degerleri kullan.
Eger birim fiyat bilgisi yoksa Senaryo B icin toplam / tahmini adet ile hesapla.
Veri yetersiz olsa bile her 3 senaryoyu mutlaka uret.

  "optimization": {
    "scenarioA": {
      "title": "Fiyat Sabit — Miktar Optimizasyonu",
      "actions": [
        "Vardiya Amiri: 3 → 2 kisi (-1 pozisyon)",
        "CCTV Operatoru: 8 → 6 personel (-2 pozisyon)"
      ],
      "items": [
        { "name": "Vardiya Amiri", "currentAdet": 3, "targetAdet": 2, "saving": 450000 },
        { "name": "CCTV Operatoru", "currentAdet": 8, "targetAdet": 6, "saving": 320000 }
      ],
      "newTotal": 31500000,
      "savings": "770.000 TL tasarruf",
      "feasibility": "Orta"
    },
    "scenarioB": {
      "title": "Miktar Sabit — Fiyat/Sozlesme Optimizasyonu",
      "actions": [
        "Proje Muduru birim ucret: 48.200 → 45.400 TL (%5.8 indirim)",
        "Vardiya Amiri: 46.500 → 43.500 TL (%6.5 indirim)"
      ],
      "items": [
        { "name": "Proje Muduru", "currentFiyat": 48200, "targetFiyat": 45400, "saving": 100800 },
        { "name": "Vardiya Amiri", "currentFiyat": 46500, "targetFiyat": 43500, "saving": 270000 }
      ],
      "newTotal": 32000000,
      "savings": "6.044.956 TL tasarruf",
      "feasibility": "Orta"
    },
    "scenarioC": {
      "title": "Kombine Optimizasyon",
      "actions": [
        "Ucret artisini %3 ile sinirla (sozlesme yenilemede uygulanacak)",
        "CCTV pozisyonlarinda 2 kisi azalt"
      ],
      "items": [
        { "name": "Birim Ucret Tavani", "saving": 4500000 },
        { "name": "CCTV Azaltma", "saving": 320000 }
      ],
      "newTotal": 31000000,
      "savings": "4.820.000 TL tasarruf",
      "feasibility": "Yuksek"
    },
    "optimalPath": "Butceye donmek icin en az direncli yol: hangi senaryo neden tercih edilmeli",
    "riskNote": "Hangi senaryonun riski daha dusuk ve neden; hangi senaryo uygulanamaz olabilir",
    "yearEndForecast": "Mevcut trend devam ederse yil sonu tahmini toplam: X TL (butce Y TL, asim Z TL / %P)"
  }
}

Matematiksel kurallar (ZORUNLU):
- newTotal = actualTotal - toplam saving (items[].saving toplami)
- savings string formati: "X.XXX TL tasarruf" (nokta ile binlik ayrac, harf karakterleri ASCII)
- items[].saving degerleri somut ve gercekci olmali; rastgele doldurma

Onemli kurallar:
- Tum metin Turkce olacak (ama Turkce ozel karakter KULLANMA)
- Analizde YALNIZCA fiili verisi olan aylari (activeMonths) dikkate al. [FIILI YOK] etiketli aylar analiz kapsamina dahil edilmez.
- effects: en az 2, en fazla 6 etki. driver alani somut ve olcumlenebilir (yuzde, adet, TL).
- Sayisal degerler TL cinsinden olacak (yuzde degil).
- recommendations: en az 4, en fazla 6 oneri.
- optimization: subItems verisi varsa her alt kalem icin ayri items satiri olustur. Yoksa mevcut parametrelerden makul tahminle doldur.
- Yeterli parametre (hem adet hem fiyat) yoksa optimization alani JSON'a dahil edilmez.
- Turkce ozel karakter yasagi: hic istisna yok (s,g,u,o,c,i kullan).`;


export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  let body: VarianceAnalysisRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    mode, categoryName, departmentName, budgetTotal, actualTotal,
    varianceAmount, variancePercent, monthlyData, parameters,
    subItems, monthBreakdown, departmentBreakdown,
  } = body;

  const subject = mode === 'department' && departmentName
    ? `${categoryName} kategorisi — ${departmentName} departmanı`
    : `${categoryName} kategorisi`;

  const direction = varianceAmount > 0 ? 'AŞIM (fiili > bütçe)' : varianceAmount < 0 ? 'TASARRUF (fiili < bütçe)' : 'BÜTÇEDE';

  const activeMonthIndices = monthlyData
    .map((m, i) => ({ ...m, i }))
    .filter((m) => m.actual > 0)
    .map((m) => m.i);

  const effectiveActiveMonths = (body.activeMonths && body.activeMonths.length > 0)
    ? body.activeMonths
    : activeMonthIndices;

  const activeBudget  = monthlyData.filter((_, i) => effectiveActiveMonths.includes(i)).reduce((s, m) => s + m.budget, 0);
  const activeActual  = monthlyData.filter((_, i) => effectiveActiveMonths.includes(i)).reduce((s, m) => s + m.actual, 0);
  const activeVariance = activeActual - activeBudget;
  const activeVariancePct = activeBudget !== 0 ? (activeVariance / activeBudget) * 100 : 0;
  const activeDirection = activeVariance > 0 ? 'AŞIM (fiili > bütçe)' : activeVariance < 0 ? 'TASARRUF (fiili < bütçe)' : 'BÜTÇEDE';

  const activeMonthsNote = effectiveActiveMonths.length > 0
    ? `Aktif aylar (fiili verisi olan): ${effectiveActiveMonths.map((i) => monthlyData[i]?.month ?? i + 1).join(', ')}`
    : 'Henüz fiili veri girilmemiş';

  const monthlyLines = monthlyData
    .map((m, i) => {
      const hasActual = effectiveActiveMonths.includes(i);
      if (!hasActual) {
        return `  ${m.month}: Bütçe ${m.budget.toLocaleString('tr-TR')} ₺, Fiili — [FİİLİ YOK]`;
      }
      return `  ${m.month}: Bütçe ${m.budget.toLocaleString('tr-TR')} ₺, Fiili ${m.actual.toLocaleString('tr-TR')} ₺, Fark ${(m.actual - m.budget).toLocaleString('tr-TR')} ₺`;
    })
    .join('\n');

  const paramLines = parameters
    .slice(0, 30) // limit to 30 rows to keep prompt size reasonable
    .map((p) => {
      const pctStr = p.diffPct !== null ? ` (${p.diffPct >= 0 ? '+' : ''}${p.diffPct.toFixed(1)}%)` : '';
      return `  [${p.unitType || 'adet'}] ${p.paramName}: Bütçe ${p.budget.toLocaleString('tr-TR')}, Fiili ${p.actual.toLocaleString('tr-TR')}, Fark ${p.diff >= 0 ? '+' : ''}${p.diff.toLocaleString('tr-TR')}${pctStr}`;
    })
    .join('\n');

  const monthBreakdownLines = monthBreakdown && monthBreakdown.length > 0
    ? '\nAYLIK BREAKDOWN (bütçe vs fiili + varyans):\n' + monthBreakdown
        .map((m) => `  ${m.month}: Bütçe ${m.budget.toLocaleString('tr-TR')} ₺, Fiili ${m.actual.toLocaleString('tr-TR')} ₺, Varyans ${m.variance >= 0 ? '+' : ''}${m.variance.toLocaleString('tr-TR')} ₺ (${m.variancePct >= 0 ? '+' : ''}${m.variancePct.toFixed(1)}%)`)
        .join('\n')
    : '';

  const deptBreakdownLines = departmentBreakdown && departmentBreakdown.length > 0
    ? '\nDEPARTMAN BREAKDOWN:\n' + departmentBreakdown
        .map((d) => `  ${d.name}: Bütçe ${d.budget.toLocaleString('tr-TR')} ₺, Fiili ${d.actual.toLocaleString('tr-TR')} ₺, Varyans ${d.variance >= 0 ? '+' : ''}${d.variance.toLocaleString('tr-TR')} ₺`)
        .join('\n')
    : '';

  const isDeep = body.deepAnalysis === true;
  const depthNote = isDeep
    ? '\nDERIN ANALIZ MODU: Bu tek bir kategorinin detay raporudur. Mumkun olan en kapsamli analizi yap. Her parametreyi tek tek incele, sapmalarin tam nedenini bul, somut rakamlarla destekle.\n'
    : '';

  const subItemLines = subItems && subItems.length > 0
    ? '\nALT KALEM DETAYI (adet x birim fiyat):\n' + subItems
        .map((si) => {
          const budgetPart = (si.budgetAdet !== undefined && si.budgetBirimFiyat !== undefined)
            ? ` | Butce: ${si.budgetAdet} adet x ${si.budgetBirimFiyat.toLocaleString('tr-TR')} TL = ${(si.budgetToplam ?? si.budgetAdet * si.budgetBirimFiyat).toLocaleString('tr-TR')} TL`
            : '';
          return `  ${si.name}: ${si.adet} adet x ${si.birimFiyat.toLocaleString('tr-TR')} TL = ${si.toplam.toLocaleString('tr-TR')} TL${budgetPart}`;
        })
        .join('\n')
    : '';

  const userMessage = `${depthNote}Analiz konusu: ${subject}

ÖZET (TÜM YIL):
- Yıllık Bütçe: ${budgetTotal.toLocaleString('tr-TR')} ₺
- Yıllık Fiili: ${actualTotal.toLocaleString('tr-TR')} ₺
- Yıllık Varyans: ${varianceAmount >= 0 ? '+' : ''}${varianceAmount.toLocaleString('tr-TR')} ₺ (${variancePercent >= 0 ? '+' : ''}${variancePercent.toFixed(1)}%) — ${direction}

ÖZET (YALNIZCA AKTİF AYLAR — ANALİZ BAZISI):
- ${activeMonthsNote}
- Aktif Dönem Bütçe: ${activeBudget.toLocaleString('tr-TR')} ₺
- Aktif Dönem Fiili: ${activeActual.toLocaleString('tr-TR')} ₺
- Aktif Dönem Varyans: ${activeVariance >= 0 ? '+' : ''}${activeVariance.toLocaleString('tr-TR')} ₺ (${activeVariancePct >= 0 ? '+' : ''}${activeVariancePct.toFixed(1)}%) — ${activeDirection}

AYLIK VERİ:
${monthlyLines}
${monthBreakdownLines}
${deptBreakdownLines}
PARAMETRE DETAYI:
${paramLines}
${subItemLines}
Lütfen bu varyansı analiz et ve JSON formatında yanıt ver.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Claude API error: ${response.status} — ${errText}` }, { status: 502 });
    }

    const claudeData = await response.json();
    let rawText: string = claudeData?.content?.[0]?.text ?? '';

    // Markdown kod bloğunu temizle (```json ... ``` veya ``` ... ```)
    rawText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let analysisResult: VarianceAnalysisResponse;
    try {
      analysisResult = JSON.parse(rawText);
    } catch {
      return NextResponse.json({
        error: 'JSON parse failed',
        rawResponse: rawText.substring(0, 3000),
      }, { status: 500 });
    }
    return NextResponse.json(analysisResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
