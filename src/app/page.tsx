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
} from '@/lib/db';
import type { BudgetEntry, SapEntry as DbSapEntry } from '@/lib/db';
import {
  totalAnnual, categoryAnnual, monthlyAverage,
  buildProjection2026, variancePct, categoryShare, aggregateMonthly,
} from '@/lib/calculations';
import type { Company, MonthlyEntry, ProjectionCoefficients } from '@/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `₺${(n / 1_000).toFixed(0)}K`;
  return `₺${n.toFixed(0)}`;
}

function fmtShort(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}B`;
  return n.toFixed(0);
}

function fmtFull(n: number): string {
  return '₺' + n.toLocaleString('tr-TR');
}

function pctTextColor(pct: number): string {
  return pct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400';
}

function sapamaColor(pct: number): string {
  if (pct < 20)  return '#22c55e';
  if (pct < 25)  return '#f59e0b';
  return '#ef4444';
}

function sapamaStatus(pct: number): { label: string; cls: string } {
  if (pct < 20)  return { label: 'Normal',  cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' };
  if (pct < 25)  return { label: 'Dikkat',  cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' };
  return           { label: 'Kritik',  cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' };
}

// ─── model gider types & row ranges ─────────────────────────────────────────

interface ModelRow {
  rowNum: number;      // 1-based Excel row number
  paramName: string;   // K column
  unitType: string;    // L column: "TL", "TL Karşılığı", or "" (empty = adet/miktar)
  budget: number[];    // 12 months  N–Y
  actual: number[];    // 12 months  AC–AN
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

  // ── derived data ──
  const monthlyData: MonthlyEntry[] = useMemo(() => {
    if (company === 'ICA')  return ICA_BUDGET.monthlyData;
    if (company === 'ICE')  return ICE_BUDGET.monthlyData;
    return GROUP_MONTHLY;
  }, [company]);

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

  // ── SAP data (imported overrides static) ──
  const sapData = useMemo(
    () => importedSapData ?? getSapData(company),
    [importedSapData, company],
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
      const wb = XLSX.read(data, { type: 'array', cellFormula: false, cellNF: false });
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
      const dbYear      = yearsRes.data?.find((y) => y.year === 2025 && !y.is_projection) ?? null;
      const dbCats      = catsRes.data ?? [];
      return { dbCompany, dbYear, dbCats };
    }

    // ── Model Gider sheet handler ──
    if (/model/i.test(selectedSheet)) {
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
      const parsed: ModelRow[] = [];
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i] as unknown[];
        const paramName = String(row[10] ?? '').trim(); // K column (index 10)
        if (!paramName || paramName.length < 2) continue;
        const unitType = String(row[11] ?? '').trim(); // L column (index 11) — PB
        const toNum = (v: unknown): number => {
          if (typeof v === 'number') return isFinite(v) ? v : 0;
          if (v === null || v === undefined || v === '') return 0;
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

      // ── state güncelle (önce UI, sonra DB) ──
      const hasActual = parsed.some((r) => r.actual.some((v) => v !== 0));
      setImportedModelData(parsed);
      setImportOpen(false);
      wbRef.current = null; setSheets([]); setSelectedSheet('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast(`✓ ${parsed.length} parametre yüklendi${!hasActual ? ' — fiili sütunlar boş' : ''}`);

      // ── DB'ye yaz (best-effort, UI'ı bloklamaz) ──
      void (async () => {
        try {
          const { dbCompany, dbYear, dbCats } = await resolveDbIds();
          if (!dbCompany || !dbYear) return; // DB tabloları henüz kurulmamış

          const entries: BudgetEntry[] = [];
          for (const [catCode, range] of Object.entries(CAT_ROW_RANGES)) {
            const catRows  = parsed.filter((r) => r.rowNum >= range[0] && r.rowNum <= range[1]);
            const mainRow  = catRows.find((r) => /^TL/i.test(r.unitType) && /TOPLAM/i.test(r.paramName))
              ?? catRows.find((r) => /^TL/i.test(r.unitType))
              ?? catRows[0];
            if (!mainRow) continue;
            const catId = dbCats.find((c) => c.code === catCode)?.id ?? catCode;
            for (let m = 0; m < 12; m++) {
              const amount = mainRow.budget[m];
              if (amount === 0) continue;
              entries.push({ company_id: dbCompany.id, fiscal_year_id: dbYear.id, category_id: catId, department_id: null, month: m + 1, amount });
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
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
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
        <div className="flex gap-2">
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
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Kategori Bazlı 2025 Özeti — {companyLabel}
                </h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">Detay için kategoriye tıklayın</span>
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
                                      const catRows = range
                                        ? importedModelData.filter((r) => r.rowNum >= range[0] && r.rowNum <= range[1])
                                        : importedModelData;

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
          <div className="space-y-6">

            {/* sliders */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  2026 Projeksiyon Katsayıları — {companyLabel}
                </h2>
                <button
                  onClick={() => setCoefficients(DEFAULT_COEFFICIENTS)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
                >
                  Sıfırla
                </button>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {CATEGORIES.map((cat) => {
                  const coeff       = coefficients[cat.id] ?? 1.2;
                  const catTotal25  = categoryAnnual(monthlyData, cat.id);
                  const catTotal26  = categoryAnnual(projection2026, cat.id);
                  return (
                    <div key={cat.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat.id] }} />
                          {cat.name}
                          <span className={`ml-1 px-1.5 py-0.5 rounded-full ${INDEX_BADGE_COLORS[cat.indexType]}`}>
                            {cat.indexType}
                          </span>
                        </span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          ×{coeff.toFixed(2)} (+{((coeff - 1) * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1.00} max={2.00} step={0.01}
                        value={coeff}
                        onChange={(e) =>
                          setCoefficients((prev) => ({ ...prev, [cat.id]: parseFloat(e.target.value) }))
                        }
                        className="w-full h-1.5 rounded-full accent-indigo-600 cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
                        <span>{fmt(catTotal25)} (2025)</span>
                        <span className="text-indigo-500 dark:text-indigo-400 font-medium">→ {fmt(catTotal26)} (2026)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4">
                <p className="text-xs font-medium text-indigo-500 dark:text-indigo-400 uppercase">2025 Toplam</p>
                <p className="text-xl font-bold text-indigo-900 dark:text-indigo-200 mt-1">{fmt(total2025)}</p>
              </div>
              <div className="bg-indigo-600 rounded-xl p-4">
                <p className="text-xs font-medium text-indigo-200 uppercase">2026 Projeksiyon</p>
                <p className="text-xl font-bold text-white mt-1">{fmt(total2026)}</p>
              </div>
              <div className={`rounded-xl p-4 ${diffPct > 0 ? 'bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-800' : 'bg-green-50 dark:bg-green-950 border border-green-100 dark:border-green-800'}`}>
                <p className={`text-xs font-medium uppercase ${diffPct > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  Artış / Azalış
                </p>
                <p className={`text-xl font-bold mt-1 ${pctTextColor(diffPct)}`}>
                  {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* trend line chart */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
                2025 Gerçekleşen vs 2026 Projeksiyon — Aylık Trend
              </h2>
              <div className="h-44 sm:h-64 lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 4, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} width={68} />
                  <Tooltip content={<LineTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8, color: axisColor }} />
                  <Line type="monotone" dataKey="2025 Gerçekleşen" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="2026 Projeksiyon" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: '#f59e0b' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
              </div>
            </div>

            {/* projection comparison table */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Kategori Bazlı Projeksiyon Karşılaştırması</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Kategori','2025','2026 Proj.','Fark %','Katsayı'].map((h, i) => (
                        <th key={h} className={`px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i === 0 ? 'text-left' : i === 4 ? 'text-center' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {CATEGORIES.map((cat) => {
                      const t25 = categoryAnnual(monthlyData, cat.id);
                      const t26 = categoryAnnual(projection2026, cat.id);
                      const pct = variancePct(t25, t26);
                      return (
                        <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <td className="px-5 py-3 flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat.id] }} />
                            <span className="font-medium text-gray-800 dark:text-gray-200">{cat.name}</span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{fmt(t25)}</td>
                          <td className="px-5 py-3 text-right font-mono font-semibold text-gray-900 dark:text-white">{fmt(t26)}</td>
                          <td className={`px-5 py-3 text-right font-semibold ${pctTextColor(pct)}`}>
                            {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded font-mono text-xs">
                              ×{(coefficients[cat.id] ?? 1.2).toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    <tr>
                      <td className="px-5 py-3 font-semibold text-gray-800 dark:text-gray-100">Toplam</td>
                      <td className="px-5 py-3 text-right font-semibold font-mono text-gray-700 dark:text-gray-300">{fmt(total2025)}</td>
                      <td className="px-5 py-3 text-right font-semibold font-mono text-indigo-700 dark:text-indigo-400">{fmt(total2026)}</td>
                      <td className={`px-5 py-3 text-right font-bold ${pctTextColor(diffPct)}`}>
                        {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ SAPMA ANALİZİ TAB ══════════ */}
        {tab === 'sapma' && (
          <div className="space-y-6">

            {/* horizontal bar chart */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mb-4">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Kategori Artış Oranları — 2025→2026 ({companyLabel})
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Normal (&lt;20%)</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Dikkat (20–25%)</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Kritik (&gt;25%)</span>
                </div>
              </div>
              <div className="h-64 sm:h-80 lg:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={sapamaData} margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    tick={{ fontSize: 11, fill: axisColor }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 'dataMax + 5']}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: axisColor }}
                    axisLine={false}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip content={<SapamaTooltip />} />
                  <Bar dataKey="pct" name="Artış %" radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (v: unknown) => `${(v as number).toFixed(1)}%`, fontSize: 11, fill: axisColor }}>
                    {sapamaData.map((entry) => (
                      <Cell key={entry.id} fill={sapamaColor(entry.pct)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>

            {/* sapma table */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Detaylı Sapma Tablosu — {companyLabel}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Kategori','2025','2026 Proj.','Fark (TL)','Fark %','Durum'].map((h, i) => (
                        <th key={h} className={`px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i === 0 || i === 5 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {sapamaData.map((row) => {
                      const status = sapamaStatus(row.pct);
                      return (
                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <td className="px-5 py-3 flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[row.id] }} />
                            <span className="font-medium text-gray-800 dark:text-gray-200">{row.name}</span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{fmt(row.t25)}</td>
                          <td className="px-5 py-3 text-right font-mono font-semibold text-gray-900 dark:text-white">{fmt(row.t26)}</td>
                          <td className="px-5 py-3 text-right font-mono text-red-500 dark:text-red-400">
                            +{fmtFull(row.diff)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className="font-semibold" style={{ color: sapamaColor(row.pct) }}>
                              +{row.pct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status.cls}`}>
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    <tr>
                      <td className="px-5 py-3 font-semibold text-gray-800 dark:text-gray-100">Toplam</td>
                      <td className="px-5 py-3 text-right font-semibold font-mono text-gray-700 dark:text-gray-300">{fmt(total2025)}</td>
                      <td className="px-5 py-3 text-right font-semibold font-mono text-indigo-600 dark:text-indigo-400">{fmt(total2026)}</td>
                      <td className="px-5 py-3 text-right font-semibold font-mono text-red-500 dark:text-red-400">
                        +{fmtFull(total2026 - total2025)}
                      </td>
                      <td className={`px-5 py-3 text-right font-bold ${pctTextColor(diffPct)}`}>
                        +{diffPct.toFixed(1)}%
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ SAP BÜTÇE TAKİBİ TAB ══════════ */}
        {tab === 'sap' && (
          <div className="space-y-6">

            {/* yüklenen veri bildirimi */}
            {importedSapData && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
                <span className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <FileSpreadsheet size={15} />
                  <span className="font-medium">Yüklenen Excel verisi gösteriliyor</span>
                  <span className="text-blue-500 dark:text-blue-400">({importedSapData.length} SAP kodu)</span>
                </span>
                <button
                  onClick={() => setImportedSapData(null)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-semibold underline underline-offset-2"
                >
                  Statik Veriye Dön
                </button>
              </div>
            )}

            {/* özet kartlar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Toplam Bütçe',    value: fmtFull(sapSummary.totalBudget),    cls: 'text-gray-900 dark:text-white' },
                { label: 'Kullanılan',       value: fmtFull(sapSummary.totalUsed),      cls: 'text-amber-600 dark:text-amber-400' },
                { label: 'Kalan',            value: fmtFull(sapSummary.totalRemaining), cls: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Kullanım Oranı',   value: `${sapSummary.usagePct.toFixed(1)}%`,
                  cls: sapSummary.usagePct >= 90 ? 'text-red-600 dark:text-red-400'
                     : sapSummary.usagePct >= 70 ? 'text-amber-600 dark:text-amber-400'
                     : 'text-emerald-600 dark:text-emerald-400' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className={`text-xl font-bold mt-1 font-mono ${cls}`}>{value}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{companyLabel} · Ocak 2026</p>
                </div>
              ))}
            </div>

            {/* renk açıklaması */}
            <div className="flex items-center gap-5 text-xs text-gray-500 dark:text-gray-400 px-1">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Normal (0–70%)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Dikkat (70–90%)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Kritik (%90+)</span>
            </div>

            {/* kategori gruplu tablo */}
            {sapByCategory.map(({ category, rows, budget, used, remaining }) => {
              const catPct = budget > 0 ? (used / budget) * 100 : 0;
              const catColor = SAP_CATEGORY_COLORS[category] ?? '#94a3b8';
              const barColor = catPct >= 90 ? '#ef4444' : catPct >= 70 ? '#f59e0b' : '#22c55e';

              return (
                <div key={category} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

                  {/* kategori başlığı */}
                  <div className="px-3 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2 sm:mb-0">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: catColor }} />
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{category}</h3>
                        <span className="text-xs text-gray-400 dark:text-gray-500">({rows.length} kod)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 sm:w-24 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(catPct, 100)}%`, backgroundColor: barColor }} />
                        </div>
                        <span className="text-xs font-bold w-10 text-right" style={{ color: barColor }}>{catPct.toFixed(1)}%</span>
                      </div>
                    </div>
                    {/* mobilde sadece özet, masaüstünde tam */}
                    <div className="hidden sm:flex items-center gap-6 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>Bütçe: <span className="font-semibold text-gray-700 dark:text-gray-300 font-mono">{fmtFull(budget)}</span></span>
                      <span>Kullanılan: <span className="font-semibold font-mono" style={{ color: barColor }}>{fmtFull(used)}</span></span>
                      <span>Kalan: <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{fmtFull(remaining)}</span></span>
                    </div>
                    <div className="flex sm:hidden items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>Bütçe: <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{fmt(budget)}</span></span>
                      <span>Kalan: <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{fmt(remaining)}</span></span>
                    </div>
                  </div>

                  {/* SAP kodu satırları — mobil kart görünümü */}
                  <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
                    {rows.map((row) => {
                      const pct    = row.budget > 0 ? (row.used / row.budget) * 100 : 0;
                      const rowBar = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
                      return (
                        <div key={row.code} className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">
                              {row.code}
                            </span>
                            <span className="text-xs font-bold" style={{ color: rowBar }}>{pct.toFixed(1)}%</span>
                          </div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">{row.name}</p>
                          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: rowBar }} />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span>Bütçe: <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{fmtFull(row.budget)}</span></span>
                            <span>Kullanılan: <span className="font-mono font-semibold" style={{ color: rowBar }}>{fmtFull(row.used)}</span></span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Kalan: <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{fmtFull(row.remaining)}</span>
                          </div>
                        </div>
                      );
                    })}
                    {/* mobil alt toplam */}
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 flex justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
                      <span>{category} Toplamı</span>
                      <span style={{ color: barColor }}>{fmtFull(used)} / {fmtFull(budget)}</span>
                    </div>
                  </div>

                  {/* SAP kodu satırları — masaüstü tablo */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          {['SAP Kodu', 'Açıklama', 'Bütçe (₺)', 'Kullanılan (₺)', 'Kalan (₺)', 'Kullanım %'].map((h, i) => (
                            <th key={h} className={`px-5 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {rows.map((row) => {
                          const pct      = row.budget > 0 ? (row.used / row.budget) * 100 : 0;
                          const rowBar   = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
                          const rowBg    = pct >= 90
                            ? 'hover:bg-red-50 dark:hover:bg-red-950/30'
                            : pct >= 70
                            ? 'hover:bg-amber-50 dark:hover:bg-amber-950/30'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800';

                          return (
                            <tr key={row.code} className={`transition-colors ${rowBg}`}>
                              <td className="px-5 py-3">
                                <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">
                                  {row.code}
                                </span>
                              </td>
                              <td className="px-5 py-3 font-medium text-gray-800 dark:text-gray-200">{row.name}</td>
                              <td className="px-5 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{fmtFull(row.budget)}</td>
                              <td className="px-5 py-3 text-right font-mono font-semibold" style={{ color: rowBar }}>{fmtFull(row.used)}</td>
                              <td className="px-5 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtFull(row.remaining)}</td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: rowBar }} />
                                  </div>
                                  <span className="font-semibold w-10 text-right text-xs" style={{ color: rowBar }}>{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* kategori alt toplamı */}
                      <tfoot className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                        <tr>
                          <td colSpan={2} className="px-5 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wide">
                            {category} Toplamı
                          </td>
                          <td className="px-5 py-2.5 text-right font-semibold font-mono text-gray-700 dark:text-gray-300">{fmtFull(budget)}</td>
                          <td className="px-5 py-2.5 text-right font-semibold font-mono" style={{ color: barColor }}>{fmtFull(used)}</td>
                          <td className="px-5 py-2.5 text-right font-semibold font-mono text-emerald-600 dark:text-emerald-400">{fmtFull(remaining)}</td>
                          <td className="px-5 py-2.5 text-right">
                            <span className="font-bold text-xs" style={{ color: barColor }}>{catPct.toFixed(1)}%</span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })}

          </div>
        )}

        {/* ══════════ DEPARTMAN KIRILIMI TAB ══════════ */}
        {tab === 'dept' && (
          <div className="space-y-6">

            {/* ICE uyarısı */}
            {company === 'ICE' ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                  <span className="text-3xl">🏢</span>
                </div>
                <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">ICE&apos;de departman kırılımı bulunmamaktadır</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Bu analiz yalnızca ICA verisi için hazırlanmıştır.</p>
              </div>
            ) : (
              <>
                {/* GRUP notu */}
                {company === 'GRUP' && (
                  <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
                    Grup Konsolide seçili — departman kırılımı yalnızca <span className="font-semibold">ICA</span> verisi üzerinden gösterilmektedir.
                  </div>
                )}

                {/* departman seçici */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedDept('ALL')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      selectedDept === 'ALL'
                        ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 shadow'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    Tüm Departmanlar
                  </button>
                  {DEPARTMENTS.map((dept) => {
                    const total = ICA_DEPT.reduce((s, r) => s + r[dept], 0);
                    if (total === 0) return null;
                    return (
                      <button
                        key={dept}
                        onClick={() => setSelectedDept(dept)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          selectedDept === dept
                            ? 'text-white shadow'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                        style={selectedDept === dept ? { backgroundColor: DEPT_COLORS[dept] } : {}}
                      >
                        {dept}
                      </button>
                    );
                  })}
                </div>

                {/* grafikler */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* pasta grafik — departman payları */}
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
                      Departman Payları — ICA 2025
                    </h3>
                    <div className="h-48 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deptPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          innerRadius={52}
                          paddingAngle={2}
                        >
                          {deptPieData.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [fmtFull(Number(value)), '']}
                          contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: dark ? '#f9fafb' : '#111827', fontWeight: 600 }}
                        />
                        <Legend
                          formatter={(value) => <span style={{ fontSize: 11, color: dark ? '#9ca3af' : '#6b7280' }}>{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    </div>
                  </div>

                  {/* bar chart — seçilen departman veya tüm kategoriler */}
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
                      {selectedDept === 'ALL'
                        ? 'Kategori Bazlı Dağılım — Tüm Departmanlar'
                        : `${selectedDept} — Kategori Dağılımı`}
                    </h3>
                    <div className="h-48 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      {selectedDept === 'ALL' ? (
                        <BarChart data={deptBarData} margin={{ top: 4, right: 8, bottom: 4, left: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? '#374151' : '#f0f0f0'} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} width={60} />
                          <Tooltip
                            formatter={(v) => fmtFull(Number(v))}
                            contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 8, fontSize: 11 }}
                          />
                          <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 10, paddingTop: 8, color: dark ? '#9ca3af' : '#6b7280' }} />
                          {DEPARTMENTS.map((dept) => (
                            <Bar key={dept} dataKey={dept} name={dept} stackId="a" fill={DEPT_COLORS[dept]} />
                          ))}
                        </BarChart>
                      ) : (
                        <BarChart data={deptBarData} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={dark ? '#374151' : '#f0f0f0'} />
                          <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} width={100} />
                          <Tooltip
                            formatter={(v) => [fmtFull(Number(v)), selectedDept]}
                            contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 8, fontSize: 11 }}
                          />
                          <Bar dataKey="value" name={selectedDept} fill={DEPT_COLORS[selectedDept as Department]} radius={[0, 4, 4, 0]}
                            label={{ position: 'right', formatter: (v: unknown) => fmt(v as number), fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }}
                          />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* matris tablo */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Departman × Kategori Matris — ICA 2025 Yıllık (₺)
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide sticky left-0 bg-gray-50 dark:bg-gray-800">
                            Kategori
                          </th>
                          {DEPARTMENTS.map((dept) => (
                            <th
                              key={dept}
                              className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${
                                selectedDept === dept
                                  ? 'text-white'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}
                              style={selectedDept === dept ? { backgroundColor: DEPT_COLORS[dept] } : {}}
                            >
                              {dept}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide bg-gray-100 dark:bg-gray-700">
                            TOPLAM
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {ICA_DEPT.map((row) => {
                          const rowTotal = DEPARTMENTS.reduce((s, d) => s + row[d], 0);
                          return (
                            <tr key={row.categoryId} className={`transition-colors ${
                              selectedDept !== 'ALL' ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}>
                              <td className="px-5 py-3 font-medium text-gray-800 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-900 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[row.categoryId] }} />
                                {row.categoryName}
                              </td>
                              {DEPARTMENTS.map((dept) => {
                                const val = row[dept];
                                const isSelected = selectedDept === dept;
                                return (
                                  <td
                                    key={dept}
                                    className={`px-4 py-3 text-right font-mono text-xs ${
                                      val === 0
                                        ? 'text-gray-300 dark:text-gray-600'
                                        : isSelected
                                        ? 'font-bold'
                                        : 'text-gray-700 dark:text-gray-300'
                                    }`}
                                    style={isSelected && val > 0 ? { color: DEPT_COLORS[dept] } : {}}
                                  >
                                    {val === 0 ? '—' : fmtFull(val)}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800">
                                {fmtFull(rowTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-100 dark:bg-gray-700 border-t-2 border-gray-200 dark:border-gray-600">
                        <tr>
                          <td className="px-5 py-3 font-bold text-gray-800 dark:text-gray-100 text-xs uppercase tracking-wide sticky left-0 bg-gray-100 dark:bg-gray-700">
                            Genel Toplam
                          </td>
                          {DEPARTMENTS.map((dept) => {
                            const colTotal = ICA_DEPT.reduce((s, r) => s + r[dept], 0);
                            const isSelected = selectedDept === dept;
                            return (
                              <td
                                key={dept}
                                className={`px-4 py-3 text-right font-mono text-xs font-bold ${
                                  colTotal === 0
                                    ? 'text-gray-400 dark:text-gray-500'
                                    : isSelected
                                    ? 'text-white'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}
                                style={isSelected && colTotal > 0 ? { backgroundColor: DEPT_COLORS[dept] } : {}}
                              >
                                {colTotal === 0 ? '—' : fmtFull(colTotal)}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right font-mono text-xs font-bold text-gray-900 dark:text-white">
                            {fmtFull(deptGrandTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
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

      {/* ── TOAST ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-xl animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
