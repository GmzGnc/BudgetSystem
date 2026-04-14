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
  name: string;
  code: string;         // e.g. "guvenlik", "temizlik"
  index_type: string;   // e.g. "Asgari Ücret", "TÜFE"
  rate: number;         // default projection rate (%)
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
  label: string;        // e.g. "2025", "2026 Projeksiyon"
  is_projection: boolean;
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
  amount: number;
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
    const { data, error } = await supabase
      .from('budget_entries')
      .select('*')
      .eq('company_id', companyId)
      .eq('fiscal_year_id', fiscalYearId)
      .order('month');
    if (error) return fail(error.message);
    return ok(data as BudgetEntry[]);
  } catch (e) {
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
