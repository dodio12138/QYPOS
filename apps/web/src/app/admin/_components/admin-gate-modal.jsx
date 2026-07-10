"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../../../lib/api";

function t(locale, zh, en) { return locale === "en-GB" ? en : zh; }

function tabLabelOf(tab, locale = "zh-CN") {
  const label = tab?.[1];
  if (!label) return "";
  if (typeof label === "string") return label;
  return label[locale] || label["zh-CN"] || label["en-GB"] || "";
}

export default function AdminGateModal({ tab, locale, tabs, onCancel, onGranted }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const label = tabLabelOf(tabs.find(([id]) => id === tab), locale) || t(locale, "该栏目", "This section");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const grant = await api("/auth/admin-grant", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), pin, scope: tab })
      });
      window.sessionStorage.setItem("qypos_admin_grant", grant.token);
      await onGranted(tab);
    } catch (caught) {
      setError(caught.message || t(locale, "管理员验证失败", "Admin verification failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onCancel()}>
      <form className="modal" onSubmit={submit} style={{ maxWidth: 420 }}>
        <header className="modal-header">
          <button type="button" onClick={onCancel} title={t(locale, "关闭", "Close")}><X size={20} /></button>
          <div><h2>{label} · {t(locale, "管理员验证", "Admin verification")}</h2></div>
        </header>
        <div className="modal-body" style={{ display: "grid", gap: 12, padding: 20 }}>
          <label>{t(locale, "管理员账号", "Admin account")}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="username" autoFocus /></label>
          <label>PIN<input type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="current-password" /></label>
          {error && <div className="inline-error">{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onCancel}>{t(locale, "取消", "Cancel")}</button>
            <button className="primary" type="submit" disabled={busy || !name.trim() || !pin}>{busy ? t(locale, "验证中…", "Verifying…") : t(locale, "验证并进入", "Verify and enter")}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
