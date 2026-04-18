'use client';

import React, { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
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

export default function ServisDetailPanel({ dark, lineItems }: Props) {
  const axisColor     = dark ? '#9ca3af' : '#6b7280';
  const gridColor     = dark ? '#374151' : '#e5e7eb';
  const tooltipBg     = dark ? '#1f2937' : '#ffffff';
  const tooltipBorder = dark ? '#374151' : '#e5e7eb';

  const [openDepts, setOpenDepts] = useState<Set<string>>(new Set());
  const [paramOpen, setParamOpen] = useState(false);

  // ── derive data from lineItems ──────────────────────────────────────────────

  const totalItem = useMemo(
    () => lineItems.find((i) => i.category_code === 'servis' && i.row_type === 'total') ?? null,
    [lineItems]
  );

  function ensureArray(v: number[] | string | undefined | null): number[] {
    if (!v) return Array(12).fill(0);
    if (typeof v === 'string') {
      try { return JSON.parse(v) as number[]; } catch { return Array(12).fill(0); }
    }
    return v;
  }

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

  // Helper: param monthly value for a given month index
  function paramVal(code: string, idx: number, kind: 'budget' | 'actual'): number {
    const item = paramByCode.get(code);
    if (!item) return 0;
    const arr = ensureArray(kind === 'budget' ? item.monthly_budget : item.monthly_actual);
    return arr[idx] ?? 0;
  }

  if (lineItems.length === 0) {
    return (
      <div className="mt-4 p-4 text-sm text-gray-400 dark:text-gray-500 text-center">
        Servis verileri yükleniyor...
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">

      {/* ── KPI kartları ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Bütçe Yıllık', value: fmtM(annualBudget), sub: `YTD ${fmtM(ytdBudget)}`,   cls: 'text-gray-900 dark:text-white',                                                               border: 'border-gray-200 dark:border-gray-700' },
          { label: 'Fiili YTD',    value: fmtM(ytdActual),    sub: `Oca–${activeLabel} 2025`,   cls: 'text-purple-600 dark:text-purple-400',                                                        border: 'border-purple-200 dark:border-purple-800' },
          { label: 'Sapma (TL)',   value: `${sapmaTL >= 0 ? '+' : ''}${fmtM(sapmaTL)}`,         sub: sapmaTL > 0 ? 'Aşım' : 'Tasarruf', cls: sapmaTL > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400', border: sapmaTL > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800' },
          { label: 'Sapma (%)',    value: `${sapmaPct >= 0 ? '+' : ''}${sapmaPct.toFixed(1)}%`, sub: 'YTD bütçeye göre',                 cls: sapmaPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400', border: sapmaPct > 0 ? 'border-red-200 dark:border-red-800' : 'border-green-200 dark:border-green-800' },
        ].map(({ label, value, sub, cls, border }) => (
          <div key={label} className={`bg-white dark:bg-gray-900 rounded-lg border ${border} px-3 py-2.5 shadow-sm`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
            <p className={`text-sm font-bold mt-0.5 font-mono ${cls}`}>{value}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Grafikler ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">
            Aylık Bütçe vs Fiili — Servis 2025
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartMonthly} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
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
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
            Departman Dağılımı — Yıllık Bütçe
          </p>
          <div className="flex items-center gap-2">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
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
            </ResponsiveContainer>
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
                <span className="text-gray-400 dark:text-gray-500 text-[10px] flex-shrink-0" style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: deptColor }} />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex-1 text-left">{dept.label}</span>
                <div className="hidden sm:flex items-center gap-4 text-[10px]">
                  <span className="text-gray-400 dark:text-gray-500">Yıllık Bütçe: <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">{fmtM(deptAnnual)}</span></span>
                  <span className="text-gray-400 dark:text-gray-500">YTD Bütçe: <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">{fmtM(deptBudYTD)}</span></span>
                  <span className="text-gray-400 dark:text-gray-500">YTD Fiili: <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">{fmtM(deptActYTD)}</span></span>
                  <span className={`font-mono font-semibold ${deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{deptSapPct >= 0 ? '+' : ''}{deptSapPct.toFixed(1)}%</span>
                </div>
                <span className={`sm:hidden text-[10px] font-mono font-semibold ${deptSapPct > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{deptSapPct >= 0 ? '+' : ''}{deptSapPct.toFixed(1)}%</span>
              </button>

              <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
                <div className="overflow-hidden">
                  <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-3">

                    {/* Kilyos endeks note */}
                    {deptCode === 'kilyos' && (
                      <div className="px-2 py-2 bg-amber-50/60 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800">
                        <p className="text-[10px] text-amber-700 dark:text-amber-400">
                          Endeks bağlı — tek satır
                        </p>
                      </div>
                    )}

                    {/* Operasyon note */}
                    {deptCode === 'operasyon' && (
                      <div className="px-2 py-2 bg-blue-50/60 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                        <p className="text-[10px] text-blue-700 dark:text-blue-400">
                          ~340 güzergah satırı (dinamik) — bireysel güzergah detayı bir sonraki iterasyonda eklenecek.
                        </p>
                      </div>
                    )}

                    {/* GYG note */}
                    {deptCode === 'gyg' && (
                      <div className="px-2 py-2 bg-blue-50/60 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                        <p className="text-[10px] text-blue-700 dark:text-blue-400">
                          GYG güzergahları bir sonraki iterasyonda eklenecek.
                        </p>
                      </div>
                    )}

                    {/* Monthly table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-gray-400 dark:text-gray-500">
                            <th className="text-left pb-1 pr-2 font-medium w-8">Ay</th>
                            <th className="text-right pb-1 pr-2 font-medium">Bütçe</th>
                            <th className="text-right pb-1 font-medium">Fiili</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MONTH_LABELS.map((lbl, mi) => {
                            const bv = mb[mi] ?? 0;
                            const av = ma[mi] ?? 0;
                            const active = mi === activeMonth;
                            return (
                              <tr key={lbl} className={active ? 'bg-purple-50/60 dark:bg-purple-950/20 font-semibold' : ''}>
                                <td className="py-0.5 pr-2 text-gray-500 dark:text-gray-400">{lbl}</td>
                                <td className="py-0.5 pr-2 text-right font-mono text-gray-600 dark:text-gray-300">{fmtM(bv)}</td>
                                <td className={`py-0.5 text-right font-mono ${av > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-gray-300 dark:text-gray-600'}`}>{av > 0 ? fmtM(av) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t border-gray-200 dark:border-gray-700">
                          <tr className="font-semibold text-gray-700 dark:text-gray-200">
                            <td className="pt-1 pr-2">Toplam</td>
                            <td className="pt-1 pr-2 text-right font-mono">{fmtM(deptAnnual)}</td>
                            <td className="pt-1 text-right font-mono text-purple-600 dark:text-purple-400">{fmtM(deptActYTD)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
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
          <span className="text-gray-400 dark:text-gray-500 text-[10px]" style={{ display: 'inline-block', transform: paramOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Parametre Detayı</p>
        </button>

        <div style={{ display: 'grid', gridTemplateRows: paramOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
          <div className="overflow-hidden">
            <div className="p-3 space-y-4">

              {/* KPI cards for each param */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { code: 'birim_fiyat_ort',  label: 'Birim Fiyat Ort.',       unit: '₺/ay' },
                  { code: 'yakit_barem',       label: 'Yakıt Artış Baremi',     unit: '₺'    },
                  { code: 'asgari_ucret_fark', label: 'Asgari Ücret Farkı',     unit: '₺'    },
                  { code: 'kira_sayisi',       label: 'Kiralık Araç Sayısı',    unit: 'Adet' },
                ].map(({ code, label, unit }) => {
                  const item = paramByCode.get(code);
                  const arr  = ensureArray(item?.monthly_budget);
                  const val  = arr[activeMonth] ?? 0;
                  return (
                    <div key={code} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{label}</p>
                      <p className="text-sm font-bold mt-0.5 font-mono text-purple-600 dark:text-purple-400">
                        {val === 0 ? '—' : (unit === 'Adet' ? val.toLocaleString('tr-TR') : fmtFull(val))}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{unit} · {MONTH_LABELS[activeMonth]} bütçe</p>
                    </div>
                  );
                })}
              </div>

              {/* Monthly param table */}
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left pb-1.5 pr-2 font-medium">Ay</th>
                      <th className="text-right pb-1.5 pr-2 font-medium">Birim Fiyat Ort.</th>
                      <th className="text-right pb-1.5 pr-2 font-medium">Yakıt Baremi</th>
                      <th className="text-right pb-1.5 pr-2 font-medium">Asg. Ücret Farkı</th>
                      <th className="text-right pb-1.5 font-medium">Araç Sayısı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTH_LABELS.map((lbl, mi) => {
                      const active = mi === activeMonth;
                      const bf  = paramVal('birim_fiyat_ort',  mi, 'budget');
                      const yb  = paramVal('yakit_barem',       mi, 'budget');
                      const au  = paramVal('asgari_ucret_fark', mi, 'budget');
                      const ks  = paramVal('kira_sayisi',       mi, 'budget');
                      return (
                        <tr key={lbl} className={active ? 'bg-purple-50/60 dark:bg-purple-950/20 font-semibold' : 'border-b border-gray-50 dark:border-gray-800'}>
                          <td className="py-0.5 pr-2 text-gray-500 dark:text-gray-400">{lbl}</td>
                          <td className="py-0.5 pr-2 text-right font-mono text-gray-700 dark:text-gray-300">{bf > 0 ? fmtFull(bf) : '—'}</td>
                          <td className="py-0.5 pr-2 text-right font-mono text-gray-700 dark:text-gray-300">{yb > 0 ? fmtFull(yb) : '—'}</td>
                          <td className="py-0.5 pr-2 text-right font-mono text-gray-700 dark:text-gray-300">{au > 0 ? fmtFull(au) : '—'}</td>
                          <td className="py-0.5 text-right font-mono text-gray-700 dark:text-gray-300">{ks > 0 ? ks.toLocaleString('tr-TR') : '—'}</td>
                        </tr>
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
  );
}
