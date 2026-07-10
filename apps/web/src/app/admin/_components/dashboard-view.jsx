"use client";

import { useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { api, labelOf } from "../../../lib/api";

function t(locale, zh, en) { return locale === "en-GB" ? en : zh; }
function money(value, currency = "CNY", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value || 0));
}
function pctDelta(curr, prev) {
  const c = Number(curr||0), p = Number(prev||0);
  if (!p) return null;
  return Math.round(((c-p)/p)*1000)/10;
}

export default function Dashboard({ dashboard, auditLogs, locale, currency }) {
  const summary = dashboard?.summary || {};
  const yesterdaySummary = dashboard?.yesterdaySummary || null;
  const [auditCollapsed, setAuditCollapsed] = useState(true);
  const [auditTimeFilter, setAuditTimeFilter] = useState("all");
  const [auditUserFilter, setAuditUserFilter] = useState("all");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditFrom, setAuditFrom] = useState(() => {
    const date = new Date(); date.setHours(0,0,0,0);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T00:00`;
  });
  const [auditTo, setAuditTo] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
  });

  const auditUsers = [...new Map((auditLogs || []).map((log) => [log.actor_id || "system", log.actor_name || "System"])).entries()].sort((a, b) => a[1].localeCompare(b[1], locale));
  const auditActions = [...new Set((auditLogs || []).map((log) => log.action).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const filteredAuditLogs = (auditLogs || []).filter((log) => {
    const actorKey = log.actor_id || "system";
    if (auditUserFilter !== "all" && actorKey !== auditUserFilter) return false;
    if (auditActionFilter !== "all" && log.action !== auditActionFilter) return false;
    if (auditTimeFilter === "all") return true;
    const createdAt = new Date(log.created_at);
    if (auditTimeFilter === "custom") {
      const from = auditFrom ? new Date(auditFrom) : null;
      const to = auditTo ? new Date(auditTo) : null;
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      return true;
    }
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate()+1);
    if (auditTimeFilter === "today") return createdAt >= todayStart && createdAt < tomorrowStart;
    if (auditTimeFilter === "yesterday") {
      const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate()-1);
      return createdAt >= yesterdayStart && createdAt < todayStart;
    }
    const days = auditTimeFilter === "7d" ? 7 : 30;
    return createdAt >= new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  });

  return (
    <div className="dashboard">
      {[[t(locale,"营业额","Revenue"),"revenue"],[t(locale,"折扣","Discount"),"discount"],[t(locale,"净销售额","Net sales"),"net_sales"],["Tax","tax"],[t(locale,"服务费","Service charge"),"service_charge"],[t(locale,"客单价","Average ticket"),"average_ticket"]].map(([label, key]) => {
        const value = summary[key];
        const currNum = Number(value || 0);
        const prevNum = yesterdaySummary ? Number(yesterdaySummary[key] || 0) : null;
        const delta = yesterdaySummary ? pctDelta(value, yesterdaySummary[key]) : null;
        return (
          <section className="metric" key={label}>
            <span>{label}</span>
            <strong>{money(value, currency, locale)}</strong>
            {delta != null && (
              <span className={`reports-delta ${delta >= 0 ? "up" : "down"}`}>
                {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {delta >= 0 ? "+" : ""}{delta}% <small className="muted">{t(locale, "较昨日", "vs yesterday")}</small>
              </span>
            )}
            {delta == null && prevNum === 0 && currNum > 0 && (
              <span className="reports-delta up"><TrendingUp size={13} />{t(locale, "新增", "New")} <small className="muted">{t(locale, "较昨日", "vs yesterday")}</small></span>
            )}
            {delta == null && prevNum === 0 && currNum === 0 && (
              <span className="reports-delta flat">{t(locale, "持平", "Flat")} <small className="muted">{t(locale, "较昨日", "vs yesterday")}</small></span>
            )}
          </section>
        );
      })}
      <section className="wide-list dashboard-list report-hot-items">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>{t(locale, "热销菜品", "Top items")}</h2>
          <small className="muted">{t(locale, "顶部为今日热销", "Top items for today")}</small>
        </div>
        <div className="hot-items-grid" style={{ marginTop: 10 }}>
          {(dashboard?.hotItems || []).map((item) => (
            <div className="hot-item-card" key={labelOf(item.name_i18n, locale)}>
              <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#000' }}>{labelOf(item.name_i18n, locale)}</strong>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span className="muted">{t(locale, "销量", "Qty")} {item.quantity}</span>
                <strong style={{ fontSize: 14, color: '#000' }}>{money(item.sales, currency, locale)}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="wide-list dashboard-list">
        <div className="audit-log-head">
          <div><h2>{t(locale, "审计日志", "Audit log")}</h2><span>{filteredAuditLogs.length} {t(locale, "条", "entries")}</span></div>
          <div className="audit-log-filters">
            <label>{t(locale, "时间", "Time")}<select value={auditTimeFilter} onChange={(e) => { setAuditTimeFilter(e.target.value); setAuditCollapsed(true); }}>
              <option value="all">{t(locale, "全部时间", "All time")}</option>
              <option value="today">{t(locale, "今天", "Today")}</option>
              <option value="yesterday">{t(locale, "昨天", "Yesterday")}</option>
              <option value="7d">{t(locale, "近 7 天", "Last 7 days")}</option>
              <option value="30d">{t(locale, "近 30 天", "Last 30 days")}</option>
              <option value="custom">{t(locale, "自定义范围", "Custom range")}</option>
            </select></label>
            {auditTimeFilter === "custom" && <>
              <label>{t(locale, "开始时间", "From")}<input type="datetime-local" value={auditFrom} max={auditTo || undefined} onChange={(e) => { setAuditFrom(e.target.value); setAuditCollapsed(true); }} /></label>
              <label>{t(locale, "结束时间", "To")}<input type="datetime-local" value={auditTo} min={auditFrom || undefined} onChange={(e) => { setAuditTo(e.target.value); setAuditCollapsed(true); }} /></label>
            </>}
            <label>{t(locale, "用户", "User")}<select value={auditUserFilter} onChange={(e) => { setAuditUserFilter(e.target.value); setAuditCollapsed(true); }}>
              <option value="all">{t(locale, "全部用户", "All users")}</option>
              {auditUsers.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
            </select></label>
            <label>{t(locale, "具体操作", "Action")}<select className="audit-action-select" value={auditActionFilter} onChange={(e) => { setAuditActionFilter(e.target.value); setAuditCollapsed(true); }}>
              <option value="all">{t(locale, "全部操作", "All actions")}</option>
              {auditActions.map((action) => <option value={action} key={action}>{action}</option>)}
            </select></label>
            {filteredAuditLogs.length > 6 && <button className="link-button" onClick={() => setAuditCollapsed((s) => !s)}>{auditCollapsed ? t(locale, "显示更多", "Show more") : t(locale, "收起", "Collapse")}</button>}
          </div>
        </div>
        {filteredAuditLogs.slice(0, auditCollapsed ? 6 : 100).map((log) => (
          <div className="list-row audit-row" key={log.id}>
            <span>{log.action}</span><span>{log.actor_name || "System"}</span><span>{log.entity_type}</span>
            <small>{new Date(log.created_at).toLocaleString(locale)}</small>
          </div>
        ))}
        {!filteredAuditLogs.length && <div className="empty">{t(locale, "当前筛选条件下暂无审计记录", "No audit logs for the current filters")}</div>}
      </section>
    </div>
  );
}
