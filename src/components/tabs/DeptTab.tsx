'use client';

import React from 'react';
import {
  BarChart, Bar, Cell,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DEPARTMENTS, ICA_DEPT, DEPT_COLORS } from '@/data/department-data';
import type { Department } from '@/data/department-data';
import { CATEGORY_COLORS } from '@/data/categories';
import type { Company } from '@/types';
import { fmt, fmtFull } from '@/lib/utils';

interface DeptPieSlice {
  name: string;
  value: number;
  color: string;
}

interface Props {
  deptPieData: DeptPieSlice[];
  deptBarData: Record<string, number | string>[];
  deptGrandTotal: number;
  selectedDept: Department | 'ALL';
  setSelectedDept: (dept: Department | 'ALL') => void;
  companyLabel: string;
  axisColor: string;
  gridColor: string;
  company: Company;
  dark: boolean;
}

export default function DeptTab({
  deptPieData,
  deptBarData,
  deptGrandTotal,
  selectedDept,
  setSelectedDept,
  axisColor,
  company,
  dark,
}: Props) {
  return (
    <div className="space-y-6">

      {/* ICE uyarısı */}
      {company === 'ICE' ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <span className="text-3xl">🏢</span>
          </div>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">ICE&apos;de departman kırılımı bulunmamaktadır</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Bu analiz yalnızca ICA verisi için hazırlanmıştır.</p>
        </div>
      ) : (
        <>
          {/* GRUP notu */}
          {company === 'GRUP' && (
            <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
              Grup Konsolide seçili — departman kırılımı yalnızca <span className="font-semibold">ICA</span> verisi üzerinden gösterilmektedir.
            </div>
          )}

          {/* departman seçici */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedDept('ALL')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                selectedDept === 'ALL'
                  ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 shadow'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Tüm Departmanlar
            </button>
            {DEPARTMENTS.map((dept) => {
              const total = ICA_DEPT.reduce((s, r) => s + r[dept], 0);
              if (total === 0) return null;
              return (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    selectedDept === dept
                      ? 'text-white shadow'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  style={selectedDept === dept ? { backgroundColor: DEPT_COLORS[dept] } : {}}
                >
                  {dept}
                </button>
              );
            })}
          </div>

          {/* grafikler */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* pasta grafik — departman payları */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
                Departman Payları — ICA 2025
              </h3>
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deptPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={52}
                      paddingAngle={2}
                    >
                      {deptPieData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [fmtFull(Number(value)), '']}
                      contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: dark ? '#f9fafb' : '#111827', fontWeight: 600 }}
                    />
                    <Legend
                      formatter={(value) => <span style={{ fontSize: 11, color: dark ? '#9ca3af' : '#6b7280' }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* bar chart — seçilen departman veya tüm kategoriler */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
                {selectedDept === 'ALL'
                  ? 'Kategori Bazlı Dağılım — Tüm Departmanlar'
                  : `${selectedDept} — Kategori Dağılımı`}
              </h3>
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  {selectedDept === 'ALL' ? (
                    <BarChart data={deptBarData} margin={{ top: 4, right: 8, bottom: 4, left: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? '#374151' : '#f0f0f0'} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} width={60} />
                      <Tooltip
                        formatter={(v) => fmtFull(Number(v))}
                        contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 8, fontSize: 11 }}
                      />
                      <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 10, paddingTop: 8, color: dark ? '#9ca3af' : '#6b7280' }} />
                      {DEPARTMENTS.map((dept) => (
                        <Bar key={dept} dataKey={dept} name={dept} stackId="a" fill={DEPT_COLORS[dept]} />
                      ))}
                    </BarChart>
                  ) : (
                    <BarChart data={deptBarData} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={dark ? '#374151' : '#f0f0f0'} />
                      <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} width={100} />
                      <Tooltip
                        formatter={(v) => [fmtFull(Number(v)), selectedDept]}
                        contentStyle={{ background: dark ? '#1f2937' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, borderRadius: 8, fontSize: 11 }}
                      />
                      <Bar dataKey="value" name={selectedDept} fill={DEPT_COLORS[selectedDept as Department]} radius={[0, 4, 4, 0]}
                        label={{ position: 'right', formatter: (v: unknown) => fmt(v as number), fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* matris tablo */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Departman × Kategori Matris — ICA 2025 Yıllık (₺)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide sticky left-0 bg-gray-50 dark:bg-gray-800">
                      Kategori
                    </th>
                    {DEPARTMENTS.map((dept) => (
                      <th
                        key={dept}
                        className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${
                          selectedDept === dept
                            ? 'text-white'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                        style={selectedDept === dept ? { backgroundColor: DEPT_COLORS[dept] } : {}}
                      >
                        {dept}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide bg-gray-100 dark:bg-gray-700">
                      TOPLAM
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {ICA_DEPT.map((row) => {
                    const rowTotal = DEPARTMENTS.reduce((s, d) => s + row[d], 0);
                    return (
                      <tr key={row.categoryId} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-800 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-900 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[row.categoryId] }} />
                          {row.categoryName}
                        </td>
                        {DEPARTMENTS.map((dept) => {
                          const val        = row[dept];
                          const isSelected = selectedDept === dept;
                          return (
                            <td
                              key={dept}
                              className={`px-4 py-3 text-right font-mono text-xs ${
                                val === 0
                                  ? 'text-gray-300 dark:text-gray-600'
                                  : isSelected
                                  ? 'font-bold'
                                  : 'text-gray-700 dark:text-gray-300'
                              }`}
                              style={isSelected && val > 0 ? { color: DEPT_COLORS[dept] } : {}}
                            >
                              {val === 0 ? '—' : fmtFull(val)}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800">
                          {fmtFull(rowTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-100 dark:bg-gray-700 border-t-2 border-gray-200 dark:border-gray-600">
                  <tr>
                    <td className="px-5 py-3 font-bold text-gray-800 dark:text-gray-100 text-xs uppercase tracking-wide sticky left-0 bg-gray-100 dark:bg-gray-700">
                      Genel Toplam
                    </td>
                    {DEPARTMENTS.map((dept) => {
                      const colTotal   = ICA_DEPT.reduce((s, r) => s + r[dept], 0);
                      const isSelected = selectedDept === dept;
                      return (
                        <td
                          key={dept}
                          className={`px-4 py-3 text-right font-mono text-xs font-bold ${
                            colTotal === 0
                              ? 'text-gray-400 dark:text-gray-500'
                              : isSelected
                              ? 'text-white'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                          style={isSelected && colTotal > 0 ? { backgroundColor: DEPT_COLORS[dept] } : {}}
                        >
                          {colTotal === 0 ? '—' : fmtFull(colTotal)}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-mono text-xs font-bold text-gray-900 dark:text-white">
                      {fmtFull(deptGrandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
