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

  // Process in batches of 50 to avoid Supabase payload limits
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
      .upsert(batch, {
        onConflict: 'company_id,fiscal_year_id,category_code,dept_code,item_code,param_code',
        count: 'exact',
      });
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
    .order('dept_code');

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
