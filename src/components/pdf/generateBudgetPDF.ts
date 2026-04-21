import jsPDF from 'jspdf';

async function fetchAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) return '';
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

async function loadLogo(): Promise<string> {
  const paths = ['/ica-logo.png', './ica-logo.png', `${window.location.origin}/ica-logo.png`];
  for (const path of paths) {
    const result = await fetchAsBase64(path);
    if (result) return result;
  }
  return '';
}

// ── Unicode font support ──────────────────────────────────────────────────
// Set to true when Roboto is successfully loaded; sanitization preserves
// Turkish characters instead of converting them to ASCII.
let USE_UNICODE_FONT = false;

async function loadRobotoFont(doc: jsPDF): Promise<boolean> {
  try {
    const [regularResp, boldResp] = await Promise.all([
      fetch('/fonts/Roboto-Regular.ttf'),
      fetch('/fonts/Roboto-Bold.ttf'),
    ]);
    if (!regularResp.ok || !boldResp.ok) return false;

    const [regularBuf, boldBuf] = await Promise.all([
      regularResp.arrayBuffer(),
      boldResp.arrayBuffer(),
    ]);

    const toBase64 = (buf: ArrayBuffer): string => {
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      return btoa(binary);
    };

    doc.addFileToVFS('Roboto-Regular.ttf', toBase64(regularBuf));
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Bold.ttf', toBase64(boldBuf));
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    return true;
  } catch (err) {
    console.warn('[PDF] Roboto font yüklenemedi, ASCII fallback kullanılacak:', err);
    return false;
  }
}

function setDocFont(doc: jsPDF, weight: 'normal' | 'bold' = 'normal') {
  if (USE_UNICODE_FONT) {
    doc.setFont('Roboto', weight);
  } else {
    doc.setFont('helvetica', weight);
  }
}

function tr(text: string): string {
  if (!text) return '';
  const base = text
    // ── sembol dönüşümleri ────────────────────────────────────────────────
    .replace(/\u2192/g, '->').replace(/→/g, '->')   // sağ ok
    .replace(/\u2190/g, '<-').replace(/←/g, '<-')   // sol ok
    .replace(/\u2022/g, '-').replace(/•/g, '-')      // bullet
    .replace(/\u2013/g, '-')                          // en-dash
    .replace(/\u2014/g, '-')                          // em-dash
    .replace(/\u2026/g, '...')                        // ellipsis
    .replace(/\u2018/g, "'").replace(/\u2019/g, "'") // smart single quotes
    .replace(/\u201C/g, '"').replace(/\u201D/g, '"') // smart double quotes
    .replace(/\u00A0/g, ' ')                          // non-breaking space
    .replace(/\u202F/g, ' ');                         // narrow no-break space

  if (USE_UNICODE_FONT) {
    // Roboto yüklendi — Türkçe karakterleri koru, sadece C1 control chars sil
    return base.replace(/[\u0080-\u009F]/g, '');
  }

  // Fallback: ASCII'ye dönüştür
  return base
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Â/g, 'A').replace(/â/g, 'a')
    .replace(/[\u0080-\u009F]/g, '')
    .replace(/[^\x00-\x7F]/g, '?');
}

export interface CategoryPDFData {
  name: string;
  nameEn: string;
  budgetTotal: number;
  actualTotal: number;
  variance: number;
  variancePercent: number;
  monthlyData: { month: number; budget: number; actual: number }[];
  parameters?: Array<{
    paramName: string;
    unitType: string;
    budgetTotal: number;
    actualTotal: number;
    diff: number;
    diffPct: number | null;
    isKey?: boolean;
  }>;
  // Aktif dönem meta alanları (opsiyonel — backward compatible)
  ytdBudget?: number;
  ytdActual?: number;
  ytdVariance?: number;
  ytdVariancePct?: number;
  annualBudget?: number;
  isFullYear?: boolean;
  activePeriodLabel?: string;
  activeMonthsCount?: number;
  periodLabel?: string;
  reportDate?: string;
  aiAnalysis?: {
    summary: string;
    effects: { type: string; label: string; amount: number; contributionPercent: number; description: string }[];
    monthlyTrend: string;
    recommendations: string[];
    interRelations: string;
    departmentInsights?: string;
    monthlyInsights?: string;
    karmaEffect?: {
      description: string;
      dominantFactor: string;
      secondaryFactor: string;
    } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    optimization?: any;
    monthlyAnalysis?: Array<{
      monthLabel: string;
      budget: number;
      actual: number;
      variance: number;
      variancePct: number;
      isDataMissing: boolean;
      analysis: string;
      trendNote: string;
    }> | null;
    yearEndProjection?: {
      projectedAnnualActual: number;
      projectedVariancePct: number;
      criticalThresholdMonth: string | null;
      description: string;
    } | null;
  };
}

export interface DepartmentPDFData {
  name: string;
  budgetTotal: number;
  actualTotal: number;
  variance: number;
  variancePercent: number;
}

export interface PDFReportData {
  companyName: string;
  companyCode: string;
  period: string;
  generatedAt: string;
  categories: CategoryPDFData[];
  departments?: DepartmentPDFData[];
}

const NAVY       = [30, 42, 74]    as [number, number, number];
const BLUE       = [59, 130, 246]  as [number, number, number];
const RED        = [239, 68, 68]   as [number, number, number];
const GREEN      = [34, 197, 94]   as [number, number, number];
const GRAY_LIGHT = [248, 249, 250] as [number, number, number];
const GRAY_MID   = [229, 231, 235] as [number, number, number];
const GRAY_DARK  = [75, 85, 99]    as [number, number, number];
const WHITE      = [255, 255, 255] as [number, number, number];
const BLACK      = [17, 24, 39]    as [number, number, number];

const MONTHS_TR = ['Oca','Sub','Mar','Nis','May','Haz','Tem','Agu','Eyl','Eki','Kas','Ara'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatTL(val: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val) + ' TL';
}

function formatPct(val: number): string {
  return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
}

function addPageHeader(doc: jsPDF, companyName: string, pageNum: number, totalPages: number, logoBase64: string) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 297, 18, 'F');

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', 4, 1, 22, 16);
  }

  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  setDocFont(doc, 'bold');
  doc.text(tr(companyName), 30, 10);
  setDocFont(doc, 'normal');
  doc.setFontSize(7);
  doc.text(tr('Idari Isler Butce Raporu / Administrative Affairs Budget Report'), 30, 15);
  if (pageNum > 0 && totalPages > 0) {
    doc.text(`${pageNum} / ${totalPages}`, 285, 10, { align: 'right' });
  }
}

function addPageFooter(doc: jsPDF, generatedAt: string) {
  doc.setFillColor(...GRAY_MID);
  doc.rect(0, 196, 297, 5, 'F');
  doc.setTextColor(...GRAY_DARK);
  doc.setFontSize(6);
  setDocFont(doc, 'normal');
  doc.text(tr(`Gizli - Yalnizca Ic Kullanim / Confidential - Internal Use Only | ${generatedAt}`), 8, 199);
  doc.text(tr('Claude AI ile analiz edildi / Analyzed with Claude AI'), 289, 199, { align: 'right' });
}

function addCoverPage(doc: jsPDF, data: PDFReportData, logoBase64: string) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 297, 210, 'F');

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', 98, 20, 100, 70);
  }

  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.8);
  doc.line(40, 95, 257, 95);

  doc.setTextColor(...WHITE);
  doc.setFontSize(22);
  setDocFont(doc, 'bold');
  doc.text(tr('IDARI ISLER BUTCE RAPORU'), 148, 112, { align: 'center' });
  doc.setFontSize(14);
  setDocFont(doc, 'normal');
  doc.text(tr('Administrative Affairs Budget Report'), 148, 122, { align: 'center' });

  doc.setFontSize(11);
  setDocFont(doc, 'bold');
  doc.text(tr(data.period), 148, 140, { align: 'center' });

  doc.setFontSize(9);
  setDocFont(doc, 'normal');
  doc.setTextColor(180, 200, 230);
  doc.text(tr(`Olusturulma Tarihi / Generated: ${data.generatedAt}`), 148, 152, { align: 'center' });
  doc.text(tr(`Sirket / Company: ${data.companyName} (${data.companyCode})`), 148, 160, { align: 'center' });

  doc.setFillColor(...BLUE);
  doc.rect(0, 198, 297, 12, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.text(tr('Yavuz Sultan Selim Koprusu ve Kuzey Cevre Otoyolu Isletmesi'), 148, 205, { align: 'center' });
}

function addExecutiveSummaryPage(doc: jsPDF, data: PDFReportData, pageNum: number, totalPages: number, logoBase64: string) {
  addPageHeader(doc, data.companyName, pageNum, totalPages, logoBase64);
  addPageFooter(doc, data.generatedAt);

  // Aktif dönem bazlı toplamlar (ytdBudget/ytdActual varsa kullan)
  const totalBudget   = data.categories.reduce((s, c) => s + (c.ytdBudget ?? c.budgetTotal), 0);
  const totalActual   = data.categories.reduce((s, c) => s + (c.ytdActual ?? c.actualTotal), 0);
  const totalVariance = totalActual - totalBudget;
  const totalPct      = totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0;

  doc.setFontSize(13);
  setDocFont(doc, 'bold');
  doc.setTextColor(...NAVY);
  doc.text(tr('Yonetici Ozeti'), 14, 28);
  doc.setFontSize(9);
  setDocFont(doc, 'normal');
  doc.setTextColor(...GRAY_DARK);
  doc.text(tr('Executive Summary'), 14, 34);

  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.5);
  doc.line(14, 36, 283, 36);

  const metrics = [
    { labelTr: tr('Toplam Butce'),  labelEn: tr('Total Budget'),  value: formatTL(totalBudget),   color: NAVY },
    { labelTr: tr('Toplam Fiili'),  labelEn: tr('Total Actual'),  value: formatTL(totalActual),   color: NAVY },
    { labelTr: tr('Net Sapma'),     labelEn: tr('Net Variance'),  value: formatTL(totalVariance), color: totalVariance > 0 ? RED : GREEN },
    { labelTr: tr('Sapma Yuzdesi'), labelEn: tr('Variance %'),    value: formatPct(totalPct),     color: totalPct > 0 ? RED : GREEN },
  ];

  metrics.forEach((m, i) => {
    const x = 14 + i * 68;
    doc.setFillColor(...GRAY_LIGHT);
    doc.roundedRect(x, 40, 64, 28, 2, 2, 'F');
    doc.setDrawColor(...GRAY_MID);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, 40, 64, 28, 2, 2, 'S');
    doc.setFontSize(7);
    setDocFont(doc, 'bold');
    doc.setTextColor(...NAVY);
    doc.text(m.labelTr, x + 32, 47, { align: 'center' });
    setDocFont(doc, 'normal');
    doc.setTextColor(...GRAY_DARK);
    doc.setFontSize(6);
    doc.text(m.labelEn, x + 32, 51, { align: 'center' });
    doc.setFontSize(11);
    setDocFont(doc, 'bold');
    doc.setTextColor(...m.color);
    doc.text(m.value, x + 32, 61, { align: 'center' });
  });

  doc.setFontSize(10);
  setDocFont(doc, 'bold');
  doc.setTextColor(...NAVY);
  doc.text(tr('Kategori Bazli Ozet / Category Summary'), 14, 78);

  const tableY = 82;
  // 7 kolon: Kategori | Aktif Dönem | Bütçe | Fiili | Fark | % | Durum
  const cols   = [14, 73, 113, 153, 191, 226, 250];
  const headers = [
    [tr('Kategori'), tr('Category')],
    [tr('Aktif Donem'), tr('Period')],
    [tr('Butce'), tr('Budget')],
    [tr('Fiili'), tr('Actual')],
    [tr('Fark'), tr('Variance')],
    ['%', '%'],
    [tr('Durum'), tr('Status')],
  ];

  doc.setFillColor(...NAVY);
  doc.rect(14, tableY, 269, 10, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(6.5);
  setDocFont(doc, 'bold');
  headers.forEach((h, i) => {
    doc.text(h[0], cols[i] + 2, tableY + 5);
    doc.setFontSize(5);
    setDocFont(doc, 'normal');
    doc.text(h[1], cols[i] + 2, tableY + 8.5);
    doc.setFontSize(6.5);
    setDocFont(doc, 'bold');
  });

  data.categories.forEach((cat, idx) => {
    const rowY = tableY + 10 + idx * 9;
    doc.setFillColor(...(idx % 2 === 0 ? GRAY_LIGHT : WHITE));
    doc.rect(14, rowY, 269, 9, 'F');
    doc.setDrawColor(...GRAY_MID);
    doc.setLineWidth(0.1);
    doc.line(14, rowY + 9, 283, rowY + 9);

    const catBudget  = cat.ytdBudget ?? cat.budgetTotal;
    const catActual  = cat.ytdActual ?? cat.actualTotal;
    const catVar     = cat.ytdVariance ?? cat.variance;
    const catVarPct  = cat.ytdVariancePct ?? cat.variancePercent;

    // Aktif dönem kısa etiketi
    const periodTxt  = cat.isFullYear === false
      ? tr((cat.activePeriodLabel ?? cat.periodLabel ?? '').replace('Aktif Donem: ', '').replace(/ \d{4}$/, ''))
      : tr('Tum Yil');

    setDocFont(doc, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...BLACK);
    doc.text(tr(cat.name), cols[0] + 2, rowY + 6);
    doc.setFontSize(6);
    doc.text(periodTxt, cols[1] + 2, rowY + 6);
    doc.setFontSize(6.5);
    doc.text(formatTL(catBudget), cols[2] + 2, rowY + 6);
    doc.text(formatTL(catActual), cols[3] + 2, rowY + 6);

    doc.setTextColor(...(catVar > 0 ? RED : GREEN));
    doc.text(formatTL(catVar), cols[4] + 2, rowY + 6);
    doc.text(formatPct(catVarPct), cols[5] + 2, rowY + 6);

    const statusText   = catVar > 0 ? tr('ASIM')     : tr('TASARRUF');
    const statusTextEn = catVar > 0 ? tr('OVER')     : tr('SAVING');
    doc.setFillColor(...(catVar > 0 ? RED : GREEN));
    doc.roundedRect(cols[6] + 2, rowY + 1, 22, 7, 1, 1, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(5.5);
    setDocFont(doc, 'bold');
    doc.text(statusText,   cols[6] + 13, rowY + 4.5, { align: 'center' });
    doc.setFontSize(4.5);
    doc.text(statusTextEn, cols[6] + 13, rowY + 7,   { align: 'center' });
  });
}

function addCategoryPage(doc: jsPDF, cat: CategoryPDFData, data: PDFReportData, pageNum: number, totalPages: number, logoBase64: string) {
  addPageHeader(doc, data.companyName, pageNum, totalPages, logoBase64);
  addPageFooter(doc, data.generatedAt);

  // Kategori başlık bandı
  doc.setFillColor(...BLUE);
  doc.rect(14, 22, 269, 12, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  setDocFont(doc, 'bold');
  doc.text(tr(cat.name), 18, 30);
  doc.setFontSize(7);
  setDocFont(doc, 'normal');
  doc.text(tr(cat.nameEn), 18, 31.5);

  // Özet kartlar (sağ üst) — aktif dönem bazlı, iki durum
  const isFull        = cat.isFullYear ?? true;
  const dispBudget    = cat.ytdBudget ?? cat.budgetTotal;
  const dispActual    = cat.ytdActual ?? cat.actualTotal;
  const dispVar       = cat.ytdVariance ?? cat.variance;
  const dispVarPct    = cat.ytdVariancePct ?? cat.variancePercent;
  const annualBudget  = cat.annualBudget ?? dispBudget;
  const activeN       = cat.activeMonthsCount ?? 12;
  const varSign       = dispVar >= 0 ? '+' : '';
  const pctSign       = dispVarPct >= 0 ? '+' : '';

  doc.setFontSize(5.5);
  doc.setTextColor(...WHITE);
  if (isFull) {
    // Tek satır — "Yıllık Bütçe | Yıllık Fiili | Sapma"
    doc.text(tr(`Yillik Butce: ${formatTL(dispBudget)}`), 130, 29);
    doc.text(tr(`Yillik Fiili: ${formatTL(dispActual)}`), 178, 29);
    doc.text(tr(`Sapma: ${varSign}${formatTL(dispVar)} (${pctSign}${dispVarPct.toFixed(1)}%)`), 226, 29);
  } else {
    // Satır 1 — aktif dönem
    doc.text(tr(`Aktif Butce (${activeN} ay): ${formatTL(dispBudget)}`), 130, 27);
    doc.text(tr(`Aktif Fiili: ${formatTL(dispActual)}`), 196, 27);
    doc.text(tr(`Sapma: ${varSign}${formatTL(dispVar)} (${pctSign}${dispVarPct.toFixed(1)}%)`), 240, 27);
    // Satır 2 — yıllık referans
    doc.setFontSize(5);
    doc.setTextColor(200, 215, 245);
    doc.text(tr(`Yillik Butce (ref): ${formatTL(annualBudget)}`), 130, 32);
    const missingN = 12 - activeN;
    if (missingN > 0) {
      doc.text(tr(`Fiili girilmemis: ${missingN} ay`), 205, 32);
    }
  }

  // Aylık karşılaştırma tablosu
  doc.setFontSize(8);
  setDocFont(doc, 'bold');
  doc.setTextColor(...NAVY);
  doc.text(tr('Aylik Karsilastirma / Monthly Comparison'), 14, 42);

  const tblY = 45;
  const colW = 21;

  doc.setFillColor(...NAVY);
  doc.rect(14, tblY, 269, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(6);
  setDocFont(doc, 'bold');
  doc.text(tr('Kalem'), 16, tblY + 5.5);
  MONTHS_TR.forEach((m, i) => {
    doc.text(m, 42 + i * colW, tblY + 4);
    setDocFont(doc, 'normal');
    doc.setFontSize(5);
    doc.text(MONTHS_EN[i], 42 + i * colW, tblY + 7);
    setDocFont(doc, 'bold');
    doc.setFontSize(6);
  });

  const rows: { label: string; values: number[]; isBold: boolean; isVariance?: boolean }[] = [
    { label: tr('Butce/Budget'),  values: cat.monthlyData.map((m) => m.budget),            isBold: false },
    { label: tr('Fiili/Actual'),  values: cat.monthlyData.map((m) => m.actual),            isBold: false },
    { label: tr('Fark/Variance'), values: cat.monthlyData.map((m) => m.actual - m.budget), isBold: true, isVariance: true },
  ];

  rows.forEach((row, ri) => {
    const rowY = tblY + 8 + ri * 8;
    doc.setFillColor(...(ri % 2 === 0 ? GRAY_LIGHT : WHITE));
    doc.rect(14, rowY, 269, 8, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', row.isBold ? 'bold' : 'normal');
    doc.setTextColor(...BLACK);
    doc.text(row.label, 16, rowY + 5.5);
    row.values.forEach((v, i) => {
      const hasActual = (cat.monthlyData[i]?.actual ?? 0) > 0;
      if (row.isVariance) {
        if (!hasActual) { doc.setTextColor(...BLACK); doc.text('-', 42 + i * colW, rowY + 5.5); return; }
        doc.setTextColor(...(v > 0 ? RED : v < 0 ? GREEN : BLACK));
      } else {
        doc.setTextColor(...BLACK);
      }
      const formatted = v === 0 ? '-' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v);
      doc.text(formatted, 42 + i * colW, rowY + 5.5);
    });
  });

  // Toplam satırı
  const totY = tblY + 32;
  doc.setFillColor(...NAVY);
  doc.rect(14, totY, 269, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(6.5);
  setDocFont(doc, 'bold');
  doc.text(tr('TOPLAM / TOTAL'), 16, totY + 5.5);
  doc.text(formatTL(cat.budgetTotal), 42, totY + 5.5);
  doc.text(formatTL(cat.actualTotal), 42 + colW, totY + 5.5);
  const varColor: [number, number, number] = cat.variance > 0 ? [255, 180, 180] : [180, 255, 180];
  doc.setTextColor(...varColor);
  doc.text(formatTL(cat.variance) + ' (' + formatPct(cat.variancePercent) + ')', 42 + colW * 2, totY + 5.5);

  // Parametre detay tablosu — otomatik sayfa kırma
  if (cat.parameters && cat.parameters.length > 0) {
    const ROW_H = 5.5;
    const PAGE_MAX_Y = doc.internal.pageSize.getHeight() - 16 - 4;
    const PAGE_START_Y = 22;
    const pCols = [14, 110, 148, 186, 224, 256];
    const pHeaders = [tr('Parametre'), tr('Tip'), tr('Butce'), tr('Fiili'), tr('Fark'), tr('Oran')];
    let isFirstParamPage = true;

    function drawParamHeader(y: number): number {
      if (isFirstParamPage) {
        doc.setFontSize(8);
        setDocFont(doc, 'bold');
        doc.setTextColor(...NAVY);
        doc.text(tr('Parametre Detayi / Parameter Detail'), 14, y);
        y += 3;
        isFirstParamPage = false;
      }
      doc.setFillColor(...NAVY);
      doc.rect(14, y, 269, 7, 'F');
      doc.setTextColor(...WHITE);
      doc.setFontSize(5.5);
      setDocFont(doc, 'bold');
      pHeaders.forEach((h, i) => doc.text(h, pCols[i] + 2, y + 4.5));
      return y + 7;
    }

    // Guard: ensure section title (3) + header bar (7) + at least 1 row (5.5) = 15.5mm fit
    let paramHeaderY = totY + 12;
    if (paramHeaderY + 15.5 > PAGE_MAX_Y) {
      doc.addPage();
      addPageHeader(doc, data.companyName, 0, 0, logoBase64);
      addPageFooter(doc, data.generatedAt);
      paramHeaderY = PAGE_START_Y + 5;
    }
    let pCurY = drawParamHeader(paramHeaderY);

    cat.parameters.forEach((p, pi) => {
      if (pCurY + ROW_H > PAGE_MAX_Y) {
        doc.addPage();
        addPageHeader(doc, data.companyName, 0, 0, logoBase64);
        addPageFooter(doc, data.generatedAt);
        pCurY = drawParamHeader(PAGE_START_Y + 5);
      }

      if (p.isKey) {
        doc.setFillColor(235, 242, 255);
      } else {
        doc.setFillColor(...(pi % 2 === 0 ? GRAY_LIGHT : WHITE));
      }
      doc.rect(14, pCurY, 269, ROW_H, 'F');
      doc.setFontSize(5);
      setDocFont(doc, 'normal');
      doc.setTextColor(...BLACK);

      const pName = p.paramName.length > 40 ? p.paramName.slice(0, 40) + '...' : p.paramName;
      doc.text(tr(pName), pCols[0] + 2, pCurY + 3.8);
      doc.text(tr(p.unitType || 'adet'), pCols[1] + 2, pCurY + 3.8);
      doc.text(
        p.budgetTotal !== 0
          ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(p.budgetTotal)
          : '-',
        pCols[2] + 2, pCurY + 3.8
      );
      doc.text(
        p.actualTotal > 0
          ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(p.actualTotal)
          : '-',
        pCols[3] + 2, pCurY + 3.8
      );
      doc.setTextColor(...(p.diff > 0 ? RED : p.diff < 0 ? GREEN : BLACK));
      doc.text(
        p.diff !== 0
          ? (p.diff > 0 ? '+' : '') + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(p.diff)
          : '-',
        pCols[4] + 2, pCurY + 3.8
      );
      doc.text(
        p.diffPct !== null
          ? (p.diffPct > 0 ? '+' : '') + p.diffPct.toFixed(1) + '%'
          : '-',
        pCols[5] + 2, pCurY + 3.8
      );
      pCurY += ROW_H;
    });
  }
}

function addCategoryAiPage(doc: jsPDF, cat: CategoryPDFData, data: PDFReportData, pageNum: number, totalPages: number, logoBase64: string) {
  if (!cat.aiAnalysis) return;

  addPageHeader(doc, data.companyName, pageNum, totalPages, logoBase64);
  addPageFooter(doc, data.generatedAt);

  // Başlık
  doc.setFillColor(235, 242, 255);
  doc.rect(14, 22, 269, 10, 'F');
  doc.setFontSize(9);
  setDocFont(doc, 'bold');
  doc.setTextColor(...NAVY);
  doc.text(tr(`${cat.name} — Yapay Zeka Sapma Analizi / AI Variance Analysis`), 18, 29);

  // Dönem bilgisi
  let curY = 35;
  if (cat.periodLabel || cat.reportDate) {
    setDocFont(doc, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY_DARK);
    const dateStr = cat.reportDate
      ? new Date(cat.reportDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('tr-TR');
    doc.text(
      tr(`Donem: ${cat.periodLabel ?? 'Tum Yil'} | Rapor Tarihi: ${dateStr}`),
      14, curY
    );
    curY += 5;
  } else {
    curY = 38;
  }
  const LINE_H = 4.5;
  const HEADER_RESERVE = 32;
  const FOOTER_H = 16;
  const pageH = doc.internal.pageSize.getHeight();
  const MAX_Y = pageH - FOOTER_H - 4;   // landscape A4: 210 - 16 - 4 = 190

  function addPage(d: jsPDF): number {
    d.addPage();
    addPageHeader(d, data.companyName, 0, 0, logoBase64);
    addPageFooter(d, data.generatedAt);
    return HEADER_RESERVE;
  }

  // ensureSpace: en az 'needed' mm kaldıysa devam, yoksa yeni sayfa aç
  function ensureSpace(needed: number): void {
    if (curY + needed > MAX_Y) curY = addPage(doc);
  }

  function section(title: string, text: string) {
    if (!text) return;
    // başlık + en az 2 satır birlikte kalsın (orphan önleme)
    ensureSpace(LINE_H * 3 + 2);
    setDocFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text(tr(title), 14, curY);
    curY += LINE_H;
    setDocFont(doc, 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(...BLACK);
    const lines = doc.splitTextToSize(tr(text), 265);
    lines.forEach((line: string) => {
      ensureSpace(LINE_H);
      doc.text(line, 14, curY); curY += LINE_H;
    });
    curY += 2;
  }

  // Özet
  section('Ozet / Summary:', cat.aiAnalysis.summary);

  // Etki Dağılımı — kart düzeni
  if (cat.aiAnalysis.effects.length > 0) {
    ensureSpace(20);
    setDocFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text(tr('Etki Dagilimi / Variance Decomposition:'), 14, curY);
    curY += 5;

    const EFFECT_WIDTH = 269;
    const COL1 = 14;
    const COL2 = 90;
    const COL3 = 155;

    cat.aiAnalysis.effects.forEach((eff, ei) => {
      const descLines = doc.splitTextToSize(tr('Aciklama: ' + eff.description), 240);
      const drvLines  = doc.splitTextToSize(tr('Sebep: ' + ((eff as unknown as { driver?: string }).driver ?? '')), 240);
      const blockH    = 7 + (descLines.length * 3.8) + (drvLines.length * 3.8) + 4;

      ensureSpace(blockH);

      doc.setFillColor(...(ei % 2 === 0 ? ([240, 242, 255] as [number, number, number]) : WHITE));
      doc.rect(COL1, curY, EFFECT_WIDTH, blockH, 'F');
      doc.setDrawColor(200, 200, 220);
      doc.rect(COL1, curY, EFFECT_WIDTH, blockH, 'S');

      // Header row
      setDocFont(doc, 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...NAVY);
      doc.text(tr(eff.label), COL1 + 3, curY + 5);

      doc.setTextColor(...(eff.amount > 0 ? RED : GREEN));
      doc.text(formatTL(eff.amount), COL2, curY + 5);

      doc.setTextColor(...NAVY);
      doc.text('%' + Math.abs(eff.contributionPercent).toFixed(1), COL3, curY + 5);

      // Description + driver lines
      setDocFont(doc, 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(...BLACK);
      let lineY = curY + 9;
      descLines.forEach((l: string) => { doc.text(l, COL1 + 3, lineY); lineY += 3.8; });
      drvLines.forEach((l: string)  => { doc.text(l, COL1 + 3, lineY); lineY += 3.8; });

      curY += blockH + 1;
    });
    curY += 3;
  }

  // Aylık Derin Analiz (YTD — her ay için ayrı derin analiz)
  if (cat.aiAnalysis.monthlyAnalysis && cat.aiAnalysis.monthlyAnalysis.length > 0) {
    ensureSpace(18);
    setDocFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text(tr('Aylik Derin Analiz / Monthly Deep Analysis:'), 14, curY);
    curY += LINE_H + 1;

    cat.aiAnalysis.monthlyAnalysis.forEach((month) => {
      ensureSpace(22);

      // Ay başlığı + rakamlar
      doc.setFillColor(245, 247, 255);
      doc.rect(14, curY, 269, 7, 'F');
      setDocFont(doc, 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...NAVY);
      doc.text(tr(month.monthLabel + ':'), 17, curY + 5);

      if (!month.isDataMissing) {
        setDocFont(doc, 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...BLACK);
        const rakam = tr(`Butce ${formatTL(month.budget)} | Fiili ${formatTL(month.actual)} | Sapma ${month.variance >= 0 ? '+' : ''}${formatTL(month.variance)} (${month.variancePct >= 0 ? '+' : ''}${month.variancePct.toFixed(1)}%)`);
        doc.text(rakam, 60, curY + 5);
      } else {
        setDocFont(doc, 'normal');
        doc.setFontSize(6);
        doc.setTextColor(160, 160, 160);
        doc.text(tr('Fiili veri girilmemis'), 60, curY + 5);
        doc.setTextColor(...BLACK);
      }
      curY += 8;

      // Analiz metni
      setDocFont(doc, 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(...BLACK);
      const analysisLines = doc.splitTextToSize(tr(month.analysis ?? ''), 265);
      analysisLines.forEach((line: string) => {
        ensureSpace(LINE_H);
        doc.text(line, 14, curY);
        curY += LINE_H;
      });

      // Trend notu
      if (month.trendNote && !month.isDataMissing) {
        ensureSpace(LINE_H);
        setDocFont(doc, 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(100, 100, 130);
        const trendLines = doc.splitTextToSize(tr(`Trend: ${month.trendNote}`), 265);
        trendLines.forEach((l: string) => { doc.text(l, 14, curY); curY += 4; });
        doc.setTextColor(...BLACK);
      }
      curY += 3;
    });
    curY += 2;
  }

  // Aylık Trend
  section('Aylik Trend:', cat.aiAnalysis.monthlyTrend);

  // Etki İlişkileri
  section('Etki Iliskileri:', cat.aiAnalysis.interRelations);

  // Karma Etki
  if (cat.aiAnalysis.karmaEffect) {
    ensureSpace(20);
    setDocFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text(tr('Karma Etki Analizi:'), 14, curY);
    curY += 5;

    // Baskın Etken — tam genişlik, dinamik yükseklik
    const domLines = doc.splitTextToSize(tr(cat.aiAnalysis.karmaEffect.dominantFactor), 255);
    const domH = Math.max(12, domLines.length * 4 + 6);
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(14, curY, 269, domH, 1, 1, 'F');
    doc.setFontSize(5.5);
    setDocFont(doc, 'bold');
    doc.setTextColor(185, 28, 28);
    doc.text(tr('BASKIN ETKEN'), 18, curY + 5);
    setDocFont(doc, 'normal');
    doc.setTextColor(153, 27, 27);
    domLines.forEach((l: string, i: number) => doc.text(l, 18, curY + 9.5 + i * 4));
    curY += domH + 2;

    // İkincil Etken — tam genişlik, dinamik yükseklik
    const secLines = doc.splitTextToSize(tr(cat.aiAnalysis.karmaEffect.secondaryFactor), 261);
    const secH = Math.max(12, secLines.length * 4 + 6);
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(14, curY, 269, secH, 1, 1, 'F');
    doc.setFontSize(5.5);
    setDocFont(doc, 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text(tr('IKINCIL ETKEN'), 18, curY + 5);
    setDocFont(doc, 'normal');
    doc.setTextColor(146, 64, 14);
    secLines.forEach((l: string, i: number) => doc.text(l, 18, curY + 9.5 + i * 4));
    curY += secH + 2;

    setDocFont(doc, 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...BLACK);
    const karmaLines = doc.splitTextToSize(tr(cat.aiAnalysis.karmaEffect.description), 265);
    karmaLines.forEach((line: string) => {
      ensureSpace(LINE_H);
      doc.text(line, 14, curY); curY += LINE_H;
    });
    curY += 2;
  }

  // Departman Analizi
  section('Departman Analizi:', cat.aiAnalysis.departmentInsights ?? '');

  // Aylık Yoğunlaşma
  section('Aylik Yogunlasma:', cat.aiAnalysis.monthlyInsights ?? '');

  // Öneriler
  if (cat.aiAnalysis.recommendations.length > 0) {
    ensureSpace(LINE_H * 3);
    setDocFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text(tr('Oneriler / Recommendations:'), 14, curY);
    curY += LINE_H;
    cat.aiAnalysis.recommendations.forEach((rec, ri) => {
      ensureSpace(LINE_H * 2);
      setDocFont(doc, 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(...BLACK);
      const recLines = doc.splitTextToSize(tr(`${ri + 1}. ${rec}`), 265);
      recLines.forEach((line: string) => {
        ensureSpace(LINE_H);
        doc.text(line, 14, curY); curY += LINE_H;
      });
    });
  }

  // ─── Optimizasyon Senaryolari ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opt = (cat.aiAnalysis as any).optimization;
  if (opt) {
    ensureSpace(20);
    setDocFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text(tr('Optimizasyon Senaryolari:'), 14, curY);
    curY += LINE_H + 1;

    const scenarios: Array<{ key: string; label: string }> = [
      { key: 'scenarioA', label: 'A' },
      { key: 'scenarioB', label: 'B' },
      { key: 'scenarioC', label: 'C' },
    ];

    for (const { key, label } of scenarios) {
      const s = opt[key];
      if (!s) continue;
      // Orphan önleme: başlık (6.5) + padding (2) + en az 2 bullet (5.5*2) = 19mm
      ensureSpace(19);

      doc.setFillColor(...NAVY);
      doc.rect(14, curY, 269, 6.5, 'F');
      doc.setTextColor(...WHITE);
      setDocFont(doc, 'bold');
      doc.setFontSize(6);
      doc.text(tr(`Senaryo ${label}: ${s.title ?? ''}`), 17, curY + 4.5);
      const savText = tr(s.savings ?? '');
      const feasText = tr(s.feasibility ?? '');
      doc.text(`${savText}  |  ${feasText}`, 190, curY + 4.5);
      // +5mm padding: jsPDF text baseline ~1.6mm ascender ile ilk bullet bar altından net görsel ayrılma sağlar
      curY += 6.5 + 5; // bar 6.5 + 5mm padding (jsPDF text baseline ascender 1.6mm sebebi ile +2 yetersiz, +5 güvenli görsel ayrım)

      setDocFont(doc, 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(...BLACK);
      ((s.actions ?? []) as string[]).forEach((action: string) => {
        const aLines = doc.splitTextToSize(tr(`• ${action}`), 255);
        aLines.forEach((l: string) => { ensureSpace(3.8); doc.text(l, 17, curY); curY += 3.8; });
      });
      curY += 1;

      if (s.items && s.items.length > 0) {
        // Ensure header (5.5) + at least 1 data row (5.5) fit before drawing table header
        ensureSpace(11);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasAdet  = s.items.some((it: any) => it.currentAdet  !== undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasFiyat = s.items.some((it: any) => it.currentFiyat !== undefined);
        const hasCols  = hasAdet || hasFiyat;

        // Dinamik kolon pozisyonları
        const pageW   = doc.internal.pageSize.getWidth();
        const margin  = 14;
        const cW      = pageW - 2 * margin;   // içerik genişliği
        const xStart  = margin + 3;           // tablo içi sol boşluk
        const xEnd    = margin + cW;          // sağ kenar (Tasarruf sağa hizalı buraya)
        const xMevcut = margin + cW * 0.50;
        const xHedef  = margin + cW * 0.68;
        const nameMaxW = hasCols ? cW * 0.46 : cW * 0.86;

        // Tasarruf için locale-bağımsız format (toLocaleString NBSP separator üretir)
        const formatTL = (n: number): string => {
          const fixed = Math.round(n).toString();
          return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' TL';
        };

        // Tablo header — yeni sayfada tekrar çizilir
        const drawOptTableHeader = () => {
          doc.setFillColor(230, 232, 245);
          doc.rect(margin + 3, curY, cW - 3, 5.5, 'F');
          setDocFont(doc, 'bold');
          doc.setFontSize(5.5);
          doc.setTextColor(...NAVY);
          doc.text('Kalem', xStart, curY + 4);
          if (hasAdet) {
            doc.text('Mevcut Adet', xMevcut, curY + 4);
            doc.text('Hedef Adet', xHedef, curY + 4);
          } else if (hasFiyat) {
            doc.text('Mevcut Fiyat', xMevcut, curY + 4);
            doc.text('Hedef Fiyat', xHedef, curY + 4);
          }
          doc.text('Tasarruf', xEnd, curY + 4, { align: 'right' });
          curY += 5.5;
        };
        drawOptTableHeader();

        ((s.items ?? []) as any[]).forEach((item: any, ii: number) => {
          // Satır taşarsa yeni sayfa aç ve tablo header'ını tekrar çiz
          if (curY + 5.5 > MAX_Y) {
            curY = addPage(doc);
            drawOptTableHeader();
          }
          doc.setFillColor(...((ii % 2 === 0 ? GRAY_LIGHT : WHITE) as [number, number, number]));
          doc.rect(margin + 3, curY, cW - 3, 5.5, 'F');
          setDocFont(doc, 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(...BLACK);
          const nameLines = doc.splitTextToSize(tr(item.name ?? ''), nameMaxW);
          doc.text(nameLines[0] ?? '', xStart, curY + 4);
          if (hasAdet) {
            doc.text(String(item.currentAdet ?? ''), xMevcut, curY + 4);
            doc.text(String(item.targetAdet ?? ''), xHedef, curY + 4);
          } else if (hasFiyat) {
            doc.text(formatTL(item.currentFiyat ?? 0), xMevcut, curY + 4);
            doc.text(formatTL(item.targetFiyat ?? 0), xHedef, curY + 4);
          }
          doc.setTextColor(...GREEN);
          doc.text(formatTL(item.saving ?? 0), xEnd, curY + 4, { align: 'right' });
          curY += 5.5;
        });
        curY += 2;
      }
      curY += 3;
    }

    if (opt.optimalPath) {
      ensureSpace(LINE_H * 3);
      setDocFont(doc, 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...NAVY);
      doc.text(tr('Optimal Yol:'), 14, curY); curY += LINE_H;
      setDocFont(doc, 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(...BLACK);
      const optLines = doc.splitTextToSize(tr(opt.optimalPath), 265);
      optLines.forEach((l: string) => { ensureSpace(LINE_H); doc.text(l, 14, curY); curY += LINE_H; });
      curY += 1;
    }

    // Yılsonu Tahmini — sadece yearEndProjection objesi yoksa eski metni göster
    if (opt.yearEndForecast && !cat.aiAnalysis?.yearEndProjection) {
      ensureSpace(LINE_H * 3);
      setDocFont(doc, 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...NAVY);
      doc.text(tr('Yilsonu Tahmini:'), 14, curY); curY += LINE_H;
      setDocFont(doc, 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(...BLACK);
      const foreLines = doc.splitTextToSize(tr(opt.yearEndForecast), 265);
      foreLines.forEach((l: string) => { ensureSpace(LINE_H); doc.text(l, 14, curY); curY += LINE_H; });
    }
  }

  // Yıl Sonu Projeksiyon (YTD AI çıktısından — daha zengin)
  if (cat.aiAnalysis?.yearEndProjection) {
    const proj = cat.aiAnalysis.yearEndProjection;
    ensureSpace(25);
    setDocFont(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text(tr('Yil Sonu Projeksiyon / Year-End Projection:'), 14, curY);
    curY += LINE_H + 1;

    setDocFont(doc, 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(...BLACK);
    doc.text(tr(`Projekte Yillik Fiili: ${formatTL(proj.projectedAnnualActual)}`), 14, curY); curY += LINE_H;
    doc.text(tr(`Projekte Yil Sonu Sapma: ${proj.projectedVariancePct >= 0 ? '+' : ''}${proj.projectedVariancePct.toFixed(1)}%`), 14, curY); curY += LINE_H;
    if (proj.criticalThresholdMonth) {
      ensureSpace(LINE_H);
      setDocFont(doc, 'bold');
      doc.setTextColor(200, 50, 50);
      doc.text(tr(`Kritik Esik Ayi: ${proj.criticalThresholdMonth}`), 14, curY);
      doc.setTextColor(...BLACK);
      curY += LINE_H;
    }
    setDocFont(doc, 'normal');
    const projLines = doc.splitTextToSize(tr(proj.description ?? ''), 265);
    projLines.forEach((l: string) => { ensureSpace(LINE_H); doc.text(l, 14, curY); curY += LINE_H; });
    curY += 2;
  }
}

function addDepartmentPage(doc: jsPDF, data: PDFReportData, pageNum: number, totalPages: number, logoBase64: string) {
  if (!data.departments || data.departments.length === 0) return;

  addPageHeader(doc, data.companyName, pageNum, totalPages, logoBase64);
  addPageFooter(doc, data.generatedAt);

  doc.setFontSize(13);
  setDocFont(doc, 'bold');
  doc.setTextColor(...NAVY);
  doc.text(tr('Departman Kirilimi'), 14, 28);
  doc.setFontSize(9);
  setDocFont(doc, 'normal');
  doc.setTextColor(...GRAY_DARK);
  doc.text(tr('Department Breakdown'), 14, 34);
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.5);
  doc.line(14, 36, 283, 36);

  const tblY = 42;
  const cols = [14, 80, 140, 196, 240];
  const headers = [
    [tr('Departman'), tr('Department')],
    [tr('Butce'), tr('Budget')],
    [tr('Fiili'), tr('Actual')],
    [tr('Fark'), tr('Variance')],
    ['%', '%'],
  ];

  doc.setFillColor(...NAVY);
  doc.rect(14, tblY, 269, 10, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  setDocFont(doc, 'bold');
  headers.forEach((h, i) => {
    doc.text(h[0], cols[i] + 2, tblY + 5);
    doc.setFontSize(5.5);
    setDocFont(doc, 'normal');
    doc.text(h[1], cols[i] + 2, tblY + 8.5);
    doc.setFontSize(7);
    setDocFont(doc, 'bold');
  });

  data.departments.forEach((dept, idx) => {
    const rowY = tblY + 10 + idx * 10;
    doc.setFillColor(...(idx % 2 === 0 ? GRAY_LIGHT : WHITE));
    doc.rect(14, rowY, 269, 10, 'F');
    doc.setFontSize(7.5);
    setDocFont(doc, 'bold');
    doc.setTextColor(...NAVY);
    doc.text(tr(dept.name), cols[0] + 2, rowY + 6.5);
    setDocFont(doc, 'normal');
    doc.setTextColor(...BLACK);
    doc.text(formatTL(dept.budgetTotal), cols[1] + 2, rowY + 6.5);
    doc.text(formatTL(dept.actualTotal), cols[2] + 2, rowY + 6.5);
    doc.setTextColor(...(dept.variance > 0 ? RED : GREEN));
    doc.text(formatTL(dept.variance), cols[3] + 2, rowY + 6.5);
    doc.text(formatPct(dept.variancePercent), cols[4] + 2, rowY + 6.5);
  });
}

function addCategoryExecutivePage(doc: jsPDF, cat: CategoryPDFData, data: PDFReportData, pageNum: number, totalPages: number, logoBase64: string) {
  addPageHeader(doc, data.companyName, pageNum, totalPages, logoBase64);
  addPageFooter(doc, data.generatedAt);

  // Kategori başlık bandı
  doc.setFillColor(...BLUE);
  doc.rect(14, 22, 269, 12, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  setDocFont(doc, 'bold');
  doc.text(tr(cat.name), 18, 30);
  doc.setFontSize(7);
  setDocFont(doc, 'normal');
  doc.text(tr(cat.nameEn), 18, 31.5);
  const summaryItems = [
    tr(`Butce: ${formatTL(cat.budgetTotal)}`),
    tr(`Fiili: ${formatTL(cat.actualTotal)}`),
    tr(`Fark: ${formatTL(cat.variance)}`),
  ];
  doc.setFontSize(6);
  summaryItems.forEach((s, i) => doc.text(s, 130 + i * 52, 29));

  // Aylık tablo
  doc.setFontSize(8);
  setDocFont(doc, 'bold');
  doc.setTextColor(...NAVY);
  doc.text(tr('Aylik Karsilastirma / Monthly Comparison'), 14, 42);

  const tblY = 45;
  const colW = 21;
  doc.setFillColor(...NAVY);
  doc.rect(14, tblY, 269, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(6);
  setDocFont(doc, 'bold');
  doc.text(tr('Kalem'), 16, tblY + 5.5);
  MONTHS_TR.forEach((m, i) => {
    doc.text(m, 42 + i * colW, tblY + 4);
    setDocFont(doc, 'normal');
    doc.setFontSize(5);
    doc.text(MONTHS_EN[i], 42 + i * colW, tblY + 7);
    setDocFont(doc, 'bold');
    doc.setFontSize(6);
  });

  const tableRows = [
    { label: tr('Butce/Budget'),  values: cat.monthlyData.map((m) => m.budget), isBold: false, isVariance: false },
    { label: tr('Fiili/Actual'),  values: cat.monthlyData.map((m) => m.actual), isBold: false, isVariance: false },
    { label: tr('Fark/Variance'), values: cat.monthlyData.map((m) => m.actual - m.budget), isBold: true, isVariance: true },
  ];
  tableRows.forEach((row, ri) => {
    const rowY = tblY + 8 + ri * 8;
    doc.setFillColor(...(ri % 2 === 0 ? GRAY_LIGHT : WHITE));
    doc.rect(14, rowY, 269, 8, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', row.isBold ? 'bold' : 'normal');
    doc.setTextColor(...BLACK);
    doc.text(row.label, 16, rowY + 5.5);
    row.values.forEach((v, i) => {
      if (row.isVariance) {
        const hasActual = (cat.monthlyData[i]?.actual ?? 0) > 0;
        if (!hasActual) { doc.setTextColor(...BLACK); doc.text('-', 42 + i * colW, rowY + 5.5); return; }
        doc.setTextColor(...(v > 0 ? RED : v < 0 ? GREEN : BLACK));
      } else { doc.setTextColor(...BLACK); }
      const formatted = v === 0 ? '-' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v);
      doc.text(formatted, 42 + i * colW, rowY + 5.5);
    });
  });

  const totY = tblY + 32;
  doc.setFillColor(...NAVY);
  doc.rect(14, totY, 269, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(6.5);
  setDocFont(doc, 'bold');
  doc.text(tr('TOPLAM / TOTAL'), 16, totY + 5.5);
  doc.text(formatTL(cat.budgetTotal), 42, totY + 5.5);
  doc.text(formatTL(cat.actualTotal), 42 + colW, totY + 5.5);
  const varColor: [number, number, number] = cat.variance > 0 ? [255, 180, 180] : [180, 255, 180];
  doc.setTextColor(...varColor);
  doc.text(formatTL(cat.variance) + ' (' + formatPct(cat.variancePercent) + ')', 42 + colW * 2, totY + 5.5);

  // Üst 5 parametre (TL olanlar, fark büyükten küçüğe)
  const topParams = (cat.parameters ?? [])
    .filter((p) => p.diff !== 0 || p.isKey)
    .sort((a, b) => {
      if ((b.isKey ? 1 : 0) !== (a.isKey ? 1 : 0)) return (b.isKey ? 1 : 0) - (a.isKey ? 1 : 0);
      return Math.abs(b.diff) - Math.abs(a.diff);
    })
    .slice(0, 8);

  let pCurY = totY + 12;

  if (topParams.length > 0) {
    doc.setFontSize(7);
    setDocFont(doc, 'bold');
    doc.setTextColor(...NAVY);
    doc.text(tr('En Yuksek Sapma Kalemleri (Top 5)'), 14, pCurY);

    const pCols = [14, 110, 148, 186, 224, 256];
    doc.setFillColor(...NAVY);
    doc.rect(14, pCurY + 3, 269, 7, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(5.5);
    setDocFont(doc, 'bold');
    [tr('Parametre'), tr('Tip'), tr('Butce'), tr('Fiili'), tr('Fark'), tr('Oran')].forEach((h, i) =>
      doc.text(h, pCols[i] + 2, pCurY + 7.5)
    );
    pCurY += 10;

    topParams.forEach((p, pi) => {
      doc.setFillColor(...(pi % 2 === 0 ? GRAY_LIGHT : WHITE));
      doc.rect(14, pCurY, 269, 5.5, 'F');
      doc.setFontSize(5);
      setDocFont(doc, 'normal');
      doc.setTextColor(...BLACK);
      const pName = p.paramName.length > 40 ? p.paramName.slice(0, 40) + '...' : p.paramName;
      doc.text(tr(pName), pCols[0] + 2, pCurY + 3.8);
      doc.text(tr(p.unitType || 'adet'), pCols[1] + 2, pCurY + 3.8);
      doc.text(new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(p.budgetTotal), pCols[2] + 2, pCurY + 3.8);
      doc.text(p.actualTotal > 0 ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(p.actualTotal) : '-', pCols[3] + 2, pCurY + 3.8);
      doc.setTextColor(...(p.diff > 0 ? RED : p.diff < 0 ? GREEN : BLACK));
      doc.text((p.diff > 0 ? '+' : '') + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(p.diff), pCols[4] + 2, pCurY + 3.8);
      doc.text(p.diffPct !== null ? (p.diffPct > 0 ? '+' : '') + p.diffPct.toFixed(1) + '%' : '-', pCols[5] + 2, pCurY + 3.8);
      pCurY += 5.5;
    });
  }

  // Kısa AI özeti
  if (cat.aiAnalysis?.summary) {
    pCurY += 5;
    doc.setFontSize(7);
    setDocFont(doc, 'bold');
    doc.setTextColor(...NAVY);
    doc.text(tr('AI Ozet:'), 14, pCurY);
    pCurY += 4;
    setDocFont(doc, 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(...BLACK);
    const sumLines = doc.splitTextToSize(tr(cat.aiAnalysis.summary), 265);
    sumLines.slice(0, 4).forEach((line: string) => {
      if (pCurY < 185) { doc.text(line, 14, pCurY); pCurY += 4.5; }
    });

    if (cat.aiAnalysis.effects.length > 0) {
      pCurY += 3;
      const topEff = cat.aiAnalysis.effects[0];
      doc.setFontSize(6);
      setDocFont(doc, 'bold');
      doc.setTextColor(...NAVY);
      doc.text(tr('Baskin Etki:'), 14, pCurY);
      setDocFont(doc, 'normal');
      doc.setTextColor(...(topEff.amount > 0 ? RED : GREEN));
      doc.text(`${tr(topEff.label)} — ${formatTL(topEff.amount)}`, 40, pCurY);
      pCurY += 4;
      doc.setTextColor(...BLACK);
      const effLines = doc.splitTextToSize(tr(topEff.description), 265);
      effLines.slice(0, 2).forEach((line: string) => {
        if (pCurY < 190) { doc.text(line, 14, pCurY); pCurY += 4; }
      });
    }

    if (cat.aiAnalysis.recommendations.length > 0 && pCurY < 180) {
      pCurY += 3;
      doc.setFontSize(6.5);
      setDocFont(doc, 'bold');
      doc.setTextColor(...NAVY);
      doc.text(tr('Temel Oneriler:'), 14, pCurY);
      pCurY += 4;
      cat.aiAnalysis.recommendations.slice(0, 2).forEach((rec, ri) => {
        if (pCurY < 190) {
          setDocFont(doc, 'normal');
          doc.setFontSize(6);
          doc.setTextColor(...BLACK);
          const recLines = doc.splitTextToSize(tr(`${ri + 1}. ${rec}`), 265);
          recLines.slice(0, 2).forEach((line: string) => {
            if (pCurY < 192) { doc.text(line, 14, pCurY); pCurY += 4; }
          });
        }
      });
    }
  }
}

export async function generateExecutivePDF(data: PDFReportData): Promise<void> {
  const logoBase64 = await loadLogo();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  USE_UNICODE_FONT = await loadRobotoFont(doc);
  const totalPages = 99;

  // Kapak
  addCoverPage(doc, data, logoBase64);

  // Yönetici Özeti
  doc.addPage();
  addExecutiveSummaryPage(doc, data, 2, totalPages, logoBase64);

  // Her kategori için 1 özet sayfa
  let pageNum = 3;
  data.categories.forEach((cat) => {
    doc.addPage();
    addCategoryExecutivePage(doc, cat, data, pageNum, totalPages, logoBase64);
    pageNum++;
  });

  // Departman sayfası
  if (data.departments && data.departments.length > 0) {
    doc.addPage();
    addDepartmentPage(doc, data, pageNum, totalPages, logoBase64);
  }

  const fileName = `${data.companyCode}_Yonetici_Ozeti_${tr(data.period.replace(/\s/g, '_'))}.pdf`;
  doc.save(fileName);
}

export async function generateBudgetPDF(data: PDFReportData): Promise<void> {
  const logoBase64 = await loadLogo();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  USE_UNICODE_FONT = await loadRobotoFont(doc);

  const totalPages = 99;

  // Kapak
  addCoverPage(doc, data, logoBase64);

  // Yönetici özeti
  doc.addPage();
  addExecutiveSummaryPage(doc, data, 2, totalPages, logoBase64);

  // Kategoriler — her biri 2 sayfa
  let pageNum = 3;
  data.categories.forEach((cat) => {
    doc.addPage();
    addCategoryPage(doc, cat, data, pageNum, totalPages, logoBase64);
    pageNum++;
    if (cat.aiAnalysis) {
      doc.addPage();
      addCategoryAiPage(doc, cat, data, pageNum, totalPages, logoBase64);
      pageNum++;
    }
  });

  // Departman sayfası
  if (data.departments && data.departments.length > 0) {
    doc.addPage();
    addDepartmentPage(doc, data, pageNum, totalPages, logoBase64);
  }

  const fileName = `${data.companyCode}_Idari_Isler_Butce_${tr(data.period.replace(/\s/g, '_'))}.pdf`;
  doc.save(fileName);
}
