import writeExcelFile from "write-excel-file/node";

import { buildAccountingRows } from "./accounting-csv.js";

const SECTION_TITLES = {
  payments: "支付方式汇总 / Payment Method Summary",
  daily: "每日汇总 / Daily Summary",
  ledger: "已结账订单账簿 / Paid Order Ledger"
};

const MONEY_METRIC_PATTERN = /小计|优惠|净销售额|税额|服务费|营业额|订单总额|收款金额|找零|保留现金|实收入账|订单结算额|待退款|对账差异|客单价|Subtotal|Discount|Net sales|Tax|Service charge|Revenue|Order total|Tendered|Change due|Retained cash|Recorded income|Settled amount|Refund due|Reconciliation difference|Average ticket/i;

function sectionIndex(rows, title) {
  return rows.findIndex((row) => row[0] === title);
}

function withoutOuterBlanks(rows) {
  let start = 0;
  let end = rows.length;
  while (start < end && rows[start].length === 0) start += 1;
  while (end > start && rows[end - 1].length === 0) end -= 1;
  return rows.slice(start, end);
}

export function buildAccountingWorkbookSheets(options) {
  const rows = buildAccountingRows(options);
  const paymentIndex = sectionIndex(rows, SECTION_TITLES.payments);
  const dailyIndex = sectionIndex(rows, SECTION_TITLES.daily);
  const ledgerIndex = sectionIndex(rows, SECTION_TITLES.ledger);
  if (paymentIndex < 0 || dailyIndex < 0 || ledgerIndex < 0) {
    throw new Error("Accounting export sections are incomplete");
  }
  return [
    {
      name: "说明与汇总 Summary",
      rows: withoutOuterBlanks(rows.slice(0, paymentIndex)),
      stickyRowsCount: 1
    },
    {
      name: "支付对账 Payments",
      rows: withoutOuterBlanks(rows.slice(paymentIndex + 1, dailyIndex)),
      stickyRowsCount: 1
    },
    {
      name: "每日汇总 Daily",
      rows: withoutOuterBlanks(rows.slice(dailyIndex + 1, ledgerIndex)),
      stickyRowsCount: 1
    },
    {
      name: "订单账簿 Orders",
      rows: withoutOuterBlanks(rows.slice(ledgerIndex + 1)),
      stickyRowsCount: 1
    }
  ];
}

function isHeaderRow(row, rowIndex, sheetIndex) {
  if (sheetIndex > 0) return rowIndex === 0;
  return row[0] === "项目 / Metric";
}

function isSectionRow(row) {
  return row.length === 1 && Boolean(row[0]);
}

function moneyColumnsFor(rows, sheetIndex) {
  if (sheetIndex === 0) return new Set();
  const header = rows[0] || [];
  return new Set(header
    .map((value, index) => String(value || "").includes("(") && MONEY_METRIC_PATTERN.test(String(value || "")) ? index : -1)
    .filter((index) => index >= 0));
}

function styleSheetRows(rows, sheetIndex) {
  const moneyColumns = moneyColumnsFor(rows, sheetIndex);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  return rows.map((row, rowIndex) => {
    const header = isHeaderRow(row, rowIndex, sheetIndex);
    const section = isSectionRow(row);
    if (section) {
      return [
        {
          value: row[0],
          type: String,
          columnSpan: columnCount,
          borderColor: "#7F1D1D",
          borderStyle: "thin",
          alignVertical: "center",
          wrap: true,
          fontWeight: "bold",
          fontSize: rowIndex === 0 ? 16 : 13,
          textColor: "#FFFFFF",
          backgroundColor: rowIndex === 0 ? "#7F1D1D" : "#991B1B",
          height: rowIndex === 0 ? 30 : 24
        },
        ...Array.from({ length: columnCount - 1 }, () => null)
      ];
    }
    return row.map((value, columnIndex) => {
      const base = {
        value,
        borderColor: "#D8DEE6",
        borderStyle: "thin",
        alignVertical: "center",
        wrap: true
      };
      if (header) {
        return {
          ...base,
          fontWeight: "bold",
          textColor: "#FFFFFF",
          backgroundColor: "#374151",
          align: columnIndex === 0 ? "left" : "center",
          height: 34
        };
      }
      if (typeof value === "number") {
        const overviewMetric = sheetIndex === 0 && MONEY_METRIC_PATTERN.test(String(row[0] || ""));
        const isMoney = (overviewMetric && columnIndex === 1) || moneyColumns.has(columnIndex);
        const headerValue = sheetIndex === 0 ? row[0] : rows[0]?.[columnIndex];
        const needsAttention = value !== 0 && /待退款|对账差异|Refund due|Reconciliation difference/i.test(String(headerValue || ""));
        return {
          ...base,
          align: "right",
          format: isMoney ? "#,##0.00" : "#,##0",
          fontWeight: needsAttention ? "bold" : undefined,
          textColor: needsAttention ? "#991B1B" : undefined,
          backgroundColor: needsAttention ? "#FEE2E2" : undefined
        };
      }
      return {
        ...base,
        type: String,
        align: "left",
        backgroundColor: rowIndex % 2 === 0 && !header ? "#F8FAFC" : undefined
      };
    });
  });
}

function columnWidths(sheetIndex) {
  if (sheetIndex === 0) return [34, 24, 78].map((width) => ({ width }));
  if (sheetIndex === 1) return [26, 20, 14, 18, 18, 18, 20, 20].map((width) => ({ width }));
  if (sheetIndex === 2) return [
    14, 15, 15, 14, 14, 16,
    ...Array.from({ length: 13 }, () => 20)
  ].map((width) => ({ width }));
  return [
    14, 22, 21, 21, 20, 12, 14, 26, 20,
    ...Array.from({ length: 13 }, () => 18),
    30, 42
  ].map((width) => ({ width }));
}

export async function buildAccountingXlsx(options) {
  const sheets = buildAccountingWorkbookSheets(options);
  return writeExcelFile(
    sheets.map((sheet, sheetIndex) => ({
      data: styleSheetRows(sheet.rows, sheetIndex),
      sheet: sheet.name,
      columns: columnWidths(sheetIndex),
      stickyRowsCount: sheet.stickyRowsCount,
      stickyColumnsCount: sheetIndex === 3 ? 2 : 1,
      showGridLines: false,
      orientation: sheetIndex >= 2 ? "landscape" : "portrait",
      zoomScale: sheetIndex === 3 ? 0.8 : 0.95
    })),
    {
      fontFamily: "Arial",
      fontSize: 10
    }
  ).toBuffer();
}
