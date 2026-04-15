'use client';

import React from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { SAP_CATEGORY_COLORS } from '@/data/sap-data';
import type { SapEntry } from '@/data/sap-data';
import { fmt, fmtFull } from '@/lib/utils';

interface SapSummary {
  totalBudget: number;
  totalUsed: number;
  totalRemaining: number;
  usagePct: number;
}

interface SapCategoryGroup {
  category: string;
  rows: SapEntry[];
  budget: number;
  used: number;
  remaining: number;
}

interface Props {
  importedSapData: SapEntry[] | null;
  setImportedSapData: React.Dispatch<React.SetStateAction<SapEntry[] | null>>;
  sapSummary: SapSummary;
  sapByCategory: SapCategoryGroup[];
  companyLabel: string;
}

export default function SapTab({
  importedSapData,
  setImportedSapData,
  sapSummary,
  sapByCategory,
  companyLabel,
}: Props) {
  return (
    <div className="space-y-6">

      {/* yüklenen veri bildirimi */}
      {importedSapData && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
          <span className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <FileSpreadsheet size={15} />
            <span className="font-medium">Yüklenen Excel verisi gösteriliyor</span>
            <span className="text-blue-500 dark:text-blue-400">({importedSapData.length} SAP kodu)</span>
          </span>
          <button
            onClick={() => setImportedSapData(null)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-semibold underline underline-offset-2"
          >
            Statik Veriye Dön
          </button>
        </div>
      )}

      {/* özet kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Toplam Bütçe',  value: fmtFull(sapSummary.totalBudget),    cls: 'text-gray-900 dark:text-white' },
          { label: 'Kullanılan',    value: fmtFull(sapSummary.totalUsed),      cls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Kalan',         value: fmtFull(sapSummary.totalRemaining), cls: 'text-emerald-600 dark:text-emerald-400' },
          {
            label: 'Kullanım Oranı',
            value: `${sapSummary.usagePct.toFixed(1)}%`,
            cls: sapSummary.usagePct >= 90 ? 'text-red-600 dark:text-red-400'
               : sapSummary.usagePct >= 70 ? 'text-amber-600 dark:text-amber-400'
               : 'text-emerald-600 dark:text-emerald-400',
          },
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
        const catPct   = budget > 0 ? (used / budget) * 100 : 0;
        const catColor = SAP_CATEGORY_COLORS[category] ?? '#94a3b8';
        const barColor = catPct >= 90 ? '#ef4444' : catPct >= 70 ? '#f59e0b' : '#22c55e';

        return (
          <div key={category} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

            {/* kategori başlığı */}
            <div className="px-3 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2 sm:mb-0">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: catColor }} />
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{category}</h3>
                  <span className="text-xs text-gray-400 dark:text-gray-500">({rows.length} kod)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 sm:w-24 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(catPct, 100)}%`, backgroundColor: barColor }} />
                  </div>
                  <span className="text-xs font-bold w-10 text-right" style={{ color: barColor }}>{catPct.toFixed(1)}%</span>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-6 text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>Bütçe: <span className="font-semibold text-gray-700 dark:text-gray-300 font-mono">{fmtFull(budget)}</span></span>
                <span>Kullanılan: <span className="font-semibold font-mono" style={{ color: barColor }}>{fmtFull(used)}</span></span>
                <span>Kalan: <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{fmtFull(remaining)}</span></span>
              </div>
              <div className="flex sm:hidden items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>Bütçe: <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{fmt(budget)}</span></span>
                <span>Kalan: <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{fmt(remaining)}</span></span>
              </div>
            </div>

            {/* SAP kodu satırları — mobil kart görünümü */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row) => {
                const pct    = row.budget > 0 ? (row.used / row.budget) * 100 : 0;
                const rowBar = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
                return (
                  <div key={row.code} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">
                        {row.code}
                      </span>
                      <span className="text-xs font-bold" style={{ color: rowBar }}>{pct.toFixed(1)}%</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">{row.name}</p>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: rowBar }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Bütçe: <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{fmtFull(row.budget)}</span></span>
                      <span>Kullanılan: <span className="font-mono font-semibold" style={{ color: rowBar }}>{fmtFull(row.used)}</span></span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Kalan: <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{fmtFull(row.remaining)}</span>
                    </div>
                  </div>
                );
              })}
              {/* mobil alt toplam */}
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 flex justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
                <span>{category} Toplamı</span>
                <span style={{ color: barColor }}>{fmtFull(used)} / {fmtFull(budget)}</span>
              </div>
            </div>

            {/* SAP kodu satırları — masaüstü tablo */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {['SAP Kodu', 'Açıklama', 'Bütçe (₺)', 'Kullanılan (₺)', 'Kalan (₺)', 'Kullanım %'].map((h, i) => (
                      <th key={h} className={`px-5 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {rows.map((row) => {
                    const pct    = row.budget > 0 ? (row.used / row.budget) * 100 : 0;
                    const rowBar = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
                    const rowBg  = pct >= 90
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
  );
}
