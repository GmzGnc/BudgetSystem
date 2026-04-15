'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  BarChart, Bar, LineChart, Line, Cell,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Sun, Moon, Download, Upload, FileSpreadsheet, X, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';

import { CATEGORIES, CATEGORY_COLORS, INDEX_BADGE_COLORS } from '@/data/categories';
import { generateBudgetPDF, generateExecutivePDF } from '@/components/pdf/generateBudgetPDF';
import type { CategoryPDFData, PDFReportData } from '@/components/pdf/generateBudgetPDF';
import ProjectionTab from '@/components/tabs/ProjectionTab';
import SapmaTab from '@/components/tabs/SapmaTab';
import SapTab from '@/components/tabs/SapTab';
import DeptTab from '@/components/tabs/DeptTab';
import { fmt, fmtShort, fmtFull, pctTextColor, sapamaColor, sapamaStatus } from '@/lib/utils';
import { ICA_BUDGET, ICE_BUDGET, GROUP_MONTHLY } from '@/data/budget-data';
import { getSapData, SAP_CATEGORY_COLORS } from '@/data/sap-data';
import type { SapEntry } from '@/data/sap-data';
import { DEPARTMENTS, ICA_DEPT, DEPT_COLORS } from '@/data/department-data';
import type { Department } from '@/data/department-data';
import { getDrillDownData, MONTH_LABELS } from '@/data/drill-down-data';
import type { DrillDownGroup } from '@/data/drill-down-data';
import {
  getCompanies, getFiscalYears, getCategories,
  upsertBudgetEntries, upsertSapEntries, logExcelImport,
  getBudgetMonthlyData, getSapMonthlyData, getBudgetEntriesAsModelRows, CATEGORY_CODE_MAP,
} from '@/lib/db';
import type { BudgetEntry, SapEntry as DbSapEntry } from '@/lib/db';
import {
  totalAnnual, categoryAnnual, monthlyAverage,
  buildProjection2026, variancePct, categoryShare, aggregateMonthly,
} from '@/lib/calculations';
import type { Company, MonthlyEntry, ProjectionCoefficients } from '@/types';

// ─── model gider types & row ranges ─────────────────────────────────────────

interface ModelRow {
  rowNum: number;      // 1-based Excel row number
  paramName: string;   // K column
  unitType: string;    // L column: "TL", "TL Karşılığı", or "" (empty = adet/miktar)
  budget: number[];    // 12 months  N–Y
  actual: number[];    // 12 months  AC–AN
}

const CAT_KEY_PARAMS: Record<string, string[]> = {
  guvenlik:      ['Kişi Sayısı', 'Proje Müdürü', 'Vardiya Amiri', 'Güvenlik Personeli', 'Ücret', 'Toplam'],
  temizlik:      ['Kişi Sayısı', 'Ekip Sorumlusu', 'Personel', 'Ücret', 'Toplam'],
  yemek:         ['Birim fiyat', 'Öğün Sayısı', 'Gün Sayısı', 'Asgari ücret', 'TÜFE', 'ÜFE', 'Gıda Endeksi', 'Toplam'],
  servis:        ['Birim Fiyat', 'TÜFE', 'ÜFE', 'Asgari Ücret', 'Uygulanacak Oran', 'Yakıt artışı', 'Toplam'],
  arac_kira:     ['Araç Sayısı', 'Kira Giderleri', 'Toplam'],
  hgs:           ['Araç Sayısı', 'HGS Giderleri', 'Toplam'],
  arac_yakit:    ['Birim Fiyat', 'Miktar/Litre', 'Araç Sayısı', 'Toplam'],
  arac_bakim:    ['Araç Sayısı', 'Bakım Giderleri', 'Toplam'],
  diger_hizmet:  ['Birim Fiyat', 'Sefer Sayısı', 'Ton', 'Araç Sayısı', 'Litre', 'Toplam'],
  diger_cesitli: ['Toplam'],
};

function isKeyParam(paramName: string, catId: string): boolean {
  const keywords = CAT_KEY_PARAMS[catId];
  if (!keywords) return true;
  const name = paramName.trim();
  if (/Toplam$/i.test(name) && name !== 'Toplam' && !/^TOPLAM$/i.test(name)) return false;
  return keywords.some((kw) => name.toLowerCase().includes(kw.toLowerCase()));
}

/** Excel row ranges for each category (1-based) */
const CAT_ROW_RANGES: Record<string, [number, number]> = {
  guvenlik:      [20,   123],
  temizlik:      [124,  179],
  yemek:         [180,  237],
  servis:        [238,  605],
  arac_kira:     [606,  784],
  hgs:           [785,  966],
  arac_yakit:    [970,  1162],
  arac_bakim:    [1163, 1272],
  diger_hizmet:  [1273, 1336],
  diger_cesitli: [1337, 1376],
};


// ─── default coefficients ────────────────────────────────────────────────────

const DEFAULT_COEFFICIENTS: ProjectionCoefficients = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, parseFloat((1 + c.rate / 100).toFixed(3))]),
);

// ─── main page ───────────────────────────────────────────────────────────────

type Tab = 'overview' | 'projection' | 'sapma' | 'sap' | 'dept';

export default function Home() {
  const [company, setCompany]         = useState<Company>('ICA');
  const [tab, setTab]                 = useState<Tab>('overview');
  const [coefficients, setCoefficients] = useState<ProjectionCoefficients>(DEFAULT_COEFFICIENTS);
  const [dark, setDark]               = useState(false);

  const [selectedDept,     setSelectedDept]     = useState<Department | 'ALL'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // ── drill-down detail table state ──
  const [ddSearch,     setDdSearch]     = useState('');
  const [ddOpenGroups, setDdOpenGroups] = useState<Set<string>>(new Set());
  const [ddShowMore,   setDdShowMore]   = useState<Record<string, number>>({});
  const [ddActiveTab,  setDdActiveTab]  = useState<'detail' | 'variance'>('detail');
  const [varMonth,     setVarMonth]     = useState(0);

  useEffect(() => {
    setDdSearch('');
    setDdOpenGroups(new Set());
    setDdShowMore({});
    setDdActiveTab('detail');
  }, [selectedCategory]);

  // ── model gider import state ──
  const [importedModelData, setImportedModelData] = useState<ModelRow[] | null>(null);

  // ── variance analysis drawer state ──
  const [varDrawerOpen,    setVarDrawerOpen]    = useState(false);
  const [varDrawerLoading, setVarDrawerLoading] = useState(false);
  const [varDrawerResult,  setVarDrawerResult]  = useState<{
    summary: string;
    totalVariance: number;
    direction: 'over' | 'under' | 'on_budget';
    effects: Array<{ name: string; amount: number; explanation: string; driver: string }>;
    monthlyTrend: string;
    recommendations: string[];
    interRelations: string;
    departmentInsights: string;
    monthlyInsights: string;
    karmaEffect: { description: string; dominantFactor: string; secondaryFactor: string };
  } | null>(null);
  const [varDrawerError, setVarDrawerError] = useState<string | null>(null);
  const [isExecPdfLoading,   setIsExecPdfLoading]   = useState(false);
  const [isDetailPdfLoading, setIsDetailPdfLoading] = useState(false);

  // ── DB / Supabase state ──
  const [dbMonthlyData, setDbMonthlyData] = useState<MonthlyEntry[] | null>(null);
  const [dbSapData,     setDbSapData]     = useState<SapEntry[] | null>(null);
  const [dbModelRows,   setDbModelRows]   = useState<Map<string, ModelRow[]> | null>(null);
  const [dbLoading,     setDbLoading]     = useState(true);

  // ── excel import state ──
  const [importOpen,      setImportOpen]      = useState(false);
  const [dragOver,        setDragOver]        = useState(false);
  const [sheets,          setSheets]          = useState<string[]>([]);
  const [selectedSheet,   setSelectedSheet]   = useState('');
  const [importedSapData, setImportedSapData] = useState<SapEntry[] | null>(null);
  const [toast,           setToast]           = useState('');
  const wbRef = useRef<XLSX.WorkBook | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── dark mode bootstrap from localStorage ──
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggleDark = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  // ── DB okuma: company değiştiğinde Supabase'den yükle, yoksa statik JSON kullan ──
  useEffect(() => {
    async function loadFromDb() {
      setDbLoading(true);
      const companyCode = company === 'GRUP' ? 'ICA' : company;
      console.log('[debug] loadFromDb started, company:', companyCode);
      try {
        const [monthlyRes, sapRes, budgetRowsRes] = await Promise.all([
          getBudgetMonthlyData(companyCode),
          getSapMonthlyData(companyCode),
          getBudgetEntriesAsModelRows(companyCode),
        ]);
        setDbMonthlyData(monthlyRes);
        setDbSapData(sapRes);
        console.log('[debug] budgetRowsRes:', budgetRowsRes);
        if (budgetRowsRes) {
          const map = new Map<string, ModelRow[]>();
          budgetRowsRes.forEach(({ categoryCode, rows }) => map.set(categoryCode, rows));
          setDbModelRows(map);
          console.log('[debug] dbModelRows map:', map);
        }
      } catch (e) {
        console.error('[debug] loadFromDb error:', e);
        // DB erişilemiyorsa statik JSON kullan
      } finally {
        setDbLoading(false);
      }
    }
    loadFromDb();
  }, [company]);

  // ── derived data ──
  const monthlyData: MonthlyEntry[] = useMemo(() => {
    // DB'den veri geldiyse onu kullan
    if (dbMonthlyData && dbMonthlyData.length > 0) return dbMonthlyData;
    // Fallback: statik JSON
    if (company === 'ICA')  return ICA_BUDGET.monthlyData;
    if (company === 'ICE')  return ICE_BUDGET.monthlyData;
    return GROUP_MONTHLY;
  }, [company, dbMonthlyData]);

  const projection2026 = useMemo(
    () => buildProjection2026(monthlyData, coefficients),
    [monthlyData, coefficients],
  );

  const total2025  = useMemo(() => totalAnnual(monthlyData), [monthlyData]);
  const total2026  = useMemo(() => totalAnnual(projection2026), [projection2026]);
  const avgMonthly = useMemo(() => monthlyAverage(monthlyData), [monthlyData]);
  const diffPct    = useMemo(() => variancePct(total2025, total2026), [total2025, total2026]);

  const trendData = useMemo(() => {
    const agg25 = aggregateMonthly(monthlyData);
    const agg26 = aggregateMonthly(projection2026);
    return agg25.map((row, i) => ({
      label: row.monthLabel,
      '2025 Gerçekleşen': row.total,
      '2026 Projeksiyon': agg26[i]?.total ?? 0,
    }));
  }, [monthlyData, projection2026]);

  const sapamaData = useMemo(() =>
    CATEGORIES.map((cat) => {
      const t25   = categoryAnnual(monthlyData, cat.id);
      const t26   = categoryAnnual(projection2026, cat.id);
      const pct   = variancePct(t25, t26);
      const diff  = t26 - t25;
      return { id: cat.id, name: cat.name, t25, t26, diff, pct };
    }).sort((a, b) => b.pct - a.pct),
  [monthlyData, projection2026]);

  // ── SAP data: imported > DB > static ──
  const sapData = useMemo(
    () => importedSapData ?? dbSapData ?? getSapData(company),
    [importedSapData, dbSapData, company],
  );

  const sapSummary = useMemo(() => {
    const totalBudget    = sapData.reduce((s, r) => s + r.budget,    0);
    const totalUsed      = sapData.reduce((s, r) => s + r.used,      0);
    const totalRemaining = sapData.reduce((s, r) => s + r.remaining, 0);
    const usagePct       = totalBudget > 0 ? (totalUsed / totalBudget) * 100 : 0;
    return { totalBudget, totalUsed, totalRemaining, usagePct };
  }, [sapData]);

  const sapByCategory = useMemo(() => {
    const map = new Map<string, typeof sapData>();
    for (const row of sapData) {
      const existing = map.get(row.category) ?? [];
      map.set(row.category, [...existing, row]);
    }
    return Array.from(map.entries()).map(([category, rows]) => ({
      category,
      rows,
      budget:    rows.reduce((s, r) => s + r.budget,    0),
      used:      rows.reduce((s, r) => s + r.used,      0),
      remaining: rows.reduce((s, r) => s + r.remaining, 0),
    }));
  }, [sapData]);

  // ── department data (ICA only) ──
  const deptPieData = useMemo(() =>
    DEPARTMENTS.map((dept) => ({
      name: dept,
      value: ICA_DEPT.reduce((s, r) => s + r[dept], 0),
      color: DEPT_COLORS[dept],
    })).filter((d) => d.value > 0)
  , []);

  const deptBarData = useMemo(() => {
    if (selectedDept === 'ALL') {
      return ICA_DEPT.map((row) => {
        const entry: Record<string, number | string> = { name: row.categoryName };
        for (const d of DEPARTMENTS) entry[d] = row[d];
        return entry;
      });
    }
    return ICA_DEPT.map((row) => ({
      name: row.categoryName,
      value: row[selectedDept],
    }));
  }, [selectedDept]);

  const deptGrandTotal = useMemo(() =>
    ICA_DEPT.reduce((s, r) =>
      s + DEPARTMENTS.reduce((ss, d) => ss + r[d], 0), 0)
  , []);

  const companyLabel =
    company === 'ICA' ? 'ICA' :
    company === 'ICE' ? 'ICE' : 'Grup Konsolide';

  const today = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // ── Excel export ──
  const handleExport = useCallback(() => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: 2025 Gerçekleşen
    const months25 = monthlyData.map((r) => r.monthLabel as string);
    const header25 = ['Kategori', ...months25, 'Yıllık Toplam'];
    const rows25   = CATEGORIES.map((cat) => {
      const vals  = monthlyData.map((r) => r[cat.id] as number);
      const total = vals.reduce((s, v) => s + v, 0);
      return [cat.name, ...vals, total];
    });
    const grandRow25 = ['TOPLAM',
      ...monthlyData.map((_, i) =>
        CATEGORIES.reduce((s, cat) => s + (monthlyData[i][cat.id] as number), 0),
      ),
      total2025,
    ];
    const ws25 = XLSX.utils.aoa_to_sheet([header25, ...rows25, grandRow25]);
    XLSX.utils.book_append_sheet(wb, ws25, '2025 Gerçekleşen');

    // Sheet 2: 2026 Projeksiyon
    const months26 = projection2026.map((r) => r.monthLabel as string);
    const header26 = ['Kategori', ...months26, 'Yıllık Toplam', 'Katsayı'];
    const rows26   = CATEGORIES.map((cat) => {
      const vals  = projection2026.map((r) => r[cat.id] as number);
      const total = vals.reduce((s, v) => s + v, 0);
      return [cat.name, ...vals, total, (coefficients[cat.id] ?? 1).toFixed(3)];
    });
    const grandRow26 = ['TOPLAM',
      ...projection2026.map((_, i) =>
        CATEGORIES.reduce((s, cat) => s + (projection2026[i][cat.id] as number), 0),
      ),
      total2026, '',
    ];
    const ws26 = XLSX.utils.aoa_to_sheet([header26, ...rows26, grandRow26]);
    XLSX.utils.book_append_sheet(wb, ws26, '2026 Projeksiyon');

    // Sheet 3: Sapma Analizi
    const headerSap = ['Kategori', '2025 Toplam', '2026 Projeksiyon', 'Fark (TL)', 'Fark (%)', 'Durum'];
    const rowsSap   = sapamaData.map((r) => [
      r.name,
      r.t25,
      r.t26,
      r.diff,
      parseFloat(r.pct.toFixed(2)),
      sapamaStatus(r.pct).label,
    ]);
    const wsSap = XLSX.utils.aoa_to_sheet([headerSap, ...rowsSap]);
    XLSX.utils.book_append_sheet(wb, wsSap, 'Sapma Analizi');

    XLSX.writeFile(wb, `Butce_2025_2026_${companyLabel.replace(' ', '_')}.xlsx`);
  }, [monthlyData, projection2026, coefficients, sapamaData, total2025, total2026, companyLabel]);

  // ── Excel import ──
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const loadWorkbook = useCallback((file: File) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;
      const wb = XLSX.read(data, { type: 'array', cellFormula: true, cellNF: false, cellDates: false });
      wbRef.current = wb;
      setSheets(wb.SheetNames);
      setSelectedSheet(wb.SheetNames[0] ?? '');
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadWorkbook(file);
  }, [loadWorkbook]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadWorkbook(file);
  }, [loadWorkbook]);

  const handleImport = useCallback(async () => {
    const wb = wbRef.current;
    if (!wb || !selectedSheet) return;

    const ws = wb.Sheets[selectedSheet];

    // ── ortak DB lookup yardımcısı ──
    async function resolveDbIds() {
      const [companiesRes, yearsRes, catsRes] = await Promise.all([
        getCompanies(), getFiscalYears(), getCategories(),
      ]);
      const companyCode = company === 'GRUP' ? 'ICA' : company;
      const dbCompany   = companiesRes.data?.find((c) => c.code === companyCode) ?? null;
      const dbYear      = yearsRes.data?.find((y) => y.year === 2025 && y.status === 'active') ?? null;
      const dbCats      = catsRes.data ?? [];
      return { dbCompany, dbYear, dbCats };
    }

    // ── Model Gider sheet handler ──
    if (/model/i.test(selectedSheet)) {
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });
      const parsed: ModelRow[] = [];
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i] as unknown[];
        const paramName = String(row[10] ?? '').trim(); // K column (index 10)
        if (!paramName || paramName.length < 2) continue;
        const unitType = String(row[11] ?? '').trim(); // L column (index 11) — PB
        const toNum = (v: unknown): number => {
          if (typeof v === 'number') return isFinite(v) ? v : 0;
          if (v === null || v === undefined || v === '') return 0;
          // XLSX cell object: { t: 'n', v: 12345, f: '=SUM(...)' }
          if (typeof v === 'object' && v !== null && 'v' in v) {
            const cellVal = (v as { v: unknown }).v;
            if (typeof cellVal === 'number') return isFinite(cellVal) ? cellVal : 0;
          }
          const s = String(v).trim();
          if (s.startsWith('=') || s === '') return 0;
          return parseFloat(s.replace(/[^\d.-]/g, '')) || 0;
        };
        const budget: number[] = [];
        const actual: number[] = [];
        if (i < 3) console.log('[excel] row sample:', row[13], row[14], row[15], 'unitType:', row[11], 'paramName:', row[10]);
        if (parsed.length === 0) {
          console.log('[excel] full row sample (first TL row):', JSON.stringify(row));
          console.log('[excel] row length:', row.length);
        }
        for (let m = 0; m < 12; m++) {
          budget.push(toNum(row[13 + m]));
          actual.push(toNum(row[28 + m]));
        }
        parsed.push({ rowNum: i + 1, paramName, unitType, budget, actual });
      }
      if (parsed.length === 0) { showToast('Model sheet okunamadı — sütunları kontrol edin'); return; }

      // Bütçe değeri kontrolü — formül cache'i boşsa uyar
      const hasBudgetValues = parsed.some((r) => r.budget.some((v) => v !== 0));
      if (!hasBudgetValues) {
        showToast('⚠️ Bütçe değerleri okunamadı. Excel dosyasını Microsoft Excel\'de bir kez açıp kaydedin, sonra tekrar yükleyin.');
        // Yine de devam et — fiili veriler okunmuş olabilir
      }

      // ── state güncelle (önce UI, sonra DB) ──
      const budgetCount = parsed.filter((r) => r.budget.some((v) => v !== 0)).length;
      const actualCount = parsed.filter((r) => r.actual.some((v) => v !== 0)).length;
      const hasActual = parsed.some((r) => r.actual.some((v) => v !== 0));
      setImportedModelData(parsed);
      setImportOpen(false);
      wbRef.current = null; setSheets([]); setSelectedSheet('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      let msg = `✓ ${parsed.length} parametre yüklendi`;
      if (budgetCount === 0) {
        msg += ' — ⚠️ Bütçe değerleri boş! Excel\'i açıp kaydedin.';
      } else {
        msg += ` (${budgetCount} bütçe, ${actualCount} fiili)`;
      }
      if (!hasActual) msg += ' — fiili sütunlar boş';
      showToast(msg);

      // ── DB'ye yaz (best-effort, UI'ı bloklamaz) ──
      void (async () => {
        try {
          const { dbCompany, dbYear, dbCats } = await resolveDbIds();
          if (!dbCompany || !dbYear) return; // DB tabloları henüz kurulmamış

          const entries: BudgetEntry[] = [];
          for (const [catCode, range] of Object.entries(CAT_ROW_RANGES)) {
            const catRows = parsed.filter((r) => r.rowNum >= range[0] && r.rowNum <= range[1]);
            const tlRows  = catRows.filter((r) => /^TL/i.test(r.unitType));
            const mainRow = catRows.find((r) => /^TL/i.test(r.unitType) && /TOPLAM/i.test(r.paramName))
              ?? catRows.find((r) => /^TL/i.test(r.unitType));
            if (!mainRow) continue;
            const dbCat = dbCats.find((c) => (CATEGORY_CODE_MAP[c.name] ?? c.name) === catCode);
            if (!dbCat) continue;
            for (let m = 0; m < 12; m++) {
              const budgetFromToplam = mainRow.budget[m] ?? 0;
              const budgetAmount = budgetFromToplam > 0
                ? budgetFromToplam
                : tlRows.reduce((s, r) => s + (r.budget[m] ?? 0), 0);
              console.log('[excel] pushing entry budget_amount:', budgetAmount, 'actual:', mainRow.actual[m]);
              entries.push({
                company_id:     dbCompany.id,
                fiscal_year_id: dbYear.id,
                category_id:    dbCat.id,
                department_id:  null,
                month:          m + 1,
                budget_amount:  budgetAmount,
                actual_amount:  mainRow.actual[m] ?? 0,
                unit_type:      mainRow.unitType,
              });
            }
          }
          if (entries.length > 0) {
            const res = await upsertBudgetEntries(entries);
            if (res.error) console.warn('[DB] budget_entries upsert:', res.error);
          }
          await logExcelImport({ company_id: dbCompany.id, fiscal_year_id: dbYear.id, sheet_name: selectedSheet, row_count: parsed.length, import_type: 'model' });
        } catch (e) {
          console.warn('[DB] Model import DB write failed:', e);
        }
      })();
      return;
    }

    // ── SAP sheet handler ──
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
    if (rows.length === 0) return;

    const colMap: Record<string, string> = {};
    const TARGET: Record<string, string> = {
      'bütçe kodu': 'code', 'bütce kodu': 'code', 'budget kodu': 'code',
      'bütçe kodu tanımı': 'name', 'bütce kodu tanımı': 'name',
      'bütçe kodu tanimi': 'name', 'bütce kodu tanimi': 'name',
      'orjinal bütçe': 'budget', 'orjinal butce': 'budget', 'orijinal bütçe': 'budget',
      'kalan bütçe': 'remaining', 'kalan butce': 'remaining',
      'fatura giriş tutarı': 'used', 'fatura giris tutari': 'used',
      'fatura tutarı': 'used', 'kullanılan': 'used', 'kullanilan': 'used',
      'kategori': 'category', 'category': 'category',
      'sap kategori': 'category', 'harcama kalemi': 'category',
    };
    for (const key of Object.keys(rows[0])) {
      const norm = key.toLowerCase().trim();
      if (TARGET[norm]) colMap[key] = TARGET[norm];
    }

    function detectCategory(code: string, name: string): string {
      const n = (name + ' ' + code).toUpperCase();
      if (/YEMEK|PERSONEL YEMEK/.test(n))             return 'Yemek';
      if (/ARAÇ KİRA|ARAC KIRA|ARAÇ KİRAL/.test(n))   return 'Araç Kira';
      if (/\bHGS\b/.test(n))                            return 'HGS';
      if (/YAKIT|YAKITI|FUEL/.test(n))                  return 'Araç Yakıt';
      if (/BAKIM|ONARIM|SERVIS|SERVİS/.test(n))         return 'Araç Bakım';
      if (/İÇME SUYU|ICME SUYU|\bSU\b|SU GİD/.test(n)) return 'Su';
      if (/TEMİZLİK|TEMIZLIK|TAŞERON|TASERON/.test(n))  return 'Temizlik';
      if (/^26DE19/.test(code))                          return 'Yemek';
      if (/^26DE21|^26DE07/.test(code))                  return 'Araç Kira';
      if (/^26DE22|^26DE06/.test(code))                  return 'HGS';
      if (/^26DE24|^26DE03/.test(code))                  return 'Araç Yakıt';
      if (/^26DE25|^26DE05/.test(code))                  return 'Araç Bakım';
      if (/^26DE29|^26DE04/.test(code))                  return 'Su';
      if (/^26DE30|^26DE08|^26DE09/.test(code))          return 'Temizlik';
      return 'Diğer Çeşitli';
    }

    const pick = (field: string) => Object.keys(colMap).find((k) => colMap[k] === field) ?? '';

    const parsed: SapEntry[] = [];
    for (const row of rows) {
      const code      = String(row[pick('code')]      ?? '').trim();
      const name      = String(row[pick('name')]      ?? '').trim();
      const budget    = parseFloat(String(row[pick('budget')]    ?? '0').replace(/[^\d.-]/g, '')) || 0;
      const remaining = parseFloat(String(row[pick('remaining')] ?? '0').replace(/[^\d.-]/g, '')) || 0;
      const used      = parseFloat(String(row[pick('used')]      ?? '0').replace(/[^\d.-]/g, '')) || 0;
      const rawCat    = String(row[pick('category')] ?? '').trim();
      const category  = rawCat || detectCategory(code, name);
      if (!code) continue;
      parsed.push({ code, name: name || code, budget, remaining, used, category, company: company === 'GRUP' ? 'ICA' : company });
    }

    if (parsed.length === 0) return;

    // ── state güncelle ──
    setImportedSapData(parsed);
    setImportOpen(false);
    wbRef.current = null; setSheets([]); setSelectedSheet('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast(`✓ ${parsed.length} SAP kodu yüklendi`);

    // ── DB'ye yaz (best-effort) ──
    void (async () => {
      try {
        const { dbCompany, dbYear } = await resolveDbIds();
        if (!dbCompany || !dbYear) return;

        const dbEntries: DbSapEntry[] = parsed.map((p) => ({
          company_id:     dbCompany.id,
          fiscal_year_id: dbYear.id,
          sap_code:       p.code,
          name:           p.name,
          category:       p.category,
          budget:         p.budget,
          used:           p.used,
          remaining:      p.remaining,
        }));
        const res = await upsertSapEntries(dbEntries);
        if (res.error) console.warn('[DB] sap_entries upsert:', res.error);
        await logExcelImport({ company_id: dbCompany.id, fiscal_year_id: dbYear.id, sheet_name: selectedSheet, row_count: parsed.length, import_type: 'sap' });
      } catch (e) {
        console.warn('[DB] SAP import DB write failed:', e);
      }
    })();
  }, [selectedSheet, company, showToast]);

  const closeImport = useCallback(() => {
    setImportOpen(false);
    wbRef.current = null;
    setSheets([]);
    setSelectedSheet('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── tooltip components (inside component to access `dark`) ──
  const BarTooltip = useCallback(({ active, payload, label }: {
    active?: boolean;
    payload?: { name: string; value: number; color: string }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s, p) => s + p.value, 0);
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 text-sm min-w-48">
        <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{fmt(p.value)}</span>
          </div>
        ))}
        <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
          <span>Toplam</span>
          <span>{fmt(total)}</span>
        </div>
      </div>
    );
  }, []);

  const LineTooltip = useCallback(({ active, payload, label }: {
    active?: boolean;
    payload?: { name: string; value: number; color: string }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 text-sm min-w-40">
        <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  }, []);

  const SapamaTooltip = useCallback(({ active, payload }: {
    active?: boolean;
    payload?: { payload: { name: string; pct: number; diff: number } }[];
  }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold text-gray-800 dark:text-gray-100 mb-1">{d.name}</p>
        <p className="text-gray-600 dark:text-gray-300">Artış: <span className="font-bold text-red-500">{d.pct.toFixed(1)}%</span></p>
        <p className="text-gray-600 dark:text-gray-300">Fark: {fmt(d.diff)}</p>
      </div>
    );
  }, []);

  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const gridColor = dark ? '#374151' : '#f0f0f0';

  // ── PDF handler ──
  const handleFullPdf = useCallback(async () => {
    if (isDetailPdfLoading) return;
    setIsDetailPdfLoading(true);

    const CAT_EN: Record<string, string> = {
      'Güvenlik': 'Security', 'Temizlik': 'Cleaning',
      'Yemek': 'Food/Catering', 'Servis/Ulaşım': 'Transportation',
      'Araç Kira': 'Vehicle Rental', 'HGS': 'HGS/Toll',
      'Araç Yakıt': 'Vehicle Fuel', 'Araç Bakım': 'Vehicle Maintenance',
      'Su': 'Water', 'Diğer Hizmet': 'Other Services',
      'Diğer Çeşitli': 'Miscellaneous',
    };

    try {
      // Tüm kategoriler için paralel AI analizi yap
      const aiResults = await Promise.allSettled(
        CATEGORIES.map(async (c) => {
          const cRange = CAT_ROW_RANGES[c.id];
          const cRows = importedModelData
            ? (cRange ? importedModelData.filter((r) => r.rowNum >= cRange[0] && r.rowNum <= cRange[1]) : [])
            : (dbModelRows?.get(c.id) ?? []);
          const cTLRow = cRows.find((r) => /^TL/i.test(r.unitType) && /TOPLAM/i.test(r.paramName))
            ?? cRows.find((r) => /^TL/i.test(r.unitType));

          const monthly = MONTH_LABELS.map((m, mi) => ({
            month: m,
            budget: cTLRow?.budget[mi] ?? 0,
            actual: cTLRow?.actual[mi] ?? 0,
          }));

          const activeMonthIndices = monthly
            .map((m, i) => ({ ...m, i }))
            .filter((m) => m.actual > 0)
            .map((m) => m.i);

          const cActual = activeMonthIndices.reduce((s, i) => s + (cTLRow?.actual[i] ?? 0), 0);
          const cBudget = activeMonthIndices.length > 0
            ? activeMonthIndices.reduce((s, i) => s + (cTLRow?.budget[i] ?? 0), 0)
            : (cTLRow ? cTLRow.budget.reduce((s, v) => s + v, 0) : categoryAnnual(monthlyData, c.id));
          const cVar = cActual - cBudget;
          const cVarPct = cBudget > 0 ? (cVar / cBudget) * 100 : 0;

          const monthBreakdown = monthly.map((m, mi) => {
            const bv = m.budget;
            const av = m.actual;
            const vv = av - bv;
            return { month: m.month, budget: bv, actual: av, variance: vv, variancePct: bv > 0 ? (vv / bv) * 100 : 0 };
          });

          const deptRowAI = ICA_DEPT.find((r) => r.categoryId === c.id);
          const departmentBreakdown = deptRowAI
            ? DEPARTMENTS.map((d) => ({ department: d, budget: deptRowAI[d] ?? 0, actual: deptRowAI[d] ?? 0, variance: 0, variancePct: 0 })).filter((d) => d.budget > 0)
            : [];

          const params = cRows
            .filter((r) => {
              const bv = activeMonthIndices.length > 0
                ? activeMonthIndices.reduce((s, i) => s + r.budget[i], 0)
                : r.budget.reduce((s, v) => s + v, 0);
              const av = activeMonthIndices.reduce((s, i) => s + r.actual[i], 0);
              if (bv === 0 && av === 0) return false;
              const name = r.paramName.trim();
              if (/Toplam$/i.test(name) && name !== 'Toplam' && !/^TOPLAM$/i.test(name)) return false;
              return true;
            })
            .sort((a, b) => (isKeyParam(a.paramName, c.id) ? 0 : 1) - (isKeyParam(b.paramName, c.id) ? 0 : 1))
            .slice(0, 50)
            .map((r) => {
              const bv = activeMonthIndices.length > 0
                ? activeMonthIndices.reduce((s, i) => s + r.budget[i], 0)
                : r.budget.reduce((s, v) => s + v, 0);
              const av = activeMonthIndices.reduce((s, i) => s + r.actual[i], 0);
              const dv = av - bv;
              return { paramName: r.paramName, unitType: r.unitType, budget: bv, actual: av, diff: dv, diffPct: bv > 0 ? (dv / bv) * 100 : null };
            });

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
              activeMonths: activeMonthIndices,
            }),
          });
          const d = await res.json();
          return { catId: c.id, result: d };
        })
      );

      const aiMap = new Map<string, typeof varDrawerResult>();
      aiResults.forEach((r, i) => {
        if (r.status === 'fulfilled' && !r.value.result.error) {
          aiMap.set(CATEGORIES[i].id, r.value.result);
        }
      });

      const pdfCategories: CategoryPDFData[] = CATEGORIES.map((c) => {
        const cRange = CAT_ROW_RANGES[c.id];
        const cRows = importedModelData
          ? (cRange ? importedModelData.filter((r) => r.rowNum >= cRange[0] && r.rowNum <= cRange[1]) : [])
          : (dbModelRows?.get(c.id) ?? []);
        const cTLRow = cRows.find((r) => /^TL/i.test(r.unitType) && /TOPLAM/i.test(r.paramName))
          ?? cRows.find((r) => /^TL/i.test(r.unitType));
        const cMonthly = Array.from({ length: 12 }, (_, mi) => ({
          month: mi + 1,
          budget: cTLRow?.budget[mi] ?? 0,
          actual: cTLRow?.actual[mi] ?? 0,
        }));

        const cActiveIndices = cMonthly.map((m, i) => i).filter((i) => cMonthly[i].actual > 0);

        const cActual = cActiveIndices.reduce((s, i) => s + cMonthly[i].actual, 0);
        const cBudget = cActiveIndices.length > 0
          ? cActiveIndices.reduce((s, i) => s + cMonthly[i].budget, 0)
          : (cTLRow ? cTLRow.budget.reduce((s, v) => s + v, 0) : categoryAnnual(monthlyData, c.id));
        const cVar = cActual - cBudget;
        const cVarPct = cBudget > 0 ? (cVar / cBudget) * 100 : 0;

        const cActiveParams = cRows
          .filter((r) => {
            const bTotal = cActiveIndices.reduce((s, i) => s + r.budget[i], 0);
            const aTotal = cActiveIndices.reduce((s, i) => s + r.actual[i], 0);
            if (bTotal === 0 && aTotal === 0) return false;
            const name = r.paramName.trim();
            if (/Toplam$/i.test(name) && name !== 'Toplam' && !/^TOPLAM$/i.test(name)) return false;
            return true;
          })
          .sort((a, b) => {
            const aKey = isKeyParam(a.paramName, c.id) ? 0 : 1;
            const bKey = isKeyParam(b.paramName, c.id) ? 0 : 1;
            return aKey - bKey;
          })
          .map((r) => {
            const bTotal = cActiveIndices.length > 0
              ? cActiveIndices.reduce((s, i) => s + r.budget[i], 0)
              : r.budget.reduce((s, v) => s + v, 0);
            const aTotal = cActiveIndices.reduce((s, i) => s + r.actual[i], 0);
            const dTotal = aTotal - bTotal;
            return {
              paramName: r.paramName,
              unitType: r.unitType,
              budgetTotal: bTotal,
              actualTotal: aTotal,
              diff: dTotal,
              diffPct: bTotal > 0 ? (dTotal / bTotal) * 100 : null,
              isKey: isKeyParam(r.paramName, c.id),
            };
          });

        const ai = aiMap.get(c.id);
        const aiEff = ai?.effects?.map((eff) => ({
          type: eff.name,
          label: eff.name,
          amount: eff.amount,
          contributionPercent: Math.abs(eff.amount) / (Math.abs(ai.totalVariance) || 1) * 100,
          description: eff.explanation,
        })) ?? [];

        return {
          name: c.name,
          nameEn: CAT_EN[c.name] ?? c.name,
          budgetTotal: cBudget,
          actualTotal: cActual,
          variance: cVar,
          variancePercent: cVarPct,
          monthlyData: cMonthly,
          parameters: cActiveParams,
          aiAnalysis: ai ? {
            summary: ai.summary,
            effects: aiEff,
            monthlyTrend: ai.monthlyTrend,
            recommendations: ai.recommendations,
            interRelations: ai.interRelations,
            departmentInsights: ai.departmentInsights ?? '',
            monthlyInsights: ai.monthlyInsights ?? '',
            karmaEffect: ai.karmaEffect ?? null,
          } : undefined,
        };
      });

      const pdfData: PDFReportData = {
        companyName: companyLabel,
        companyCode: company,
        period: '2025 Yili Butce Karsilastirmasi',
        generatedAt: new Date().toLocaleString('tr-TR'),
        categories: pdfCategories,
      };
      await generateBudgetPDF(pdfData);
    } finally {
      setIsDetailPdfLoading(false);
    }
  }, [importedModelData, monthlyData, companyLabel, company, varDrawerResult, isDetailPdfLoading]);

  // ── render ──
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200">

      {/* ── HEADER ── */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 sm:px-6 py-3 sm:py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          <div>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-0.5">
              İdari İşler Departmanı
            </p>
            <h1 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">
              Bütçe Yönetim Sistemi
            </h1>
            <p className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 mt-0.5 capitalize">{today}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
              <span className="hidden sm:inline">Canlı Veri</span>
            </div>

            {/* Excel import */}
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-sm"
            >
              <Upload size={13} />
              <span className="hidden sm:inline">Excel Yükle</span>
              <span className="sm:hidden">Yükle</span>
            </button>

            {/* Excel export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors shadow-sm"
            >
              <Download size={13} />
              <span className="hidden sm:inline">Excel&apos;e Aktar</span>
              <span className="sm:hidden">Aktar</span>
            </button>

            {/* Dark mode toggle */}
            <button
              onClick={toggleDark}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              aria-label="Dark mode toggle"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-6 space-y-3 sm:space-y-6">

        {/* ── COMPANY SELECTOR ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['ICA', 'ICE', 'GRUP'] as Company[]).map((c) => (
            <button
              key={c}
              onClick={() => setCompany(c)}
              className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                company === c
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {c === 'GRUP' ? <span><span className="sm:hidden">Grup</span><span className="hidden sm:inline">Grup Konsolide</span></span> : c}
            </button>
          ))}
          {dbLoading && (
            <span className="flex items-center gap-1 text-[10px] text-indigo-500 dark:text-indigo-400">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
              DB senkronize ediliyor
            </span>
          )}
          {!dbLoading && dbMonthlyData && (
            <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Supabase
            </span>
          )}
        </div>

        {/* ── METRIC CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: '2025 Toplam',      value: fmt(total2025),   sub: `${companyLabel} · Yıllık`,   cls: 'text-gray-900 dark:text-white' },
            { label: '2026 Projeksiyon', value: fmt(total2026),   sub: `${companyLabel} · Tahmini`,  cls: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Aylık Ortalama',   value: fmt(avgMonthly),  sub: `${companyLabel} · 2025`,     cls: 'text-gray-900 dark:text-white' },
            {
              label: 'Fark (25→26)',
              value: `${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%`,
              sub: `${fmt(Math.abs(total2026 - total2025))} artış`,
              cls: pctTextColor(diffPct),
            },
          ].map(({ label, value, sub, cls }) => (
            <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
              <p className={`text-xl sm:text-2xl font-bold mt-1 ${cls}`}>{value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── TABS ── */}
        <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 gap-4 sm:gap-6 -mx-2 sm:mx-0 px-2 sm:px-0 scrollbar-hide">
          {([
            { key: 'overview',   label: 'Genel Bakış' },
            { key: 'projection', label: 'Projeksiyon' },
            { key: 'sapma',      label: 'Sapma' },
            { key: 'sap',        label: 'SAP Takip' },
            { key: 'dept',       label: 'Departman' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                tab === key
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ══════════ OVERVIEW TAB ══════════ */}
        {tab === 'overview' && (
          <div className="space-y-6">

            {/* stacked bar chart */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
                2025 Aylık Gider Dağılımı — {companyLabel}
              </h2>
              <div className="h-48 sm:h-72 lg:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 4, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} width={68} />
                  <Tooltip content={<BarTooltip />} />
                  <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8, color: axisColor }} />
                  {CATEGORIES.map((cat) => (
                    <Bar key={cat.id} dataKey={cat.id} name={cat.name} stackId="a" fill={CATEGORY_COLORS[cat.id]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>

            {/* category table */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Kategori Bazlı 2025 Özeti — {companyLabel}
                  </h2>
                  <span className="text-xs text-gray-400 dark:text-gray-500">Detay için kategoriye tıklayın</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Yönetici Özeti PDF */}
                  <button
                    disabled={isExecPdfLoading || isDetailPdfLoading}
                    onClick={async () => {
                      if (!importedModelData) {
                        alert('Önce Model Excel dosyasını yükleyin.');
                        return;
                      }
                      setIsExecPdfLoading(true);
                      try {
                        const CAT_EN: Record<string, string> = {
                          'Güvenlik': 'Security', 'Temizlik': 'Cleaning',
                          'Yemek': 'Food/Catering', 'Servis/Ulaşım': 'Transportation',
                          'Araç Kira': 'Vehicle Rental', 'HGS': 'HGS/Toll',
                          'Araç Yakıt': 'Vehicle Fuel', 'Araç Bakım': 'Vehicle Maintenance',
                          'Su': 'Water', 'Diğer Hizmet': 'Other Services',
                          'Diğer Çeşitli': 'Miscellaneous',
                        };

                        const aiResults = await Promise.allSettled(
                          CATEGORIES.map(async (c) => {
                            const cRange = CAT_ROW_RANGES[c.id];
                            const cRows = importedModelData
                              ? (cRange ? importedModelData.filter((r) => r.rowNum >= cRange[0] && r.rowNum <= cRange[1]) : [])
                              : (dbModelRows?.get(c.id) ?? []);
                            const cTLRow = cRows.find((r) => /^TL/i.test(r.unitType) && /TOPLAM/i.test(r.paramName)) ?? cRows.find((r) => /^TL/i.test(r.unitType));
                            const cMonthly = Array.from({ length: 12 }, (_, mi) => ({ month: MONTH_LABELS[mi], budget: cTLRow?.budget[mi] ?? 0, actual: cTLRow?.actual[mi] ?? 0 }));
                            const activeIdxs = cMonthly.map((_, i) => i).filter((i) => cMonthly[i].actual > 0);
                            const activeBudget = activeIdxs.length > 0 ? activeIdxs.reduce((s, i) => s + cMonthly[i].budget, 0) : (cTLRow?.budget.reduce((s, v) => s + v, 0) ?? 0);
                            const activeActual = activeIdxs.reduce((s, i) => s + cMonthly[i].actual, 0);
                            const activeVar = activeActual - activeBudget;
                            const activeVarPct = activeBudget > 0 ? (activeVar / activeBudget) * 100 : 0;
                            const params = cRows
                              .filter((r) => {
                                const bv = activeIdxs.length > 0 ? activeIdxs.reduce((s, i) => s + r.budget[i], 0) : r.budget.reduce((s, v) => s + v, 0);
                                const av = activeIdxs.reduce((s, i) => s + r.actual[i], 0);
                                if (bv === 0 && av === 0) return false;
                                const name = r.paramName.trim();
                                if (/Toplam$/i.test(name) && name !== 'Toplam' && !/^TOPLAM$/i.test(name)) return false;
                                return true;
                              })
                              .sort((a, b) => (isKeyParam(a.paramName, c.id) ? 0 : 1) - (isKeyParam(b.paramName, c.id) ? 0 : 1))
                              .slice(0, 50)
                              .map((r) => {
                                const bv = activeIdxs.length > 0 ? activeIdxs.reduce((s, i) => s + r.budget[i], 0) : r.budget.reduce((s, v) => s + v, 0);
                                const av = activeIdxs.reduce((s, i) => s + r.actual[i], 0);
                                return { paramName: r.paramName, unitType: r.unitType, budget: bv, actual: av, diff: av - bv, diffPct: bv > 0 ? ((av - bv) / bv) * 100 : null };
                              });
                            const res = await fetch('/api/analyze-variance', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ mode: 'category', categoryName: c.name, budgetTotal: activeBudget, actualTotal: activeActual, varianceAmount: activeVar, variancePercent: activeVarPct, monthlyData: cMonthly, parameters: params, activeMonths: activeIdxs, analysisScope: 'full' }),
                            });
                            const d = await res.json();
                            return { catId: c.id, result: d };
                          })
                        );

                        const aiMap = new Map<string, { summary: string; effects: { name: string; amount: number; explanation: string; driver: string }[]; monthlyTrend: string; recommendations: string[]; interRelations: string; departmentInsights: string; monthlyInsights: string; karmaEffect: { description: string; dominantFactor: string; secondaryFactor: string } | null; totalVariance: number }>();
                        aiResults.forEach((r, i) => {
                          if (r.status === 'fulfilled' && !r.value.result.error) aiMap.set(CATEGORIES[i].id, r.value.result);
                        });

                        const pdfCategories: CategoryPDFData[] = CATEGORIES.map((c) => {
                          const cRange = CAT_ROW_RANGES[c.id];
                          const cRows = importedModelData
                            ? (cRange ? importedModelData.filter((r) => r.rowNum >= cRange[0] && r.rowNum <= cRange[1]) : [])
                            : (dbModelRows?.get(c.id) ?? []);
                          const cTLRow = cRows.find((r) => /^TL/i.test(r.unitType) && /TOPLAM/i.test(r.paramName)) ?? cRows.find((r) => /^TL/i.test(r.unitType));
                          const cMonthly = Array.from({ length: 12 }, (_, mi) => ({ month: mi + 1, budget: cTLRow?.budget[mi] ?? 0, actual: cTLRow?.actual[mi] ?? 0 }));
                          const cActiveIndices = cMonthly.map((_, i) => i).filter((i) => cMonthly[i].actual > 0);
                          const cActual = cActiveIndices.reduce((s, i) => s + cMonthly[i].actual, 0);
                          const cBudget = cActiveIndices.length > 0 ? cActiveIndices.reduce((s, i) => s + cMonthly[i].budget, 0) : (cTLRow?.budget.reduce((s, v) => s + v, 0) ?? categoryAnnual(monthlyData, c.id));
                          const cVar = cActual - cBudget;
                          const cVarPct = cBudget > 0 ? (cVar / cBudget) * 100 : 0;
                          const cActiveParams = cRows
                            .filter((r) => {
                              const bTotal = cActiveIndices.reduce((s, i) => s + r.budget[i], 0);
                              const aTotal = cActiveIndices.reduce((s, i) => s + r.actual[i], 0);
                              if (bTotal === 0 && aTotal === 0) return false;
                              const name = r.paramName.trim();
                              if (/Toplam$/i.test(name) && name !== 'Toplam' && !/^TOPLAM$/i.test(name)) return false;
                              return true;
                            })
                            .sort((a, b) => {
                              const aKey = isKeyParam(a.paramName, c.id) ? 0 : 1;
                              const bKey = isKeyParam(b.paramName, c.id) ? 0 : 1;
                              return aKey - bKey;
                            })
                            .map((r) => {
                              const bTotal = cActiveIndices.length > 0 ? cActiveIndices.reduce((s, i) => s + r.budget[i], 0) : r.budget.reduce((s, v) => s + v, 0);
                              const aTotal = cActiveIndices.reduce((s, i) => s + r.actual[i], 0);
                              const dTotal = aTotal - bTotal;
                              return { paramName: r.paramName, unitType: r.unitType, budgetTotal: bTotal, actualTotal: aTotal, diff: dTotal, diffPct: bTotal > 0 ? (dTotal / bTotal) * 100 : null, isKey: isKeyParam(r.paramName, c.id) };
                            });
                          const ai = aiMap.get(c.id);
                          const aiEff = ai?.effects?.map((eff) => ({ type: eff.name, label: eff.name, amount: eff.amount, contributionPercent: Math.abs(eff.amount) / (Math.abs(ai.totalVariance) || 1) * 100, description: eff.explanation, driver: eff.driver })) ?? [];
                          return {
                            name: c.name, nameEn: CAT_EN[c.name] ?? c.name,
                            budgetTotal: cBudget, actualTotal: cActual, variance: cVar, variancePercent: cVarPct,
                            monthlyData: cMonthly, parameters: cActiveParams,
                            aiAnalysis: ai ? { summary: ai.summary, effects: aiEff, monthlyTrend: ai.monthlyTrend, recommendations: ai.recommendations, interRelations: ai.interRelations, departmentInsights: ai.departmentInsights ?? '', monthlyInsights: ai.monthlyInsights ?? '', karmaEffect: ai.karmaEffect ?? null } : undefined,
                          };
                        });

                        await generateExecutivePDF({
                          companyName: companyLabel,
                          companyCode: company,
                          period: '2025 Yonetici Ozeti',
                          generatedAt: new Date().toLocaleString('tr-TR'),
                          categories: pdfCategories,
                        });
                      } finally {
                        setIsExecPdfLoading(false);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition-colors"
                  >
                    {isExecPdfLoading ? (
                      <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    )}
                    {isExecPdfLoading ? 'Hazirlaniyor...' : 'Yonetici Ozeti PDF'}
                  </button>

                  {/* Detay Rapor PDF */}
                  <button
                    disabled={isDetailPdfLoading || isExecPdfLoading}
                    onClick={async () => {
                      if (!importedModelData) {
                        alert('Önce Model Excel dosyasını yükleyin.');
                        return;
                      }
                      await handleFullPdf();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1e2a4a] hover:bg-[#263461] disabled:opacity-50 text-white shadow-sm transition-colors"
                  >
                    {isDetailPdfLoading ? (
                      <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    )}
                    {isDetailPdfLoading ? 'Hazirlaniyor...' : 'Detay Rapor PDF'}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kategori</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Yıllık Toplam</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pay %</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Endeks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATEGORIES.map((cat) => {
                      const catTotal    = categoryAnnual(monthlyData, cat.id);
                      const share       = categoryShare(catTotal, total2025);
                      const isOpen      = selectedCategory === cat.id;
                      const catColor    = CATEGORY_COLORS[cat.id];

                      // ── drill-down hesaplamalar ──
                      const t25 = catTotal;
                      const t26 = categoryAnnual(projection2026, cat.id);
                      const diff = t26 - t25;
                      const diffPctCat = variancePct(t25, t26);

                      const catTrendData = monthlyData.map((m) => ({
                        month: m.monthLabel as string,
                        value: m[cat.id] as number,
                      }));

                      const deptRow = ICA_DEPT.find((r) => r.categoryId === cat.id);

                      // GRUP için ICE toplamı = Grup - ICA
                      const icaTotal = deptRow
                        ? DEPARTMENTS.reduce((s, d) => s + deptRow[d], 0)
                        : categoryAnnual(ICA_BUDGET.monthlyData, cat.id);

                      const deptBarData = deptRow
                        ? DEPARTMENTS.map((d) => ({ name: d, value: deptRow[d], color: DEPT_COLORS[d] })).filter((d) => d.value > 0)
                        : [];

                      const showDept = (company === 'ICA' || company === 'GRUP') && deptRow;

                      return (
                        <React.Fragment key={cat.id}>
                          {/* ── tıklanabilir satır ── */}
                          <tr
                            onClick={() => setSelectedCategory(isOpen ? null : cat.id)}
                            className={`cursor-pointer transition-colors border-b border-gray-50 dark:border-gray-800 ${
                              isOpen
                                ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                            }`}
                            style={isOpen ? { borderLeft: `3px solid ${catColor}` } : { borderLeft: '3px solid transparent' }}
                          >
                            <td className="px-4 py-3 flex items-center gap-2">
                              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: catColor }} />
                              <span className={`font-medium ${isOpen ? 'text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200'}`}>
                                {cat.name}
                              </span>
                              <span className={`ml-1 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                                ▾
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{fmtFull(catTotal)}</td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                  <div className="h-1.5 rounded-full" style={{ width: `${share}%`, backgroundColor: catColor }} />
                                </div>
                                <span className="text-gray-700 dark:text-gray-300 w-10 text-right">{share.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${INDEX_BADGE_COLORS[cat.indexType]}`}>
                                {cat.indexType}
                              </span>
                            </td>
                          </tr>

                          {/* ── drill-down panel (grid-rows trick) ── */}
                          <tr>
                            <td colSpan={4} className="p-0 border-0">
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                                  transition: 'grid-template-rows 0.3s ease',
                                }}
                              >
                                <div className="overflow-hidden">
                                  <div
                                    className="bg-gray-50 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-700 p-4 sm:p-5 space-y-5"
                                    style={{ borderLeft: `3px solid ${catColor}` }}
                                  >
                                    {/* panel başlık */}
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="w-4 h-4 rounded" style={{ backgroundColor: catColor }} />
                                          <h3 className="text-base font-bold text-gray-900 dark:text-white">{cat.name}</h3>
                                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${INDEX_BADGE_COLORS[cat.indexType]}`}>
                                            {cat.indexType}
                                          </span>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          {companyLabel} · 2025 Yıllık Kırılım
                                        </p>
                                      </div>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedCategory(null); }}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                                      >
                                        <X size={15} />
                                      </button>
                                    </div>

                                    {/* 2025 vs 2026 karşılaştırma kartları */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                      {[
                                        { label: '2025 Gerçekleşen', value: fmtFull(t25), cls: 'text-gray-900 dark:text-white' },
                                        { label: '2026 Projeksiyon', value: fmtFull(t26), cls: 'text-indigo-600 dark:text-indigo-400' },
                                        { label: 'Fark (TL)',        value: `+${fmtFull(diff)}`, cls: 'text-red-500 dark:text-red-400' },
                                        { label: 'Fark (%)',         value: `+${diffPctCat.toFixed(1)}%`, cls: diffPctCat >= 25 ? 'text-red-500 dark:text-red-400' : diffPctCat >= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400' },
                                      ].map(({ label, value, cls }) => (
                                        <div key={label} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 shadow-sm">
                                          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
                                          <p className={`text-sm font-bold mt-0.5 font-mono ${cls}`}>{value}</p>
                                        </div>
                                      ))}
                                    </div>

                                    {/* grafikler */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                                      {/* aylık trend */}
                                      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
                                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">Aylık Trend — 2025</p>
                                        <ResponsiveContainer width="100%" height={180}>
                                          <LineChart data={catTrendData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                            <XAxis dataKey="month" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
                                            <YAxis tickFormatter={fmt} tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} width={52} />
                                            <Tooltip
                                              formatter={(v) => [fmtFull(Number(v)), cat.name]}
                                              contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 6, fontSize: 11 }}
                                            />
                                            <Line type="monotone" dataKey="value" stroke={catColor} strokeWidth={2} dot={{ r: 2.5, fill: catColor }} activeDot={{ r: 4 }} />
                                          </LineChart>
                                        </ResponsiveContainer>
                                      </div>

                                      {/* departman bar chart */}
                                      {showDept && deptBarData.length > 0 ? (
                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
                                          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">
                                            Departman Dağılımı — ICA
                                          </p>
                                          <ResponsiveContainer width="100%" height={180}>
                                            <BarChart layout="vertical" data={deptBarData} margin={{ top: 0, right: 52, bottom: 0, left: 8 }}>
                                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                                              <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
                                              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} width={62} />
                                              <Tooltip
                                                formatter={(v) => [fmtFull(Number(v)), 'Tutar']}
                                                contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 6, fontSize: 11 }}
                                              />
                                              <Bar dataKey="value" radius={[0, 3, 3, 0]}
                                                label={{ position: 'right', formatter: (v: unknown) => fmt(v as number), fontSize: 9, fill: axisColor }}
                                              >
                                                {deptBarData.map((d) => (
                                                  <Cell key={d.name} fill={d.color} />
                                                ))}
                                              </Bar>
                                            </BarChart>
                                          </ResponsiveContainer>
                                        </div>
                                      ) : company === 'ICE' ? (
                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm flex items-center justify-center">
                                          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                                            ICE için departman kırılımı<br />bulunmamaktadır
                                          </p>
                                        </div>
                                      ) : (
                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm flex items-center justify-center">
                                          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                                            Bu kategori için departman<br />verisi bulunmuyor
                                          </p>
                                        </div>
                                      )}
                                    </div>

                                    {/* ── inner tab bar: Aylık Detay / Varyans Analizi ── */}
                                    <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 -mx-4 sm:-mx-5 px-4 sm:px-5">
                                      {(['detail', 'variance'] as const).map((t) => (
                                        <button
                                          key={t}
                                          onClick={(e) => { e.stopPropagation(); setDdActiveTab(t); }}
                                          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                                            ddActiveTab === t
                                              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                                              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                          }`}
                                        >
                                          {t === 'detail' ? 'Aylık Detay' : 'Varyans Analizi'}
                                        </button>
                                      ))}
                                    </div>

                                    {/* ── TAB: Aylık Detay ── */}
                                    {ddActiveTab === 'detail' && (<>

                                    {/* aylık alt kalem detay tablosu — collapse/expand gruplar */}
                                    {(() => {
                                      const groups: DrillDownGroup[] = getDrillDownData(cat.id, company);
                                      if (!groups.length) return null;

                                      const searchLower = ddSearch.trim().toLowerCase();

                                      return (
                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                          {/* başlık + arama */}
                                          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center gap-2">
                                            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                                              Aylık Alt Kalem Detayı
                                            </p>
                                            <input
                                              type="text"
                                              placeholder="Alt kalem ara..."
                                              value={ddSearch}
                                              onChange={(e) => { setDdSearch(e.target.value); setDdShowMore({}); }}
                                              onClick={(e) => e.stopPropagation()}
                                              className="flex-1 text-xs px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-indigo-400 dark:focus:border-indigo-500"
                                            />
                                          </div>

                                          {/* gruplar */}
                                          {groups.map((group) => {
                                            const isGroupOpen = ddOpenGroups.has(group.department);
                                            const filtered = searchLower
                                              ? group.items.filter((it) => it.name.toLowerCase().includes(searchLower))
                                              : group.items;
                                            if (searchLower && filtered.length === 0) return null;

                                            const showCount  = ddShowMore[group.department] ?? 20;
                                            const visible    = filtered.slice(0, showCount);
                                            const remaining  = filtered.length - showCount;
                                            const groupAnnual = group.total.reduce((s, v) => s + v, 0);

                                            return (
                                              <div key={group.department} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                                {/* grup başlık butonu */}
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDdOpenGroups((prev) => {
                                                      const next = new Set(prev);
                                                      if (next.has(group.department)) next.delete(group.department);
                                                      else next.add(group.department);
                                                      return next;
                                                    });
                                                  }}
                                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                                                >
                                                  <span
                                                    className="text-gray-400 dark:text-gray-500 text-[10px] transition-transform duration-200 flex-shrink-0"
                                                    style={{ display: 'inline-block', transform: isGroupOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                                                  >
                                                    ▶
                                                  </span>
                                                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex-1 text-left">
                                                    {group.department}
                                                  </span>
                                                  <span className="text-xs text-gray-400 dark:text-gray-500">
                                                    {group.items.length} kalem
                                                  </span>
                                                  <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-200 ml-3">
                                                    {fmtShort(groupAnnual)}
                                                  </span>
                                                </button>

                                                {/* açık iken: tablo */}
                                                {isGroupOpen && (
                                                  <div className="border-t border-gray-100 dark:border-gray-800">
                                                    <div className="overflow-x-auto">
                                                      <table className="w-full min-w-[900px] text-xs">
                                                        <thead className="bg-gray-50 dark:bg-gray-800/60">
                                                          <tr>
                                                            <th className="px-4 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide min-w-[180px]">
                                                              Alt Kalem
                                                            </th>
                                                            {MONTH_LABELS.map((m) => (
                                                              <th key={m} className="px-1.5 py-2 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide min-w-[52px]">
                                                                {m}
                                                              </th>
                                                            ))}
                                                            <th className="px-3 py-2 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide min-w-[72px]">
                                                              Yıllık
                                                            </th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                                          {visible.map((item) => {
                                                            const annual = item.monthly.reduce((s, v) => s + v, 0);
                                                            return (
                                                              <tr key={item.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                                                <td className="px-4 pl-7 py-1.5 text-gray-700 dark:text-gray-300">
                                                                  {item.name}
                                                                </td>
                                                                {item.monthly.map((v, mi) => (
                                                                  <td key={mi} className="px-1.5 py-1.5 text-right font-mono text-gray-600 dark:text-gray-400">
                                                                    {fmtShort(v)}
                                                                  </td>
                                                                ))}
                                                                <td className="px-3 py-1.5 text-right font-mono font-semibold text-gray-800 dark:text-gray-200">
                                                                  {fmtShort(annual)}
                                                                </td>
                                                              </tr>
                                                            );
                                                          })}
                                                        </tbody>
                                                        <tfoot>
                                                          <tr
                                                            className="border-t-2 border-gray-200 dark:border-gray-600"
                                                            style={{ backgroundColor: `${catColor}18` }}
                                                          >
                                                            <td className="px-4 pl-7 py-2 font-bold text-gray-900 dark:text-white">
                                                              Grup Toplamı
                                                            </td>
                                                            {group.total.map((v, mi) => (
                                                              <td key={mi} className="px-1.5 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">
                                                                {fmtShort(v)}
                                                              </td>
                                                            ))}
                                                            <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">
                                                              {fmtShort(groupAnnual)}
                                                            </td>
                                                          </tr>
                                                        </tfoot>
                                                      </table>
                                                    </div>
                                                    {/* daha fazla göster */}
                                                    {remaining > 0 && (
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setDdShowMore((prev) => ({
                                                            ...prev,
                                                            [group.department]: showCount + 20,
                                                          }));
                                                        }}
                                                        className="w-full py-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors border-t border-gray-100 dark:border-gray-800"
                                                      >
                                                        Daha Fazla Göster ({remaining} kalem daha)
                                                      </button>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    })()}

                                    {/* departman detay tablosu */}
                                    {showDept && deptRow && (
                                      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Departman Detayı</p>
                                          {company === 'GRUP' && (
                                            <span className="text-xs text-amber-600 dark:text-amber-400">ICA kırılımı gösteriliyor</span>
                                          )}
                                        </div>
                                        <div className="overflow-x-auto">
                                          <table className="w-full min-w-[380px] text-xs">
                                            <thead className="bg-gray-50 dark:bg-gray-800">
                                              <tr>
                                                {['Departman','Yıllık Tutar','Pay %','Aylık Ort.'].map((h, i) => (
                                                  <th key={h} className={`px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                              {DEPARTMENTS.map((dept) => {
                                                const val = deptRow[dept];
                                                if (val === 0) return null;
                                                const deptShare = icaTotal > 0 ? (val / icaTotal) * 100 : 0;
                                                return (
                                                  <tr key={dept} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                    <td className="px-4 py-2 flex items-center gap-1.5">
                                                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: DEPT_COLORS[dept] }} />
                                                      <span className="font-medium text-gray-800 dark:text-gray-200">{dept}</span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">{fmtFull(val)}</td>
                                                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{deptShare.toFixed(1)}%</td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{fmtFull(Math.round(val / 12))}</td>
                                                  </tr>
                                                );
                                              })}
                                              {/* GRUP ise ICE toplamı ek satır */}
                                              {company === 'GRUP' && (() => {
                                                const iceVal = catTotal - icaTotal;
                                                if (iceVal <= 0) return null;
                                                const iceShare = catTotal > 0 ? (iceVal / catTotal) * 100 : 0;
                                                return (
                                                  <tr className="bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                                                    <td className="px-4 py-2 flex items-center gap-1.5">
                                                      <span className="w-2 h-2 rounded-sm flex-shrink-0 bg-blue-400" />
                                                      <span className="font-medium text-blue-700 dark:text-blue-300">ICE Toplam</span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono text-blue-700 dark:text-blue-300">{fmtFull(iceVal)}</td>
                                                    <td className="px-4 py-2 text-right text-blue-600 dark:text-blue-400">{iceShare.toFixed(1)}%</td>
                                                    <td className="px-4 py-2 text-right font-mono text-blue-600 dark:text-blue-400">{fmtFull(Math.round(iceVal / 12))}</td>
                                                  </tr>
                                                );
                                              })()}
                                            </tbody>
                                            <tfoot className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                                              <tr>
                                                <td className="px-4 py-2 font-bold text-gray-800 dark:text-gray-100">
                                                  {company === 'GRUP' ? 'Grup Toplam' : 'ICA Toplam'}
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold font-mono text-gray-900 dark:text-white">{fmtFull(catTotal)}</td>
                                                <td className="px-4 py-2 text-right font-bold text-gray-700 dark:text-gray-300">100%</td>
                                                <td className="px-4 py-2 text-right font-bold font-mono text-gray-700 dark:text-gray-300">{fmtFull(Math.round(catTotal / 12))}</td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      </div>
                                    )}

                                    </>) /* end Aylık Detay tab */}

                                    {/* ── TAB: Varyans Analizi ── */}
                                    {ddActiveTab === 'variance' && (() => {
                                      if (!importedModelData) {
                                        return (
                                          <div className="bg-white dark:bg-gray-900 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Varyans analizi için Excel dosyasını yükleyin</p>
                                            <p className="text-xs text-gray-400 dark:text-gray-500">Model Gider sheet seçin — fiili sütunlar (AC–AN) dolu olmalı</p>
                                          </div>
                                        );
                                      }

                                      const range = CAT_ROW_RANGES[cat.id];
                                      const catRows = importedModelData
                                        ? (range ? importedModelData.filter((r) => r.rowNum >= range[0] && r.rowNum <= range[1]) : importedModelData)
                                        : (dbModelRows?.get(cat.id) ?? []);

                                      if (catRows.length === 0) {
                                        return (
                                          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
                                            <p className="text-sm text-gray-400">Bu kategori için satır aralığında veri bulunamadı</p>
                                          </div>
                                        );
                                      }

                                      // ── row classifiers (L sütununa göre) ──
                                      const isTLRow  = (r: ModelRow) => /^TL/i.test(r.unitType);
                                      const isToplam = (r: ModelRow) => /TOPLAM/i.test(r.paramName);

                                      // ── değer formatlayıcılar ──
                                      const fmtVal = (n: number, r: ModelRow): string => {
                                        if (n === 0) return '—';
                                        if (isTLRow(r)) {
                                          if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
                                          if (n >= 1_000)     return `₺${(n / 1_000).toFixed(0)}B`;
                                          return `₺${n.toFixed(0)}`;
                                        }
                                        // miktar/oran — ₺ yok
                                        if (n >= 1_000) return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
                                        return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
                                      };

                                      const fmtDiffVal = (n: number, r: ModelRow): string => {
                                        const sign = n >= 0 ? '+' : '-';
                                        const abs = Math.abs(n);
                                        if (isTLRow(r)) {
                                          if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toFixed(1)}M`;
                                          if (abs >= 1_000)     return `${sign}₺${(abs / 1_000).toFixed(0)}B`;
                                          return `${sign}₺${abs.toFixed(0)}`;
                                        }
                                        return `${sign}${abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(2)}`;
                                      };

                                      // ── ana kategori toplam satırı (özet kartlar + trend için) ──
                                      const mainTotalRow = catRows.find((r) => isTLRow(r) && isToplam(r)) ?? catRows.find(isTLRow) ?? catRows[0];

                                      // ── departman toplam satırları (top-5 grafik için — ana toplam hariç) ──
                                      const deptTotalRows = catRows.filter((r) => isTLRow(r) && isToplam(r) && r !== mainTotalRow);

                                      const hasActual = (mainTotalRow?.actual ?? []).some((v) => v !== 0);
                                      const monthsWithData = hasActual
                                        ? MONTH_LABELS.map((_, mi) => (mainTotalRow?.actual[mi] ?? 0) !== 0 ? mi : -1).filter((mi) => mi >= 0)
                                        : [];

                                      const safeMonth = monthsWithData.includes(varMonth)
                                        ? varMonth
                                        : (monthsWithData[monthsWithData.length - 1] ?? 0);

                                      const budgetTotal = mainTotalRow?.budget[safeMonth] ?? 0;
                                      const actualTotal = mainTotalRow?.actual[safeMonth] ?? 0;
                                      const diffTotal   = actualTotal - budgetTotal;
                                      const diffPctVar  = budgetTotal > 0 ? (diffTotal / budgetTotal) * 100 : 0;

                                      // top 5 sapma — sadece departman toplam satırları
                                      const top5 = [...deptTotalRows]
                                        .map((r) => ({
                                          name: r.paramName.length > 22 ? r.paramName.slice(0, 22) + '…' : r.paramName,
                                          diff: Math.abs(r.actual[safeMonth] - r.budget[safeMonth]),
                                          raw:  r.actual[safeMonth] - r.budget[safeMonth],
                                        }))
                                        .filter((r) => r.diff > 0)
                                        .sort((a, b) => b.diff - a.diff)
                                        .slice(0, 5);

                                      // trend — sadece ana toplam satırı
                                      const trendVarData = MONTH_LABELS.map((label, mi) => ({
                                        label,
                                        Bütçe: mainTotalRow?.budget[mi] ?? 0,
                                        Fiili: mainTotalRow?.actual[mi] ?? 0,
                                      }));

                                      return (
                                        <div className="space-y-4">
                                          {/* ay seçici */}
                                          <div className="flex items-center gap-3">
                                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Ay:</span>
                                            <select
                                              value={safeMonth}
                                              onChange={(e) => { e.stopPropagation(); setVarMonth(Number(e.target.value)); }}
                                              onClick={(e) => e.stopPropagation()}
                                              className="text-xs px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-indigo-400"
                                            >
                                              {MONTH_LABELS.map((m, mi) => (
                                                <option key={m} value={mi} disabled={hasActual && !monthsWithData.includes(mi)}>
                                                  {m}{hasActual && !monthsWithData.includes(mi) ? ' (veri yok)' : ''}
                                                </option>
                                              ))}
                                            </select>
                                            {!hasActual && (
                                              <span className="text-xs text-amber-600 dark:text-amber-400">Fiili veriler yüklenmemiş — sadece bütçe gösteriliyor</span>
                                            )}
                                          </div>

                                          {/* özet kartlar — sadece mainTotalRow'dan */}
                                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            {[
                                              { label: 'Bütçe',    value: fmtFull(budgetTotal), cls: 'text-gray-900 dark:text-white' },
                                              { label: 'Fiili',    value: hasActual ? fmtFull(actualTotal) : '—', cls: 'text-blue-600 dark:text-blue-400' },
                                              { label: 'Fark (TL)', value: hasActual ? (diffTotal >= 0 ? '+' : '') + fmtFull(diffTotal) : '—', cls: diffTotal > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400' },
                                              { label: 'Fark (%)', value: hasActual ? (diffPctVar >= 0 ? '+' : '') + diffPctVar.toFixed(1) + '%' : '—', cls: diffPctVar > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400' },
                                            ].map(({ label, value, cls }) => (
                                              <div key={label} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 shadow-sm">
                                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
                                                <p className={`text-sm font-bold mt-0.5 font-mono ${cls}`}>{value}</p>
                                              </div>
                                            ))}
                                          </div>

                                          {/* grafikler */}
                                          {hasActual && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                              {/* top 5 — departman toplam satırları */}
                                              {top5.length > 0 ? (
                                                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
                                                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">Departman Sapmaları — {MONTH_LABELS[safeMonth]}</p>
                                                  <ResponsiveContainer width="100%" height={180}>
                                                    <BarChart layout="vertical" data={top5} margin={{ top: 0, right: 60, bottom: 0, left: 8 }}>
                                                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                                                      <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
                                                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} width={120} />
                                                      <Tooltip formatter={(v) => [fmtFull(Number(v)), 'Sapma']} contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 6, fontSize: 11 }} />
                                                      <Bar dataKey="diff" radius={[0, 3, 3, 0]} label={{ position: 'right', formatter: (v: unknown) => fmt(v as number), fontSize: 9, fill: axisColor }}>
                                                        {top5.map((d) => <Cell key={d.name} fill={d.raw > 0 ? '#ef4444' : '#22c55e'} />)}
                                                      </Bar>
                                                    </BarChart>
                                                  </ResponsiveContainer>
                                                </div>
                                              ) : (
                                                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm flex items-center justify-center">
                                                  <p className="text-xs text-gray-400 text-center">Departman toplam satırı bulunamadı<br/>("Toplam" içeren TL satırı gerekli)</p>
                                                </div>
                                              )}
                                              {/* trend — mainTotalRow */}
                                              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
                                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Bütçe vs Fiili Trend</p>
                                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">{mainTotalRow?.paramName}</p>
                                                <ResponsiveContainer width="100%" height={165}>
                                                  <LineChart data={trendVarData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
                                                    <YAxis tickFormatter={fmt} tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} width={52} />
                                                    <Tooltip formatter={(v) => [fmtFull(Number(v)), '']} contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 6, fontSize: 11 }} />
                                                    <Legend wrapperStyle={{ fontSize: 10 }} />
                                                    <Line type="monotone" dataKey="Bütçe" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="4 2" />
                                                    <Line type="monotone" dataKey="Fiili" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5 }} />
                                                  </LineChart>
                                                </ResponsiveContainer>
                                              </div>
                                            </div>
                                          )}

                                          {/* ── Aksiyon butonları: Sapma Raporu + PDF ── */}
                                          {hasActual && (
                                            <div className="flex items-center justify-end gap-2">
                                              {/* Sapma Raporu Oluştur */}
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setVarDrawerOpen(true);
                                                  setVarDrawerResult(null);
                                                  setVarDrawerError(null);
                                                  setVarDrawerLoading(true);
                                                  const params = catRows
                                                    .filter((r) => {
                                                      const bv = r.budget[safeMonth];
                                                      const av = r.actual[safeMonth];
                                                      if (bv === 0 && av === 0) return false;
                                                      const name = r.paramName.trim();
                                                      if (/Toplam$/i.test(name) && name !== 'Toplam' && !/^TOPLAM$/i.test(name)) return false;
                                                      return true;
                                                    })
                                                    .sort((a, b) => (isKeyParam(a.paramName, cat.id) ? 0 : 1) - (isKeyParam(b.paramName, cat.id) ? 0 : 1))
                                                    .slice(0, 50)
                                                    .map((r) => {
                                                      const bv = r.budget[safeMonth];
                                                      const av = r.actual[safeMonth];
                                                      const dv = av - bv;
                                                      const isTL = /^TL/i.test(r.unitType);
                                                      const dp = (isTL && bv > 0) ? (dv / bv) * 100 : null;
                                                      return { paramName: r.paramName, unitType: r.unitType, budget: bv, actual: av, diff: dv, diffPct: dp };
                                                    });
                                                  const monthly = MONTH_LABELS.map((m, mi) => ({
                                                    month: m,
                                                    budget: mainTotalRow?.budget[mi] ?? 0,
                                                    actual: mainTotalRow?.actual[mi] ?? 0,
                                                  }));
                                                  // Ay bazlı breakdown
                                                  const monthBreakdown = MONTH_LABELS.map((m, mi) => {
                                                    const bv = mainTotalRow?.budget[mi] ?? 0;
                                                    const av = mainTotalRow?.actual[mi] ?? 0;
                                                    const vv = av - bv;
                                                    return {
                                                      month: m,
                                                      budget: bv,
                                                      actual: av,
                                                      variance: vv,
                                                      variancePct: bv > 0 ? (vv / bv) * 100 : 0,
                                                    };
                                                  });
                                                  // Departman bazlı breakdown (ICA için ICA_DEPT'ten al)
                                                  const deptRow = ICA_DEPT.find((r) => r.categoryId === cat.id);
                                                  const departmentBreakdown = deptRow
                                                    ? DEPARTMENTS.map((d) => {
                                                        const bv = deptRow[d] ?? 0;
                                                        return {
                                                          department: d,
                                                          budget: bv,
                                                          actual: bv,
                                                          variance: 0,
                                                          variancePct: 0,
                                                        };
                                                      }).filter((d) => d.budget > 0)
                                                    : [];
                                                  // Aktif ay bazlı bütçe/fiili hesabı
                                                  const activeMonthIdxs = MONTH_LABELS
                                                    .map((_, mi) => mi)
                                                    .filter((mi) => (mainTotalRow?.actual[mi] ?? 0) > 0);
                                                  const activeBudgetTotal = activeMonthIdxs.length > 0
                                                    ? activeMonthIdxs.reduce((s, mi) => s + (mainTotalRow?.budget[mi] ?? 0), 0)
                                                    : budgetTotal;
                                                  const activeActualTotal = activeMonthIdxs.reduce((s, mi) => s + (mainTotalRow?.actual[mi] ?? 0), 0);
                                                  const activeVarianceAmount = activeActualTotal - activeBudgetTotal;
                                                  const activeVariancePct = activeBudgetTotal > 0 ? (activeVarianceAmount / activeBudgetTotal) * 100 : 0;
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
                                                      monthBreakdown,
                                                      departmentBreakdown,
                                                      analysisScope: 'full',
                                                      activeMonths: activeMonthIdxs,
                                                    }),
                                                  })
                                                    .then((r) => r.json())
                                                    .then((d) => {
                                                      if (d.error) setVarDrawerError(d.error);
                                                      else setVarDrawerResult(d);
                                                    })
                                                    .catch((err) => setVarDrawerError(err.message))
                                                    .finally(() => setVarDrawerLoading(false));
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
                                              >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 8v4l3 3"/></svg>
                                                Sapma Raporu Oluştur
                                              </button>

                                              {/* PDF Raporu İndir — sadece bu kategori, derin analiz */}
                                              <button
                                                disabled={isDetailPdfLoading}
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  setIsDetailPdfLoading(true);

                                                  const CAT_EN: Record<string, string> = {
                                                    'Güvenlik': 'Security', 'Temizlik': 'Cleaning',
                                                    'Yemek': 'Food/Catering', 'Servis/Ulaşım': 'Transportation',
                                                    'Araç Kira': 'Vehicle Rental', 'HGS': 'HGS/Toll',
                                                    'Araç Yakıt': 'Vehicle Fuel', 'Araç Bakım': 'Vehicle Maintenance',
                                                    'Su': 'Water', 'Diğer Hizmet': 'Other Services',
                                                    'Diğer Çeşitli': 'Miscellaneous',
                                                  };

                                                  try {
                                                    const monthly = MONTH_LABELS.map((m, mi) => ({
                                                      month: m,
                                                      budget: mainTotalRow?.budget[mi] ?? 0,
                                                      actual: mainTotalRow?.actual[mi] ?? 0,
                                                    }));

                                                    const activeIdxs = monthly.map((_, i) => i).filter((i) => monthly[i].actual > 0);

                                                    const activeBudget = activeIdxs.length > 0
                                                      ? activeIdxs.reduce((s, i) => s + monthly[i].budget, 0)
                                                      : (mainTotalRow?.budget.reduce((s, v) => s + v, 0) ?? 0);
                                                    const activeActual = activeIdxs.reduce((s, i) => s + monthly[i].actual, 0);
                                                    const activeVar = activeActual - activeBudget;
                                                    const activeVarPct = activeBudget > 0 ? (activeVar / activeBudget) * 100 : 0;

                                                    const monthBreakdown = monthly.map((m) => {
                                                      const vv = m.actual - m.budget;
                                                      return { month: m.month, budget: m.budget, actual: m.actual, variance: vv, variancePct: m.budget > 0 ? (vv / m.budget) * 100 : 0 };
                                                    });

                                                    const deptRow = ICA_DEPT.find((r) => r.categoryId === cat.id);
                                                    const departmentBreakdown = deptRow
                                                      ? DEPARTMENTS.map((d) => ({ department: d, budget: deptRow[d] ?? 0, actual: deptRow[d] ?? 0, variance: 0, variancePct: 0 })).filter((d) => d.budget > 0)
                                                      : [];

                                                    const allParams = catRows
                                                      .filter((r) => {
                                                        const bv = activeIdxs.length > 0
                                                          ? activeIdxs.reduce((s, i) => s + r.budget[i], 0)
                                                          : r.budget.reduce((s, v) => s + v, 0);
                                                        const av = activeIdxs.reduce((s, i) => s + r.actual[i], 0);
                                                        if (bv === 0 && av === 0) return false;
                                                        const name = r.paramName.trim();
                                                        if (/Toplam$/i.test(name) && name !== 'Toplam' && !/^TOPLAM$/i.test(name)) return false;
                                                        return true;
                                                      })
                                                      .sort((a, b) => {
                                                        const aKey = isKeyParam(a.paramName, cat.id) ? 0 : 1;
                                                        const bKey = isKeyParam(b.paramName, cat.id) ? 0 : 1;
                                                        return aKey - bKey;
                                                      })
                                                      .map((r) => {
                                                        const bv = activeIdxs.length > 0
                                                          ? activeIdxs.reduce((s, i) => s + r.budget[i], 0)
                                                          : r.budget.reduce((s, v) => s + v, 0);
                                                        const av = activeIdxs.reduce((s, i) => s + r.actual[i], 0);
                                                        const dv = av - bv;
                                                        return { paramName: r.paramName, unitType: r.unitType, budget: bv, actual: av, diff: dv, diffPct: bv > 0 ? (dv / bv) * 100 : null, isKey: isKeyParam(r.paramName, cat.id) };
                                                      });

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
                                                        parameters: allParams
                                                          .sort((a, b) => (b.isKey ? 1 : 0) - (a.isKey ? 1 : 0))
                                                          .slice(0, 50)
                                                          .map((p) => ({ paramName: p.paramName, unitType: p.unitType, budget: p.budget, actual: p.actual, diff: p.diff, diffPct: p.diffPct })),
                                                        monthBreakdown,
                                                        departmentBreakdown,
                                                        activeMonths: activeIdxs,
                                                        analysisScope: 'full',
                                                        deepAnalysis: true,
                                                      }),
                                                    });
                                                    const aiResult = res.ok ? await res.json() : null;

                                                    const pdfParams = allParams.map((p) => ({
                                                      paramName: p.paramName,
                                                      unitType: p.unitType,
                                                      budgetTotal: p.budget,
                                                      actualTotal: p.actual,
                                                      diff: p.diff,
                                                      diffPct: p.diffPct,
                                                      isKey: p.isKey,
                                                    }));

                                                    const cMonthly = Array.from({ length: 12 }, (_, mi) => ({
                                                      month: mi + 1,
                                                      budget: mainTotalRow?.budget[mi] ?? 0,
                                                      actual: mainTotalRow?.actual[mi] ?? 0,
                                                    }));

                                                    const aiEff = aiResult?.effects?.map((eff: { name: string; amount: number; explanation: string; driver: string }) => ({
                                                      type: eff.name,
                                                      label: eff.name,
                                                      amount: eff.amount,
                                                      contributionPercent: Math.abs(eff.amount) / (Math.abs(aiResult.totalVariance) || 1) * 100,
                                                      description: eff.explanation,
                                                      driver: eff.driver,
                                                    })) ?? [];

                                                    const pdfData: PDFReportData = {
                                                      companyName: companyLabel,
                                                      companyCode: company,
                                                      period: `2025 - ${cat.name} Detay Raporu`,
                                                      generatedAt: new Date().toLocaleString('tr-TR'),
                                                      categories: [{
                                                        name: cat.name,
                                                        nameEn: CAT_EN[cat.name] ?? cat.name,
                                                        budgetTotal: activeBudget,
                                                        actualTotal: activeActual,
                                                        variance: activeVar,
                                                        variancePercent: activeVarPct,
                                                        monthlyData: cMonthly,
                                                        parameters: pdfParams,
                                                        aiAnalysis: aiResult && !aiResult.error ? {
                                                          summary: aiResult.summary,
                                                          effects: aiEff,
                                                          monthlyTrend: aiResult.monthlyTrend,
                                                          recommendations: aiResult.recommendations,
                                                          interRelations: aiResult.interRelations,
                                                          departmentInsights: aiResult.departmentInsights ?? '',
                                                          monthlyInsights: aiResult.monthlyInsights ?? '',
                                                          karmaEffect: aiResult.karmaEffect ?? null,
                                                        } : undefined,
                                                      }],
                                                    };

                                                    await generateBudgetPDF(pdfData);
                                                  } finally {
                                                    setIsDetailPdfLoading(false);
                                                  }
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1e2a4a] hover:bg-[#263461] disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-sm transition-colors"
                                              >
                                                {isDetailPdfLoading ? (
                                                  <>
                                                    <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                                    AI Analiz Ediliyor...
                                                  </>
                                                ) : (
                                                  <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                                    PDF Raporu İndir
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          )}

                                          {/* parametre tablosu — tüm satırlar, unitType'a göre format */}
                                          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                                              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Parametre Detayı — {MONTH_LABELS[safeMonth]}</p>
                                            </div>
                                            <div className="overflow-x-auto">
                                              <table className="w-full min-w-[560px] text-xs">
                                                <thead className="bg-gray-50 dark:bg-gray-800">
                                                  <tr>
                                                    {['Parametre', 'PB', 'Bütçe', 'Fiili', 'Fark', 'Fark %'].map((h, i) => (
                                                      <th key={h} className={`px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i <= 1 ? 'text-left' : 'text-right'}`}>{h}</th>
                                                    ))}
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                                  {catRows.map((r) => {
                                                    const bv      = r.budget[safeMonth];
                                                    const av      = r.actual[safeMonth];
                                                    const dv      = av - bv;
                                                    const isTL    = isTLRow(r);
                                                    const isTotal = isToplam(r);
                                                    const dp      = (isTL && bv > 0) ? (dv / bv) * 100 : null;
                                                    const isMain  = r === mainTotalRow;

                                                    const rowBg = isMain
                                                      ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                                                      : (isTotal && isTL)
                                                        ? 'bg-gray-100/70 dark:bg-gray-800/70'
                                                        : !isTL
                                                          ? 'bg-blue-50/20 dark:bg-blue-950/10'
                                                          : '';

                                                    return (
                                                      <tr key={r.rowNum} className={`transition-colors ${rowBg} ${!isTotal ? 'hover:bg-gray-50 dark:hover:bg-gray-800/40' : ''}`}>
                                                        <td className={`px-3 py-1.5 ${(isTotal || isMain) ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                                          {r.paramName}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500 text-[10px]">
                                                          {r.unitType || 'adet'}
                                                        </td>
                                                        <td className={`px-3 py-1.5 text-right font-mono ${(isTotal || isMain) ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                                                          {fmtVal(bv, r)}
                                                        </td>
                                                        <td className={`px-3 py-1.5 text-right font-mono ${(isTotal || isMain) ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                                                          {hasActual ? fmtVal(av, r) : '—'}
                                                        </td>
                                                        <td className={`px-3 py-1.5 text-right font-mono ${(isTotal || isMain) ? 'font-bold' : ''} ${!hasActual ? 'text-gray-400' : dv > 0 ? 'text-red-500 dark:text-red-400' : dv < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                                                          {hasActual ? fmtDiffVal(dv, r) : '—'}
                                                        </td>
                                                        <td className={`px-3 py-1.5 text-right ${(isTotal || isMain) ? 'font-bold' : ''} ${!hasActual || dp === null ? 'text-gray-400' : dp > 0 ? 'text-red-500 dark:text-red-400' : dp < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                                                          {hasActual && dp !== null ? (dp >= 0 ? '+' : '') + dp.toFixed(1) + '%' : '—'}
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </div>
                                            {/* legend */}
                                            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-4">
                                              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-2 h-2 rounded bg-indigo-200 dark:bg-indigo-800" />Kategori Toplamı</span>
                                              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-2 h-2 rounded bg-gray-200 dark:bg-gray-700" />Departman/Alt Toplamı</span>
                                              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-2 h-2 rounded bg-blue-100 dark:bg-blue-950" />Miktar/Adet Satırı</span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    <tr>
                      <td className="px-5 py-3 font-semibold text-gray-800 dark:text-gray-100">Genel Toplam</td>
                      <td className="px-5 py-3 text-right font-semibold font-mono text-gray-900 dark:text-white">{fmtFull(total2025)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">100%</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ PROJECTION TAB ══════════ */}
        {tab === 'projection' && (
          <ProjectionTab
            monthlyData={monthlyData}
            projection2026={projection2026}
            coefficients={coefficients}
            setCoefficients={setCoefficients}
            total2025={total2025}
            total2026={total2026}
            diffPct={diffPct}
            trendData={trendData}
            companyLabel={companyLabel}
            axisColor={axisColor}
            gridColor={gridColor}
            LineTooltip={LineTooltip as React.ComponentType<Record<string, unknown>>}
          />
        )}

        {/* ══════════ SAPMA ANALİZİ TAB ══════════ */}
        {tab === 'sapma' && (
          <SapmaTab
            sapamaData={sapamaData}
            total2025={total2025}
            total2026={total2026}
            diffPct={diffPct}
            companyLabel={companyLabel}
            axisColor={axisColor}
            gridColor={gridColor}
            SapamaTooltip={SapamaTooltip as React.ComponentType<Record<string, unknown>>}
          />
        )}

        {/* ══════════ SAP BÜTÇE TAKİBİ TAB ══════════ */}
        {tab === 'sap' && (
          <SapTab
            importedSapData={importedSapData}
            setImportedSapData={setImportedSapData}
            sapSummary={sapSummary}
            sapByCategory={sapByCategory}
            companyLabel={companyLabel}
          />
        )}

        {/* ══════════ DEPARTMAN KIRILIMI TAB ══════════ */}
        {tab === 'dept' && (
          <DeptTab
            deptPieData={deptPieData}
            deptBarData={deptBarData}
            deptGrandTotal={deptGrandTotal}
            selectedDept={selectedDept}
            setSelectedDept={setSelectedDept}
            companyLabel={companyLabel}
            axisColor={axisColor}
            gridColor={gridColor}
            company={company}
            dark={dark}
          />
        )}

      </main>

      {/* ── EXCEL IMPORT MODAL ── */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeImport}
          />

          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-gray-200 dark:border-gray-700 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">

            {/* modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-blue-600 dark:text-blue-400" />
                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Excel Dosyası Yükle</h2>
              </div>
              <button
                onClick={closeImport}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5">

              {/* drag-drop alanı */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <Upload size={28} className={`mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {dragOver ? 'Dosyayı bırakın…' : 'Dosyayı sürükleyin veya tıklayın'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">.xlsx ve .xls desteklenir</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* sheet seçimi */}
              {sheets.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Sheet Seç ({sheets.length} sheet bulundu)
                  </p>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {sheets.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSelectedSheet(s)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                          selectedSheet === s
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
                            : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <FileSpreadsheet size={14} className="flex-shrink-0" />
                          {s}
                        </span>
                        {selectedSheet === s && <ChevronRight size={14} />}
                      </button>
                    ))}
                  </div>

                  {/* sütun bilgisi */}
                  <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                    Beklenen sütunlar: <span className="font-mono">Bütçe Kodu · Bütçe Kodu Tanımı · Orjinal Bütçe · Kalan Bütçe · Fatura Giriş Tutarı</span>
                  </p>
                </div>
              )}
            </div>

            {/* modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={closeImport}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleImport}
                disabled={!selectedSheet}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                <Upload size={14} />
                Yükle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VARYANS ANALİZİ SLIDE-OVER DRAWER ── */}
      {varDrawerOpen && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setVarDrawerOpen(false)}>
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* panel */}
          <div
            className="relative ml-auto h-full w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Sapma Raporu</h2>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">Claude AI tarafından oluşturuldu</p>
                </div>
              </div>
              <button
                onClick={() => setVarDrawerOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* loading */}
              {varDrawerLoading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Analiz hazırlanıyor…</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Claude varyans verilerini inceliyor</p>
                </div>
              )}

              {/* error */}
              {!varDrawerLoading && varDrawerError && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Analiz başarısız</p>
                  <p className="text-xs text-red-600 dark:text-red-400">{varDrawerError}</p>
                </div>
              )}

              {/* result */}
              {!varDrawerLoading && varDrawerResult && (() => {
                const r = varDrawerResult;
                const isOver = r.direction === 'over';
                const isUnder = r.direction === 'under';
                const totalAbs = Math.abs(r.totalVariance);
                const maxEffect = Math.max(...r.effects.map((e) => Math.abs(e.amount)), 1);

                return (
                  <>
                    {/* summary card */}
                    <div className={`rounded-xl border p-4 ${isOver ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20' : isUnder ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isOver ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' : isUnder ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                          {isOver ? 'BÜTÇE AŞIMI' : isUnder ? 'BÜTÇE ALTINDA' : 'BÜTÇEDE'}
                        </span>
                        <span className={`text-lg font-bold font-mono ${isOver ? 'text-red-600 dark:text-red-400' : isUnder ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                          {isOver ? '+' : isUnder ? '-' : ''}{fmtFull(totalAbs)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{r.summary}</p>
                    </div>

                    {/* effects */}
                    {r.effects.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Varyans Ayrıştırması</h3>
                        {r.effects.map((effect, i) => {
                          const pct = (Math.abs(effect.amount) / maxEffect) * 100;
                          const effIsOver = effect.amount > 0;
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-gray-700 dark:text-gray-300">{effect.name}</span>
                                <span className={`font-bold font-mono ${effIsOver ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                  {effIsOver ? '+' : ''}{fmtFull(effect.amount)}
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full transition-all"
                                  style={{ width: `${pct}%`, backgroundColor: effIsOver ? '#ef4444' : '#22c55e' }}
                                />
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">{effect.explanation}</p>
                              <p className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">▸ {effect.driver}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* monthly trend */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Aylık Trend</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{r.monthlyTrend}</p>
                    </div>

                    {/* inter-relations */}
                    {r.interRelations && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Etki İlişkileri</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{r.interRelations}</p>
                      </div>
                    )}

                    {/* karma etki */}
                    {r.karmaEffect && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">Karma Etki Analizi</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3">{r.karmaEffect.description}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-2.5 border border-red-100 dark:border-red-900">
                            <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Baskın Etken</p>
                            <p className="text-xs font-semibold text-red-700 dark:text-red-300">{r.karmaEffect.dominantFactor}</p>
                          </div>
                          <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2.5 border border-amber-100 dark:border-amber-900">
                            <p className="text-[10px] font-bold text-amber-500 uppercase mb-1">İkincil Etken</p>
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{r.karmaEffect.secondaryFactor}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* departman insights */}
                    {r.departmentInsights && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Departman Analizi</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{r.departmentInsights}</p>
                      </div>
                    )}

                    {/* monthly insights */}
                    {r.monthlyInsights && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Aylık Yoğunlaşma</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{r.monthlyInsights}</p>
                      </div>
                    )}

                    {/* recommendations */}
                    {r.recommendations.length > 0 && (
                      <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800 p-4">
                        <h3 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide mb-3">Öneriler</h3>
                        <ul className="space-y-2">
                          {r.recommendations.map((rec, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-indigo-800 dark:text-indigo-200">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                              <span className="leading-relaxed">{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* footer */}
            {!varDrawerLoading && (
              <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
                  Bu analiz yapay zeka tarafından üretilmiştir. Finansal kararlar için bağımsız doğrulama yapılması önerilir.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-xl animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
