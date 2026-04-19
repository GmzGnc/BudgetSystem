'use client';

import React, { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import ChartWrapper from '@/components/ChartWrapper';
import type { LineItem } from './GuvenlikDetailPanel';

export interface GenericCategoryPanelProps {
  categoryCode: string;
  categoryLabel: string;
  lineItems: LineItem[];
  color?: string; // kept for API compat
  dark: boolean;
}

const MONTH_LABELS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DEPT_COLORS  = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#84cc16'];

function fmtM(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₺${(n / 1_000).toFixed(0)}B`;
  return `₺${n.toLocaleString('tr-TR')}`;
}
function fmtFull(n: number): string {
  return `₺${n.toLocaleString('tr-TR')}`;
}

function ensureArray(v: number[] | string | undefined | null): number[] {
  if (!v) return Array(12).fill(0);
  if (typeof v === 'string') {
    try { return JSON.parse(v) as number[]; } catch { return Array(12).fill(0); }
  }
  return v;
}

export default function GenericCategoryPanel({
  categoryCode,
  categoryLabel,
  lineItems,
  dark,
}: GenericCategoryPanelProps) {
  const axisColor     = dark ? '#9ca3af' : '#6b7280';
  const gridColor     = dark ? '#374151' : '#e5e7eb';
  const tooltipBg     = dark ? '#1f2937' : '#ffffff';
  const tooltipBorder = dark ? '#374151' : '#e5e7eb';

  const [openDepts,      setOpenDepts]      = useState<Set<string>>(new Set());
  const [paramOpen,      setParamOpen]      = useState(false);
  const [openDeptParams, setOpenDeptParams] = useState<Set<string>>(new Set());

  // ── derive data ────────────────────────────────────────────────────────────

  const totalItem = useMemo(
    () => lineItems.find((i) => i.category_code === categoryCode && i.row_type === 'total') ?? null,
    [lineItems, categoryCode]
  );

  const monthlyBudget = ensureArray(totalItem?.monthly_budget);
  const monthlyActual = ensureArray(totalItem?.monthly_actual);

  const depts = useMemo(
    () => lineItems.filter((i) => i.category_code === categoryCode && i.row_type === 'dept'),
    [lineItems, categoryCode]
  );

  const params = useMemo(
    () => lineItems.filter((i) => i.category_code === categoryCode && i.row_type === 'param'),
    [lineItems, categoryCode]
  );

  // If total row actuals are all zero, sum dept actuals as fallback (HGS pass-through pattern)
  const effectiveMonthlyActual = useMemo(() => {
    if (monthlyActual.some((v) => v > 0)) return monthlyActual;
    if (depts.length === 0) return monthlyActual;
    return depts.reduce(
      (acc, d) => {
        const da = ensureArray(d.monthly_actual);
        return acc.map((v, i) => v + (da[i] ?? 0));
      },
      Array(12).fill(0) as number[],
    );
  }, [monthlyActual, depts]);

  const activeMonth = useMemo(() => {
    for (let i = 11; i >= 0; i--) {
      if (effectiveMonthlyActual[i] > 0) return i;
    }
    return 0;
  }, [effectiveMonthlyActual]);

  const annualBudget = monthlyBudget.reduce((a, b) => a + b, 0);
  const ytdBudget    = monthlyBudget.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
  const ytdActual    = effectiveMonthlyActual.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
  const sapmaTL      = ytdActual - ytdBudget;
  const sapmaPct     = ytdBudget > 0 ? (sapmaTL / ytdBudget) * 100 : 0;
  const activeLabel  = MONTH_LABELS[activeMonth] ?? '';

  // Chart data
  const trendData = MONTH_LABELS.map((label, i) => ({
    label,
    'Fiili': (effectiveMonthlyActual[i] ?? 0) > 0 ? (effectiveMonthlyActual[i] ?? 0) : undefined,
  }));

  const deptChartData = useMemo(
    () => depts.map((d) => ({
      dept: d.label,
      'Bütçe': ensureArray(d.monthly_budget).reduce((a, b) => a + b, 0),
      'Fiili': ensureArray(d.monthly_actual).reduce((a, b) => a + b, 0),
    })),
    [depts]
  );

  const chartMonthly = MONTH_LABELS.map((label, i) => ({
    label,
    ...(annualBudget > 0 ? { 'Bütçe': monthlyBudget[i] ?? 0 } : {}),
    'Fiili': (effectiveMonthlyActual[i] ?? 0) > 0 ? (effectiveMonthlyActual[i] ?? 0) : undefined,
  }));

  function toggleDept(id: string) {
    setOpenDepts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (lineItems.length === 0) {
    return (
      <div className="mt-4 p-4 text-sm text-gray-400 dark:text-gray-500 text-center">
        {categoryLabel} verileri yükleniyor...
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">

      {/* ── 2. Aylık Trend + Departman Dağılımı (yatay bar) ─────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Aylık Trend — sadece fiili çizgisi */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">
            Aylık Trend — 2025
          </p>
          <ChartWrapper height={180}>
            {(w, h) => (
              <ComposedChart width={w} height={h} data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={fmtM}
                  tick={{ fontSize: 9, fill: axisColor }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1)]}
                />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [fmtFull(v as number), name as string]}
                  contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 11 }}
                />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingTop: 6, color: axisColor }} />
                <Line
                  type="monotone"
                  dataKey="Fiili"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: '#f59e0b' }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                />
              </ComposedChart>
            )}
          </ChartWrapper>
        </div>

        {/* Departman Dağılımı — yatay bar (bütçe + fiili) */}
        {depts.length > 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">
              Departman Dağılımı — {categoryLabel}
            </p>
            <ChartWrapper height={180}>
              {(w, h) => (
                <ComposedChart
                  layout="vertical"
                  width={w}
                  height={h}
                  data={deptChartData}
                  margin={{ top: 4, right: 16, bottom: 0, left: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                  <XAxis
                    type="number"
                    tickFormatter={fmtM}
                    tick={{ fontSize: 9, fill: axisColor }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="dept"
                    tick={{ fontSize: 9, fill: axisColor }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [fmtFull(v as number), name as string]}
                    contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 11 }}
                  />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingTop: 6, color: axisColor }} />
                  <Bar dataKey="Bütçe" fill="#6366f1" radius={[0, 3, 3, 0]} maxBarSize={12} />
                  <Bar dataKey="Fiili"  fill="#f59e0b" radius={[0, 3, 3, 0]} maxBarSize={12} />
                </ComposedChart>
              )}
            </ChartWrapper>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Aylık Detay</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {['Ay', 'Bütçe', 'Fiili'].map((h, i) => (
                      <th key={h} className={`px-3 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {MONTH_LABELS.map((lbl, mi) => (
                    <tr key={lbl} className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${mi === activeMonth ? 'font-semibold bg-gray-50 dark:bg-gray-800/40' : ''}`}>
                      <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{lbl}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-600 dark:text-gray-400">{fmtM(monthlyBudget[mi] ?? 0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-amber-600 dark:text-amber-400">
                        {(monthlyActual[mi] ?? 0) > 0 ? fmtM(monthlyActual[mi]!) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. KPI kartları ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label:  'Bütçe Yıllık',
            value:  fmtM(annualBudget),
            sub:    `YTD ${fmtM(ytdBudget)}`,
            cls:    'text-gray-900 dark:text-white',
            border: 'border-gray-200 dark:border-gray-700',
          },
          {
            label:  'Fiili YTD',
            value:  fmtM(ytdActual),
            sub:    `Oca–${activeLabel} 2025`,
            cls:    'text-amber-600 dark:text-amber-400',
            border: 'border-amber-200 dark:border-amber-800',
          },
          {
            label:  'Sapma (TL)',
            value:  `${sapmaTL >= 0 ? '+' : ''}${fmtM(sapmaTL)}`,
            sub:    sapmaTL > 0 ? 'Aşım' : 'Tasarruf',
            cls:    sapmaTL > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            border: sapmaTL > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800',
          },
          {
            label:  'Sapma (%)',
            value:  `${sapmaPct >= 0 ? '+' : ''}${sapmaPct.toFixed(1)}%`,
            sub:    'YTD bütçeye göre',
            cls:    sapmaPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            border: sapmaPct > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800',
          },
        ].map(({ label, value, sub, cls, border }) => (
          <div key={label} className={`bg-white dark:bg-gray-900 rounded-lg border ${border} px-3 py-2.5 shadow-sm`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
            <p className={`text-sm font-bold mt-0.5 font-mono ${cls}`}>{value}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── 4. Grafikler (aylık bar+line + donut) ────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Aylık Bütçe vs Fiili */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">
            Aylık Bütçe vs Fiili — {categoryLabel} 2025
          </p>
          <ChartWrapper height={180}>
            {(w, h) => (
              <ComposedChart width={w} height={h} data={chartMonthly} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtM} tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [fmtFull(v as number), name as string]}
                  contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 11 }}
                />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingTop: 6, color: axisColor }} />
                <Bar dataKey="Fiili" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={18} />
                {annualBudget > 0 && (
                  <Line type="monotone" dataKey="Bütçe" stroke="#6366f1" strokeWidth={2} dot={{ r: 2.5, fill: '#6366f1' }} activeDot={{ r: 4 }} />
                )}
              </ComposedChart>
            )}
          </ChartWrapper>
        </div>

        {/* Departman Dağılımı — donut */}
        {depts.length > 0 ? (() => {
          const deptBudSums    = depts.map((d) => ensureArray(d.monthly_budget).reduce((a, b) => a + b, 0));
          const useActForDonut = deptBudSums.every((v) => v === 0);
          const deptDonutVals  = useActForDonut
            ? depts.map((d) => ensureArray(d.monthly_actual).reduce((a, b) => a + b, 0))
            : deptBudSums;
          const donutTotal = deptDonutVals.reduce((a, b) => a + b, 0);
          return (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                {useActForDonut ? 'Departman Dağılımı — Yıllık Fiili' : 'Departman Dağılımı — Yıllık Bütçe'}
              </p>
              <div className="flex items-center gap-2">
                <PieChart width={140} height={140}>
                  <Pie
                    data={depts.map((d, i) => ({ name: d.label, value: deptDonutVals[i] }))}
                    dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={38} outerRadius={58} paddingAngle={2}
                  >
                    {depts.map((_d, i) => <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [fmtM(v as number), name as string]}
                    contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 11 }}
                  />
                </PieChart>
                <div className="flex-1 space-y-1">
                  {depts.map((d, i) => {
                    const share = donutTotal > 0 ? (deptDonutVals[i] / donutTotal) * 100 : 0;
                    return (
                      <div key={d.dept_code} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                        <span className="text-[10px] text-gray-700 dark:text-gray-300 flex-1 truncate">{d.label}</span>
                        <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{share.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })() : (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Aylık Detay</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {['Ay', 'Bütçe', 'Fiili'].map((h, i) => (
                      <th key={h} className={`px-3 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {MONTH_LABELS.map((lbl, mi) => (
                    <tr key={lbl} className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${mi === activeMonth ? 'font-semibold bg-gray-50 dark:bg-gray-800/40' : ''}`}>
                      <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{lbl}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-600 dark:text-gray-400">{fmtM(monthlyBudget[mi] ?? 0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-amber-600 dark:text-amber-400">
                        {(monthlyActual[mi] ?? 0) > 0 ? fmtM(monthlyActual[mi]!) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── 5. Departman accordion ──────────────────────────────────────────── */}
      {depts.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Departman Detayı</p>
          </div>

          {depts.map((dept, di) => {
            const deptCode   = dept.dept_code ?? '';
            const isOpen     = openDepts.has(deptCode);
            const deptColor  = DEPT_COLORS[di % DEPT_COLORS.length];
            const mb         = ensureArray(dept.monthly_budget);
            const ma         = ensureArray(dept.monthly_actual);
            const deptAnnual = mb.reduce((a, b) => a + b, 0);
            const deptBudYTD = mb.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
            const deptActYTD = ma.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
            const deptSapma  = deptActYTD - deptBudYTD;
            const deptSapPct = deptBudYTD > 0 ? (deptSapma / deptBudYTD) * 100 : 0;
            const items      = lineItems.filter(
              (i) => i.category_code === categoryCode && i.row_type === 'item' && i.dept_code === deptCode
            );

            return (
              <div key={deptCode} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                <button
                  onClick={() => toggleDept(deptCode)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                >
                  <span
                    className="text-gray-400 dark:text-gray-500 text-[10px] flex-shrink-0 transition-transform duration-200"
                    style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  >▶</span>
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: deptColor }} />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex-1 text-left">{dept.label}</span>
                  <div className="hidden sm:flex items-center gap-4 text-[10px]">
                    <span className="text-gray-400 dark:text-gray-500">
                      YTD Bütçe: <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">{fmtM(deptBudYTD)}</span>
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">
                      YTD Fiili: <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">{fmtM(deptActYTD)}</span>
                    </span>
                    <span className={`font-mono font-semibold ${deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {deptSapPct >= 0 ? '+' : ''}{deptSapPct.toFixed(1)}%
                    </span>
                  </div>
                  <span className={`sm:hidden text-[10px] font-mono font-semibold ${deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {deptSapPct >= 0 ? '+' : ''}{deptSapPct.toFixed(1)}%
                  </span>
                </button>

                <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
                  <div className="overflow-hidden">
                    <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-3">

                      {/* dept KPI strip */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { label: 'Bütçe (Yıllık)', value: fmtM(deptAnnual),                                                         cls: 'text-gray-900 dark:text-white'                                                                   },
                          { label: 'Fiili YTD',       value: fmtM(deptActYTD),                                                        cls: 'text-amber-600 dark:text-amber-400'                                                              },
                          { label: 'Sapma (TL)',       value: `${deptSapma >= 0 ? '+' : ''}${fmtM(deptSapma)}`,                       cls: deptSapma > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'          },
                          { label: 'Sapma (%)',        value: `${deptSapPct >= 0 ? '+' : ''}${deptSapPct.toFixed(1)}%`,                cls: deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'         },
                        ].map(({ label, value, cls }) => (
                          <div key={label} className="bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 px-2.5 py-2">
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
                            <p className={`text-xs font-bold mt-0.5 font-mono ${cls}`}>{value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Alt Kalemler */}
                      {items.length > 0 ? (
                        <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                              Alt Kalemler — {items.filter((i) => !i.item_code?.endsWith('_l')).length} adet
                            </p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[400px] text-xs">
                              <thead className="bg-gray-50/80 dark:bg-gray-800/60">
                                <tr>
                                  {['Kalem', 'Bütçe (Yıllık)', 'Fiili YTD', 'Sapma %'].map((h, i) => (
                                    <th key={h} className={`px-3 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right min-w-[100px]'}`}>
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                {items.map((item) => {
                                  const isSub      = item.item_code?.endsWith('_l') ?? false;
                                  const isLitre    = item.unit_type === 'Litre';
                                  const ib         = ensureArray(item.monthly_budget);
                                  const ia         = ensureArray(item.monthly_actual);
                                  const itemAnnual = ib.reduce((a, b) => a + b, 0);
                                  const itemActYTD = ia.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
                                  const itemBudYTD = ib.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
                                  const itemSapma  = itemActYTD - itemBudYTD;
                                  const itemSapPct = itemBudYTD > 0 ? (itemSapma / itemBudYTD) * 100 : 0;
                                  const fmtVal     = (v: number) => isLitre
                                    ? (v > 0 ? v.toLocaleString('tr-TR') : '—')
                                    : fmtM(v);
                                  return (
                                    <tr key={item.item_code} className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${isSub ? 'opacity-75' : ''}`}>
                                      <td className={`px-3 py-1.5 text-gray-700 dark:text-gray-300 ${isSub ? 'pl-7 italic text-gray-500 dark:text-gray-400' : ''}`}>
                                        {item.label}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-mono text-gray-600 dark:text-gray-400">{fmtVal(itemAnnual)}</td>
                                      <td className="px-3 py-1.5 text-right font-mono text-amber-600 dark:text-amber-400">{fmtVal(itemActYTD)}</td>
                                      <td className={`px-3 py-1.5 text-right font-semibold ${
                                        itemSapma > 0 ? 'text-red-500 dark:text-red-400'
                                        : itemSapma < 0 ? 'text-green-600 dark:text-green-400'
                                        : 'text-gray-400 dark:text-gray-500'
                                      }`}>
                                        {!isLitre && itemActYTD > 0 ? `${itemSapPct >= 0 ? '+' : ''}${itemSapPct.toFixed(1)}%` : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
                                <tr>
                                  <td className="px-3 py-1.5 font-bold text-gray-800 dark:text-gray-100">Toplam</td>
                                  <td className="px-3 py-1.5 text-right font-bold font-mono text-gray-900 dark:text-white">{fmtM(deptAnnual)}</td>
                                  <td className="px-3 py-1.5 text-right font-bold font-mono text-amber-600 dark:text-amber-400">{fmtM(deptActYTD)}</td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 6. Parametre Detayı — param=satır, ay=kolon ─────────────────────── */}
      {params.length > 0 && (() => {
        const globalParams = params.filter((p) => !p.dept_code);
        const deptParamMap = new Map<string, typeof params>(
          depts.map((d) => [d.dept_code ?? '', params.filter((p) => p.dept_code === d.dept_code)])
        );
        const deptEntries = depts
          .map((d, di) => ({ dept: d, di, paramList: deptParamMap.get(d.dept_code ?? '') ?? [] }))
          .filter(({ paramList }) => paramList.length > 0);

        // Format helper: TL → fmtM (compact), other → toLocaleString
        const fmtCell = (v: number, unitType: string | null) => {
          if (v === 0) return '—';
          const isTL = unitType === 'TL' || unitType === 'TL Karşılığı';
          return isTL ? fmtM(v) : v.toLocaleString('tr-TR');
        };

        // Renders bütçe + fiili + fark rows for a single param item
        const renderParamRows = (p: typeof params[number]) => {
          const bud       = ensureArray(p.monthly_budget);
          const act       = ensureArray(p.monthly_actual);
          const budAnnual = bud.reduce((a, b) => a + b, 0);
          const actAnnual = act.reduce((a, b) => a + b, 0);
          const hasActual = act.some((v) => v !== 0);
          const unit      = p.unit_type ?? null;
          const key       = p.param_code ?? p.label;
          return (
            <React.Fragment key={key}>
              {/* bütçe satırı */}
              <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <td className="px-2 py-1 text-gray-700 dark:text-gray-300 font-medium truncate">{p.label}</td>
                <td className="px-1 py-1 text-[10px] text-gray-400 dark:text-gray-500 text-center">{unit ?? ''}</td>
                {bud.map((v, mi) => (
                  <td key={mi} className="px-1 py-1 text-right font-mono text-gray-600 dark:text-gray-400">{fmtCell(v, unit)}</td>
                ))}
                <td className="px-2 py-1 text-right font-mono font-semibold text-gray-700 dark:text-gray-300">{fmtCell(budAnnual, unit)}</td>
              </tr>
              {/* fiili satırı — amber, sadece actual varsa */}
              {hasActual && (
                <tr className="bg-amber-50/20 dark:bg-amber-900/10 hover:bg-amber-50/40 dark:hover:bg-amber-900/20 transition-colors">
                  <td className="px-2 py-1 pl-5 text-amber-600 dark:text-amber-400 italic text-[10px]">fiili</td>
                  <td />
                  {act.map((v, mi) => (
                    <td key={mi} className="px-1 py-1 text-right font-mono text-amber-600 dark:text-amber-400">{v === 0 ? '—' : fmtCell(v, unit)}</td>
                  ))}
                  <td className="px-2 py-1 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">{actAnnual === 0 ? '—' : fmtCell(actAnnual, unit)}</td>
                </tr>
              )}
              {/* fark satırı — kırmızı/yeşil, sadece actual varsa */}
              {hasActual && (
                <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                  <td className="px-2 py-1 pl-5 text-gray-400 dark:text-gray-500 italic text-[10px]">fark</td>
                  <td />
                  {bud.map((v, mi) => {
                    const diff = (act[mi] ?? 0) - v;
                    const hasMonth = act[mi] !== 0 || v !== 0;
                    return (
                      <td key={mi} className={`px-1 py-1 text-right font-mono text-[10px] ${
                        !hasMonth ? 'text-gray-300 dark:text-gray-700'
                        : diff > 0 ? 'text-red-500 dark:text-red-400'
                        : diff < 0 ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {!hasMonth ? '—' : diff === 0 ? '=' : `${diff > 0 ? '+' : ''}${fmtCell(diff, unit)}`}
                      </td>
                    );
                  })}
                  {(() => {
                    const totalDiff = actAnnual - budAnnual;
                    return (
                      <td className={`px-2 py-1 text-right font-mono font-semibold text-[10px] ${
                        totalDiff > 0 ? 'text-red-500 dark:text-red-400'
                        : totalDiff < 0 ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {totalDiff === 0 ? '=' : `${totalDiff > 0 ? '+' : ''}${fmtCell(totalDiff, unit)}`}
                      </td>
                    );
                  })()}
                </tr>
              )}
            </React.Fragment>
          );
        };

        // Shared colgroup + thead
        const tableHeader = (
          <>
            <colgroup>
              <col style={{ width: 160 }} />
              <col style={{ width: 36 }} />
              {MONTH_LABELS.map((m) => <col key={m} style={{ width: 52 }} />)}
              <col style={{ width: 72 }} />
            </colgroup>
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Parametre</th>
                <th className="px-1 py-1.5 text-center font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">PB</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="px-1 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">{m}</th>
                ))}
                <th className="px-2 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Yıllık</th>
              </tr>
            </thead>
          </>
        );

        return (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <button
              onClick={() => setParamOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
            >
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Parametre Detayı</p>
              <span
                className="text-gray-400 dark:text-gray-500 text-[10px] transition-transform duration-200"
                style={{ display: 'inline-block', transform: paramOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >▾</span>
            </button>

            <div style={{ display: 'grid', gridTemplateRows: paramOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
              <div className="overflow-hidden">
                <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-3">

                  {/* Global params (dept_code null) — önce */}
                  {globalParams.length > 0 && (
                    <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                      <table className="min-w-[1000px] text-xs table-fixed">
                        {tableHeader}
                        <tbody>{globalParams.map((p) => renderParamRows(p))}</tbody>
                      </table>
                    </div>
                  )}

                  {/* Dept grupları — accordion */}
                  {deptEntries.map(({ dept, di, paramList }) => {
                    const deptColor = DEPT_COLORS[di % DEPT_COLORS.length];
                    const deptKey   = dept.dept_code ?? `di_${di}`;
                    const isOpen    = openDeptParams.has(deptKey);
                    return (
                      <div key={deptKey} className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                        {/* dept accordion başlığı */}
                        <button
                          onClick={() => setOpenDeptParams((prev) => {
                            const next = new Set(prev);
                            if (next.has(deptKey)) next.delete(deptKey); else next.add(deptKey);
                            return next;
                          })}
                          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors select-none"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: deptColor }} />
                            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{dept.label}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">({paramList.length} param)</span>
                          </div>
                          <span className="text-gray-400 dark:text-gray-500 text-[10px]">{isOpen ? '▼' : '▶'}</span>
                        </button>
                        {/* dept param tablosu — accordion açıkken */}
                        <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
                          <div className="overflow-hidden">
                            <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
                              <table className="min-w-[1000px] text-xs table-fixed">
                                {tableHeader}
                                <tbody>{paramList.map((p) => renderParamRows(p))}</tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
