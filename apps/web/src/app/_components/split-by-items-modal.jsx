"use client";
import { useState } from "react";
import { Check, ChevronLeft, Loader2, Minus, Plus, X } from "lucide-react";
import { text, money } from "./pos-helpers";
import { labelOf } from "../../lib/api";
export default function SplitByItemsModal({ order, locale, currency, busy, onClose, onSplit }) {
  const [personCount, setPersonCount] = useState(2);
  const [assignments, setAssignments] = useState(() => {
    const init = {};
    for (const item of order.items ?? []) init[item.id] = {};
    return init;
  });

  const personLabels = ["客人A", "客人B", "客人C", "客人D", "客人E", "客人F", "客人G", "客人H", "客人I", "客人J"];

  function getA(itemId, pi) { return assignments[itemId]?.[pi] ?? 0; }

  function togglePerson(itemId, pi) {
    setAssignments(prev => {
      const cur = prev[itemId]?.[pi] ?? 0;
      return { ...prev, [itemId]: cur ? {} : { [pi]: 1 } };
    });
  }

  function setQty(itemId, pi, val, item) {
    const qty = Number(item.quantity);
    setAssignments(prev => {
      const itemA = { ...(prev[itemId] ?? {}) };
      itemA[pi] = Math.max(0, Math.min(val, qty));
      return { ...prev, [itemId]: itemA };
    });
  }

  function itemUnit(item) {
    return Number(item.unit_price ?? 0) + (item.modifiers ?? []).reduce((s, m) => s + Number(m.price_delta ?? 0), 0);
  }

  const personTotals = Array.from({ length: personCount }, (_, pi) =>
    (order.items ?? []).reduce((s, item) => s + getA(item.id, pi) * itemUnit(item), 0)
  );

  const unassigned = (order.items ?? []).filter(item => {
    const tot = Object.values(assignments[item.id] ?? {}).reduce((s, q) => s + q, 0);
    return tot < Number(item.quantity);
  });

  function handleConfirm() {
    const splits = Array.from({ length: personCount }, (_, pi) => ({
      label: personLabels[pi],
      items: (order.items ?? [])
        .filter(item => (assignments[item.id]?.[pi] ?? 0) > 0)
        .map(item => ({ id: item.id, quantity: assignments[item.id][pi] }))
    })).filter(s => s.items.length > 0);
    if (splits.length < 2) return;
    onSplit(splits);
  }

  return (
    <div className="modal-backdrop">
      <section className="modal split-items-modal">
        <header className="modal-header">
          <button onClick={onClose}><ChevronLeft size={20} /></button>
          <div><h2>{text(locale, "分单—按菜品分配", "Split order by item")}</h2><p>{order.order_no}</p></div>
          <button onClick={onClose}><X size={20} /></button>
        </header>

        <div className="split-person-bar">
          <span>{text(locale, "人数", "People")}</span>
          {[2,3,4,5,6,7,8,9,10].map(n => (
            <button key={n} className={personCount === n ? "selected" : ""}
              onClick={() => setPersonCount(n)}>{n}{text(locale, "人", "p")}</button>
          ))}
        </div>

        <div className="split-items-list">
          {(order.items ?? []).map(item => {
            const qty = Number(item.quantity);
            const unit = itemUnit(item);
            const totAssigned = Object.values(assignments[item.id] ?? {}).reduce((s, q) => s + q, 0);
            const remain = qty - totAssigned;
            return (
              <div key={item.id} className={`split-item-row${remain > 0 ? " unassigned" : ""}`}>
                <div className="split-item-name">
                  <span>{labelOf(item.name_i18n, locale)}</span>
                  <span className="split-item-price">{money(unit, currency, locale)}{qty > 1 ? ` ×${qty}` : ""}</span>
                </div>
                {qty === 1 ? (
                  <div className="split-person-btns">
                    {Array.from({ length: personCount }, (_, pi) => (
                      <button key={pi}
                        className={`split-person-btn${getA(item.id, pi) ? " selected" : ""}`}
                        onClick={() => togglePerson(item.id, pi)}>
                        {personLabels[pi].slice(-1)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="split-qty-controls">
                    {Array.from({ length: personCount }, (_, pi) => {
                      const a = getA(item.id, pi);
                      return (
                        <div key={pi} className="split-qty-person">
                          <span>{personLabels[pi].slice(-1)}</span>
                          <button onClick={() => setQty(item.id, pi, a - 1, item)} disabled={a <= 0}>−</button>
                          <span className="split-qty-num">{a}</span>
                          <button onClick={() => setQty(item.id, pi, a + 1, item)} disabled={remain <= 0 && a < qty}>+</button>
                        </div>
                      );
                    })}
                    {remain > 0 && <span className="split-unassigned-badge">{text(locale, `剩${remain}`, `Left ${remain}`)}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="split-person-totals">
          {Array.from({ length: personCount }, (_, pi) => (
            <div key={pi} className="split-person-total-row">
              <span>{personLabels[pi]}</span>
              <b>{money(personTotals[pi], currency, locale)}</b>
            </div>
          ))}
        </div>

        {unassigned.length > 0 && (
          <div className="split-warning">{text(locale, `还有 ${unassigned.length} 项未分配完毕`, `${unassigned.length} items still unassigned`)}</div>
        )}

        <footer className="modal-footer">
          <button onClick={onClose}>{text(locale, "取消", "Cancel")}</button>
          <button className="primary" onClick={handleConfirm} disabled={unassigned.length > 0 || busy}>
            <Users size={18} /><span>{text(locale, "确认分单", "Confirm split")}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

