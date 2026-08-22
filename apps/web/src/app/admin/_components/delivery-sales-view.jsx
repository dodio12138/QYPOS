"use client";

import { useEffect, useState } from "react";
import { CloudDownload, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { api, money, t, getLocalToday } from "./helpers";

function localIso(date, time) {
  return new Date(`${date}T${time}`).toISOString();
}

export default function DeliverySalesView({ locale, currency, onNotify }) {
  const [session, setSession] = useState({ configured: false });
  const [snapshots, setSnapshots] = useState([]);
  const [uberSession, setUberSession] = useState({ configured: false });
  const [uberSnapshots, setUberSnapshots] = useState([]);
  const [token, setToken] = useState("");
  const [uberCookie, setUberCookie] = useState("");
  const [autoSync, setAutoSync] = useState({ enabled: false, times: ["14:00", "23:00"], timezone: "Europe/London" });
  const [restaurantId, setRestaurantId] = useState("b3471dbf-0a81-4fdb-9f50-4133b2701e43");
  const [orgId, setOrgId] = useState("574520");
  const [startDate, setStartDate] = useState(getLocalToday());
  const [endDate, setEndDate] = useState(getLocalToday());
  const [periodStart, setPeriodStart] = useState("11:00");
  const [periodEnd, setPeriodEnd] = useState("15:00");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const results = await Promise.allSettled([
      api("/ops/integrations/deliveroo/session"),
      api("/ops/integrations/deliveroo/snapshots"),
      api("/ops/integrations/ubereats/session"),
      api("/ops/integrations/ubereats/snapshots"),
      api("/ops/integrations/auto-sync")
    ]);
    const read = (index, fallback) => results[index]?.status === "fulfilled"
      ? results[index].value
      : fallback;
    const connection = read(0, { configured: false, error: results[0]?.reason?.message || "连接状态读取失败" });
    const history = read(1, []);
    const uberConnection = read(2, { configured: false, error: results[2]?.reason?.message || "连接状态读取失败" });
    const uberHistory = read(3, []);
    const autoSyncSettings = read(4, { enabled: false, times: ["14:00", "23:00"], timezone: "Europe/London" });
    setSession(connection);
    setSnapshots(history);
    setUberSession(uberConnection);
    setUberSnapshots(uberHistory);
    setAutoSync(autoSyncSettings);
    if (connection.restaurant_id) setRestaurantId(connection.restaurant_id);
    if (connection.org_id) setOrgId(connection.org_id);
  }

  useEffect(() => { refresh().catch((error) => onNotify(error.message)); }, [onNotify]);

  async function updateAutoSync(enabled) {
    const previous = autoSync;
    setAutoSync({ ...previous, enabled });
    setBusy(true);
    try {
      const next = await api("/ops/integrations/auto-sync", { method: "PUT", body: JSON.stringify({ enabled }) });
      setAutoSync(next);
      onNotify(t(locale, enabled ? "已开启每天 14:00 和 23:00 自动同步" : "已关闭每天两次自动同步", enabled ? "Automatic sync enabled for 14:00 and 23:00" : "Twice-daily automatic sync disabled"));
    } catch (error) {
      setAutoSync(previous);
      onNotify(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSession(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const next = await api("/ops/integrations/deliveroo/session", {
        method: "POST",
        body: JSON.stringify({ token, restaurant_id: restaurantId, org_id: orgId })
      });
      setSession(next);
      setToken("");
      onNotify(t(locale, "Deliveroo 临时登录已保存 12 小时", "Deliveroo session saved for 12 hours"));
    } catch (error) { onNotify(error.message); }
    finally { setBusy(false); }
  }

  async function clearSession() {
    setBusy(true);
    try {
      await api("/ops/integrations/deliveroo/session", { method: "DELETE" });
      setSession({ configured: false });
      setToken("");
      onNotify(t(locale, "Deliveroo 临时登录已清除", "Deliveroo session cleared"));
    } catch (error) { onNotify(error.message); }
    finally { setBusy(false); }
  }

  async function saveUberSession(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const next = await api("/ops/integrations/ubereats/session", {
        method: "POST",
        body: JSON.stringify({ cookie: uberCookie })
      });
      setUberSession(next);
      setUberCookie("");
      onNotify(t(locale, "Uber Eats Cookie 已加密保存 12 小时", "Uber Eats Cookie saved encrypted for 12 hours"));
    } catch (error) { onNotify(error.message); }
    finally { setBusy(false); }
  }

  async function clearUberSession() {
    setBusy(true);
    try {
      await api("/ops/integrations/ubereats/session", { method: "DELETE" });
      setUberSession({ configured: false });
      setUberCookie("");
      onNotify(t(locale, "Uber Eats 会话已清除", "Uber Eats session cleared"));
    } catch (error) { onNotify(error.message); }
    finally { setBusy(false); }
  }

  async function syncSales(event, syncToNow = false) {
    event.preventDefault();
    setBusy(true);
    try {
      const now = new Date();
      const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const effectiveEndDate = syncToNow ? getLocalToday() : endDate;
      const effectiveEndTime = syncToNow ? nowTime : periodEnd;
      const result = await api("/ops/integrations/deliveroo/sync", {
        method: "POST",
        body: JSON.stringify({
          business_date: startDate,
          period_start: localIso(startDate, periodStart),
          period_end: syncToNow ? now.toISOString() : localIso(effectiveEndDate, effectiveEndTime)
        })
      });
      setSnapshots((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      onNotify(t(locale, `已同步 ${startDate} ${periodStart} 至 ${effectiveEndDate} ${effectiveEndTime}，共 ${result.delivered_order_count} 笔 Deliveroo 订单`, `Synced ${startDate} ${periodStart} to ${effectiveEndDate} ${effectiveEndTime}; ${result.delivered_order_count} Deliveroo orders`));
    } catch (error) { onNotify(error.message); }
    finally { setBusy(false); }
  }

  async function syncUberSales(event, syncToNow = false) {
    event.preventDefault();
    setBusy(true);
    try {
      const now = new Date();
      const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const effectiveEndDate = syncToNow ? getLocalToday() : endDate;
      const effectiveEndTime = syncToNow ? nowTime : periodEnd;
      const result = await api("/ops/integrations/ubereats/sync", {
        method: "POST",
        body: JSON.stringify({
          business_date: startDate,
          period_start: localIso(startDate, periodStart),
          period_end: syncToNow ? now.toISOString() : localIso(effectiveEndDate, effectiveEndTime)
        })
      });
      setUberSnapshots((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      onNotify(t(locale, `已同步 ${startDate} ${periodStart} 至 ${effectiveEndDate} ${effectiveEndTime}，共 ${result.delivered_order_count} 笔 Uber Eats 订单`, `Synced ${startDate} ${periodStart} to ${effectiveEndDate} ${effectiveEndTime}; ${result.delivered_order_count} Uber Eats orders`));
    } catch (error) { onNotify(error.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="settings-top delivery-reconciliation-page">
      <section className="delivery-page-intro">
        <div>
          <span className="delivery-page-kicker">{t(locale, "平台对账中心", "Platform reconciliation")}</span>
          <h2>{t(locale, "外卖", "Delivery")}</h2>
          <p className="muted">{t(locale, "请从平台后台复制最新 token 或 Cookie 保存连接，再选择时间范围按平台同步。两个平台的连接和同步状态互不影响。", "Save a fresh token or Cookie copied from each provider, choose a period, then sync each platform independently. Connection and sync states are isolated.")}</p>
        </div>
        <button type="button" className="link-button" onClick={() => refresh()} disabled={busy}><RefreshCw size={16} />{t(locale, "刷新状态", "Refresh status")}</button>
      </section>
      <section className="panel settings-section delivery-session-section">
        <div className="panel-title"><KeyRound size={18} /><h2>{t(locale, "Deliveroo 临时连接", "Deliveroo session")}</h2></div>
        <p className="muted">{t(locale, "只用于读取营业额，token 会加密保存在 PostgreSQL，Redis 仅作缓存；过期后再从浏览器刷新一次。", "Read-only sales access. The token is encrypted in PostgreSQL, with Redis used only as a cache; refresh it in the browser only after expiry.")}</p>
        <form className="settings-form" onSubmit={saveSession}>
          <div className="settings-fields">
            <label>{t(locale, "餐厅 ID（已固定）", "Restaurant ID (fixed)")}<input value={restaurantId} readOnly /></label>
            <label>{t(locale, "组织 ID（已固定）", "Organisation ID (fixed)")}<input value={orgId} readOnly /></label>
            <label>{t(locale, "网页 token（不会回显）", "Web token (never echoed)")}<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" required={!session.configured} /></label>
          </div>
          <div className="settings-actions">
            <button className="primary" type="submit" disabled={busy || !token.trim()}><KeyRound size={16} /><span>{t(locale, "保存临时连接", "Save session")}</span></button>
            <button type="button" onClick={clearSession} disabled={busy || (!session.configured && !session.expired)}><Trash2 size={16} /><span>{t(locale, "清除 token", "Clear token")}</span></button>
            {session.configured && <span className="delivery-status is-connected">{t(locale, "已连接，过期时间：", "Connected; expires: ")}{session.expires_at ? new Date(session.expires_at).toLocaleString(locale) : t(locale, "未知", "unknown")}</span>}
            {session.expired && <span className="delivery-status is-expired">{t(locale, "连接已过期，请重新粘贴 token", "Session expired; paste a fresh token")}{session.expires_at ? ` · ${new Date(session.expires_at).toLocaleString(locale)}` : ""}</span>}
            {session.error && <span className="delivery-status is-error">{session.error}</span>}
          </div>
        </form>
      </section>

      <section className="panel settings-section delivery-session-section">
        <div className="panel-title"><KeyRound size={18} /><h2>{t(locale, "Uber Eats 临时连接", "Uber Eats session")}</h2></div>
        <p className="muted">{t(locale, "只读取 Uber Eats 后台订单。请从 merchants.ubereats.com 的成功请求复制完整 Cookie；Cookie 会加密保存在 PostgreSQL，不会回显。", "Read-only Uber Eats order access. Paste the full Cookie header from a successful merchants.ubereats.com request; it is encrypted in PostgreSQL and never echoed.")}</p>
        <form className="settings-form" onSubmit={saveUberSession}>
          <div className="settings-fields">
            <label>{t(locale, "门店 ID（已固定）", "Restaurant ID (fixed)")}<input value="e367614a-0810-5539-b98a-337f3e0ef1cd" readOnly /></label>
            <label>{t(locale, "网页 Cookie（不会回显）", "Web Cookie (never echoed)")}<textarea rows="4" value={uberCookie} onChange={(event) => setUberCookie(event.target.value)} autoComplete="off" placeholder="Cookie: ..." required={!uberSession.configured} /></label>
          </div>
          <div className="settings-actions">
            <button className="primary" type="submit" disabled={busy || !uberCookie.trim()}><KeyRound size={16} /><span>{t(locale, "保存 Uber Eats 会话", "Save Uber Eats session")}</span></button>
            <button type="button" onClick={clearUberSession} disabled={busy || (!uberSession.configured && !uberSession.expired)}><Trash2 size={16} /><span>{t(locale, "清除 Cookie", "Clear Cookie")}</span></button>
            {uberSession.configured && <span className="delivery-status is-connected">{t(locale, "已连接，过期时间：", "Connected; expires: ")}{uberSession.expires_at ? new Date(uberSession.expires_at).toLocaleString(locale) : t(locale, "未知", "unknown")}</span>}
            {uberSession.expired && <span className="delivery-status is-expired">{t(locale, "连接已过期，请重新粘贴 Cookie", "Session expired; paste a fresh Cookie")}{uberSession.expires_at ? ` · ${new Date(uberSession.expires_at).toLocaleString(locale)}` : ""}</span>}
            {uberSession.error && <span className="delivery-status is-error">{uberSession.error}</span>}
          </div>
        </form>
      </section>

      <section className="panel settings-section delivery-sync-section delivery-period-section">
        <div className="panel-title"><CloudDownload size={18} /><h2>{t(locale, "营业额同步", "Sales sync")}</h2></div>
        <p className="muted">{t(locale, "可以定义完整的开始/结束日期和时间；“同步到当前时间”会把结束点改为此刻。自动同步需要在下方开关中主动开启。", "Define complete start/end dates and times; “Sync to now” changes the end point to the current moment. Automatic sync must be enabled below.")}</p>
        <div className="delivery-auto-sync-setting">
          <label className="checkbox"><input type="checkbox" checked={Boolean(autoSync.enabled)} onChange={(event) => updateAutoSync(event.target.checked)} disabled={busy} /><b>{t(locale, "开启每天两次自动同步", "Enable twice-daily automatic sync")}</b></label>
          <span className="muted">{t(locale, `英国时间 ${autoSync.times?.join(" 和 ") || "14:00 和 23:00"} 自动同步`, `Runs at ${autoSync.times?.join(" and ") || "14:00 and 23:00"} UK time`)}</span>
        </div>
        <form className="settings-form" onSubmit={(event) => syncSales(event, false)}>
          <div className="settings-fields">
            <label>{t(locale, "开始日期", "Start date")}<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label>
            <label>{t(locale, "开始时间", "Start time")}<input type="time" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required /></label>
            <label>{t(locale, "结束日期", "End date")}<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label>
            <label>{t(locale, "结束时间", "End time")}<input type="time" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required /></label>
          </div>
          <div className="delivery-platform-actions">
            <div className="delivery-platform-action">
              <strong>{t(locale, "Deliveroo", "Deliveroo")}</strong>
              <div className="settings-actions"><button className="primary" type="submit" disabled={busy || !session.configured} title={!session.configured ? t(locale, "请先更新 Deliveroo token", "Refresh the Deliveroo token first") : ""}><RefreshCw size={16} /><span>{busy ? t(locale, "同步中…", "Syncing…") : session.expired ? t(locale, "请先刷新 token", "Refresh token first") : t(locale, "同步选定时段", "Sync selected period")}</span></button><button type="button" onClick={(event) => syncSales(event, true)} disabled={busy || !session.configured}><RefreshCw size={16} /><span>{t(locale, "同步到当前时间", "Sync to now")}</span></button></div>
            </div>
            <div className="delivery-platform-action">
              <strong>{t(locale, "Uber Eats", "Uber Eats")}</strong>
              <div className="settings-actions"><button className="primary" type="button" onClick={(event) => syncUberSales(event, false)} disabled={busy || !uberSession.configured} title={!uberSession.configured ? t(locale, "请先更新 Uber Eats Cookie", "Refresh the Uber Eats Cookie first") : ""}><RefreshCw size={16} /><span>{busy ? t(locale, "同步中…", "Syncing…") : uberSession.expired ? t(locale, "请先刷新 Cookie", "Refresh Cookie first") : t(locale, "同步选定时段", "Sync selected period")}</span></button><button type="button" onClick={(event) => syncUberSales(event, true)} disabled={busy || !uberSession.configured}><RefreshCw size={16} /><span>{t(locale, "同步到当前时间", "Sync to now")}</span></button></div>
            </div>
          </div>
        </form>
      </section>

      <section className="panel settings-section">
        <div className="panel-title"><CloudDownload size={18} /><h2>{t(locale, "同步记录", "Sync history")}</h2></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>{t(locale, "日期", "Date")}</th><th>{t(locale, "时段", "Period")}</th><th>{t(locale, "已送达订单", "Delivered")}</th><th>{t(locale, "营业额", "Gross sales")}</th><th>{t(locale, "同步时间", "Synced")}</th></tr></thead><tbody>
          {snapshots.map((item) => <tr key={item.id}><td>{item.business_date}</td><td>{new Date(item.period_start).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} - {new Date(item.period_end).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</td><td>{item.delivered_order_count}</td><td>{money(item.gross_amount, currency, locale)}</td><td>{new Date(item.synced_at).toLocaleString(locale)}</td></tr>)}
          {!snapshots.length && <tr><td colSpan="5" className="muted">{t(locale, "暂无同步记录", "No sync history")}</td></tr>}
        </tbody></table></div>
      </section>

      <section className="panel settings-section">
        <div className="panel-title"><CloudDownload size={18} /><h2>{t(locale, "Uber Eats 同步记录", "Uber Eats sync history")}</h2></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>{t(locale, "日期", "Date")}</th><th>{t(locale, "时段", "Period")}</th><th>{t(locale, "已完成订单", "Completed")}</th><th>{t(locale, "营业额", "Gross sales")}</th><th>{t(locale, "同步时间", "Synced")}</th></tr></thead><tbody>
          {uberSnapshots.map((item) => <tr key={item.id}><td>{item.business_date}</td><td>{new Date(item.period_start).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} - {new Date(item.period_end).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</td><td>{item.delivered_order_count}</td><td>{money(item.gross_amount, currency, locale)}</td><td>{new Date(item.synced_at).toLocaleString(locale)}</td></tr>)}
          {!uberSnapshots.length && <tr><td colSpan="5" className="muted">{t(locale, "暂无 Uber Eats 同步记录", "No Uber Eats sync history")}</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
