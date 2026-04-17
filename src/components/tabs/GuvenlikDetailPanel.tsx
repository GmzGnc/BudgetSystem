'use client';

import React, { useState } from 'react';
import {
  ComposedChart, Bar, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  GUVENLIK_TOTAL_BUDGET,
  GUVENLIK_TOTAL_ACTUAL_YTD,
  GUVENLIK_MONTHLY_BUDGET,
  GUVENLIK_MONTHLY_ACTUAL,
  GUVENLIK_DEPTS,
  GUVENLIK_UNIT_WAGES,
  GUVENLIK_HEADCOUNT,
  GUVENLIK_DEPT_COLORS,
  GUVENLIK_ACTIVE_MONTHS,
} from '@/data/guvenlik-data';

const MONTH_LABELS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function fmtM(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₺${(n / 1_000).toFixed(0)}B`;
  return `₺${n.toLocaleString('tr-TR')}`;
}
function fmtFull(n: number): string {
  return `₺${n.toLocaleString('tr-TR')}`;
}

// YTD budget = sum of active months
const YTD_BUDGET = GUVENLIK_ACTIVE_MONTHS.reduce((s, mi) => s + GUVENLIK_MONTHLY_BUDGET[mi], 0);
const SAPMA_TL   = GUVENLIK_TOTAL_ACTUAL_YTD - YTD_BUDGET;
const SAPMA_PCT  = YTD_BUDGET > 0 ? (SAPMA_TL / YTD_BUDGET) * 100 : 0;

const CHART_MONTHLY = MONTH_LABELS.map((label, i) => ({
  label,
  'Bütçe':  GUVENLIK_MONTHLY_BUDGET[i],
  'Fiili':  GUVENLIK_MONTHLY_ACTUAL[i] || undefined,
}));

interface Props {
  dark: boolean;
}

export default function GuvenlikDetailPanel({ dark }: Props) {
  const axisColor = dark ? '#9ca3af' : '#6b7280';
  const gridColor = dark ? '#374151' : '#e5e7eb';
  const tooltipBg = dark ? '#1f2937' : '#ffffff';
  const tooltipBorder = dark ? '#374151' : '#e5e7eb';

  const [openDepts, setOpenDepts]         = useState<Set<string>>(new Set());
  const [paramOpen, setParamOpen]         = useState(false);
  const [openParamDepts, setOpenParamDepts] = useState<Set<string>>(new Set());

  function toggleDept(id: string) {
    setOpenDepts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-4 space-y-4">

      {/* ── LEVEL 1: KPI kartları ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label:   'Bütçe Yıllık',
            value:   fmtM(GUVENLIK_TOTAL_BUDGET),
            sub:     `YTD ${fmtM(YTD_BUDGET)}`,
            cls:     'text-gray-900 dark:text-white',
            border:  'border-gray-200 dark:border-gray-700',
          },
          {
            label:   'Fiili YTD',
            value:   fmtM(GUVENLIK_TOTAL_ACTUAL_YTD),
            sub:     `Oca–Mar 2025`,
            cls:     'text-amber-600 dark:text-amber-400',
            border:  'border-amber-200 dark:border-amber-800',
          },
          {
            label:   'Sapma (TL)',
            value:   `${SAPMA_TL >= 0 ? '+' : ''}${fmtM(SAPMA_TL)}`,
            sub:     SAPMA_TL > 0 ? 'Aşım' : 'Tasarruf',
            cls:     SAPMA_TL > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            border:  SAPMA_TL > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800',
          },
          {
            label:   'Sapma (%)',
            value:   `${SAPMA_PCT >= 0 ? '+' : ''}${SAPMA_PCT.toFixed(1)}%`,
            sub:     'YTD bütçeye göre',
            cls:     SAPMA_PCT > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            border:  SAPMA_PCT > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800',
          },
        ].map(({ label, value, sub, cls, border }) => (
          <div
            key={label}
            className={`bg-white dark:bg-gray-900 rounded-lg border ${border} px-3 py-2.5 shadow-sm`}
          >
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
            <p className={`text-sm font-bold mt-0.5 font-mono ${cls}`}>{value}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Grafikler ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Aylık Bütçe vs Fiili — ComposedChart */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">
            Aylık Bütçe vs Fiili — Güvenlik 2025
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={CHART_MONTHLY} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtM} tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                formatter={(v: unknown, name: unknown) => [fmtFull(v as number), name as string]}
                contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 11 }}
              />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingTop: 6, color: axisColor }} />
              <Bar dataKey="Fiili" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Line type="monotone" dataKey="Bütçe" stroke="#6366f1" strokeWidth={2} dot={{ r: 2.5, fill: '#6366f1' }} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Dept dağılımı — Pie */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
            Departman Dağılımı — Yıllık Bütçe
          </p>
          <div className="flex items-center gap-2">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie
                  data={GUVENLIK_DEPTS}
                  dataKey="budgetYearly"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={38} outerRadius={58}
                  paddingAngle={2}
                >
                  {GUVENLIK_DEPTS.map((d, i) => (
                    <Cell key={d.id} fill={GUVENLIK_DEPT_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [fmtM(v as number), name as string]}
                  contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1">
              {GUVENLIK_DEPTS.map((d, i) => {
                const share = GUVENLIK_TOTAL_BUDGET > 0
                  ? (d.budgetYearly / GUVENLIK_TOTAL_BUDGET) * 100
                  : 0;
                return (
                  <div key={d.id} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: GUVENLIK_DEPT_COLORS[i] }} />
                    <span className="text-[10px] text-gray-700 dark:text-gray-300 flex-1 truncate">{d.name}</span>
                    <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{share.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── LEVEL 2: Departman accordion ────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Departman Detayı</p>
        </div>

        {GUVENLIK_DEPTS.map((dept, di) => {
          const isOpen    = openDepts.has(dept.id);
          const deptColor = GUVENLIK_DEPT_COLORS[di];
          const deptYTD   = dept.monthlyActual.reduce((s, v) => s + v, 0);
          const deptBudYTD = GUVENLIK_ACTIVE_MONTHS.reduce((s, mi) => s + dept.monthlyBudget[mi], 0);
          const deptSapma  = deptYTD - deptBudYTD;
          const deptSapPct = deptBudYTD > 0 ? (deptSapma / deptBudYTD) * 100 : 0;

          return (
            <div key={dept.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
              {/* dept header row */}
              <button
                onClick={() => toggleDept(dept.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
              >
                <span
                  className="text-gray-400 dark:text-gray-500 text-[10px] flex-shrink-0 transition-transform duration-200"
                  style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  ▶
                </span>
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: deptColor }} />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex-1 text-left">
                  {dept.name}
                </span>
                {/* mini KPIs — YTD values */}
                <div className="hidden sm:flex items-center gap-4 text-[10px]">
                  <span className="text-gray-400 dark:text-gray-500">
                    YTD Bütçe: <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">{fmtM(deptBudYTD)}</span>
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">
                    YTD Fiili: <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">{fmtM(deptYTD)}</span>
                  </span>
                  <span className={`font-mono font-semibold ${deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {deptSapPct >= 0 ? '+' : ''}{deptSapPct.toFixed(1)}%
                  </span>
                </div>
                {/* mobile: YTD sapma */}
                <span className={`sm:hidden text-[10px] font-mono font-semibold ${deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {deptSapPct >= 0 ? '+' : ''}{deptSapPct.toFixed(1)}%
                </span>
              </button>

              {/* dept detail (level 2 expanded) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows 0.25s ease',
                }}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-3">

                    {/* dept KPI strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Bütçe (Yıllık)',  value: fmtM(dept.budgetYearly), cls: 'text-gray-900 dark:text-white' },
                        { label: 'Fiili YTD',        value: fmtM(deptYTD),          cls: 'text-amber-600 dark:text-amber-400' },
                        { label: 'Sapma (TL)',        value: `${deptSapma >= 0 ? '+' : ''}${fmtM(deptSapma)}`, cls: deptSapma > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400' },
                        { label: 'Sapma (%)',         value: `${deptSapPct >= 0 ? '+' : ''}${deptSapPct.toFixed(1)}%`, cls: deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400' },
                      ].map(({ label, value, cls }) => (
                        <div key={label} className="bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 px-2.5 py-2">
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
                          <p className={`text-xs font-bold mt-0.5 font-mono ${cls}`}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* LEVEL 3: kalem detayları */}
                    {dept.items.length > 0 && (
                      <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Alt Kalemler — {dept.items.length} adet
                          </p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[400px] text-xs">
                            <thead className="bg-gray-50/80 dark:bg-gray-800/60">
                              <tr>
                                <th className="px-3 py-1.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                  Kalem
                                </th>
                                <th className="px-3 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide min-w-[100px]">
                                  Bütçe (Yıllık)
                                </th>
                                <th className="px-3 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide min-w-[100px]">
                                  Fiili YTD
                                </th>
                                <th className="px-3 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide min-w-[60px]">
                                  Sapma %
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                              {dept.items.map((item) => {
                                const itemBudYTD = GUVENLIK_ACTIVE_MONTHS.length > 0
                                  ? Math.round(item.budgetYearly / 12) * GUVENLIK_ACTIVE_MONTHS.length
                                  : 0;
                                const itemSapma = item.actualYTD - itemBudYTD;
                                const itemSapPct = itemBudYTD > 0 ? (itemSapma / itemBudYTD) * 100 : 0;
                                return (
                                  <tr
                                    key={item.rowNum}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                                  >
                                    <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{item.name}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-600 dark:text-gray-400">
                                      {fmtM(item.budgetYearly)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono text-amber-600 dark:text-amber-400">
                                      {item.actualYTD > 0 ? fmtM(item.actualYTD) : '—'}
                                    </td>
                                    <td className={`px-3 py-1.5 text-right font-semibold ${
                                      itemSapma > 0
                                        ? 'text-red-500 dark:text-red-400'
                                        : itemSapma < 0
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-gray-400 dark:text-gray-500'
                                    }`}>
                                      {item.actualYTD > 0
                                        ? `${itemSapPct >= 0 ? '+' : ''}${itemSapPct.toFixed(1)}%`
                                        : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
                              <tr>
                                <td className="px-3 py-1.5 font-bold text-gray-800 dark:text-gray-100">Toplam</td>
                                <td className="px-3 py-1.5 text-right font-bold font-mono text-gray-900 dark:text-white">
                                  {fmtM(dept.items.reduce((s, it) => s + it.budgetYearly, 0))}
                                </td>
                                <td className="px-3 py-1.5 text-right font-bold font-mono text-amber-600 dark:text-amber-400">
                                  {fmtM(dept.items.reduce((s, it) => s + it.actualYTD, 0))}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {dept.items.length === 0 && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 italic px-1">
                        Bu departman için alt kalem detayı bulunmamaktadır.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── PARAMETRE PANELİ (collapsible) ────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <button
          onClick={() => setParamOpen((p) => !p)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
        >
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Parametre Detayı — Birim Ücret & Kişi Sayısı
          </p>
          <span
            className="text-gray-400 dark:text-gray-500 text-[10px] transition-transform duration-200"
            style={{ display: 'inline-block', transform: paramOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▾
          </span>
        </button>

        <div
          style={{
            display: 'grid',
            gridTemplateRows: paramOpen ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.25s ease',
          }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-3">

              {/* Birim Ücret tablosu */}
              <div>
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Birim Ücret Parametreleri (Aylık)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        {['Pozisyon', 'Bütçe (Aylık)', 'Fiili (Aylık)', 'Fark %'].map((h, i) => (
                          <th
                            key={h}
                            className={`px-3 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {GUVENLIK_UNIT_WAGES.map((w) => {
                        const diff = w.budgetMonthly > 0
                          ? ((w.actualMonthly - w.budgetMonthly) / w.budgetMonthly) * 100
                          : 0;
                        return (
                          <tr key={w.rowNum} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{w.position}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-gray-600 dark:text-gray-400">
                              {w.budgetMonthly > 0 ? fmtM(w.budgetMonthly) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-amber-600 dark:text-amber-400">
                              {w.actualMonthly > 0 ? fmtM(w.actualMonthly) : '—'}
                            </td>
                            <td className={`px-3 py-1.5 text-right font-semibold ${
                              diff > 0 ? 'text-red-500 dark:text-red-400' : diff < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'
                            }`}>
                              {w.budgetMonthly > 0 && w.actualMonthly > 0
                                ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Kişi Sayısı — per-dept sub-accordions */}
              <div>
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Kişi Sayısı Parametreleri
                </p>
                <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {GUVENLIK_HEADCOUNT.map((hc) => {
                    const diff = hc.actual - hc.budget;
                    const isToplam = hc.group === 'Toplam';
                    const hasChildren = (hc.items && hc.items.length > 0) || hc.note;
                    const isParamOpen = openParamDepts.has(hc.group);

                    return (
                      <div key={hc.group} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                        {/* group row — clickable if it has children */}
                        <div
                          role={hasChildren ? 'button' : undefined}
                          onClick={hasChildren ? () => setOpenParamDepts((prev) => {
                            const next = new Set(prev);
                            if (next.has(hc.group)) next.delete(hc.group);
                            else next.add(hc.group);
                            return next;
                          }) : undefined}
                          className={`flex items-center gap-2 px-3 py-2 text-xs ${
                            hasChildren ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60' : ''
                          } ${isToplam ? 'bg-gray-50 dark:bg-gray-800/40 font-semibold' : ''} transition-colors`}
                        >
                          {hasChildren && (
                            <span
                              className="text-gray-400 dark:text-gray-500 text-[9px] flex-shrink-0 transition-transform duration-200"
                              style={{ display: 'inline-block', transform: isParamOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                            >
                              ▶
                            </span>
                          )}
                          {!hasChildren && <span className="w-[9px] flex-shrink-0" />}
                          <span className="flex-1 text-gray-700 dark:text-gray-300">{hc.group}</span>
                          {!hc.note && (
                            <>
                              <span className="w-10 text-right font-mono text-gray-600 dark:text-gray-400">{hc.budget}</span>
                              <span className="w-10 text-right font-mono text-amber-600 dark:text-amber-400">{hc.actual}</span>
                              <span className={`w-8 text-right font-semibold ${
                                diff > 0 ? 'text-red-500 dark:text-red-400' : diff < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'
                              }`}>
                                {diff !== 0 ? `${diff > 0 ? '+' : ''}${diff}` : '='}
                              </span>
                            </>
                          )}
                          {hc.note && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 italic text-right flex-1">
                              —
                            </span>
                          )}
                        </div>

                        {/* expandable items */}
                        {hasChildren && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateRows: isParamOpen ? '1fr' : '0fr',
                              transition: 'grid-template-rows 0.2s ease',
                            }}
                          >
                            <div className="overflow-hidden">
                              {hc.note ? (
                                <div className="px-4 pl-8 py-2 bg-amber-50/60 dark:bg-amber-950/20 border-t border-gray-100 dark:border-gray-800">
                                  <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">{hc.note}</p>
                                </div>
                              ) : (
                                <table className="w-full text-xs border-t border-gray-100 dark:border-gray-800">
                                  <thead className="bg-gray-50/80 dark:bg-gray-800/50">
                                    <tr>
                                      <th className="px-3 pl-8 py-1 text-left font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Kalem</th>
                                      <th className="px-3 py-1 text-right font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide w-12">Büt.</th>
                                      <th className="px-3 py-1 text-right font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide w-12">Fili</th>
                                      <th className="px-3 py-1 text-right font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide w-10">Fark</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                    {hc.items!.map((item) => {
                                      const itemDiff = item.actual - item.budget;
                                      return (
                                        <tr key={item.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                          <td className="px-3 pl-8 py-1 text-gray-600 dark:text-gray-400">{item.name}</td>
                                          <td className="px-3 py-1 text-right font-mono text-gray-500 dark:text-gray-500">{item.budget}</td>
                                          <td className="px-3 py-1 text-right font-mono text-amber-500 dark:text-amber-500">{item.actual}</td>
                                          <td className={`px-3 py-1 text-right font-semibold ${
                                            itemDiff > 0 ? 'text-red-400 dark:text-red-500' : itemDiff < 0 ? 'text-green-500 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'
                                          }`}>
                                            {itemDiff !== 0 ? `${itemDiff > 0 ? '+' : ''}${itemDiff}` : '='}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
