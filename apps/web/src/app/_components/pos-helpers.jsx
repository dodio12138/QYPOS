"use client";

export { api, API_URL, labelOf } from "../../lib/api";

export function text(locale, zh, en) { return locale === "en-GB" ? en : zh; }

export function money(value, currency = "CNY", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value || 0));
}

export function aggregateModifiers(modifiers = []) {
  const grouped = new Map();
  for (const modifier of modifiers) {
    const key = modifier.modifier_id || `${JSON.stringify(modifier.name_i18n)}:${modifier.price_delta}`;
    const current = grouped.get(key);
    if (current) current.count += 1;
    else grouped.set(key, { ...modifier, count: 1 });
  }
  return [...grouped.values()];
}

export const statusText = {
  "zh-CN": { available:"空桌", opened:"已下单", ordered:"已下单", preparing:"制作中", ready_to_serve:"待上菜", partially_served:"部分上菜", pending_payment:"待支付", needs_cleaning:"需清台" },
  "en-GB": { available:"Available", opened:"Ordered", ordered:"Ordered", preparing:"Preparing", ready_to_serve:"Ready to serve", partially_served:"Partially served", pending_payment:"Pending payment", needs_cleaning:"Needs cleaning" }
};

export function statusLabel(status, locale) { return statusText[locale]?.[status] || status; }

export const UI_COPY = {
  "zh-CN": { posTitle:"点餐前台", adminLink:"后台", refresh:"刷新", refreshing:"刷新中", takeaway:"外带", tabletMode:"平板模式", desktopMode:"桌面模式", logout:"退出", language:"中文" },
  "en-GB": { posTitle:"POS", adminLink:"Admin", refresh:"Refresh", refreshing:"Refreshing", takeaway:"Takeaway", tabletMode:"Tablet mode", desktopMode:"Desktop mode", logout:"Sign out", language:"English" }
};
