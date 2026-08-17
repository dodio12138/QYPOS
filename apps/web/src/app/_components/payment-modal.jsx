"use client";
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, CircleDollarSign, Gift, Loader2, X } from "lucide-react";
import { text, money } from "./pos-helpers";
import { api } from "../../lib/api";
export default function PaymentModal({ order, locale, currency, dojoAvailable, busy, onClose, onPay, onDojoPaid, onComplimentary }) {
  const paidSoFar = (order.payments ?? []).reduce(
    (sum, payment) => sum + Number(payment.amount) - Number(payment.change_due ?? 0) - Number(payment.retained_amount ?? 0), 0
  );
  const total = Number(order.total || 0);
  const remaining = Math.max(0, Math.round((total - paidSoFar) * 100) / 100);
  const isZeroCheckout = remaining === 0;
  const [mode, setMode] = useState(dojoAvailable && !isZeroCheckout ? "dojo" : "manual");
  const [method, setMethod] = useState("card");
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [terminals, setTerminals] = useState([]);
  const [terminalId, setTerminalId] = useState("");
  const [attempt, setAttempt] = useState(null);
  const [dojoBusy, setDojoBusy] = useState(false);
  const [dojoError, setDojoError] = useState("");
  const [keepFullCashAmount, setKeepFullCashAmount] = useState(false);
  const completedRef = useRef(false);
  const paid = Number(amount || 0);
  const calculatedChange = method === "cash" ? Math.max(0, paid - remaining) : 0;
  const change = method === "cash" && keepFullCashAmount ? 0 : calculatedChange;
  const recordedIncome = Math.max(0, paid - change);
  const attemptPending = attempt?.status === "pending" || attempt?.status === "created";
  const exceedsRemaining = method !== "cash" && paid > remaining;

  useEffect(() => {
    setAmount(remaining.toFixed(2));
  }, [remaining]);

  useEffect(() => {
    if (!dojoAvailable || isZeroCheckout) return;
    let cancelled = false;
    api("/payment-providers/dojo/terminals")
      .then((items) => {
        if (cancelled) return;
        setTerminals(items);
        setTerminalId((current) => current || items[0]?.id || "");
      })
      .catch((error) => { if (!cancelled) setDojoError(error.message); });
    return () => { cancelled = true; };
  }, [dojoAvailable, isZeroCheckout]);

  useEffect(() => {
    if (!attemptPending || !attempt?.id || completedRef.current) return;
    let cancelled = false;
    let timer;
    async function poll() {
      try {
        const latest = await api(`/payment-attempts/${attempt.id}`);
        if (cancelled) return;
        setAttempt(latest);
        setDojoError(latest.error_message || "");
        if (latest.status === "succeeded" && !completedRef.current) {
          completedRef.current = true;
          const fullyPaid = await onDojoPaid(latest);
          if (!fullyPaid) {
            setAttempt(null);
            setMode("manual");
            completedRef.current = false;
          }
          return;
        }
        if (["declined", "cancelled", "unknown", "failed"].includes(latest.status)) return;
      } catch (error) {
        if (!cancelled) setDojoError(error.message);
      }
      if (!cancelled) timer = window.setTimeout(poll, 1200);
    }
    timer = window.setTimeout(poll, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attempt?.id, attempt?.status, attemptPending, onDojoPaid]);

  async function startDojo() {
    setDojoBusy(true);
    setDojoError("");
    try {
      const created = await api(`/orders/${order.id}/payment-attempts/dojo`, {
        method: "POST",
        body: JSON.stringify({ amount: paid, terminal_id: terminalId || undefined })
      });
      setAttempt(created);
    } catch (error) {
      setDojoError(error.message);
    } finally {
      setDojoBusy(false);
    }
  }

  async function cancelDojo() {
    if (!attempt?.id) return;
    setDojoBusy(true);
    setDojoError("");
    try {
      const cancelled = await api(`/payment-attempts/${attempt.id}/cancel`, { method: "POST" });
      setAttempt(cancelled);
    } catch (error) {
      setDojoError(error.message);
    } finally {
      setDojoBusy(false);
    }
  }

  async function answerSignature(accepted) {
    if (!attempt?.id) return;
    setDojoBusy(true);
    setDojoError("");
    try {
      const updated = await api(`/payment-attempts/${attempt.id}/signature`, {
        method: "POST",
        body: JSON.stringify({ accepted })
      });
      setAttempt(updated);
    } catch (error) {
      setDojoError(error.message);
    } finally {
      setDojoBusy(false);
    }
  }

  const dojoPrompt = {
    PresentCard: "请在 Dojo 刷卡机上刷卡或插卡",
    EnterPin: "请在刷卡机上输入 PIN",
    RemoveCard: "请取出银行卡",
    PleaseWait: "正在处理，请稍候"
  }[attempt?.terminal_prompt] || (attemptPending ? "正在等待 Dojo 刷卡机…" : "");
  const signatureRequired = attempt?.terminal_status === "SignatureVerificationRequired";

  return (
    <div className="modal-backdrop">
      <section className="modal payment-modal">
        <header className="modal-header">
          <button onClick={onClose} title={text(locale, "返回", "Back")} disabled={attemptPending}><ChevronLeft size={20} /></button>
          <div>
            <h2>{text(locale, "收款", "Payment")}</h2>
            <p>{order.order_no}</p>
          </div>
          <button onClick={onClose} title={text(locale, "关闭", "Close")} disabled={attemptPending}><X size={20} /></button>
        </header>
        <div className="split-summary payment-summary">
          <div><span>{text(locale, "订单总额", "Order total")}</span><b>{money(total, currency, locale)}</b></div>
          {paidSoFar > 0 && <div><span>{text(locale, "已收", "Paid")}</span><b className="split-paid-amt">{money(paidSoFar, currency, locale)}</b></div>}
          <div className="split-remaining-row"><span>{text(locale, "待收", "Remaining")}</span><b>{money(remaining, currency, locale)}</b></div>
        </div>
        <div className="payment-mode-tabs">
          {dojoAvailable && !isZeroCheckout && <button className={mode === "dojo" ? "selected" : ""} onClick={() => setMode("dojo")} disabled={attemptPending}>{text(locale, "Dojo 刷卡", "Dojo card")}</button>}
          <button className={mode === "manual" ? "selected" : ""} onClick={() => setMode("manual")} disabled={attemptPending}>{text(locale, "手工记账", "Manual payment")}</button>
        </div>
        {mode === "dojo" ? (
          <>
            {terminals.length > 1 && (
              <label className="notes-box">{text(locale, "刷卡机", "Terminal")}
                <select value={terminalId} onChange={(event) => setTerminalId(event.target.value)} disabled={attemptPending}>
                  {terminals.map((terminal) => <option value={terminal.id} key={terminal.id}>{terminal.name}</option>)}
                </select>
              </label>
            )}
            <div className={`dojo-payment-state ${attempt?.status || "ready"}`}>
              {dojoBusy ? <><Loader2 className="spin" size={28} />{text(locale, "正在连接 Dojo…", "Connecting to Dojo…")}</> : attemptPending ? <><Loader2 className="spin" size={28} />{dojoPrompt}</> : attempt?.status === "declined" ? text(locale, "付款被拒绝，请重试或改用手工记账", "Payment declined. Try again or use manual payment.") : attempt?.status === "unknown" ? text(locale, "支付结果不确定，请核对刷卡机或终端小票", "Payment status is uncertain. Check the terminal or receipt.") : text(locale, "金额将自动发送到 Dojo 刷卡机", "The amount will be sent to the Dojo terminal automatically")}
            </div>
            {!attemptPending && (
              <label className="notes-box payment-amount-field">{text(locale, "本次刷卡金额", "Card amount this time")}
                <input type="number" min="0.01" max={remaining} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
            )}
            {dojoError && <div className="inline-error">{dojoError}</div>}
            {signatureRequired && (
              <div className="dojo-signature-actions">
                <button onClick={() => answerSignature(false)} disabled={dojoBusy}>{text(locale, "拒绝签名", "Decline signature")}</button>
                <button className="primary" onClick={() => answerSignature(true)} disabled={dojoBusy}>{text(locale, "确认签名一致", "Confirm signature matches")}</button>
              </div>
            )}
            <footer className="modal-footer">
              {attemptPending ? <button onClick={cancelDojo} disabled={dojoBusy}>{text(locale, "取消终端交易", "Cancel terminal payment")}</button> : <button onClick={onClose}>{text(locale, "关闭", "Close")}</button>}
              {!attemptPending && <button className="primary" onClick={startDojo} disabled={dojoBusy || busy || terminals.length === 0 || remaining <= 0 || paid <= 0 || paid > remaining || attempt?.status === "unknown"}><CircleDollarSign size={18} /><span>{text(locale, "发送到 Dojo", "Send to Dojo")}</span></button>}
            </footer>
          </>
        ) : (
          <>
            {isZeroCheckout ? (
              <div className="dojo-payment-state ready">{text(locale, "订单金额为 0，可直接完成结账", "The order total is zero and can be checked out directly")}</div>
            ) : (
              <>
                <div className="choice-grid">
                  {["cash", "card", "qr", "other"].map((item) => (
                    <button key={item} className={method === item ? "selected" : ""} onClick={() => {
                      setMethod(item);
                      if (item !== "cash") setKeepFullCashAmount(false);
                    }}>{item}</button>
                  ))}
                </div>
                <label className="notes-box payment-amount-field">{text(locale, "本次收款金额", "Payment amount this time")}
                  <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </label>
                {method === "cash" && (
                  <label className="modal-print-toggle">
                    <input type="checkbox" checked={keepFullCashAmount} onChange={(event) => setKeepFullCashAmount(event.target.checked)} />
                    <span>{text(locale, "无需找零，全部计入实收", "No change required; record the full cash amount")}</span>
                  </label>
                )}
                <div className="totals">
                  <span>{text(locale, "待收", "Remaining")} <b>{money(remaining, currency, locale)}</b></span>
                  <span>{text(locale, "实收", "Received")} <b>{money(paid, currency, locale)}</b></span>
                  <strong>{text(locale, "找零", "Change")} <b>{money(change, currency, locale)}</b></strong>
                  <strong>{text(locale, "计入收入", "Recorded income")} <b>{money(recordedIncome, currency, locale)}</b></strong>
                </div>
                {exceedsRemaining && <div className="inline-error">{text(locale, "非现金付款不能超过待收金额", "Non-cash payment cannot exceed the remaining balance")}</div>}
                <small className="payment-provider-hint">{text(locale, "可输入任意金额先收现金，再用银行卡支付剩余金额。每笔付款会分别记录。", "Enter any cash amount, then pay the remainder by card. Each tender is recorded separately.")}</small>
                {!dojoAvailable && <small className="payment-provider-hint">{text(locale, "Dojo 尚未配置，当前仍可使用手工收款。", "Dojo is not configured yet. Manual payment is still available.")}</small>}
              </>
            )}
            <footer className="modal-footer">
              <button onClick={onClose}>{text(locale, "取消", "Cancel")}</button>
              {!isZeroCheckout && <button onClick={onComplimentary}><Gift size={18} /><span>{text(locale, "免单结账", "Complimentary")}</span></button>}
              <button className="primary" onClick={() => onPay({
                method: isZeroCheckout ? "zero" : method,
                amount: isZeroCheckout ? 0 : paid,
                change_due: isZeroCheckout ? 0 : change,
                retain_excess: !isZeroCheckout && method === "cash" && keepFullCashAmount
              })} disabled={busy || (!isZeroCheckout && (paid <= 0 || exceedsRemaining))}>
                <CircleDollarSign size={18} /><span>{isZeroCheckout ? text(locale, "确认 0 元结账", "Confirm zero checkout") : paid < remaining ? text(locale, "收取本次金额", "Take partial payment") : text(locale, "确认手工收款", "Confirm manual payment")}</span>
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
