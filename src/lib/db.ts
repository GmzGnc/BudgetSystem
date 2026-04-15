import { supabase } from './supabase';

/*
 * ─── Supabase SQL Editor'da çalıştırılacak ────────────────────────────────────
 *
 * ALTER TABLE budget_entries
 * ADD CONSTRAINT budget_entries_unique
 * UNIQUE (company_id, fiscal_year_id, category_id, department_id, month);
 *
 * ALTER TABLE sap_entries
 * ADD CONSTRAINT sap_entries_unique
 * UNIQUE (company_id, fiscal_year_id, sap_code);
 *
 * ─── excel_imports log tablosu (opsiyonel) ────────────────────────────────────
 *
 * CREATE TABLE excel_imports (
 *   id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   company_id    uuid REFERENCES companies(id),
 *   fiscal_year_id uuid REFERENCES fiscal_years(id),
 *   sheet_name    text,
 *   row_count     int,
 *   import_type   text,   -- 'budget' | 'sap' | 'model'
 *   imported_at   timestamptz DEFAULT now()
 * );
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Row types (mirror your Supabase table schemas) ──────────────────────────

export interface Company {
  id: string;
  name: string;
  code: string;         // e.g. "ICA", "ICE"
  created_at?: string;
}

export interface Category {
  id: string;
  order_no: number;
  name: string;
  index_type: string;
  default_rate: number;
  created_at?: string;
}

export interface Department {
  id: string;
  company_id: string;
  name: string;
  code: string;
  created_at?: string;
}

export interface FiscalYear {
  id: string;
  year: number;
  status: string;       // 'active' | 'projection'
  created_at?: string;
}

export interface Assumption {
  id: string;
  fiscal_year_id: string;
  category_id: string;
  coefficient: number;  // projection multiplier
  notes?: string;
  updated_at?: string;
}

export interface BudgetEntry {
  id?: string;
  company_id: string;
  fiscal_year_id: string;
  category_id: string;
  department_id?: string | null;
  month: number;        // 1–12
  budget_amount: number;
  actual_amount?: number;
  unit_type?: string;
  meta?: unknown;
  updated_at?: string;
}

export interface SapEntry {
  id?: string;
  company_id: string;
  fiscal_year_id: string;
  sap_code: string;
  name: string;
  category: string;
  budget: number;
  used: number;
  remaining: number;
  updated_at?: string;
}

export const CATEGORY_CODE_MAP: Record<string, string> = {
  'Güvenlik':      'guvenlik',
  'Temizlik':      'temizlik',
  'Yemek':         'yemek',
  'Servis':        'servis',
  'Araç Kira':     'arac_kira',
  'HGS':           'hgs',
  'Araç Yakıt':    'arac_yakit',
  'Araç Bakım':    'arac_bakim',
  'Diğer Hizmet':  'diger_hizmet',
  'Diğer Çeşitli': 'diger_cesitli',
};

// ─── Generic result wrapper ───────────────────────────────────────────────────

export type DbResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

function ok<T>(data: T): DbResult<T> {
  return { data, error: null };
}

function fail<T>(err: unknown): DbResult<T> {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[db]', msg);
  return { data: null, error: msg };
}

// ─── 1. getCompanies ─────────────────────────────────────────────────────────

export async function getCompanies(): Promise<DbResult<Company[]>> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('code');
    if (error) return fail(error.message);
    return ok(data as Company[]);
  } catch (e) {
    console.error('[db] getCompanies error:', e);
    return fail(e);
  }
}

// ─── 2. getCategories ────────────────────────────────────────────────────────

export async function getCategories(): Promise<DbResult<Category[]>> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');
    if (error) return fail(error.message);
    return ok(data as Category[]);
  } catch (e) {
    console.error('[db] getCategories error:', e);
    return fail(e);
  }
}

// ─── 3. getDepartments ───────────────────────────────────────────────────────

export async function getDepartments(companyId: string): Promise<DbResult<Department[]>> {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    if (error) return fail(error.message);
    return ok(data as Department[]);
  } catch (e) {
    return fail(e);
  }
}

// ─── 4. getFiscalYears ───────────────────────────────────────────────────────

export async function getFiscalYears(): Promise<DbResult<FiscalYear[]>> {
  try {
    const { data, error } = await supabase
      .from('fiscal_years')
      .select('*')
      .order('year');
    if (error) return fail(error.message);
    return ok(data as FiscalYear[]);
  } catch (e) {
    console.error('[db] getFiscalYears error:', e);
    return fail(e);
  }
}

// ─── 5. getAssumptions ───────────────────────────────────────────────────────

export async function getAssumptions(fiscalYearId: string): Promise<DbResult<Assumption[]>> {
  try {
    const { data, error } = await supabase
      .from('assumptions')
      .select('*')
      .eq('fiscal_year_id', fiscalYearId);
    if (error) return fail(error.message);
    return ok(data as Assumption[]);
  } catch (e) {
    return fail(e);
  }
}

// ─── 6. getBudgetEntries ─────────────────────────────────────────────────────

export async function getBudgetEntries(
  companyId: string,
  fiscalYearId: string,
): Promise<DbResult<BudgetEntry[]>> {
  try {
    console.log('[db] getBudgetEntries called with:', companyId, fiscalYearId);
    const { data, error } = await supabase
      .from('budget_entries')
      .select('*')
      .eq('company_id', companyId)
      .eq('fiscal_year_id', fiscalYearId)
      .order('month');
    console.log('[db] getBudgetEntries result count:', data?.length, 'error:', error?.message);
    if (error) return fail(error.message);
    return ok(data as BudgetEntry[]);
  } catch (e) {
    console.error('[db] getBudgetEntries error:', e);
    return fail(e);
  }
}

// ─── 7. upsertBudgetEntries ──────────────────────────────────────────────────
// Conflict target: (company_id, fiscal_year_id, category_id, department_id, month)
// Make sure this unique constraint exists in Supabase.

export async function upsertBudgetEntries(
  entries: BudgetEntry[],
): Promise<DbResult<BudgetEntry[]>> {
  if (entries.length === 0) return ok([]);
  try {
    const { data, error } = await supabase
      .from('budget_entries')
      .upsert(entries, {
        onConflict: 'company_id,fiscal_year_id,category_id,department_id,month',
        ignoreDuplicates: false,
      })
      .select();
    if (error) return fail(error.message);
    return ok(data as BudgetEntry[]);
  } catch (e) {
    return fail(e);
  }
}

// ─── 8. getSapEntries ────────────────────────────────────────────────────────

export async function getSapEntries(
  companyId: string,
  fiscalYearId: string,
): Promise<DbResult<SapEntry[]>> {
  try {
    const { data, error } = await supabase
      .from('sap_entries')
      .select('*')
      .eq('company_id', companyId)
      .eq('fiscal_year_id', fiscalYearId)
      .order('sap_code');
    if (error) return fail(error.message);
    return ok(data as SapEntry[]);
  } catch (e) {
    return fail(e);
  }
}

// ─── 9. upsertSapEntries ─────────────────────────────────────────────────────
// Conflict target: (company_id, fiscal_year_id, sap_code)

export async function upsertSapEntries(
  entries: SapEntry[],
): Promise<DbResult<SapEntry[]>> {
  if (entries.length === 0) return ok([]);
  try {
    const { data, error } = await supabase
      .from('sap_entries')
      .upsert(entries, {
        onConflict: 'company_id,fiscal_year_id,sap_code',
        ignoreDuplicates: false,
      })
      .select();
    if (error) return fail(error.message);
    return ok(data as SapEntry[]);
  } catch (e) {
    return fail(e);
  }
}

// ─── 10. logExcelImport (best-effort — error is ignored) ─────────────────────

export interface ExcelImportLog {
  company_id:     string;
  fiscal_year_id: string;
  sheet_name:     string;
  row_count:      number;
  import_type:    'budget' | 'sap' | 'model';
}

export async function logExcelImport(log: ExcelImportLog): Promise<void> {
  try {
    await supabase.from('excel_imports').insert(log);
  } catch {
    // Non-critical — silently ignore if table doesn't exist yet
  }
}

// ─── 11. getBudgetMonthlyData ─────────────────────────────────────────────────
// budget_entries'den MonthlyEntry[] formatına dönüştürür.
// Veri yoksa null döner (statik JSON fallback için).

import type { MonthlyEntry } from '@/types';

export async function getBudgetMonthlyData(
  companyCode: string,
  year: number = 2025,
): Promise<MonthlyEntry[] | null> {
  try {
    const [companiesRes, yearsRes] = await Promise.all([
      getCompanies(),
      getFiscalYears(),
    ]);
    const company = companiesRes.data?.find((c) => c.code === companyCode);
    const fiscalYear = yearsRes.data?.find((y) => y.year === year && y.status === 'active');
    if (!company || !fiscalYear) return null;

    const entriesRes = await getBudgetEntries(company.id, fiscalYear.id);
    if (!entriesRes.data || entriesRes.data.length === 0) return null;

    const catsRes = await getCategories();
    const cats = catsRes.data ?? [];

    // MonthlyEntry formatına çevir: her ay için {monthLabel, cat1: val, cat2: val, ...}
    const MONTH_LABELS_SHORT = ['Oca 25', 'Sub 25', 'Mar 25', 'Nis 25', 'May 25', 'Haz 25', 'Tem 25', 'Agu 25', 'Eyl 25', 'Eki 25', 'Kas 25', 'Ara 25'];
    const months: MonthlyEntry[] = MONTH_LABELS_SHORT.map((label, mi) => {
      const entry: MonthlyEntry = { month: String(mi + 1), monthLabel: label };
      for (const cat of cats) {
        const rows = entriesRes.data!.filter(
          (e) => e.category_id === cat.id && e.month === mi + 1,
        );
        (entry as Record<string, unknown>)[CATEGORY_CODE_MAP[cat.name] ?? cat.name] = rows.reduce((s, r) => s + r.budget_amount, 0);
      }
      return entry;
    });

    return months;
  } catch {
    return null;
  }
}

// ─── 12. getSapMonthlyData ────────────────────────────────────────────────────
// sap_entries'den SapEntry[] formatına dönüştürür.
// Veri yoksa null döner.

import type { SapEntry as SapDataEntry } from '@/data/sap-data';

export async function getSapMonthlyData(
  companyCode: string,
  year: number = 2025,
): Promise<SapDataEntry[] | null> {
  try {
    const [companiesRes, yearsRes] = await Promise.all([
      getCompanies(),
      getFiscalYears(),
    ]);
    const company = companiesRes.data?.find((c) => c.code === companyCode);
    const fiscalYear = yearsRes.data?.find((y) => y.year === year && y.status === 'active');
    if (!company || !fiscalYear) return null;

    const entriesRes = await getSapEntries(company.id, fiscalYear.id);
    if (!entriesRes.data || entriesRes.data.length === 0) return null;

    const companyTyped = (companyCode === 'ICE' ? 'ICE' : 'ICA') as 'ICA' | 'ICE';
    return entriesRes.data.map((e) => ({
      code:      e.sap_code,
      name:      e.name,
      category:  e.category,
      budget:    e.budget,
      used:      e.used,
      remaining: e.remaining,
      company:   companyTyped,
    }));
  } catch {
    return null;
  }
}

// ─── 13. getBudgetEntriesAsModelRows ─────────────────────────────────────────
export interface DbModelRow {
  rowNum: number;
  paramName: string;
  unitType: string;
  budget: number[];
  actual: number[];
}

export async function getBudgetEntriesAsModelRows(
  companyCode: string,
  year: number = 2025,
): Promise<{ categoryCode: string; rows: DbModelRow[] }[] | null> {
  try {
    const [companiesRes, yearsRes] = await Promise.all([
      getCompanies(),
      getFiscalYears(),
    ]);
    const company    = companiesRes.data?.find((c) => c.code === companyCode);
    console.log('[db] company:', company);
    const fiscalYear = yearsRes.data?.find((y) => y.year === year && y.status === 'active');
    console.log('[db] fiscalYear:', fiscalYear);
    if (!company || !fiscalYear) return null;

    const [entriesRes, catsRes] = await Promise.all([
      getBudgetEntries(company.id, fiscalYear.id),
      getCategories(),
    ]);
    console.log('[db] entries count:', entriesRes.data?.length);
    if (!entriesRes.data || entriesRes.data.length === 0) return null;

    const cats = catsRes.data ?? [];

    const result = cats.map((cat) => {
      const budget = Array.from({ length: 12 }, (_, mi) => {
        const rows = entriesRes.data!.filter(
          (e) => e.category_id === cat.id && e.month === mi + 1,
        );
        return rows.reduce((s, r) => s + r.budget_amount, 0);
      });

      return {
        categoryCode: CATEGORY_CODE_MAP[cat.name] ?? cat.name,
        rows: [{
          rowNum:    1,
          paramName: 'Toplam',
          unitType:  'TL',
          budget,
          actual:    Array(12).fill(0),
        }],
      };
    });
    console.log('[db] result:', JSON.stringify(result).slice(0, 200));
    return result;
  } catch (e) {
    console.error('[db] getBudgetEntriesAsModelRows error:', e);
    return null;
  }
}
