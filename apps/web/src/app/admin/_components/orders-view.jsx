"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Search } from "lucide-react";
import { api, labelOf } from "../../../lib/api";

function t(locale, zh, en) { return locale === "en-GB" ? en : zh; }
function money(value, currency = "CNY", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value || 0));
}
function orderStatusLabel(status, locale) {
  const labels = { draft: { "zh-CN": "草稿", "en-GB": "Draft" }, submitted: { "zh-CN": "已下单", "en-GB": "Submitted" }, paid: { "zh-CN": "已付款", "en-GB": "Paid" }, cancelled: { "zh-CN": "已取消", "en-GB": "Cancelled" } };
  return labels[status]?.[locale] || labels[status]?.["zh-CN"] || status;
}
function serviceTypeLabel(type, locale) { return type === "dine_in" ? t(locale, "堂食", "Dine-in") : t(locale, "外带", "Takeaway"); }
function printJobStatusLabel(s, l) { const m={queued:{"zh-CN":"排队中","en-GB":"Queued"},printing:{"zh-CN":"打印中","en-GB":"Printing"},succeeded:{"zh-CN":"已完成","en-GB":"Succeeded"},failed:{"zh-CN":"失败","en-GB":"Failed"}}; return m[s]?.[l]||m[s]?.["zh-CN"]||s; }
function printJobTypeLabel(t, l) { const m={kitchen:{"zh-CN":"厨房单","en-GB":"Kitchen ticket"},receipt:{"zh-CN":"收银小票","en-GB":"Receipt"},test:{"zh-CN":"测试打印","en-GB":"Test print"}}; return m[t]?.[l]||m[t]?.["zh-CN"]||t; }

const ORDER_STATUS_COLOR = { draft: "chip-grey", submitted: "chip-blue", paid: "chip-green", cancelled: "chip-red" };

function OrderDetailModal({ order, locale, currency, onClose }) {
  const items = order.items || [];
  const payments = order.payments || [];
  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: "80vh", overflow: "auto" }}>
        <header className="modal-header">
          <button type="button" onClick={onClose} title={t(locale, "关闭", "Close")}><span style={{fontSize:20}}>×</span></button>
          <div><h2>{order.order_no}</h2><span>{serviceTypeLabel(order.service_type, locale)} · {orderStatusLabel(order.status, locale)}</span></div>
        </header>
        <div className="modal-body" style={{padding:16}}>
          {order.service_type === "dine_in" && <p>{t(locale, "桌台", "Table")}: {order.table_label || "-"} · {t(locale, "用餐人数", "Guests")}: {order.guests || "-"}</p>}
          {order.service_type === "takeaway" && <p>{t(locale, "取餐号", "Pickup no.")}: {order.pickup_no || "-"}</p>}
          <div style={{margin:"12px 0",borderTop:"1px solid var(--line)"}} />
          {items.map((item) => (
            <div key={item.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,padding:"4px 0"}}>
              <div><strong>{labelOf(item.name_i18n, locale)}</strong> × {item.quantity}
                {item.modifiers?.length > 0 && <small style={{display:"block",color:"var(--muted)"}}>{item.modifiers.map((m) => labelOf(m.name_i18n, locale)).join(", ")}</small>}
                {item.notes && <small style={{display:"block",color:"var(--muted)"}}>{item.notes}</small>}
              </div>
              <strong>{money(Number(item.line_total || 0), currency, locale)}</strong>
            </div>
          ))}
          <div style={{margin:"12px 0",borderTop:"1px solid var(--line)"}} />
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:4,fontSize:13}}>
            <span>{t(locale,"小计","Subtotal")}</span><span>{money(order.subtotal, currency, locale)}</span>
            {Number(order.discount) > 0 && <><span>{t(locale,"折扣","Discount")}</span><span>-{money(order.discount, currency, locale)}</span></>}
            {Number(order.tax) > 0 && <><span>VAT</span><span>{money(order.tax, currency, locale)}</span></>}
            {Number(order.service_charge) > 0 && <><span>{t(locale,"服务费","Service charge")}</span><span>{money(order.service_charge, currency, locale)}</span></>}
            <strong style={{marginTop:4}}>{t(locale,"合计","Total")}</strong><strong style={{marginTop:4}}>{money(order.total, currency, locale)}</strong>
          </div>
          {payments.length > 0 && <>
            <div style={{margin:"12px 0",borderTop:"1px solid var(--line)"}} />
            <p style={{fontWeight:600,margin:"0 0 6px"}}>{t(locale,"支付记录","Payments")}</p>
            {payments.map((p) => (
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"2px 0"}}>
                <span>{p.method}{p.provider ? ` (${p.provider})` : ""}{p.card_last4 ? ` ·•••${p.card_last4}` : ""}</span>
                <strong>{money(p.amount, currency, locale)}</strong>
              </div>
            ))}
          </>}
        </div>
      </div>
    </div>
  );
}

export default function OrdersView({ orders, locale, currency }) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("time_desc");
  const [search, setSearch] = useState("");
  const [detailOrder, setDetailOrder] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  async function openDetail(order) {
    setLoadingId(order.id);
    try { const full = await api(`/orders/${order.id}`); setDetailOrder(full); }
    finally { setLoadingId(null); }
  }

  const filtered = orders.filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (filterType !== "all" && o.service_type !== filterType) return false;
    if (search.trim() && !o.order_no.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "time_desc") return new Date(b.created_at) - new Date(a.created_at);
    if (sortBy === "time_asc") return new Date(a.created_at) - new Date(b.created_at);
    if (sortBy === "amount_desc") return Number(b.total) - Number(a.total);
    if (sortBy === "amount_asc") return Number(a.total) - Number(b.total);
    return 0;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedOrders = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [filterStatus, filterType, sortBy, search]);
  useEffect(() => { setPage((c) => Math.min(c, totalPages)); }, [totalPages]);

  return (
    <>
      {detailOrder && <OrderDetailModal order={detailOrder} locale={locale} currency={currency} onClose={() => setDetailOrder(null)} />}
      <div className="orders-toolbar">
        <div className="orders-filters">
          <div className="filter-group"><label>{t(locale, "状态", "Status")}</label><select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">{t(locale, "全部", "All")}</option><option value="draft">{t(locale, "草稿", "Draft")}</option><option value="submitted">{t(locale, "已下单", "Submitted")}</option><option value="paid">{t(locale, "已付款", "Paid")}</option><option value="cancelled">{t(locale, "已取消", "Cancelled")}</option>
          </select></div>
          <div className="filter-group"><label>{t(locale, "类型", "Type")}</label><select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">{t(locale, "全部", "All")}</option><option value="dine_in">{t(locale, "堂食", "Dine-in")}</option><option value="takeaway">{t(locale, "外带", "Takeaway")}</option>
          </select></div>
          <div className="filter-group"><label>{t(locale, "排序", "Sort")}</label><select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="time_desc">{t(locale, "时间 ↓ 最新", "Time ↓ Newest")}</option><option value="time_asc">{t(locale, "时间 ↑ 最早", "Time ↑ Oldest")}</option><option value="amount_desc">{t(locale, "金额 ↓ 最高", "Amount ↓ Highest")}</option><option value="amount_asc">{t(locale, "金额 ↑ 最低", "Amount ↑ Lowest")}</option>
          </select></div>
        </div>
        <div className="orders-search"><Search size={15} /><input placeholder={t(locale, "搜索单号…", "Search order no…")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <span className="orders-count">{filtered.length} {t(locale, "条", "orders")}</span>
      </div>
      <div className="orders-table">
        <div className="orders-table-head"><span>{t(locale, "单号", "Order no.")}</span><span>{t(locale, "类型", "Type")}</span><span>{t(locale, "状态", "Status")}</span><span>{t(locale, "时间", "Time")}</span><span style={{textAlign:"right"}}>{t(locale, "金额", "Amount")}</span></div>
        {filtered.length === 0 && <div className="empty" style={{padding:"24px 0"}}>{t(locale, "暂无订单", "No orders")}</div>}
        {pagedOrders.map((order) => (
          <button key={order.id} className="orders-table-row" onClick={() => openDetail(order)} disabled={loadingId === order.id}>
            <span className="order-no-cell">{order.order_no}</span><span>{serviceTypeLabel(order.service_type, locale)}</span>
            <span><em className={`admin-chip ${ORDER_STATUS_COLOR[order.status] || "chip-grey"}`}>{orderStatusLabel(order.status, locale)}</em></span>
            <span className="order-time-cell">{new Date(order.created_at).toLocaleString(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            <strong style={{textAlign:"right"}}>{money(order.total, currency, locale)}</strong>
          </button>
        ))}
      </div>
      {filtered.length > pageSize && (
        <div className="orders-pagination">
          <button type="button" onClick={() => setPage((c) => Math.max(1, c-1))} disabled={page<=1}>{t(locale, "上一页", "Previous")}</button>
          <span>{page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((c) => Math.min(totalPages, c+1))} disabled={page>=totalPages}>{t(locale, "下一页", "Next")}</button>
        </div>
      )}
    </>
  );
}

export { KitchenView, PrintJobsView };

function KitchenView({ items, locale, onStatus }) {
  const statusLabels = { ordered: t(locale, "待制作", "Queued"), preparing: t(locale, "制作中", "Preparing"), ready_to_serve: t(locale, "待上菜", "Ready to serve"), served: t(locale, "已上菜", "Served"), cancelled: t(locale, "已取消", "Cancelled") };
  return (
    <section className="kitchen-board">
      {items.map((item) => (
        <article className={`kitchen-ticket kitchen-${item.status}`} key={item.id}>
          <div className="ticket-head"><h2>{labelOf(item.name_i18n, locale)}</h2><strong>x{item.quantity}</strong></div>
          <p>{item.service_type === "dine_in" ? `${t(locale, "桌台", "Table")} ${item.table_label || "-"}` : `${t(locale, "外带", "Takeaway")} ${item.pickup_no || "-"}`}</p>
          <p>{item.order_no} · {statusLabels[item.status] || item.status}</p>
          {item.notes && <small>{item.notes}</small>}
          <time>{new Date(item.created_at).toLocaleTimeString(locale)}</time>
          <div className="ticket-actions">
            <button onClick={() => onStatus(item, "preparing")} disabled={item.status === "preparing"}>{t(locale, "制作中", "Preparing")}</button>
            <button onClick={() => onStatus(item, "ready_to_serve")} disabled={item.status === "ready_to_serve"}>{t(locale, "待上菜", "Ready to serve")}</button>
            <button className="primary" onClick={() => onStatus(item, "served")}>{t(locale, "已上菜", "Served")}</button>
          </div>
        </article>
      ))}
      {!items.length && <div className="empty">{t(locale, "暂无待处理菜品", "No pending items")}</div>}
    </section>
  );
}

function PrintJobsView({ jobs, locale, onRetry }) {
  const statusLabels = { queued: printJobStatusLabel("queued", locale), printing: printJobStatusLabel("printing", locale), succeeded: printJobStatusLabel("succeeded", locale), failed: printJobStatusLabel("failed", locale) };
  const typeLabels = { kitchen: printJobTypeLabel("kitchen", locale), receipt: printJobTypeLabel("receipt", locale), test: printJobTypeLabel("test", locale) };
  return (
    <section className="wide-list">
      {jobs.map((job) => (
        <div className="list-row print-row" key={job.id}>
          <span>{typeLabels[job.type] || job.type}</span><span>{statusLabels[job.status] || job.status}</span>
          <span>{new Date(job.created_at).toLocaleString(locale)}</span><span>{job.attempts} {t(locale, "次", "tries")}</span>
          {job.error ? <small className="print-error"><AlertCircle size={14} />{job.error}</small> : <small>-</small>}
          <button onClick={() => onRetry(job)} disabled={job.status === "queued" || job.status === "printing"}><RefreshCw size={16} /><span>{t(locale, "重试", "Retry")}</span></button>
        </div>
      ))}
      {!jobs.length && <div className="empty">{t(locale, "暂无打印任务", "No print jobs")}</div>}
    </section>
  );
}
