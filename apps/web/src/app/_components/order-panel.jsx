"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Coins, Loader2, LogOut, Minus, Pencil, Plus, Printer, ShoppingBag, Trash2, Users, X } from "lucide-react";
import { text, money, statusLabel } from "./pos-helpers";
import { api, labelOf } from "../../lib/api";
import VoidableOrderLine from "./voidable-order-line";
import DiscountAdminModal from "./discount-admin-modal";
export default function OrderPanel({ order, orders, tables, locale, currency, user, onSelectOrder, onQuantity, onEditItem, onSaveNotes, onSubmit, onPrintBill, onPay, onSplit, onMerge, onAdjustService, onDiscount, onCancelOrder, onExit, busy }) {
  const [notes, setNotes] = useState("");
  const [discountRate, setDiscountRate] = useState("");
  const [discountAmt, setDiscountAmt] = useState("");
  const [serviceRate, setServiceRate] = useState("0.15");
  const [cancelReason, setCancelReason] = useState("");
  const [orderFilter, setOrderFilter] = useState("active");
  const [voidMode, setVoidMode] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const canVoid = Boolean(user?.permissions?.includes("manage_orders"));
  const orderPageSize = 20;

  useEffect(() => { setVoidMode(false); setVoidReason(""); }, [order?.id]);

  useEffect(() => setNotes(order?.notes || ""), [order?.id, order?.notes]);
  useEffect(() => {
    setDiscountRate(order?.discount_rate != null ? String(order.discount_rate) : "");
    setDiscountAmt(Number(order?.discount_fixed) > 0 ? String(order.discount_fixed) : "");
    setServiceRate(String(order?.service_charge_rate ?? 0.15));
  }, [order?.id, order?.discount_rate, order?.discount_fixed, order?.service_charge_rate]);

  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (item) => new Date(item.created_at).toDateString() === today
  );
  const filteredOrders = todayOrders.filter((item) => {
    if (orderFilter === "active") return !["paid", "cancelled", "split"].includes(item.status);
    if (orderFilter === "paid") return item.status === "paid";
    return item.status !== "split"; // "all" — split parent orders are historical noise
  });
  const totalOrderPages = Math.max(1, Math.ceil(filteredOrders.length / orderPageSize));
  const pagedOrders = filteredOrders.slice((orderPage - 1) * orderPageSize, orderPage * orderPageSize);
  const tableById = new Map(tables.map((table) => [table.id, table]));

  useEffect(() => {
    setOrderPage(1);
    setOrderPage((current) => Math.min(current, totalOrderPages));
  }, [totalOrderPages]);

  function orderLocation(targetOrder) {
    if (targetOrder.service_type === "dine_in") {
      return text(locale, `桌台 ${tableById.get(targetOrder.table_id)?.label || "-"}`, `Table ${tableById.get(targetOrder.table_id)?.label || "-"}`);
    }
    return text(locale, `外带 ${targetOrder.pickup_no || "-"}`, `Takeaway ${targetOrder.pickup_no || "-"}`);
  }

  const rateDiscAmt = order?.discount_rate != null
    ? Math.min(Number(order.subtotal ?? 0), Math.max(0, Math.round((Number(order.subtotal ?? 0) * (1 - Number(order.discount_rate) / 10) + 1e-10) * 100) / 100))
    : 0;

  return (
    <section className="panel order-panel">
      <div className="panel-title split">
        <div className="inline-title">
          <ClipboardList size={18} />
            <h2>{order ? order.order_no : text(locale, "当前订单", "Current order")}</h2>
        </div>
        <div className="inline-title">
          {order && <span className="order-location-tag">{orderLocation(order)}</span>}
          {order && <button className="icon-btn" onClick={onExit} title={text(locale, "退出订单", "Exit order")}><X size={18} /></button>}
        </div>
      </div>

      {!order && (
        <>
          <div className="order-filter-bar">
            <button className={orderFilter === "active" ? "selected" : ""} onClick={() => setOrderFilter("active")}>{text(locale, "已下单", "Open")}</button>
            <button className={orderFilter === "paid" ? "selected" : ""} onClick={() => setOrderFilter("paid")}>{text(locale, "已付款", "Paid")}</button>
            <button className={orderFilter === "all" ? "selected" : ""} onClick={() => setOrderFilter("all")}>{text(locale, "当日全部", "All today")}</button>
          </div>
          <div className="quick-orders">
            {filteredOrders.length === 0 && <div className="empty" style={{fontSize:13}}>{text(locale, "暂无订单", "No orders yet")}</div>}
            {pagedOrders.map((item) => (
              <button key={item.id} onClick={() => onSelectOrder(item.id)}
                className={["paid","cancelled"].includes(item.status) ? "order-done" : ""}>
                <span>
                  <strong>{item.order_no}</strong>
                  <small>{orderLocation(item)}</small>
                </span>
                <em className={`status-chip status-${item.status}`}>{statusLabel(item.status, locale)}</em>
                <b>{money(item.total, currency, locale)}</b>
              </button>
            ))}
          </div>
          {filteredOrders.length > orderPageSize && (
            <div className="quick-orders-pagination">
              <button type="button" onClick={() => setOrderPage((current) => Math.max(1, current - 1))} disabled={orderPage <= 1}>{text(locale, "上一页", "Previous")}</button>
              <span>{orderPage} / {totalOrderPages}</span>
              <button type="button" onClick={() => setOrderPage((current) => Math.min(totalOrderPages, current + 1))} disabled={orderPage >= totalOrderPages}>{text(locale, "下一页", "Next")}</button>
            </div>
          )}
        </>
      )}

      {order && (
        <>
          <div className="order-meta">
            <span>{orderLocation(order)}</span>
            <span>{order.service_type === "dine_in" ? text(locale, "堂食", "Dine in") : text(locale, "外带", "Takeaway")}</span>
            <span>{statusLabel(order.status, locale)}</span>
          </div>
          <div className="order-lines">
            {(order.items || []).map((item) => {
              const locked = Boolean(item.kitchen_printed_at);
              const canVoidThis = locked && voidMode && canVoid;
              return (
              <VoidableOrderLine
                key={item.id}
                item={item}
                locale={locale}
                currency={currency}
                locked={locked}
                canVoidThis={canVoidThis}
                voidReason={voidReason}
                onQuantity={onQuantity}
                onEditItem={onEditItem}
                onVoidDone={() => { setVoidMode(false); setVoidReason(""); }}
              />);
            })}
          </div>
          <label className="notes-box">
            {text(locale, "订单备注", "Order notes")}
            <input value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => onSaveNotes(notes)} placeholder={text(locale, "少盐、打包、过敏等", "Less salt, takeaway, allergy notes, etc.")} />
          </label>
          <div className="totals">
            <span>{text(locale, "小计", "Subtotal")} <b>{money(order.subtotal, currency, locale)}</b></span>
            {order.discount_rate != null && (
              <span>
                {text(locale, "折扣", "Discount")} {order.discount_rate}折<b> -{money(rateDiscAmt, currency, locale)}</b>
                <button type="button" style={{marginLeft:"6px",fontSize:"11px",padding:"1px 6px",cursor:"pointer"}} onClick={() => onDiscount({ discount_rate: null })}>{text(locale, "撤销", "Undo")}</button>
              </span>
            )}
            {Number(order.discount_fixed) > 0 && (
              <span>
                {text(locale, "优惠减额", "Fixed discount")}<b> -{money(order.discount_fixed, currency, locale)}</b>
                <button type="button" style={{marginLeft:"6px",fontSize:"11px",padding:"1px 6px",cursor:"pointer"}} onClick={() => onDiscount({ discount_fixed: 0 })}>{text(locale, "撤销", "Undo")}</button>
              </span>
            )}
            <span>{text(locale, "税费", "Tax")} <b>{money(order.tax, currency, locale)}</b></span>
            <span>{text(locale, "服务费", "Service")} <b>{money(order.service_charge, currency, locale)}</b></span>
            <strong>{text(locale, "合计", "Total")} <b>{money(order.total, currency, locale)}</b></strong>
          </div>
          <details className="admin-adjustments">
            <summary>{text(locale, "权限操作", "Manager actions")}</summary>
            <div className="adjustment-grid">
              <div className="adjust-row">
                <label>{text(locale, "折扣率（折）", "Discount rate (x/10)")}
                  <input type="number" min="0" max="10" step="0.1" value={discountRate} onChange={(event) => setDiscountRate(event.target.value)} placeholder={text(locale, "如 8.8", "e.g. 8.8")} />
                </label>
                <button type="button" onClick={() => {
                  const rate = parseFloat(discountRate);
                  if (isNaN(rate) || rate < 0 || rate > 10) return;
                  onDiscount({ discount_rate: rate, reason: "front desk adjustment" });
                }}>{text(locale, "应用折扣", "Apply discount")}</button>
              </div>

              <div className="adjust-row">
                <label>{text(locale, "优惠金额", "Discount amount")}
                  <input type="number" min="0" step="0.01" value={discountAmt} onChange={(event) => setDiscountAmt(event.target.value)} placeholder={text(locale, "减免金额", "Amount to reduce")} />
                </label>
                <button type="button" onClick={() => {
                  const amt = parseFloat(discountAmt);
                  if (isNaN(amt) || amt < 0) return;
                  onDiscount({ discount_fixed: amt, reason: "front desk adjustment" });
                }}>{text(locale, "减免优惠", "Apply fixed discount")}</button>
              </div>

              <div className="adjust-row">
                <label>{text(locale, "服务费率", "Service charge rate")}
                  <input type="number" step="0.001" value={serviceRate} onChange={(event) => setServiceRate(event.target.value)} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => onAdjustService({ service_charge_rate: Number(serviceRate), service_charge_exempt: false, reason: "front desk adjustment" })}>{text(locale, "更新服务费", "Update service charge")}</button>
                  <button type="button" onClick={() => onAdjustService({ service_charge_exempt: true, reason: "front desk exempt" })}>{text(locale, "豁免服务费", "Exempt service charge")}</button>
                </div>
              </div>

              <div className="adjust-row">
                <label>{text(locale, "取消原因", "Cancel reason")}
                  <input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder={text(locale, "客人取消、输错单等", "Guest cancelled, entered wrong order, etc.")} />
                </label>
                <button type="button" onClick={() => onCancelOrder(cancelReason || "front desk cancel")}>{text(locale, "取消订单", "Cancel order")}</button>
              </div>

              {canVoid && (
                <div className="adjust-row">
                  <label>{text(locale, "退菜原因", "Void reason")}
                    <input value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder={text(locale, "客人退菜、制作错误等", "Guest return, kitchen mistake, etc.")} />
                  </label>
                  <button type="button" className={voidMode ? "primary" : ""} onClick={() => setVoidMode((v) => !v)}>
                    {voidMode ? text(locale, "退出退菜模式", "Exit void mode") : text(locale, "退菜模式", "Void mode")}
                  </button>
                </div>
              )}
            </div>
          </details>
          <div className="action-row sticky-actions">
            <button onClick={onSubmit} disabled={busy || !(order.items || []).length || order.status === "split"}>
              <Printer size={18} />
              <span>{text(locale, "厨房下单", "Send to kitchen")}</span>
            </button>
            <button onClick={onPrintBill} disabled={busy || !(order.items || []).length}>
              <ClipboardList size={18} />
              <span>{text(locale, "账单", "Bill")}</span>
            </button>
            {order.parent_order_id && (
              <button onClick={onMerge} disabled={busy}>
                <Users size={18} />
                <span>{text(locale, "合单", "Merge")}</span>
              </button>
            )}
            {!order.parent_order_id && order.status !== "split" && (
              <button onClick={() => onSplit("items")} disabled={busy || !(order.items || []).length}>
                <Users size={18} />
                <span>{text(locale, "分单", "Split")}</span>
              </button>
            )}
            {order.status !== "split" && (
              <>
                <button onClick={() => onSplit("even")} disabled={busy || !(order.items || []).length}>
                  <Coins size={18} />
                  <span>{text(locale, "平分", "Split evenly")}</span>
                </button>
                <button className="primary" onClick={onPay} disabled={busy || !(order.items || []).length}>
                  <CircleDollarSign size={18} />
                  <span>{text(locale, "收款", "Take payment")}</span>
                </button>
                <button onClick={async () => { try { await api("/print-jobs/cash-drawer", { method: "POST" }); } catch { /* drawer optional */ } }} disabled={busy}>
                  <span>💵</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// TableActionModal imported from ./_components/table-action-modal

// ConfirmModal imported from ./_components/confirm-modal

// VoidableOrderLine imported from ./_components/voidable-order-line

