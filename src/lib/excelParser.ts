import * as XLSX from 'xlsx';
import { COMPANY_CONFIG, BUDGET_COLS, ACTUAL_COLS } from './companyConfig';

export interface ParsedLineItem {
  category_code: string;
  dept_code: string | null;
  item_code: string | null;
  param_code: string | null;
  row_type: 'total' | 'dept' | 'item' | 'param';
  label: string;
  monthly_budget: number[];
  monthly_actual: number[];
  unit_type: string;
}

export interface ParsedExcelData {
  companyCode: string;
  fiscalYear: number;
  lineItems: ParsedLineItem[];
  activeMonth: number; // 0-based index of last month with actual data
}

function readRow(ws: XLSX.WorkSheet, row: number, cols: number[], noRound = false): number[] {
  return cols.map(colIdx => {
    const cellAddress = XLSX.utils.encode_cell({ r: row - 1, c: colIdx });
    const cell = ws[cellAddress];
    if (!cell) return 0;
    const val = cell.v;
    if (typeof val !== 'number') return 0;
    return noRound ? val : Math.round(val);
  });
}

export function parseExcelFile(
  buffer: ArrayBuffer,
  companyCode: string,
  fiscalYear: number
): ParsedExcelData {
  const workbook = XLSX.read(buffer, { type: 'array', cellFormula: false });

  const config = COMPANY_CONFIG[companyCode];
  if (!config) throw new Error(`No config for company ${companyCode}`);

  const ws = workbook.Sheets[config.sheet];
  if (!ws) throw new Error(`Sheet "${config.sheet}" not found in workbook`);

  const lineItems: ParsedLineItem[] = [];

  for (const [catCode, catConfig] of Object.entries(config.categories)) {
    // 1. TOTAL row
    const totalBudget = readRow(ws, catConfig.total.row, BUDGET_COLS);
    const totalActual = readRow(ws, catConfig.total.row, ACTUAL_COLS);
    lineItems.push({
      category_code: catCode,
      dept_code: null,
      item_code: null,
      param_code: null,
      row_type: 'total',
      label: catConfig.total.label,
      monthly_budget: totalBudget,
      monthly_actual: totalActual,
      unit_type: catConfig.total.unit ?? 'TL Karşılığı',
    });

    // 2. DEPT rows
    for (const dept of catConfig.depts) {
      const deptBudget = readRow(ws, dept.row, BUDGET_COLS);
      const deptActual = readRow(ws, dept.row, ACTUAL_COLS);
      lineItems.push({
        category_code: catCode,
        dept_code: dept.code,
        item_code: null,
        param_code: null,
        row_type: 'dept',
        label: dept.label,
        monthly_budget: deptBudget,
        monthly_actual: deptActual,
        unit_type: 'TL',
      });

      // 3. ITEM rows (within dept)
      if (dept.itemRows) {
        for (const item of dept.itemRows) {
          const itemBudget = readRow(ws, item.row, BUDGET_COLS);
          const itemActual = readRow(ws, item.row, ACTUAL_COLS);
          // Skip rows where both budget and actual are all zero
          if (itemBudget.every(v => v === 0) && itemActual.every(v => v === 0)) continue;
          lineItems.push({
            category_code: catCode,
            dept_code: dept.code,
            item_code: `${dept.code}_${item.row}`,
            param_code: null,
            row_type: 'item',
            label: item.label,
            monthly_budget: itemBudget,
            monthly_actual: itemActual,
            unit_type: item.unit ?? 'TL',
          });
        }
      }
    }

    // 4. PARAM rows
    for (const param of catConfig.params) {
      const paramBudget = readRow(ws, param.row, BUDGET_COLS, param.noRound);
      const paramActual = readRow(ws, param.row, ACTUAL_COLS, param.noRound);
      if (paramBudget.every(v => v === 0) && paramActual.every(v => v === 0)) continue;
      lineItems.push({
        category_code: catCode,
        dept_code: null,
        item_code: null,
        param_code: param.code,
        row_type: 'param',
        label: param.label,
        monthly_budget: paramBudget,
        monthly_actual: paramActual,
        unit_type: param.unit,
      });
    }
  }

  // Detect active month: last month index where ANY category has actual > 0
  const activeMonth = (() => {
    let last = -1;
    for (const item of lineItems) {
      if (item.row_type === 'total') {
        for (let i = 11; i >= 0; i--) {
          if (item.monthly_actual[i] > 0) {
            if (i > last) last = i;
            break;
          }
        }
      }
    }
    return last >= 0 ? last : 0;
  })();

  return { companyCode, fiscalYear, lineItems, activeMonth };
}

export function getLineItems(
  data: ParsedExcelData,
  categoryCode: string,
  rowType?: 'total' | 'dept' | 'item' | 'param',
  deptCode?: string
): ParsedLineItem[] {
  return data.lineItems.filter(item =>
    item.category_code === categoryCode &&
    (rowType === undefined || item.row_type === rowType) &&
    (deptCode === undefined || item.dept_code === deptCode)
  );
}
