export const tableStatuses = [
  "available",
  "opened",
  "ordered",
  "preparing",
  "ready_to_serve",
  "partially_served",
  "pending_payment",
  "needs_cleaning"
];

export const orderStatuses = ["draft", "submitted", "preparing", "ready", "paid", "cancelled"];

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateTotals(items, settings, overrides = {}) {
  const taxRate = Number(settings.tax_rate ?? settings.taxRate ?? 0);
  const serviceRate = Number(
    overrides.service_charge_rate ?? settings.service_charge_rate ?? settings.serviceChargeRate ?? 0
  );
  const pricesIncludeTax = Boolean(settings.prices_include_tax ?? settings.pricesIncludeTax);
  const serviceChargeExempt = Boolean(overrides.service_charge_exempt);
  const discount = roundMoney(overrides.discount ?? overrides.discount_amount ?? 0);

  const subtotal = roundMoney(
    items.reduce((sum, item) => {
      const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0);
      const quantity = Number(item.quantity ?? 1);
      const modifiers = item.modifiers ?? [];
      const modifierTotal = modifiers.reduce((modSum, mod) => modSum + Number(mod.price_delta ?? mod.priceDelta ?? 0), 0);
      return sum + (unitPrice + modifierTotal) * quantity;
    }, 0)
  );

  const discountedSubtotal = Math.max(0, roundMoney(subtotal - discount));
  const netSales = pricesIncludeTax ? roundMoney(discountedSubtotal / (1 + taxRate)) : discountedSubtotal;
  const tax = pricesIncludeTax ? roundMoney(discountedSubtotal - netSales) : roundMoney(discountedSubtotal * taxRate);
  const serviceChargeBase = pricesIncludeTax ? discountedSubtotal : roundMoney(discountedSubtotal + tax);
  const serviceCharge = serviceChargeExempt ? 0 : roundMoney(serviceChargeBase * serviceRate);
  const total = pricesIncludeTax ? roundMoney(discountedSubtotal + serviceCharge) : roundMoney(discountedSubtotal + tax + serviceCharge);

  return {
    subtotal,
    discount,
    netSales,
    tax,
    serviceCharge,
    total
  };
}

export function formatMoney(amount, currency = "CNY", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount || 0));
}
