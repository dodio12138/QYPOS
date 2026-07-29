"use client";

import { useState } from "react";
import { Gift, X } from "lucide-react";
import { api } from "../../lib/api";
import { text } from "./pos-helpers";

export default function ComplimentaryAdminModal({ locale, onCancel, onApply }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
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
      await onApply({ reason: reason.trim(), note: note.trim() });
    } catch (caught) {
      setError(caught.message || text(locale, "免单结账失败", "Complimentary checkout failed"));
    } finally {
      if (granted) {
        try {
          await api("/auth/admin-grant", { method: "DELETE" });
        } catch {
          // The short-lived grant will expire server-side.
        }
      }
      window.sessionStorage.removeItem("qypos_admin_grant");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <form className="modal" onSubmit={submit} style={{ maxWidth: 440 }}>
        <header className="modal-header">
          <button type="button" onClick={onCancel} disabled={busy} title={text(locale, "关闭", "Close")}><X size={20} /></button>
          <div><h2><Gift size={20} /> {text(locale, "免单结账 · 管理员验证", "Complimentary checkout · Admin verification")}</h2></div>
        </header>
        <div className="modal-body" style={{ display: "grid", gap: 12, padding: 20 }}>
          <label>{text(locale, "免单原因", "Reason")}<input value={reason} onChange={(event) => setReason(event.target.value)} autoFocus /></label>
          <label>{text(locale, "追加备注（可选）", "Additional note (optional)")}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label>
          <label>{text(locale, "管理员账号", "Admin account")}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="username" /></label>
          <label>{text(locale, "管理员 PIN", "Admin PIN")}<input type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="current-password" /></label>
          {error && <div className="inline-error">{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onCancel} disabled={busy}>{text(locale, "取消", "Cancel")}</button>
            <button className="primary" type="submit" disabled={busy || !reason.trim() || !name.trim() || !pin}>
              {busy ? text(locale, "验证并结账中…", "Verifying and closing…") : text(locale, "确认免单结账", "Confirm complimentary checkout")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
