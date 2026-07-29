function numberOf(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function moneyNumber(value) {
  return Math.round((numberOf(value) + Number.EPSILON) * 100) / 100;
}

function localDateKey(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value || "").slice(0, 10);
}

function timestampCell(value, timeZone) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(date).replace(",", "");
}

function bilingualPaymentMethod(method) {
  const labels = {
    cash: "现金 / Cash",
    card: "银行卡 / Card",
    complimentary: "免单 / Complimentary",
    zero: "零元结账 / Zero-value checkout"
  };
  return labels[method] || `${method || "未知"} / ${method || "Unknown"}`;
}

function bilingualServiceType(serviceType) {
  const labels = {
    dine_in: "堂食 / Dine-in",
    takeaway: "外带 / Takeaway"
  };
  return labels[serviceType] || `${serviceType || "未知"} / ${serviceType || "Unknown"}`;
}

function paymentProviderLabel(provider) {
  return !provider || provider === "manual" ? "手工 / Manual" : provider;
}

function paymentMethodList(methods) {
  return String(methods || "")
    .split("+")
    .map((method) => method.trim())
    .filter(Boolean)
    .map(bilingualPaymentMethod)
    .join(" + ");
}

function preventSpreadsheetFormula(value) {
  const text = String(value ?? "");
  return /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

export function serializeCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map((cell) => {
    if (typeof cell === "number" && Number.isFinite(cell)) return String(cell);
    const text = preventSpreadsheetFormula(cell).replaceAll('"', '""');
    return `"${text}"`;
  }).join(",")).join("\r\n")}`;
}

function accountingValues(order) {
  const tendered = moneyNumber(order.tendered_amount);
  const changeDue = moneyNumber(order.change_due);
  const retained = moneyNumber(order.retained_amount);
  const total = moneyNumber(order.total);
  const recordedIncome = moneyNumber(tendered - changeDue);
  const settledAmount = moneyNumber(recordedIncome - retained);
  const refundDue = moneyNumber(Math.max(0, settledAmount - total));
  const reconciliationDifference = moneyNumber(settledAmount - total - refundDue);
  return {
    tendered,
    changeDue,
    retained,
    recordedIncome,
    settledAmount,
    refundDue,
    reconciliationDifference
  };
}

function buildDailyRows(orderRows) {
  const days = new Map();
  for (const order of orderRows) {
    const day = localDateKey(order.business_day || order.created_at);
    const payment = accountingValues(order);
    const current = days.get(day) || {
      day,
      orders: 0,
      complimentary_orders: 0,
      dine_in_orders: 0,
      takeaway_orders: 0,
      items_sold: 0,
      subtotal: 0,
      discount: 0,
      net_sales: 0,
      tax: 0,
      service_charge: 0,
      total: 0,
      recorded_income: 0,
      retained_amount: 0,
      settled_amount: 0,
      refund_due: 0,
      reconciliation_difference: 0,
      non_zero_orders: 0
    };
    current.orders += 1;
    current.complimentary_orders += order.is_complimentary ? 1 : 0;
    current.dine_in_orders += order.service_type === "dine_in" ? 1 : 0;
    current.takeaway_orders += order.service_type === "takeaway" ? 1 : 0;
    current.items_sold += numberOf(order.items_sold);
    current.subtotal += numberOf(order.subtotal);
    current.discount += numberOf(order.discount);
    current.net_sales += numberOf(order.net_sales);
    current.tax += numberOf(order.tax);
    current.service_charge += numberOf(order.service_charge);
    current.total += numberOf(order.total);
    current.recorded_income += payment.recordedIncome;
    current.retained_amount += payment.retained;
    current.settled_amount += payment.settledAmount;
    current.refund_due += payment.refundDue;
    current.reconciliation_difference += payment.reconciliationDifference;
    current.non_zero_orders += numberOf(order.total) > 0 ? 1 : 0;
    days.set(day, current);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function sumOrderAccounting(orderRows) {
  return orderRows.reduce((total, order) => {
    const payment = accountingValues(order);
    total.tendered += payment.tendered;
    total.changeDue += payment.changeDue;
    total.retained += payment.retained;
    total.recordedIncome += payment.recordedIncome;
    total.settledAmount += payment.settledAmount;
    total.refundDue += payment.refundDue;
    total.reconciliationDifference += payment.reconciliationDifference;
    return total;
  }, {
    tendered: 0,
    changeDue: 0,
    retained: 0,
    recordedIncome: 0,
    settledAmount: 0,
    refundDue: 0,
    reconciliationDifference: 0
  });
}

function summaryRow(label, value, definition) {
  return [label, value, definition];
}

export function buildAccountingRows({
  report,
  orderRows = [],
  paymentRows = [],
  settings = {},
  generatedAt = new Date(),
  timeZone = "Europe/London"
}) {
  const currency = String(settings.currency || "GBP").toUpperCase();
  const taxMode = settings.prices_include_tax
    ? "标价含税 / Tax included in listed prices"
    : "标价未含税 / Tax added to listed prices";
  const orderAccounting = sumOrderAccounting(orderRows);
  const dailyRows = buildDailyRows(orderRows);
  const summary = report.summary || {};
  const rows = [
    ["QYPOS 会计销售导出 / Accounting Sales Export"],
    ["报表期间 / Report period", report.from, report.to],
    ["币种 / Currency", currency],
    ["税务模式 / Tax mode", taxMode],
    ["时区 / Time zone", timeZone],
    ["日期口径 / Date basis", "按订单创建日期筛选；逐单账簿同时提供结账时间 / Filtered by order creation date; paid time is also included in the order ledger"],
    ["计入范围 / Scope", "仅统计已结账订单；取消单、草稿单、进行中订单及分单父单不计入 / Paid orders only; cancelled, draft, open, and split-parent orders are excluded"],
    ["生成时间 / Generated at", timestampCell(generatedAt, timeZone)],
    [],
    ["数据关系说明 / Data relationships"],
    ["订单总额 / Order total", "净销售额 + 税额 + 服务费 / Net sales + tax + service charge"],
    ["实收入账 / Recorded income", "收款金额 - 找零 / Tendered amount - change due"],
    ["订单结算额 / Settled amount", "实收入账 - 保留现金 / Recorded income - retained cash"],
    ["待退款 / Refund due", "MAX(订单结算额 - 当前订单总额, 0) / MAX(Settled amount - current order total, 0)"],
    ["对账差异 / Reconciliation difference", "订单结算额 - 当前订单总额 - 待退款；正常应为 0 / Settled amount - current order total - refund due; expected to be 0"],
    ["客单价 / Average ticket", "营业额 ÷ 非零已结账订单数；0 元免单不进入除数 / Revenue ÷ non-zero paid orders; zero-value complimentary orders are excluded from the divisor"],
    [],
    ["会计汇总 / Accounting Summary"],
    ["项目 / Metric", "数值 / Value", "关系与口径 / Relationship & definition"],
    summaryRow("已结账订单数 / Paid orders", numberOf(summary.orders), "包含 0 元免单；仅 status=paid / Includes zero-value complimentary orders; status=paid only"),
    summaryRow("免单数 / Complimentary orders", numberOf(summary.complimentary_orders), "已结账且支付方式包含 complimentary / Paid orders with a complimentary payment"),
    summaryRow("菜品份数 / Items sold", numberOf(summary.items_sold), "已结账订单内 order_items.quantity 合计 / Sum of order_items.quantity in paid orders"),
    summaryRow("堂食订单 / Dine-in orders", numberOf(summary.dine_in_orders), "已结账堂食订单 / Paid dine-in orders"),
    summaryRow("外带订单 / Takeaway orders", numberOf(summary.takeaway_orders), "已结账外带订单 / Paid takeaway orders"),
    summaryRow("小计 / Subtotal", moneyNumber(summary.subtotal), "优惠前菜品及加料金额 / Items and modifiers before discounts"),
    summaryRow("优惠 / Discount", moneyNumber(summary.discount), "小计与折后金额之间的减免 / Reduction from the pre-discount subtotal"),
    summaryRow("净销售额 / Net sales", moneyNumber(summary.net_sales), "不含税销售额 / Sales excluding tax"),
    summaryRow("税额 / Tax", moneyNumber(summary.tax), taxMode),
    summaryRow("服务费 / Service charge", moneyNumber(summary.service_charge), "订单服务费合计 / Sum of order service charges"),
    summaryRow("营业额 / Revenue", moneyNumber(summary.revenue), "当前订单总额合计 = 净销售额 + 税额 + 服务费 / Sum of current order totals = net sales + tax + service charge"),
    summaryRow("收款金额 / Tendered amount", moneyNumber(orderAccounting.tendered), "支付记录 amount 合计 / Sum of payment amount"),
    summaryRow("找零 / Change due", moneyNumber(orderAccounting.changeDue), "退还客人的现金 / Cash returned to customers"),
    summaryRow("保留现金 / Retained cash", moneyNumber(orderAccounting.retained), "客人无需找零并计入实收的超额现金 / Excess cash retained when no change is requested"),
    summaryRow("实收入账 / Recorded income", moneyNumber(orderAccounting.recordedIncome), "收款金额 - 找零 / Tendered amount - change due"),
    summaryRow("订单结算额 / Settled amount", moneyNumber(orderAccounting.settledAmount), "实收入账 - 保留现金 / Recorded income - retained cash"),
    summaryRow("待退款 / Refund due", moneyNumber(orderAccounting.refundDue), "付款后调低订单金额形成的应退差额 / Amount due back after a paid order is reduced"),
    summaryRow("对账差异 / Reconciliation difference", moneyNumber(orderAccounting.reconciliationDifference), "正常应为 0；非 0 需核查付款记录 / Expected 0; investigate payment records when non-zero"),
    summaryRow("客单价 / Average ticket", moneyNumber(summary.average_ticket), "营业额 ÷ 非零已结账订单数 / Revenue ÷ non-zero paid orders"),
    [],
    ["支付方式汇总 / Payment Method Summary"],
    [
      "支付方式 / Payment method",
      "支付渠道 / Provider",
      "交易笔数 / Transactions",
      `收款金额 / Tendered (${currency})`,
      `找零 / Change due (${currency})`,
      `保留现金 / Retained cash (${currency})`,
      `实收入账 / Recorded income (${currency})`,
      `订单结算额 / Settled amount (${currency})`
    ],
    ...paymentRows.map((payment) => [
      bilingualPaymentMethod(payment.method),
      paymentProviderLabel(payment.provider),
      numberOf(payment.transactions),
      moneyNumber(payment.tendered_amount),
      moneyNumber(payment.change_due),
      moneyNumber(payment.retained_amount),
      moneyNumber(numberOf(payment.tendered_amount) - numberOf(payment.change_due)),
      moneyNumber(numberOf(payment.tendered_amount) - numberOf(payment.change_due) - numberOf(payment.retained_amount))
    ]),
    [],
    ["每日汇总 / Daily Summary"],
    [
      "日期 / Date",
      "已结账订单 / Paid orders",
      "免单 / Complimentary",
      "堂食 / Dine-in",
      "外带 / Takeaway",
      "菜品份数 / Items sold",
      `小计 / Subtotal (${currency})`,
      `优惠 / Discount (${currency})`,
      `净销售额 / Net sales (${currency})`,
      `税额 / Tax (${currency})`,
      `服务费 / Service charge (${currency})`,
      `订单总额 / Order total (${currency})`,
      `实收入账 / Recorded income (${currency})`,
      `保留现金 / Retained cash (${currency})`,
      `待退款 / Refund due (${currency})`,
      `对账差异 / Reconciliation difference (${currency})`,
      `客单价 / Average ticket (${currency})`
    ],
    ...dailyRows.map((day) => [
      day.day,
      day.orders,
      day.complimentary_orders,
      day.dine_in_orders,
      day.takeaway_orders,
      day.items_sold,
      moneyNumber(day.subtotal),
      moneyNumber(day.discount),
      moneyNumber(day.net_sales),
      moneyNumber(day.tax),
      moneyNumber(day.service_charge),
      moneyNumber(day.total),
      moneyNumber(day.recorded_income),
      moneyNumber(day.retained_amount),
      moneyNumber(day.refund_due),
      moneyNumber(day.reconciliation_difference),
      moneyNumber(day.non_zero_orders ? day.total / day.non_zero_orders : 0)
    ]),
    [],
    ["已结账订单账簿 / Paid Order Ledger"],
    [
      "业务日期 / Business date",
      "订单号 / Order no.",
      "下单时间 / Created at",
      "结账时间 / Paid at",
      "服务类型 / Service type",
      "客人数 / Guests",
      "菜品份数 / Items sold",
      "支付方式 / Payment methods",
      "支付渠道 / Providers",
      `小计 / Subtotal (${currency})`,
      `优惠 / Discount (${currency})`,
      `净销售额 / Net sales (${currency})`,
      `税额 / Tax (${currency})`,
      `服务费 / Service charge (${currency})`,
      `订单总额 / Order total (${currency})`,
      `收款金额 / Tendered (${currency})`,
      `找零 / Change due (${currency})`,
      `保留现金 / Retained cash (${currency})`,
      `实收入账 / Recorded income (${currency})`,
      `订单结算额 / Settled amount (${currency})`,
      `待退款 / Refund due (${currency})`,
      `对账差异 / Reconciliation difference (${currency})`,
      "优惠或调整原因 / Discount or adjustment reason",
      "订单备注 / Order notes"
    ],
    ...orderRows.map((order) => {
      const payment = accountingValues(order);
      return [
        localDateKey(order.business_day || order.created_at),
        order.order_no,
        timestampCell(order.created_at, timeZone),
        timestampCell(order.paid_at, timeZone),
        bilingualServiceType(order.service_type),
        numberOf(order.guests),
        numberOf(order.items_sold),
        paymentMethodList(order.payment_methods),
        String(order.payment_providers || "")
          .split("+")
          .map((provider) => paymentProviderLabel(provider.trim()))
          .filter(Boolean)
          .join(" + "),
        moneyNumber(order.subtotal),
        moneyNumber(order.discount),
        moneyNumber(order.net_sales),
        moneyNumber(order.tax),
        moneyNumber(order.service_charge),
        moneyNumber(order.total),
        payment.tendered,
        payment.changeDue,
        payment.retained,
        payment.recordedIncome,
        payment.settledAmount,
        payment.refundDue,
        payment.reconciliationDifference,
        order.discount_reason || "",
        order.notes || ""
      ];
    })
  ];

  return rows;
}

export function buildAccountingCsv(options) {
  return serializeCsv(buildAccountingRows(options));
}
