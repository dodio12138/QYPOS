"use client";

import { useState } from "react";
import { Loader2, UserRound, WifiOff } from "lucide-react";
import { text } from "./pos-helpers";
import qyposLogo from "../../pic/logo.png";

export default function PosLogin({ notice, online, apiOnline, busy, locale, onLogin }) {
  const [name, setName] = useState("Cashier");
  const [pin, setPin] = useState("1111");

  return (
    <section className="login-panel pos-login-panel">
      <div className="brand login-brand">
        <img className="brand-logo login-logo" src={qyposLogo.src} alt="QYPOS" />
        <span>QYPOS</span>
      </div>
      <h1>{text(locale, "点餐前台登录", "POS sign in")}</h1>
      <p>{text(locale, "开台、点餐、打印和收款需要员工账号。", "Open tables, order, print, and take payment with a staff account.")}</p>
      {!online && <div className="offline-banner"><WifiOff size={16} />{text(locale, "当前离线，无法登录。", "You're offline, so sign-in is unavailable.")}</div>}
      {online && !apiOnline && <div className="offline-banner"><WifiOff size={16} />{text(locale, "本地 API 暂不可用，请检查 Docker 服务。", "The local API is unavailable. Check the Docker service.")}</div>}
      {notice && <div className="inline-error">{notice}</div>}
      <form onSubmit={(event) => { event.preventDefault(); onLogin({ name, pin }); }}>
        <label>{text(locale, "员工", "Staff")}<input value={name} onChange={(e) => setName(e.target.value)} placeholder={text(locale, "Cashier", "Cashier")} autoComplete="username" /></label>
        <label>PIN<input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="1111" autoComplete="current-password" /></label>
        <button className="primary wide-button" type="submit" disabled={busy || !name || !pin}>
          {busy ? <Loader2 className="spin" size={18} /> : <UserRound size={18} />}
          <span>{text(locale, "登录点餐", "Sign in")}</span>
        </button>
      </form>
    </section>
  );
}
