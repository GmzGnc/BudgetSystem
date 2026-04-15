'use client';

import React from 'react';
import {
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { CATEGORY_COLORS } from '@/data/categories';
import { fmt, fmtFull, pctTextColor, sapamaColor, sapamaStatus } from '@/lib/utils';

interface SapamaRow {
  id: string;
  name: string;
  t25: number;
  t26: number;
  diff: number;
  pct: number;
}

interface Props {
  sapamaData: SapamaRow[];
  total2025: number;
  total2026: number;
  diffPct: number;
  companyLabel: string;
  axisColor: string;
  gridColor: string;
  SapamaTooltip: React.ComponentType<Record<string, unknown>>;
}

export default function SapmaTab({
  sapamaData,
  total2025,
  total2026,
  diffPct,
  companyLabel,
  axisColor,
  gridColor,
  SapamaTooltip,
}: Props) {
  return (
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
                {['Kategori', '2025', '2026 Proj.', 'Fark (TL)', 'Fark %', 'Durum'].map((h, i) => (
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
  );
}
