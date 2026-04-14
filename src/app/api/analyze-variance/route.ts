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
  "interRelations": "Etkiler arasındaki ilişkileri açıkla. Örneğin: fiyat artışının kısmen miktar azaltmasıyla dengelenip dengelenmediği gibi."
}

Önemli kurallar:
- Tüm metin Türkçe olacak
- effects dizisinde yalnızca 0'dan büyük tutarda etkileri dahil et (en az 1, en fazla 4 etki)
- Sayısal değerler kesinlikle TL cinsinden olacak (yüzde değil)
- Veri yetersizse "Yeterli parametre verisi bulunamadı, genel değerlendirme yapılıyor" gibi bir not ekle`;

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
  } = body;

  const subject = mode === 'department' && departmentName
    ? `${categoryName} kategorisi — ${departmentName} departmanı`
    : `${categoryName} kategorisi`;

  const direction = varianceAmount > 0 ? 'AŞIM (fiili > bütçe)' : varianceAmount < 0 ? 'TASARRUF (fiili < bütçe)' : 'BÜTÇEDE';

  const monthlyLines = monthlyData
    .map((m) => `  ${m.month}: Bütçe ${m.budget.toLocaleString('tr-TR')} ₺, Fiili ${m.actual.toLocaleString('tr-TR')} ₺, Fark ${(m.actual - m.budget).toLocaleString('tr-TR')} ₺`)
    .join('\n');

  const paramLines = parameters
    .slice(0, 30) // limit to 30 rows to keep prompt size reasonable
    .map((p) => {
      const pctStr = p.diffPct !== null ? ` (${p.diffPct >= 0 ? '+' : ''}${p.diffPct.toFixed(1)}%)` : '';
      return `  [${p.unitType || 'adet'}] ${p.paramName}: Bütçe ${p.budget.toLocaleString('tr-TR')}, Fiili ${p.actual.toLocaleString('tr-TR')}, Fark ${p.diff >= 0 ? '+' : ''}${p.diff.toLocaleString('tr-TR')}${pctStr}`;
    })
    .join('\n');

  const userMessage = `Analiz konusu: ${subject}

ÖZET:
- Bütçe: ${budgetTotal.toLocaleString('tr-TR')} ₺
- Fiili: ${actualTotal.toLocaleString('tr-TR')} ₺
- Varyans: ${varianceAmount >= 0 ? '+' : ''}${varianceAmount.toLocaleString('tr-TR')} ₺ (${variancePercent >= 0 ? '+' : ''}${variancePercent.toFixed(1)}%) — ${direction}

AYLIK VERİ:
${monthlyLines}

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
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Claude API error: ${response.status} — ${errText}` }, { status: 502 });
    }

    const claudeData = await response.json();
    const rawText: string = claudeData?.content?.[0]?.text ?? '';

    // Extract JSON from the response (Claude may occasionally add markdown fences)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Claude response did not contain valid JSON', raw: rawText }, { status: 502 });
    }

    const analysisResult: VarianceAnalysisResponse = JSON.parse(jsonMatch[0]);
    return NextResponse.json(analysisResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
