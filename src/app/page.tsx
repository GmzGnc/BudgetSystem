'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Sun, Moon, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

import { CATEGORIES, CATEGORY_COLORS, INDEX_BADGE_COLORS } from '@/data/categories';
import { ICA_BUDGET, ICE_BUDGET, GROUP_MONTHLY } from '@/data/budget-data';
import { getSapData, SAP_CATEGORY_COLORS } from '@/data/sap-data';
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

// ─── default coefficients ────────────────────────────────────────────────────

const DEFAULT_COEFFICIENTS: ProjectionCoefficients = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, parseFloat((1 + c.rate / 100).toFixed(3))]),
);

// ─── main page ───────────────────────────────────────────────────────────────

type Tab = 'overview' | 'projection' | 'sapma' | 'sap';

export default function Home() {
  const [company, setCompany]         = useState<Company>('ICA');
  const [tab, setTab]                 = useState<Tab>('overview');
  const [coefficients, setCoefficients] = useState<ProjectionCoefficients>(DEFAULT_COEFFICIENTS);
  const [dark, setDark]               = useState(false);

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

  // ── SAP data ──
  const sapData = useMemo(() => getSapData(company), [company]);

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
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-0.5">
              İdari İşler Departmanı
            </p>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Bütçe Yönetim Sistemi
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 capitalize">{today}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
              Canlı Veri
            </div>

            {/* Excel export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors shadow-sm"
            >
              <Download size={13} />
              Excel&apos;e Aktar
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

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── COMPANY SELECTOR ── */}
        <div className="flex gap-2">
          {(['ICA', 'ICE', 'GRUP'] as Company[]).map((c) => (
            <button
              key={c}
              onClick={() => setCompany(c)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                company === c
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {c === 'GRUP' ? 'Grup Konsolide' : c}
            </button>
          ))}
        </div>

        {/* ── METRIC CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${cls}`}>{value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── TABS ── */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 gap-6">
          {([
            { key: 'overview',   label: 'Genel Bakış' },
            { key: 'projection', label: '2026 Projeksiyon' },
            { key: 'sapma',      label: 'Sapma Analizi' },
            { key: 'sap',        label: 'SAP Bütçe Takibi' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
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
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
                2025 Aylık Gider Dağılımı — {companyLabel}
              </h2>
              <ResponsiveContainer width="100%" height={320}>
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

            {/* category table */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Kategori Bazlı 2025 Özeti — {companyLabel}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kategori</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Yıllık Toplam</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pay %</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Endeks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {CATEGORIES.map((cat) => {
                      const catTotal = categoryAnnual(monthlyData, cat.id);
                      const share    = categoryShare(catTotal, total2025);
                      return (
                        <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <td className="px-5 py-3 flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat.id] }} />
                            <span className="font-medium text-gray-800 dark:text-gray-200">{cat.name}</span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{fmtFull(catTotal)}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full" style={{ width: `${share}%`, backgroundColor: CATEGORY_COLORS[cat.id] }} />
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
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
                2025 Gerçekleşen vs 2026 Projeksiyon — Aylık Trend
              </h2>
              <ResponsiveContainer width="100%" height={300}>
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

            {/* projection comparison table */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Kategori Bazlı Projeksiyon Karşılaştırması</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
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
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <div className="flex items-center gap-6 mb-4">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Kategori Artış Oranları — 2025→2026 ({companyLabel})
                </h2>
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Normal (&lt;20%)</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Dikkat (20–25%)</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Kritik (&gt;25%)</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={360}>
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

            {/* sapma table */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Detaylı Sapma Tablosu — {companyLabel}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
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
                  <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: catColor }} />
                      <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{category}</h3>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">({rows.length} kod)</span>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-gray-500 dark:text-gray-400">
                      <span>Bütçe: <span className="font-semibold text-gray-700 dark:text-gray-300 font-mono">{fmtFull(budget)}</span></span>
                      <span>Kullanılan: <span className="font-semibold font-mono" style={{ color: barColor }}>{fmtFull(used)}</span></span>
                      <span>Kalan: <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{fmtFull(remaining)}</span></span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(catPct, 100)}%`, backgroundColor: barColor }} />
                        </div>
                        <span className="font-bold w-10 text-right" style={{ color: barColor }}>{catPct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* SAP kodu satırları */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
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

      </main>
    </div>
  );
}
