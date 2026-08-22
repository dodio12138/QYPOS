"use client";

import { BellRing, CheckCircle2, Clock3, ShoppingBag, X } from "lucide-react";
import { useEffect } from "react";
import { money, t } from "./helpers";

function customerValue(customer, key) {
  return customer?.[key] || "—";
}

export default function OnlineOrderAlertModal({ order, locale, currency, onAccept, onDismiss, busy = false }) {
  useEffect(() => {
    if (!order || typeof window === "undefined") return undefined;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;
    const context = new AudioContextClass();
    context.resume().catch(() => {});
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.connect(context.destination);
    [[880, 0, 0.14], [660, 0.16, 0.14], [880, 0.32, 0.22]].forEach(([frequency, offset, duration]) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      const start = context.currentTime + offset;
      oscillator.start(start);
      oscillator.stop(start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    });
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    const closeTimer = window.setTimeout(() => context.close().catch(() => {}), 1000);
    return () => {
      window.clearTimeout(closeTimer);
      context.close().catch(() => {});
    };
  }, [order?.alertKey, order?.id]);

  if (!order) return null;
  const orderCurrency = order.currency || currency;
  const items = Array.isArray(order.items) ? order.items : [];
  return (
    <div className="online-order-alert-backdrop" role="presentation" aria-live="assertive">
      <section className="online-order-alert-modal" role="alertdialog" aria-modal="true" aria-labelledby="online-order-alert-title" aria-describedby="online-order-alert-description">
        <div className="online-order-alert-ribbon">{order.test ? t(locale, "弹窗测试", "Alert test") : t(locale, "新网站订单", "New website order")}</div>
        <button type="button" className="online-order-alert-close" onClick={onDismiss} disabled={busy} title={t(locale, "稍后处理", "Handle later")}><X size={22} /></button>
        <div className="online-order-alert-heading">
          <div className="online-order-alert-icon"><BellRing size={34} strokeWidth={2.4} /></div>
          <div>
            <p className="online-order-alert-kicker">{t(locale, "请立即查看", "Please review now")}</p>
            <h2 id="online-order-alert-title">{t(locale, "收到网站在线订单", "Website order received")}</h2>
            <p id="online-order-alert-description">{t(locale, "订单已保存到网站订单，请确认后继续处理。", "The order is saved in Website orders. Confirm it before continuing.")}</p>
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

        <div className="online-order-alert-notice"><Clock3 size={17} />{t(locale, "当前只保存收件箱快照；确认后会打印简易后厨单，但不会创建正式订单或付款记录。", "The inbox snapshot is retained; confirmation prints a simple kitchen ticket without creating a POS order or payment record.")}</div>
        <div className="online-order-alert-actions">
          <button type="button" className="online-order-alert-later" onClick={onDismiss} disabled={busy}>{t(locale, "稍后处理", "Handle later")}</button>
          <button type="button" className="online-order-alert-accept" onClick={onAccept} disabled={busy}><CheckCircle2 size={21} />{busy ? t(locale, "正在打印后厨单…", "Printing kitchen ticket…") : t(locale, "确认并打印后厨单", "Confirm and print kitchen ticket")}</button>
        </div>
      </section>
    </div>
  );
}
