-- Migration: create budget_line_items
-- Created: 2026-04-18
-- Purpose: Granular per-row storage for Excel Model Gider data
--          (replaces single-total budget_entries per category with
--           full row hierarchy: total → dept → item → param)

CREATE TABLE IF NOT EXISTS public.budget_line_items (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year_id  uuid NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  category_code   text NOT NULL,
  dept_code       text,
  item_code       text,
  param_code      text,
  row_type        text NOT NULL CHECK (row_type IN ('total','dept','item','param')),
  label           text NOT NULL,
  monthly_budget  jsonb NOT NULL DEFAULT '[]',
  monthly_actual  jsonb NOT NULL DEFAULT '[]',
  unit_type       text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (company_id, fiscal_year_id, category_code, dept_code, item_code, param_code)
);

CREATE INDEX IF NOT EXISTS idx_bli_company_year
  ON public.budget_line_items(company_id, fiscal_year_id);

CREATE INDEX IF NOT EXISTS idx_bli_category
  ON public.budget_line_items(company_id, fiscal_year_id, category_code);

-- Enable RLS (same pattern as other tables)
ALTER TABLE public.budget_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON public.budget_line_items FOR ALL USING (true);

-- Verify
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'budget_line_items';
