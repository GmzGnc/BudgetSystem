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

// Column K (0-based index 10) holds the row label / vehicle plate in Model Gider sheet
const COL_LABEL = 10;

function readRow(ws: XLSX.WorkSheet, row: number, cols: number[], noRound = false): number[] {
  return cols.map(colIdx => {
    const cellAddress = XLSX.utils.encode_cell({ r: row - 1, c: colIdx });
    const cell = ws[cellAddress];
    if (!cell) return 0;
    const raw = cell.v;
    // cell.v is normally a number, but some xlsx files store numeric cells as strings
    const val = typeof raw === 'number' ? raw : Number(raw);
    if (!isFinite(val)) return 0;
    return noRound ? val : Math.round(val);
  });
}

/** Read the text label from column K; returns empty string if missing. */
function readLabel(ws: XLSX.WorkSheet, row: number): string {
  const cellAddress = XLSX.utils.encode_cell({ r: row - 1, c: COL_LABEL });
  const cell = ws[cellAddress];
  if (!cell) return '';
  return String(cell.v ?? '').trim();
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
          // label: prefer actual Excel text (plate/name from col K); fall back to config label
          const plate = readLabel(ws, item.row) || item.label;
          lineItems.push({
            category_code: catCode,
            dept_code: dept.code,
            // item_code is row-based to guarantee uniqueness even when plates repeat
            item_code: `${dept.code}_r${item.row}`,
            param_code: null,
            row_type: 'item',
            label: plate,
            monthly_budget: itemBudget,
            monthly_actual: itemActual,
            unit_type: item.unit ?? 'TL',
          });
        }
      }

      // 3b. ITEM PAIRS — paired TL + Litre rows (e.g. arac_yakit vehicles)
      if (dept.itemPairs) {
        dept.itemPairs.forEach(([tlRow, litreRow], idx) => {
          const tlBudget = readRow(ws, tlRow, BUDGET_COLS);
          const tlActual = readRow(ws, tlRow, ACTUAL_COLS);
          if (tlBudget.every(v => v === 0) && tlActual.every(v => v === 0)) return;
          // label: plate from col K of the TL row; fall back to sequential name
          const plate = readLabel(ws, tlRow) || `Araç ${idx + 1}`;
          // item_code is row-based — guaranteed unique even when the same plate
          // appears in multiple rows (e.g. TL+Litre of the same vehicle share the plate label)
          lineItems.push({
            category_code: catCode,
            dept_code:  dept.code,
            item_code:  `${dept.code}_r${tlRow}`,
            param_code: null,
            row_type:   'item',
            label:      plate,
            monthly_budget: tlBudget,
            monthly_actual: tlActual,
            unit_type: 'TL',
          });
          const litreBudget = readRow(ws, litreRow, BUDGET_COLS);
          const litreActual = readRow(ws, litreRow, ACTUAL_COLS);
          if (!litreBudget.every(v => v === 0) || !litreActual.every(v => v === 0)) {
            lineItems.push({
              category_code: catCode,
              dept_code:  dept.code,
              item_code:  `${dept.code}_r${litreRow}_l`,
              param_code: null,
              row_type:   'item',
              label:      `${plate} (Litre)`,
              monthly_budget: litreBudget,
              monthly_actual: litreActual,
              unit_type: 'Litre',
            });
          }
        });
      }
    }

    // 4. PARAM rows
    for (const param of catConfig.params) {
      const paramBudget = readRow(ws, param.row, BUDGET_COLS, param.noRound);
      const paramActual = readRow(ws, param.row, ACTUAL_COLS, param.noRound);
      if (paramBudget.every(v => v === 0) && paramActual.every(v => v === 0)) continue;
      lineItems.push({
        category_code: catCode,
        dept_code: param.deptCode ?? null,
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
