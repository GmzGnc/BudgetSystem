'use client';

import React from 'react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CATEGORIES, CATEGORY_COLORS, INDEX_BADGE_COLORS } from '@/data/categories';
import { categoryAnnual, variancePct } from '@/lib/calculations';
import type { MonthlyEntry, ProjectionCoefficients } from '@/types';
import { fmt, fmtFull, pctTextColor } from '@/lib/utils';

const DEFAULT_COEFFICIENTS: ProjectionCoefficients = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, parseFloat((1 + c.rate / 100).toFixed(3))]),
);

interface Props {
  monthlyData: MonthlyEntry[];
  projection2026: MonthlyEntry[];
  coefficients: ProjectionCoefficients;
  setCoefficients: React.Dispatch<React.SetStateAction<ProjectionCoefficients>>;
  total2025: number;
  total2026: number;
  diffPct: number;
  trendData: { label: string; '2025 Gerçekleşen': number; '2026 Projeksiyon': number }[];
  companyLabel: string;
  axisColor: string;
  gridColor: string;
  LineTooltip: React.ComponentType<Record<string, unknown>>;
}

export default function ProjectionTab({
  monthlyData,
  projection2026,
  coefficients,
  setCoefficients,
  total2025,
  total2026,
  diffPct,
  trendData,
  companyLabel,
  axisColor,
  gridColor,
  LineTooltip,
}: Props) {
  return (
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
            const coeff      = coefficients[cat.id] ?? 1.2;
            const catTotal25 = categoryAnnual(monthlyData, cat.id);
            const catTotal26 = categoryAnnual(projection2026, cat.id);
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
                {['Kategori', '2025', '2026 Proj.', 'Fark %', 'Katsayı'].map((h, i) => (
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
  );
}
