"use client";

import { Check, Loader2, X } from "lucide-react";
import { text } from "./pos-helpers";

export default function ConfirmModal({ locale, title, message, confirmLabel, icon, extra, busy, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <section className="modal action-modal">
        <header className="modal-header">
          <button onClick={onCancel} title={text(locale, "关闭", "Close")}><X size={20} /></button>
          <div>
            <h2>{title}</h2>
            <p>{message}</p>
          </div>
          {icon}
        </header>
        {extra && <div className="modal-extra">{extra}</div>}
        <footer className="modal-footer">
          <button onClick={onCancel}>{text(locale, "取消", "Cancel")}</button>
          <button className="primary" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            <span>{confirmLabel}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
