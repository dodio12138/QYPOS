"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { text } from "./pos-helpers";
import { api } from "../../lib/api";

export default function DiscountAdminModal({ locale, onCancel, onApply }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let granted = false;
    try {
      const grant = await api("/auth/admin-grant", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), pin, scope: "discount" })
      });
      window.sessionStorage.setItem("qypos_admin_grant", grant.token);
      granted = true;
      await onApply();
    } catch (caught) {
      setError(caught.message || text(locale, "管理员验证失败", "Admin verification failed"));
    } finally {
      if (granted) { try { await api("/auth/admin-grant", { method: "DELETE" }); } catch { /* grant expires server-side */ } }
      window.sessionStorage.removeItem("qypos_admin_grant");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <form className="modal" onSubmit={submit} style={{ maxWidth: 420 }}>
        <header className="modal-header">
          <button type="button" onClick={onCancel} disabled={busy} title={text(locale, "关闭", "Close")}><X size={20} /></button>
          <div><h2>{text(locale, "折扣 · 管理员验证", "Discount · Admin verification")}</h2></div>
        </header>
        <div className="modal-body" style={{ display: "grid", gap: 12, padding: 20 }}>
          <label>{text(locale, "管理员账号", "Admin account")}<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoFocus /></label>
          <label>{text(locale, "管理员 PIN", "Admin PIN")}<input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="current-password" /></label>
          {error && <div className="inline-error">{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onCancel} disabled={busy}>{text(locale, "取消", "Cancel")}</button>
            <button className="primary" type="submit" disabled={busy || !name.trim() || !pin}>{busy ? text(locale, "验证并应用中…", "Verifying and applying…") : text(locale, "验证并应用", "Verify and apply")}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
