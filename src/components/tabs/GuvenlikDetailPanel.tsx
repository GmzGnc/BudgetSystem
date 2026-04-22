'use client';

import React, { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import ChartWrapper from '@/components/ChartWrapper';

export interface LineItem {
  category_code: string;
  row_type: 'total' | 'dept' | 'item' | 'param';
  dept_code: string | null;
  item_code: string | null;
  param_code: string | null;
  label: string;
  monthly_budget: number[];
  monthly_actual: number[];
  unit_type: string | null;
  company?: 'ICA' | 'ICE';
}

interface Props {
  dark: boolean;
  lineItems: LineItem[];
}

const MONTH_LABELS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DEPT_COLORS  = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

// Headcount group hierarchy — defines which param_code is the group total
// and which param_code prefix identifies its children
const HC_GROUPS = [
  { id: 'toplam',    label: 'Toplam',          parentCode: 'kisi_toplam',    childPrefix: null            as string | null },
  { id: 'gyg',       label: 'GYG',             parentCode: 'kisi_gyg',       childPrefix: 'kisi_gyg_'     as string | null },
  { id: 'oht',       label: 'OHT',             parentCode: 'kisi_oht',       childPrefix: 'kisi_oht_'     as string | null },
  { id: 'operasyon', label: 'Operasyon',       parentCode: 'kisi_operasyon', childPrefix: 'kisi_ops_'     as string | null },
  { id: 'ictas',     label: 'İçtaş Güvenlik', parentCode: 'kisi_ictas',     childPrefix: 'kisi_ictas_'   as string | null },
  { id: 'kilyos',    label: 'Kilyos',          parentCode: 'kisi_kilyos',    childPrefix: 'kisi_kilyos_'  as string | null },
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

export default function GuvenlikDetailPanel({ dark, lineItems }: Props) {
  const axisColor    = dark ? '#9ca3af' : '#6b7280';
  const gridColor    = dark ? '#374151' : '#e5e7eb';
  const tooltipBg    = dark ? '#1f2937' : '#ffffff';
  const tooltipBorder = dark ? '#374151' : '#e5e7eb';

  const [openDepts,     setOpenDepts]     = useState<Set<string>>(new Set());
  const [paramOpen,     setParamOpen]     = useState(false);
  const [openParamDepts, setOpenParamDepts] = useState<Set<string>>(new Set());

  // ── derive data from lineItems ──────────────────────────────────────────────

  const totalItem = useMemo(
    () => lineItems.find((i) => i.category_code === 'guvenlik' && i.row_type === 'total') ?? null,
    [lineItems]
  );

  // Supabase JSONB arrives as a parsed array via REST, but guard against string in case
  function ensureArray(v: number[] | string | undefined | null): number[] {
    if (!v) return Array(12).fill(0);
    if (typeof v === 'string') {
      try { return JSON.parse(v) as number[]; } catch { return Array(12).fill(0); }
    }
    return v;
  }

  const monthlyBudget: number[] = ensureArray(totalItem?.monthly_budget);
  const monthlyActual: number[] = ensureArray(totalItem?.monthly_actual);

  // activeMonth: last index where actual > 0
  const activeMonth = useMemo(() => {
    for (let i = 11; i >= 0; i--) {
      if (monthlyActual[i] > 0) return i;
    }
    return 0;
  }, [monthlyActual]);

  const annualBudget = monthlyBudget.reduce((a, b) => a + b, 0);
  const ytdBudget    = monthlyBudget.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
  const ytdActual    = monthlyActual.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
  const sapmaTL      = ytdActual - ytdBudget;
  const sapmaPct     = ytdBudget > 0 ? (sapmaTL / ytdBudget) * 100 : 0;

  const activeLabel = MONTH_LABELS[activeMonth] ?? '';

  const depts = useMemo(
    () => lineItems.filter((i) => i.category_code === 'guvenlik' && i.row_type === 'dept'),
    [lineItems]
  );

  const deptItems = (deptCode: string) =>
    lineItems.filter((i) => i.category_code === 'guvenlik' && i.row_type === 'item' && i.dept_code === deptCode);

  const unitWages = useMemo(
    () => lineItems.filter((i) => i.category_code === 'guvenlik' && i.row_type === 'param' && i.param_code?.startsWith('ucret_')),
    [lineItems]
  );

  const paramByCode = useMemo(() => {
    const m = new Map<string, LineItem>();
    lineItems
      .filter((i) => i.category_code === 'guvenlik' && i.row_type === 'param')
      .forEach((i) => { if (i.param_code) m.set(i.param_code, i); });
    return m;
  }, [lineItems]);

  const chartMonthly = MONTH_LABELS.map((label, i) => ({
    label,
    'Bütçe': monthlyBudget[i] ?? 0,
    'Fiili': (monthlyActual[i] ?? 0) > 0 ? (monthlyActual[i] ?? 0) : undefined,
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
        Güvenlik verileri yükleniyor...
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">

      {/* ── LEVEL 1: KPI kartları ─────────────────────────────────────────── */}
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

        {/* Aylık Bütçe vs Fiili */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">
            Aylık Bütçe vs Fiili — Güvenlik 2025
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
                <Line type="monotone" dataKey="Bütçe" stroke="#6366f1" strokeWidth={2} dot={{ r: 2.5, fill: '#6366f1' }} activeDot={{ r: 4 }} />
              </ComposedChart>
            )}
          </ChartWrapper>
        </div>

        {/* Dept dağılımı — Pie */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
            Departman Dağılımı — Yıllık Bütçe
          </p>
          <div className="flex items-center gap-2">
            <PieChart width={140} height={140}>
              <Pie
                data={depts.map((d) => ({
                  name: d.label,
                  value: d.monthly_budget.reduce((a, b) => a + b, 0),
                }))}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                innerRadius={38} outerRadius={58}
                paddingAngle={2}
              >
                {depts.map((_d, i) => (
                  <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: unknown, name: unknown) => [fmtM(v as number), name as string]}
                contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 11 }}
              />
            </PieChart>
            <div className="flex-1 space-y-1">
              {depts.map((d, i) => {
                const deptAnnual = d.monthly_budget.reduce((a, b) => a + b, 0);
                const share = annualBudget > 0 ? (deptAnnual / annualBudget) * 100 : 0;
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
      </div>

      {/* ── LEVEL 2: Departman accordion ────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Departman Detayı</p>
        </div>

        {depts.map((dept, di) => {
          const deptCode   = dept.dept_code ?? '';
          const isOpen     = openDepts.has(deptCode);
          const deptColor  = DEPT_COLORS[di % DEPT_COLORS.length];
          const deptAnnual = dept.monthly_budget.reduce((a, b) => a + b, 0);
          const deptBudYTD = dept.monthly_budget.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
          const deptActYTD = dept.monthly_actual.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
          const deptSapma  = deptActYTD - deptBudYTD;
          const deptSapPct = deptBudYTD > 0 ? (deptSapma / deptBudYTD) * 100 : 0;
          const items      = deptItems(deptCode);

          return (
            <div key={deptCode} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
              <button
                onClick={() => toggleDept(deptCode)}
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
                  {dept.label}
                </span>
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
                        { label: 'Bütçe (Yıllık)', value: fmtM(deptAnnual),                                                                                              cls: 'text-gray-900 dark:text-white' },
                        { label: 'Fiili YTD',       value: fmtM(deptActYTD),                                                                                             cls: 'text-amber-600 dark:text-amber-400' },
                        { label: 'Sapma (TL)',       value: `${deptSapma >= 0 ? '+' : ''}${fmtM(deptSapma)}`,                                                            cls: deptSapma > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400' },
                        { label: 'Sapma (%)',        value: `${deptSapPct >= 0 ? '+' : ''}${deptSapPct.toFixed(1)}%`,                                                    cls: deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400' },
                      ].map(({ label, value, cls }) => (
                        <div key={label} className="bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 px-2.5 py-2">
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
                          <p className={`text-xs font-bold mt-0.5 font-mono ${cls}`}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* LEVEL 3: item rows */}
                    {items.length > 0 && (
                      <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Alt Kalemler — {items.length} adet
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
                                const itemAnnual = item.monthly_budget.reduce((a, b) => a + b, 0);
                                const itemActYTD = item.monthly_actual.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
                                const itemBudYTD = item.monthly_budget.slice(0, activeMonth + 1).reduce((a, b) => a + b, 0);
                                const itemSapma  = itemActYTD - itemBudYTD;
                                const itemSapPct = itemBudYTD > 0 ? (itemSapma / itemBudYTD) * 100 : 0;
                                return (
                                  <tr key={item.item_code} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                    <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{item.label}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-600 dark:text-gray-400">{fmtM(itemAnnual)}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-amber-600 dark:text-amber-400">
                                      {itemActYTD > 0 ? fmtM(itemActYTD) : '—'}
                                    </td>
                                    <td className={`px-3 py-1.5 text-right font-semibold ${
                                      itemSapma > 0 ? 'text-red-500 dark:text-red-400'
                                      : itemSapma < 0 ? 'text-green-600 dark:text-green-400'
                                      : 'text-gray-400 dark:text-gray-500'
                                    }`}>
                                      {itemActYTD > 0 ? `${itemSapPct >= 0 ? '+' : ''}${itemSapPct.toFixed(1)}%` : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
                              <tr>
                                <td className="px-3 py-1.5 font-bold text-gray-800 dark:text-gray-100">Toplam</td>
                                <td className="px-3 py-1.5 text-right font-bold font-mono text-gray-900 dark:text-white">
                                  {fmtM(deptAnnual)}
                                </td>
                                <td className="px-3 py-1.5 text-right font-bold font-mono text-amber-600 dark:text-amber-400">
                                  {fmtM(deptActYTD)}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {items.length === 0 && (
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

      {/* ── PARAMETRE PANELİ ─────────────────────────────────────────────── */}
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

              {/* ── Birim Ücret — 12 ay kolonlu ────────────────────────────── */}
              <div>
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Birim Ücret Parametreleri
                </p>
                <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                  <table className="min-w-[1000px] text-xs table-fixed">
                    <colgroup>
                      <col style={{ width: 180 }} />
                      {MONTH_LABELS.map((m) => <col key={m} style={{ width: 52 }} />)}
                      <col style={{ width: 72 }} />
                    </colgroup>
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Pozisyon</th>
                        {MONTH_LABELS.map((m) => (
                          <th key={m} className="px-1 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">
                            {m}
                          </th>
                        ))}
                        <th className="px-2 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Yıllık</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unitWages.map((w) => {
                        const bud        = ensureArray(w.monthly_budget);
                        const act        = ensureArray(w.monthly_actual);
                        const budAnnual  = bud.reduce((a, b) => a + b, 0);
                        const actAnnual  = act.reduce((a, b) => a + b, 0);
                        const hasActual  = act.some((v) => v !== 0);
                        return (
                          <React.Fragment key={w.param_code}>
                            {/* bütçe row */}
                            <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                              <td className="px-2 py-1 text-gray-700 dark:text-gray-300 font-medium truncate">{w.label}</td>
                              {bud.map((v, mi) => (
                                <td key={mi} className="px-1 py-1 text-right font-mono text-gray-600 dark:text-gray-400">
                                  {v === 0 ? '—' : fmtM(v)}
                                </td>
                              ))}
                              <td className="px-2 py-1 text-right font-mono font-semibold text-gray-700 dark:text-gray-300">
                                {budAnnual === 0 ? '—' : fmtM(budAnnual)}
                              </td>
                            </tr>
                            {/* fiili row — amber, only if any actual */}
                            {hasActual && (
                              <tr className="bg-amber-50/20 dark:bg-amber-900/10 hover:bg-amber-50/40 dark:hover:bg-amber-900/20 transition-colors">
                                <td className="px-2 py-1 pl-5 text-amber-600 dark:text-amber-400 italic text-[10px]">fiili</td>
                                {act.map((v, mi) => (
                                  <td key={mi} className="px-1 py-1 text-right font-mono text-amber-600 dark:text-amber-400">
                                    {v === 0 ? '—' : fmtM(v)}
                                  </td>
                                ))}
                                <td className="px-2 py-1 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                                  {actAnnual === 0 ? '—' : fmtM(actAnnual)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Kişi Sayısı — 12 ay kolonlu, accordion ─────────────────── */}
              <div>
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Kişi Sayısı Parametreleri
                </p>
                <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                  <table className="min-w-[1000px] text-xs table-fixed">
                    <colgroup>
                      <col style={{ width: 180 }} />
                      {MONTH_LABELS.map((m) => <col key={m} style={{ width: 52 }} />)}
                      <col style={{ width: 72 }} />
                    </colgroup>
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Kalem</th>
                        {MONTH_LABELS.map((m) => (
                          <th key={m} className="px-1 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">
                            {m}
                          </th>
                        ))}
                        <th className="px-2 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Yıllık</th>
                      </tr>
                    </thead>
                    <tbody>
                      {HC_GROUPS.map((grp) => {
                        const parentItem  = grp.parentCode ? paramByCode.get(grp.parentCode) : null;
                        const bud         = ensureArray(parentItem?.monthly_budget);
                        const act         = ensureArray(parentItem?.monthly_actual);
                        const budAnnual   = bud.reduce((a, b) => a + b, 0);
                        const actAnnual   = act.reduce((a, b) => a + b, 0);
                        const hasActual   = act.some((v) => v !== 0);
                        const childItems  = grp.childPrefix
                          ? Array.from(paramByCode.values()).filter(
                              (i) => i.param_code?.startsWith(grp.childPrefix!) && i.param_code !== grp.parentCode
                            )
                          : [];
                        const hasChildren = childItems.length > 0;
                        const isOpen      = openParamDepts.has(grp.id);
                        const isToplam    = grp.id === 'toplam';
                        const fmtK        = (v: number) => v === 0 ? '—' : v.toLocaleString('tr-TR');

                        const toggleGrp = hasChildren
                          ? () => setOpenParamDepts((prev) => {
                              const next = new Set(prev);
                              if (next.has(grp.id)) next.delete(grp.id); else next.add(grp.id);
                              return next;
                            })
                          : undefined;

                        return (
                          <React.Fragment key={grp.id}>
                            {/* dept başlık / bütçe satırı — accordion header */}
                            <tr
                              className={`border-t-2 border-gray-200 dark:border-gray-700 transition-colors ${
                                isToplam
                                  ? 'bg-gray-100 dark:bg-gray-800/80'
                                  : 'bg-gray-50/70 dark:bg-gray-800/40'
                              } ${hasChildren ? 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800/70' : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'}`}
                              onClick={toggleGrp}
                            >
                              <td className={`px-2 py-1.5 ${isToplam ? 'font-bold text-gray-800 dark:text-gray-100' : 'font-semibold text-gray-700 dark:text-gray-200'}`}>
                                <div className="flex items-center justify-between gap-1">
                                  <span>{grp.label}</span>
                                  {hasChildren && (
                                    <span className="text-gray-400 dark:text-gray-500 text-[10px] flex-shrink-0">
                                      {isOpen ? '▼' : '▶'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {bud.map((v, mi) => (
                                <td key={mi} className={`px-1 py-1.5 text-right font-mono ${isToplam ? 'font-semibold text-gray-700 dark:text-gray-200' : 'text-gray-600 dark:text-gray-400'}`}>
                                  {fmtK(v)}
                                </td>
                              ))}
                              <td className={`px-2 py-1.5 text-right font-mono font-semibold ${isToplam ? 'text-gray-800 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                                {fmtK(budAnnual)}
                              </td>
                            </tr>
                            {/* fiili satırı — amber */}
                            {hasActual && (
                              <tr className="bg-amber-50/20 dark:bg-amber-900/10 hover:bg-amber-50/40 dark:hover:bg-amber-900/20 transition-colors">
                                <td className="px-2 py-1 pl-5 text-amber-600 dark:text-amber-400 italic text-[10px]">fiili</td>
                                {act.map((v, mi) => (
                                  <td key={mi} className="px-1 py-1 text-right font-mono text-amber-600 dark:text-amber-400">
                                    {v === 0 ? '—' : v.toLocaleString('tr-TR')}
                                  </td>
                                ))}
                                <td className="px-2 py-1 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                                  {actAnnual === 0 ? '—' : actAnnual.toLocaleString('tr-TR')}
                                </td>
                              </tr>
                            )}
                            {/* child param satırları — accordion açıkken göster */}
                            {hasChildren && isOpen && childItems.map((ci) => {
                              const ciBud       = ensureArray(ci.monthly_budget);
                              const ciAct       = ensureArray(ci.monthly_actual);
                              const ciBudAnnual = ciBud.reduce((a, b) => a + b, 0);
                              const ciActAnnual = ciAct.reduce((a, b) => a + b, 0);
                              const ciHasActual = ciAct.some((v) => v !== 0);
                              return (
                                <React.Fragment key={ci.param_code}>
                                  <tr className="bg-white dark:bg-gray-900/60 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                    <td className="px-2 py-1 pl-5 text-gray-600 dark:text-gray-400 text-[11px] truncate">
                                      <span className="text-gray-300 dark:text-gray-600 mr-1 select-none">└</span>
                                      {ci.label}
                                    </td>
                                    {ciBud.map((v, mi) => (
                                      <td key={mi} className="px-1 py-1 text-right font-mono text-gray-500 dark:text-gray-500 text-[11px]">
                                        {v === 0 ? '—' : v.toLocaleString('tr-TR')}
                                      </td>
                                    ))}
                                    <td className="px-2 py-1 text-right font-mono text-gray-600 dark:text-gray-400 text-[11px]">
                                      {ciBudAnnual === 0 ? '—' : ciBudAnnual.toLocaleString('tr-TR')}
                                    </td>
                                  </tr>
                                  {ciHasActual && (
                                    <tr className="bg-amber-50/10 dark:bg-amber-900/5">
                                      <td className="px-2 py-1 pl-9 text-amber-500 dark:text-amber-500 italic text-[10px]">fiili</td>
                                      {ciAct.map((v, mi) => (
                                        <td key={mi} className="px-1 py-1 text-right font-mono text-amber-500 dark:text-amber-500 text-[11px]">
                                          {v === 0 ? '—' : v.toLocaleString('tr-TR')}
                                        </td>
                                      ))}
                                      <td className="px-2 py-1 text-right font-mono text-amber-500 dark:text-amber-500 text-[11px]">
                                        {ciActAnnual === 0 ? '—' : ciActAnnual.toLocaleString('tr-TR')}
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
