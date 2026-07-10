"use client";

import { Check, Loader2, Trash2, X } from "lucide-react";
import { text, money, statusLabel } from "./pos-helpers";

export default function TableActionModal({ table, locale, currency, busy, isSelected, onClose, onOpen, onClear }) {
  const isAvailable = table.status === "available";
  const needsCleaning = table.status === "needs_cleaning";
  const hasOrder = Boolean(table.current_order_id);
  const hasItems = Number(table.current_item_count || 0) > 0;
  const canClear = needsCleaning || !hasOrder || !hasItems;

  return (
    <div className="modal-backdrop">
      <section className="modal action-modal">
        <header className="modal-header">
          <button onClick={onClose} title={text(locale, "关闭", "Close")}><X size={20} /></button>
          <div>
            <h2>{text(locale, "桌台", "Table")} {table.label}</h2>
            <p>{statusLabel(table.status, locale)} · {table.seats} seats</p>
          </div>
          <span className={`status-badge ${table.status}`}>{statusLabel(table.status, locale)}</span>
        </header>
        <div className="action-summary">
          {Number(table.current_total) > 0 && <strong>{money(table.current_total, currency, locale)}</strong>}
          {isSelected && <span>{text(locale, "当前正在操作此桌", "This table is currently selected")}</span>}
          {needsCleaning && <span>{text(locale, "付款已完成，可以清台。", "Payment is complete. You can clear the table.")}</span>}
          {isAvailable && <span>{text(locale, "确认后才会开台，避免误触。", "Confirm to open the table and avoid accidental taps.")}</span>}
          {!isAvailable && !needsCleaning && hasItems && <span>{text(locale, "可继续点单；如需清台，请先完成付款。", "You can keep ordering. Pay first if you want to clear the table.")}</span>}
          {!isAvailable && !needsCleaning && !hasItems && <span>{text(locale, "此桌还没有点菜，可以直接清台。", "No items have been ordered yet, so you can clear the table.")}</span>}
        </div>
        <footer className="modal-footer">
          <button onClick={onClose}>{text(locale, "取消", "Cancel")}</button>
          {canClear && (
            <button onClick={onClear} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
              <span>{needsCleaning || hasOrder ? text(locale, "清台", "Clear table") : text(locale, "保持空桌", "Keep available")}</span>
            </button>
          )}
          <button className="primary" onClick={onOpen} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            <span>{isAvailable ? text(locale, "确认开台", "Open table") : needsCleaning ? text(locale, "新建订单", "New order") : text(locale, "继续点单", "Continue ordering")}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
