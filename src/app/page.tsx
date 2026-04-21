'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  BarChart, Bar, LineChart, Line, Cell,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import ChartWrapper from '@/components/ChartWrapper';
import { Sun, Moon, Download, Upload, FileSpreadsheet, X, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';

import { CATEGORIES, CATEGORY_COLORS, INDEX_BADGE_COLORS } from '@/data/categories';
import { generateBudgetPDF, generateExecutivePDF } from '@/components/pdf/generateBudgetPDF';
import type { CategoryPDFData, PDFReportData } from '@/components/pdf/generateBudgetPDF';
import ProjectionTab from '@/components/tabs/ProjectionTab';
import GuvenlikDetailPanel from '@/components/tabs/GuvenlikDetailPanel';
import TemizlikDetailPanel from '@/components/tabs/TemizlikDetailPanel';
import YemekDetailPanel from '@/components/tabs/YemekDetailPanel';
import ServisDetailPanel from '@/components/tabs/ServisDetailPanel';
import GenericCategoryPanel from '@/components/tabs/GenericCategoryPanel';
import SapmaTab from '@/components/tabs/SapmaTab';
import SapTab from '@/components/tabs/SapTab';
import DeptTab from '@/components/tabs/DeptTab';
import { fmt, fmtShort, fmtFull, pctTextColor, sapamaColor, sapamaStatus } from '@/lib/utils';
import { ICA_BUDGET, ICE_BUDGET, GROUP_MONTHLY } from '@/data/budget-data';
import { getSapData, SAP_CATEGORY_COLORS } from '@/data/sap-data';
import type { SapEntry } from '@/data/sap-data';
import { DEPARTMENTS, ICA_DEPT, DEPT_COLORS } from '@/data/department-data';
import type { Department } from '@/data/department-data';
import { MONTH_LABELS } from '@/data/drill-down-data';
import {
  getCompanies, getFiscalYears, getCategories,
  upsertSapEntries,
  getBudgetMonthlyData, getSapMonthlyData, getBudgetEntriesAsModelRows, CATEGORY_CODE_MAP,
} from '@/lib/db';
import type { SapEntry as DbSapEntry } from '@/lib/db';
import { parseExcelFile } from '@/lib/excelParser';
import { upsertBudgetLineItems, fetchBudgetLineItems } from '@/lib/budgetLineItemsService';
import {
  totalAnnual, categoryAnnual, monthlyAverage,
  buildProjection2026, variancePct, categoryShare, aggregateMonthly,
} from '@/lib/calculations';
import type { Company, MonthlyEntry, ProjectionCoefficients, ModelRow } from '@/types';

// ─── model gider row ranges & key params ────────────────────────────────────
// ModelRow tipi src/types/index.ts'e taşındı

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
  diger_hizmet:  [1273, 1311],
  icme_suyu:     [1312, 1336],
  diger_cesitli: [1337, 1372],
};

/**
 * Pinned Excel row number for each category's TOPLAM / main total row.
 * Used when paramName does not contain "TOPLAM" (e.g. "Güvenlik Giderleri" for row 20).
 */
const CAT_TOTAL_ROWS: Partial<Record<string, number>> = {
  guvenlik: 20,
};

/**
 * Returns the main total ModelRow for a category.
 * Priority: pinned rowNum → first TL+TOPLAM row → first TL row → first row.
 */
function findMainTotalRow(catCode: string, rows: ModelRow[]): ModelRow | undefined {
  const pinned = CAT_TOTAL_ROWS[catCode];
  if (pinned !== undefined) {
    const pinnedRow = rows.find((r) => r.rowNum === pinned);
    if (pinnedRow) return pinnedRow;
  }
  return (
    rows.find((r) => /^TL/i.test(r.unitType) && /TOPLAM/i.test(r.paramName)) ??
    rows.find((r) => /^TL/i.test(r.unitType))
  );
}

// ─── default coefficients ────────────────────────────────────────────────────

const DEFAULT_COEFFICIENTS: ProjectionCoefficients = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, parseFloat((1 + c.rate / 100).toFixed(3))]),
);

// ─── mergeTotalRows ───────────────────────────────────────────────────────────
// GRUP modunda ICA + ICE iki ayrı total satırı üretir. Bu helper birden fazla
// total satırını element-wise toplayarak tek bir sanal satır döndürür.
// Tek satır varsa onu, hiç satır yoksa null döndürür (eski davranış korunur).

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
  const [sapmaPeriod,  setSapmaPeriod]  = useState<'month' | 'ytd' | 'year'>('month');

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
  type OptScenarioItem = { name: string; currentAdet?: number; targetAdet?: number; currentFiyat?: number; targetFiyat?: number; saving: number };
  type OptScenario = { title: string; actions: string[]; newTotal: number; feasibility: string; savings: string; items?: OptScenarioItem[] };
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
    optimization?: {
      scenarioA: OptScenario;
      scenarioB: OptScenario;
      scenarioC: OptScenario;
      optimalPath: string;
      riskNote: string;
      yearEndForecast: string;
    };
  } | null>(null);
  const [varDrawerError, setVarDrawerError] = useState<string | null>(null);
  const [isExecPdfLoading,   setIsExecPdfLoading]   = useState(false);
  const [isDetailPdfLoading, setIsDetailPdfLoading] = useState(false);

  // ── DB / Supabase state ──
  const [dbMonthlyData, setDbMonthlyData] = useState<MonthlyEntry[] | null>(null);
  const [dbSapData,     setDbSapData]     = useState<SapEntry[] | null>(null);
  const [dbModelRows,   setDbModelRows]   = useState<Map<string, ModelRow[]> | null>(null);
  const [dbLoading,     setDbLoading]     = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lineItemsData, setLineItemsData] = useState<any[]>([]);

  // ── excel import state ──
  const [importOpen,      setImportOpen]      = useState(false);
  const [dragOver,        setDragOver]        = useState(false);
  const [sheets,          setSheets]          = useState<string[]>([]);
  const [selectedSheet,   setSelectedSheet]   = useState('');
  const [importedSapData, setImportedSapData] = useState<SapEntry[] | null>(null);
  const [toast,           setToast]           = useState('');
  const wbRef       = useRef<XLSX.WorkBook | null>(null);
  const bufferRef   = useRef<ArrayBuffer | null>(null);
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
      try {
        const [companiesRes, yearsRes] = await Promise.all([getCompanies(), getFiscalYears()]);
        const dbYear      = yearsRes.data?.find((y) => y.year === 2025 && y.status === 'active') ?? null;
        const icaCompany  = companiesRes.data?.find((c) => c.code === 'ICA') ?? null;
        const iceCompany  = companiesRes.data?.find((c) => c.code === 'ICE') ?? null;

        if (company === 'GRUP') {
          // Paralel fetch: ICA + ICE
          const [
            icaMonthly, iceMonthly,
            icaSap,     iceSap,
            icaRows,    iceRows,
          ] = await Promise.all([
            getBudgetMonthlyData('ICA'),
            getBudgetMonthlyData('ICE'),
            getSapMonthlyData('ICA'),
            getSapMonthlyData('ICE'),
            getBudgetEntriesAsModelRows('ICA'),
            getBudgetEntriesAsModelRows('ICE'),
          ]);

          // Monthly merge — ay bazlı toplam
          const mergedMonthly: MonthlyEntry[] = (icaMonthly ?? []).map((icaRow: MonthlyEntry, i: number) => {
            const iceRow = ((iceMonthly ?? []) as MonthlyEntry[])[i] ?? {};
            const merged: MonthlyEntry = { month: icaRow.month, monthLabel: icaRow.monthLabel } as MonthlyEntry;
            const keys = new Set([...Object.keys(icaRow), ...Object.keys(iceRow)]);
            for (const k of keys) {
              if (k === 'month' || k === 'monthLabel') continue;
              const ica = (icaRow as Record<string, unknown>)[k];
              const ice = (iceRow as Record<string, unknown>)[k];
              (merged as Record<string, unknown>)[k] = (typeof ica === 'number' ? ica : 0) + (typeof ice === 'number' ? ice : 0);
            }
            return merged;
          });
          setDbMonthlyData(mergedMonthly);

          // SAP merge — flat list concat (SapEntry[], ay bazlı değil)
          setDbSapData([...(icaSap ?? []), ...(iceSap ?? [])]);

          // Budget rows: category bazında concat
          if (icaRows || iceRows) {
            const map = new Map<string, ModelRow[]>();
            (icaRows ?? []).forEach(({ categoryCode, rows }) => {
              map.set(categoryCode, [...(map.get(categoryCode) ?? []), ...rows]);
            });
            (iceRows ?? []).forEach(({ categoryCode, rows }) => {
              map.set(categoryCode, [...(map.get(categoryCode) ?? []), ...rows]);
            });
            setDbModelRows(map);
          }

          // Line items: her satıra company tag'i ekle, paralel çek
          if (dbYear && icaCompany && iceCompany) {
            const [icaItems, iceItems] = await Promise.all([
              fetchBudgetLineItems(icaCompany.id, dbYear.id),
              fetchBudgetLineItems(iceCompany.id, dbYear.id),
            ]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const taggedIca = icaItems.map((i: any) => ({ ...i, company: 'ICA' as const }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const taggedIce = iceItems.map((i: any) => ({ ...i, company: 'ICE' as const }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allItems: any[] = [...taggedIca, ...taggedIce];
            // compound key: aynı id farklı şirkette ayrı satır olarak tutulur
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const unique = allItems.filter((item: any, idx: number, arr: any[]) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              arr.findIndex((i: any) => i.id === item.id && i.company === item.company) === idx
            );
            setLineItemsData(unique);
          }
        } else {
          // Tek şirket (ICA veya ICE) — eski akış + company tag
          const [monthlyRes, sapRes, budgetRowsRes] = await Promise.all([
            getBudgetMonthlyData(company),
            getSapMonthlyData(company),
            getBudgetEntriesAsModelRows(company),
          ]);
          setDbMonthlyData(monthlyRes);
          setDbSapData(sapRes);
          if (budgetRowsRes) {
            const map = new Map<string, ModelRow[]>();
            budgetRowsRes.forEach(({ categoryCode, rows }) => map.set(categoryCode, rows));
            setDbModelRows(map);
          }
          const dbCompany = companiesRes.data?.find((c) => c.code === company) ?? null;
          if (dbCompany && dbYear) {
            const items = await fetchBudgetLineItems(dbCompany.id, dbYear.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const taggedItems = items.map((i: any) => ({ ...i, company }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const uniqueItems = taggedItems.filter((item: any, idx: number, arr: any[]) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              arr.findIndex((i: any) => i.id === item.id) === idx
            );
            setLineItemsData(uniqueItems);
          }
        }
      } catch (e) {
        console.error('[loadFromDb] error:', e);
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

  // Her zaman budget-data.ts sabit kaynağından gelir — Supabase'e bakmaz.
  // Varyans Analizi KPI ve trend için Excel formül cache'i boşsa güvenli fallback.
  const staticMonthlyData: MonthlyEntry[] = useMemo(() => {
    if (company === 'ICA') return ICA_BUDGET.monthlyData;
    if (company === 'ICE') return ICE_BUDGET.monthlyData;
    return GROUP_MONTHLY;
  }, [company]);

  // projection2026 and totals are always based on staticMonthlyData (budget-data.ts),
  // never Supabase — Supabase values can be inflated/stale for some categories (e.g. Güvenlik)
  const projection2026 = useMemo(
    () => buildProjection2026(staticMonthlyData, coefficients),
    [staticMonthlyData, coefficients],
  );

  const total2025  = useMemo(() => totalAnnual(staticMonthlyData), [staticMonthlyData]);
  const total2026  = useMemo(() => totalAnnual(projection2026), [projection2026]);
  const avgMonthly = useMemo(() => monthlyAverage(staticMonthlyData), [staticMonthlyData]);
  const diffPct    = useMemo(() => variancePct(total2025, total2026), [total2025, total2026]);

  const trendData = useMemo(() => {
    const agg25 = aggregateMonthly(staticMonthlyData);
    const agg26 = aggregateMonthly(projection2026);
    return agg25.map((row, i) => ({
      label: row.monthLabel,
      '2025 Bütçe': row.total,
      '2026 Projeksiyon': agg26[i]?.total ?? 0,
    }));
  }, [staticMonthlyData, projection2026]);

  const sapamaData = useMemo(() =>
    CATEGORIES.map((cat) => {
      const t25   = categoryAnnual(staticMonthlyData, cat.id);
      const t26   = categoryAnnual(projection2026, cat.id);
      const pct   = variancePct(t25, t26);
      const diff  = t26 - t25;
      return { id: cat.id, name: cat.name, t25, t26, diff, pct };
    }).sort((a, b) => b.pct - a.pct),
  [staticMonthlyData, projection2026]);

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
    XLSX.utils.book_append_sheet(wb, ws25, '2025 Bütçe');

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
      bufferRef.current = data as ArrayBuffer;
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
    // GRUP seçiliyken Excel import yapma — konsolide view sadece okur
    if (company === 'GRUP') {
      alert('Grup Konsolide görünümünde Excel import yapılamaz. Lütfen önce ICA veya ICE seçin ve o şirket için Excel dosyasını yükleyin.');
      return;
    }
    const wb = wbRef.current;
    if (!wb || !selectedSheet) return;

    const ws = wb.Sheets[selectedSheet];

    // ── ortak DB lookup yardımcısı ──
    async function resolveDbIds() {
      const [companiesRes, yearsRes, catsRes] = await Promise.all([
        getCompanies(), getFiscalYears(), getCategories(),
      ]);
      const companyCode = company;
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
        for (let m = 0; m < 12; m++) {
          budget.push(toNum(row[13 + m]));
          actual.push(toNum(row[28 + m]));
        }
        parsed.push({ rowNum: i + 1, paramName, unitType, budget, actual });
      }
      if (parsed.length === 0) { showToast('Model sheet okunamadı — sütunları kontrol edin'); return; }

      // Bütçe değeri kontrolü — TL satırları için formül cache'i boşsa uyar
      // Sadece TL/TL Karşılığı satırları kontrol edilir; adet satırları 0 olabilir
      const tlRows = parsed.filter((r) => /^TL/i.test(r.unitType));
      const hasTLBudgetValues = tlRows.length > 0 && tlRows.some((r) => r.budget.some((v) => v !== 0));
      if (tlRows.length > 0 && !hasTLBudgetValues) {
        showToast('⚠️ Bütçe değerleri okunamadı. Excel dosyasını Microsoft Excel\'de bir kez açıp kaydedin, sonra tekrar yükleyin.');
        // Yine de devam et — fiili veriler okunmuş olabilir
      }

      // ── state güncelle (önce UI, sonra DB) ──
      const budgetCount = parsed.filter((r) => r.budget.some((v) => v !== 0)).length;
      const actualCount = parsed.filter((r) => r.actual.some((v) => v !== 0)).length;
      const hasActual = parsed.some((r) => r.actual.some((v) => v !== 0));
      // Capture buffer BEFORE cleanup nulls bufferRef.current
      const importBuffer = bufferRef.current;

      setImportedModelData(parsed);
      setImportOpen(false);
      wbRef.current = null; bufferRef.current = null; setSheets([]); setSelectedSheet('');
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
        const { dbCompany, dbYear, dbCats } = await resolveDbIds();
        if (!dbCompany || !dbYear) return; // DB tabloları henüz kurulmamış

        // budget_entries (legacy) write removed — budget_line_items is the source of truth

        // ── Block 2: budget_line_items (granular row hierarchy) ──
        try {
          if (!importBuffer) {
            console.error('[DB] importBuffer is null — skipping budget_line_items parse');
          } else {
            const excelCompanyCode = company === 'ICE' ? '2415' : '2410';
            const parsedLineItems = parseExcelFile(importBuffer, excelCompanyCode, dbYear.year);
            const result = await upsertBudgetLineItems(parsedLineItems, dbCompany.id, dbYear.id);
            if (result.errors.length > 0) console.warn('[DB] budget_line_items errors:', result.errors);
            // Refresh lineItemsData state so UI reflects the newly imported data
            const refreshed = await fetchBudgetLineItems(dbCompany.id, dbYear.id);
            const uniqueRefreshed = refreshed.filter((item, idx, arr) =>
              arr.findIndex((i) => i.id === item.id) === idx
            );
            setLineItemsData(uniqueRefreshed);
          }
        } catch (e) {
          console.error('[DB] budget_line_items failed:', e);
        }

        // excel_imports log skipped — table not available
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
      if (/İÇME SUYU|ICME SUYU|\bSU\b|SU GİD/.test(n)) return 'İçme Suyu';
      if (/TEMİZLİK|TEMIZLIK|TAŞERON|TASERON/.test(n))  return 'Temizlik';
      if (/^26DE19/.test(code))                          return 'Yemek';
      if (/^26DE21|^26DE07/.test(code))                  return 'Araç Kira';
      if (/^26DE22|^26DE06/.test(code))                  return 'HGS';
      if (/^26DE24|^26DE03/.test(code))                  return 'Araç Yakıt';
      if (/^26DE25|^26DE05/.test(code))                  return 'Araç Bakım';
      if (/^26DE29|^26DE04/.test(code))                  return 'İçme Suyu';
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
      parsed.push({ code, name: name || code, budget, remaining, used, category, company });
    }

    if (parsed.length === 0) return;

    // ── state güncelle ──
    setImportedSapData(parsed);
    setImportOpen(false);
    wbRef.current = null; bufferRef.current = null; setSheets([]); setSelectedSheet('');
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
        // excel_imports log skipped — table not available
      } catch (e) {
        console.warn('[DB] SAP import DB write failed:', e);
      }
    })();
  }, [selectedSheet, company, showToast]);

  const closeImport = useCallback(() => {
    setImportOpen(false);
    wbRef.current = null;
    bufferRef.current = null;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!lineItemsData || (lineItemsData as any[]).length === 0) { alert('Veri yüklenemedi'); return; }
    setIsDetailPdfLoading(true);

    const CAT_EN: Record<string, string> = {
      'Güvenlik': 'Security', 'Temizlik': 'Cleaning',
      'Yemek': 'Food/Catering', 'Servis/Ulaşım': 'Transportation',
      'Araç Kira': 'Vehicle Rental', 'HGS': 'HGS/Toll',
      'Araç Yakıt': 'Vehicle Fuel', 'Araç Bakım': 'Vehicle Maintenance',
      'İçme Suyu': 'Water', 'Diğer Hizmet': 'Other Services',
      'Diğer Çeşitli': 'Miscellaneous',
    };

    try {
      // Tüm kategoriler için paralel AI analizi yap
      const aiResults = await Promise.allSettled(
        CATEGORIES.map(async (c) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cItems = (lineItemsData as any[]).filter((i: any) => i.category_code === c.id);
          const cTotal = mergeTotalRows(cItems.filter((i: any) => i.row_type === 'total'));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cDepts = cItems.filter((i: any) => i.row_type === 'dept');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cParams = cItems.filter((i: any) => i.row_type === 'param');
          const ensureArr = (v: unknown): number[] => {
            if (!v) return Array(12).fill(0);
            if (typeof v === 'string') { try { return JSON.parse(v); } catch { return Array(12).fill(0); } }
            return Array.isArray(v) ? v as number[] : Array(12).fill(0);
          };
          const totalBudget = ensureArr(cTotal?.monthly_budget);
          const totalActual = ensureArr(cTotal?.monthly_actual);
          // Tüm Yıl PDF: tüm 12 ayı dahil et — fiili-olmayan ayları dışlamak yıllık bütçeyi küçültüyor
          const activeIdxs = Array.from({ length: 12 }, (_, i) => i);

          // GRUP: ICA ve ICE total satırlarını ayrı parse et
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cTotals = cItems.filter((i: any) => i.row_type === 'total');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cIcaTotal = company === 'GRUP' ? (cTotals.find((t: any) => t.company === 'ICA') ?? null) : null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cIceTotal = company === 'GRUP' ? (cTotals.find((t: any) => t.company === 'ICE') ?? null) : null;
          const cIcaBudget = ensureArr(cIcaTotal?.monthly_budget);
          const cIcaActual = ensureArr(cIcaTotal?.monthly_actual);
          const cIceBudget = ensureArr(cIceTotal?.monthly_budget);
          const cIceActual = ensureArr(cIceTotal?.monthly_actual);

          const monthly = MONTH_LABELS.map((m, i) => ({ month: m, budget: totalBudget[i] ?? 0, actual: totalActual[i] ?? 0 }));
          const cActual = activeIdxs.reduce((s, i) => s + (totalActual[i] ?? 0), 0);
          const cBudget = activeIdxs.length > 0
            ? activeIdxs.reduce((s, i) => s + (totalBudget[i] ?? 0), 0)
            : totalBudget.reduce((s, v) => s + v, 0);
          const cVar = cActual - cBudget;
          const cVarPct = cBudget > 0 ? (cVar / cBudget) * 100 : 0;

          const monthBreakdown = monthly.map((m) => {
            const bv = m.budget;
            const av = m.actual;
            const vv = av - bv;
            return { month: m.month, budget: bv, actual: av, variance: vv, variancePct: bv > 0 ? (vv / bv) * 100 : 0 };
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const departmentBreakdown = (cDepts as any[]).map((d) => {
            const db = ensureArr(d.monthly_budget);
            const da = ensureArr(d.monthly_actual);
            const activeBudget = activeIdxs.reduce((s: number, i: number) => s + (db[i] ?? 0), 0);
            const activeActual = activeIdxs.reduce((s: number, i: number) => s + (da[i] ?? 0), 0);
            return { name: d.label, company: (d.company ?? null) as string | null, budget: activeBudget, actual: activeActual,
              variance: activeActual - activeBudget,
              variancePercent: activeBudget > 0 ? ((activeActual - activeBudget) / activeBudget) * 100 : 0 };
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const params = (cParams as any[]).slice(0, 30).map((p) => {
            const pb = ensureArr(p.monthly_budget);
            const pa = ensureArr(p.monthly_actual);
            const bv = activeIdxs.reduce((s: number, i: number) => s + (pb[i] ?? 0), 0);
            const av = activeIdxs.reduce((s: number, i: number) => s + (pa[i] ?? 0), 0);
            return { paramName: p.label as string, unitType: (p.unit_type ?? 'TL') as string, company: (p.company ?? null) as string | null, budget: bv, actual: av,
              diff: av - bv, diffPct: bv > 0 ? (av - bv) / bv * 100 : null };
          }).filter((p) => p.budget !== 0 || p.actual !== 0)
            .sort((a, b) => (isKeyParam(a.paramName, c.id) ? 0 : 1) - (isKeyParam(b.paramName, c.id) ? 0 : 1));

          // GRUP: şirket bazlı kırılım (tüm yıl)
          const fullYearIdxs = Array.from({ length: 12 }, (_, i) => i);
          const companyBreakdown = company === 'GRUP' && (cIcaTotal || cIceTotal) ? (() => {
            const icaPB = fullYearIdxs.reduce((s, i) => s + (cIcaBudget[i] ?? 0), 0);
            const icaPA = fullYearIdxs.reduce((s, i) => s + (cIcaActual[i] ?? 0), 0);
            const icePB = fullYearIdxs.reduce((s, i) => s + (cIceBudget[i] ?? 0), 0);
            const icePA = fullYearIdxs.reduce((s, i) => s + (cIceActual[i] ?? 0), 0);
            const icaVar = icaPA - icaPB;
            const iceVar = icePA - icePB;
            const netBudget = icaPB + icePB;
            return {
              ICA: { budget: icaPB, actual: icaPA, variance: icaVar, variancePercent: icaPB > 0 ? (icaVar / icaPB) * 100 : 0 },
              ICE: { budget: icePB, actual: icePA, variance: iceVar, variancePercent: icePB > 0 ? (iceVar / icePB) * 100 : 0 },
              net: { budget: netBudget, actual: icaPA + icePA, variance: icaVar + iceVar, variancePercent: netBudget > 0 ? ((icaVar + iceVar) / netBudget) * 100 : 0, balanced: icaVar * iceVar < 0 },
            };
          })() : null;

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
              companyBreakdown,
              isGroupView: company === 'GRUP',
              periodLabel: 'Tüm Yıl',
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cItems = (lineItemsData as any[]).filter((i: any) => i.category_code === c.id);
        const cTotal = mergeTotalRows(cItems.filter((i: any) => i.row_type === 'total'));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cParams = cItems.filter((i: any) => i.row_type === 'param');
        const ensureArr = (v: unknown): number[] => {
          if (!v) return Array(12).fill(0);
          if (typeof v === 'string') { try { return JSON.parse(v); } catch { return Array(12).fill(0); } }
          return Array.isArray(v) ? v as number[] : Array(12).fill(0);
        };
        const totalBudget = ensureArr(cTotal?.monthly_budget);
        const totalActual = ensureArr(cTotal?.monthly_actual);
        // Tüm Yıl PDF: tüm 12 ayı dahil et
        const cActiveIndices = Array.from({ length: 12 }, (_, i) => i);

        const cMonthly = Array.from({ length: 12 }, (_, mi) => ({
          month: mi + 1,
          budget: totalBudget[mi] ?? 0,
          actual: totalActual[mi] ?? 0,
        }));

        const cActual = cActiveIndices.reduce((s, i) => s + (totalActual[i] ?? 0), 0);
        const cBudget = cActiveIndices.length > 0
          ? cActiveIndices.reduce((s, i) => s + (totalBudget[i] ?? 0), 0)
          : totalBudget.reduce((s, v) => s + v, 0);
        const cVar = cActual - cBudget;
        const cVarPct = cBudget > 0 ? (cVar / cBudget) * 100 : 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cActiveParams = (cParams as any[]).slice(0, 30).map((p) => {
          const pb = ensureArr(p.monthly_budget);
          const pa = ensureArr(p.monthly_actual);
          const bTotal = cActiveIndices.reduce((s: number, i: number) => s + (pb[i] ?? 0), 0);
          const aTotal = cActiveIndices.reduce((s: number, i: number) => s + (pa[i] ?? 0), 0);
          const dTotal = aTotal - bTotal;
          return { paramName: p.label as string, unitType: (p.unit_type ?? 'TL') as string,
            budgetTotal: bTotal, actualTotal: aTotal, diff: dTotal,
            diffPct: bTotal > 0 ? dTotal / bTotal * 100 : null, isKey: isKeyParam(p.label as string, c.id) };
        }).filter((p) => p.budgetTotal !== 0 || p.actualTotal !== 0);

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
              <ChartWrapper height={320}>
                {(w, h) => (
                  <BarChart width={w} height={h} data={monthlyData} margin={{ top: 4, right: 8, bottom: 4, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} width={68} />
                    <Tooltip content={<BarTooltip />} />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8, color: axisColor }} />
                    {CATEGORIES.map((cat) => (
                      <Bar key={cat.id} dataKey={cat.id} name={cat.name} stackId="a" fill={CATEGORY_COLORS[cat.id]} />
                    ))}
                  </BarChart>
                )}
              </ChartWrapper>
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
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      if (!lineItemsData || (lineItemsData as any[]).length === 0) {
                        alert('Veri yüklenemedi');
                        return;
                      }
                      setIsExecPdfLoading(true);
                      try {
                        const CAT_EN: Record<string, string> = {
                          'Güvenlik': 'Security', 'Temizlik': 'Cleaning',
                          'Yemek': 'Food/Catering', 'Servis/Ulaşım': 'Transportation',
                          'Araç Kira': 'Vehicle Rental', 'HGS': 'HGS/Toll',
                          'Araç Yakıt': 'Vehicle Fuel', 'Araç Bakım': 'Vehicle Maintenance',
                          'İçme Suyu': 'Water', 'Diğer Hizmet': 'Other Services',
                          'Diğer Çeşitli': 'Miscellaneous',
                        };

                        const aiResults = await Promise.allSettled(
                          CATEGORIES.map(async (c) => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const cItems = (lineItemsData as any[]).filter((i: any) => i.category_code === c.id);
                            const cTotal = mergeTotalRows(cItems.filter((i: any) => i.row_type === 'total'));
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const cParams = cItems.filter((i: any) => i.row_type === 'param');
                            const ensureArr = (v: unknown): number[] => {
                              if (!v) return Array(12).fill(0);
                              if (typeof v === 'string') { try { return JSON.parse(v); } catch { return Array(12).fill(0); } }
                              return Array.isArray(v) ? v as number[] : Array(12).fill(0);
                            };
                            const totalBudget = ensureArr(cTotal?.monthly_budget);
                            const totalActual = ensureArr(cTotal?.monthly_actual);
                            const activeIdxs = totalActual.map((v, i) => v !== 0 ? i : -1).filter(i => i >= 0);
                            const cMonthly = MONTH_LABELS.map((m, i) => ({ month: m, budget: totalBudget[i] ?? 0, actual: totalActual[i] ?? 0 }));
                            const activeBudget = activeIdxs.length > 0 ? activeIdxs.reduce((s, i) => s + (totalBudget[i] ?? 0), 0) : totalBudget.reduce((s, v) => s + v, 0);
                            const activeActual = activeIdxs.reduce((s, i) => s + (totalActual[i] ?? 0), 0);
                            const activeVar = activeActual - activeBudget;
                            const activeVarPct = activeBudget > 0 ? (activeVar / activeBudget) * 100 : 0;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            // GRUP: ICA ve ICE total satırlarını ayrı parse et
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const cTotals2 = cItems.filter((i: any) => i.row_type === 'total');
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const cIcaTotal2 = company === 'GRUP' ? (cTotals2.find((t: any) => t.company === 'ICA') ?? null) : null;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const cIceTotal2 = company === 'GRUP' ? (cTotals2.find((t: any) => t.company === 'ICE') ?? null) : null;
                            const cIcaBudget2 = ensureArr(cIcaTotal2?.monthly_budget);
                            const cIcaActual2 = ensureArr(cIcaTotal2?.monthly_actual);
                            const cIceBudget2 = ensureArr(cIceTotal2?.monthly_budget);
                            const cIceActual2 = ensureArr(cIceTotal2?.monthly_actual);
                            const params = (cParams as any[]).slice(0, 30).map((p) => {
                              const pb = ensureArr(p.monthly_budget);
                              const pa = ensureArr(p.monthly_actual);
                              const bv = activeIdxs.reduce((s: number, i: number) => s + (pb[i] ?? 0), 0);
                              const av = activeIdxs.reduce((s: number, i: number) => s + (pa[i] ?? 0), 0);
                              return { paramName: p.label as string, unitType: (p.unit_type ?? 'TL') as string, company: (p.company ?? null) as string | null,
                                budget: bv, actual: av, diff: av - bv, diffPct: bv > 0 ? (av - bv) / bv * 100 : null };
                            }).filter((p) => p.budget !== 0 || p.actual !== 0)
                              .sort((a, b) => (isKeyParam(a.paramName, c.id) ? 0 : 1) - (isKeyParam(b.paramName, c.id) ? 0 : 1));
                            // GRUP: şirket bazlı kırılım (tüm yıl)
                            const execFullYearIdxs = Array.from({ length: 12 }, (_, i) => i);
                            const execCompanyBreakdown = company === 'GRUP' && (cIcaTotal2 || cIceTotal2) ? (() => {
                              const icaPB2 = execFullYearIdxs.reduce((s, i) => s + (cIcaBudget2[i] ?? 0), 0);
                              const icaPA2 = execFullYearIdxs.reduce((s, i) => s + (cIcaActual2[i] ?? 0), 0);
                              const icePB2 = execFullYearIdxs.reduce((s, i) => s + (cIceBudget2[i] ?? 0), 0);
                              const icePA2 = execFullYearIdxs.reduce((s, i) => s + (cIceActual2[i] ?? 0), 0);
                              const icaVar2 = icaPA2 - icaPB2;
                              const iceVar2 = icePA2 - icePB2;
                              const netBudget2 = icaPB2 + icePB2;
                              return {
                                ICA: { budget: icaPB2, actual: icaPA2, variance: icaVar2, variancePercent: icaPB2 > 0 ? (icaVar2 / icaPB2) * 100 : 0 },
                                ICE: { budget: icePB2, actual: icePA2, variance: iceVar2, variancePercent: icePB2 > 0 ? (iceVar2 / icePB2) * 100 : 0 },
                                net: { budget: netBudget2, actual: icaPA2 + icePA2, variance: icaVar2 + iceVar2, variancePercent: netBudget2 > 0 ? ((icaVar2 + iceVar2) / netBudget2) * 100 : 0, balanced: icaVar2 * iceVar2 < 0 },
                              };
                            })() : null;
                            const res = await fetch('/api/analyze-variance', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ mode: 'category', categoryName: c.name, budgetTotal: activeBudget, actualTotal: activeActual, varianceAmount: activeVar, variancePercent: activeVarPct, monthlyData: cMonthly, parameters: params, activeMonths: activeIdxs, analysisScope: 'full', companyBreakdown: execCompanyBreakdown, isGroupView: company === 'GRUP', periodLabel: 'Tüm Yıl' }),
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
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const cItems = (lineItemsData as any[]).filter((i: any) => i.category_code === c.id);
                          const cTotal = mergeTotalRows(cItems.filter((i: any) => i.row_type === 'total'));
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const cParams = cItems.filter((i: any) => i.row_type === 'param');
                          const ensureArr = (v: unknown): number[] => {
                            if (!v) return Array(12).fill(0);
                            if (typeof v === 'string') { try { return JSON.parse(v); } catch { return Array(12).fill(0); } }
                            return Array.isArray(v) ? v as number[] : Array(12).fill(0);
                          };
                          const totalBudget = ensureArr(cTotal?.monthly_budget);
                          const totalActual = ensureArr(cTotal?.monthly_actual);
                          const cActiveIndices = totalActual.map((v, i) => v !== 0 ? i : -1).filter(i => i >= 0);
                          const cMonthly = Array.from({ length: 12 }, (_, mi) => ({ month: mi + 1, budget: totalBudget[mi] ?? 0, actual: totalActual[mi] ?? 0 }));
                          const cActual = cActiveIndices.reduce((s, i) => s + (totalActual[i] ?? 0), 0);
                          const cBudget = cActiveIndices.length > 0 ? cActiveIndices.reduce((s, i) => s + (totalBudget[i] ?? 0), 0) : totalBudget.reduce((s, v) => s + v, 0);
                          const cVar = cActual - cBudget;
                          const cVarPct = cBudget > 0 ? (cVar / cBudget) * 100 : 0;
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const cActiveParams = (cParams as any[]).slice(0, 30).map((p) => {
                            const pb = ensureArr(p.monthly_budget);
                            const pa = ensureArr(p.monthly_actual);
                            const bTotal = cActiveIndices.reduce((s: number, i: number) => s + (pb[i] ?? 0), 0);
                            const aTotal = cActiveIndices.reduce((s: number, i: number) => s + (pa[i] ?? 0), 0);
                            const dTotal = aTotal - bTotal;
                            return { paramName: p.label as string, unitType: (p.unit_type ?? 'TL') as string,
                              budgetTotal: bTotal, actualTotal: aTotal, diff: dTotal,
                              diffPct: bTotal > 0 ? dTotal / bTotal * 100 : null, isKey: isKeyParam(p.label as string, c.id) };
                          }).filter((p) => p.budgetTotal !== 0 || p.actualTotal !== 0);
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
                      // guvenlik + temizlik moved to budget_line_items — read annual sum from there
                      const liCategories = ['guvenlik', 'temizlik', 'yemek', 'servis', 'arac_kira', 'hgs', 'arac_yakit', 'arac_bakim', 'diger_hizmet', 'icme_suyu', 'diger_cesitli'];
                      const liTotalItem = liCategories.includes(cat.id)
                        ? mergeTotalRows(
                            (lineItemsData as any[]).filter(
                              (i: any) => i.category_code === cat.id && i.row_type === 'total'
                            )
                          )
                        : null;
                      const liAnnual = liTotalItem
                        ? (Array.isArray(liTotalItem.monthly_budget)
                            ? (liTotalItem.monthly_budget as number[]).reduce((a: number, b: number) => a + b, 0)
                            : 0)
                        : 0;
                      const catTotal = liCategories.includes(cat.id)
                        ? liAnnual
                        : categoryAnnual(staticMonthlyData, cat.id);
                      const share       = categoryShare(catTotal, total2025);
                      const isOpen      = selectedCategory === cat.id;
                      const catColor    = CATEGORY_COLORS[cat.id];

                      // ── drill-down hesaplamalar ──
                      const t25 = catTotal;
                      const t26 = categoryAnnual(projection2026, cat.id);
                      const diff = t26 - t25;
                      const diffPctCat = variancePct(t25, t26);

                      // 2025 Fiili — liCategories için budget_line_items'tan, diğerleri için importedModelData
                      const cat2025Actual = (() => {
                        if (liCategories.includes(cat.id)) {
                          // Use lineItemsData with the same HGS/İçme Suyu pass-through fallback:
                          // if total row actuals are all zero, sum dept actuals instead.
                          const ensureArr = (v: unknown): number[] => {
                            if (!v) return Array(12).fill(0);
                            if (typeof v === 'string') { try { return JSON.parse(v) as number[]; } catch { return Array(12).fill(0); } }
                            return Array.isArray(v) ? (v as number[]) : Array(12).fill(0);
                          };
                          const liItems = (lineItemsData as any[]).filter((i: any) => i.category_code === cat.id);
                          const liTotal = mergeTotalRows(liItems.filter((i: any) => i.row_type === 'total'));
                          const totalActual = ensureArr(liTotal?.monthly_actual);
                          const effective = totalActual.some((v: number) => v > 0)
                            ? totalActual
                            : liItems
                                .filter((i: any) => i.row_type === 'dept')
                                .reduce((acc: number[], d: any) => {
                                  const da = ensureArr(d.monthly_actual);
                                  return acc.map((v, idx) => v + (da[idx] ?? 0));
                                }, Array(12).fill(0) as number[]);
                          const total = effective.reduce((s: number, v: number) => s + v, 0);
                          return total > 0 ? total : null;
                        }
                        // Non-liCategory: use importedModelData
                        if (!importedModelData) return null;
                        const range = CAT_ROW_RANGES[cat.id];
                        const rows = range
                          ? importedModelData.filter((r) => r.rowNum >= range[0] && r.rowNum <= range[1])
                          : [];
                        const mainRow = findMainTotalRow(cat.id, rows);
                        if (!mainRow) return null;
                        return mainRow.actual.reduce((s, v) => s + v, 0);
                      })();

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

                      const showDept =
                        (company === 'ICA' && !!deptRow) ||   // ICA: statik ICA_DEPT bazlı
                        (company === 'GRUP');                   // GRUP: yeni dinamik görünüm

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
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                      {[
                                        { label: '2025 Bütçe',       value: fmtFull(t25), cls: 'text-gray-900 dark:text-white' },
                                        { label: '2025 Fiili',        value: cat2025Actual !== null ? fmtFull(cat2025Actual) : '—', cls: 'text-amber-600 dark:text-amber-400' },
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

                                    {/* grafikler — generic categories use GenericCategoryPanel below; skip old static charts for them */}
                                    {!(['arac_kira','hgs','arac_yakit','arac_bakim','diger_hizmet','icme_suyu','diger_cesitli'] as const).includes(cat.id as never) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                                      {/* aylık trend */}
                                      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
                                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">Aylık Trend — 2025</p>
                                        <ChartWrapper height={180}>
                                          {(w, h) => (
                                            <LineChart width={w} height={h} data={catTrendData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                              <XAxis dataKey="month" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
                                              <YAxis tickFormatter={fmt} tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} width={52} />
                                              <Tooltip
                                                formatter={(v) => [fmtFull(Number(v)), cat.name]}
                                                contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 6, fontSize: 11 }}
                                              />
                                              <Line type="monotone" dataKey="value" stroke={catColor} strokeWidth={2} dot={{ r: 2.5, fill: catColor }} activeDot={{ r: 4 }} />
                                            </LineChart>
                                          )}
                                        </ChartWrapper>
                                      </div>

                                      {/* departman bar chart */}
                                      {showDept && deptBarData.length > 0 ? (
                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
                                          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">
                                            Departman Dağılımı — ICA
                                          </p>
                                          <ChartWrapper height={180}>
                                            {(w, h) => (
                                              <BarChart layout="vertical" width={w} height={h} data={deptBarData} margin={{ top: 0, right: 52, bottom: 0, left: 8 }}>
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
                                            )}
                                          </ChartWrapper>
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
                                    </div>}

                                    {/* ── Güvenlik 3-level panel (ICA only) ── */}
                                    {cat.id === 'guvenlik' && company !== 'ICE' && (
                                      <GuvenlikDetailPanel
                                        dark={dark}
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        lineItems={lineItemsData.filter((i: any) => i.category_code === 'guvenlik')}
                                      />
                                    )}

                                    {/* ── Temizlik 3-level panel (ICA only) ── */}
                                    {cat.id === 'temizlik' && company !== 'ICE' && (
                                      <TemizlikDetailPanel
                                        dark={dark}
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        lineItems={lineItemsData.filter((i: any) => i.category_code === 'temizlik')}
                                      />
                                    )}

                                    {/* ── Yemek 3-level panel (ICA only) ── */}
                                    {cat.id === 'yemek' && company !== 'ICE' && (
                                      <YemekDetailPanel
                                        dark={dark}
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        lineItems={lineItemsData.filter((i: any) => i.category_code === 'yemek')}
                                      />
                                    )}

                                    {/* ── Servis dept-totals panel (ICA only) ── */}
                                    {cat.id === 'servis' && company !== 'ICE' && (
                                      <ServisDetailPanel
                                        dark={dark}
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        lineItems={lineItemsData.filter((i: any) => i.category_code === 'servis')}
                                      />
                                    )}

                                    {/* ── Generic panels: Araç Kira / HGS / Yakıt / Bakım / Diğer
                                        + ICE fallback for temizlik / yemek / servis ── */}
                                    {(() => {
                                      const iceExtra = company === 'ICE' ? ['temizlik', 'yemek', 'servis'] : [];
                                      const genericCats = [
                                        'arac_kira', 'hgs', 'arac_yakit', 'arac_bakim',
                                        'diger_hizmet', 'icme_suyu', 'diger_cesitli',
                                        ...iceExtra,
                                      ];
                                      if (!genericCats.includes(cat.id)) return null;
                                      const colorMap: Record<string, string> = {
                                        arac_kira:     '#f97316',
                                        hgs:           '#06b6d4',
                                        arac_yakit:    '#84cc16',
                                        arac_bakim:    '#f43f5e',
                                        diger_hizmet:  '#a78bfa',
                                        icme_suyu:     '#22d3ee',
                                        diger_cesitli: '#fb923c',
                                        temizlik:      '#10b981',
                                        yemek:         '#f59e0b',
                                        servis:        '#3b82f6',
                                      };
                                      return (
                                        <GenericCategoryPanel
                                          categoryCode={cat.id}
                                          categoryLabel={cat.name}
                                          dark={dark}
                                          color={colorMap[cat.id] ?? '#6366f1'}
                                          isGroupView={company === 'GRUP'}
                                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                          lineItems={lineItemsData.filter((i: any) => i.category_code === cat.id)}
                                        />
                                      );
                                    })()}

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

                                    {/* aylık alt kalem detay tablosu — lineItemsData'dan row_type==='item' */}
                                    {(() => {
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const ensureArr = (v: unknown): number[] => {
                                        if (!v) return Array(12).fill(0);
                                        if (typeof v === 'string') { try { return JSON.parse(v) as number[]; } catch { return Array(12).fill(0); } }
                                        return Array.isArray(v) ? (v as number[]) : Array(12).fill(0);
                                      };

                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const catItems = (lineItemsData as any[]).filter(
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        (i: any) => i.category_code === cat.id && i.row_type === 'item'
                                      );
                                      // NOTE: do NOT early-return here on catItems.length === 0.
                                      // Some categories (e.g. ICA diger_cesitli) have no item rows but DO have
                                      // dept rows; the fallback below promotes dept rows into items.
                                      // We null-check AFTER groupMap construction (see `if (groupKeys.length === 0)`).

                                      // GRUP modunda aynı dept_code iki şirkette de olabilir (örn. temizlik_malzeme).
                                      // Çakışmayı önlemek için GRUP'ta key = "COMPANY__dept_code" kullan.
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const makeGroupKey = (co: string, deptCode: string | null) =>
                                        company === 'GRUP'
                                          ? `${co}__${deptCode ?? '__none__'}`
                                          : (deptCode ?? '__none__');

                                      // dept_code → label map (from dept rows)
                                      const deptLabelMap = new Map<string, string>();
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      (lineItemsData as any[])
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        .filter((i: any) => i.category_code === cat.id && i.row_type === 'dept')
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        .forEach((i: any) => {
                                          if (i.dept_code) deptLabelMap.set(makeGroupKey(i.company ?? 'ICA', i.dept_code), i.label);
                                        });

                                      // group items by (compound) key
                                      const groupMap = new Map<string, typeof catItems>();
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      catItems.forEach((item: any) => {
                                        const key = makeGroupKey(item.company ?? 'ICA', item.dept_code);
                                        if (!groupMap.has(key)) groupMap.set(key, []);
                                        groupMap.get(key)!.push(item);
                                      });

                                      // dept'ları tara: itemRows boş olan dept'lar (Kilyos gibi)
                                      // için dept satırını tek item olarak ekle
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      (lineItemsData as any[])
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        .filter((i: any) => i.category_code === cat.id && i.row_type === 'dept' && i.dept_code)
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        .forEach((deptRow: any) => {
                                          const key = makeGroupKey(deptRow.company ?? 'ICA', deptRow.dept_code as string);
                                          if (!groupMap.has(key)) {
                                            groupMap.set(key, [{
                                              ...deptRow,
                                              item_code:  `${key}_dept_fallback`,
                                              label:      `${deptRow.label} Toplamı`,
                                              unit_type:  'TL',
                                            }]);
                                          }
                                        });

                                      const groupKeys = Array.from(groupMap.keys());
                                      if (groupKeys.length === 0) return null;

                                      // GRUP: compound key'den company çıkar (prefix "ICA__" / "ICE__")
                                      const deptCompanyMap = new Map<string, 'ICA' | 'ICE'>();
                                      groupKeys.forEach((key) => {
                                        deptCompanyMap.set(key, key.startsWith('ICE__') ? 'ICE' : 'ICA');
                                      });
                                      const icaDeptKeys = groupKeys.filter((k) => deptCompanyMap.get(k) === 'ICA');
                                      const iceDeptKeys = groupKeys.filter((k) => deptCompanyMap.get(k) === 'ICE');

                                      // grand total — groupMap üzerinden hesapla (fallback dept satırları da dahil)
                                      const grandTotal = Array(12).fill(0) as number[];
                                      groupMap.forEach((items) => {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        items.forEach((item: any) => {
                                          ensureArr(item.monthly_budget).forEach((v: number, idx: number) => { grandTotal[idx] += v; });
                                        });
                                      });
                                      const grandAnnual = grandTotal.reduce((s, v) => s + v, 0);

                                      const searchLower = ddSearch.trim().toLowerCase();
                                      const isTL = (unit: string) => unit === 'TL' || unit === 'TL Karşılığı';

                                      // Dept accordion render helper — kullanılır hem flat ICA/ICE view'da, hem GRUP içi dept listesinde
                                      const renderDeptAccordion = (deptKey: string) => {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const groupItems = groupMap.get(deptKey)! as any[];
                                        // GRUP: key is "COMPANY__dept_code"; strip prefix for display fallback
                                        const deptKeyBase = company === 'GRUP' ? deptKey.replace(/^[^_]+__/, '') : deptKey;
                                        const deptLabel = deptKeyBase === '__none__'
                                          ? cat.name
                                          : (deptLabelMap.get(deptKey) ?? deptKeyBase);

                                        const filtered = searchLower
                                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                          ? groupItems.filter((it: any) => it.label.toLowerCase().includes(searchLower))
                                          : groupItems;
                                        if (searchLower && filtered.length === 0) return null;

                                        const isGroupOpen = ddOpenGroups.has(deptKey);
                                        const showCount   = ddShowMore[deptKey] ?? 20;
                                        const visible     = filtered.slice(0, showCount);
                                        const remaining   = filtered.length - showCount;

                                        // group total (sum of ALL items in group, not just visible)
                                        const groupTotal = Array(12).fill(0) as number[];
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        groupItems.forEach((item: any) => {
                                          ensureArr(item.monthly_budget).forEach((v: number, idx: number) => { groupTotal[idx] += v; });
                                        });
                                        const groupAnnual = groupTotal.reduce((s, v) => s + v, 0);

                                        return (
                                          <div key={deptKey} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                            {/* grup başlık butonu */}
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDdOpenGroups((prev) => {
                                                  const next = new Set(prev);
                                                  if (next.has(deptKey)) next.delete(deptKey);
                                                  else next.add(deptKey);
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
                                                {deptLabel}
                                              </span>
                                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                                {groupItems.length} kalem
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
                                                          Kalem
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
                                                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                                      {visible.map((item: any) => {
                                                        const mb = ensureArr(item.monthly_budget);
                                                        const annual = mb.reduce((s: number, v: number) => s + v, 0);
                                                        const useTL = isTL(item.unit_type ?? 'TL');
                                                        return (
                                                          <tr key={item.item_code ?? item.label} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                                            <td className="px-4 pl-7 py-1.5 text-gray-700 dark:text-gray-300">
                                                              {item.label}
                                                            </td>
                                                            {mb.map((v: number, mi: number) => (
                                                              <td key={mi} className="px-1.5 py-1.5 text-right font-mono text-gray-600 dark:text-gray-400">
                                                                {useTL ? fmtShort(v) : v.toLocaleString('tr-TR')}
                                                              </td>
                                                            ))}
                                                            <td className="px-3 py-1.5 text-right font-mono font-semibold text-gray-800 dark:text-gray-200">
                                                              {useTL ? fmtShort(annual) : annual.toLocaleString('tr-TR')}
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
                                                        {groupTotal.map((v, mi) => (
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
                                                        [deptKey]: showCount + 20,
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
                                      };

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
                                          {company === 'GRUP' ? (
                                            // GRUP: iki üst-grup accordion (ICA + ICE)
                                            (() => {
                                              const buildGroupStats = (keys: string[]) => {
                                                let totalItems = 0;
                                                const monthlySum = Array(12).fill(0) as number[];
                                                keys.forEach((k) => {
                                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                  const items = groupMap.get(k)! as any[];
                                                  totalItems += items.length;
                                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                  items.forEach((item: any) => {
                                                    ensureArr(item.monthly_budget).forEach((v: number, idx: number) => { monthlySum[idx] += v; });
                                                  });
                                                });
                                                return { totalItems, annual: monthlySum.reduce((s, v) => s + v, 0) };
                                              };

                                              const companyGroups = [
                                                { key: 'ICA' as const, label: 'ICA Departmanları', keys: icaDeptKeys },
                                                { key: 'ICE' as const, label: 'ICE Departmanları', keys: iceDeptKeys },
                                              ].filter((g) => g.keys.length > 0);

                                              return companyGroups.map((grp) => {
                                                const groupKey = `__company_${grp.key}`;
                                                const isOpen = ddOpenGroups.has(groupKey);
                                                const stats = buildGroupStats(grp.keys);
                                                const isICA = grp.key === 'ICA';
                                                return (
                                                  <div key={groupKey} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDdOpenGroups((prev) => {
                                                          const next = new Set(prev);
                                                          if (next.has(groupKey)) next.delete(groupKey);
                                                          else next.add(groupKey);
                                                          return next;
                                                        });
                                                      }}
                                                      className={`w-full flex items-center gap-2 px-4 py-3 text-left transition-colors ${
                                                        isICA
                                                          ? 'bg-indigo-50/60 dark:bg-indigo-950/20 hover:bg-indigo-100/60 dark:hover:bg-indigo-950/40'
                                                          : 'bg-sky-50/60 dark:bg-sky-950/20 hover:bg-sky-100/60 dark:hover:bg-sky-950/40'
                                                      }`}
                                                    >
                                                      <span
                                                        className="text-gray-500 dark:text-gray-400 text-[10px] transition-transform duration-200 flex-shrink-0"
                                                        style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                                                      >▶</span>
                                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                                                        isICA
                                                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                                                          : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                                      }`}>{grp.key}</span>
                                                      <span className={`text-xs font-semibold flex-1 text-left ${isICA ? 'text-indigo-700 dark:text-indigo-300' : 'text-sky-700 dark:text-sky-300'}`}>
                                                        {grp.label}
                                                      </span>
                                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {stats.totalItems} kalem · {grp.keys.length} dept
                                                      </span>
                                                      <span className="text-xs font-mono font-semibold text-gray-800 dark:text-gray-100 ml-3">
                                                        {fmtShort(stats.annual)}
                                                      </span>
                                                    </button>
                                                    {isOpen && (
                                                      <div className="pl-4 border-t border-gray-100 dark:border-gray-800">
                                                        {grp.keys.map((deptKey) => renderDeptAccordion(deptKey))}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              });
                                            })()
                                          ) : (
                                            // ICA / ICE: flat dept listesi (mevcut davranış)
                                            groupKeys.map((deptKey) => renderDeptAccordion(deptKey))
                                          )}

                                          {/* Genel Toplam */}
                                          <div className="overflow-x-auto border-t-2 border-gray-300 dark:border-gray-600" style={{ backgroundColor: `${catColor}10` }}>
                                            <table className="w-full min-w-[900px] text-xs">
                                              <tbody>
                                                <tr>
                                                  <td className="px-4 py-2 font-bold text-gray-900 dark:text-white min-w-[180px]">
                                                    Genel Toplam
                                                  </td>
                                                  {grandTotal.map((v, mi) => (
                                                    <td key={mi} className="px-1.5 py-2 text-right font-mono font-bold text-gray-900 dark:text-white min-w-[52px]">
                                                      {fmtShort(v)}
                                                    </td>
                                                  ))}
                                                  <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white min-w-[72px]">
                                                    {fmtShort(grandAnnual)}
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* departman detay tablosu */}
                                    {showDept && (<>

                                    {/* ── GRUP: Şirket Kırılımı (her zaman görünür) ── */}
                                    {company === 'GRUP' && (() => {
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const totalRows = (lineItemsData as any[]).filter(
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        (i: any) => i.category_code === cat.id && i.row_type === 'total'
                                      );
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const icaTotalRow = totalRows.find((r: any) => r.company === 'ICA');
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const iceTotalRow = totalRows.find((r: any) => r.company === 'ICE');
                                      const ensureArr = (v: unknown): number[] => {
                                        if (!v) return Array(12).fill(0);
                                        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return Array(12).fill(0); } }
                                        return Array.isArray(v) ? v as number[] : Array(12).fill(0);
                                      };
                                      const icaAnnual = icaTotalRow ? ensureArr(icaTotalRow.monthly_budget).reduce((s: number, v: number) => s + v, 0) : 0;
                                      const iceAnnual = iceTotalRow ? ensureArr(iceTotalRow.monthly_budget).reduce((s: number, v: number) => s + v, 0) : 0;
                                      const grandTotal = icaAnnual + iceAnnual;
                                      if (grandTotal === 0) return null;
                                      const icaShare = (icaAnnual / grandTotal) * 100;
                                      const iceShare = (iceAnnual / grandTotal) * 100;
                                      return (
                                        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-3">
                                          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                                            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Şirket Kırılımı</p>
                                          </div>
                                          <div className="overflow-x-auto">
                                            <table className="w-full min-w-[380px] text-xs">
                                              <thead className="bg-gray-50 dark:bg-gray-800">
                                                <tr>
                                                  {['Şirket','Yıllık Tutar','Pay %','Aylık Ort.'].map((h, i) => (
                                                    <th key={h} className={`px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                                {icaAnnual > 0 && (
                                                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                    <td className="px-4 py-2 flex items-center gap-1.5">
                                                      <span className="w-2 h-2 rounded-sm flex-shrink-0 bg-indigo-500" />
                                                      <span className="font-medium text-gray-800 dark:text-gray-200">ICA</span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">{fmtFull(icaAnnual)}</td>
                                                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{icaShare.toFixed(1)}%</td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{fmtFull(Math.round(icaAnnual / 12))}</td>
                                                  </tr>
                                                )}
                                                {iceAnnual > 0 && (
                                                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                    <td className="px-4 py-2 flex items-center gap-1.5">
                                                      <span className="w-2 h-2 rounded-sm flex-shrink-0 bg-sky-500" />
                                                      <span className="font-medium text-gray-800 dark:text-gray-200">ICE</span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">{fmtFull(iceAnnual)}</td>
                                                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{iceShare.toFixed(1)}%</td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{fmtFull(Math.round(iceAnnual / 12))}</td>
                                                  </tr>
                                                )}
                                              </tbody>
                                              <tfoot className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                                                <tr>
                                                  <td className="px-4 py-2 font-bold text-gray-800 dark:text-gray-100">Toplam</td>
                                                  <td className="px-4 py-2 text-right font-bold font-mono text-gray-900 dark:text-white">{fmtFull(grandTotal)}</td>
                                                  <td className="px-4 py-2 text-right font-bold text-gray-700 dark:text-gray-300">100%</td>
                                                  <td className="px-4 py-2 text-right font-bold font-mono text-gray-700 dark:text-gray-300">{fmtFull(Math.round(grandTotal / 12))}</td>
                                                </tr>
                                              </tfoot>
                                            </table>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* ── GRUP: Departman Detayı Accordion ── */}
                                    {company === 'GRUP' && (() => {
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const deptRows = (lineItemsData as any[]).filter(
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        (i: any) => i.category_code === cat.id && i.row_type === 'dept'
                                      );
                                      if (deptRows.length === 0) return null;
                                      const ensureArr = (v: unknown): number[] => {
                                        if (!v) return Array(12).fill(0);
                                        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return Array(12).fill(0); } }
                                        return Array.isArray(v) ? v as number[] : Array(12).fill(0);
                                      };
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const deptTotalSum = deptRows.reduce((s: number, r: any) =>
                                        s + ensureArr(r.monthly_budget).reduce((ss: number, v: number) => ss + v, 0), 0
                                      );
                                      return (
                                        <details className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden group">
                                          <summary className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 cursor-pointer flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/60 list-none">
                                            <div className="flex items-center gap-2">
                                              <svg className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                              </svg>
                                              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Departman Detayı</p>
                                              <span className="text-xs text-gray-400">({deptRows.length} departman)</span>
                                            </div>
                                          </summary>
                                          <div className="overflow-x-auto">
                                            <table className="w-full min-w-[500px] text-xs">
                                              <thead className="bg-gray-50 dark:bg-gray-800">
                                                <tr>
                                                  {['Şirket','Departman','Yıllık Tutar','Pay %','Aylık Ort.'].map((h, i) => (
                                                    <th key={h} className={`px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                                {deptRows
                                                  .slice()
                                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                  .sort((a: any, b: any) => {
                                                    if (a.company !== b.company) return a.company === 'ICA' ? -1 : 1;
                                                    return (a.dept_code ?? '').localeCompare(b.dept_code ?? '');
                                                  })
                                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                  .map((d: any) => {
                                                    const annual = ensureArr(d.monthly_budget).reduce((s: number, v: number) => s + v, 0);
                                                    if (annual === 0) return null;
                                                    const share = deptTotalSum > 0 ? (annual / deptTotalSum) * 100 : 0;
                                                    return (
                                                      <tr key={`${d.company}-${d.dept_code}`} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                        <td className="px-4 py-2">
                                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${d.company === 'ICA' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${d.company === 'ICA' ? 'bg-indigo-500' : 'bg-sky-500'}`} />
                                                            {d.company}
                                                          </span>
                                                        </td>
                                                        <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200">{d.label}</td>
                                                        <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">{fmtFull(annual)}</td>
                                                        <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{share.toFixed(1)}%</td>
                                                        <td className="px-4 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{fmtFull(Math.round(annual / 12))}</td>
                                                      </tr>
                                                    );
                                                  })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </details>
                                      );
                                    })()}

                                    {/* ── ICA: eski statik ICA_DEPT bazlı tablo (değişmedi) ── */}
                                    {company !== 'GRUP' && deptRow && (
                                      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                                          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Departman Detayı</p>
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
                                            </tbody>
                                            <tfoot className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                                              <tr>
                                                <td className="px-4 py-2 font-bold text-gray-800 dark:text-gray-100">ICA Toplam</td>
                                                <td className="px-4 py-2 text-right font-bold font-mono text-gray-900 dark:text-white">{fmtFull(catTotal)}</td>
                                                <td className="px-4 py-2 text-right font-bold text-gray-700 dark:text-gray-300">100%</td>
                                                <td className="px-4 py-2 text-right font-bold font-mono text-gray-700 dark:text-gray-300">{fmtFull(Math.round(catTotal / 12))}</td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      </div>
                                    )}

                                    </>)}

                                    </>) /* end Aylık Detay tab */}

                                    {/* ── TAB: Varyans Analizi ── */}
                                    {ddActiveTab === 'variance' && (() => {
                                      const ensureArr = (v: unknown): number[] => {
                                        if (!v) return Array(12).fill(0);
                                        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return Array(12).fill(0); } }
                                        return Array.isArray(v) ? v as number[] : Array(12).fill(0);
                                      };
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const varLineItems = (lineItemsData as any[]).filter((i: any) => i.category_code === cat.id);
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const allTotalRows = varLineItems.filter((i: any) => i.row_type === 'total');
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const icaTotal = allTotalRows.find((t: any) => t.company === 'ICA') ?? null;
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const iceTotal = allTotalRows.find((t: any) => t.company === 'ICE') ?? null;
                                      const singleTotal = allTotalRows[0] ?? null;
                                      const varTotal = company === 'GRUP' ? (icaTotal || iceTotal) : singleTotal;
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const varDepts  = varLineItems.filter((i: any) => i.row_type === 'dept');
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const varParams = varLineItems.filter((i: any) => i.row_type === 'param');
                                      if (!varTotal) {
                                        return (
                                          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
                                            <p className="text-sm text-gray-400">Bu kategori için veri bulunamadı</p>
                                          </div>
                                        );
                                      }

                                      // GRUP: element-wise sum of ICA + ICE monthly arrays
                                      const icaBudget = icaTotal ? ensureArr(icaTotal.monthly_budget) : Array(12).fill(0);
                                      const icaActual = icaTotal ? ensureArr(icaTotal.monthly_actual) : Array(12).fill(0);
                                      const iceBudget = iceTotal ? ensureArr(iceTotal.monthly_budget) : Array(12).fill(0);
                                      const iceActual = iceTotal ? ensureArr(iceTotal.monthly_actual) : Array(12).fill(0);

                                      const totalBudgetArr = company === 'GRUP'
                                        ? icaBudget.map((v: number, i: number) => v + iceBudget[i])
                                        : ensureArr(varTotal.monthly_budget);
                                      const totalActualArr = company === 'GRUP'
                                        ? icaActual.map((v: number, i: number) => v + iceActual[i])
                                        : ensureArr(varTotal.monthly_actual);

                                      const hasActual = totalActualArr.some((v) => v !== 0);
                                      const monthsWithActual = totalActualArr
                                        .map((v, i) => v !== 0 ? i : -1)
                                        .filter((i) => i >= 0);
                                      const safeMonth = monthsWithActual.includes(varMonth)
                                        ? varMonth
                                        : (monthsWithActual[monthsWithActual.length - 1] ?? 0);

                                      const budgetTotal = totalBudgetArr[safeMonth] ?? 0;
                                      const actualTotal = totalActualArr[safeMonth] ?? 0;
                                      const diffTotal   = actualTotal - budgetTotal;
                                      const diffPctVar  = budgetTotal > 0 ? (diffTotal / budgetTotal) * 100 : 0;

                                      // top 5 sapma — dept satırları
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const top5 = (varDepts as any[])
                                        .map((d) => {
                                          const dBudArr = ensureArr(d.monthly_budget);
                                          const dActArr = ensureArr(d.monthly_actual);
                                          const lbl = (d.label ?? d.dept_code ?? '') as string;
                                          return {
                                            name: lbl.length > 22 ? lbl.slice(0, 22) + '…' : lbl,
                                            diff: Math.abs(dActArr[safeMonth] - dBudArr[safeMonth]),
                                            raw:  dActArr[safeMonth] - dBudArr[safeMonth],
                                          };
                                        })
                                        .filter((r) => r.diff > 0)
                                        .sort((a, b) => b.diff - a.diff)
                                        .slice(0, 5);

                                      // trend — lineItemsData total satırından
                                      const trendVarData = MONTH_LABELS.map((label, mi) => ({
                                        label,
                                        Bütçe: totalBudgetArr[mi] ?? 0,
                                        Fiili: totalActualArr[mi] ?? 0,
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
                                                <option key={m} value={mi} disabled={hasActual && !monthsWithActual.includes(mi)}>
                                                  {m}{hasActual && !monthsWithActual.includes(mi) ? ' (veri yok)' : ''}
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
                                                  <ChartWrapper height={180}>
                                                    {(w, h) => (
                                                      <BarChart layout="vertical" width={w} height={h} data={top5} margin={{ top: 0, right: 60, bottom: 0, left: 8 }}>
                                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                                                        <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
                                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} width={120} />
                                                        <Tooltip formatter={(v) => [fmtFull(Number(v)), 'Sapma']} contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 6, fontSize: 11 }} />
                                                        <Bar dataKey="diff" radius={[0, 3, 3, 0]} label={{ position: 'right', formatter: (v: unknown) => fmt(v as number), fontSize: 9, fill: axisColor }}>
                                                          {top5.map((d) => <Cell key={d.name} fill={d.raw > 0 ? '#ef4444' : '#22c55e'} />)}
                                                        </Bar>
                                                      </BarChart>
                                                    )}
                                                  </ChartWrapper>
                                                </div>
                                              ) : (
                                                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm flex items-center justify-center">
                                                  <p className="text-xs text-gray-400 text-center">Departman toplam satırı bulunamadı<br/>("Toplam" içeren TL satırı gerekli)</p>
                                                </div>
                                              )}
                                              {/* trend — mainTotalRow */}
                                              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
                                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Bütçe vs Fiili Trend</p>
                                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">{varTotal.label ?? cat.name}</p>
                                                <ChartWrapper height={165}>
                                                  {(w, h) => (
                                                    <LineChart width={w} height={h} data={trendVarData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
                                                      <YAxis tickFormatter={fmt} tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} width={52} />
                                                      <Tooltip formatter={(v) => [fmtFull(Number(v)), '']} contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 6, fontSize: 11 }} />
                                                      <Legend wrapperStyle={{ fontSize: 10 }} />
                                                      <Line type="monotone" dataKey="Bütçe" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="4 2" />
                                                      <Line type="monotone" dataKey="Fiili" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5 }} />
                                                    </LineChart>
                                                  )}
                                                </ChartWrapper>
                                              </div>
                                            </div>
                                          )}

                                          {/* ── Aksiyon butonları: Sapma Raporu + PDF ── */}
                                          {hasActual && (
                                            <div className="flex items-center justify-end gap-2">
                                              {/* Period Seçici */}
                                              <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs font-medium">
                                                {(['month', 'ytd', 'year'] as const).map((p) => (
                                                  <button
                                                    key={p}
                                                    onClick={(e) => { e.stopPropagation(); setSapmaPeriod(p); }}
                                                    className={`px-2.5 py-1.5 transition-colors ${sapmaPeriod === p ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-gray-700'}`}
                                                  >
                                                    {p === 'month' ? 'Tek Ay' : p === 'ytd' ? 'YTD' : 'Yıl'}
                                                  </button>
                                                ))}
                                              </div>
                                              {/* Sapma Raporu Oluştur */}
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setVarDrawerOpen(true);
                                                  setVarDrawerResult(null);
                                                  setVarDrawerError(null);
                                                  setVarDrawerLoading(true);
                                                  // Period seçiciye göre hangi ay indekslerini dahil edeceğimizi belirle
                                                  const periodIdxs: number[] = sapmaPeriod === 'month'
                                                    ? [safeMonth]
                                                    : sapmaPeriod === 'ytd'
                                                    ? Array.from({ length: safeMonth + 1 }, (_, i) => i)
                                                    : Array.from({ length: 12 }, (_, i) => i);
                                                  const periodLabel: string = sapmaPeriod === 'month'
                                                    ? MONTH_LABELS[safeMonth]
                                                    : sapmaPeriod === 'ytd'
                                                    ? `Ocak-${MONTH_LABELS[safeMonth]} (YTD)`
                                                    : 'Tum Yil';
                                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                  const params = (varParams as any[])
                                                    .map((r) => {
                                                      const bArr = ensureArr(r.monthly_budget);
                                                      const aArr = ensureArr(r.monthly_actual);
                                                      const bv = periodIdxs.reduce((s: number, mi) => s + (bArr[mi] ?? 0), 0);
                                                      const av = periodIdxs.reduce((s: number, mi) => s + (aArr[mi] ?? 0), 0);
                                                      const dv = av - bv;
                                                      const pName = (r.label ?? r.param_code ?? '') as string;
                                                      return { paramName: pName, unitType: (r.unit_type ?? 'TL') as string, company: r.company ?? null, budget: bv, actual: av, diff: dv, diffPct: bv > 0 ? (dv / bv) * 100 : null };
                                                    })
                                                    .filter((p) => p.budget !== 0 || p.actual !== 0)
                                                    .sort((a, b) => (isKeyParam(a.paramName, cat.id) ? 0 : 1) - (isKeyParam(b.paramName, cat.id) ? 0 : 1))
                                                    .slice(0, 50);
                                                  const monthly = MONTH_LABELS.map((m, mi) => ({
                                                    month: m,
                                                    budget: totalBudgetArr[mi] ?? 0,
                                                    actual: totalActualArr[mi] ?? 0,
                                                  }));
                                                  // Seçili periyoda ait aylık breakdown
                                                  const monthBreakdown = periodIdxs.map((mi) => {
                                                    const bv = totalBudgetArr[mi] ?? 0;
                                                    const av = totalActualArr[mi] ?? 0;
                                                    const vv = av - bv;
                                                    return {
                                                      month: MONTH_LABELS[mi],
                                                      budget: bv,
                                                      actual: av,
                                                      variance: vv,
                                                      variancePct: bv > 0 ? (vv / bv) * 100 : 0,
                                                    };
                                                  });
                                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                  const departmentBreakdown = (varDepts as any[]).map((d) => {
                                                    const dBudget = ensureArr(d.monthly_budget);
                                                    const dActual = ensureArr(d.monthly_actual);
                                                    const pBudget = periodIdxs.reduce((s: number, i: number) => s + (dBudget[i] ?? 0), 0);
                                                    const pActual = periodIdxs.reduce((s: number, i: number) => s + (dActual[i] ?? 0), 0);
                                                    return {
                                                      name: d.label,
                                                      company: d.company ?? null,
                                                      budget: pBudget,
                                                      actual: pActual,
                                                      variance: pActual - pBudget,
                                                      variancePercent: pBudget > 0 ? ((pActual - pBudget) / pBudget) * 100 : 0,
                                                    };
                                                  });
                                                  const activeBudgetTotal = periodIdxs.length > 0
                                                    ? periodIdxs.reduce((s, mi) => s + (totalBudgetArr[mi] ?? 0), 0)
                                                    : budgetTotal;
                                                  const activeActualTotal = periodIdxs.reduce((s, mi) => s + (totalActualArr[mi] ?? 0), 0);
                                                  const activeVarianceAmount = activeActualTotal - activeBudgetTotal;
                                                  const activeVariancePct = activeBudgetTotal > 0 ? (activeVarianceAmount / activeBudgetTotal) * 100 : 0;

                                                  // GRUP: şirket bazlı kırılım + dengeleme flag
                                                  const companyBreakdown = company === 'GRUP' && (icaTotal || iceTotal) ? (() => {
                                                    const icaActBudget = periodIdxs.reduce((s: number, i: number) => s + (icaBudget[i] ?? 0), 0);
                                                    const icaActActual = periodIdxs.reduce((s: number, i: number) => s + (icaActual[i] ?? 0), 0);
                                                    const iceActBudget = periodIdxs.reduce((s: number, i: number) => s + (iceBudget[i] ?? 0), 0);
                                                    const iceActActual = periodIdxs.reduce((s: number, i: number) => s + (iceActual[i] ?? 0), 0);
                                                    const icaVar = icaActActual - icaActBudget;
                                                    const iceVar = iceActActual - iceActBudget;
                                                    const netBudget = icaActBudget + iceActBudget;
                                                    return {
                                                      ICA: { budget: icaActBudget, actual: icaActActual, variance: icaVar, variancePercent: icaActBudget > 0 ? (icaVar / icaActBudget) * 100 : 0 },
                                                      ICE: { budget: iceActBudget, actual: iceActActual, variance: iceVar, variancePercent: iceActBudget > 0 ? (iceVar / iceActBudget) * 100 : 0 },
                                                      net: { budget: netBudget, actual: icaActActual + iceActActual, variance: icaVar + iceVar, variancePercent: netBudget > 0 ? ((icaVar + iceVar) / netBudget) * 100 : 0, balanced: icaVar * iceVar < 0 },
                                                    };
                                                  })() : null;
                                                  // Build subItems: match TL params with corresponding adet params by name similarity
                                                  const tlParams = params.filter((p) => (p.unitType || '').toUpperCase() === 'TL' && p.actual > 0);
                                                  const adetParams = params.filter((p) => {
                                                    const u = (p.unitType || '').toLowerCase();
                                                    return u === 'adet' || u === 'kisi' || u === 'kişi' || u === 'personel';
                                                  });
                                                  const subItems = tlParams.flatMap((tlP) => {
                                                    // find adet param with similar name (longest common prefix)
                                                    const tlName = tlP.paramName.toLowerCase();
                                                    const match = adetParams.find((ap) => {
                                                      const apName = ap.paramName.toLowerCase();
                                                      // same name, or one contains the other, or share 5+ char prefix
                                                      return apName === tlName || apName.includes(tlName) || tlName.includes(apName) ||
                                                        (tlName.length >= 5 && apName.startsWith(tlName.slice(0, 5)));
                                                    });
                                                    if (!match || match.actual === 0) return [];
                                                    const birimFiyat = Math.round(tlP.actual / match.actual);
                                                    const budgetBirimFiyat = match.budget > 0 ? Math.round(tlP.budget / match.budget) : undefined;
                                                    return [{
                                                      name: tlP.paramName,
                                                      adet: match.actual,
                                                      birimFiyat,
                                                      toplam: tlP.actual,
                                                      budgetAdet: match.budget > 0 ? match.budget : undefined,
                                                      budgetBirimFiyat,
                                                      budgetToplam: tlP.budget > 0 ? tlP.budget : undefined,
                                                    }];
                                                  });
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
                                                      activeMonths: periodIdxs,
                                                      periodLabel,
                                                      companyBreakdown,
                                                      isGroupView: company === 'GRUP',
                                                    }),
                                                  })
                                                    .then((r) => r.json())
                                                    .then((d) => {
                                                      if (d.error) setVarDrawerError(d.error);
                                                      else {
                                                        // effects: name → label, explanation → description dönüşümü
                                                        if (d.effects) {
                                                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                          d.effects = d.effects.map((e: any) => ({
                                                            ...e,
                                                            label: e.label ?? e.name ?? '',
                                                            description: e.description ?? e.explanation ?? '',
                                                          }));
                                                        }
                                                        setVarDrawerResult(d);
                                                      }
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
                                                    'İçme Suyu': 'Water', 'Diğer Hizmet': 'Other Services',
                                                    'Diğer Çeşitli': 'Miscellaneous',
                                                  };

                                                  try {
                                                    const monthly = MONTH_LABELS.map((m, mi) => ({
                                                      month: m,
                                                      budget: totalBudgetArr[mi] ?? 0,
                                                      actual: totalActualArr[mi] ?? 0,
                                                    }));

                                                    const activeIdxs = monthly.map((_, i) => i).filter((i) => monthly[i].actual > 0);

                                                    const activeBudget = activeIdxs.length > 0
                                                      ? activeIdxs.reduce((s, i) => s + monthly[i].budget, 0)
                                                      : totalBudgetArr.reduce((s, v) => s + v, 0);
                                                    const activeActual = activeIdxs.reduce((s, i) => s + monthly[i].actual, 0);
                                                    const activeVar = activeActual - activeBudget;
                                                    const activeVarPct = activeBudget > 0 ? (activeVar / activeBudget) * 100 : 0;

                                                    const monthBreakdown = monthly.map((m) => {
                                                      const vv = m.actual - m.budget;
                                                      return { month: m.month, budget: m.budget, actual: m.actual, variance: vv, variancePct: m.budget > 0 ? (vv / m.budget) * 100 : 0 };
                                                    });

                                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                    const departmentBreakdown = (varDepts as any[]).map((d) => {
                                                      const dBudget = ensureArr(d.monthly_budget);
                                                      const dActual = ensureArr(d.monthly_actual);
                                                      const activeBudget = activeIdxs.reduce((s: number, i: number) => s + (dBudget[i] ?? 0), 0);
                                                      const activeActual = activeIdxs.reduce((s: number, i: number) => s + (dActual[i] ?? 0), 0);
                                                      return {
                                                        name: d.label,
                                                        company: (d.company ?? null) as string | null,
                                                        budget: activeBudget,
                                                        actual: activeActual,
                                                        variance: activeActual - activeBudget,
                                                        variancePercent: activeBudget > 0 ? ((activeActual - activeBudget) / activeBudget) * 100 : 0,
                                                      };
                                                    });

                                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                    const allParams = ((varParams as any[])
                                                      .map((r) => {
                                                        const rBud = ensureArr(r.monthly_budget);
                                                        const rAct = ensureArr(r.monthly_actual);
                                                        const bv = activeIdxs.length > 0
                                                          ? activeIdxs.reduce((s, i) => s + (rBud[i] ?? 0), 0)
                                                          : rBud.reduce((s, v) => s + v, 0);
                                                        const av = activeIdxs.reduce((s, i) => s + (rAct[i] ?? 0), 0);
                                                        if (bv === 0 && av === 0) return null;
                                                        const dv = av - bv;
                                                        const pName = (r.label ?? r.param_code ?? '') as string;
                                                        return { paramName: pName, unitType: (r.unit_type ?? 'TL') as string, company: (r.company ?? null) as string | null, budget: bv, actual: av, diff: dv, diffPct: bv > 0 ? (dv / bv) * 100 : null, isKey: isKeyParam(pName, cat.id) };
                                                      })
                                                      .filter(Boolean)) as { paramName: string; unitType: string; company: string | null; budget: number; actual: number; diff: number; diffPct: number | null; isKey: boolean }[];

                                                    // GRUP: companyBreakdown (activeIdxs bazlı)
                                                    const pdfCompanyBreakdown = company === 'GRUP' && (icaTotal || iceTotal) ? (() => {
                                                      const pdfIcaPB = activeIdxs.reduce((s: number, i: number) => s + (icaBudget[i] ?? 0), 0);
                                                      const pdfIcaPA = activeIdxs.reduce((s: number, i: number) => s + (icaActual[i] ?? 0), 0);
                                                      const pdfIcePB = activeIdxs.reduce((s: number, i: number) => s + (iceBudget[i] ?? 0), 0);
                                                      const pdfIcePA = activeIdxs.reduce((s: number, i: number) => s + (iceActual[i] ?? 0), 0);
                                                      const pdfIcaVar = pdfIcaPA - pdfIcaPB;
                                                      const pdfIceVar = pdfIcePA - pdfIcePB;
                                                      const pdfNetBudget = pdfIcaPB + pdfIcePB;
                                                      return {
                                                        ICA: { budget: pdfIcaPB, actual: pdfIcaPA, variance: pdfIcaVar, variancePercent: pdfIcaPB > 0 ? (pdfIcaVar / pdfIcaPB) * 100 : 0 },
                                                        ICE: { budget: pdfIcePB, actual: pdfIcePA, variance: pdfIceVar, variancePercent: pdfIcePB > 0 ? (pdfIceVar / pdfIcePB) * 100 : 0 },
                                                        net: { budget: pdfNetBudget, actual: pdfIcaPA + pdfIcePA, variance: pdfIcaVar + pdfIceVar, variancePercent: pdfNetBudget > 0 ? ((pdfIcaVar + pdfIceVar) / pdfNetBudget) * 100 : 0, balanced: pdfIcaVar * pdfIceVar < 0 },
                                                      };
                                                    })() : null;
                                                    const pdfPeriodLabel = activeIdxs.length === 0
                                                      ? 'Tüm Yıl'
                                                      : activeIdxs.length === 1
                                                      ? MONTH_LABELS[activeIdxs[0]]
                                                      : `${MONTH_LABELS[activeIdxs[0]]}-${MONTH_LABELS[activeIdxs[activeIdxs.length - 1]]}`;

                                                    // Eğer drawer'dan daha önce analiz yapıldıysa yeniden API çağrısı yapmadan kullan
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
                                                          parameters: allParams
                                                            .sort((a, b) => (b.isKey ? 1 : 0) - (a.isKey ? 1 : 0))
                                                            .slice(0, 50)
                                                            .map((p) => ({ paramName: p.paramName, unitType: p.unitType, company: p.company, budget: p.budget, actual: p.actual, diff: p.diff, diffPct: p.diffPct })),
                                                          monthBreakdown,
                                                          departmentBreakdown,
                                                          activeMonths: activeIdxs,
                                                          analysisScope: 'full',
                                                          deepAnalysis: true,
                                                          companyBreakdown: pdfCompanyBreakdown,
                                                          isGroupView: company === 'GRUP',
                                                          periodLabel: pdfPeriodLabel,
                                                        }),
                                                      });
                                                      aiResult = res.ok ? await res.json() : null;
                                                    }

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
                                                      budget: totalBudgetArr[mi] ?? 0,
                                                      actual: totalActualArr[mi] ?? 0,
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
                                                        aiAnalysis: aiResult && !(aiResult as {error?: string}).error ? {
                                                          summary: aiResult.summary,
                                                          effects: aiEff,
                                                          monthlyTrend: aiResult.monthlyTrend,
                                                          recommendations: aiResult.recommendations,
                                                          interRelations: aiResult.interRelations,
                                                          departmentInsights: aiResult.departmentInsights ?? '',
                                                          monthlyInsights: aiResult.monthlyInsights ?? '',
                                                          karmaEffect: aiResult.karmaEffect ?? null,
                                                          optimization: aiResult.optimization ?? undefined,
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
            company={company}
            importedModelData={importedModelData}
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

                    {/* optimization — accordion A/B/C */}
                    {r.optimization && (() => {
                      const opt = r.optimization;
                      const scenarios: [string, typeof opt.scenarioA][] = [
                        ['A', opt.scenarioA],
                        ['B', opt.scenarioB],
                        ['C', opt.scenarioC],
                      ];
                      const feasColor = (f: string) =>
                        f === 'Yuksek' || f === 'Yüksek'
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                          : f === 'Orta'
                          ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                          : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
                      return (
                        <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                          <h4 className="font-semibold text-sm mb-3 text-gray-800 dark:text-gray-200">🎯 Optimizasyon Senaryolari</h4>
                          <div className="space-y-2">
                            {scenarios.map(([label, s]) => {
                              return (
                              <details key={label} className="group rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                                <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none select-none hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold flex items-center justify-center">{label}</span>
                                    <span className="font-medium text-sm text-gray-800 dark:text-gray-200">{s.title}</span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">{s.savings}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${feasColor(s.feasibility)}`}>{s.feasibility}</span>
                                    <svg className="w-3.5 h-3.5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                                  </div>
                                </summary>
                                <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700">
                                  <ul className="space-y-1 mb-2">
                                    {s.actions.map((action, ai) => (
                                      <li key={ai} className="text-xs text-blue-600 dark:text-blue-400 flex items-start gap-1.5">
                                        <span className="flex-shrink-0 mt-0.5">▸</span>
                                        <span>{action}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  {s.items && s.items.length > 0 && (
                                    <div className="mt-2 overflow-x-auto">
                                      <table className="w-full text-[11px] border-collapse">
                                        <thead>
                                          <tr className="bg-gray-50 dark:bg-gray-700/50">
                                            <th className="text-left px-2 py-1 font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">Kalem</th>
                                            {s.items.some((it) => it.currentAdet !== undefined) && <th className="text-right px-2 py-1 font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">Mevcut Adet</th>}
                                            {s.items.some((it) => it.targetAdet !== undefined) && <th className="text-right px-2 py-1 font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">Hedef Adet</th>}
                                            {s.items.some((it) => it.currentFiyat !== undefined) && <th className="text-right px-2 py-1 font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">Mevcut Fiyat</th>}
                                            {s.items.some((it) => it.targetFiyat !== undefined) && <th className="text-right px-2 py-1 font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">Hedef Fiyat</th>}
                                            <th className="text-right px-2 py-1 font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">Tasarruf</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {s.items.map((it, ii) => (
                                            <tr key={ii} className={ii % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-700/20'}>
                                              <td className="px-2 py-1 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 max-w-[120px] truncate">{it.name}</td>
                                              {s.items!.some((x) => x.currentAdet !== undefined) && <td className="px-2 py-1 text-right text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">{it.currentAdet ?? '—'}</td>}
                                              {s.items!.some((x) => x.targetAdet !== undefined) && <td className="px-2 py-1 text-right text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-600">{it.targetAdet ?? '—'}</td>}
                                              {s.items!.some((x) => x.currentFiyat !== undefined) && <td className="px-2 py-1 text-right text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">{it.currentFiyat?.toLocaleString('tr-TR') ?? '—'}</td>}
                                              {s.items!.some((x) => x.targetFiyat !== undefined) && <td className="px-2 py-1 text-right text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-600">{it.targetFiyat?.toLocaleString('tr-TR') ?? '—'}</td>}
                                              <td className="px-2 py-1 text-right text-green-600 dark:text-green-400 font-medium border border-gray-200 dark:border-gray-600">{it.saving.toLocaleString('tr-TR')} ₺</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                  {s.newTotal > 1000 && (
                                    <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                      Yeni Toplam: <span className="font-semibold text-gray-700 dark:text-gray-300">{s.newTotal.toLocaleString('tr-TR')} ₺</span>
                                    </p>
                                  )}
                                </div>
                              </details>
                              );
                            })}
                          </div>
                          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">💡 Optimal Yol</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{opt.optimalPath}</p>
                          </div>
                          <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">📅 Yil Sonu Prognozu</p>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{opt.yearEndForecast}</p>
                          </div>
                          <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-600 dark:text-gray-400">⚖️ {opt.riskNote}</p>
                          </div>
                        </div>
                      );
                    })()}
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
