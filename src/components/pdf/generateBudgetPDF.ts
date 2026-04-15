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

async function registerNotoSans(doc: jsPDF): Promise<void> {
  try {
    const [regularData, boldData] = await Promise.all([
      fetchAsBase64('/noto-sans-regular.woff'),
      fetchAsBase64('/noto-sans-bold.woff'),
    ]);
    if (regularData) {
      const regularB64 = regularData.replace(/^data:[^;]+;base64,/, '');
      doc.addFileToVFS('NotoSans-Regular.woff', regularB64);
      doc.addFont('NotoSans-Regular.woff', 'NotoSans', 'normal');
    }
    if (boldData) {
      const boldB64 = boldData.replace(/^data:[^;]+;base64,/, '');
      doc.addFileToVFS('NotoSans-Bold.woff', boldB64);
      doc.addFont('NotoSans-Bold.woff', 'NotoSans', 'bold');
    }
  } catch {
    // helvetica fallback
  }
}

let font = 'helvetica';

export interface CategoryPDFData {
  name: string;
  nameEn: string;
  budgetTotal: number;
  actualTotal: number;
  variance: number;
  variancePercent: number;
  monthlyData: { month: number; budget: number; actual: number }[];
  aiAnalysis?: {
    summary: string;
    effects: { type: string; label: string; amount: number; contributionPercent: number; description: string }[];
    monthlyTrend: string;
    recommendations: string[];
    interRelations: string;
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

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
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
  doc.setFont(font, 'bold');
  doc.text(companyName, 30, 10);
  doc.setFont(font, 'normal');
  doc.setFontSize(7);
  doc.text('İdari İşler Bütçe Raporu / Administrative Affairs Budget Report', 30, 15);
  doc.text(`${pageNum} / ${totalPages}`, 285, 10, { align: 'right' });
}

function addPageFooter(doc: jsPDF, generatedAt: string) {
  doc.setFillColor(...GRAY_MID);
  doc.rect(0, 196, 297, 5, 'F');
  doc.setTextColor(...GRAY_DARK);
  doc.setFontSize(6);
  doc.setFont(font, 'normal');
  doc.text(`Gizli - Yalnızca İç Kullanım / Confidential - Internal Use Only | ${generatedAt}`, 8, 199);
  doc.text('Claude AI ile analiz edildi / Analyzed with Claude AI', 289, 199, { align: 'right' });
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
  doc.setFont(font, 'bold');
  doc.text('İDARİ İŞLER BÜTÇE RAPORU', 148, 112, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont(font, 'normal');
  doc.text('Administrative Affairs Budget Report', 148, 122, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont(font, 'bold');
  doc.text(data.period, 148, 140, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont(font, 'normal');
  doc.setTextColor(180, 200, 230);
  doc.text(`Oluşturulma Tarihi / Generated: ${data.generatedAt}`, 148, 152, { align: 'center' });
  doc.text(`Şirket / Company: ${data.companyName} (${data.companyCode})`, 148, 160, { align: 'center' });

  doc.setFillColor(...BLUE);
  doc.rect(0, 198, 297, 12, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.text('Yavuz Sultan Selim Köprüsü ve Kuzey Çevre Otoyolu İşletmesi', 148, 205, { align: 'center' });
}

function addExecutiveSummaryPage(doc: jsPDF, data: PDFReportData, pageNum: number, totalPages: number, logoBase64: string) {
  addPageHeader(doc, data.companyName, pageNum, totalPages, logoBase64);
  addPageFooter(doc, data.generatedAt);

  const totalBudget   = data.categories.reduce((s, c) => s + c.budgetTotal, 0);
  const totalActual   = data.categories.reduce((s, c) => s + c.actualTotal, 0);
  const totalVariance = totalActual - totalBudget;
  const totalPct      = totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0;

  doc.setFontSize(13);
  doc.setFont(font, 'bold');
  doc.setTextColor(...NAVY);
  doc.text('Yönetici Özeti', 14, 28);
  doc.setFontSize(9);
  doc.setFont(font, 'normal');
  doc.setTextColor(...GRAY_DARK);
  doc.text('Executive Summary', 14, 34);

  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.5);
  doc.line(14, 36, 283, 36);

  const metrics = [
    { labelTr: 'Toplam Bütçe',  labelEn: 'Total Budget',  value: formatTL(totalBudget),   color: NAVY },
    { labelTr: 'Toplam Fiili',  labelEn: 'Total Actual',  value: formatTL(totalActual),   color: NAVY },
    { labelTr: 'Net Sapma',     labelEn: 'Net Variance',  value: formatTL(totalVariance), color: totalVariance > 0 ? RED : GREEN },
    { labelTr: 'Sapma Yüzdesi', labelEn: 'Variance %',    value: formatPct(totalPct),     color: totalPct > 0 ? RED : GREEN },
  ];

  metrics.forEach((m, i) => {
    const x = 14 + i * 68;
    doc.setFillColor(...GRAY_LIGHT);
    doc.roundedRect(x, 40, 64, 28, 2, 2, 'F');
    doc.setDrawColor(...GRAY_MID);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, 40, 64, 28, 2, 2, 'S');
    doc.setFontSize(7);
    doc.setFont(font, 'bold');
    doc.setTextColor(...NAVY);
    doc.text(m.labelTr, x + 32, 47, { align: 'center' });
    doc.setFont(font, 'normal');
    doc.setTextColor(...GRAY_DARK);
    doc.setFontSize(6);
    doc.text(m.labelEn, x + 32, 51, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont(font, 'bold');
    doc.setTextColor(...m.color);
    doc.text(m.value, x + 32, 61, { align: 'center' });
  });

  doc.setFontSize(10);
  doc.setFont(font, 'bold');
  doc.setTextColor(...NAVY);
  doc.text('Kategori Bazlı Özet / Category Summary', 14, 78);

  const tableY = 82;
  const cols   = [14, 90, 140, 190, 232, 260];
  const headers = [
    ['Kategori', 'Category'],
    ['Bütçe (TL)', 'Budget'],
    ['Fiili (TL)', 'Actual'],
    ['Fark (TL)', 'Variance'],
    ['%', '%'],
    ['Durum', 'Status'],
  ];

  doc.setFillColor(...NAVY);
  doc.rect(14, tableY, 269, 10, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.setFont(font, 'bold');
  headers.forEach((h, i) => {
    doc.text(h[0], cols[i] + 2, tableY + 5);
    doc.setFontSize(5.5);
    doc.setFont(font, 'normal');
    doc.text(h[1], cols[i] + 2, tableY + 8.5);
    doc.setFontSize(7);
    doc.setFont(font, 'bold');
  });

  data.categories.forEach((cat, idx) => {
    const rowY = tableY + 10 + idx * 9;
    doc.setFillColor(...(idx % 2 === 0 ? GRAY_LIGHT : WHITE));
    doc.rect(14, rowY, 269, 9, 'F');
    doc.setDrawColor(...GRAY_MID);
    doc.setLineWidth(0.1);
    doc.line(14, rowY + 9, 283, rowY + 9);

    doc.setFont(font, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    doc.text(cat.name, cols[0] + 2, rowY + 6);
    doc.text(formatTL(cat.budgetTotal), cols[1] + 2, rowY + 6);
    doc.text(formatTL(cat.actualTotal), cols[2] + 2, rowY + 6);

    doc.setTextColor(...(cat.variance > 0 ? RED : GREEN));
    doc.text(formatTL(cat.variance), cols[3] + 2, rowY + 6);
    doc.text(formatPct(cat.variancePercent), cols[4] + 2, rowY + 6);

    const statusText   = cat.variance > 0 ? 'AŞIM'     : 'TASARRUF';
    const statusTextEn = cat.variance > 0 ? 'OVER'     : 'SAVING';
    doc.setFillColor(...(cat.variance > 0 ? RED : GREEN));
    doc.roundedRect(cols[5] + 2, rowY + 1, 22, 7, 1, 1, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(5.5);
    doc.setFont(font, 'bold');
    doc.text(statusText,   cols[5] + 13, rowY + 4.5, { align: 'center' });
    doc.setFontSize(4.5);
    doc.text(statusTextEn, cols[5] + 13, rowY + 7,   { align: 'center' });
  });
}

function addCategoryPage(doc: jsPDF, cat: CategoryPDFData, data: PDFReportData, pageNum: number, totalPages: number, logoBase64: string) {
  addPageHeader(doc, data.companyName, pageNum, totalPages, logoBase64);
  addPageFooter(doc, data.generatedAt);

  doc.setFillColor(...BLUE);
  doc.rect(14, 22, 269, 12, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  doc.setFont(font, 'bold');
  doc.text(cat.name, 18, 30);
  doc.setFontSize(7);
  doc.setFont(font, 'normal');
  doc.text(cat.nameEn, 18, 31.5);

  const summaryItems = [
    `Bütçe: ${formatTL(cat.budgetTotal)}`,
    `Fiili: ${formatTL(cat.actualTotal)}`,
    `Fark: ${formatTL(cat.variance)}`,
  ];
  doc.setFontSize(6);
  doc.setTextColor(...WHITE);
  summaryItems.forEach((s, i) => doc.text(s, 130 + i * 52, 29));

  doc.setFontSize(8);
  doc.setFont(font, 'bold');
  doc.setTextColor(...NAVY);
  doc.text('Aylık Karşılaştırma / Monthly Comparison', 14, 42);

  const tblY = 45;
  const colW = 21;

  doc.setFillColor(...NAVY);
  doc.rect(14, tblY, 269, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(6);
  doc.setFont(font, 'bold');
  doc.text('Kalem', 16, tblY + 5.5);
  MONTHS_TR.forEach((m, i) => {
    doc.text(m, 42 + i * colW, tblY + 4);
    doc.setFont(font, 'normal');
    doc.setFontSize(5);
    doc.text(MONTHS_EN[i], 42 + i * colW, tblY + 7);
    doc.setFont(font, 'bold');
    doc.setFontSize(6);
  });

  const rows: { label: string; values: number[]; isBold: boolean; isVariance?: boolean }[] = [
    { label: 'Bütçe/Budget',  values: cat.monthlyData.map((m) => m.budget),            isBold: false },
    { label: 'Fiili/Actual',  values: cat.monthlyData.map((m) => m.actual),            isBold: false },
    { label: 'Fark/Variance', values: cat.monthlyData.map((m) => m.actual - m.budget), isBold: true, isVariance: true },
  ];

  rows.forEach((row, ri) => {
    const rowY = tblY + 8 + ri * 8;
    doc.setFillColor(...(ri % 2 === 0 ? GRAY_LIGHT : WHITE));
    doc.rect(14, rowY, 269, 8, 'F');
    doc.setFontSize(6);
    doc.setFont(font, row.isBold ? 'bold' : 'normal');
    doc.setTextColor(...BLACK);
    doc.text(row.label, 16, rowY + 5.5);
    row.values.forEach((v, i) => {
      if (row.isVariance) {
        doc.setTextColor(...(v > 0 ? RED : v < 0 ? GREEN : BLACK));
      } else {
        doc.setTextColor(...BLACK);
      }
      const formatted = v === 0 ? '-' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v);
      doc.text(formatted, 42 + i * colW, rowY + 5.5);
    });
  });

  const totY = tblY + 32;
  doc.setFillColor(...NAVY);
  doc.rect(14, totY, 269, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(6.5);
  doc.setFont(font, 'bold');
  doc.text('TOPLAM / TOTAL', 16, totY + 5.5);
  doc.text(formatTL(cat.budgetTotal), 42, totY + 5.5);
  doc.text(formatTL(cat.actualTotal), 42 + colW, totY + 5.5);
  const varColor: [number, number, number] = cat.variance > 0 ? [255, 180, 180] : [180, 255, 180];
  doc.setTextColor(...varColor);
  doc.text(formatTL(cat.variance) + ' (' + formatPct(cat.variancePercent) + ')', 42 + colW * 2, totY + 5.5);

  if (cat.aiAnalysis) {
    const aiY = totY + 14;
    doc.setFillColor(235, 242, 255);
    doc.roundedRect(14, aiY, 269, 6, 1, 1, 'F');
    doc.setFontSize(8);
    doc.setFont(font, 'bold');
    doc.setTextColor(...NAVY);
    doc.text('Yapay Zeka Sapma Analizi / AI Variance Analysis', 18, aiY + 4.5);

    let curY = aiY + 10;

    doc.setFontSize(7);
    doc.setFont(font, 'bold');
    doc.setTextColor(...NAVY);
    doc.text('Özet / Summary:', 14, curY);
    curY += 5;
    doc.setFont(font, 'normal');
    doc.setTextColor(...BLACK);
    const summaryLines = doc.splitTextToSize(cat.aiAnalysis.summary, 265);
    summaryLines.slice(0, 3).forEach((line: string) => {
      doc.text(line, 14, curY);
      curY += 4;
    });

    curY += 3;
    doc.setFont(font, 'bold');
    doc.setTextColor(...NAVY);
    doc.setFontSize(7);
    doc.text('Etki Dağılımı / Variance Decomposition:', 14, curY);
    curY += 4;

    const effCols = [14, 60, 115, 150, 190];
    const effHeaders = ['Etki Türü/Type', 'Tutar/Amount', 'Katkı/Contribution', 'Açıklama/Description'];
    doc.setFillColor(...NAVY);
    doc.rect(14, curY, 269, 7, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(6);
    effHeaders.forEach((h, i) => doc.text(h, effCols[i] + 2, curY + 4.5));
    curY += 7;

    cat.aiAnalysis.effects.forEach((eff, ei) => {
      doc.setFillColor(...(ei % 2 === 0 ? GRAY_LIGHT : WHITE));
      doc.rect(14, curY, 269, 7, 'F');
      doc.setFontSize(6);
      doc.setFont(font, 'normal');
      doc.setTextColor(...BLACK);
      doc.text(eff.label, effCols[0] + 2, curY + 4.5);
      doc.setTextColor(...(eff.amount > 0 ? RED : GREEN));
      doc.text(formatTL(eff.amount), effCols[1] + 2, curY + 4.5);
      doc.text('%' + Math.abs(eff.contributionPercent).toFixed(1), effCols[2] + 2, curY + 4.5);
      doc.setTextColor(...BLACK);
      const descLines = doc.splitTextToSize(eff.description, 76);
      doc.text(descLines[0] || '', effCols[3] + 2, curY + 4.5);
      curY += 7;
    });

    if (curY < 175) {
      curY += 4;
      doc.setFont(font, 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...NAVY);
      doc.text('Öneriler / Recommendations:', 14, curY);
      curY += 5;
      cat.aiAnalysis.recommendations.slice(0, 3).forEach((rec, ri) => {
        doc.setFont(font, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...BLACK);
        const recLines = doc.splitTextToSize(`${ri + 1}. ${rec}`, 265);
        recLines.slice(0, 2).forEach((line: string) => {
          if (curY < 185) { doc.text(line, 14, curY); curY += 4; }
        });
      });
    }
  }
}

function addDepartmentPage(doc: jsPDF, data: PDFReportData, pageNum: number, totalPages: number, logoBase64: string) {
  if (!data.departments || data.departments.length === 0) return;

  addPageHeader(doc, data.companyName, pageNum, totalPages, logoBase64);
  addPageFooter(doc, data.generatedAt);

  doc.setFontSize(13);
  doc.setFont(font, 'bold');
  doc.setTextColor(...NAVY);
  doc.text('Departman Kırılımı', 14, 28);
  doc.setFontSize(9);
  doc.setFont(font, 'normal');
  doc.setTextColor(...GRAY_DARK);
  doc.text('Department Breakdown', 14, 34);
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.5);
  doc.line(14, 36, 283, 36);

  const tblY = 42;
  const cols = [14, 80, 140, 196, 240];
  const headers = [
    ['Departman', 'Department'],
    ['Bütçe', 'Budget'],
    ['Fiili', 'Actual'],
    ['Fark', 'Variance'],
    ['%', '%'],
  ];

  doc.setFillColor(...NAVY);
  doc.rect(14, tblY, 269, 10, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.setFont(font, 'bold');
  headers.forEach((h, i) => {
    doc.text(h[0], cols[i] + 2, tblY + 5);
    doc.setFontSize(5.5);
    doc.setFont(font, 'normal');
    doc.text(h[1], cols[i] + 2, tblY + 8.5);
    doc.setFontSize(7);
    doc.setFont(font, 'bold');
  });

  data.departments.forEach((dept, idx) => {
    const rowY = tblY + 10 + idx * 10;
    doc.setFillColor(...(idx % 2 === 0 ? GRAY_LIGHT : WHITE));
    doc.rect(14, rowY, 269, 10, 'F');
    doc.setFontSize(7.5);
    doc.setFont(font, 'bold');
    doc.setTextColor(...NAVY);
    doc.text(dept.name, cols[0] + 2, rowY + 6.5);
    doc.setFont(font, 'normal');
    doc.setTextColor(...BLACK);
    doc.text(formatTL(dept.budgetTotal), cols[1] + 2, rowY + 6.5);
    doc.text(formatTL(dept.actualTotal), cols[2] + 2, rowY + 6.5);
    doc.setTextColor(...(dept.variance > 0 ? RED : GREEN));
    doc.text(formatTL(dept.variance), cols[3] + 2, rowY + 6.5);
    doc.text(formatPct(dept.variancePercent), cols[4] + 2, rowY + 6.5);
  });
}

export async function generateBudgetPDF(data: PDFReportData): Promise<void> {
  const logoBase64 = await loadLogo();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  await registerNotoSans(doc);
  const available = doc.getFontList();
  font = available['NotoSans'] ? 'NotoSans' : 'helvetica';

  const totalPages = 2 + data.categories.length + (data.departments && data.departments.length > 0 ? 1 : 0);

  addCoverPage(doc, data, logoBase64);
  doc.addPage();
  addExecutiveSummaryPage(doc, data, 2, totalPages, logoBase64);
  data.categories.forEach((cat, i) => {
    doc.addPage();
    addCategoryPage(doc, cat, data, 3 + i, totalPages, logoBase64);
  });
  if (data.departments && data.departments.length > 0) {
    doc.addPage();
    addDepartmentPage(doc, data, totalPages, totalPages, logoBase64);
  }

  const fileName = `${data.companyCode}_İdari_İşler_Bütçe_${data.period.replace(/\s/g, '_')}.pdf`;
  doc.save(fileName);
}
