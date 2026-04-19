'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ComposedChart, Bar, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { LineItem } from './GuvenlikDetailPanel';

export interface GenericCategoryPanelProps {
  categoryCode: string;
  categoryLabel: string;
  lineItems: LineItem[];
  color?: string;
  dark: boolean;
}

const MONTH_LABELS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Evenly-distributed palette for dept donuts
const FALLBACK_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ec4899', '#f43f5e', '#84cc16',
];

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
  color = '#6366f1',
  dark,
}: GenericCategoryPanelProps) {
  const axisColor     = dark ? '#9ca3af' : '#6b7280';
  const gridColor     = dark ? '#374151' : '#e5e7eb';
  const tooltipBg     = dark ? '#1f2937' : '#ffffff';
  const tooltipBorder = dark ? '#374151' : '#e5e7eb';

  const [openDepts, setOpenDepts] = useState<Set<string>>(new Set());
  const [paramOpen, setParamOpen] = useState(false);

  // ── ref-based width measurement (avoids ResponsiveContainer -1 issue) ─────
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const donutContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(600);
  const [donutSize,  setDonutSize]  = useState(140);

  useEffect(() => {
    function measure() {
      if (chartContainerRef.current) {
        const w = chartContainerRef.current.getBoundingClientRect().width;
        if (w > 0) setChartWidth(Math.floor(w));
      }
      if (donutContainerRef.current) {
        const w = donutContainerRef.current.getBoundingClientRect().width;
        if (w > 0) setDonutSize(Math.floor(Math.min(w, 140)));
      }
    }
    measure();
    const ro = new ResizeObserver(() => measure());
    if (chartContainerRef.current) ro.observe(chartContainerRef.current);
    if (donutContainerRef.current) ro.observe(donutContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── derive totals ──────────────────────────────────────────────────────────

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

  // If total row actuals are all zero, sum dept actuals as fallback (e.g. HGS pass-through)
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

  // Derive a lighter shade of the accent color for the budget line
  const lineColor = color;
  const barColor  = color;

  if (lineItems.length === 0) {
    return (
      <div className="mt-4 p-4 text-sm text-gray-400 dark:text-gray-500 text-center">
        {categoryLabel} verileri yükleniyor...
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">

      {/* ── KPI kartları ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Bütçe Yıllık', value: fmtM(annualBudget), sub: `YTD ${fmtM(ytdBudget)}`,
            cls: 'text-gray-900 dark:text-white', border: 'border-gray-200 dark:border-gray-700',
          },
          {
            label: 'Fiili YTD', value: fmtM(ytdActual), sub: `Oca–${activeLabel} 2025`,
            cls: `font-mono`, border: 'border-gray-200 dark:border-gray-700',
            style: { color },
          },
          {
            label: 'Sapma (TL)', value: `${sapmaTL >= 0 ? '+' : ''}${fmtM(sapmaTL)}`, sub: sapmaTL > 0 ? 'Aşım' : 'Tasarruf',
            cls: sapmaTL > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            border: sapmaTL > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800',
          },
          {
            label: 'Sapma (%)', value: `${sapmaPct >= 0 ? '+' : ''}${sapmaPct.toFixed(1)}%`, sub: 'YTD bütçeye göre',
            cls: sapmaPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            border: sapmaPct > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800',
          },
        ].map(({ label, value, sub, cls, border, style }) => (
          <div key={label} className={`bg-white dark:bg-gray-900 rounded-lg border ${border ?? 'border-gray-200 dark:border-gray-700'} px-3 py-2.5 shadow-sm`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
            <p className={`text-sm font-bold mt-0.5 font-mono ${cls}`} style={style}>{value}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Grafikler ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Monthly chart */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">
            Aylık Bütçe vs Fiili — {categoryLabel} 2025
          </p>
          <div ref={chartContainerRef} style={{ width: '100%', height: 180, overflow: 'hidden' }}>
            <ComposedChart width={chartWidth} height={180} data={chartMonthly} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtM} tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                formatter={(v: unknown, name: unknown) => [fmtFull(v as number), name as string]}
                contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 11 }}
              />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingTop: 6, color: axisColor }} />
              <Bar dataKey="Fiili" fill={barColor} radius={[3, 3, 0, 0]} maxBarSize={18} />
              {annualBudget > 0 && (
                <Line type="monotone" dataKey="Bütçe" stroke={lineColor} strokeWidth={2} strokeDasharray="4 2" dot={{ r: 2.5, fill: lineColor }} activeDot={{ r: 4 }} />
              )}
            </ComposedChart>
          </div>
        </div>

        {/* Dept donut — only if depts exist */}
        {depts.length > 0 ? (() => {
          const deptBudSums   = depts.map((d) => ensureArray(d.monthly_budget).reduce((a, b) => a + b, 0));
          const useActForDonut = deptBudSums.every((v) => v === 0);
          const deptDonutVals  = useActForDonut
            ? depts.map((d) => ensureArray(d.monthly_actual).reduce((a, b) => a + b, 0))
            : deptBudSums;
          const donutTotal     = deptDonutVals.reduce((a, b) => a + b, 0);
          return (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              {useActForDonut ? 'Departman Dağılımı — Yıllık Fiili' : 'Departman Dağılımı — Yıllık Bütçe'}
            </p>
            <div className="flex items-center gap-2">
              <div ref={donutContainerRef} style={{ width: 140, height: 140, flexShrink: 0 }}>
                <PieChart width={donutSize} height={donutSize}>
                  <Pie
                    data={depts.map((d, i) => ({ name: d.label, value: deptDonutVals[i] }))}
                    dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={2}
                  >
                    {depts.map((_d, i) => <Cell key={i} fill={FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [fmtM(v as number), name as string]}
                    contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 11 }}
                  />
                </PieChart>
              </div>
              <div className="flex-1 space-y-1">
                {depts.map((d, i) => {
                  const share = donutTotal > 0 ? (deptDonutVals[i] / donutTotal) * 100 : 0;
                  return (
                    <div key={d.dept_code} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: FALLBACK_COLORS[i % FALLBACK_COLORS.length] }} />
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
          /* Fallback: monthly detail table when no depts */
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Aylık Detay</p>
            <table className="w-full text-[10px]" style={{ tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: 56 }} /><col /><col /></colgroup>
              <thead>
                <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left pb-1 font-medium">Ay</th>
                  <th className="text-right pb-1 font-medium">Bütçe</th>
                  <th className="text-right pb-1 font-medium">Fiili</th>
                </tr>
              </thead>
              <tbody>
                {MONTH_LABELS.map((lbl, mi) => (
                  <tr key={lbl} className={mi === activeMonth ? 'font-semibold' : 'border-b border-gray-50 dark:border-gray-800'}>
                    <td className="py-0.5 text-gray-500 dark:text-gray-400">{lbl}</td>
                    <td className="py-0.5 text-right font-mono text-gray-600 dark:text-gray-300">{fmtM(monthlyBudget[mi] ?? 0)}</td>
                    <td className="py-0.5 text-right font-mono" style={{ color: (monthlyActual[mi] ?? 0) > 0 ? color : undefined }}>
                      {(monthlyActual[mi] ?? 0) > 0 ? fmtM(monthlyActual[mi]!) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Departman accordion ──────────────────────────────────────────── */}
      {depts.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Departman Detayı</p>
          </div>

          {depts.map((dept, di) => {
            const deptCode   = dept.dept_code ?? '';
            const isOpen     = openDepts.has(deptCode);
            const deptColor  = FALLBACK_COLORS[di % FALLBACK_COLORS.length];
            const mb         = ensureArray(dept.monthly_budget);
            const ma         = ensureArray(dept.monthly_actual);
            const deptAnnual = mb.reduce((a, b) => a + b, 0);
            const deptBudYTD = mb.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
            const deptActYTD = ma.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
            const deptSapma  = deptActYTD - deptBudYTD;
            const deptSapPct = deptBudYTD > 0 ? (deptSapma / deptBudYTD) * 100 : 0;

            return (
              <div key={deptCode} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                <button
                  onClick={() => toggleDept(deptCode)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                >
                  <span
                    className="text-gray-400 dark:text-gray-500 text-[10px] flex-shrink-0"
                    style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                  >▶</span>
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: deptColor }} />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex-1 text-left">{dept.label}</span>
                  <div className="hidden sm:flex items-center gap-4 text-[10px]">
                    <span className="text-gray-400 dark:text-gray-500">Yıllık: <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">{fmtM(deptAnnual)}</span></span>
                    <span className="text-gray-400 dark:text-gray-500">YTD Bütçe: <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">{fmtM(deptBudYTD)}</span></span>
                    <span className="text-gray-400 dark:text-gray-500">YTD Fiili: <span className="font-mono font-semibold" style={{ color }}>{fmtM(deptActYTD)}</span></span>
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
                          { label: 'Bütçe (Yıllık)', value: fmtM(deptAnnual),                                                              cls: 'text-gray-900 dark:text-white',                                                                                    border: 'border-gray-200 dark:border-gray-700' },
                          { label: 'Fiili YTD',       value: fmtM(deptActYTD),                                                             cls: '',                                                                                                                 border: 'border-gray-200 dark:border-gray-700', style: { color } },
                          { label: 'Sapma (TL)',       value: `${deptSapma >= 0 ? '+' : ''}${fmtM(deptSapma)}`,                            cls: deptSapma > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',                            border: deptSapma > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800' },
                          { label: 'Sapma (%)',        value: `${deptSapPct >= 0 ? '+' : ''}${deptSapPct.toFixed(1)}%`,                    cls: deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',                           border: deptSapPct > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800' },
                        ].map(({ label, value, cls, border, style }) => (
                          <div key={label} className={`bg-white dark:bg-gray-900 rounded border ${border} px-2.5 py-2`}>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
                            <p className={`text-xs font-bold mt-0.5 font-mono ${cls}`} style={style}>{value}</p>
                          </div>
                        ))}
                      </div>

                      {/* monthly table */}
                      <table className="w-full text-[10px]" style={{ tableLayout: 'fixed' }}>
                        <colgroup><col style={{ width: 56 }} /><col /><col /></colgroup>
                        <thead>
                          <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left pb-1 font-medium">Ay</th>
                            <th className="text-right pb-1 font-medium">Bütçe</th>
                            <th className="text-right pb-1 font-medium">Fiili</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MONTH_LABELS.map((lbl, mi) => {
                            const bv     = mb[mi] ?? 0;
                            const av     = ma[mi] ?? 0;
                            const active = mi === activeMonth;
                            return (
                              <tr key={lbl} className={active ? 'font-semibold' : 'border-b border-gray-50 dark:border-gray-800'}>
                                <td className="py-0.5 text-gray-500 dark:text-gray-400">{lbl}</td>
                                <td className="py-0.5 text-right font-mono text-gray-600 dark:text-gray-300">{fmtM(bv)}</td>
                                <td className="py-0.5 text-right font-mono" style={{ color: av > 0 ? color : undefined }}>
                                  {av > 0 ? fmtM(av) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t border-gray-200 dark:border-gray-700">
                          <tr className="font-semibold text-gray-700 dark:text-gray-200">
                            <td className="pt-1">Toplam</td>
                            <td className="pt-1 text-right font-mono">{fmtM(deptAnnual)}</td>
                            <td className="pt-1 text-right font-mono" style={{ color }}>{fmtM(deptActYTD)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Parametre paneli ─────────────────────────────────────────────── */}
      {params.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <button
            onClick={() => setParamOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors border-b border-gray-100 dark:border-gray-700"
          >
            <span
              className="text-gray-400 dark:text-gray-500 text-[10px]"
              style={{ display: 'inline-block', transform: paramOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >▶</span>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Parametre Detayı</p>
          </button>

          <div style={{ display: 'grid', gridTemplateRows: paramOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
            <div className="overflow-hidden">
              <div className="p-3 overflow-x-auto">
                <table className="w-full text-[10px]" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 56 }} />
                    {params.map((p) => <col key={p.param_code} />)}
                  </colgroup>
                  <thead>
                    <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left pb-1.5 font-medium">Ay</th>
                      {params.map((p) => (
                        <th key={p.param_code} className="text-right pb-1.5 font-medium truncate">{p.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MONTH_LABELS.map((lbl, mi) => {
                      const active = mi === activeMonth;
                      return (
                        <tr key={lbl} className={active ? 'font-semibold bg-gray-50 dark:bg-gray-800/40' : 'border-b border-gray-50 dark:border-gray-800'}>
                          <td className="py-0.5 text-gray-500 dark:text-gray-400">{lbl}</td>
                          {params.map((p) => {
                            const arr = ensureArray(p.monthly_budget);
                            const v   = arr[mi] ?? 0;
                            return (
                              <td key={p.param_code} className="py-0.5 text-right font-mono text-gray-700 dark:text-gray-300">
                                {v !== 0 ? v.toLocaleString('tr-TR') : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
