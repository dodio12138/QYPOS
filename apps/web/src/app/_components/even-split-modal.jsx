"use client";
import { useState, useEffect } from "react";
import { Check, Loader2, X } from "lucide-react";
import { text, money } from "./pos-helpers";
export default function EvenSplitModal({ order, locale, currency, busy, onClose, onPayPartial }) {
  const [splitN, setSplitN] = useState(2);
  const [method, setMethod] = useState("card");
  const [amount, setAmount] = useState("");
  const [perPersonAmt, setPerPersonAmt] = useState(null);

  const total = Number(order.total ?? 0);
  const paidSoFar = (order.payments ?? []).reduce(
    (s, p) => s + Number(p.amount) - Number(p.change_due ?? 0), 0
  );
  const remaining = Math.max(0, Math.round((total - paidSoFar) * 100) / 100);
  const perPerson = splitN > 0 ? Math.round((remaining / splitN) * 100) / 100 : remaining;
  const isFullyPaid = remaining <= 0;

  useEffect(() => {
    if (perPersonAmt != null) {
      // Last person pays the exact remainder to avoid 0.01 rounding gaps
      const amt = remaining <= perPersonAmt + 0.05 ? remaining : perPersonAmt;
      setAmount(amt.toFixed(2));
    } else {
      setAmount(remaining > 0 ? remaining.toFixed(2) : "0");
    }
  }, [remaining, perPersonAmt]);

  const paid = Number(amount || 0);
  const change = Math.max(0, Math.round((paid - remaining) * 100) / 100);

  async function handlePay() {
    const amt = Number(amount || 0);
    if (isNaN(amt) || amt <= 0 || remaining <= 0) return;
    const result = await onPayPartial({ method, amount: amt, change_due: change });
    if (result?.order?.status === "paid") {
      onClose(true);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal payment-modal">
        <header className="modal-header">
          <button onClick={() => onClose(false)} title="返回"><ChevronLeft size={20} /></button>
          <div><h2>{text(locale, "拆单收款", "Split payment")}</h2><p>{order.order_no}</p></div>
          <button onClick={() => onClose(false)} title="关闭"><X size={20} /></button>
        </header>

        <div className="split-summary">
          <div><span>{text(locale, "订单总额", "Order total")}</span><b>{money(total, currency, locale)}</b></div>
          {paidSoFar > 0 && <div><span>{text(locale, "已收", "Paid")}</span><b className="split-paid-amt">{money(paidSoFar, currency, locale)}</b></div>}
          <div className="split-remaining-row"><span>{text(locale, "待收", "Remaining")}</span><b>{money(remaining, currency, locale)}</b></div>
        </div>

        {isFullyPaid ? (
          <div className="pay-total" style={{ color: "#16a34a", fontSize: "22px" }}>{text(locale, "已全额付清", "Fully paid")} ✓</div>
        ) : (
          <>
            <div className="split-n-bar">
              <span>{text(locale, "均分", "Even split")}</span>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button key={n}
                  className={splitN === n ? "selected" : ""}
                  onClick={() => {
                    const per = Math.round((remaining / n) * 100) / 100;
                    setSplitN(n);
                    setPerPersonAmt(per);
                    setAmount(per.toFixed(2));
                  }}
                >{n}{text(locale, "人", "p")}</button>
              ))}
              <button onClick={() => { setPerPersonAmt(null); setAmount(remaining.toFixed(2)); }}>{text(locale, "全额", "Full amount")}</button>
            </div>
            {perPerson > 0 && (
              <div className="split-per-person">{text(locale, "每份约", "Each about")} <b>{money(perPerson, currency, locale)}</b></div>
            )}
            <div className="choice-grid" style={{ margin: "12px 0" }}>
              {["cash", "card", "qr", "other"].map((m) => (
                <button key={m} className={method === m ? "selected" : ""} onClick={() => setMethod(m)}>{m}</button>
              ))}
            </div>
            <label className="notes-box">
              {text(locale, "收款金额", "Amount received")}
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <div className="totals">
              <span>{text(locale, "应收", "Due")} <b>{money(remaining, currency, locale)}</b></span>
              <span>{text(locale, "实收", "Received")} <b>{money(paid, currency, locale)}</b></span>
              {change > 0 && <strong>{text(locale, "找零", "Change")} <b>{money(change, currency, locale)}</b></strong>}
            </div>
          </>
        )}

        <footer className="modal-footer">
          <button onClick={() => onClose(false)}>{isFullyPaid ? text(locale, "关闭", "Close") : text(locale, "稍后", "Later")}</button>
          {!isFullyPaid && (
            <button className="primary" onClick={handlePay} disabled={busy || paid <= 0}>
              <CircleDollarSign size={18} />
              <span>{text(locale, "收款", "Take payment")} {money(paid, currency, locale)}</span>
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

