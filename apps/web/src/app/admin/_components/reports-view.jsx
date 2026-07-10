"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, FileDown, Search, TrendingDown, TrendingUp } from "lucide-react";
import { t, money, API_URL, getLocalToday, formatDateStr, addDays, addYears, pctDelta, weekdayLabels, formatClockMinute, daySpan, mondayOf } from "./helpers";
import { api, labelOf } from "../../../lib/api";

function groupByWeek(byDay, locale) { const w=new Map(); for(const r of byDay||[]){const d=new Date(r.day),dw=(d.getDay()+6)%7,ws=new Date(d);ws.setDate(d.getDate()-dw);const k=formatDateStr(ws);if(!w.has(k)){const we=new Date(ws);we.setDate(ws.getDate()+6);w.set(k,{key:k,label:`${ws.toLocaleDateString(locale,{month:"2-digit",day:"2-digit"})} - ${we.toLocaleDateString(locale,{month:"2-digit",day:"2-digit"})}`,orders:0,revenue:0});}const b=w.get(k);b.orders+=Number(r.orders||0);b.revenue+=Number(r.revenue||0);}return [...w.values()].sort((a,b)=>a.key.localeCompare(b.key));}
function groupByWeekday(byDay, locale) { const b=weekdayLabels(locale).map((l,i)=>({dow:i,label:l,orders:0,revenue:0,days:0}));for(const r of byDay||[]){const d=new Date(r.day),dw=(d.getDay()+6)%7,bb=b[dw];bb.orders+=Number(r.orders||0);bb.revenue+=Number(r.revenue||0);bb.days+=1;}return b;}
function buildTimeBucketSeries(byTime, intervalMinutes) { const s=(byTime||[]).map((r,i)=>({orders:Number(r.orders||0),revenue:Number(r.revenue||0),slot:r.slot||r.label||formatClockMinute(i*30)}));if(Number(intervalMinutes)<=30)return s.map(r=>({...r}));const bs=Math.max(1,Math.round(Number(intervalMinutes)/30)),bk=[];for(let i=0;i<s.length;i+=bs){const c=s.slice(i,i+bs);if(!c.length)continue;bk.push({slot:`${formatClockMinute(i*30)}-${formatClockMinute(i*30+Number(intervalMinutes))}`,orders:c.reduce((a,r)=>a+Number(r.orders||0),0),revenue:c.reduce((a,r)=>a+Number(r.revenue||0),0)});}return bk;}

function normalizeHotItemName(v) { if(!v)return"";if(typeof v==="string")return v.trim().toLowerCase();return String(v["zh-CN"]||v["en-GB"]||Object.values(v)[0]||"").trim().toLowerCase();}
function hotItemKeyFor(item) { if(!item)return"";return item.item_key||item.item_id||`name:${normalizeHotItemName(item.name_i18n)}`;}
function combineTrendRows(l, kf, lf, fb) { const b=new Map();for(const rs of l||[])for(const r of rs||[]){const k=String(r?.[kf]||"");if(!k)continue;const e=b.get(k)||{[kf]:k,[lf]:r?.[lf]||fb||k,orders:0,revenue:0};e.orders+=Number(r?.orders||0);e.revenue+=Number(r?.revenue||0);if(!e[lf]&&r?.[lf])e[lf]=r[lf];b.set(k,e);}return[...b.values()];}
function combineHotItemTrends(items, trendsByKey) { const li=items.filter(i=>trendsByKey[hotItemKeyFor(i)]?.data);if(!li.length)return null;const d=combineTrendRows(li.map(i=>trendsByKey[hotItemKeyFor(i)]?.data?.byDay||[]),"day","day","").sort((a,b)=>String(a.day).localeCompare(String(b.day)));const t=combineTrendRows(li.map(i=>trendsByKey[hotItemKeyFor(i)]?.data?.byTime||[]),"slot","slot","").sort((a,b)=>String(a.slot).localeCompare(String(b.slot)));const s=li.reduce((a,i)=>{const tr=trendsByKey[hotItemKeyFor(i)]?.data;a.orders+=Number(tr?.summary?.orders||0);a.revenue+=Number(tr?.summary?.revenue||0);return a;},{orders:0,revenue:0});return{summary:s,byDay:d,byTime:t};}


export default function ReportsAnalytics({ report, setReport, locale, currency }) {
  const today = getLocalToday();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [preset, setPreset] = useState("7d");
  const [compareMode, setCompareMode] = useState("mom");
  const [trendMetric, setTrendMetric] = useState("revenue");
  const [trendWeekdays, setTrendWeekdays] = useState([]);
  const [timeSlotInterval, setTimeSlotInterval] = useState(30);
  const [selectedHotItemKeys, setSelectedHotItemKeys] = useState([]);
  const [selectedHotItemTrends, setSelectedHotItemTrends] = useState({});
  const [comparisonReport, setComparisonReport] = useState(null);
  const [comparisonRange, setComparisonRange] = useState(null);
  const [loading, setLoading] = useState(false);

  function comparisonRangeFor(rangeFrom, rangeTo, mode) {
    if (mode === "yoy") {
      return [addYears(rangeFrom, -1), addYears(rangeTo, -1)];
    }
    const span = daySpan(rangeFrom, rangeTo);
    const prevTo = addDays(rangeFrom, -1);
    const prevFrom = addDays(prevTo, -(span - 1));
    return [prevFrom, prevTo];
  }

  async function runReport(rangeFrom, rangeTo, mode) {
    setLoading(true);
    try {
      const data = await api(`/reports/sales?from=${rangeFrom}&to=${rangeTo}`);
      setReport(data);
      if (mode === "none") {
        setComparisonReport(null);
        setComparisonRange(null);
      } else {
        const [pf, pt] = comparisonRangeFor(rangeFrom, rangeTo, mode);
        setComparisonRange([pf, pt]);
        const compareData = await api(`/reports/sales?from=${pf}&to=${pt}`);
        setComparisonReport(compareData);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runReport(from, to, compareMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(id) {
    setPreset(id);
    let nextFrom = today;
    let nextTo = today;
    if (id === "today") nextFrom = today;
    else if (id === "yesterday") { nextFrom = addDays(today, -1); nextTo = addDays(today, -1); }
    else if (id === "7d") nextFrom = addDays(today, -6);
    else if (id === "30d") nextFrom = addDays(today, -29);
    else if (id === "month") nextFrom = `${today.slice(0, 7)}-01`;
    else if (id === "week") nextFrom = mondayOf(today);
    else if (id === "lastWeek") {
      const thisMonday = mondayOf(today);
      nextFrom = addDays(thisMonday, -7);
      nextTo = addDays(thisMonday, -1);
    } else if (id === "lastMonth") {
      const monthEnd = addDays(`${today.slice(0, 7)}-01`, -1);
      nextFrom = `${monthEnd.slice(0, 7)}-01`;
      nextTo = monthEnd;
    }
    setFrom(nextFrom);
    setTo(nextTo);
    runReport(nextFrom, nextTo, compareMode);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setPreset("custom");
    await runReport(from, to, compareMode);
  }

  async function onCompareModeChange(mode) {
    setCompareMode(mode);
    await runReport(from, to, mode);
  }

  function exportUrl() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("qypos_token") : "";
    const grant = typeof window !== "undefined" ? window.sessionStorage.getItem("qypos_admin_grant") : "";
    return `${API_URL}/reports/sales.csv?from=${from}&to=${to}&token=${token}&admin_grant=${grant}`;
  }

  const hotItems = report?.hotItems || [];
  const selectedHotItems = useMemo(
    () => selectedHotItemKeys.map((key) => hotItems.find((item) => hotItemKeyFor(item) === key)).filter(Boolean),
    [hotItems, selectedHotItemKeys]
  );
  const combinedHotTrend = useMemo(
    () => combineHotItemTrends(selectedHotItems, selectedHotItemTrends),
    [selectedHotItemTrends, selectedHotItems]
  );
  const combinedHotTrendLoading = selectedHotItems.some((item) => !selectedHotItemTrends[hotItemKeyFor(item)] || selectedHotItemTrends[hotItemKeyFor(item)]?.loading);
  const combinedHotTrendError = selectedHotItems.find((item) => selectedHotItemTrends[hotItemKeyFor(item)]?.error)?.error || "";

  useEffect(() => {
    setSelectedHotItemKeys((current) => current.filter((key) => hotItems.some((item) => hotItemKeyFor(item) === key)));
  }, [hotItems]);

  useEffect(() => {
    if (!selectedHotItemKeys.length) {
      setSelectedHotItemTrends({});
      return;
    }
    let cancelled = false;
    setSelectedHotItemTrends((current) => {
      const next = {};
      for (const key of selectedHotItemKeys) {
        next[key] = current[key] ? { ...current[key], loading: true, error: "" } : { data: null, loading: true, error: "" };
      }
      return next;
    });
    selectedHotItemKeys.forEach((key) => {
      api(`/reports/sales/items/${encodeURIComponent(key)}?from=${from}&to=${to}`)
        .then((data) => {
          if (!cancelled) {
            setSelectedHotItemTrends((current) => ({
              ...current,
              [key]: { data, loading: false, error: "" }
            }));
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setSelectedHotItemTrends((current) => ({
              ...current,
              [key]: { data: null, loading: false, error: caught.message || "加载单品趋势失败" }
            }));
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [from, to, selectedHotItemKeys]);

  const weekly = useMemo(() => groupByWeek(report?.byDay || [], locale), [report, locale]);
  const weekdayBreakdown = useMemo(() => groupByWeekday(report?.byDay || [], locale), [report, locale]);
  const timeChartData = useMemo(
    () => buildTimeBucketSeries(report?.byTime || [], timeSlotInterval),
    [report, timeSlotInterval]
  );
  const dailyTrendData = useMemo(() => {
    const byDay = report?.byDay || [];
    if (!trendWeekdays.length) return byDay;
    return byDay.filter((row) => trendWeekdays.includes((new Date(row.day).getDay() + 6) % 7));
  }, [report, trendWeekdays]);
  function toggleTrendWeekday(dow) {
    setTrendWeekdays((current) => current.includes(dow) ? current.filter((d) => d !== dow) : [...current, dow]);
  }
  const maxWeekdayRevenue = Math.max(1, ...weekdayBreakdown.map((d) => d.revenue));
  const busiestWeekday = weekdayBreakdown.reduce((best, d) => (d.revenue > (best?.revenue ?? -1) ? d : best), null);

  const compareLabel = compareMode === "yoy" ? t(locale, "同比 (去年同期)", "YoY (same period last year)") : compareMode === "mom" ? t(locale, "环比 (上一周期)", "MoM (previous period)") : "";

  const dineInOrders = Number(report?.summary?.dine_in_orders || 0);
  const takeawayOrders = Number(report?.summary?.takeaway_orders || 0);
  const totalOrders = Number(report?.summary?.orders || 0);
  const serviceMixTotal = Math.max(1, dineInOrders + takeawayOrders);
  const peakDay = (report?.byDay || []).reduce((best, row) => Number(row.orders || 0) > Number(best?.orders || -1) ? row : best, null);
  const peakSlot = (report?.byTime || []).reduce((best, row) => Number(row.revenue || 0) > Number(best?.revenue || -1) ? row : best, null);
  const dailyAverageOrders = totalOrders && (report?.byDay || []).length
    ? totalOrders / (report.byDay.length || 1)
    : 0;
  const revenueDelta = comparisonReport ? pctDelta(report.summary.revenue, comparisonReport.summary.revenue) : null;
  const ordersDelta = comparisonReport ? pctDelta(report.summary.orders, comparisonReport.summary.orders) : null;
  const alertItems = [
    revenueDelta != null && revenueDelta < -10 ? t(locale, `营业额较${compareLabel}下降 ${Math.abs(revenueDelta)}%`, `Revenue down ${Math.abs(revenueDelta)}% vs ${compareLabel}`) : null,
    ordersDelta != null && ordersDelta < -10 ? t(locale, `订单数较${compareLabel}下降 ${Math.abs(ordersDelta)}%`, `Orders down ${Math.abs(ordersDelta)}% vs ${compareLabel}`) : null,
    peakSlot ? t(locale, `峰值时段：${peakSlot.slot}，营业额 ${money(peakSlot.revenue, currency, locale)}`, `Peak slot: ${peakSlot.slot}, revenue ${money(peakSlot.revenue, currency, locale)}`) : null
  ].filter(Boolean);

  const summaryFields = [
    [t(locale, "营业额", "Revenue"), "revenue"],
    [t(locale, "订单数", "Orders"), "orders"],
    [t(locale, "客单价", "Average ticket"), "average_ticket"],
    [t(locale, "净销售额", "Net sales"), "net_sales"]
  ];

  return (
    <div className="dashboard reports-analytics">
      <section className="panel dashboard-list reports-toolbar-panel">
        <div className="panel-title"><h2>{t(locale, "数据分析", "Reports")}</h2></div>
        <div className="reports-preset-row">
          <div className="reports-preset-group reports-date-preset-group">
            <button type="button" className={preset === "today" ? "selected" : ""} onClick={() => applyPreset("today")}>{t(locale, "今日", "Today")}</button>
            <button type="button" className={preset === "yesterday" ? "selected" : ""} onClick={() => applyPreset("yesterday")}>{t(locale, "昨天", "Yesterday")}</button>
            <button type="button" className={preset === "7d" ? "selected" : ""} onClick={() => applyPreset("7d")}>{t(locale, "近 7 天", "Last 7 days")}</button>
            <button type="button" className={preset === "30d" ? "selected" : ""} onClick={() => applyPreset("30d")}>{t(locale, "近 30 天", "Last 30 days")}</button>
            <button type="button" className={preset === "month" ? "selected" : ""} onClick={() => applyPreset("month")}>{t(locale, "本月", "This month")}</button>
            <button type="button" className={preset === "week" ? "selected" : ""} onClick={() => applyPreset("week")}>{t(locale, "本周", "This week")}</button>
            <button type="button" className={preset === "lastWeek" ? "selected" : ""} onClick={() => applyPreset("lastWeek")}>{t(locale, "上周", "Last week")}</button>
            <button type="button" className={preset === "lastMonth" ? "selected" : ""} onClick={() => applyPreset("lastMonth")}>{t(locale, "上月", "Last month")}</button>
          </div>
          <div className="reports-preset-group">
            <button type="button" className={compareMode === "mom" ? "selected" : ""} onClick={() => onCompareModeChange("mom")}>{t(locale, "环比", "MoM")}</button>
            <button type="button" className={compareMode === "yoy" ? "selected" : ""} onClick={() => onCompareModeChange("yoy")}>{t(locale, "同比", "YoY")}</button>
            <button type="button" className={compareMode === "none" ? "selected" : ""} onClick={() => onCompareModeChange("none")}>{t(locale, "不比较", "No compare")}</button>
          </div>
        </div>
        <form className="report-toolbar" onSubmit={onSubmit}>
          <label>{t(locale, "开始日期", "From")}<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPreset("custom"); }} /></label>
          <label>{t(locale, "结束日期", "To")}<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPreset("custom"); }} /></label>
          <button className="primary" type="submit" disabled={loading}><RefreshCw size={16} /><span>{loading ? t(locale, "生成中…", "Generating…") : t(locale, "生成报表", "Generate report")}</span></button>
          <a className="link-button" href={exportUrl()}><FileDown size={16} /><span>{t(locale, "导出 CSV", "Export CSV")}</span></a>
        </form>
        {comparisonRange && (
          <small className="muted">{t(locale, "对比区间：", "Comparison range:")} {comparisonRange[0]} ~ {comparisonRange[1]}（{compareLabel}）</small>
        )}
      </section>

      {report && (
        <>
          <section className="wide-list dashboard-list reports-summary-cards">
            {summaryFields.map(([label, key]) => {
              const currVal = key === "average_ticket"
                ? (report.summary.average_ticket ?? (report.summary.orders ? report.summary.revenue / report.summary.orders : 0))
                : report.summary[key];
              const prevVal = comparisonReport
                ? (key === "average_ticket"
                  ? (comparisonReport.summary.average_ticket ?? (comparisonReport.summary.orders ? comparisonReport.summary.revenue / comparisonReport.summary.orders : 0))
                  : comparisonReport.summary[key])
                : null;
              const delta = comparisonReport ? pctDelta(currVal, prevVal) : null;
              return (
                <section className="metric reports-summary-card" key={key}>
                  <span>{label}</span>
                  <strong>{key === "orders" ? Number(currVal || 0) : money(currVal, currency, locale)}</strong>
                  {delta != null && (
                    <span className={`reports-delta ${delta >= 0 ? "up" : "down"}`}>
                      {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {delta >= 0 ? "+" : ""}{delta}%
                    </span>
                  )}
                </section>
              );
            })}
          </section>

          <section className="panel dashboard-list reports-insights-panel">
            <div className="panel-title split">
              <h2>{t(locale, "经营洞察", "Business insights")} <small className="muted">Business Insights</small></h2>
              <small className="muted">{t(locale, "围绕结构、峰值和变化的摘要", "Summary of structure, peaks, and changes")}</small>
            </div>
            <div className="reports-insight-grid">
              <article className="reports-insight-card">
                <span>{t(locale, "订单结构", "Order mix")}</span>
                <strong>{dineInOrders} / {takeawayOrders}</strong>
                <small>{t(locale, "堂食", "Dine-in")} {Math.round((dineInOrders / serviceMixTotal) * 100)}% · {t(locale, "外带", "Takeaway")} {Math.round((takeawayOrders / serviceMixTotal) * 100)}%</small>
              </article>
              <article className="reports-insight-card">
                <span>{t(locale, "峰值日期", "Peak day")}</span>
                <strong>{peakDay ? new Date(peakDay.day).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" }) : "-"}</strong>
                <small>{peakDay ? `${peakDay.orders} ${t(locale, "单", "orders")} · ${money(peakDay.revenue, currency, locale)}` : t(locale, "暂无数据", "No data")}</small>
              </article>
              <article className="reports-insight-card">
                <span>{t(locale, "峰值时段", "Peak slot")}</span>
                <strong>{peakSlot ? peakSlot.slot : "-"}</strong>
                <small>{peakSlot ? `${peakSlot.orders} ${t(locale, "单", "orders")} · ${money(peakSlot.revenue, currency, locale)}` : t(locale, "暂无数据", "No data")}</small>
              </article>
              <article className="reports-insight-card">
                <span>{t(locale, "日均单量", "Daily average orders")}</span>
                <strong>{dailyAverageOrders ? dailyAverageOrders.toFixed(1) : "0.0"}</strong>
                <small>{t(locale, "按当前区间天数平均", "Average across the selected range")}</small>
              </article>
            </div>
            {alertItems.length > 0 && (
              <div className="reports-insight-alerts">
                {alertItems.map((item) => <span key={item}>{item}</span>)}
              </div>
            )}
          </section>

          <section className="panel dashboard-list reports-weekly-panel">
            <div className="panel-title"><h2>{t(locale, "周度分析", "Weekly breakdown")} <small className="muted">Weekly Breakdown</small></h2></div>
            {weekly.length ? (
              <div className="reports-weekly-list">
                {weekly.map((week, idx) => {
                  const prevWeek = weekly[idx - 1];
                  const wow = prevWeek ? pctDelta(week.revenue, prevWeek.revenue) : null;
                  return (
                    <div className="list-row reports-weekly-row" key={week.key}>
                      <span>{week.label}</span>
                      <span>{week.orders} {t(locale, "单", "orders")}</span>
                      <strong>{money(week.revenue, currency, locale)}</strong>
                      {wow != null && (
                        <span className={`reports-delta ${wow >= 0 ? "up" : "down"}`}>
                          {wow >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                          {wow >= 0 ? "+" : ""}{wow}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <div className="empty">{t(locale, "无数据", "No data")}</div>}
          </section>

          <section className="panel dashboard-list reports-weekday-panel">
            <div className="panel-title split">
              <h2>{t(locale, "星期分布", "Day-of-week distribution")} <small className="muted">Day-of-Week Comparison</small></h2>
              {busiestWeekday && busiestWeekday.revenue > 0 && (
                <small className="muted">{t(locale, "最佳：", "Best:")} {busiestWeekday.label}</small>
              )}
            </div>
            {report.byDay && report.byDay.length ? (
              <div className="reports-weekday-list">
                {weekdayBreakdown.map((d) => (
                  <div className="reports-weekday-row" key={d.dow}>
                    <span className="reports-weekday-label">{d.label}</span>
                    <span className="reports-weekday-bar-track">
                      <span
                        className={`reports-weekday-bar${busiestWeekday && d.dow === busiestWeekday.dow && d.revenue > 0 ? " best" : ""}`}
                        style={{ width: `${maxWeekdayRevenue ? (d.revenue / maxWeekdayRevenue) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="reports-weekday-orders">{d.orders} {t(locale, "单", "orders")}</span>
                    <strong className="reports-weekday-revenue">{money(d.revenue, currency, locale)}</strong>
                  </div>
                ))}
              </div>
            ) : <div className="empty">{t(locale, "无数据", "No data")}</div>}
          </section>

          <section className="panel report-hot-collection dashboard-list" style={{ marginTop: 0 }}>
            <div className="panel-title split">
              <h3>{t(locale, "该期间热销统计", "Top items this period")}</h3>
              <small className="muted">{t(locale, "支持多选，点击可叠加/取消", "Multi-select to combine/cancel")}</small>
            </div>
            <div className="report-hot-collection-grid">
              <div className="panel report-hot-items-col">
                <div className="panel-title split">
                  <h4>{t(locale, "热销菜品", "Top items")}</h4>
                  {selectedHotItemKeys.length > 0 && (
                    <button type="button" className="link-button" onClick={() => setSelectedHotItemKeys([])}>{t(locale, "清空选择", "Clear selection")}</button>
                  )}
                </div>
                <div className="report-hot-scroll">
                  {(hotItems || []).map((it, index) => {
                    const itemKey = hotItemKeyFor(it);
                    const active = selectedHotItemKeys.includes(itemKey);
                    return (
                      <button
                        type="button"
                        className={`list-row report-hot-item-button ${active ? "selected" : ""}`}
                        key={itemKey || `${labelOf(it.name_i18n, locale)}-${index}`}
                        aria-pressed={active}
                        title={itemKey.startsWith("name:") ? t(locale, "无商品 ID，按菜名查看趋势", "No item ID, using name fallback") : ""}
                        onClick={() => {
                          setSelectedHotItemKeys((current) => current.includes(itemKey)
                            ? current.filter((key) => key !== itemKey)
                            : [...current, itemKey]);
                        }}
                      >
                        <div className="hot-item-name" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{labelOf(it.name_i18n, locale)}</div>
                        <div className="hot-item-stats"><span>{it.quantity} 份</span><strong>{money(it.sales, currency, locale)}</strong></div>
                      </button>
                    );
                  })}
                  {!hotItems.length && <div className="empty">{t(locale, "无数据", "No data")}</div>}
                </div>
              </div>

              <div className="panel report-hot-modifiers-col">
                <div className="panel-title"><h4>{t(locale, "热销小料", "Top modifiers")}</h4></div>
                {(report.hotModifiers || []).map((m) => (
                  <div className="list-row" key={m.id || m.name}>
                    <div className="hot-item-name">{m.label && typeof m.label === "object" ? labelOf(m.label, locale) : (m.label || m.name)}</div>
                    <div className="hot-item-stats"><span>{m.quantity || m.count || 0}</span><strong>{money(m.sales || 0, currency, locale)}</strong></div>
                  </div>
                ))}
                {!report.hotModifiers?.length && <div className="empty">{t(locale, "无数据", "No data")}</div>}
              </div>

              <div className="panel report-hot-notes-col">
                <div className="panel-title"><h4>{t(locale, "常用备注频率", "Frequent notes")}</h4></div>
                {(report.notePresets || report.common_notes || []).map((n) => (
                  <div className="list-row" key={n.label || n.name}>
                    <div className="hot-item-name">{n.label || n.name}</div>
                    <div className="hot-item-stats"><span>{n.count || n.frequency || ""}</span></div>
                  </div>
                ))}
                {!((report.notePresets || report.common_notes || []).length) && <div className="empty">{t(locale, "无数据", "No data")}</div>}
              </div>
            </div>
          </section>

          <section className="panel report-item-trends dashboard-list">
            <div className="panel-title split">
              <h3>{selectedHotItems.length ? t(locale, `单品趋势（已选 ${selectedHotItems.length} 项）`, `Item trends (${selectedHotItems.length} selected)`) : t(locale, "单品趋势", "Item trends")}</h3>
              <small className="muted">{t(locale, "点击左侧热销菜品可多选并查看每日与时段走势", "Select top items on the left to view daily and time-slot trends")}</small>
            </div>
            {!selectedHotItems.length ? (
              <div className="empty">{t(locale, "点击热销菜品查看单品趋势", "Select top items to view trends")}</div>
            ) : combinedHotTrendLoading ? (
              <div className="empty">{t(locale, "加载中…", "Loading…")}</div>
            ) : combinedHotTrendError ? (
              <div className="empty">{combinedHotTrendError}</div>
            ) : combinedHotTrend ? (
              <section className="panel report-item-trend-card">
                <div className="panel-title split">
                  <h4>{t(locale, "已选菜品合计", "Selected items total")}</h4>
                  <button type="button" className="link-button" onClick={() => setSelectedHotItemKeys([])}>{t(locale, "清空选择", "Clear selection")}</button>
                </div>
                <div className="report-selected-tags">
                  {selectedHotItems.map((item) => (
                    <button
                      type="button"
                      key={hotItemKeyFor(item)}
                      className="report-selected-tag"
                      onClick={() => setSelectedHotItemKeys((current) => current.filter((key) => key !== hotItemKeyFor(item)))}
                    >
                      {labelOf(item.name_i18n, locale)} ×
                    </button>
                  ))}
                </div>
                <div className="report-item-summary">
                  <span>{t(locale, "累计数量", "Total qty")} {combinedHotTrend.summary?.orders ?? 0}</span>
                  <span>{t(locale, "累计销售额", "Total sales")} {money(combinedHotTrend.summary?.revenue ?? 0, currency, locale)}</span>
                </div>
                <div className="report-item-trend-stack">
                  <section className="panel report-item-trend-mini-card">
                    <div className="panel-title"><h5>{t(locale, "每日趋势", "Daily trend")}</h5></div>
                    <div style={{ padding: 12 }}>
                      <DualSeriesTrendChart
                        data={combinedHotTrend.byDay || []}
                        locale={locale}
                        currency={currency}
                        countLabel={t(locale, "数量", "Qty")}
                        amountLabel={t(locale, "销售额", "Sales")}
                        xLabel={(row) => new Date(row.day).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" })}
                        height={220}
                      />
                    </div>
                  </section>
                  <section className="panel report-item-trend-mini-card">
                    <div className="panel-title"><h5>{t(locale, "按时段趋势", "Time-slot trend")}</h5></div>
                    <div style={{ padding: 12 }}>
                      <DualSeriesTrendChart
                        data={combinedHotTrend.byTime || []}
                        locale={locale}
                        currency={currency}
                        countLabel={t(locale, "数量", "Qty")}
                        amountLabel={t(locale, "销售额", "Sales")}
                        xLabel={(row) => row.slot || row.label || ""}
                        height={240}
                      />
                    </div>
                  </section>
                </div>
              </section>
            ) : (
              <div className="empty">{t(locale, "请选择热销菜品", "Please select a top item")}</div>
            )}
          </section>

          <section className="panel report-chart dashboard-list report-daily-trend-panel">
            <div className="panel-title split">
              <h3>{trendMetric === "revenue" ? t(locale, "每日营业额趋势", "Daily revenue trend") : trendMetric === "orders" ? t(locale, "每日单量趋势", "Daily orders trend") : t(locale, "每日客单价趋势", "Daily average ticket trend")}</h3>
            </div>
            <div className="reports-preset-row daily-trend-toolbar">
              <div className="reports-preset-group">
                <button type="button" className={trendMetric === "revenue" ? "selected" : ""} onClick={() => setTrendMetric("revenue")}>{t(locale, "营业额", "Revenue")}</button>
                <button type="button" className={trendMetric === "orders" ? "selected" : ""} onClick={() => setTrendMetric("orders")}>{t(locale, "单量", "Orders")}</button>
                <button type="button" className={trendMetric === "avg_ticket" ? "selected" : ""} onClick={() => setTrendMetric("avg_ticket")}>{t(locale, "客单价", "Avg. ticket")}</button>
              </div>
              <div className="reports-preset-group daily-trend-weekday-group">
                <button type="button" className={!trendWeekdays.length ? "selected" : ""} onClick={() => setTrendWeekdays([])}>{t(locale, "全部", "All")}</button>
                {weekdayLabels(locale).map((label, dow) => (
                  <button
                    type="button"
                    key={dow}
                    className={trendWeekdays.includes(dow) ? "selected" : ""}
                    aria-pressed={trendWeekdays.includes(dow)}
                    onClick={() => toggleTrendWeekday(dow)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {dailyTrendData.length ? (
              <div style={{ padding: 12 }}>
                <DailyTrendChart data={dailyTrendData} metric={trendMetric} locale={locale} currency={currency} />
              </div>
            ) : <div className="empty">{t(locale, "无数据", "No data")}</div>}
          </section>

          <section className="panel report-time-chart dashboard-list">
            <div className="panel-title split">
              <h3>{t(locale, "按时段", "By time slot")}（{timeSlotInterval} {t(locale, "分钟", "min")}) {t(locale, "单量、营业额与客单价", "orders, revenue and avg ticket")}</h3>
            </div>
            <div className="report-time-actions">
              <button type="button" className={`report-time-toggle interval ${timeSlotInterval === 30 ? "active" : "inactive"}`} onClick={() => setTimeSlotInterval(30)}>
                30 {t(locale, "分钟", "min")}
              </button>
              <button type="button" className={`report-time-toggle interval ${timeSlotInterval === 60 ? "active" : "inactive"}`} onClick={() => setTimeSlotInterval(60)}>
                60 {t(locale, "分钟", "min")}
              </button>
            </div>
            {report.byTime && report.byTime.length ? (
              <div style={{ padding: 12 }}>
                <CanvasTimeChart data={timeChartData} locale={locale} currency={currency} />
              </div>
            ) : <div className="empty">{t(locale, "无数据", "No data")}</div>}
          </section>
        </>
      )}
    </div>
  );
}

function GradientTrendChart({ data, compareData, locale, currency }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const tipRef = useRef(null);
  const days = (data || []).slice().sort((a, b) => new Date(a.day) - new Date(b.day));
  const compareDays = (compareData || []).slice().sort((a, b) => new Date(a.day) - new Date(b.day));

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;

    function draw() {
      const rect = container.getBoundingClientRect();
      const w = Math.max(260, Math.floor(rect.width));
      const h = 240;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      if (!days.length) return;
      const pad = 32;
      const maxLen = Math.max(days.length, compareDays.length, 1);
      const maxRevenue = Math.max(1, ...days.map((d) => Number(d.revenue || 0)), ...compareDays.map((d) => Number(d.revenue || 0)));
      const plotW = w - pad * 2;
      const plotH = h - pad * 2;
      const step = plotW / Math.max(1, maxLen - 1);
      const pointAt = (series, i) => {
        const rv = Number(series[i]?.revenue || 0);
        return { x: pad + i * step, y: pad + (plotH - (rv / maxRevenue) * plotH) };
      };

      if (compareDays.length) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        compareDays.forEach((_, i) => {
          const { x, y } = pointAt(compareDays, i);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const gradient = ctx.createLinearGradient(0, pad, 0, pad + plotH);
      gradient.addColorStop(0, "rgba(185, 28, 28, 0.35)");
      gradient.addColorStop(1, "rgba(185, 28, 28, 0)");
      ctx.beginPath();
      days.forEach((_, i) => {
        const { x, y } = pointAt(days, i);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.lineTo(pad + (days.length - 1) * step, pad + plotH);
      ctx.lineTo(pad, pad + plotH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = "#b91c1c";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      days.forEach((_, i) => {
        const { x, y } = pointAt(days, i);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.fillStyle = "#b91c1c";
      days.forEach((_, i) => {
        const { x, y } = pointAt(days, i);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      });

      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      days.forEach((d, i) => {
        if (days.length > 14 && i % Math.ceil(days.length / 10) !== 0) return;
        const label = new Date(d.day).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" });
        ctx.fillText(label, pad + i * step, h - 8);
      });
    }

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [data, compareData, locale]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: 240, position: "relative" }}
      onMouseMove={(e) => {
        const container = containerRef.current;
        const tip = tipRef.current;
        if (!container || !tip || !days.length) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pad = 32;
        const w = Math.max(260, Math.floor(rect.width));
        const plotW = w - pad * 2;
        const maxLen = Math.max(days.length, compareDays.length, 1);
        const step = plotW / Math.max(1, maxLen - 1);
        const idx = Math.min(days.length - 1, Math.max(0, Math.round((x - pad) / step)));
        const d = days[idx];
        const cd = compareDays[idx];
        if (!d) { tip.style.display = "none"; return; }
        tip.innerHTML = `<div style="font-weight:600">${new Date(d.day).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" })}</div><div>营业额: ${money(d.revenue || 0, currency, locale)}</div><div>单量: ${d.orders || 0}</div>${cd ? `<div style="color:#cbd5e1">对比: ${money(cd.revenue || 0, currency, locale)}</div>` : ""}`;
        tip.style.display = "block";
        let left = x + 12;
        if (left + 160 > rect.width) left = x - 172;
        tip.style.left = `${Math.max(4, left)}px`;
        tip.style.top = "8px";
      }}
      onMouseLeave={() => { const tip = tipRef.current; if (tip) tip.style.display = "none"; }}
    >
      <canvas ref={canvasRef} />
      {!days.length && <div className="empty" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{t(locale, "暂无数据", "No data")}</div>}
      <div ref={tipRef} style={{ display: "none", position: "absolute", pointerEvents: "none", background: "rgba(17,24,39,0.9)", color: "#fff", padding: "6px 8px", borderRadius: 6, fontSize: 12, zIndex: 50 }} />
    </div>
  );
}

function CanvasDualChart({ data, locale, currency }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const tipRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;

    function draw() {
      const rect = container.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width));
      const h = 200;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const pad = 30;
      const days = (data || []).slice().sort((a, b) => new Date(a.day) - new Date(b.day));
      if (!days.length) return;
      const maxOrders = Math.max(...days.map((d) => d.orders));
      const maxRevenue = Math.max(...days.map((d) => Number(d.revenue || 0)));
      const plotW = w - pad * 2;
      const plotH = h - pad * 2;
      const step = plotW / Math.max(1, days.length - 1);

      // draw order bars
      ctx.fillStyle = "#60a5fa";
      days.forEach((d, i) => {
        const bw = Math.max(4, Math.min(step * 0.45, 64));
        const barH = maxOrders ? (d.orders / maxOrders) * plotH : 0;
        const x = pad + i * step - bw / 2;
        const y = pad + (plotH - barH);
        ctx.fillRect(x, y, bw, barH);
      });

      // draw revenue line
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.beginPath();
      days.forEach((d, i) => {
        const rv = Number(d.revenue || 0);
        const x = pad + i * step;
        const y = pad + (plotH - (maxRevenue ? (rv / maxRevenue) * plotH : 0));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = "#10b981";
      days.forEach((d, i) => {
        const rv = Number(d.revenue || 0);
        const x = pad + i * step;
        const y = pad + (plotH - (maxRevenue ? (rv / maxRevenue) * plotH : 0));
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      });

      // x labels
      ctx.fillStyle = "#334155";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      days.forEach((d, i) => {
        const label = new Date(d.day).toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
        const x = pad + i * step;
        ctx.fillText(label, x, h - 16);
      });
    }

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    window.addEventListener("orientationchange", draw);
    return () => { ro.disconnect(); window.removeEventListener("orientationchange", draw); };
  }, [data, locale]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: 200, position: 'relative' }}
      onMouseMove={(e) => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        const tip = tipRef.current;
        if (!container || !canvas || !tip) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const pad = 30;
        const w = Math.max(300, Math.floor(rect.width));
        const h = 200;
        const days = (data || []).slice().sort((a, b) => new Date(a.day) - new Date(b.day));
        if (!days.length) { tip.style.display = 'none'; return; }
        const plotW = w - pad * 2;
        const step = plotW / Math.max(1, days.length - 1);
        const idx = Math.round((x - pad) / step);
        if (idx < 0 || idx >= days.length) { tip.style.display = 'none'; return; }
        const d = days[idx];
        tip.innerHTML = `<div style="font-weight:600">${new Date(d.day).toLocaleDateString(locale, { month: '2-digit', day: '2-digit' })}</div><div>单量: ${d.orders || 0}</div><div>营业额: ${money(d.revenue||0, currency, locale)}</div>`;
        tip.style.display = 'block';
        const tipRect = tip.getBoundingClientRect();
        let left = x + 12;
        if (left + tipRect.width > rect.width) left = x - tipRect.width - 12;
        if (left < 6) left = 6;
        let top = y - tipRect.height - 8;
        if (top < 6) top = y + 8;
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
      }}
      onMouseLeave={() => { const tip = tipRef.current; if (tip) tip.style.display = 'none'; }}
    >
      <canvas ref={canvasRef} />
      <div ref={tipRef} style={{ display: 'none', position: 'absolute', pointerEvents: 'none', background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '6px 8px', borderRadius: 6, fontSize: 12, zIndex: 50 }} />
    </div>
  );
}

function DailyTrendChart({ data, metric, locale, currency }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const tipRef = useRef(null);
  const days = (data || []).slice().sort((a, b) => new Date(a.day) - new Date(b.day));
  const title = metric === "orders" ? "单量" : metric === "avg_ticket" ? "客单价" : "营业额";
  const color = metric === "orders" ? "#2563eb" : metric === "avg_ticket" ? "#0f766e" : "#b91c1c";
  const areaColor = metric === "orders" ? [37, 99, 235] : metric === "avg_ticket" ? [15, 118, 110] : [185, 28, 28];

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;

    function draw() {
      const rect = container.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width));
      const h = 240;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      if (!days.length) return;

      const pad = 32;
      const plotW = w - pad * 2;
      const plotH = h - pad * 2;
      const values = days.map((d) => metric === "orders"
        ? Number(d.orders || 0)
        : metric === "avg_ticket"
          ? (Number(d.orders || 0) ? Number(d.revenue || 0) / Number(d.orders || 0) : 0)
          : Number(d.revenue || 0));
      const maxValue = Math.max(1, ...values);
      const step = plotW / Math.max(1, days.length - 1);
      const pointAt = (index) => {
        const value = values[index] || 0;
        return {
          x: pad + index * step,
          y: pad + (plotH - (value / maxValue) * plotH)
        };
      };

      const gradient = ctx.createLinearGradient(0, pad, 0, pad + plotH);
      gradient.addColorStop(0, `rgba(${areaColor[0]}, ${areaColor[1]}, ${areaColor[2]}, 0.34)`);
      gradient.addColorStop(1, `rgba(${areaColor[0]}, ${areaColor[1]}, ${areaColor[2]}, 0)`);
      ctx.beginPath();
      days.forEach((_, index) => {
        const { x, y } = pointAt(index);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.lineTo(pad + (days.length - 1) * step, pad + plotH);
      ctx.lineTo(pad, pad + plotH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      days.forEach((_, index) => {
        const { x, y } = pointAt(index);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.fillStyle = color;
      days.forEach((_, index) => {
        const { x, y } = pointAt(index);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      days.forEach((day, index) => {
        if (days.length > 14 && index % Math.ceil(days.length / 10) !== 0) return;
        const label = new Date(day.day).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" });
        ctx.fillText(label, pad + index * step, h - 8);
      });
    }

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [days, metric, locale]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: 240, position: "relative" }}
      onMouseMove={(e) => {
        const container = containerRef.current;
        const tip = tipRef.current;
        if (!container || !tip || !days.length) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const pad = 32;
        const w = Math.max(300, Math.floor(rect.width));
        const plotW = w - pad * 2;
        const step = plotW / Math.max(1, days.length - 1);
        const idx = Math.min(days.length - 1, Math.max(0, Math.round((x - pad) / step)));
        const day = days[idx];
        if (!day) {
          tip.style.display = "none";
          return;
        }
        const value = metric === "orders"
          ? Number(day.orders || 0)
          : metric === "avg_ticket"
            ? (Number(day.orders || 0) ? Number(day.revenue || 0) / Number(day.orders || 0) : 0)
            : Number(day.revenue || 0);
        tip.innerHTML = `<div style="font-weight:600">${new Date(day.day).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" })}</div><div>${title}: ${metric === "orders" ? value : money(value, currency, locale)}</div>`;
        tip.style.display = "block";
        const tipRect = tip.getBoundingClientRect();
        let left = x + 12;
        if (left + tipRect.width > rect.width) left = x - tipRect.width - 12;
        if (left < 6) left = 6;
        let top = y - tipRect.height - 8;
        if (top < 6) top = y + 8;
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
      }}
      onMouseLeave={() => { const tip = tipRef.current; if (tip) tip.style.display = "none"; }}
    >
      <canvas ref={canvasRef} />
      {!days.length && <div className="empty" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{t(locale, "暂无数据", "No data")}</div>}
      <div ref={tipRef} style={{ display: "none", position: "absolute", pointerEvents: "none", background: "rgba(17,24,39,0.9)", color: "#fff", padding: "6px 8px", borderRadius: 6, fontSize: 12, zIndex: 50 }} />
    </div>
  );
}

function DualSeriesTrendChart({ data, locale, currency, countLabel, amountLabel, xLabel, height = 240 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const tipRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;

    function draw() {
      const rect = container.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width));
      const h = height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const series = (data || []).slice();
      if (!series.length) return;

      const pad = 32;
      const plotW = w - pad * 2;
      const plotH = h - pad * 2;
      const countValues = series.map((row) => Number(row.orders || 0));
      const amountValues = series.map((row) => Number(row.revenue || 0));
      const maxCount = Math.max(1, ...countValues);
      const maxAmount = Math.max(1, ...amountValues);
      const step = plotW / Math.max(1, series.length - 1);
      const pointAt = (values, index, maxValue) => {
        const value = Number(values[index] || 0);
        return {
          x: pad + index * step,
          y: pad + (plotH - ((maxValue ? value / maxValue : 0) * plotH))
        };
      };

      ctx.fillStyle = "#60a5fa";
      series.forEach((row, index) => {
        const bw = Math.max(2, step * 0.6);
        const barH = maxCount ? (countValues[index] / maxCount) * plotH : 0;
        const x = pad + index * step - bw / 2;
        const y = pad + (plotH - barH);
        ctx.fillRect(x, y, bw, barH);
      });

      const gradient = ctx.createLinearGradient(0, pad, 0, pad + plotH);
      gradient.addColorStop(0, "rgba(16, 185, 129, 0.34)");
      gradient.addColorStop(1, "rgba(16, 185, 129, 0)");
      ctx.beginPath();
      series.forEach((row, index) => {
        const { x, y } = pointAt(amountValues, index, maxAmount);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.lineTo(pad + (series.length - 1) * step, pad + plotH);
      ctx.lineTo(pad, pad + plotH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.forEach((row, index) => {
        const { x, y } = pointAt(amountValues, index, maxAmount);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.fillStyle = "#10b981";
      series.forEach((row, index) => {
        const { x, y } = pointAt(amountValues, index, maxAmount);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = "#334155";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      series.forEach((row, index) => {
        if (series.length > 14 && index % Math.ceil(series.length / 10) !== 0) return;
        const label = typeof xLabel === "function" ? xLabel(row) : (row.slot || row.day || row.label || "");
        ctx.fillText(label, pad + index * step, h - 8);
      });
    }

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [data, height, xLabel, locale, currency, countLabel, amountLabel]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height, position: "relative" }}
      onMouseMove={(e) => {
        const container = containerRef.current;
        const tip = tipRef.current;
        if (!container || !tip) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const pad = 32;
        const w = Math.max(300, Math.floor(rect.width));
        const series = (data || []).slice();
        if (!series.length) { tip.style.display = "none"; return; }
        const plotW = w - pad * 2;
        const step = plotW / Math.max(1, series.length - 1);
        const idx = Math.round((x - pad) / step);
        if (idx < 0 || idx >= series.length) { tip.style.display = "none"; return; }
        const row = series[idx];
        const countValue = Number(row.orders || 0);
        const amountValue = Number(row.revenue || 0);
        const label = typeof xLabel === "function" ? xLabel(row) : (row.slot || row.day || row.label || "");
        tip.innerHTML = `<div style="font-weight:600">${label}</div><div>${countLabel}: ${countValue}</div><div>${amountLabel}: ${money(amountValue, currency, locale)}</div>`;
        tip.style.display = "block";
        const tipRect = tip.getBoundingClientRect();
        let left = x + 12;
        if (left + tipRect.width > rect.width) left = x - tipRect.width - 12;
        if (left < 6) left = 6;
        let top = y - tipRect.height - 8;
        if (top < 6) top = y + 8;
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
      }}
      onMouseLeave={() => { const tip = tipRef.current; if (tip) tip.style.display = "none"; }}
    >
      <canvas ref={canvasRef} />
      <div ref={tipRef} style={{ display: "none", position: "absolute", pointerEvents: "none", background: "rgba(17,24,39,0.9)", color: "#fff", padding: "6px 8px", borderRadius: 6, fontSize: 12, zIndex: 50 }} />
    </div>
  );
}

function CanvasTimeChart({ data, locale, currency }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const tipRef = useRef(null);
  const [visibleSeries, setVisibleSeries] = useState({ orders: true, revenue: true, avgTicket: true });

  function toggleSeries(key) {
    setVisibleSeries((current) => ({ ...current, [key]: !current[key] }));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;

    function draw() {
      const rect = container.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width));
      const h = 280;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const pad = 36;
      const slots = (data || []).slice();
      if (!slots.length) return;
      const hasVisibleSeries = visibleSeries.orders || visibleSeries.revenue || visibleSeries.avgTicket;
      if (!hasVisibleSeries) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("请选择至少一个指标", w / 2, h / 2);
        return;
      }
      const ordersSeries = slots.map((s) => Number(s.orders || 0));
      const revenueSeries = slots.map((s) => Number(s.revenue || 0));
      const avgTicketSeries = slots.map((s) => {
        const orders = Number(s.orders || 0);
        const revenue = Number(s.revenue || 0);
        return orders ? revenue / orders : 0;
      });
      const maxOrders = visibleSeries.orders ? Math.max(...ordersSeries, 1) : 1;
      const maxRevenue = visibleSeries.revenue ? Math.max(...revenueSeries, 1) : 1;
      const maxAvgTicket = visibleSeries.avgTicket ? Math.max(...avgTicketSeries, 1) : 1;
      const plotW = w - pad * 2;
      const plotH = h - pad * 2;
      const step = plotW / Math.max(1, slots.length - 1);
      const pointAt = (series, index, maxValue) => {
        const value = Number(series[index] || 0);
        return {
          x: pad + index * step,
          y: pad + (plotH - ((maxValue ? value / maxValue : 0) * plotH))
        };
      };

      // bars for orders
      if (visibleSeries.orders) {
        ctx.fillStyle = "#60a5fa";
        slots.forEach((s, i) => {
          const bw = Math.max(2, step * 0.6);
          const barH = maxOrders ? (ordersSeries[i] / maxOrders) * plotH : 0;
          const x = pad + i * step - bw / 2;
          const y = pad + (plotH - barH);
          ctx.fillRect(x, y, bw, barH);
        });
      }

      // revenue line
      if (visibleSeries.revenue) {
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        slots.forEach((s, i) => {
          const { x, y } = pointAt(revenueSeries, i, maxRevenue);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = "#10b981";
        slots.forEach((s, i) => {
          const { x, y } = pointAt(revenueSeries, i, maxRevenue);
          ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        });
      }

      // avg ticket line
      if (visibleSeries.avgTicket) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        slots.forEach((s, i) => {
          const { x, y } = pointAt(avgTicketSeries, i, maxAvgTicket);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f59e0b";
        slots.forEach((s, i) => {
          const { x, y } = pointAt(avgTicketSeries, i, maxAvgTicket);
          ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        });
      }

      const labelStep = Math.max(1, Math.ceil(slots.length / 12));

      // x labels (limit roughly to about 12 visible labels to avoid overlap)
      ctx.fillStyle = "#334155";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      slots.forEach((s, i) => {
        if (i % labelStep !== 0) return;
        const label = s.slot || s.time || s.label || '';
        const x = pad + i * step;
        ctx.fillText(label, x, h - 16);
      });
    }

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    window.addEventListener("orientationchange", draw);
    return () => { ro.disconnect(); window.removeEventListener("orientationchange", draw); };
  }, [data, locale, visibleSeries.orders, visibleSeries.revenue, visibleSeries.avgTicket]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: 280, position: 'relative' }}
      onMouseMove={(e) => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        const tip = tipRef.current;
        if (!container || !canvas || !tip) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const pad = 36;
        const w = Math.max(300, Math.floor(rect.width));
        const h = 280;
        const slots = (data || []).slice();
        if (!slots.length) { tip.style.display = 'none'; return; }
        const plotW = w - pad * 2;
        const step = plotW / Math.max(1, slots.length - 1);
        const idx = Math.round((x - pad) / step);
        if (idx < 0 || idx >= slots.length) { tip.style.display = 'none'; return; }
        const s = slots[idx];
        const orders = Number(s.orders || 0);
        const revenue = Number(s.revenue || 0);
        const avgTicket = orders ? revenue / orders : 0;
        tip.innerHTML = `<div style="font-weight:600">${s.slot || s.label || ''}</div><div>单量: ${orders}</div><div>营业额: ${money(revenue, currency, locale)}</div><div>客单价: ${money(avgTicket, currency, locale)}</div>`;
        tip.style.display = 'block';
        const tipRect = tip.getBoundingClientRect();
        let left = x + 12;
        if (left + tipRect.width > rect.width) left = x - tipRect.width - 12;
        if (left < 6) left = 6;
        let top = y - tipRect.height - 8;
        if (top < 6) top = y + 8;
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
      }}
      onMouseLeave={() => { const tip = tipRef.current; if (tip) tip.style.display = 'none'; }}
    >
      <div className="report-time-actions">
        <button type="button" className={`report-time-toggle orders ${visibleSeries.orders ? "active" : "inactive"}`} onClick={() => toggleSeries("orders")}>
          <i className="report-time-dot orders" />单量
        </button>
        <button type="button" className={`report-time-toggle revenue ${visibleSeries.revenue ? "active" : "inactive"}`} onClick={() => toggleSeries("revenue")}>
          <i className="report-time-dot revenue" />营业额
        </button>
        <button type="button" className={`report-time-toggle avg-ticket ${visibleSeries.avgTicket ? "active" : "inactive"}`} onClick={() => toggleSeries("avgTicket")}>
          <i className="report-time-dot avg-ticket" />客单价
        </button>
      </div>
      <canvas ref={canvasRef} />
      <div ref={tipRef} style={{ display: 'none', position: 'absolute', pointerEvents: 'none', background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '6px 8px', borderRadius: 6, fontSize: 12, zIndex: 50 }} />
    </div>
  );
}
