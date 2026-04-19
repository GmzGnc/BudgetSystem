'use client';

import React, { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import ChartWrapper from '@/components/ChartWrapper';
import type { LineItem } from './GuvenlikDetailPanel';

interface Props {
  dark: boolean;
  lineItems: LineItem[];
}

const MONTH_LABELS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DEPT_COLORS  = ['#8b5cf6', '#6366f1', '#f59e0b'];

function fmtM(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₺${(n / 1_000).toFixed(0)}B`;
  return `₺${n.toLocaleString('tr-TR')}`;
}
function fmtFull(n: number): string {
  return `₺${n.toLocaleString('tr-TR')}`;
}
// Smart ratio formatter: Excel can store percent params as decimal (0.075) or integer (7.5).
// If value < 1 → treat as decimal fraction (0.075 → 7.5%).
// If value >= 1 → treat as already in percent units (7.5 → 7.5%).
function fmtRatio(n: number): string {
  if (n === 0) return '—';
  return n < 1 ? `${(n * 100).toFixed(1)}%` : `${n.toFixed(1)}%`;
}

// Static route reference data (birim fiyatlar, Excel rows 247-293)
// Sorted descending by annualBudget
const ROUTES_SORTED = [
  { name: "Tuzla (Aydınlı)",                           monthlyBudget: 6250,  annualBudget: 80401 },
  { name: "Beylikdüzü",                                monthlyBudget: 6250,  annualBudget: 80401 },
  { name: "Bostancı",                                  monthlyBudget: 6123,  annualBudget: 78760 },
  { name: "Pendik",                                    monthlyBudget: 6186,  annualBudget: 79580 },
  { name: "Avcılar",                                   monthlyBudget: 6180,  annualBudget: 79498 },
  { name: "Bakırköy-Küçükçekmece",                    monthlyBudget: 6139,  annualBudget: 78970 },
  { name: "Bağcılar",                                  monthlyBudget: 6158,  annualBudget: 79211 },
  { name: "Kadıköy",                                   monthlyBudget: 6116,  annualBudget: 78678 },
  { name: "Kartal",                                    monthlyBudget: 6116,  annualBudget: 78678 },
  { name: "Üsküdar",                                   monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "Bayrampaşa",                                monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "Yeşilpınar-Göktürk",                       monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "Sultangazi",                                monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "Ataşehir",                                  monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "Çıksalın-Nurtepe",                         monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "Maltepe",                                   monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "Yenibosna",                                 monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "Kasımpaşa",                                 monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "Esenler",                                   monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "CCN Haftasonu Mesai-Sultangazi",            monthlyBudget: 6046,  annualBudget: 77775 },
  { name: "CCN Haftasonu Mesai-Sultangazi (Bayrampaşa)", monthlyBudget: 6046, annualBudget: 77775 },
  { name: "Başakşehir-Bahçeşehir",                    monthlyBudget: 6005,  annualBudget: 77242 },
  { name: "Kağıthane",                                 monthlyBudget: 5715,  annualBudget: 73509 },
  { name: "İstinye-Sarıyer",                          monthlyBudget: 5715,  annualBudget: 73509 },
  { name: "Beşiktaş",                                  monthlyBudget: 5715,  annualBudget: 73509 },
  { name: "Ayazağa",                                   monthlyBudget: 5652,  annualBudget: 72688 },
  { name: "Taşdelen",                                  monthlyBudget: 5919,  annualBudget: 76134 },
  { name: "Arnavutköy",                                monthlyBudget: 5919,  annualBudget: 76134 },
  { name: "Yenidoğan",                                 monthlyBudget: 5919,  annualBudget: 76134 },
  { name: "Arnavutköy Haraççı",                       monthlyBudget: 5919,  annualBudget: 76134 },
  { name: "Çekmeköy (Ümraniye)",                      monthlyBudget: 5919,  annualBudget: 76134 },
  { name: "Sultanbeyli",                               monthlyBudget: 5919,  annualBudget: 76134 },
  { name: "Beykoz",                                    monthlyBudget: 5919,  annualBudget: 76134 },
  { name: "Bahçeköy",                                  monthlyBudget: 5582,  annualBudget: 71786 },
  { name: "Maden-Rumeli Feneri",                       monthlyBudget: 5525,  annualBudget: 71047 },
  { name: "Odayeri-Garipçe-1 (Ring)",                  monthlyBudget: 1053,  annualBudget: 13366 },
  { name: "Odayeri-Garipçe-2 (Ring)",                  monthlyBudget: 1053,  annualBudget: 13366 },
  { name: "Hüseynili-Garipçe-1 (Ring)",               monthlyBudget: 977,   annualBudget: 12382 },
  { name: "Hüseynili-Garipçe-2 (Ring)",               monthlyBudget: 977,   annualBudget: 12382 },
  { name: "Hacıosman Metro-Garipçe-1",                monthlyBudget: 882,   annualBudget: 11151 },
  { name: "Hacıosman Metro-Garipçe-2",                monthlyBudget: 882,   annualBudget: 11151 },
].sort((a, b) => b.annualBudget - a.annualBudget);

export default function ServisDetailPanel({ dark, lineItems }: Props) {
  const axisColor     = dark ? '#9ca3af' : '#6b7280';
  const gridColor     = dark ? '#374151' : '#e5e7eb';
  const tooltipBg     = dark ? '#1f2937' : '#ffffff';
  const tooltipBorder = dark ? '#374151' : '#e5e7eb';

  const [openDepts,  setOpenDepts]  = useState<Set<string>>(new Set());
  const [paramOpen,  setParamOpen]  = useState(false);
  const [paramTab,   setParamTab]   = useState<'endeks' | 'arac' | 'rotalar'>('endeks');

  // ── helpers ────────────────────────────────────────────────────────────────

  function ensureArray(v: number[] | string | undefined | null): number[] {
    if (!v) return Array(12).fill(0);
    if (typeof v === 'string') {
      try { return JSON.parse(v) as number[]; } catch { return Array(12).fill(0); }
    }
    return v;
  }

  // ── derive data from lineItems ─────────────────────────────────────────────

  const totalItem = useMemo(
    () => lineItems.find((i) => i.category_code === 'servis' && i.row_type === 'total') ?? null,
    [lineItems]
  );

  const monthlyBudget: number[] = ensureArray(totalItem?.monthly_budget);
  const monthlyActual: number[] = ensureArray(totalItem?.monthly_actual);

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
  const activeLabel  = MONTH_LABELS[activeMonth] ?? '';

  const depts = useMemo(
    () => lineItems.filter((i) => i.category_code === 'servis' && i.row_type === 'dept'),
    [lineItems]
  );

  const paramByCode = useMemo(() => {
    const m = new Map<string, LineItem>();
    lineItems
      .filter((i) => i.category_code === 'servis' && i.row_type === 'param')
      .forEach((i) => { if (i.param_code) m.set(i.param_code, i); });
    return m;
  }, [lineItems]);

  function paramArr(code: string, kind: 'budget' | 'actual'): number[] {
    const item = paramByCode.get(code);
    if (!item) return Array(12).fill(0);
    return ensureArray(kind === 'budget' ? item.monthly_budget : item.monthly_actual);
  }

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
        Servis verileri yükleniyor...
      </div>
    );
  }

  // param arrays
  const birimFiyatArr      = paramArr('birim_fiyat_ort',    'budget');
  const tufeKumulatifArr   = paramArr('tufe_ufe_kumulatif', 'budget');
  const tufeUygulamaArr    = paramArr('tufe_ufe_uygulama',  'budget');
  const yakitUygulamaArr   = paramArr('yakit_uygulama',     'budget');
  const asgariUcretArr     = paramArr('asgari_ucret_fark',  'budget');
  const aracSayisiBudArr   = paramArr('arac_sayisi',        'budget');
  const aracSayisiActArr   = paramArr('arac_sayisi',        'actual');

  // Scalar summaries (take first non-zero value — these params are effectively constants)
  const tufeKumulatif = tufeKumulatifArr.find(v => v !== 0) ?? 0;
  const tufeUygulama  = tufeUygulamaArr.find(v => v !== 0)  ?? 0;
  const yakitUygulama = yakitUygulamaArr.find(v => v !== 0) ?? 0;
  const asgariUcret   = asgariUcretArr.find(v => v !== 0)   ?? 0;

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
            cls: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800',
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
        ].map(({ label, value, sub, cls, border }) => (
          <div key={label} className={`bg-white dark:bg-gray-900 rounded-lg border ${border} px-3 py-2.5 shadow-sm`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
            <p className={`text-sm font-bold mt-0.5 font-mono ${cls}`}>{value}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Formula note ─────────────────────────────────────────────────── */}
      <div className="px-3 py-2 bg-purple-50/60 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
        <p className="text-[10px] text-purple-700 dark:text-purple-400 font-mono">
          Formül: Aylık Maliyet = Araç Sayısı × Birim Fiyat × (1 + TÜFE/ÜFE farkı + Yakıt farkı)
        </p>
      </div>

      {/* ── Grafikler ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">
            Aylık Bütçe vs Fiili — Servis 2025
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
                <Bar dataKey="Fiili" fill="#8b5cf6" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line type="monotone" dataKey="Bütçe" stroke="#a78bfa" strokeWidth={2} dot={{ r: 2.5, fill: '#a78bfa' }} activeDot={{ r: 4 }} />
              </ComposedChart>
            )}
          </ChartWrapper>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
            Departman Dağılımı — Yıllık Bütçe
          </p>
          <div className="flex items-center gap-2">
            <PieChart width={140} height={140}>
              <Pie
                data={depts.map((d) => ({ name: d.label, value: ensureArray(d.monthly_budget).reduce((a, b) => a + b, 0) }))}
                dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={2}
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
                const da    = ensureArray(d.monthly_budget).reduce((a, b) => a + b, 0);
                const share = annualBudget > 0 ? (da / annualBudget) * 100 : 0;
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

      {/* ── Departman accordion ──────────────────────────────────────────── */}
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
                  <span className="text-gray-400 dark:text-gray-500">YTD Bütçe: <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">{fmtM(deptBudYTD)}</span></span>
                  <span className="text-gray-400 dark:text-gray-500">YTD Fiili: <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">{fmtM(deptActYTD)}</span></span>
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

                    {deptCode === 'kilyos' && (
                      <div className="px-2 py-2 bg-amber-50/60 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800">
                        <p className="text-[10px] text-amber-700 dark:text-amber-400">
                          Endeks bağlı — tek satır
                        </p>
                      </div>
                    )}

                    {/* dept KPI strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Bütçe (Yıllık)', value: fmtM(deptAnnual),                                                           cls: 'text-gray-900 dark:text-white',                                                               border: 'border-gray-200 dark:border-gray-700' },
                        { label: 'Fiili YTD',       value: fmtM(deptActYTD),                                                          cls: 'text-purple-600 dark:text-purple-400',                                                        border: 'border-purple-200 dark:border-purple-800' },
                        { label: 'Sapma (TL)',       value: `${deptSapma >= 0 ? '+' : ''}${fmtM(deptSapma)}`,                         cls: deptSapma > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',      border: deptSapma > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800' },
                        { label: 'Sapma (%)',        value: `${deptSapPct >= 0 ? '+' : ''}${deptSapPct.toFixed(1)}%`,                 cls: deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',     border: deptSapPct > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800' },
                      ].map(({ label, value, cls, border }) => (
                        <div key={label} className={`bg-white dark:bg-gray-900 rounded border ${border} px-2.5 py-2`}>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
                          <p className={`text-xs font-bold mt-0.5 font-mono ${cls}`}>{value}</p>
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
                            <tr key={lbl} className={active ? 'bg-purple-50/60 dark:bg-purple-950/20 font-semibold' : 'border-b border-gray-50 dark:border-gray-800'}>
                              <td className="py-0.5 text-gray-500 dark:text-gray-400">{lbl}</td>
                              <td className="py-0.5 text-right font-mono text-gray-600 dark:text-gray-300">{fmtM(bv)}</td>
                              <td className={`py-0.5 text-right font-mono ${av > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-gray-300 dark:text-gray-600'}`}>
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
                          <td className="pt-1 text-right font-mono text-purple-600 dark:text-purple-400">{fmtM(deptActYTD)}</td>
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

      {/* ── Parametre paneli ─────────────────────────────────────────────── */}
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
            <div className="p-3 space-y-4">

              {/* Tab switcher */}
              <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
                {([
                  { id: 'endeks',  label: 'Birim Fiyat & Endeks' },
                  { id: 'arac',    label: 'Araç Sayısı'           },
                  { id: 'rotalar', label: 'Rotalar (41)'          },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setParamTab(id)}
                    className={`px-3 py-1.5 text-[10px] font-medium border-b-2 transition-colors ${
                      paramTab === id
                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Section 1: Birim Fiyat & Endeks ── */}
              {paramTab === 'endeks' && (
                <div className="space-y-3">

                  {/* Parametre Özeti — scalar constants */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'TÜFE+ÜFE Kümülatif', value: fmtRatio(tufeKumulatif), sub: 'Oca 2025 gerçekleşme'     },
                      { label: 'TÜFE+ÜFE Uygulama',  value: fmtRatio(tufeUygulama),  sub: 'Birim fiyatın bu kısmına' },
                      { label: 'Yakıt Uygulama',      value: fmtRatio(yakitUygulama), sub: 'Aşım — taşıma bed. 1/3'  },
                      { label: 'Asgari Ücret Farkı',  value: asgariUcret > 0 ? fmtFull(asgariUcret) : '—', sub: '₺/araç · Oca 2025' },
                    ].map(({ label, value, sub }) => (
                      <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{label}</p>
                        <p className="text-xs font-bold mt-0.5 font-mono text-purple-600 dark:text-purple-400">{value}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Birim Fiyat — 12 ay kolonlu */}
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Birim Fiyat (₺/araç/ay)
                  </p>
                  {(() => {
                    const bfAct     = paramArr('birim_fiyat_ort', 'actual');
                    const budAnnual = birimFiyatArr.reduce((a, b) => a + b, 0);
                    const actAnnual = bfAct.reduce((a, b) => a + b, 0);
                    const hasActual = bfAct.some((v) => v !== 0);
                    return (
                      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                        <table className="min-w-[1000px] text-xs table-fixed">
                          <colgroup>
                            <col style={{ width: 120 }} />
                            {MONTH_LABELS.map((m) => <col key={m} style={{ width: 52 }} />)}
                            <col style={{ width: 72 }} />
                          </colgroup>
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Kalem</th>
                              {MONTH_LABELS.map((m) => (
                                <th key={m} className="px-1 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">{m}</th>
                              ))}
                              <th className="px-2 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Yıllık</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="bg-gray-50/30 dark:bg-gray-800/20 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                              <td className="px-2 py-1 text-gray-700 dark:text-gray-300 font-medium">Bütçe</td>
                              {birimFiyatArr.map((v, mi) => (
                                <td key={mi} className={`px-1 py-1 text-right font-mono ${mi === activeMonth ? 'text-purple-600 dark:text-purple-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                                  {v === 0 ? '—' : fmtFull(v)}
                                </td>
                              ))}
                              <td className="px-2 py-1 text-right font-mono font-semibold text-gray-700 dark:text-gray-300">{budAnnual === 0 ? '—' : fmtFull(budAnnual)}</td>
                            </tr>
                            {hasActual && (
                              <tr className="bg-amber-50/20 dark:bg-amber-900/10 hover:bg-amber-50/40 dark:hover:bg-amber-900/20 transition-colors">
                                <td className="px-2 py-1 pl-4 text-amber-600 dark:text-amber-400 italic text-[10px]">fiili</td>
                                {bfAct.map((v, mi) => (
                                  <td key={mi} className="px-1 py-1 text-right font-mono text-amber-600 dark:text-amber-400">{v === 0 ? '—' : fmtFull(v)}</td>
                                ))}
                                <td className="px-2 py-1 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">{actAnnual === 0 ? '—' : fmtFull(actAnnual)}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── Section 2: Araç Sayısı — 12 ay kolonlu ── */}
              {paramTab === 'arac' && (() => {
                const budAnnual = aracSayisiBudArr.reduce((a, b) => a + b, 0);
                const actAnnual = aracSayisiActArr.reduce((a, b) => a + b, 0);
                const hasActual = aracSayisiActArr.some((v) => v !== 0);
                return (
                  <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                    <table className="min-w-[1000px] text-xs table-fixed">
                      <colgroup>
                        <col style={{ width: 120 }} />
                        {MONTH_LABELS.map((m) => <col key={m} style={{ width: 52 }} />)}
                        <col style={{ width: 72 }} />
                      </colgroup>
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Kalem</th>
                          {MONTH_LABELS.map((m) => (
                            <th key={m} className="px-1 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">{m}</th>
                          ))}
                          <th className="px-2 py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Yıllık</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-gray-50/30 dark:bg-gray-800/20 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="px-2 py-1 text-gray-700 dark:text-gray-300 font-medium">Bütçe Araç</td>
                          {aracSayisiBudArr.map((v, mi) => (
                            <td key={mi} className={`px-1 py-1 text-right font-mono ${mi === activeMonth ? 'text-purple-600 dark:text-purple-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                              {v === 0 ? '—' : v.toLocaleString('tr-TR')}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-right font-mono font-semibold text-gray-700 dark:text-gray-300">{budAnnual === 0 ? '—' : budAnnual.toLocaleString('tr-TR')}</td>
                        </tr>
                        {hasActual && (
                          <tr className="bg-amber-50/20 dark:bg-amber-900/10 hover:bg-amber-50/40 dark:hover:bg-amber-900/20 transition-colors">
                            <td className="px-2 py-1 pl-5 text-amber-600 dark:text-amber-400 italic text-[10px]">fiili</td>
                            {aracSayisiActArr.map((v, mi) => (
                              <td key={mi} className="px-1 py-1 text-right font-mono text-amber-600 dark:text-amber-400">{v === 0 ? '—' : v.toLocaleString('tr-TR')}</td>
                            ))}
                            <td className="px-2 py-1 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">{actAnnual === 0 ? '—' : actAnnual.toLocaleString('tr-TR')}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* ── Section 3: Rotalar ── */}
              {paramTab === 'rotalar' && (
                <div className="space-y-2">
                  <div className="px-2 py-1.5 bg-purple-50/60 dark:bg-purple-950/20 rounded border border-purple-200 dark:border-purple-800">
                    <p className="text-[10px] text-purple-700 dark:text-purple-400">
                      Bu rakamlar birim fiyatlardır. Toplam maliyet = birim fiyat × gün sayısı × kişi katsayısı
                    </p>
                  </div>
                  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    <table className="text-[10px]" style={{ width: '100%', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: 40 }} />
                        <col style={{ width: '50%' }} />
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '25%' }} />
                      </colgroup>
                      <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                        <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                          <th style={{ padding: '8px 12px', textAlign: 'left' }} className="font-medium">#</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }} className="font-medium">Rota Adı</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }} className="font-medium">Birim Fiyat (TL/ay)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }} className="font-medium">Yıllık Bütçe (TL)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ROUTES_SORTED.map((r, idx) => (
                          <tr key={r.name} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
                            <td style={{ padding: '6px 12px' }} className="text-gray-400 dark:text-gray-600">{idx + 1}</td>
                            <td style={{ padding: '6px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="text-gray-700 dark:text-gray-300">{r.name}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right' }} className="font-mono text-gray-600 dark:text-gray-400">{r.monthlyBudget.toLocaleString('tr-TR')}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right' }} className="font-mono text-purple-600 dark:text-purple-400">{r.annualBudget.toLocaleString('tr-TR')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                        <tr className="font-semibold text-gray-700 dark:text-gray-200">
                          <td style={{ padding: '8px 12px' }} className="text-gray-400 dark:text-gray-500" colSpan={2}>41 rota</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }} className="font-mono text-gray-600 dark:text-gray-300">
                            {ROUTES_SORTED.reduce((s, r) => s + r.monthlyBudget, 0).toLocaleString('tr-TR')}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }} className="font-mono text-purple-600 dark:text-purple-400">
                            {ROUTES_SORTED.reduce((s, r) => s + r.annualBudget, 0).toLocaleString('tr-TR')} TL/yıl
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
