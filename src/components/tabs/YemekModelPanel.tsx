'use client';

import React, { useMemo, useState, useEffect } from 'react';
import type { ModelRow } from '@/types';
import type { FoodCategoryConfig, FoodDepartment } from '@/config/companyConfigs';
import { calculateFoodBudget } from '@/lib/calculations';

// ─── Tipler ──────────────────────────────────────────────────────────────────

type MonthValues = number[]; // uzunluk 12

interface YemekModelPanelProps {
  config: FoodCategoryConfig;
  modelData: ModelRow[];      // sadece yemek kategorisine ait satırlar
  companyName: 'ICA' | 'ICE';
}

type Section = 'price' | 'meals' | 'days';

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function fmt(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + ' K';
  return n.toFixed(0);
}

function fmtTL(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' TL';
}

// ─── Excel'den değer oku ─────────────────────────────────────────────────────

function readRow(modelData: ModelRow[], rowNum: number): MonthValues {
  const row = modelData.find((r) => r.rowNum === rowNum);
  return row?.budget ?? Array(12).fill(0);
}

// ─── Küçük input bileşeni ────────────────────────────────────────────────────

function NumInput({
  value, onChange, dim,
}: { value: number; onChange: (v: number) => void; dim?: boolean }) {
  return (
    <input
      type="number"
      min={0}
      value={value === 0 ? '' : value}
      placeholder="0"
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={`w-14 text-right text-xs px-1 py-0.5 rounded border focus:outline-none focus:ring-1 focus:ring-amber-400
        ${dim
          ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
          : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200'
        }`}
    />
  );
}

// ─── Accordion başlık ────────────────────────────────────────────────────────

function AccordionHeader({
  open, toggle, title, subtitle,
}: { open: boolean; toggle: () => void; title: string; subtitle?: string }) {
  return (
    <button
      onClick={toggle}
      className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 rounded-lg transition-colors"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
        <span className="text-amber-500">{open ? '▼' : '▶'}</span>
        {title}
      </span>
      {subtitle && (
        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{subtitle}</span>
      )}
    </button>
  );
}

// ─── Yatay ay tablosu ────────────────────────────────────────────────────────

interface MonthTableProps {
  rows: { label: string; values: MonthValues; onChangeMonth: (mi: number, v: number) => void; dimZeros?: boolean }[];
  readOnly?: boolean;
}

function MonthTable({ rows, readOnly }: MonthTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs min-w-max w-full">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-800">
            <th className="text-left px-3 py-1.5 text-gray-500 dark:text-gray-400 font-medium min-w-[140px]">
              Departman
            </th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="px-1 py-1.5 text-center text-gray-400 dark:text-gray-500 font-normal w-14">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <td className="px-3 py-1 text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                {row.label}
              </td>
              {row.values.map((val, mi) => (
                <td key={mi} className="px-1 py-1 text-center">
                  {readOnly ? (
                    <span className={`font-mono ${val === 0 ? 'text-gray-300 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>
                      {val === 0 ? '—' : val}
                    </span>
                  ) : (
                    <NumInput
                      value={val}
                      onChange={(v) => row.onChangeMonth(mi, v)}
                      dim={row.dimZeros && val === 0}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export default function YemekModelPanel({ config, modelData, companyName }: YemekModelPanelProps) {
  const isICA = !!config.globalUnitPriceRow;
  const activeDepts = config.departments.filter((d) => d.isActive && !d.isSpecial);
  const specialDepts = config.departments.filter((d) => d.isActive && d.isSpecial);

  // ── Başlangıç değerleri Excel'den ──────────────────────────────────────────
  const initGlobalPrices = useMemo(
    () => isICA ? readRow(modelData, config.globalUnitPriceRow!) : Array(12).fill(0),
    [modelData, config.globalUnitPriceRow, isICA],
  );

  const initDeptPrices = useMemo<Record<string, MonthValues>>(() => {
    if (isICA) return {};
    return Object.fromEntries(
      activeDepts.map((d) => [d.name, readRow(modelData, d.unitPriceRow)]),
    );
  }, [modelData, activeDepts, isICA]);

  const initMeals = useMemo<Record<string, MonthValues>>(
    () => Object.fromEntries(activeDepts.map((d) => [d.name, readRow(modelData, d.mealCountRow)])),
    [modelData, activeDepts],
  );

  const initDays = useMemo<Record<string, MonthValues>>(
    () => Object.fromEntries(activeDepts.map((d) => [d.name, readRow(modelData, d.dayCountRow)])),
    [modelData, activeDepts],
  );

  const initSpecials = useMemo<Record<string, MonthValues>>(
    () => Object.fromEntries(
      specialDepts.map((d) => [d.name, readRow(modelData, d.specialValueRow ?? d.resultRow)]),
    ),
    [modelData, specialDepts],
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [globalPrices, setGlobalPrices] = useState<MonthValues>(initGlobalPrices);
  const [deptPrices,   setDeptPrices]   = useState<Record<string, MonthValues>>(initDeptPrices);
  const [meals,        setMeals]        = useState<Record<string, MonthValues>>(initMeals);
  const [days,         setDays]         = useState<Record<string, MonthValues>>(initDays);
  const [specials,     setSpecials]     = useState<Record<string, MonthValues>>(initSpecials);
  const [openSection,  setOpenSection]  = useState<Section | null>('price');

  // modelData değişince (yeni Excel import) state'leri sıfırla
  useEffect(() => {
    setGlobalPrices(initGlobalPrices);
    setDeptPrices(initDeptPrices);
    setMeals(initMeals);
    setDays(initDays);
    setSpecials(initSpecials);
  }, [initGlobalPrices, initDeptPrices, initMeals, initDays, initSpecials]);

  // ── Hesaplanan aylık toplamlar ─────────────────────────────────────────────
  const monthlyTotals = useMemo<number[]>(() => {
    return Array.from({ length: 12 }, (_, mi) => {
      const mealsM: Record<string, number>   = Object.fromEntries(activeDepts.map((d) => [d.name, (meals[d.name] ?? Array(12).fill(0))[mi]]));
      const daysM: Record<string, number>    = Object.fromEntries(activeDepts.map((d) => [d.name, (days[d.name]  ?? Array(12).fill(0))[mi]]));
      const specialsM: Record<string, number> = Object.fromEntries(specialDepts.map((d) => [d.name, (specials[d.name] ?? Array(12).fill(0))[mi]]));

      const pricesM: Record<string, number> = isICA
        ? { global: globalPrices[mi] }
        : Object.fromEntries(activeDepts.map((d) => [d.name, (deptPrices[d.name] ?? Array(12).fill(0))[mi]]));

      return calculateFoodBudget(
        config.departments,
        mealsM, daysM, pricesM, specialsM,
      );
    });
  }, [globalPrices, deptPrices, meals, days, specials, config.departments, activeDepts, specialDepts, isICA]);

  const annualTotal = monthlyTotals.reduce((s, v) => s + v, 0);

  // ── Setter yardımcıları ────────────────────────────────────────────────────
  function updateGlobalPrice(mi: number, v: number) {
    setGlobalPrices((prev) => { const n = [...prev]; n[mi] = v; return n; });
  }
  function updateDeptPrice(deptName: string, mi: number, v: number) {
    setDeptPrices((prev) => {
      const vals = [...(prev[deptName] ?? Array(12).fill(0))];
      vals[mi] = v;
      return { ...prev, [deptName]: vals };
    });
  }
  function updateMeal(deptName: string, mi: number, v: number) {
    setMeals((prev) => {
      const vals = [...(prev[deptName] ?? Array(12).fill(0))];
      vals[mi] = v;
      return { ...prev, [deptName]: vals };
    });
  }
  function updateDay(deptName: string, mi: number, v: number) {
    setDays((prev) => {
      const vals = [...(prev[deptName] ?? Array(12).fill(0))];
      vals[mi] = v;
      return { ...prev, [deptName]: vals };
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-amber-200 dark:border-amber-800 shadow-sm overflow-hidden">

      {/* Başlık */}
      <div className="flex items-center justify-between px-5 py-3 bg-amber-600 dark:bg-amber-700">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-amber-200" />
          <span className="text-sm font-bold text-white">Yemek Bütçe Modeli</span>
          <span className="text-xs bg-amber-500 dark:bg-amber-600 text-white px-2 py-0.5 rounded-full">
            {companyName}
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs text-amber-200">Hesaplanan Yıllık Toplam</p>
          <p className="text-base font-bold text-white">{fmtTL(annualTotal)}</p>
        </div>
      </div>

      {/* Aylık toplamlar — mini bar */}
      <div className="grid grid-cols-12 gap-px bg-amber-100 dark:bg-amber-900 border-b border-amber-200 dark:border-amber-800">
        {monthlyTotals.map((v, mi) => (
          <div key={mi} className="bg-white dark:bg-gray-900 px-1 py-1.5 text-center">
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{MONTH_LABELS[mi]}</p>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{fmt(v)}</p>
          </div>
        ))}
      </div>

      <div className="p-4 space-y-3">

        {/* ── 1. Birim Fiyat ── */}
        <div className="space-y-2">
          <AccordionHeader
            open={openSection === 'price'}
            toggle={() => setOpenSection((s) => s === 'price' ? null : 'price')}
            title="Birim Fiyat (TL/öğün)"
            subtitle={isICA ? '1 satır — tüm departmanlar için ortak' : `${activeDepts.length} departman — her birinin kendi fiyatı`}
          />
          {openSection === 'price' && (
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-2">
              <MonthTable
                rows={
                  isICA
                    ? [{ label: 'Birim Fiyat', values: globalPrices, onChangeMonth: updateGlobalPrice }]
                    : activeDepts.map((d) => ({
                        label: d.name,
                        values: deptPrices[d.name] ?? Array(12).fill(0),
                        onChangeMonth: (mi, v) => updateDeptPrice(d.name, mi, v),
                      }))
                }
              />
            </div>
          )}
        </div>

        {/* ── 2. Öğün Sayıları ── */}
        <div className="space-y-2">
          <AccordionHeader
            open={openSection === 'meals'}
            toggle={() => setOpenSection((s) => s === 'meals' ? null : 'meals')}
            title="Öğün Sayıları (adet/gün)"
            subtitle={`${activeDepts.length} departman`}
          />
          {openSection === 'meals' && (
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-2">
              <MonthTable
                rows={activeDepts.map((d) => ({
                  label: d.groupName ? `${d.groupName} / ${d.name}` : d.name,
                  values: meals[d.name] ?? Array(12).fill(0),
                  onChangeMonth: (mi, v) => updateMeal(d.name, mi, v),
                  dimZeros: true,
                }))}
              />
            </div>
          )}
        </div>

        {/* ── 3. Gün Sayıları ── */}
        <div className="space-y-2">
          <AccordionHeader
            open={openSection === 'days'}
            toggle={() => setOpenSection((s) => s === 'days' ? null : 'days')}
            title="Gün Sayıları (çalışma günü)"
            subtitle={`${activeDepts.length} departman`}
          />
          {openSection === 'days' && (
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-2">
              <MonthTable
                rows={activeDepts.map((d) => ({
                  label: d.groupName ? `${d.groupName} / ${d.name}` : d.name,
                  values: days[d.name] ?? Array(12).fill(0),
                  onChangeMonth: (mi, v) => updateDay(d.name, mi, v),
                  dimZeros: true,
                }))}
              />
            </div>
          )}
        </div>

        {/* ── Özel kalemler (Kilyos vb.) ── */}
        {specialDepts.length > 0 && (
          <div className="rounded-lg border border-dashed border-amber-200 dark:border-amber-800 p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
              Özel Kalemler (direkt TL — formülsüz)
            </p>
            <MonthTable
              readOnly
              rows={specialDepts.map((d) => ({
                label: d.name,
                values: specials[d.name] ?? Array(12).fill(0),
                onChangeMonth: () => {},
              }))}
            />
          </div>
        )}

        {/* ── Formül notu ── */}
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right">
          Formül: Σ (Öğün × Gün × Birim Fiyat) | 0 değerli hücreler hesaplamadan çıkarılır
        </p>
      </div>
    </div>
  );
}
