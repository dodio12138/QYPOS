"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { api } from "../../../lib/api";
import qyposLogo from "../../../pic/logo.png";

function t(locale, zh, en) { return locale === "en-GB" ? en : zh; }

export default function AdminLogin({ onLogin }) {
  const [name, setName] = useState("Owner");
  const [pin, setPin] = useState("0000");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ name, pin })
      });
      window.localStorage.setItem("qypos_token", result.token);
      await onLogin(result.user);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand login-brand">
          <img className="brand-logo login-logo" src={qyposLogo.src} alt="QYPOS" />
          <span>QYPOS</span>
        </div>
        <h1>{t("zh-CN", "后台登录", "Admin Login")}</h1>
        <label>{t("zh-CN", "员工名", "Username")}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="username" /></label>
        <label>PIN<input value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="current-password" type="password" /></label>
        {error && <div className="inline-error">{error}</div>}
        <button className="primary" type="submit" disabled={busy}><User size={18} /><span>{busy ? t("zh-CN", "登录中", "Logging in") : t("zh-CN", "登录", "Log in")}</span></button>
        <a className="link-button" href="/">{t("zh-CN", "返回前台点菜", "Back to POS")}</a>
      </form>
    </main>
  );
}
