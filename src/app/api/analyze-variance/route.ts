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
    department: string;
    budget: number;
    actual: number;
    variance: number;
    variancePct: number;
  }>;
  analysisScope?: 'category' | 'department' | 'monthly' | 'full';
}

export interface VarianceEffect {
  name: string;
  amount: number;
  explanation: string;
  driver: string;
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
}

const SYSTEM_PROMPT = `Sen deneyimli bir Türk finans analistisin. Bütçe varyans analizleri konusunda uzmansın.

Kullanıcı sana bir maliyet kategorisinin bütçe vs fiili harcama verilerini verecek.
Sen bu varyansı aşağıdaki etkilere ayrıştırarak analiz edeceksin:

1. **Miktar/Hacim Etkisi**: Hizmet alınan personel sayısı, araç adedi, yemek sayısı vb. miktarlardaki değişimden kaynaklanan fark
2. **Fiyat/Birim Maliyet Etkisi**: Birim fiyat, sözleşme bedeli değişimlerinden kaynaklanan fark
3. **Karışım Etkisi**: Departmanlar veya alt kalemler arasındaki dağılım değişiminden kaynaklanan fark
4. **Kombine/Çapraz Etki**: Miktar ve fiyat değişimlerinin birlikte yarattığı ikincil etki

Yanıtını MUTLAKA şu JSON formatında ver (başka hiçbir metin ekleme):
{
  "summary": "2-3 cümlelik Türkçe özet. Ana sapma nedenini ve büyüklüğünü belirt.",
  "totalVariance": <fiili - bütçe, sayısal>,
  "direction": "over | under | on_budget",
  "effects": [
    {
      "name": "Miktar Etkisi | Fiyat Etkisi | Karışım Etkisi | Kombine Etki",
      "amount": <TL cinsinden etki tutarı, pozitif=aşım, negatif=tasarruf>,
      "explanation": "Bu etkinin kaynağını 1 cümlede açıkla",
      "driver": "En önemli sürücüyü kısa belirt (ör: 'Güvenlik personel sayısı +12%')"
    }
  ],
  "monthlyTrend": "Aylık trend hakkında 1-2 cümle. Hangi aylarda sapma yoğunlaşmış?",
  "recommendations": [
    "Kısa, aksiyon odaklı öneri 1",
    "Kısa, aksiyon odaklı öneri 2",
    "Kısa, aksiyon odaklı öneri 3"
  ],
  "interRelations": "Etkiler arasındaki ilişkileri açıkla. Örneğin: fiyat artışının kısmen miktar azaltmasıyla dengelenip dengelenmediği gibi.",
  "departmentInsights": "Departman bazlı bulgu (veri yoksa boş string)",
  "monthlyInsights": "Ay bazlı bulgu (veri yoksa boş string)",
  "karmaEffect": {
    "description": "Fiyat × Miktar × Departman etkilerinin kesişimi",
    "dominantFactor": "En baskın etken",
    "secondaryFactor": "İkincil etken"
  }
}

Eğer departman verisi varsa, departmanlar arası karma etkiyi de analiz et:
- Hangi departman bütçeyi en çok aştı?
- Departmanlar arası dağılım değişimi (karışım etkisi) nedir?

Eğer aylık breakdown varsa, zamansal karma etkiyi analiz et:
- Sapma hangi aylarda yoğunlaştı?
- Mevsimsellik veya tek seferlik etki mi?

Önemli kurallar:
- Tüm metin Türkçe olacak
- Analizde YALNIZCA fiili verisi olan ayları (activeMonths) dikkate al. [FİİLİ YOK] etiketli aylar bütçe karşılaştırmasına dahil edilmez; yalnızca tamamlanan dönem üzerinden yorum yap.
- effects dizisinde tum anlamli etkileri dahil et (en az 2, en fazla 6 etki). Her etki icin driver alani mumkun oldugunca somut ve olcumlenebilir olsun (yuzde, adet, TL).
- Sayısal değerler kesinlikle TL cinsinden olacak (yüzde değil)
- monthlyTrend: Her aktif ay icin ayri ayri yorum yap. Ocak, Subat, Mart gibi ay isimlerini kullanarak sapma miktarini ve yuzdesini belirt. Trend yukseliyor mu, dusuyor mu, sabit mi?
- recommendations: En az 4, en fazla 6 oneri ver. Her oneri somut ve olcumlenebilir olmali.
- departmentInsights ve monthlyInsights: veri yoksa boş string ("") döndür
- karmaEffect: her zaman doldur; veri yetersizse genel değerlendirme yap
- Veri yetersizse "Yeterli parametre verisi bulunamadı, genel degerlendirme yapiliyor" gibi bir not ekle
- Tüm metinlerde Türkçe özel karakterler KULLANMA. Bunların yerine şunları kullan:
  ş→s, ğ→g, ü→u, ö→o, ç→c, ı→i, İ→I, Ş→S, Ğ→G, Ü→U, Ö→O, Ç→C
  Örnek: "güvenlik" yerine "guvenlik", "şirket" yerine "sirket" yaz.
  Bu kural tüm string alanlara uygulanır: summary, explanation, driver, monthlyTrend, recommendations, interRelations, departmentInsights, monthlyInsights, karmaEffect alanları.`;

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
    monthBreakdown, departmentBreakdown,
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
        .map((d) => `  ${d.department}: Bütçe ${d.budget.toLocaleString('tr-TR')} ₺, Fiili ${d.actual.toLocaleString('tr-TR')} ₺, Varyans ${d.variance >= 0 ? '+' : ''}${d.variance.toLocaleString('tr-TR')} ₺`)
        .join('\n')
    : '';

  const isDeep = body.deepAnalysis === true;
  const depthNote = isDeep
    ? '\nDERIN ANALIZ MODU: Bu tek bir kategorinin detay raporudur. Mumkun olan en kapsamli analizi yap. Her parametreyi tek tek incele, sapmalarin tam nedenini bul, somut rakamlarla destekle.\n'
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
        max_tokens: 6000,
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
      console.error('[analyze-variance] JSON parse failed. rawText:', rawText);
      return NextResponse.json({
        error: 'Claude yanıtı JSON olarak ayrıştırılamadı',
        preview: rawText?.substring(0, 500),
      }, { status: 500 });
    }
    return NextResponse.json(analysisResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
