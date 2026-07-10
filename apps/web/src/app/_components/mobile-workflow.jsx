"use client";
import { Armchair, ChevronLeft, ClipboardList, ShoppingBag } from "lucide-react";
import { text, money, statusText } from "./pos-helpers";
export default function MobileWorkflow({ step, order, tables, locale, currency, onBack, onStep }) {
  const steps = [
    { id: "tables", label: text(locale, "选台", "Tables"), icon: <Armchair size={17} /> },
    { id: "menu", label: text(locale, "点菜", "Menu"), icon: <Utensils size={17} /> },
    { id: "order", label: text(locale, "订单", "Order"), icon: <CircleDollarSign size={17} /> }
  ];
  const itemCount = (order?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const table = order?.table_id ? tables.find((item) => item.id === order.table_id) : null;
  const location = order?.service_type === "dine_in"
    ? text(locale, `桌台 ${table?.label || "-"}`, `Table ${table?.label || "-"}`)
    : text(locale, `外带 ${order?.pickup_no || "-"}`, `Takeaway ${order?.pickup_no || "-"}`);

  return (
    <nav className="mobile-workflow" aria-label={text(locale, "点餐步骤", "Ordering steps")}>
      <div className="mobile-workflow-top">
        <button type="button" className="mobile-back-btn" onClick={onBack} disabled={step === "tables"}>
          <ChevronLeft size={18} />
          <span>{text(locale, "返回", "Back")}</span>
        </button>
        <div className="mobile-order-chip">
          {order ? (
            <>
              <strong>{location} · {money(order.total, currency, locale)}</strong>
              <span>{itemCount} {text(locale, "件", "items")} · {statusText[locale]?.[order.status] || order.status}</span>
            </>
          ) : (
            <>
              <strong>{text(locale, "先选择桌台", "Select a table first")}</strong>
              <span>{text(locale, "或创建外带订单", "or create a takeaway order")}</span>
            </>
          )}
        </div>
      </div>
      <div className="mobile-step-tabs">
        {steps.map((item) => (
          <button
            key={item.id}
            type="button"
            className={step === item.id ? "selected" : ""}
            onClick={() => onStep(item.id)}
            disabled={item.id !== "tables" && !order}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// FloorMap imported from ./_components/floor-map

// PosLogin imported from ./_components/pos-login

