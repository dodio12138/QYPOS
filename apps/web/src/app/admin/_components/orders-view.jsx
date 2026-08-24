"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Edit3, Gift, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { api, labelOf } from "../../../lib/api";

function t(locale, zh, en) { return locale === "en-GB" ? en : zh; }
function money(value, currency = "CNY", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value || 0));
}
function orderStatusLabel(status, locale) {
  const labels = { draft: { "zh-CN": "草稿", "en-GB": "Draft" }, submitted: { "zh-CN": "已下单", "en-GB": "Submitted" }, paid: { "zh-CN": "已付款", "en-GB": "Paid" }, cancelled: { "zh-CN": "已取消", "en-GB": "Cancelled" }, split: { "zh-CN": "已分单", "en-GB": "Split" } };
  return labels[status]?.[locale] || labels[status]?.["zh-CN"] || status;
}
function serviceTypeLabel(type, locale) { return type === "dine_in" ? t(locale, "堂食", "Dine-in") : t(locale, "外带", "Takeaway"); }
function printJobStatusLabel(s, l) { const m={queued:{"zh-CN":"排队中","en-GB":"Queued"},printing:{"zh-CN":"打印中","en-GB":"Printing"},succeeded:{"zh-CN":"已完成","en-GB":"Succeeded"},failed:{"zh-CN":"失败","en-GB":"Failed"}}; return m[s]?.[l]||m[s]?.["zh-CN"]||s; }
function printJobTypeLabel(t, l) { const m={kitchen:{"zh-CN":"厨房单","en-GB":"Kitchen ticket"},receipt:{"zh-CN":"收银小票","en-GB":"Receipt"},test:{"zh-CN":"测试打印","en-GB":"Test print"}}; return m[t]?.[l]||m[t]?.["zh-CN"]||t; }

const ORDER_STATUS_COLOR = { draft: "chip-grey", submitted: "chip-blue", paid: "chip-green", cancelled: "chip-red", split: "chip-grey" };

function OrderItemRows({ items, locale, currency }) {
  return (items || []).map((item) => (
    <div key={item.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,padding:"4px 0"}}>
      <div><strong>{labelOf(item.name_i18n, locale)}</strong> × {item.quantity}
        {item.modifiers?.length > 0 && <small style={{display:"block",color:"var(--muted)"}}>{item.modifiers.map((m) => labelOf(m.name_i18n, locale)).join(", ")}</small>}
        {item.notes && <small style={{display:"block",color:"var(--muted)"}}>{item.notes}</small>}
      </div>
      <strong>{money(Number(item.line_total || 0), currency, locale)}</strong>
    </div>
  ));
}

function OrderDetailModal({ order, locale, currency, canAdjustPaidOrder, onClose, onSaved, onNotify }) {
  const items = order.items || [];
  const payments = order.payments || [];
  const childOrders = order.child_orders || [];
  const lotteryRecords = order.lottery_records || [];
  const totalPayments = payments.reduce(
    (sum, p) => sum + Number(p.amount || 0) - Number(p.change_due || 0) - Number(p.retained_amount || 0),
    0
  );
  const [editingAmount, setEditingAmount] = useState(false);
  const [targetTotal, setTargetTotal] = useState(Number(order.total || 0).toFixed(2));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const adjustedTotal = Number(targetTotal || 0);
  const refundDue = Math.max(0, Math.round((totalPayments - adjustedTotal) * 100) / 100);

  async function submitAmountAdjustment(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!canAdjustPaidOrder) {
        const grant = await api("/auth/admin-grant", {
          method: "POST",
          body: JSON.stringify({ name: adminName.trim(), pin: adminPin, scope: "discount" })
        });
        window.sessionStorage.setItem("qypos_admin_grant", grant.token);
      }
      await api(`/orders/${order.id}/amount-adjustment`, {
        method: "POST",
        body: JSON.stringify({ total: adjustedTotal, reason: reason.trim(), note: note.trim() })
      });
      setEditingAmount(false);
      setReason("");
      setNote("");
      setAdminName("");
      setAdminPin("");
      await onSaved(order.id);
      onNotify(t(locale, "订单金额已调整", "Order amount adjusted"));
    } catch (caught) {
      setError(caught.message || t(locale, "调整失败", "Adjustment failed"));
    } finally {
      setBusy(false);
    }
  }

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
          {childOrders.length > 0 ? (
            <div style={{display:"grid",gap:12}}>
              {childOrders.map((child) => (
                <section key={child.id}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"baseline",marginBottom:4}}>
                    <strong>{child.order_no}</strong>
                    <span style={{fontSize:13,color:"var(--muted)"}}>{orderStatusLabel(child.status, locale)} · {money(child.total, currency, locale)}</span>
                  </div>
                  <OrderItemRows items={child.items} locale={locale} currency={currency} />
                </section>
              ))}
            </div>
          ) : (
            <OrderItemRows items={items} locale={locale} currency={currency} />
          )}
          {childOrders.length > 0 && (
            <>
              <div style={{margin:"12px 0",borderTop:"1px solid var(--line)"}} />
              <p style={{fontWeight:600,margin:"0 0 6px"}}>{t(locale,"关联子单","Linked split orders")}</p>
              <div style={{display:"grid",gap:4,fontSize:13}}>
                {childOrders.map((child) => (
                  <div key={child.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8}}>
                    <span>{child.order_no} · {orderStatusLabel(child.status, locale)}</span>
                    <strong>{money(child.total, currency, locale)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{margin:"12px 0",borderTop:"1px solid var(--line)"}} />
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:4,fontSize:13}}>
            <span>{t(locale,"小计","Subtotal")}</span><span>{money(order.subtotal, currency, locale)}</span>
            {Number(order.discount) > 0 && <><span>{t(locale,"折扣","Discount")}</span><span>-{money(order.discount, currency, locale)}</span></>}
            {Number(order.tax) > 0 && <><span>VAT</span><span>{money(order.tax, currency, locale)}</span></>}
            {Number(order.service_charge) > 0 && <><span>{t(locale,"服务费","Service charge")}</span><span>{money(order.service_charge, currency, locale)}</span></>}
            <strong style={{marginTop:4}}>{t(locale,"合计","Total")}</strong><strong style={{marginTop:4}}>{money(order.total, currency, locale)}</strong>
            {totalPayments > 0 && <><span>{t(locale,"已收款","Paid")}</span><span>{money(totalPayments, currency, locale)}</span></>}
            {totalPayments > Number(order.total || 0) && <><span>{t(locale,"需退款","Refund due")}</span><strong>{money(totalPayments - Number(order.total || 0), currency, locale)}</strong></>}
          </div>
          {lotteryRecords.length > 0 && (
            <section className="order-lottery-records">
              <div className="order-lottery-title"><Gift size={17} /><strong>{t(locale, "抽奖结果", "Lottery result")}</strong></div>
              {lotteryRecords.map((record) => {
                const prize = record.prize_snapshot || {};
                const noPrize = prize.kind === "no_prize";
                const instantPrize = !noPrize && prize.fulfillment_type === "instant";
                return (
                  <article className="order-lottery-record" key={record.id}>
                    <div>
                      <strong>{labelOf(prize.name_i18n, locale) || t(locale, "抽奖结果", "Lottery result")}</strong>
                      <span>{labelOf(record.campaign_title_i18n, locale)}</span>
                    </div>
                    <div className="order-lottery-meta">
                      <span>{new Date(record.drawn_at).toLocaleString(locale)}</span>
                      {record.source_order_id !== order.id && <span>{t(locale, "来源订单", "Source order")}: {record.source_order_no}</span>}
                      {record.claim_code_suffix && <span>{t(locale, "兑奖码", "Claim code")}: •••• {record.claim_code_suffix}</span>}
                      <em className={`admin-chip ${noPrize ? "chip-grey" : record.redeemed_at ? "chip-green" : "chip-blue"}`}>
                        {noPrize ? t(locale, "未中奖", "No prize") : instantPrize ? t(locale, "现场发放", "Give now") : record.redeemed_at ? t(locale, "已兑奖", "Redeemed") : t(locale, "中奖 · 待兑奖", "Won · Pending")}
                      </em>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
          {order.status === "paid" && (
            <section style={{marginTop:14,padding:12,border:"1px solid var(--line)",borderRadius:8,display:"grid",gap:10}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
                <strong>{t(locale, "付款后调整", "Paid order adjustment")}</strong>
                <button type="button" onClick={() => setEditingAmount((value) => !value)}>
                  <Edit3 size={15} /><span>{editingAmount ? t(locale, "收起", "Close") : t(locale, "调整", "Adjust")}</span>
                </button>
              </div>
              {order.notes && <small style={{whiteSpace:"pre-wrap",color:"var(--muted)"}}>{order.notes}</small>}
              {editingAmount && (
                <form onSubmit={submitAmountAdjustment} style={{display:"grid",gap:10}}>
                  <label>{t(locale, "调整后合计", "Adjusted total")}<input type="number" min="0" step="0.01" value={targetTotal} onChange={(event) => setTargetTotal(event.target.value)} /></label>
                  <label>{t(locale, "原因", "Reason")}<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t(locale, "例如：退款 / 投诉补偿", "Example: refund / goodwill")} /></label>
                  <label>{t(locale, "追加备注", "Add note")}<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>
                  {!canAdjustPaidOrder && (
                    <div style={{display:"grid",gap:8}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",fontSize:13,color:"var(--muted)"}}><ShieldCheck size={15} />{t(locale, "需要管理员验证", "Admin verification required")}</div>
                      <label>{t(locale, "管理员账号", "Admin account")}<input value={adminName} onChange={(event) => setAdminName(event.target.value)} autoComplete="username" /></label>
                      <label>PIN<input type="password" value={adminPin} onChange={(event) => setAdminPin(event.target.value)} autoComplete="current-password" /></label>
                    </div>
                  )}
                  {refundDue > 0 && <small style={{color:"var(--danger)"}}>{t(locale, "应退款", "Refund due")}: {money(refundDue, currency, locale)}</small>}
                  {error && <div className="inline-error">{error}</div>}
                  <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
                    <button type="button" onClick={() => setEditingAmount(false)}>{t(locale, "取消", "Cancel")}</button>
                    <button className="primary" type="submit" disabled={busy || !Number.isFinite(adjustedTotal) || adjustedTotal < 0 || !reason.trim() || (!canAdjustPaidOrder && (!adminName.trim() || !adminPin))}>{busy ? t(locale, "保存中…", "Saving…") : t(locale, "保存调整", "Save adjustment")}</button>
                  </div>
                </form>
              )}
            </section>
          )}
          {payments.length > 0 && <>
            <div style={{margin:"12px 0",borderTop:"1px solid var(--line)"}} />
            <p style={{fontWeight:600,margin:"0 0 6px"}}>{t(locale,"支付记录","Payments")}</p>
            {payments.map((p) => (
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",gap:12,fontSize:13,padding:"2px 0"}}>
                <span>
                  {p.method}{p.provider ? ` (${p.provider})` : ""}{p.card_last4 ? ` ·•••${p.card_last4}` : ""}
                  {Number(p.change_due) > 0 ? ` · ${t(locale, "找零", "change")} ${money(p.change_due, currency, locale)}` : ""}
                  {Number(p.retained_amount) > 0 ? ` · ${t(locale, "保留实收", "retained")} ${money(p.retained_amount, currency, locale)}` : ""}
                </span>
                <strong>{money(Number(p.amount) - Number(p.change_due || 0), currency, locale)}</strong>
              </div>
            ))}
          </>}
        </div>
      </div>
    </div>
  );
}

export default function OrdersView({ orders, locale, currency, user, requestedOrderId, onRequestedOrderOpened, onOrdersChange, onNotify }) {
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

  async function refreshDetail(orderId) {
    const [nextOrders, full] = await Promise.all([
      api("/orders"),
      api(`/orders/${orderId}`)
    ]);
    onOrdersChange(nextOrders);
    setDetailOrder(full);
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
  useEffect(() => {
    if (!requestedOrderId) return undefined;
    let active = true;
    setLoadingId(requestedOrderId);
    api(`/orders/${requestedOrderId}`)
      .then((full) => {
        if (!active) return;
        if (!full?.id) throw new Error(t(locale, "找不到原订单", "Original order not found"));
        setDetailOrder(full);
      })
      .catch((error) => { if (active) onNotify?.(error.message); })
      .finally(() => {
        if (!active) return;
        setLoadingId(null);
        onRequestedOrderOpened?.();
      });
    return () => { active = false; };
  }, [locale, onNotify, onRequestedOrderOpened, requestedOrderId]);

  return (
    <>
      {detailOrder && <OrderDetailModal order={detailOrder} locale={locale} currency={currency} canAdjustPaidOrder={user?.permissions?.includes("adjust_discount")} onClose={() => setDetailOrder(null)} onSaved={refreshDetail} onNotify={onNotify} />}
      <div className="orders-toolbar">
        <div className="orders-filters">
          <div className="filter-group"><label>{t(locale, "状态", "Status")}</label><select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">{t(locale, "全部", "All")}</option><option value="draft">{t(locale, "草稿", "Draft")}</option><option value="submitted">{t(locale, "已下单", "Submitted")}</option><option value="paid">{t(locale, "已付款", "Paid")}</option><option value="split">{t(locale, "已分单", "Split")}</option><option value="cancelled">{t(locale, "已取消", "Cancelled")}</option>
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
