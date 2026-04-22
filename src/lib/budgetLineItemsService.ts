import { createClient } from '@supabase/supabase-js';
import type { ParsedExcelData } from './excelParser';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface UpsertResult {
  success: boolean;
  upserted: number;
  errors: string[];
}

export async function upsertBudgetLineItems(
  data: ParsedExcelData,
  companyId: string,
  fiscalYearId: string
): Promise<UpsertResult> {
  const errors: string[] = [];
  let upserted = 0;

  // Delete all existing rows for this company+year first to avoid duplicate
  // issues caused by NULL columns not being equal in PostgreSQL UNIQUE constraints.
  const { error: delError } = await supabase
    .from('budget_line_items')
    .delete()
    .eq('company_id', companyId)
    .eq('fiscal_year_id', fiscalYearId);

  if (delError) {
    return { success: false, upserted: 0, errors: [`Delete failed: ${delError.message}`] };
  }

  // Insert fresh in batches of 50
  const BATCH_SIZE = 50;
  const records = data.lineItems.map(item => ({
    company_id:     companyId,
    fiscal_year_id: fiscalYearId,
    category_code:  item.category_code,
    dept_code:      item.dept_code,
    item_code:      item.item_code,
    param_code:     item.param_code,
    row_type:       item.row_type,
    label:          item.label,
    monthly_budget: item.monthly_budget,
    monthly_actual: item.monthly_actual,
    unit_type:      item.unit_type,
  }));

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from('budget_line_items')
      .insert(batch, { count: 'exact' });
    if (error) {
      errors.push(`Batch ${i}–${i + BATCH_SIZE}: ${error.message}`);
    } else {
      upserted += count ?? batch.length;
    }
  }

  return { success: errors.length === 0, upserted, errors };
}

export async function fetchBudgetLineItems(
  companyId: string,
  fiscalYearId: string,
  categoryCode?: string
) {
  let query = supabase
    .from('budget_line_items')
    .select('*')
    .eq('company_id', companyId)
    .eq('fiscal_year_id', fiscalYearId)
    .order('category_code')
    .order('row_type')
    .order('dept_code')
    .limit(5000);

  if (categoryCode) {
    query = query.eq('category_code', categoryCode);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchCategoryTotal(
  companyId: string,
  fiscalYearId: string,
  categoryCode: string
) {
  const { data, error } = await supabase
    .from('budget_line_items')
    .select('monthly_budget, monthly_actual, label')
    .eq('company_id', companyId)
    .eq('fiscal_year_id', fiscalYearId)
    .eq('category_code', categoryCode)
    .eq('row_type', 'total')
    .single();
  if (error) throw error;
  return data;
}
