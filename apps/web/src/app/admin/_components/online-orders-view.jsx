"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, RefreshCw } from "lucide-react";
import { api, money, t } from "./helpers";

function customerValue(customer, key) {
  return customer?.[key] || "—";
}

export default function OnlineOrdersView({ locale, currency, onNotify }) {
  const [orders, setOrders] = useState({ items: [], total: 0 });
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const next = await api("/ops/online-orders?limit=100");
      setOrders(next);
      if (selected) setSelected(await api(`/ops/online-orders/${selected.id}`));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusy(false);
    }
  }, [onNotify, selected]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onOrderReceived = () => refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("qypos:online-order-received", onOrderReceived);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("qypos:online-order-received", onOrderReceived);
    };
  }, [refresh]);

  async function showOrder(order) {
    try {
      setSelected(await api(`/ops/online-orders/${order.id}`));
    } catch (error) {
      onNotify(error.message);
    }
  }

  return (
    <div className="settings-top online-orders-page">
      <section className="delivery-page-intro">
        <div>
          <span className="delivery-page-kicker">{t(locale, "网站在线订单", "Website online orders")}</span>
          <h2>{t(locale, "在线订单收件箱", "Online order inbox")}</h2>
          <p className="muted">{t(locale, "这里只读保存网站已付款订单的原始快照，不会创建 QYPOS 正式订单或付款记录；确认弹窗后可单独打印简易后厨单。", "Read-only snapshots of captured website orders. No QYPOS order or payment record is created; confirmation can print a simple kitchen ticket.")}</p>
        </div>
        <button type="button" className="link-button" onClick={refresh} disabled={busy}><RefreshCw size={16} />{t(locale, "刷新", "Refresh")}</button>
      </section>

      <section className="panel settings-section">
        <div className="panel-title"><h2>{t(locale, "已接收订单", "Received orders")}</h2><span className="muted">{orders.total}</span></div>
        <div className="table-scroll"><table className="data-table"><thead><tr>
          <th>{t(locale, "订单号", "Reference")}</th><th>UUID</th><th>{t(locale, "顾客", "Customer")}</th><th>{t(locale, "付款", "Payment")}</th><th>{t(locale, "总额", "Total")}</th><th>{t(locale, "接收时间", "Received")}</th><th />
        </tr></thead><tbody>
          {orders.items.map((order) => <tr key={order.id}>
            <td>{order.external_reference}</td>
            <td><code>{order.external_order_id}</code></td>
            <td>{customerValue(order.customer, "name")}</td>
            <td>{order.payment_status}</td>
            <td>{money(Number(order.total_minor) / 100, order.currency || currency, locale)}</td>
            <td>{new Date(order.received_at).toLocaleString(locale)}</td>
            <td><button type="button" className="icon-button" onClick={() => showOrder(order)} title={t(locale, "查看原始订单", "View raw order")}><Eye size={16} /></button></td>
          </tr>)}
          {!orders.items.length && <tr><td colSpan="7" className="muted">{t(locale, "暂无在线订单", "No online orders received")}</td></tr>}
        </tbody></table></div>
      </section>

      {selected && <section className="panel settings-section online-order-detail">
        <div className="panel-title"><h2>{selected.external_reference}</h2><button type="button" onClick={() => setSelected(null)}>×</button></div>
        <div className="online-order-meta">
          <span><b>UUID</b><code>{selected.external_order_id}</code></span>
          <span><b>{t(locale, "顾客", "Customer")}</b>{customerValue(selected.customer, "name")}</span>
          <span><b>{t(locale, "电话", "Phone")}</b>{customerValue(selected.customer, "phone")}</span>
          <span><b>Email</b>{customerValue(selected.customer, "email")}</span>
          <span><b>{t(locale, "备注", "Note")}</b>{customerValue(selected.customer, "note")}</span>
          <span><b>{t(locale, "总额", "Total")}</b>{money(Number(selected.total_minor) / 100, selected.currency || currency, locale)}</span>
        </div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>sourceItemId</th><th>{t(locale, "英文名称", "English name")}</th><th>{t(locale, "中文名称", "Chinese name")}</th><th>{t(locale, "选项", "Option")}</th><th>{t(locale, "数量", "Qty")}</th><th>{t(locale, "单价", "Unit")}</th><th>{t(locale, "小计", "Line total")}</th></tr></thead><tbody>
          {selected.items.map((item) => <tr key={item.id}><td><code>{item.source_item_id}</code></td><td>{item.name_en}</td><td>{item.name_zh}</td><td>{item.option_label_en || item.option_label_zh || "—"}</td><td>{item.quantity}</td><td>{money(item.unit_price_minor / 100, selected.currency, locale)}</td><td>{money(item.line_total_minor / 100, selected.currency, locale)}</td></tr>)}
        </tbody></table></div>
        <details><summary>{t(locale, "查看原始订单 JSON", "View raw order JSON")}</summary><pre className="online-order-raw">{JSON.stringify(selected.raw_payload, null, 2)}</pre></details>
      </section>}
    </div>
  );
}
