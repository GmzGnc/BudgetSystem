'use client';

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

import { CATEGORIES, CATEGORY_COLORS, INDEX_BADGE_COLORS } from '@/data/categories';
import { ICA_BUDGET, ICE_BUDGET, GROUP_MONTHLY } from '@/data/budget-data';
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

function pctColor(pct: number): string {
  return pct > 0 ? 'text-red-600' : 'text-green-600';
}

// ─── default coefficients (per index type) ──────────────────────────────────

// Her kategori için varsayılan katsayı = 1 + (endeks oranı / 100)
const DEFAULT_COEFFICIENTS: ProjectionCoefficients = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, parseFloat((1 + c.rate / 100).toFixed(3))]),
);

// ─── custom tooltip ──────────────────────────────────────────────────────────

function CustomBarTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm min-w-48">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium">{fmt(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-semibold">
        <span>Toplam</span>
        <span>{fmt(total)}</span>
      </div>
    </div>
  );
}

function CustomLineTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm min-w-40">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [company, setCompany] = useState<Company>('ICA');
  const [tab, setTab] = useState<'overview' | 'projection'>('overview');
  const [coefficients, setCoefficients] = useState<ProjectionCoefficients>(DEFAULT_COEFFICIENTS);

  const monthlyData: MonthlyEntry[] = useMemo(() => {
    if (company === 'ICA')  return ICA_BUDGET.monthlyData;
    if (company === 'ICE')  return ICE_BUDGET.monthlyData;
    return GROUP_MONTHLY;
  }, [company]);

  const projection2026 = useMemo(
    () => buildProjection2026(monthlyData, coefficients),
    [monthlyData, coefficients],
  );

  const total2025   = useMemo(() => totalAnnual(monthlyData), [monthlyData]);
  const total2026   = useMemo(() => totalAnnual(projection2026), [projection2026]);
  const avgMonthly  = useMemo(() => monthlyAverage(monthlyData), [monthlyData]);
  const diffPct     = useMemo(() => variancePct(total2025, total2026), [total2025, total2026]);

  // trend chart data: merge 2025 actuals + 2026 projections by index
  const trendData = useMemo(() => {
    const agg25 = aggregateMonthly(monthlyData);
    const agg26 = aggregateMonthly(projection2026);
    return agg25.map((row, i) => ({
      label: row.monthLabel,
      '2025 Gerçekleşen': row.total,
      '2026 Projeksiyon': agg26[i]?.total ?? 0,
    }));
  }, [monthlyData, projection2026]);

  const companyLabel =
    company === 'ICA' ? 'ICA' :
    company === 'ICE' ? 'ICE' : 'Grup Konsolide';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── HEADER ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900">İdari İşler Bütçe Yönetim Sistemi</h1>
          <p className="text-sm text-gray-500 mt-0.5">2025 Gerçekleşen · 2026 Projeksiyon</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
          Canlı Veri
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
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {c === 'GRUP' ? 'Grup Konsolide' : c}
            </button>
          ))}
        </div>

        {/* ── METRIC CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">2025 Toplam</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(total2025)}</p>
            <p className="text-xs text-gray-400 mt-1">{companyLabel} · Yıllık</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">2026 Projeksiyon</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{fmt(total2026)}</p>
            <p className="text-xs text-gray-400 mt-1">{companyLabel} · Tahmini</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Aylık Ortalama</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(avgMonthly)}</p>
            <p className="text-xs text-gray-400 mt-1">{companyLabel} · 2025</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fark (25→26)</p>
            <p className={`text-2xl font-bold mt-1 ${pctColor(diffPct)}`}>
              {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-400 mt-1">{fmt(Math.abs(total2026 - total2025))} artış</p>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex border-b border-gray-200 gap-6">
          {[
            { key: 'overview',   label: 'Genel Bakış' },
            { key: 'projection', label: '2026 Projeksiyon' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ══════════ OVERVIEW TAB ══════════ */}
        {tab === 'overview' && (
          <div className="space-y-6">

            {/* ── STACKED BAR CHART ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">
                2025 Aylık Gider Dağılımı — {companyLabel}
              </h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 4, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => fmt(v)}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Legend
                    iconType="square"
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  />
                  {CATEGORIES.map((cat) => (
                    <Bar
                      key={cat.id}
                      dataKey={cat.id}
                      name={cat.name}
                      stackId="a"
                      fill={CATEGORY_COLORS[cat.id]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── CATEGORY TABLE ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">
                  Kategori Bazlı 2025 Özeti — {companyLabel}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Kategori</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Yıllık Toplam</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pay %</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Endeks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {CATEGORIES.map((cat) => {
                      const catTotal = categoryAnnual(monthlyData, cat.id);
                      const share    = categoryShare(catTotal, total2025);
                      return (
                        <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: CATEGORY_COLORS[cat.id] }}
                            />
                            <span className="font-medium text-gray-800">{cat.name}</span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-gray-700">
                            {fmtFull(catTotal)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 bg-gray-100 rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full"
                                  style={{
                                    width: `${share}%`,
                                    backgroundColor: CATEGORY_COLORS[cat.id],
                                  }}
                                />
                              </div>
                              <span className="text-gray-700 w-10 text-right">{share.toFixed(1)}%</span>
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
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td className="px-5 py-3 font-semibold text-gray-800">Genel Toplam</td>
                      <td className="px-5 py-3 text-right font-semibold font-mono text-gray-900">
                        {fmtFull(total2025)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-700">100%</td>
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

            {/* ── SLIDERS ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-800">
                  2026 Projeksiyon Katsayıları — {companyLabel}
                </h2>
                <button
                  onClick={() => setCoefficients(DEFAULT_COEFFICIENTS)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Sıfırla
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {CATEGORIES.map((cat) => {
                  const coeff = coefficients[cat.id] ?? 1.2;
                  const catTotal2025 = categoryAnnual(monthlyData, cat.id);
                  const catTotal2026 = categoryAnnual(projection2026, cat.id);
                  return (
                    <div key={cat.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-gray-700">
                          <span
                            className="w-2.5 h-2.5 rounded-sm"
                            style={{ backgroundColor: CATEGORY_COLORS[cat.id] }}
                          />
                          {cat.name}
                          <span className={`ml-1 px-1.5 py-0.5 rounded-full ${INDEX_BADGE_COLORS[cat.indexType]}`}>
                            {cat.indexType}
                          </span>
                        </span>
                        <span className="font-semibold text-indigo-600">
                          ×{coeff.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1.00}
                        max={2.00}
                        step={0.01}
                        value={coeff}
                        onChange={(e) =>
                          setCoefficients((prev) => ({
                            ...prev,
                            [cat.id]: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full h-1.5 rounded-full accent-indigo-600 cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>{fmt(catTotal2025)} (2025)</span>
                        <span className="text-indigo-500 font-medium">→ {fmt(catTotal2026)} (2026)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 2026 SUMMARY CARDS ── */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-xs font-medium text-indigo-500 uppercase">2025 Toplam</p>
                <p className="text-xl font-bold text-indigo-900 mt-1">{fmt(total2025)}</p>
              </div>
              <div className="bg-indigo-600 rounded-xl p-4">
                <p className="text-xs font-medium text-indigo-200 uppercase">2026 Projeksiyon</p>
                <p className="text-xl font-bold text-white mt-1">{fmt(total2026)}</p>
              </div>
              <div className={`rounded-xl p-4 ${diffPct > 0 ? 'bg-red-50 border border-red-100' : 'bg-green-50 border border-green-100'}`}>
                <p className={`text-xs font-medium uppercase ${diffPct > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  Artış / Azalış
                </p>
                <p className={`text-xl font-bold mt-1 ${pctColor(diffPct)}`}>
                  {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* ── TREND LINE CHART ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">
                2025 Gerçekleşen vs 2026 Projeksiyon — Aylık Trend
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 4, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => fmt(v)}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip content={<CustomLineTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="2025 Gerçekleşen"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#6366f1' }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="2026 Projeksiyon"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={{ r: 3, fill: '#f59e0b' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* ── CATEGORY PROJECTION TABLE ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">
                  Kategori Bazlı Projeksiyon Karşılaştırması
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Kategori</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">2025</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">2026 Proj.</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fark %</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Katsayı</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {CATEGORIES.map((cat) => {
                      const t25 = categoryAnnual(monthlyData, cat.id);
                      const t26 = categoryAnnual(projection2026, cat.id);
                      const pct = variancePct(t25, t26);
                      return (
                        <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: CATEGORY_COLORS[cat.id] }} />
                            <span className="font-medium text-gray-800">{cat.name}</span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-gray-600">{fmt(t25)}</td>
                          <td className="px-5 py-3 text-right font-mono font-semibold text-gray-900">{fmt(t26)}</td>
                          <td className={`px-5 py-3 text-right font-semibold ${pctColor(pct)}`}>
                            {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded font-mono text-xs">
                              ×{(coefficients[cat.id] ?? 1.2).toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td className="px-5 py-3 font-semibold text-gray-800">Toplam</td>
                      <td className="px-5 py-3 text-right font-semibold font-mono">{fmt(total2025)}</td>
                      <td className="px-5 py-3 text-right font-semibold font-mono text-indigo-700">{fmt(total2026)}</td>
                      <td className={`px-5 py-3 text-right font-bold ${pctColor(diffPct)}`}>
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
      </main>
    </div>
  );
}
