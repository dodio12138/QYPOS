"use client";

import { BellRing, CheckCircle2, Clock3, ShoppingBag, X } from "lucide-react";
import { money, t } from "./helpers";

function customerValue(customer, key) {
  return customer?.[key] || "—";
}

export default function OnlineOrderAlertModal({ order, locale, currency, onAccept, onDismiss }) {
  if (!order) return null;
  const orderCurrency = order.currency || currency;
  const items = Array.isArray(order.items) ? order.items : [];
  return (
    <div className="online-order-alert-backdrop" role="presentation">
      <section className="online-order-alert-modal" role="alertdialog" aria-modal="true" aria-labelledby="online-order-alert-title" aria-describedby="online-order-alert-description">
        <div className="online-order-alert-ribbon">{order.test ? t(locale, "弹窗测试", "Alert test") : t(locale, "新网站订单", "New website order")}</div>
        <button type="button" className="online-order-alert-close" onClick={onDismiss} title={t(locale, "稍后处理", "Handle later")}><X size={22} /></button>
        <div className="online-order-alert-heading">
          <div className="online-order-alert-icon"><BellRing size={34} strokeWidth={2.4} /></div>
          <div>
            <p className="online-order-alert-kicker">{t(locale, "请立即查看", "Please review now")}</p>
            <h2 id="online-order-alert-title">{t(locale, "收到网站在线订单", "Website order received")}</h2>
            <p id="online-order-alert-description">{t(locale, "订单已保存到在线收件箱，请确认后继续处理。", "The order is saved in the online inbox. Confirm it before continuing.")}</p>
          </div>
        </div>

        <div className="online-order-alert-reference">
          <div><span>{t(locale, "网站订单号", "Website reference")}</span><strong>{order.external_reference || "—"}</strong></div>
          <div><span>{t(locale, "订单金额", "Order total")}</span><strong>{money(Number(order.total_minor || 0) / 100, orderCurrency, locale)}</strong></div>
        </div>

        <div className="online-order-alert-details">
          <div className="online-order-alert-customer">
            <b>{t(locale, "顾客", "Customer")}</b>
            <span>{customerValue(order.customer, "name")}</span>
            <span>{customerValue(order.customer, "phone")}</span>
            {order.customer?.note && <span>{t(locale, "备注：", "Note: ")}{order.customer.note}</span>}
          </div>
          <div className="online-order-alert-items">
            <b><ShoppingBag size={16} />{t(locale, "订单内容", "Order items")}</b>
            {items.length ? items.map((item) => <div key={item.id || item.source_item_id}>
              <span>{item.quantity} × {item.name_zh || item.nameZh || item.name_en || item.nameEn}</span>
              <small>{item.option_label_zh || item.optionLabelZh || item.option_label_en || item.optionLabelEn || ""}</small>
            </div>) : <span className="muted">{t(locale, "正在加载订单明细…", "Loading order details…")}</span>}
          </div>
        </div>

        <div className="online-order-alert-notice"><Clock3 size={17} />{t(locale, "M1 当前只保存收件箱快照；“接单”按钮暂不创建正式订单、付款记录或厨房打印。", "M1 only saves the inbox snapshot; Accept does not create a POS order, payment, or kitchen print yet.")}</div>
        <div className="online-order-alert-actions">
          <button type="button" className="online-order-alert-later" onClick={onDismiss}>{t(locale, "稍后处理", "Handle later")}</button>
          <button type="button" className="online-order-alert-accept" onClick={onAccept}><CheckCircle2 size={21} />{t(locale, "接单（暂不进入厨房）", "Accept (not sent to kitchen)")}</button>
        </div>
      </section>
    </div>
  );
}
