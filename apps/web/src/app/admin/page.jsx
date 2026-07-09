"use client";

import {
  Armchair,
  AlertCircle,
  Activity,
  BarChart3,
  ChefHat,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  ClipboardList,
  Grid3X3,
  Plus,
  Power,
  Printer,
  Redo2,
  RefreshCw,
  ReceiptText,
  Save,
  Search,
  Settings,
  Trash2,
  Copy,
  Download,
  FileDown,
  HardDrive,
  LogOut,
  Lock,
  TrendingDown,
  TrendingUp,
  Undo2,
  User,
  Users,
  WifiOff,
  Wrench,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, API_URL, labelOf } from "../../lib/api";
import qyposLogo from "../../pic/logo.png";

const tabs = [
  ["orders", ClipboardList, { "zh-CN": "订单", "en-GB": "Orders" }, ["manage_orders"]],
  ["kitchen", ChefHat, { "zh-CN": "厨房", "en-GB": "Kitchen" }, ["view_kitchen"]],
  ["prints", Printer, { "zh-CN": "打印", "en-GB": "Prints" }, ["manage_prints"]],
  ["menu", ReceiptText, { "zh-CN": "菜单", "en-GB": "Menu" }, ["manage_menu", "manage_menu_availability"]],
  ["dashboard", BarChart3, { "zh-CN": "看板", "en-GB": "Dashboard" }, ["view_dashboard"]],
  ["reports", TrendingUp, { "zh-CN": "分析", "en-GB": "Reports" }, ["view_reports"]],
  ["settings", Settings, { "zh-CN": "设置", "en-GB": "Settings" }, ["manage_settings"]],
  ["users", Users, { "zh-CN": "账户", "en-GB": "Users" }, ["manage_users"]],
  ["ops", Wrench, { "zh-CN": "运维", "en-GB": "Ops" }, ["manage_ops"]],
  ["layout", Armchair, { "zh-CN": "布局", "en-GB": "Layout" }, ["manage_tables"]]
];
const adminGatedTabs = new Set(["dashboard", "reports", "settings", "users", "ops", "layout"]);

const ROLE_LABELS = {
  owner: { "zh-CN": "管理员", "en-GB": "Owner" },
  cashier: { "zh-CN": "收银员", "en-GB": "Cashier" },
  kitchen: { "zh-CN": "厨房", "en-GB": "Kitchen" },
};

function roleLabel(role, locale = "zh-CN") {
  const value = ROLE_LABELS[role];
  if (!value) return role;
  return value[locale] || value["zh-CN"] || value["en-GB"] || role;
}

function tabLabelOf(tab, locale = "zh-CN") {
  const label = tab?.[2];
  if (!label) return "";
  if (typeof label === "string") return label;
  return label[locale] || label["zh-CN"] || label["en-GB"] || "";
}

function t(locale, zh, en) {
  return locale === "en-GB" ? en : zh;
}

function orderStatusLabel(status, locale) {
  const labels = {
    draft: { "zh-CN": "草稿", "en-GB": "Draft" },
    submitted: { "zh-CN": "已下单", "en-GB": "Submitted" },
    paid: { "zh-CN": "已付款", "en-GB": "Paid" },
    cancelled: { "zh-CN": "已取消", "en-GB": "Cancelled" }
  };
  return labels[status]?.[locale] || labels[status]?.["zh-CN"] || status;
}

function serviceTypeLabel(type, locale) {
  return type === "dine_in"
    ? t(locale, "堂食", "Dine-in")
    : t(locale, "外带", "Takeaway");
}

function kitchenStatusLabel(status, locale) {
  const labels = {
    ordered: { "zh-CN": "待制作", "en-GB": "Queued" },
    preparing: { "zh-CN": "制作中", "en-GB": "Preparing" },
    ready_to_serve: { "zh-CN": "待上菜", "en-GB": "Ready to serve" },
    served: { "zh-CN": "已上菜", "en-GB": "Served" },
    cancelled: { "zh-CN": "已取消", "en-GB": "Cancelled" }
  };
  return labels[status]?.[locale] || labels[status]?.["zh-CN"] || status;
}

function printJobStatusLabel(status, locale) {
  const labels = {
    queued: { "zh-CN": "排队中", "en-GB": "Queued" },
    printing: { "zh-CN": "打印中", "en-GB": "Printing" },
    succeeded: { "zh-CN": "已完成", "en-GB": "Succeeded" },
    failed: { "zh-CN": "失败", "en-GB": "Failed" }
  };
  return labels[status]?.[locale] || labels[status]?.["zh-CN"] || status;
}

function printJobTypeLabel(type, locale) {
  const labels = {
    kitchen: { "zh-CN": "厨房单", "en-GB": "Kitchen ticket" },
    receipt: { "zh-CN": "收银小票", "en-GB": "Receipt" },
    test: { "zh-CN": "测试打印", "en-GB": "Test print" }
  };
  return labels[type]?.[locale] || labels[type]?.["zh-CN"] || type;
}

function LocaleSwitcher({ locale, onSwitch, disabled }) {
  const nextLocale = locale === "en-GB" ? "zh-CN" : "en-GB";
  return (
    <div className="locale-switcher" role="group" aria-label="Language switch">
      <button type="button" className={locale === "zh-CN" ? "selected" : ""} onClick={() => onSwitch("zh-CN")} disabled={disabled || locale === "zh-CN"} aria-pressed={locale === "zh-CN"}>中文</button>
      <button type="button" className={locale === "en-GB" ? "selected" : ""} onClick={() => onSwitch("en-GB")} disabled={disabled || locale === "en-GB"} aria-pressed={locale === "en-GB"}>English</button>
      <button type="button" className="locale-switcher-toggle" onClick={() => onSwitch(nextLocale)} disabled={disabled}>{locale === "zh-CN" ? "EN" : "中文"}</button>
    </div>
  );
}

function hasAnyPermission(user, permissions) {
  return permissions.some((permission) => user?.permissions?.includes(permission));
}

function money(value, currency = "CNY", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value || 0));
}

function getLocalToday() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr, delta) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return formatDateStr(date);
}

function addYears(dateStr, delta) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setFullYear(date.getFullYear() + delta);
  return formatDateStr(date);
}

function mondayOf(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const dow = (date.getDay() + 6) % 7; // 0 = Monday
  return addDays(dateStr, -dow);
}

function daySpan(fromStr, toStr) {
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T00:00:00`);
  return Math.round((to - from) / 86400000) + 1;
}

function pctDelta(curr, prev) {
  const c = Number(curr || 0);
  const p = Number(prev || 0);
  if (!p) return null;
  return Math.round(((c - p) / p) * 1000) / 10;
}

// ISO-ish week grouping (Mon-Sun) for weekly breakdown analysis
function groupByWeek(byDay, locale) {
  const weeks = new Map();
  for (const row of (byDay || [])) {
    const date = new Date(row.day);
    const dow = (date.getDay() + 6) % 7; // 0 = Monday
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - dow);
    const key = formatDateStr(weekStart);
    if (!weeks.has(key)) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weeks.set(key, {
        key,
        label: `${weekStart.toLocaleDateString(locale, { month: "2-digit", day: "2-digit" })} - ${weekEnd.toLocaleDateString(locale, { month: "2-digit", day: "2-digit" })}`,
        orders: 0,
        revenue: 0
      });
    }
    const bucket = weeks.get(key);
    bucket.orders += Number(row.orders || 0);
    bucket.revenue += Number(row.revenue || 0);
  }
  return [...weeks.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function weekdayLabels(locale) {
  return locale === "en-GB"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
}

// Day-of-week comparison: cumulative orders/revenue per weekday (Mon-Sun) across the whole selected range
function groupByWeekday(byDay, locale) {
  const buckets = weekdayLabels(locale).map((label, idx) => ({ dow: idx, label, orders: 0, revenue: 0, days: 0 }));
  for (const row of (byDay || [])) {
    const date = new Date(row.day);
    const dow = (date.getDay() + 6) % 7; // 0 = Monday
    const bucket = buckets[dow];
    bucket.orders += Number(row.orders || 0);
    bucket.revenue += Number(row.revenue || 0);
    bucket.days += 1;
  }
  return buckets;
}

function formatClockMinute(totalMinutes) {
  const normalized = ((Number(totalMinutes) % 1440) + 1440) % 1440;
  const hours = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minutes = String(normalized % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildTimeBucketSeries(byTime, intervalMinutes) {
  const slots = (byTime || []).map((row, index) => ({
    orders: Number(row.orders || 0),
    revenue: Number(row.revenue || 0),
    slot: row.slot || row.label || formatClockMinute(index * 30)
  }));
  if (Number(intervalMinutes) <= 30) {
    return slots.map((row) => ({ ...row }));
  }

  const bucketSize = Math.max(1, Math.round(Number(intervalMinutes) / 30));
  const buckets = [];
  for (let index = 0; index < slots.length; index += bucketSize) {
    const chunk = slots.slice(index, index + bucketSize);
    if (!chunk.length) continue;
    const start = index * 30;
    const end = start + Number(intervalMinutes);
    buckets.push({
      slot: `${formatClockMinute(start)}-${formatClockMinute(end)}`,
      orders: chunk.reduce((sum, row) => sum + Number(row.orders || 0), 0),
      revenue: chunk.reduce((sum, row) => sum + Number(row.revenue || 0), 0)
    });
  }
  return buckets;
}

function normalizeHotItemName(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim().toLowerCase();
  return String(value["zh-CN"] || value["en-GB"] || Object.values(value)[0] || "").trim().toLowerCase();
}

function hotItemKeyFor(item) {
  if (!item) return "";
  return item.item_key || item.item_id || `name:${normalizeHotItemName(item.name_i18n)}`;
}

function combineTrendRows(trendRowsList, keyField, labelField, fallbackLabel) {
  const buckets = new Map();
  for (const rows of trendRowsList || []) {
    for (const row of rows || []) {
      const key = String(row?.[keyField] || "");
      if (!key) continue;
      const existing = buckets.get(key) || { [keyField]: key, [labelField]: row?.[labelField] || fallbackLabel || key, orders: 0, revenue: 0 };
      existing.orders += Number(row?.orders || 0);
      existing.revenue += Number(row?.revenue || 0);
      if (!existing[labelField] && row?.[labelField]) existing[labelField] = row[labelField];
      buckets.set(key, existing);
    }
  }
  return [...buckets.values()];
}

function combineHotItemTrends(items, trendsByKey) {
  const loadedItems = items.filter((item) => trendsByKey[hotItemKeyFor(item)]?.data);
  if (!loadedItems.length) return null;
  const daily = combineTrendRows(
    loadedItems.map((item) => trendsByKey[hotItemKeyFor(item)]?.data?.byDay || []),
    "day",
    "day",
    ""
  ).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  const byTime = combineTrendRows(
    loadedItems.map((item) => trendsByKey[hotItemKeyFor(item)]?.data?.byTime || []),
    "slot",
    "slot",
    ""
  ).sort((a, b) => String(a.slot).localeCompare(String(b.slot)));
  const summary = loadedItems.reduce((acc, item) => {
    const trend = trendsByKey[hotItemKeyFor(item)]?.data;
    acc.orders += Number(trend?.summary?.orders || 0);
    acc.revenue += Number(trend?.summary?.revenue || 0);
    return acc;
  }, { orders: 0, revenue: 0 });
  return { summary, byDay: daily, byTime };
}

function AdminLogin({ onLogin }) {
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

function AdminGateModal({ tab, locale, onCancel, onGranted }) {
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

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("orders");
  const [adminGateTarget, setAdminGateTarget] = useState(null);
  const [adminGrantTab, setAdminGrantTab] = useState(null);
  const [online, setOnline] = useState(true);
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [menu, setMenu] = useState({ categories: [], items: [] });
  const [layout, setLayout] = useState({ areas: [], tables: [] });
  const [orders, setOrders] = useState([]);
  const [kitchenItems, setKitchenItems] = useState([]);
  const [printJobs, setPrintJobs] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [report, setReport] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [opsHealth, setOpsHealth] = useState(null);
  const [backups, setBackups] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [notice, setNotice] = useState("");
  const noticeTimerRef = useRef(null);

  const locale = settings?.locale || "zh-CN";
  const currency = settings?.currency || "CNY";
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale.startsWith("en") ? "en" : "zh-CN";
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  async function refresh(currentUser = user, grantedTab = adminGrantTab) {
    if (!currentUser) return;
    const requests = {
      settings: api("/settings"),
      menu: api("/menu"),
    };
    if (hasAnyPermission(currentUser, ["manage_tables"]) || grantedTab === "layout") requests.layout = api("/floor-layouts");
    if (hasAnyPermission(currentUser, ["manage_orders"])) requests.orders = api("/orders");
    if (hasAnyPermission(currentUser, ["view_kitchen"])) requests.kitchen = api("/kitchen/items");
    if (hasAnyPermission(currentUser, ["manage_prints"])) requests.prints = api("/print-jobs");
    if (hasAnyPermission(currentUser, ["view_dashboard"]) || grantedTab === "dashboard") requests.dashboard = api("/dashboard/today");
    if (hasAnyPermission(currentUser, ["view_audit_logs"]) || grantedTab === "dashboard") requests.audit = api("/audit-logs");
    const data = Object.fromEntries(await Promise.all(
      Object.entries(requests).map(async ([key, promise]) => [key, await promise])
    ));
    setSettings(data.settings);
    setMenu(data.menu);
    if (data.layout) setLayout(data.layout);
    if (data.orders) setOrders(data.orders);
    if (data.kitchen) setKitchenItems(data.kitchen);
    if (data.prints) setPrintJobs(data.prints);
    if (data.dashboard) setDashboard(data.dashboard);
    if (data.audit) setAuditLogs(data.audit);
    if ((activeTab === "ops" || grantedTab === "ops") && (hasAnyPermission(currentUser, ["manage_ops"]) || grantedTab === "ops")) await refreshOps(currentUser, grantedTab);
  }

  async function verifyAuth() {
    const me = await api("/auth/me");
    setUser(me);
    return me;
  }

  async function loadProtectedData() {
    const me = await verifyAuth();
    await refresh(me).catch((err) => {
      // Data refresh failure should never log the user out
      showNotice(err.message || t(locale, "数据加载失败", "Failed to load data"));
    });
  }

  async function refreshOps(currentUser = user, grantedTab = adminGrantTab) {
    if (!hasAnyPermission(currentUser, ["manage_ops"]) && grantedTab !== "ops") return;
    const [healthData, backupData] = await Promise.all([
      api("/ops/health"),
      api("/ops/backups")
    ]);
    setOpsHealth(healthData);
    setBackups(backupData);
  }

  async function refreshUsers(currentUser = user, grantedTab = adminGrantTab) {
    if (!hasAnyPermission(currentUser, ["manage_users"]) && grantedTab !== "users") return;
    const [usersData, rolesData] = await Promise.all([
      api("/users"),
      api("/roles")
    ]);
    setUsersList(usersData);
    setRolesList(rolesData);
  }

  async function run(action, successText) {
    setNotice("");
    try {
      await action();
      if (successText) showNotice(successText);
    } catch (error) {
      showNotice(error.message);
    }
  }

  function showNotice(message) {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 3000);
  }

  async function revokeAdminGrant() {
    const token = window.sessionStorage.getItem("qypos_admin_grant");
    if (token) {
      try { await api("/auth/admin-grant", { method: "DELETE" }); } catch { /* grant also expires server-side */ }
    }
    window.sessionStorage.removeItem("qypos_admin_grant");
    setAdminGrantTab(null);
  }

  async function selectTab(id) {
    await revokeAdminGrant();
    const permissions = tabs.find(([tabId]) => tabId === id)?.[3] ?? [];
    if (adminGatedTabs.has(id) && !hasAnyPermission(user, permissions)) {
      if (adminGatedTabs.has(activeTab)) setActiveTab("orders");
      setAdminGateTarget(id);
      return;
    }
    setAdminGateTarget(null);
    setActiveTab(id);
    if (id === "dashboard" || id === "layout") await refresh(user);
    if (id === "users") await refreshUsers(user);
    if (id === "ops") await refreshOps(user);
  }

  async function enterAdminTab(id) {
    try {
      setAdminGrantTab(id);
      setActiveTab(id);
      await refresh(user, id);
      if (id === "users") await refreshUsers(user, id);
      setAdminGateTarget(null);
    } catch (error) {
      await revokeAdminGrant();
      throw error;
    }
  }

  useEffect(() => {
    window.sessionStorage.removeItem("qypos_admin_grant");
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    verifyAuth().then((me) => {
      if (me) refresh(me).catch((err) => showNotice(err.message || t(locale, "数据加载失败", "Failed to load data")));
    }).catch(() => setUser(null));
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const apiPort = process.env.NEXT_PUBLIC_API_PORT || "4000";
    const socket = new WebSocket(`${wsProtocol}//${window.location.hostname}:${apiPort}/ws`);
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.event ?? "";
        if (type === "kitchen.item.updated") {
          api("/kitchen/items").then(setKitchenItems).catch(() => {});
          return;
        }
        if (type.startsWith("print.")) {
          api("/print-jobs").then(setPrintJobs).catch(() => {});
          return;
        }
        if (type === "table.status.updated") {
          Promise.all([api("/floor-layouts"), api("/orders")]).then(([l, o]) => { setLayout(l); setOrders(o); }).catch(() => {});
          return;
        }
      } catch {
        // ignore parse errors, fall through to full refresh
      }
      refresh().catch(() => {});
    };
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      socket.close();
    };
  }, [user?.id]);

  const allowedTabs = user ? tabs.filter(([id, , , permissions]) => adminGatedTabs.has(id) || hasAnyPermission(user, permissions)) : [];
  useEffect(() => {
    if (user && !allowedTabs.some(([id]) => id === activeTab)) {
      setActiveTab(allowedTabs[0]?.[0] ?? "orders");
    }
  }, [user, activeTab, allowedTabs]);

  if (!user) {
    return <AdminLogin onLogin={async (nextUser) => {
      // Set user immediately from login response so the UI transitions away from the login form
      setUser(nextUser);
      // Verify auth and load data in the background; failures here won't log the user out
      // because verifyAuth() will succeed (token is fresh) and refresh() errors are caught
      await loadProtectedData();
    }} />;
  }

  return (
    <main>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src={qyposLogo.src} alt="QYPOS" />
          <span>QYPOS</span>
        </div>
        <nav>
          {allowedTabs.map((tab) => {
            const [id, Icon] = tab;
            const label = tabLabelOf(tab, locale);
            return (
              <button key={id} className={activeTab === id ? "active" : ""} onClick={() => selectTab(id)} title={label}>
              {adminGatedTabs.has(id) && !hasAnyPermission(user, tabs.find(([tabId]) => tabId === id)?.[3] ?? []) && <Lock className="admin-lock-icon" size={14} aria-label={t(locale, "需要管理员验证", "Admin verification required")} />}
              <Icon size={20} />
              <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{tabLabelOf(tabs.find(([id]) => id === activeTab), locale)}</h1>
            {activeTab === "settings" && settings && <p>{`${settings.currency} · Tax ${(Number(settings.tax_rate) * 100).toFixed(1)}% · Service ${(Number(settings.service_charge_rate) * 100).toFixed(1)}%`}</p>}
          </div>
          <div className="top-actions">
            <span className="user-chip"><User size={16} />{user.name} · {roleLabel(user.role, locale)}</span>
            <a className="link-button" href="/">{locale === "en-GB" ? "POS" : "点餐前台"}</a>
            <button onClick={refresh} title={locale === "en-GB" ? "Refresh" : "刷新"}>
              <Save size={18} />
              <span>{locale === "en-GB" ? "Refresh" : "刷新"}</span>
            </button>
            <button onClick={async () => {
              await revokeAdminGrant();
              await api("/auth/logout", { method: "POST" });
              window.localStorage.removeItem("qypos_token");
              setUser(null);
            }} title={locale === "en-GB" ? "Sign out" : "退出"}>
              <LogOut size={18} />
              <span>{locale === "en-GB" ? "Sign out" : "退出"}</span>
            </button>
          </div>
        </header>

        {!online && <div className="offline-banner"><WifiOff size={16} />{t(locale, "当前离线，部分操作会失败，请检查网络或本地服务。", "You're offline. Some actions may fail. Check the network or local service.")}</div>}
        {notice && <button className="notice toast" onClick={() => setNotice("")}>{notice}</button>}
        {activeTab === "orders" && <OrdersView orders={orders} locale={locale} currency={currency} />}
        {activeTab === "kitchen" && <KitchenView items={kitchenItems} locale={locale} onStatus={async (item, status) => run(async () => {
          await api(`/orders/${item.order_id}/items/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
          await refresh();
        }, t(locale, "厨房状态已更新", "Kitchen status updated"))} />}
        {activeTab === "prints" && <PrintJobsView jobs={printJobs} locale={locale} onRetry={async (job) => run(async () => {
          await api(`/print-jobs/${job.id}/retry`, { method: "POST" });
          await refresh();
        }, t(locale, "打印任务已重新入队", "Print job requeued"))} />}
        {activeTab === "menu" && (user.permissions.includes("manage_menu")
          ? <MenuAdmin menu={menu} locale={locale} currency={currency} onSaved={refresh} onNotify={showNotice} />
          : <MenuAvailabilityAdmin menu={menu} locale={locale} currency={currency} onSaved={refresh} onNotify={showNotice} />)}
        {activeTab === "dashboard" && <Dashboard dashboard={dashboard} auditLogs={auditLogs} locale={locale} currency={currency} />}
        {activeTab === "reports" && <ReportsAnalytics report={report} setReport={setReport} locale={locale} currency={currency} />}
        {activeTab === "settings" && settings && <SettingsView settings={settings} setSettings={setSettings} locale={locale} onSaved={refresh} adminAuthorized={adminGrantTab === "settings"} />}
        {activeTab === "layout" && <LayoutView layout={layout} onSaved={refresh} />}
        {activeTab === "users" && <UsersView usersList={usersList} rolesList={rolesList} onSaved={async () => { await refresh(); await refreshUsers(); }} />}
        {activeTab === "ops" && settings && <OpsView health={opsHealth} backups={backups} settings={settings} setSettings={setSettings} locale={locale} onRefresh={refreshOps} onSaved={async () => { await refresh(); await refreshOps(); }} />}
      </section>
      {adminGateTarget && <AdminGateModal tab={adminGateTarget} locale={locale} onCancel={() => setAdminGateTarget(null)} onGranted={enterAdminTab} />}
    </main>
  );
}

const ORDER_STATUS_COLOR = {
  draft: "chip-warn",
  submitted: "chip-blue",
  paid: "chip-green",
  cancelled: "chip-grey",
};

function OrderDetailModal({ order, locale, currency, onClose }) {
  const [printing, setPrinting] = useState(false);
  const [printFeedback, setPrintFeedback] = useState("");
  if (!order) return null;
  const subtotal = Number(order.subtotal || 0);
  const serviceCharge = Number(order.service_charge || 0);
  const discount = Number(order.discount || 0);
  const total = Number(order.total || 0);
  const paid = (order.payments || []).reduce((s, p) => s + Number(p.amount), 0);

  async function printReceipt() {
    setPrinting(true);
    setPrintFeedback("");
    try {
      await api(`/orders/${order.id}/print`, {
        method: "POST",
        body: JSON.stringify({ type: "receipt" })
      });
      setPrintFeedback(t(locale, "小票已发送到打印队列", "Receipt sent to the print queue"));
    } catch (error) {
      setPrintFeedback(error.message);
    } finally {
      setPrinting(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal order-detail-modal">
        <div className="modal-header">
          <div>
            <h2 style={{ marginBottom: 4 }}>{order.order_no}</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={`admin-chip ${ORDER_STATUS_COLOR[order.status] || "chip-grey"}`}>
                {orderStatusLabel(order.status, locale)}
              </span>
              <span className="admin-chip chip-grey">{serviceTypeLabel(order.service_type, locale)}</span>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                {new Date(order.created_at).toLocaleString(locale)}
              </span>
            </div>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="order-detail-items">
          {(order.items || []).length === 0 && <div className="empty">{t(locale, "无菜品记录", "No items")}</div>}
          {(order.items || []).map((item) => {
            const quantity = Number(item.quantity || 0);
            const modifiers = [];
            for (const modifier of item.modifiers || []) {
              const key = modifier.modifier_id || `${JSON.stringify(modifier.name_i18n)}:${modifier.price_delta}`;
              const existing = modifiers.find((entry) => entry.key === key);
              if (existing) existing.count += 1;
              else modifiers.push({ ...modifier, key, count: 1 });
            }
            const modifierUnitTotal = (item.modifiers || []).reduce((sum, modifier) => sum + Number(modifier.price_delta || 0), 0);
            const baseUnitPrice = Number(item.unit_price || 0);
            const unitTotal = baseUnitPrice + modifierUnitTotal;
            return (
              <div className="order-detail-item" key={item.id}>
                <div className="order-detail-item-head">
                  <div className="order-detail-item-name">
                    <strong>{labelOf(item.name_i18n, locale) || "-"}</strong>
                    {item.variant_name_i18n && <small>{t(locale, "规格：", "Option: ")}{labelOf(item.variant_name_i18n, locale)}</small>}
                  </div>
                  <span>{t(locale, "数量", "Qty")} ×{quantity}</span>
                </div>
                <div className="order-detail-price-breakdown">
                  <span>{t(locale, "基础单价", "Base price")}</span><strong>{money(baseUnitPrice, currency, locale)}</strong>
                  {modifiers.map((modifier) => (
                    <div className="order-detail-modifier" key={modifier.key}>
                      <span>＋ {modifier.group_name_i18n ? `${labelOf(modifier.group_name_i18n, locale)}：` : ""}{labelOf(modifier.name_i18n, locale)}{modifier.count > 1 ? ` ×${modifier.count}` : ""}</span>
                      <strong>{money(Number(modifier.price_delta || 0) * modifier.count, currency, locale)}</strong>
                    </div>
                  ))}
                  <span>{t(locale, "每份合计", "Per item")}</span><strong>{money(unitTotal, currency, locale)}</strong>
                  <span className="line-total-label">{t(locale, "本项合计", "Line total")}</span><strong className="line-total-value">{money(unitTotal * quantity, currency, locale)}</strong>
                </div>
                {item.notes && <div className="order-detail-note">{t(locale, "备注：", "Notes: ")}{item.notes}</div>}
              </div>
            );
          })}
        </div>

        <div className="order-detail-totals">
          <div><span>{t(locale, "小计", "Subtotal")}</span><span>{money(subtotal, currency, locale)}</span></div>
          {serviceCharge > 0 && <div><span>{t(locale, "服务费", "Service charge")}</span><span>{money(serviceCharge, currency, locale)}</span></div>}
          {discount > 0 && <div><span>{t(locale, "折扣", "Discount")}</span><span>-{money(discount, currency, locale)}</span></div>}
          <div className="total-row"><span>{t(locale, "合计", "Total")}</span><strong>{money(total, currency, locale)}</strong></div>
        </div>

        {(order.payments || []).length > 0 && (
          <div className="order-detail-payments">
            <h3>{t(locale, "支付记录", "Payments")}</h3>
            {order.payments.map((p) => (
              <div key={p.id} className="payment-row">
                <span>{p.method}</span>
                <span>{money(p.amount, currency, locale)}</span>
                {p.change_due > 0 && <small>{t(locale, "找零 ", "Change ")}{money(p.change_due, currency, locale)}</small>}
              </div>
            ))}
          </div>
        )}
        <div className="order-detail-actions">
          <button type="button" onClick={printReceipt} disabled={printing}><Printer size={16} /><span>{printing ? t(locale, "发送中…", "Sending…") : t(locale, "打印小票", "Print receipt")}</span></button>
          {printFeedback && <span>{printFeedback}</span>}
        </div>
      </div>
    </div>
  );
}

function OrdersView({ orders, locale, currency }) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("time_desc");
  const [search, setSearch] = useState("");
  const [detailOrder, setDetailOrder] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  async function openDetail(order) {
    setLoadingId(order.id);
    try {
      const full = await api(`/orders/${order.id}`);
      setDetailOrder(full);
    } finally {
      setLoadingId(null);
    }
  }

  const filtered = orders
    .filter((o) => {
      if (filterStatus !== "all" && o.status !== filterStatus) return false;
      if (filterType !== "all" && o.service_type !== filterType) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!o.order_no.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "time_desc") return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === "time_asc") return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === "amount_desc") return Number(b.total) - Number(a.total);
      if (sortBy === "amount_asc") return Number(a.total) - Number(b.total);
      return 0;
    });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedOrders = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, filterType, sortBy, search]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  return (
    <>
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          locale={locale}
          currency={currency}
          onClose={() => setDetailOrder(null)}
        />
      )}

      <div className="orders-toolbar">
        <div className="orders-filters">
          <div className="filter-group">
            <label>{t(locale, "状态", "Status")}</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">{t(locale, "全部", "All")}</option>
              <option value="draft">{t(locale, "草稿", "Draft")}</option>
              <option value="submitted">{t(locale, "已下单", "Submitted")}</option>
              <option value="paid">{t(locale, "已付款", "Paid")}</option>
              <option value="cancelled">{t(locale, "已取消", "Cancelled")}</option>
            </select>
          </div>
          <div className="filter-group">
            <label>{t(locale, "类型", "Type")}</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">{t(locale, "全部", "All")}</option>
              <option value="dine_in">{t(locale, "堂食", "Dine-in")}</option>
              <option value="takeaway">{t(locale, "外带", "Takeaway")}</option>
            </select>
          </div>
          <div className="filter-group">
            <label>{t(locale, "排序", "Sort")}</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="time_desc">{t(locale, "时间 ↓ 最新", "Time ↓ Newest")}</option>
              <option value="time_asc">{t(locale, "时间 ↑ 最早", "Time ↑ Oldest")}</option>
              <option value="amount_desc">{t(locale, "金额 ↓ 最高", "Amount ↓ Highest")}</option>
              <option value="amount_asc">{t(locale, "金额 ↑ 最低", "Amount ↑ Lowest")}</option>
            </select>
          </div>
        </div>
        <div className="orders-search">
          <Search size={15} />
          <input
            placeholder={t(locale, "搜索单号…", "Search order no…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="orders-count">{filtered.length} {t(locale, "条", "orders")}</span>
      </div>

      <div className="orders-table">
        <div className="orders-table-head">
          <span>{t(locale, "单号", "Order no.")}</span>
          <span>{t(locale, "类型", "Type")}</span>
          <span>{t(locale, "状态", "Status")}</span>
          <span>{t(locale, "时间", "Time")}</span>
          <span style={{ textAlign: "right" }}>{t(locale, "金额", "Amount")}</span>
        </div>
        {filtered.length === 0 && <div className="empty" style={{ padding: "24px 0" }}>{t(locale, "暂无订单", "No orders")}</div>}
        {pagedOrders.map((order) => (
          <button
            key={order.id}
            className="orders-table-row"
            onClick={() => openDetail(order)}
            disabled={loadingId === order.id}
          >
            <span className="order-no-cell">{order.order_no}</span>
            <span>{serviceTypeLabel(order.service_type, locale)}</span>
            <span>
              <em className={`admin-chip ${ORDER_STATUS_COLOR[order.status] || "chip-grey"}`}>
                {orderStatusLabel(order.status, locale)}
              </em>
            </span>
            <span className="order-time-cell">
              {new Date(order.created_at).toLocaleString(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
            <strong style={{ textAlign: "right" }}>{money(order.total, currency, locale)}</strong>
          </button>
        ))}
      </div>
      {filtered.length > pageSize && (
        <div className="orders-pagination">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>{t(locale, "上一页", "Previous")}</button>
          <span>{page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>{t(locale, "下一页", "Next")}</button>
        </div>
      )}
    </>
  );
}

function KitchenView({ items, locale, onStatus }) {
  const statusLabels = {
    ordered: t(locale, "待制作", "Queued"),
    preparing: t(locale, "制作中", "Preparing"),
    ready_to_serve: t(locale, "待上菜", "Ready to serve"),
    served: t(locale, "已上菜", "Served"),
    cancelled: t(locale, "已取消", "Cancelled")
  };

  return (
    <section className="kitchen-board">
      {items.map((item) => (
        <article className={`kitchen-ticket kitchen-${item.status}`} key={item.id}>
          <div className="ticket-head">
            <h2>{labelOf(item.name_i18n, locale)}</h2>
            <strong>x{item.quantity}</strong>
          </div>
          <p>{item.service_type === "dine_in" ? `${t(locale, "桌台", "Table")} ${item.table_label || "-"}` : `${t(locale, "外带", "Takeaway")} ${item.pickup_no || "-"}`}</p>
          <p>{item.order_no} · {statusLabels[item.status] || item.status}</p>
          {item.notes && <small>{item.notes}</small>}
          <time>{new Date(item.created_at).toLocaleTimeString(locale)}</time>
          <div className="ticket-actions">
            <button onClick={() => onStatus(item, "preparing")} disabled={item.status === "preparing"}>{t(locale, "制作中", "Preparing")}</button>
            <button onClick={() => onStatus(item, "ready_to_serve")} disabled={item.status === "ready_to_serve"}>{t(locale, "待上菜", "Ready to serve")}</button>
            <button className="primary" onClick={() => onStatus(item, "served")}>{t(locale, "已上菜", "Served")}</button>
          </div>
        </article>
      ))}
      {!items.length && <div className="empty">{t(locale, "暂无待处理菜品", "No pending items")}</div>}
    </section>
  );
}

function PrintJobsView({ jobs, locale, onRetry }) {
  const statusLabels = {
    queued: printJobStatusLabel("queued", locale),
    printing: printJobStatusLabel("printing", locale),
    succeeded: printJobStatusLabel("succeeded", locale),
    failed: printJobStatusLabel("failed", locale)
  };
  const typeLabels = {
    kitchen: printJobTypeLabel("kitchen", locale),
    receipt: printJobTypeLabel("receipt", locale),
    test: printJobTypeLabel("test", locale)
  };

  return (
    <section className="wide-list">
      {jobs.map((job) => (
        <div className="list-row print-row" key={job.id}>
          <span>{typeLabels[job.type] || job.type}</span>
          <span>{statusLabels[job.status] || job.status}</span>
          <span>{new Date(job.created_at).toLocaleString(locale)}</span>
            <span>{job.attempts} {t(locale, "次", "tries")}</span>
          {job.error ? <small className="print-error"><AlertCircle size={14} />{job.error}</small> : <small>-</small>}
          <button onClick={() => onRetry(job)} disabled={job.status === "queued" || job.status === "printing"}>
            <RefreshCw size={16} />
            <span>{t(locale, "重试", "Retry")}</span>
          </button>
        </div>
      ))}
      {!jobs.length && <div className="empty">{t(locale, "暂无打印任务", "No print jobs")}</div>}
    </section>
  );
}

function MenuAvailabilityAdmin({ menu, locale, currency, onSaved, onNotify }) {
  const [selectedCatId, setSelectedCatId] = useState("all");
  const [busyItemId, setBusyItemId] = useState(null);
  const items = selectedCatId === "all"
    ? menu.items
    : menu.items.filter((item) => item.category_id === selectedCatId);

  async function toggleItem(item) {
    setBusyItemId(item.id);
    try {
      await api(`/menu/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active })
      });
      await onSaved();
      onNotify(item.active ? t(locale, "菜品已下架", "Item deactivated") : t(locale, "菜品已上架", "Item activated"));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title split">
          <div className="inline-title"><ReceiptText size={18} /><h2>{t(locale, "菜品上下架", "Item availability")}</h2></div>
        </div>
      <div className="order-filter-bar" style={{ marginBottom: 12 }}>
        <button className={selectedCatId === "all" ? "selected" : ""} onClick={() => setSelectedCatId("all")}>{t(locale, "全部", "All")}</button>
        {menu.categories.map((category) => (
          <button
            key={category.id}
            className={selectedCatId === category.id ? "selected" : ""}
            onClick={() => setSelectedCatId(category.id)}
          >
            {labelOf(category.name_i18n, locale)}
          </button>
        ))}
      </div>
      <div className="menu-item-list">
        {items.map((item) => (
          <div key={item.id} className={`menu-item-row${item.active ? "" : " inactive"}`}>
            <div className="menu-item-row-head" style={{ cursor: "default" }}>
              <span className="item-name">{labelOf(item.name_i18n, locale)}</span>
              <span className={`item-badge${item.active ? " badge-active" : " badge-inactive"}`}>
                {item.active ? t(locale, "上架", "Active") : t(locale, "下架", "Inactive")}
              </span>
              <span className="muted">{labelOf(menu.categories.find((category) => category.id === item.category_id)?.name_i18n, locale) || "未分类"}</span>
              <button
                type="button"
                className="action-toggle"
                disabled={busyItemId === item.id}
                onClick={() => toggleItem(item)}
              >
                <Power size={16} />
                <span>{busyItemId === item.id ? t(locale, "处理中…", "Working…") : item.active ? t(locale, "下架", "Deactivate") : t(locale, "上架", "Activate")}</span>
              </button>
            </div>
          </div>
        ))}
        {!items.length && <div className="empty">{t(locale, "暂无菜品", "No items")}</div>}
      </div>
    </div>
  );
}

function MenuAdmin({ menu, locale, currency, onSaved, onNotify }) {
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [categoryZh, setCategoryZh] = useState("");
  const [categoryEn, setCategoryEn] = useState("");
  const [newItem, setNewItem] = useState({ nameZh: "", nameEn: "", price: "0", categoryId: "", variantPresetId: "" });

  const firstCatId = menu.categories[0]?.id;
  const filteredItems = selectedCatId ? menu.items.filter((item) => item.category_id === selectedCatId) : menu.items;
  const selectedCat = selectedCatId ? menu.categories.find((c) => c.id === selectedCatId) : null;

  async function deleteCategory(cat, itemCount) {
    const suffix = itemCount > 0 ? `\n该分类下 ${itemCount} 个菜品将变为"未分类"。` : "";
    if (!window.confirm(`永久删除分类"${labelOf(cat.name_i18n, locale)}"？${suffix}`)) return;
    try {
      await api(`/menu/categories/${cat.id}/destroy`, { method: "DELETE" });
      if (selectedCatId === cat.id) setSelectedCatId(null);
      await onSaved();
    } catch (err) {
      alert(err.message);
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    await api("/menu/categories", {
      method: "POST",
      body: JSON.stringify({
        name_i18n: { "zh-CN": categoryZh, "en-GB": categoryEn || categoryZh },
        sort_order: menu.categories.length
      })
    });
    setCategoryZh("");
    setCategoryEn("");
    setShowCatForm(false);
    await onSaved();
  }

  async function saveItem(event) {
    event.preventDefault();
    const item = await api("/menu/items", {
      method: "POST",
      body: JSON.stringify({
        category_id: newItem.categoryId || selectedCatId || firstCatId,
        name_i18n: { "zh-CN": newItem.nameZh, "en-GB": newItem.nameEn || newItem.nameZh },
        variants: newItem.variantPresetId ? [] : [{ name_i18n: { "zh-CN": "标准", "en-GB": "Standard" }, price: Number(newItem.price) }]
      })
    });
    for (const presetId of [newItem.variantPresetId].filter(Boolean)) {
      await api(`/menu/items/${item.id}/apply-option-preset`, {
        method: "POST",
        body: JSON.stringify({ preset_id: presetId, replace: true })
      });
    }
    setNewItem({ nameZh: "", nameEn: "", price: "0", categoryId: "", variantPresetId: "" });
    setShowItemForm(false);
    await onSaved();
  }

  return (
    <div className="menu-admin-stack">
      <OptionPresetsAdmin presets={menu.option_presets ?? []} locale={locale} onSaved={onSaved} onNotify={onNotify} />
      <div className="menu-split">
      <aside className="menu-sidebar">
          <div className="menu-sidebar-head">
            <span>{t(locale, "分类管理", "Categories")}</span>
            <button type="button" title={t(locale, "新建分类", "New category")} onClick={() => setShowCatForm((v) => !v)}>
            <Plus size={14} />
          </button>
        </div>
        {showCatForm && (
          <form className="menu-cat-form" onSubmit={saveCategory}>
            <input placeholder={t(locale, "中文名", "Chinese name")} value={categoryZh} onChange={(e) => setCategoryZh(e.target.value)} required />
            <input placeholder="English" value={categoryEn} onChange={(e) => setCategoryEn(e.target.value)} />
            <div className="menu-cat-form-actions">
              <button className="primary" type="submit">{t(locale, "保存", "Save")}</button>
              <button type="button" onClick={() => setShowCatForm(false)}>{t(locale, "取消", "Cancel")}</button>
            </div>
          </form>
        )}
        <button
          type="button"
          className={`menu-sidebar-item${selectedCatId === null ? " active" : ""}`}
          onClick={() => setSelectedCatId(null)}
        >
          <span>{t(locale, "全部", "All")}</span>
          <span className="cat-count">{menu.items.length}</span>
        </button>
        {menu.categories.map((cat) => {
          const count = menu.items.filter((item) => item.category_id === cat.id).length;
          return (
            <div
              key={cat.id}
              className={`menu-sidebar-item${selectedCatId === cat.id ? " active" : ""}${!cat.active ? " cat-inactive" : ""}`}
            >
              <button
                type="button"
                className="cat-select-btn"
                onClick={() => setSelectedCatId(cat.id)}
              >
                <span>{labelOf(cat.name_i18n, locale)}</span>
                <span className="cat-count">{count}</span>
              </button>
              <button
                type="button"
                className="cat-delete-btn"
                title={t(locale, "删除分类", "Delete category")}
                onClick={() => deleteCategory(cat, count)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
        {selectedCat && (
          <CategoryEditor key={selectedCat.id} category={selectedCat} locale={locale} onSaved={onSaved} />
        )}
        <NotePresetsAdmin presets={menu.note_presets ?? []} locale={locale} onSaved={onSaved} />
      </aside>

      <div className="menu-items-pane">
        <div className="menu-toolbar">
          <h2>
            {selectedCat ? labelOf(selectedCat.name_i18n, locale) : t(locale, "全部菜品", "All items")}
            <span className="muted"> ({filteredItems.length})</span>
          </h2>
          <button type="button" onClick={() => setShowItemForm((v) => !v)}>
            <Plus size={16} /><span>{t(locale, "新建菜品", "New item")}</span>
          </button>
        </div>
        {showItemForm && (
          <form className="form-panel menu-new-item-form" onSubmit={saveItem}>
            <div className="inline-editor">
              <label>{t(locale, "分类", "Category")}
                <select
                  value={newItem.categoryId || selectedCatId || firstCatId || ""}
                  onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value })}
                >
                  {menu.categories.map((c) => <option key={c.id} value={c.id}>{labelOf(c.name_i18n, locale)}</option>)}
                </select>
              </label>
              <label>{t(locale, "中文名", "Chinese name")}<input value={newItem.nameZh} onChange={(e) => setNewItem({ ...newItem, nameZh: e.target.value })} required /></label>
              <label>English<input value={newItem.nameEn} onChange={(e) => setNewItem({ ...newItem, nameEn: e.target.value })} /></label>
              {!newItem.variantPresetId && <label>{t(locale, "标准价格", "Base price")}<input type="number" step="0.01" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} /></label>}
              <label>{t(locale, "规格预设", "Option preset")}<select value={newItem.variantPresetId} onChange={(e) => setNewItem({ ...newItem, variantPresetId: e.target.value })}>
                <option value="">{t(locale, "不使用", "None")}</option>
                {(menu.option_presets ?? []).filter((preset) => preset.kind === "variants" && preset.active !== false).map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}
              </select></label>
              <button className="primary" type="submit"><Plus size={16} /><span>{t(locale, "保存", "Save")}</span></button>
              <button type="button" onClick={() => setShowItemForm(false)}>{t(locale, "取消", "Cancel")}</button>
            </div>
          </form>
        )}
        <div className="menu-item-list">
          {filteredItems.map((item) => (
            <MenuItemRow
              key={item.id}
              item={item}
              categories={menu.categories}
              optionPresets={menu.option_presets ?? []}
              locale={locale}
              currency={currency}
              expanded={expandedItemId === item.id}
              onToggle={() => setExpandedItemId((id) => id === item.id ? null : item.id)}
              onSaved={onSaved}
              onNotify={onNotify}
            />
          ))}
          {!filteredItems.length && <div className="empty">{t(locale, "暂无菜品", "No items")}</div>}
        </div>
      </div>
      </div>
    </div>
  );
}

function MenuItemRow({ item, categories, optionPresets, locale, currency, expanded, onToggle, onSaved, onNotify }) {
  const activeVariants = item.variants.filter((v) => v.active !== false);
  const priceSource = activeVariants.length ? activeVariants : item.variants;
  const prices = priceSource.map((v) => Number(v.price));
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 0;
  const priceLabel = !prices.length ? "-" : priceMin === priceMax
    ? money(priceMin, currency, locale)
    : `${money(priceMin, currency, locale)} – ${money(priceMax, currency, locale)}`;

  const [itemAction, setItemAction] = useState("");

  async function toggleItem() {
    setItemAction("toggle");
    try {
      await api(`/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) });
      await onSaved();
      onNotify(item.active ? t(locale, "产品已停用", "Item disabled") : t(locale, "产品已启用", "Item enabled"));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setItemAction("");
    }
  }

  async function destroyItem() {
    if (!window.confirm(t(locale, `永久删除"${labelOf(item.name_i18n, locale)}"？此操作无法恢复，历史订单记录将保留但不再关联该菜品。`, `Delete "${labelOf(item.name_i18n, locale)}" permanently? This cannot be undone. Historical orders will remain, but the item will no longer be linked.`))) return;
    setItemAction("destroy");
    try {
      await api(`/menu/items/${item.id}/destroy`, { method: "DELETE" });
      await onSaved();
      onNotify(t(locale, "产品已永久删除", "Item deleted permanently"));
    } catch (err) {
      onNotify(err.message);
    } finally {
      setItemAction("");
    }
  }

  async function copyItem() {
    setItemAction("copy");
    try {
      await api(`/menu/items/${item.id}/copy`, { method: "POST" });
      await onSaved();
      onNotify(t(locale, "菜品已复制", "Item duplicated"));
    } catch (err) {
      onNotify(err.message);
    } finally {
      setItemAction("");
    }
  }

  return (
    <div className={`menu-item-row${expanded ? " expanded" : ""}${!item.active ? " inactive" : ""}`}>
      <div className="menu-item-row-head" onClick={onToggle}>
        <ChevronRight size={15} className={`expand-icon${expanded ? " rotated" : ""}`} />
        <span className="item-name">{labelOf(item.name_i18n, locale)}</span>
        <span className={`item-badge${item.active ? " badge-active" : " badge-inactive"}`}>
          {item.active ? t(locale, "上架", "Active") : t(locale, "下架", "Inactive")}
        </span>
        <span className="item-price muted">{priceLabel}</span>
        <span className="muted item-spec-count">{item.variants.length} {t(locale, "规格", "options")}</span>
      </div>
      {expanded && (
        <div className="menu-item-row-body">
          <MenuItemEditor
            item={item}
            categories={categories}
            optionPresets={optionPresets}
            locale={locale}
            currency={currency}
            onSaved={onSaved}
            onNotify={onNotify}
            onToggleActive={toggleItem}
            onDestroy={destroyItem}
            onCopy={copyItem}
            itemAction={itemAction}
          />
        </div>
      )}
    </div>
  );
}

function OptionPresetsAdmin({ presets, locale, onSaved, onNotify }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("variants");
  const [expandedId, setExpandedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createPreset(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const preset = await api("/menu/option-presets", {
        method: "POST",
        body: JSON.stringify({ name, kind, payload: [] })
      });
      setName("");
      setShowCreate(false);
      setExpandedId(preset.id);
      await onSaved();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="option-presets-panel">
      <div className="option-presets-head">
        <div>
          <h2>{t(locale, "规格与加料预设库", "Options & extras presets")}</h2>
          <p>{t(locale, "产品绑定预设后会自动同步；直接修改产品配置时，该类型的绑定会自动断开。", "Linked products sync automatically. Editing an item directly will detach that preset type.")}</p>
        </div>
        <button type="button" onClick={() => setShowCreate((value) => !value)}><Plus size={15} /><span>{t(locale, "新建预设", "New preset")}</span></button>
      </div>
      {showCreate && (
        <form className="option-preset-create" onSubmit={createPreset}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t(locale, "预设名称，例如：面条大小规格", "Preset name, e.g. noodle size options")} required />
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="variants">{t(locale, "产品规格", "Item options")}</option>
            <option value="modifiers">{t(locale, "加料小项", "Extras")}</option>
          </select>
          <button className="primary" type="submit" disabled={busy}>{t(locale, "创建", "Create")}</button>
          <button type="button" onClick={() => setShowCreate(false)}>{t(locale, "取消", "Cancel")}</button>
        </form>
      )}
      {error && <div className="inline-error">{error}</div>}
      <div className="option-preset-list">
        {presets.map((preset) => (
          <OptionPresetCard
            key={preset.id}
            preset={preset}
            expanded={expandedId === preset.id}
            onToggle={() => setExpandedId((id) => id === preset.id ? null : preset.id)}
            onSaved={onSaved}
            onNotify={onNotify}
            locale={locale}
          />
        ))}
        {!presets.length && <div className="empty">{t(locale, "暂无规格或加料预设", "No option or extra presets")}</div>}
      </div>
    </section>
  );
}

function OptionPresetCard({ preset, expanded, onToggle, onSaved, onNotify, locale }) {
  const [name, setName] = useState(preset.name);
  const [payload, setPayload] = useState(() => structuredClone(preset.payload || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(preset.name);
    setPayload(structuredClone(preset.payload || []));
  }, [preset]);

  function updateRow(index, patch) {
    setPayload((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await api(`/menu/option-presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, payload })
      });
      await onSaved();
      onNotify(result.synced_items ? t(locale, `预设已保存，并同步到 ${result.synced_items} 个产品`, `Preset saved and synced to ${result.synced_items} items`) : t(locale, "预设已保存", "Preset saved"));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t(locale, `删除预设“${preset.name}”？绑定产品会保留当前配置，但不再继续同步。`, `Delete preset "${preset.name}"? Bound items will keep the current configuration but stop syncing.`))) return;
    await api(`/menu/option-presets/${preset.id}`, { method: "DELETE" });
    await onSaved();
    onNotify(t(locale, "预设已删除，相关产品已转为独立配置", "Preset deleted; linked items are now standalone"));
  }

  function addVariant() {
    setPayload((current) => [...current, {
      name_i18n: { "zh-CN": "新规格", "en-GB": "New option" },
      price: 0,
      sort_order: current.length,
      active: true
    }]);
  }

  function addGroup() {
    setPayload((current) => [...current, {
      name_i18n: { "zh-CN": "加料", "en-GB": "Extras" },
      min_select: 0,
      max_select: 5,
      sort_order: current.length,
      active: true,
      modifiers: []
    }]);
  }

  function addModifier(groupIndex) {
    setPayload((current) => current.map((group, index) => index === groupIndex ? {
      ...group,
      modifiers: [...(group.modifiers || []), {
        name_i18n: { "zh-CN": "新选项", "en-GB": "New extra" },
        price_delta: 0,
        sort_order: (group.modifiers || []).length,
        active: true,
        default_selected: false
      }]
    } : group));
  }

  function updateModifier(groupIndex, modifierIndex, patch) {
    setPayload((current) => current.map((group, index) => index === groupIndex ? {
      ...group,
      modifiers: group.modifiers.map((modifier, childIndex) => childIndex === modifierIndex ? { ...modifier, ...patch } : modifier)
    } : group));
  }

  function moveRow(index, direction) {
    setPayload((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((row, sortOrder) => ({ ...row, sort_order: sortOrder }));
    });
  }

  function moveModifier(groupIndex, modifierIndex, direction) {
    setPayload((current) => current.map((group, index) => {
      if (index !== groupIndex) return group;
      const modifiers = [...(group.modifiers || [])];
      const target = modifierIndex + direction;
      if (target < 0 || target >= modifiers.length) return group;
      [modifiers[modifierIndex], modifiers[target]] = [modifiers[target], modifiers[modifierIndex]];
      return { ...group, modifiers: modifiers.map((modifier, sortOrder) => ({ ...modifier, sort_order: sortOrder })) };
    }));
  }

  return (
    <article className={`option-preset-card${expanded ? " expanded" : ""}`}>
      <button type="button" className="option-preset-summary" onClick={onToggle}>
        <ChevronRight size={15} className={expanded ? "rotated" : ""} />
        <strong>{preset.name}</strong>
        <span>{preset.kind === "variants" ? t(locale, "产品规格", "Item options") : t(locale, "加料小项", "Extras")}</span>
        <em>{(preset.payload || []).length} {t(locale, "项", "items")}</em>
      </button>
      {expanded && (
        <div className="option-preset-body">
          <label>{t(locale, "预设名称", "Preset name")}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          {preset.kind === "variants" ? (
            <div className="option-preset-rows">
              {payload.map((variant, index) => (
                <div className="option-preset-row" key={index}>
                  <div className="option-row-order">
                    <button type="button" title={t(locale, "上移", "Move up")} disabled={index === 0} onClick={() => moveRow(index, -1)}><ChevronUp size={13} /></button>
                    <button type="button" title={t(locale, "下移", "Move down")} disabled={index === payload.length - 1} onClick={() => moveRow(index, 1)}><ChevronDown size={13} /></button>
                  </div>
                  <input value={labelOf(variant.name_i18n, "zh-CN")} onChange={(event) => updateRow(index, { name_i18n: { ...variant.name_i18n, "zh-CN": event.target.value } })} placeholder={t(locale, "中文规格", "Chinese option")} />
                  <input value={labelOf(variant.name_i18n, "en-GB")} onChange={(event) => updateRow(index, { name_i18n: { ...variant.name_i18n, "en-GB": event.target.value } })} placeholder="English" />
                  <input type="number" step="0.01" value={variant.price} onChange={(event) => updateRow(index, { price: Number(event.target.value) })} placeholder={t(locale, "价格", "Price")} />
                  <button type="button" onClick={() => setPayload((current) => current.filter((_row, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" className="option-preset-add" onClick={addVariant}><Plus size={14} />{t(locale, "添加规格", "Add option")}</button>
            </div>
          ) : (
            <div className="option-preset-rows">
              {payload.map((group, groupIndex) => (
                <div className="option-preset-group" key={groupIndex}>
                  <div className="option-preset-row group-row">
                    <div className="option-row-order">
                      <button type="button" title={t(locale, "上移", "Move up")} disabled={groupIndex === 0} onClick={() => moveRow(groupIndex, -1)}><ChevronUp size={13} /></button>
                      <button type="button" title={t(locale, "下移", "Move down")} disabled={groupIndex === payload.length - 1} onClick={() => moveRow(groupIndex, 1)}><ChevronDown size={13} /></button>
                    </div>
                    <input value={labelOf(group.name_i18n, "zh-CN")} onChange={(event) => updateRow(groupIndex, { name_i18n: { ...group.name_i18n, "zh-CN": event.target.value } })} placeholder={t(locale, "加料组", "Modifier group")} />
                    <input value={labelOf(group.name_i18n, "en-GB")} onChange={(event) => updateRow(groupIndex, { name_i18n: { ...group.name_i18n, "en-GB": event.target.value } })} placeholder="English" />
                    <label>{t(locale, "最少", "Min")}<input type="number" min="0" value={group.min_select} onChange={(event) => updateRow(groupIndex, { min_select: Number(event.target.value) })} /></label>
                    <label>{t(locale, "最多", "Max")}<input type="number" min="1" value={group.max_select} onChange={(event) => updateRow(groupIndex, { max_select: Number(event.target.value) })} /></label>
                    <label className="preset-required-toggle"><input type="checkbox" checked={Number(group.min_select) > 0} onChange={(event) => updateRow(groupIndex, { min_select: event.target.checked ? Math.max(1, Number(group.min_select || 0)) : 0 })} />{t(locale, "必选", "Required")}</label>
                    <button type="button" onClick={() => setPayload((current) => current.filter((_row, index) => index !== groupIndex))}><Trash2 size={14} /></button>
                  </div>
                  {(group.modifiers || []).map((modifier, modifierIndex) => (
                    <div className="option-preset-row child-row" key={modifierIndex}>
                      <div className="option-row-order">
                        <button type="button" title={t(locale, "上移", "Move up")} disabled={modifierIndex === 0} onClick={() => moveModifier(groupIndex, modifierIndex, -1)}><ChevronUp size={13} /></button>
                        <button type="button" title={t(locale, "下移", "Move down")} disabled={modifierIndex === group.modifiers.length - 1} onClick={() => moveModifier(groupIndex, modifierIndex, 1)}><ChevronDown size={13} /></button>
                      </div>
                      <input value={labelOf(modifier.name_i18n, "zh-CN")} onChange={(event) => updateModifier(groupIndex, modifierIndex, { name_i18n: { ...modifier.name_i18n, "zh-CN": event.target.value } })} placeholder={t(locale, "小料名称", "Modifier name")} />
                      <input value={labelOf(modifier.name_i18n, "en-GB")} onChange={(event) => updateModifier(groupIndex, modifierIndex, { name_i18n: { ...modifier.name_i18n, "en-GB": event.target.value } })} placeholder="English" />
                      <input type="number" step="0.01" value={modifier.price_delta} onChange={(event) => updateModifier(groupIndex, modifierIndex, { price_delta: Number(event.target.value) })} placeholder={t(locale, "加价", "Price delta")} />
                      <label className="preset-default-toggle"><input type="checkbox" checked={modifier.default_selected === true} onChange={(event) => {
                        const checked = event.target.checked;
                        if (checked && Number(group.max_select) === 1) {
                          updateRow(groupIndex, { modifiers: group.modifiers.map((entry, index) => ({ ...entry, default_selected: index === modifierIndex })) });
                        } else {
                          updateModifier(groupIndex, modifierIndex, { default_selected: checked });
                        }
                      }} />{t(locale, "默认", "Default")}</label>
                      <button type="button" onClick={() => updateRow(groupIndex, { modifiers: group.modifiers.filter((_modifier, index) => index !== modifierIndex) })}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button type="button" className="option-preset-add child-add" onClick={() => addModifier(groupIndex)}><Plus size={14} />{t(locale, "添加小料", "Add modifier")}</button>
                </div>
              ))}
              {!payload.length && <button type="button" className="option-preset-add" onClick={addGroup}><Plus size={14} />{t(locale, "添加加料组模板", "Add modifier group template")}</button>}
            </div>
          )}
          {error && <div className="inline-error">{error}</div>}
          <div className="option-preset-actions">
            <button className="primary" type="button" onClick={save} disabled={busy}><Save size={14} />{t(locale, "保存预设", "Save preset")}</button>
            <button className="danger" type="button" onClick={remove}><Trash2 size={14} />{t(locale, "删除预设", "Delete preset")}</button>
          </div>
        </div>
      )}
    </article>
  );
}

function CategoryEditor({ category, locale, onSaved }) {
  const [draft, setDraft] = useState({
    zh: labelOf(category.name_i18n, "zh-CN"),
    en: labelOf(category.name_i18n, "en-GB"),
    sort_order: category.sort_order ?? 0,
    active: category.active
  });

  const save = useCallback(async (overrides = {}, refresh = true) => {
    const data = { ...draft, ...overrides };
    setDraft(data);
    await api(`/menu/categories/${category.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": data.zh, "en-GB": data.en || data.zh },
        sort_order: Number(data.sort_order),
        active: data.active
      })
    });
    if (refresh) await onSaved();
  }, [draft, category.id, onSaved]);

  return (
    <div className="cat-editor-panel">
      <p className="muted cat-editor-title">{t(locale, "编辑分类", "Edit category")}</p>
      <label>{t(locale, "中文", "Chinese")}<input value={draft.zh} onChange={(e) => setDraft({ ...draft, zh: e.target.value })} onBlur={() => save({ zh: draft.zh })} /></label>
      <label>English<input value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} onBlur={() => save({ en: draft.en })} /></label>
      <label>{t(locale, "排序", "Sort")}<input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} onBlur={() => save({ sort_order: draft.sort_order })} /></label>
      <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(e) => { const v = e.target.checked; setDraft({ ...draft, active: v }); save({ active: v }); }} />{t(locale, "启用", "Enabled")}</label>
    </div>
  );
}

function NotePresetsAdmin({ presets, locale, onSaved }) {
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function addPreset(event) {
    event.preventDefault();
    const value = label.trim();
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      await api("/note-presets", {
        method: "POST",
        body: JSON.stringify({ label: value, sort_order: presets.length + 1 })
      });
      setLabel("");
      setShowForm(false);
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function movePreset(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= presets.length) return;
    const next = presets.map((preset) => ({ ...preset }));
    const [picked] = next.splice(index, 1);
    next.splice(targetIndex, 0, picked);
    setBusy(true);
    try {
      await Promise.all(next.map((preset, orderIndex) => api(`/note-presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sort_order: orderIndex + 1 })
      })));
      await onSaved();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePreset(preset) {
    try {
      await api(`/note-presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !preset.active })
      });
      await onSaved();
    } catch (err) {
      alert(err.message);
    }
  }

  async function destroyPreset(preset) {
    if (!window.confirm(t(locale, `删除备注词条"${preset.label}"？`, `Delete note preset "${preset.label}"?`))) return;
    try {
      await api(`/note-presets/${preset.id}`, { method: "DELETE" });
      await onSaved();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="cat-editor-panel" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p className="muted cat-editor-title" style={{ margin: 0 }}>{t(locale, "备注词条管理", "Note presets")}</p>
        <button type="button" title={t(locale, "新建词条", "New note")} onClick={() => setShowForm((v) => !v)}>
          <Plus size={14} />
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        {t(locale, "点菜时可一键加到菜品备注，仅在厨房打印单上显示。", "Add to item notes with one click; shown only on kitchen tickets.")}
      </p>
      {showForm && (
        <form onSubmit={addPreset} style={{ display: "grid", gap: 6, marginBottom: 8 }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t(locale, "例如：白人辣、去葱", "For example: mild, no scallions")}
            autoFocus
            required
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button className="primary" type="submit" disabled={busy}>{t(locale, "保存", "Save")}</button>
            <button type="button" onClick={() => { setShowForm(false); setLabel(""); setError(""); }}>{t(locale, "取消", "Cancel")}</button>
          </div>
          {error && <div className="inline-error">{error}</div>}
        </form>
      )}
      {!presets.length && <div className="empty" style={{ padding: "8px 0" }}>{t(locale, "暂无词条", "No notes")}</div>}
      {presets.map((preset, index) => (
        <div
          key={preset.id}
          className={`menu-sidebar-item${!preset.active ? " cat-inactive" : ""}`}
          style={{ paddingRight: 6 }}
        >
          <div className="cat-order-controls">
            <button type="button" title={t(locale, "上移", "Move up")} disabled={busy || index === 0} onClick={() => movePreset(index, -1)}>
              <ChevronUp size={13} />
            </button>
            <button type="button" title={t(locale, "下移", "Move down")} disabled={busy || index === presets.length - 1} onClick={() => movePreset(index, 1)}>
              <ChevronDown size={13} />
            </button>
          </div>
          <button
            type="button"
            className="cat-select-btn"
            title={preset.active ? t(locale, "点击停用", "Click to disable") : t(locale, "点击启用", "Click to enable")}
            onClick={() => togglePreset(preset)}
          >
            <span>{preset.label}</span>
            <span className="cat-count">{preset.active ? t(locale, "启用", "Enabled") : t(locale, "停用", "Disabled")}</span>
          </button>
          <button
            type="button"
            className="cat-delete-btn"
            title={t(locale, "删除词条", "Delete note")}
            onClick={() => destroyPreset(preset)}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function PresetControls({ item, kind, presets, currentPresetId, locale, onSaved, onNotify }) {
  const available = presets.filter((preset) => preset.kind === kind && preset.active !== false);
  const [presetId, setPresetId] = useState(currentPresetId || "");
  const [busy, setBusy] = useState(false);
  const boundPreset = available.find((preset) => preset.id === currentPresetId);

  useEffect(() => {
    setPresetId(currentPresetId || "");
  }, [currentPresetId, presets]);

  async function applyPreset() {
    if (!presetId) return;
    const preset = available.find((entry) => entry.id === presetId);
    if (!window.confirm(t(locale, `绑定“${preset?.name || "该预设"}”并替换当前${kind === "variants" ? "规格" : "加料小项"}？以后修改该预设时，此产品会自动同步。`, `Bind "${preset?.name || "this preset"}" and replace the current ${kind === "variants" ? "options" : "extras"}? Future preset edits will sync to this item.`))) return;
    setBusy(true);
    try {
      await api(`/menu/items/${item.id}/apply-option-preset`, {
        method: "POST",
        body: JSON.stringify({ preset_id: presetId, replace: true })
      });
      await onSaved();
      onNotify(t(locale, `已绑定预设“${preset?.name}”`, `Bound preset "${preset?.name}"`));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAsPreset() {
    const name = window.prompt(t(locale, `为当前${kind === "variants" ? "产品规格" : "加料小项"}输入新预设名称：`, `Enter a new preset name for the current ${kind === "variants" ? "item options" : "extras"}:`));
    if (!name?.trim()) return;
    setBusy(true);
    try {
      await api(`/menu/items/${item.id}/option-presets`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), kind })
      });
      await onSaved();
      onNotify(t(locale, `已保存并绑定新预设“${name.trim()}”`, `Saved and bound new preset "${name.trim()}"`));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="item-preset-controls">
      <span className="preset-control-label">{t(locale, "预设", "Preset")}</span>
      <select value={presetId} onChange={(event) => setPresetId(event.target.value)} disabled={busy || !available.length}>
        <option value="">{available.length ? t(locale, "选择要绑定的预设", "Select a preset to bind") : t(locale, "暂无预设", "No presets")}</option>
        {available.map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}
      </select>
      <button type="button" onClick={applyPreset} disabled={busy || !presetId}>{t(locale, "绑定预设", "Bind preset")}</button>
      <button type="button" onClick={saveAsPreset} disabled={busy}>{t(locale, "保存当前为预设", "Save current as preset")}</button>
      <span className={`preset-binding-status${boundPreset ? " bound" : " detached"}`}>
        {boundPreset ? t(locale, `已绑定：${boundPreset.name}`, `Bound: ${boundPreset.name}`) : t(locale, "独立配置", "Standalone configuration")}
      </span>
    </div>
  );
}

function ModifierGroupPresetControls({ group, presets, locale, onSaved, onNotify }) {
  const available = presets.filter((preset) => preset.kind === "modifiers" && preset.active !== false && (preset.payload || []).length === 1);
  const [presetId, setPresetId] = useState(group.preset_id || "");
  const [busy, setBusy] = useState(false);
  const boundPreset = available.find((preset) => preset.id === group.preset_id);

  useEffect(() => setPresetId(group.preset_id || ""), [group.preset_id, presets]);

  async function applyPreset() {
    if (!presetId) return;
    const preset = available.find((entry) => entry.id === presetId);
    if (!window.confirm(t(locale, `将加料组“${labelOf(group.name_i18n, "zh-CN")}”绑定到“${preset?.name}”？当前组设置和选项会被替换。`, `Bind modifier group "${labelOf(group.name_i18n, locale)}" to "${preset?.name}"? The current group settings and options will be replaced.`))) return;
    setBusy(true);
    try {
      await api(`/menu/modifier-groups/${group.id}/apply-option-preset`, {
        method: "POST",
        body: JSON.stringify({ preset_id: presetId })
      });
      await onSaved();
      onNotify(t(locale, `加料组已绑定预设“${preset?.name}”`, `Modifier group bound to preset "${preset?.name}"`));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAsPreset() {
    const name = window.prompt(t(locale, "为当前加料组输入新预设名称：", "Enter a new preset name for the current modifier group:"));
    if (!name?.trim()) return;
    setBusy(true);
    try {
      await api(`/menu/modifier-groups/${group.id}/option-presets`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim() })
      });
      await onSaved();
      onNotify(t(locale, `已保存并绑定新预设“${name.trim()}”`, `Saved and bound new preset "${name.trim()}"`));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="item-preset-controls modifier-group-preset-controls">
      <span className="preset-control-label">{t(locale, "组预设", "Group preset")}</span>
      <select value={presetId} onChange={(event) => setPresetId(event.target.value)} disabled={busy || !available.length}>
        <option value="">{available.length ? t(locale, "选择预设", "Select a preset") : t(locale, "暂无组预设", "No group presets")}</option>
        {available.map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}
      </select>
      <button type="button" onClick={applyPreset} disabled={busy || !presetId}>{t(locale, "绑定", "Bind")}</button>
      <button type="button" onClick={saveAsPreset} disabled={busy}>{t(locale, "保存为预设", "Save as preset")}</button>
      <span className={`preset-binding-status${boundPreset ? " bound" : " detached"}`}>
        {boundPreset ? t(locale, `已绑定：${boundPreset.name}`, `Bound: ${boundPreset.name}`) : t(locale, "独立配置", "Standalone configuration")}
      </span>
    </div>
  );
}

function MenuItemEditor({ item, categories, optionPresets, locale, currency, onSaved, onNotify, onToggleActive, onDestroy, onCopy, itemAction }) {
  const [draft, setDraft] = useState({
    zh: labelOf(item.name_i18n, "zh-CN"),
    en: labelOf(item.name_i18n, "en-GB"),
    category_id: item.category_id,
    kitchen_group: item.kitchen_group,
    sort_order: item.sort_order ?? 0,
    active: item.active
  });
  const [variantDraft, setVariantDraft] = useState({ zh: "", en: "", price: "0" });
  const [groupDraft, setGroupDraft] = useState({ zh: t(locale, "加料", "Extras"), en: "Extras", min: 0, max: 1 });

  const saveItem = useCallback(async (overrides = {}) => {
    const data = { ...draft, ...overrides };
    setDraft(data);
    await api(`/menu/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        category_id: data.category_id,
        name_i18n: { "zh-CN": data.zh, "en-GB": data.en || data.zh },
        kitchen_group: data.kitchen_group,
        sort_order: Number(data.sort_order),
        active: data.active
      })
    });
    await onSaved();
  }, [draft, item.id, onSaved]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const autoSave = useCallback((field, value) => saveItem({ [field]: value }), [saveItem]);

  async function addVariant(event) {
    event.preventDefault();
    await api(`/menu/items/${item.id}/variants`, {
      method: "POST",
      body: JSON.stringify({
        name_i18n: { "zh-CN": variantDraft.zh, "en-GB": variantDraft.en || variantDraft.zh },
        price: Number(variantDraft.price),
        sort_order: item.variants.length
      })
    });
    setVariantDraft({ zh: "", en: "", price: "0" });
    await onSaved();
    onNotify(item.variant_preset_id ? "规格已添加，已断开规格预设绑定" : "规格已添加");
  }

  async function addGroup(event) {
    event.preventDefault();
    await api("/menu/modifier-groups", {
      method: "POST",
      body: JSON.stringify({
        item_id: item.id,
        name_i18n: { "zh-CN": groupDraft.zh, "en-GB": groupDraft.en || groupDraft.zh },
        min_select: Number(groupDraft.min),
        max_select: Number(groupDraft.max),
        sort_order: item.modifier_groups.length
      })
    });
    setGroupDraft({ zh: "加料", en: "Extras", min: 0, max: 1 });
    await onSaved();
    onNotify(item.modifier_preset_id ? "加料组已添加，已断开加料预设绑定" : "加料组已添加");
  }

  async function moveVariant(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= item.variants.length) return;
    const current = item.variants[index];
    const target = item.variants[targetIndex];
    await Promise.all([
      api(`/menu/items/${item.id}/variants/${current.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: targetIndex }) }),
      api(`/menu/items/${item.id}/variants/${target.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: index }) })
    ]);
    await onSaved();
    onNotify(item.variant_preset_id ? "规格顺序已更新，已断开规格预设绑定" : "规格顺序已更新");
  }

  return (
    <div className={`menu-editor${item.active ? "" : " inactive"}`}>
      <div className="inline-editor item-main-editor">
        <label>{t(locale, "中文", "Chinese")}<input value={draft.zh} onChange={(e) => setDraft({ ...draft, zh: e.target.value })} onBlur={() => autoSave("zh", draft.zh)} /></label>
        <label>English<input value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} onBlur={() => autoSave("en", draft.en)} /></label>
        <label>{t(locale, "分类", "Category")}<select value={draft.category_id || ""} onChange={(e) => { const v = e.target.value; setDraft({ ...draft, category_id: v }); saveItem({ category_id: v }); }}>
          {categories.map((category) => <option key={category.id} value={category.id}>{labelOf(category.name_i18n, locale)}</option>)}
        </select></label>
        <label>{t(locale, "厨房分组", "Kitchen group")}<input value={draft.kitchen_group} onChange={(e) => setDraft({ ...draft, kitchen_group: e.target.value })} onBlur={() => autoSave("kitchen_group", draft.kitchen_group)} /></label>
        <label>{t(locale, "排序", "Sort")}<input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} onBlur={() => autoSave("sort_order", draft.sort_order)} /></label>
        <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(e) => { const v = e.target.checked; setDraft({ ...draft, active: v }); saveItem({ active: v }); }} />{t(locale, "上架", "Active")}</label>
        <button className="action-toggle" type="button" onClick={onToggleActive} disabled={Boolean(itemAction)}>
          <Power size={16} /><span>{itemAction === "toggle" ? t(locale, "处理中…", "Working…") : item.active ? t(locale, "停用产品", "Disable item") : t(locale, "启用产品", "Enable item")}</span>
        </button>
        {onCopy && (
          <button type="button" className="action-copy" onClick={onCopy} disabled={Boolean(itemAction)}>
            <Copy size={16} /><span>{itemAction === "copy" ? t(locale, "复制中…", "Duplicating…") : t(locale, "复制菜品", "Duplicate item")}</span>
          </button>
        )}
        {!item.active && onDestroy && (
          <button type="button" className="action-delete" onClick={onDestroy} disabled={Boolean(itemAction)}><Trash2 size={16} /><span>{itemAction === "destroy" ? t(locale, "删除中…", "Deleting…") : t(locale, "永久删除", "Delete permanently")}</span></button>
        )}
      </div>

      <div className="editor-subsection variants-editor-section">
        <div className="editor-subsection-title">
          <div className="editor-subsection-heading-copy">
            <span className="editor-section-step">1</span>
            <div>
              <h3>产品规格 <span className="editor-section-count">{item.variants.length} 项</span></h3>
              <p>设置不同份量或尺寸，以及每个规格的销售价格</p>
            </div>
          </div>
          <div className="section-preset-bar">
            <PresetControls item={item} kind="variants" presets={optionPresets} currentPresetId={item.variant_preset_id} locale={locale} onSaved={onSaved} onNotify={onNotify} />
          </div>
        </div>
        <div className="item-sub-list">
          {!item.variants.length && <div className="editor-empty-state">{t(locale, "还没有规格，请在下方添加，或直接应用一个规格预设。", "No options yet. Add one below or apply an option preset.")}</div>}
          {item.variants.map((variant, index) => (
            <VariantEditor key={variant.id} index={index} item={item} variant={variant} locale={locale} currency={currency} onSaved={onSaved} onNotify={onNotify} wasPresetBound={Boolean(item.variant_preset_id)} onMove={moveVariant} total={item.variants.length} />
          ))}
        </div>
        <form className="item-sub-add" onSubmit={addVariant}>
          <span className="sub-add-label">{t(locale, "新规格", "New option")}</span>
          <input className="sub-field" placeholder={t(locale, "规格名", "Option name")} value={variantDraft.zh} onChange={(event) => setVariantDraft({ ...variantDraft, zh: event.target.value })} required />
          <input className="sub-field" placeholder="English" value={variantDraft.en} onChange={(event) => setVariantDraft({ ...variantDraft, en: event.target.value })} />
          <input className="sub-field sub-field-price" type="number" step="0.01" placeholder={t(locale, "价格", "Price")} value={variantDraft.price} onChange={(event) => setVariantDraft({ ...variantDraft, price: event.target.value })} />
          <button type="submit"><Plus size={14} /><span>{t(locale, "添加规格", "Add option")}</span></button>
        </form>
      </div>

      <div className="editor-subsection modifiers-editor-section">
        <div className="editor-subsection-title">
          <div className="editor-subsection-heading-copy">
            <span className="editor-section-step">2</span>
            <div>
              <h3>{t(locale, "加料与小项", "Extras & modifiers")} <span className="editor-section-count">{item.modifier_groups.length} {t(locale, "组", "groups")}</span></h3>
              <p>{t(locale, "先建立分组，再在组内配置顾客可以选择的加料选项", "Create groups first, then configure the add-ons customers can choose")}</p>
            </div>
          </div>
        </div>
        <div className="modifier-groups-list">
        {!item.modifier_groups.length && <div className="editor-empty-state">{t(locale, "还没有加料组，请先创建分组，再向组内添加选项。", "No modifier groups yet. Create a group first, then add options.")}</div>}
        {item.modifier_groups.map((group, index) => (
          <ModifierGroupEditor key={group.id} index={index} group={group} presets={optionPresets} locale={locale} currency={currency} onSaved={onSaved} onNotify={onNotify} wasPresetBound={Boolean(group.preset_id || item.modifier_preset_id)} />
        ))}
        </div>
        <form className="item-sub-add" onSubmit={addGroup}>
          <span className="sub-add-label">{t(locale, "新加料组", "New modifier group")}</span>
          <input className="sub-field" placeholder={t(locale, "组名", "Group name")} value={groupDraft.zh} onChange={(event) => setGroupDraft({ ...groupDraft, zh: event.target.value })} />
          <input className="sub-field" placeholder="English" value={groupDraft.en} onChange={(event) => setGroupDraft({ ...groupDraft, en: event.target.value })} />
          <label className="sub-num-label">{t(locale, "最少", "Min")}<input className="sub-field sub-field-num" type="number" min="0" value={groupDraft.min} onChange={(event) => setGroupDraft({ ...groupDraft, min: event.target.value })} /></label>
          <label className="sub-num-label">{t(locale, "最多", "Max")}<input className="sub-field sub-field-num" type="number" min="1" value={groupDraft.max} onChange={(event) => setGroupDraft({ ...groupDraft, max: event.target.value })} /></label>
          <label className="checkbox group-required-toggle"><input type="checkbox" checked={Number(groupDraft.min) > 0} onChange={(event) => setGroupDraft({ ...groupDraft, min: event.target.checked ? Math.max(1, Number(groupDraft.min || 0)) : 0 })} />{t(locale, "必选组", "Required")}</label>
          <button type="submit"><Plus size={14} /><span>{t(locale, "添加小项组", "Add modifier group")}</span></button>
        </form>
      </div>
    </div>
  );
}

function VariantEditor({ item, variant, index, locale, currency, onSaved, onNotify, wasPresetBound, onMove, total }) {
  const [draft, setDraft] = useState({
    zh: labelOf(variant.name_i18n, "zh-CN"),
    en: labelOf(variant.name_i18n, "en-GB"),
    price: variant.price,
    sort_order: variant.sort_order ?? 0,
    active: variant.active
  });
  const [action, setAction] = useState("");

  const save = useCallback(async (overrides = {}, refresh = true) => {
    const data = { ...draft, ...overrides };
    setDraft(data);
    await api(`/menu/items/${item.id}/variants/${variant.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": data.zh, "en-GB": data.en || data.zh },
        price: Number(data.price),
        sort_order: Number(data.sort_order),
        active: data.active
      })
    });
    if (refresh) await onSaved();
  }, [draft, item.id, variant.id, onSaved]);

  async function runVariantAction(kind, operation, successText) {
    setAction(kind);
    try {
      await operation();
      await onSaved();
      onNotify(`${successText}${wasPresetBound ? "，已断开规格预设绑定" : ""}`);
    } catch (error) {
      onNotify(error.message);
    } finally {
      setAction("");
    }
  }

  function destroyVariant() {
    if (!window.confirm(`永久删除规格“${draft.zh}”？历史订单中的规格名称和价格仍会保留。`)) return;
    runVariantAction("destroy", () => api(`/menu/items/${item.id}/variants/${variant.id}/destroy`, { method: "DELETE" }), "规格已永久删除");
  }

  return (
    <div className="item-sub-row">
      <span className="sub-row-index">{index + 1}</span>
      <div className="sub-row-order">
        <button type="button" title="上移" disabled={index === 0 || Boolean(action)} onClick={() => onMove(index, -1)}><ChevronUp size={13} /></button>
        <button type="button" title="下移" disabled={index === total - 1 || Boolean(action)} onClick={() => onMove(index, 1)}><ChevronDown size={13} /></button>
      </div>
      <input className="sub-field sub-field-name" placeholder="名称" value={draft.zh} onChange={(e) => setDraft({ ...draft, zh: e.target.value })} onBlur={() => save({ zh: draft.zh })} />
      <input className="sub-field sub-field-name" placeholder="English" value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} onBlur={() => save({ en: draft.en })} />
      <input className="sub-field sub-field-price" type="number" step="0.01" placeholder="价格" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} onBlur={() => save({ price: draft.price })} />
      <span className="sub-price-display muted">{money(draft.price, currency, locale)}</span>
      <button className="action-save" type="button" disabled={Boolean(action)} onClick={() => runVariantAction("save", () => save({}, false), t(locale, "规格已保存", "Option saved"))}><Save size={14} /><span>{action === "save" ? t(locale, "保存中…", "Saving…") : t(locale, "保存", "Save")}</span></button>
      <button className="action-toggle" type="button" disabled={Boolean(action)} onClick={() => runVariantAction("toggle", () => save({ active: !draft.active }, false), draft.active ? t(locale, "规格已停用", "Option disabled") : t(locale, "规格已启用", "Option enabled"))}><Power size={14} /><span>{action === "toggle" ? t(locale, "处理中…", "Working…") : draft.active ? t(locale, "停用", "Disable") : t(locale, "启用", "Enable")}</span></button>
      <button className="action-delete" type="button" disabled={Boolean(action)} onClick={destroyVariant}><Trash2 size={14} /><span>{action === "destroy" ? t(locale, "删除中…", "Deleting…") : t(locale, "删除", "Delete")}</span></button>
    </div>
  );
}

function ModifierGroupEditor({ group, index, presets, locale, currency, onSaved, onNotify, wasPresetBound }) {
  const [draft, setDraft] = useState(() => ({
    zh: labelOf(group.name_i18n, "zh-CN"),
    en: labelOf(group.name_i18n, "en-GB"),
    min_select: group.min_select,
    max_select: group.max_select,
    active: group.active
  }));
  const [modifierDraft, setModifierDraft] = useState({ zh: "", en: "", price: "0", default_selected: false });
  const [expanded, setExpanded] = useState(true);
  const [action, setAction] = useState("");

  // Sync draft when group props change externally (e.g. after preset apply)
  useEffect(() => {
    setDraft({
      zh: labelOf(group.name_i18n, "zh-CN"),
      en: labelOf(group.name_i18n, "en-GB"),
      min_select: group.min_select,
      max_select: group.max_select,
      active: group.active
    });
  }, [group.id, group.min_select, group.max_select, group.name_i18n, group.active]);

  async function saveGroup(refresh = true, overrides = {}) {
    const data = { ...draft, ...overrides };
    setDraft(data);
    await api(`/menu/modifier-groups/${group.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": data.zh, "en-GB": data.en || data.zh },
        min_select: Number(data.min_select),
        max_select: Number(data.max_select),
        active: data.active
      })
    });
    if (refresh) await onSaved();
  }

  async function runGroupAction(kind, operation, successText) {
    setAction(kind);
    try {
      await operation();
      await onSaved();
      onNotify(`${successText}${wasPresetBound ? "，已断开加料预设绑定" : ""}`);
    } catch (error) {
      onNotify(error.message);
    } finally {
      setAction("");
    }
  }

  function destroyGroup() {
    if (!window.confirm(`永久删除整个加料组“${draft.zh}”及其中 ${group.modifiers.length} 个选项？此操作无法恢复。`)) return;
    runGroupAction("destroy", () => api(`/menu/modifier-groups/${group.id}/destroy`, { method: "DELETE" }), "整个加料组已永久删除");
  }

  async function addModifier(event) {
    event.preventDefault();
    await api(`/menu/modifier-groups/${group.id}/modifiers`, {
      method: "POST",
      body: JSON.stringify({
        name_i18n: { "zh-CN": modifierDraft.zh, "en-GB": modifierDraft.en || modifierDraft.zh },
        price_delta: Number(modifierDraft.price),
        sort_order: group.modifiers.length,
        default_selected: modifierDraft.default_selected
      })
    });
    setModifierDraft({ zh: "", en: "", price: "0", default_selected: false });
    await onSaved();
    onNotify(wasPresetBound ? "加料已添加，已断开加料预设绑定" : "加料已添加");
  }

  async function moveModifier(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= group.modifiers.length) return;
    const current = group.modifiers[index];
    const target = group.modifiers[targetIndex];
    await Promise.all([
      api(`/menu/modifiers/${current.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: targetIndex }) }),
      api(`/menu/modifiers/${target.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: index }) })
    ]);
    await onSaved();
    onNotify(wasPresetBound ? "加料顺序已更新，已断开组预设绑定" : "加料顺序已更新");
  }

  return (
    <div className={`modifier-group-editor${expanded ? " expanded" : ""}`}>
      <div className="modifier-group-summary">
        <button className="modifier-group-toggle" type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          <span className="modifier-group-index">组 {index + 1}</span>
          <span className="modifier-group-name">{draft.zh || "未命名加料组"}</span>
          <span className="modifier-group-rule">{Number(draft.min_select) > 0 ? "必选" : "可选"} · {Number(draft.max_select) === 1 ? "单选" : `最多 ${draft.max_select} 项`} · {group.modifiers.length} 个选项</span>
        </button>
        <ModifierGroupPresetControls group={group} presets={presets} locale={locale} onSaved={onSaved} onNotify={onNotify} />
        <div className="item-sub-group-actions">
          <button className="action-save" type="button" disabled={Boolean(action)} onClick={() => runGroupAction("save", () => saveGroup(false), "加料组已保存")}><Save size={14} /><span>{action === "save" ? "保存中…" : "保存组"}</span></button>
          <button className="action-toggle" type="button" disabled={Boolean(action)} onClick={() => runGroupAction("toggle", () => saveGroup(false, { active: !draft.active }), draft.active ? "加料组已停用" : "加料组已启用")}><Power size={14} /><span>{action === "toggle" ? "处理中…" : draft.active ? "停用" : "启用"}</span></button>
          <button className="action-delete" type="button" disabled={Boolean(action)} onClick={destroyGroup}><Trash2 size={14} /><span>{action === "destroy" ? "删除中…" : "删除整组"}</span></button>
        </div>
      </div>
      {expanded && <div className="modifier-group-body">
      <div className="item-sub-group-head">
        <span className="group-settings-label">分组设置</span>
        <div className="item-sub-group-inputs">
          <input className="sub-field sub-field-name" placeholder="组名" value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} />
          <input className="sub-field sub-field-name" placeholder="English" value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} />
          <label className="sub-num-label">最少<input className="sub-field sub-field-num" type="number" min="0" value={draft.min_select} onChange={(event) => setDraft({ ...draft, min_select: event.target.value })} /></label>
          <label className="sub-num-label">最多<input className="sub-field sub-field-num" type="number" min="1" value={draft.max_select} onChange={(event) => setDraft({ ...draft, max_select: event.target.value })} /></label>
          <label className="checkbox group-required-toggle"><input type="checkbox" checked={Number(draft.min_select) > 0} onChange={(event) => setDraft({ ...draft, min_select: event.target.checked ? Math.max(1, Number(draft.min_select || 0)) : 0 })} />必选组</label>
          <span className="muted sub-price-display">{Number(draft.min_select) > 0 ? "必选" : "可选"} · {Number(draft.max_select) === 1 ? "单选" : "多选"}</span>
          <span className={`item-badge${draft.active ? " badge-active" : " badge-inactive"}`}>{draft.active ? "启用中" : "已停用"}</span>
        </div>
      </div>
      <div className="group-options-label"><span>组内选项</span><small>{group.modifiers.length} 项</small></div>
      <div className="item-sub-group-modifiers">
        {group.modifiers.map((modifier, modifierIndex) => (
          <ModifierEditor key={modifier.id} index={modifierIndex} modifier={modifier} locale={locale} currency={currency} onSaved={onSaved} onNotify={onNotify} wasPresetBound={wasPresetBound} onMove={moveModifier} total={group.modifiers.length} />
        ))}
      </div>
      <form className="item-sub-add" onSubmit={addModifier}>
        <span className="sub-add-label">新选项</span>
        <input className="sub-field" placeholder="选项名" value={modifierDraft.zh} onChange={(event) => setModifierDraft({ ...modifierDraft, zh: event.target.value })} required />
        <input className="sub-field" placeholder="English" value={modifierDraft.en} onChange={(event) => setModifierDraft({ ...modifierDraft, en: event.target.value })} />
        <input className="sub-field sub-field-price" type="number" step="0.01" placeholder="加价" value={modifierDraft.price} onChange={(event) => setModifierDraft({ ...modifierDraft, price: event.target.value })} />
        <label className="checkbox modifier-default-new"><input type="checkbox" checked={modifierDraft.default_selected} onChange={(event) => setModifierDraft({ ...modifierDraft, default_selected: event.target.checked })} />默认选中</label>
        <button type="submit"><Plus size={14} /><span>添加选项</span></button>
      </form>
      </div>}
    </div>
  );
}

function ModifierEditor({ modifier, index, locale, currency, onSaved, onNotify, wasPresetBound, onMove, total }) {
  const [draft, setDraft] = useState({
    zh: labelOf(modifier.name_i18n, "zh-CN"),
    en: labelOf(modifier.name_i18n, "en-GB"),
    price_delta: modifier.price_delta,
    active: modifier.active,
    default_selected: modifier.default_selected === true
  });
  const [action, setAction] = useState("");

  async function save(refresh = true, overrides = {}) {
    const data = { ...draft, ...overrides };
    setDraft(data);
    await api(`/menu/modifiers/${modifier.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": data.zh, "en-GB": data.en || data.zh },
        price_delta: Number(data.price_delta),
        active: data.active,
        default_selected: data.default_selected
      })
    });
    if (refresh) await onSaved();
  }

  async function runModifierAction(kind, operation, successText) {
    setAction(kind);
    try {
      await operation();
      await onSaved();
      onNotify(`${successText}${wasPresetBound ? "，已断开加料预设绑定" : ""}`);
    } catch (error) {
      onNotify(error.message);
    } finally {
      setAction("");
    }
  }

  function destroyModifier() {
    if (!window.confirm(`永久删除加料“${draft.zh}”？此操作无法恢复。`)) return;
    runModifierAction("destroy", () => api(`/menu/modifiers/${modifier.id}/destroy`, { method: "DELETE" }), "加料已永久删除");
  }

  return (
    <div className="item-sub-row modifier-option">
      <span className="sub-row-index">{index + 1}</span>
      <div className="sub-row-order">
        <button type="button" title="上移" disabled={index === 0 || Boolean(action)} onClick={() => onMove(index, -1)}><ChevronUp size={13} /></button>
        <button type="button" title="下移" disabled={index === total - 1 || Boolean(action)} onClick={() => onMove(index, 1)}><ChevronDown size={13} /></button>
      </div>
      <input className="sub-field sub-field-name" placeholder="选项" value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} />
      <input className="sub-field sub-field-name" placeholder="English" value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} />
      <input className="sub-field sub-field-price" type="number" step="0.01" placeholder="加价" value={draft.price_delta} onChange={(event) => setDraft({ ...draft, price_delta: event.target.value })} />
      <span className="sub-price-display muted">{money(draft.price_delta, currency, locale)}</span>
      <label className="checkbox modifier-default-toggle"><input type="checkbox" checked={draft.default_selected} onChange={(event) => setDraft({ ...draft, default_selected: event.target.checked })} />默认</label>
      <button className="action-save" type="button" disabled={Boolean(action)} onClick={() => runModifierAction("save", () => save(false), "加料已保存")}><Save size={14} /><span>{action === "save" ? "保存中…" : "保存"}</span></button>
      <button className="action-toggle" type="button" disabled={Boolean(action)} onClick={() => runModifierAction("toggle", () => save(false, { active: !draft.active }), draft.active ? "加料已停用" : "加料已启用")}><Power size={14} /><span>{action === "toggle" ? "处理中…" : draft.active ? "停用" : "启用"}</span></button>
      <button className="action-delete" type="button" disabled={Boolean(action)} onClick={destroyModifier}><Trash2 size={14} /><span>{action === "destroy" ? "删除中…" : "删除"}</span></button>
    </div>
  );
}

function Dashboard({ dashboard, auditLogs, locale, currency }) {
  const summary = dashboard?.summary || {};
  const yesterdaySummary = dashboard?.yesterdaySummary || null;
  const [auditCollapsed, setAuditCollapsed] = useState(true);
  const [auditTimeFilter, setAuditTimeFilter] = useState("all");
  const [auditUserFilter, setAuditUserFilter] = useState("all");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditFrom, setAuditFrom] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T00:00`;
  });
  const [auditTo, setAuditTo] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  });

  const auditUsers = [...new Map((auditLogs || []).map((log) => [
    log.actor_id || "system",
    log.actor_name || "System"
  ])).entries()].sort((a, b) => a[1].localeCompare(b[1], locale));
  const auditActions = [...new Set((auditLogs || []).map((log) => log.action).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

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
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    if (auditTimeFilter === "today") return createdAt >= todayStart && createdAt < tomorrowStart;
    if (auditTimeFilter === "yesterday") {
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      return createdAt >= yesterdayStart && createdAt < todayStart;
    }
    const days = auditTimeFilter === "7d" ? 7 : 30;
    return createdAt >= new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  });

  return (
    <div className="dashboard">
      {[
        [t(locale, "营业额", "Revenue"), "revenue"],
        [t(locale, "折扣", "Discount"), "discount"],
        [t(locale, "净销售额", "Net sales"), "net_sales"],
        ["Tax", "tax"],
        [t(locale, "服务费", "Service charge"), "service_charge"],
        [t(locale, "客单价", "Average ticket"), "average_ticket"]
      ].map(([label, key]) => {
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
              <span className="reports-delta up">
                <TrendingUp size={13} />
                {t(locale, "新增", "New")} <small className="muted">{t(locale, "较昨日", "vs yesterday")}</small>
              </span>
            )}
            {delta == null && prevNum === 0 && currNum === 0 && (
              <span className="reports-delta flat">
                {t(locale, "持平", "Flat")} <small className="muted">{t(locale, "较昨日", "vs yesterday")}</small>
              </span>
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
            <label>{t(locale, "时间", "Time")}<select value={auditTimeFilter} onChange={(event) => { setAuditTimeFilter(event.target.value); setAuditCollapsed(true); }}>
              <option value="all">{t(locale, "全部时间", "All time")}</option>
              <option value="today">{t(locale, "今天", "Today")}</option>
              <option value="yesterday">{t(locale, "昨天", "Yesterday")}</option>
              <option value="7d">{t(locale, "近 7 天", "Last 7 days")}</option>
              <option value="30d">{t(locale, "近 30 天", "Last 30 days")}</option>
              <option value="custom">{t(locale, "自定义范围", "Custom range")}</option>
            </select></label>
            {auditTimeFilter === "custom" && <>
              <label>{t(locale, "开始时间", "From")}<input type="datetime-local" value={auditFrom} max={auditTo || undefined} onChange={(event) => { setAuditFrom(event.target.value); setAuditCollapsed(true); }} /></label>
              <label>{t(locale, "结束时间", "To")}<input type="datetime-local" value={auditTo} min={auditFrom || undefined} onChange={(event) => { setAuditTo(event.target.value); setAuditCollapsed(true); }} /></label>
            </>}
            <label>{t(locale, "用户", "User")}<select value={auditUserFilter} onChange={(event) => { setAuditUserFilter(event.target.value); setAuditCollapsed(true); }}>
              <option value="all">{t(locale, "全部用户", "All users")}</option>
              {auditUsers.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
            </select></label>
            <label>{t(locale, "具体操作", "Action")}<select className="audit-action-select" value={auditActionFilter} onChange={(event) => { setAuditActionFilter(event.target.value); setAuditCollapsed(true); }}>
              <option value="all">{t(locale, "全部操作", "All actions")}</option>
              {auditActions.map((action) => <option value={action} key={action}>{action}</option>)}
            </select></label>
            {filteredAuditLogs.length > 6 && <button className="link-button" onClick={() => setAuditCollapsed((s) => !s)}>{auditCollapsed ? t(locale, "显示更多", "Show more") : t(locale, "收起", "Collapse")}</button>}
          </div>
        </div>
        {filteredAuditLogs.slice(0, auditCollapsed ? 6 : 100).map((log) => (
          <div className="list-row audit-row" key={log.id}>
            <span>{log.action}</span>
            <span>{log.actor_name || "System"}</span>
            <span>{log.entity_type}</span>
            <small>{new Date(log.created_at).toLocaleString(locale)}</small>
          </div>
        ))}
        {!filteredAuditLogs.length && <div className="empty">{t(locale, "当前筛选条件下暂无审计记录", "No audit logs for the current filters")}</div>}
      </section>
    </div>
  );
}

function ReportsAnalytics({ report, setReport, locale, currency }) {
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
      {!days.length && <div className="empty" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>暂无数据</div>}
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
      {!days.length && <div className="empty" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>暂无数据</div>}
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

function OpsView({ health, backups, settings, setSettings, locale, onRefresh, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState(settings.printer_profiles || []);
  const [showAllBackups, setShowAllBackups] = useState(false);

  useEffect(() => setProfiles(settings.printer_profiles || []), [settings.printer_profiles]);

  async function run(action) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  async function saveOpsSettings(event) {
    event.preventDefault();
    const next = { ...settings, printer_profiles: profiles };
    setSettings(next);
    await api("/settings", { method: "PUT", body: JSON.stringify(next) });
    await onSaved();
  }

  function updateProfile(id, patch) {
    setProfiles((current) => current.map((profile) => {
      if (profile.id !== id) return profile;
      const next = { ...profile, ...patch };
      // Auto-fill defaults when switching transport so the profile is immediately valid.
      if (patch.connection_type === "usb" && !next.device_path) next.device_path = "/dev/usb/lp0";
      if (patch.connection_type === "bluetooth") {
        if (!next.device_path) next.device_path = "/dev/rfcomm0";
        if (!next.channel) next.channel = 1;
      }
      if (patch.connection_type === "network") {
        if (!next.host) next.host = "192.168.1.251";
        if (!next.port) next.port = 9100;
      }
      return next;
    }));
  }

  function addProfile(type = "network") {
    const id = `printer-${Date.now().toString().slice(-5)}`;
    const base = { id, charset: "GBK", enabled: true };
    let profile;
    if (type === "usb") {
      profile = { ...base, name: t(locale, "USB 打印机", "USB printer"), connection_type: "usb", device_path: "/dev/usb/lp0" };
    } else if (type === "bluetooth") {
      profile = { ...base, name: t(locale, "蓝牙打印机", "Bluetooth printer"), connection_type: "bluetooth", device_path: "/dev/rfcomm0", mac: "", channel: 1 };
    } else {
      profile = { ...base, name: t(locale, "网络打印机", "Network printer"), connection_type: "network", host: "192.168.1.251", port: 9100 };
    }
    setProfiles((current) => [...current, profile]);
  }

  function removeProfile(id) {
    setProfiles((current) => current.filter((profile) => profile.id !== id));
  }

  function downloadUrl(name) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("qypos_token") : "";
    const grant = typeof window !== "undefined" ? window.sessionStorage.getItem("qypos_admin_grant") : "";
    return `${API_URL}/ops/backups/${encodeURIComponent(name)}?token=${token}&admin_grant=${grant}`;
  }

  return (
    <div className="ops-page">
      <section className="ops-grid">
        <article className="panel ops-card">
          <div className="panel-title"><Activity size={18} /><h2>{t(locale, "健康检查", "Health checks")}</h2></div>
          <div className={`health-status ${health?.ok ? "ok" : "bad"}`}>
            {health?.ok ? t(locale, "系统正常", "All systems healthy") : t(locale, "需要检查", "Needs attention")}
            <small>{health ? `${health.latency_ms}ms · uptime ${health.uptime_seconds}s` : t(locale, "加载中", "Loading")}</small>
          </div>
          <div className="health-checks">
            {(health?.checks || []).map((check) => (
              <div className={`health-check ${check.ok ? "ok" : "bad"}`} key={check.name}>
                <span>{check.name}</span>
                <b>{check.ok ? "OK" : "FAIL"}</b>
                <small>{check.error || `${check.latency_ms}ms`}</small>
              </div>
            ))}
          </div>
          <button type="button" onClick={onRefresh}><RefreshCw size={16} /><span>{t(locale, "刷新运维状态", "Refresh ops status")}</span></button>
        </article>

        <article className="panel ops-card">
          <div className="panel-title"><HardDrive size={18} /><h2>{t(locale, "数据库备份", "Database backups")}</h2></div>
          <form className="ops-form" onSubmit={saveOpsSettings}>
            <label className="checkbox"><input type="checkbox" checked={settings.backup_enabled} onChange={(event) => setSettings({ ...settings, backup_enabled: event.target.checked })} />{t(locale, "启用自动备份", "Enable automatic backups")}</label>
            <label>{t(locale, "备份间隔（小时）", "Backup interval (hours)")}<input type="number" min="1" max="168" value={settings.backup_interval_hours || 24} onChange={(event) => setSettings({ ...settings, backup_interval_hours: Number(event.target.value) })} /></label>
            <div className="ops-actions">
              <button className="primary" type="submit"><Save size={16} /><span>{t(locale, "保存计划", "Save schedule")}</span></button>
              <button type="button" disabled={busy} onClick={() => run(async () => { await api("/ops/backups", { method: "POST" }); await onRefresh(); })}>
                <HardDrive size={16} /><span>{busy ? t(locale, "备份中", "Backing up") : t(locale, "立即备份", "Back up now")}</span>
              </button>
            </div>
          </form>
          <div className="backup-list" style={{ maxHeight: showAllBackups ? "none" : 280, overflowY: "auto" }}>
            {(showAllBackups ? backups : backups.slice(0, 5)).map((file) => (
              <div className="backup-row" key={file.name}>
                <span>{file.name}</span>
                <small>{(Number(file.size) / 1024).toFixed(1)} KB · {new Date(file.updated_at).toLocaleString(locale)}</small>
                <a className="link-button" href={downloadUrl(file.name)}><Download size={15} /><span>{t(locale, "下载", "Download")}</span></a>
              </div>
            ))}
            {!backups.length && <div className="empty">{t(locale, "暂无备份文件", "No backup files")}</div>}
            {backups.length > 5 && (
              <button type="button" className="link-button" style={{ justifySelf: "center" }}
                onClick={() => setShowAllBackups((v) => !v)}>
                {showAllBackups ? t(locale, "收起 (仅显示最近 5 个)", "Collapse (latest 5 only)") : t(locale, `显示全部 ${backups.length} 个备份`, `Show all ${backups.length} backups`)}
              </button>
            )}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-title split">
          <div className="inline-title"><Printer size={18} /><h2>{t(locale, "多打印机配置", "Multi-printer configuration")}</h2></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => addProfile("network")}><Plus size={16} /><span>{t(locale, "添加网络打印机", "Add network printer")}</span></button>
            <button type="button" onClick={() => addProfile("usb")}><Plus size={16} /><span>{t(locale, "添加 USB 打印机", "Add USB printer")}</span></button>
            <button type="button" onClick={() => addProfile("bluetooth")}><Plus size={16} /><span>{t(locale, "添加蓝牙打印机", "Add Bluetooth printer")}</span></button>
          </div>
        </div>
        <form className="printer-config" onSubmit={saveOpsSettings}>
          <div className="printer-route-row">
            <label>{t(locale, "厨房单打印机", "Kitchen ticket printer")}
              <select value={settings.kitchen_printer_id || ""} onChange={(event) => setSettings({ ...settings, kitchen_printer_id: event.target.value })}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
            <label>{t(locale, "账单打印机", "Receipt printer")}
              <select value={settings.receipt_printer_id || ""} onChange={(event) => setSettings({ ...settings, receipt_printer_id: event.target.value })}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
            <label>{t(locale, "厨房菜品字号", "Kitchen item font size")}
              <input type="number" min="1" max="8" value={settings.kitchen_item_font_size ?? 5} onChange={(event) => setSettings({ ...settings, kitchen_item_font_size: Number(event.target.value) })} />
            </label>
            <label className="checkbox"><input type="checkbox" checked={settings.kitchen_qty_bold !== false} onChange={(event) => setSettings({ ...settings, kitchen_qty_bold: event.target.checked })} />{t(locale, "数量加粗 (1X)", "Bold quantity (1X)")}</label>
            <label className="checkbox"><input type="checkbox" checked={settings.kitchen_item_bold !== false} onChange={(event) => setSettings({ ...settings, kitchen_item_bold: event.target.checked })} />{t(locale, "菜品名加粗", "Bold item name")}</label>
            <button className="primary" type="submit"><Save size={16} /><span>{t(locale, "保存打印配置", "Save printer settings")}</span></button>
            <button type="button" onClick={() => run(async () => { await api("/print-jobs/cash-drawer", { method: "POST" }); alert(t(locale, "钱箱信号已发送", "Cash drawer signal sent")); })}><span>💵 {t(locale, "弹出钱箱", "Open cash drawer")}</span></button>
          </div>
          <div className="printer-profile-list">
            {profiles.map((profile) => (
              <div className="printer-profile-row" key={profile.id}>
                <label>{t(locale, "名称", "Name")}<input value={profile.name} onChange={(event) => updateProfile(profile.id, { name: event.target.value })} /></label>
                <label>{t(locale, "连接方式", "Connection")}<select value={profile.connection_type || "network"} onChange={(event) => updateProfile(profile.id, { connection_type: event.target.value })}>
                  <option value="network">{t(locale, "网络 (TCP/IP)", "Network (TCP/IP)")}</option>
                  <option value="usb">USB</option>
                  <option value="bluetooth">{t(locale, "蓝牙 (rfcomm)", "Bluetooth (rfcomm)")}</option>
                </select></label>
                <label>{t(locale, "字符集", "Charset")}<select value={profile.charset || "GBK"} onChange={(event) => updateProfile(profile.id, { charset: event.target.value })}>
                  <option value="GBK">GBK（常用）</option>
                  <option value="GB18030">GB18030（延伸GBK）</option>
                  <option value="UTF-8">UTF-8（新型打印机）</option>
                </select></label>
                {(profile.connection_type === "usb") && (
                  <label>{t(locale, "设备路径", "Device path")}<input value={profile.device_path || "/dev/usb/lp0"} onChange={(event) => updateProfile(profile.id, { device_path: event.target.value })} /></label>
                )}
                {(profile.connection_type === "bluetooth") && (
                  <>
                    <label>{t(locale, "蓝牙 MAC", "Bluetooth MAC")}<input placeholder="00:11:22:33:44:55" value={profile.mac || ""} onChange={(event) => updateProfile(profile.id, { mac: event.target.value })} /></label>
                    <label>{t(locale, "RFCOMM 通道", "RFCOMM channel")}<input type="number" min="1" max="30" value={profile.channel || 1} onChange={(event) => updateProfile(profile.id, { channel: Number(event.target.value) })} /></label>
                    <label>{t(locale, "设备路径", "Device path")}<input value={profile.device_path || "/dev/rfcomm0"} onChange={(event) => updateProfile(profile.id, { device_path: event.target.value })} /></label>
                  </>
                )}
                {(!profile.connection_type || profile.connection_type === "network") && (
                  <>
                    <label>{t(locale, "IP 地址", "IP address")}<input value={profile.host || ""} onChange={(event) => updateProfile(profile.id, { host: event.target.value })} /></label>
                    <label>{t(locale, "端口", "Port")}<input type="number" min="1" max="65535" value={profile.port || 9100} onChange={(event) => updateProfile(profile.id, { port: Number(event.target.value) })} /></label>
                  </>
                )}
                <label className="checkbox"><input type="checkbox" checked={profile.enabled !== false} onChange={(event) => updateProfile(profile.id, { enabled: event.target.checked })} />{t(locale, "启用", "Enabled")}</label>
                <button type="button" onClick={() => run(async () => { await api("/print-jobs/test", { method: "POST", body: JSON.stringify({ printer_id: profile.id }) }); await onRefresh(); })}>{t(locale, "测试", "Test")}</button>
                <button type="button" onClick={() => removeProfile(profile.id)}><Trash2 size={15} /></button>
                {profile.connection_type === "bluetooth" && (
                  <pre className="bt-guide" style={{ gridColumn: "1 / -1", margin: "4px 0 0", padding: "8px 10px", background: "#f1f5f9", borderRadius: 6, fontSize: 12, lineHeight: 1.5, color: "#334155", whiteSpace: "pre-wrap" }}>
{`${t(locale, "# 在 Linux 服务器（宿主机，不是容器）一次性配对 + 绑定：", "# On the Linux host (not the container), pair and bind once:")}
sudo bluetoothctl
  scan on            # ${t(locale, "看到", "Find")} ${profile.name || t(locale, "打印机", "printer")}（${profile.mac || "MAC"}）${t(locale, "后 scan off", "then scan off")}
  pair ${profile.mac || "<MAC>"}        # ${t(locale, "输入 PIN（Rongta 多为 0000）", "Enter PIN (Rongta is usually 0000)")}
  trust ${profile.mac || "<MAC>"}
  exit
sudo rfcomm bind ${profile.device_path || "/dev/rfcomm0"} ${profile.mac || "<MAC>"} ${profile.channel || 1}
ls -l ${profile.device_path || "/dev/rfcomm0"}   # ${t(locale, "出现 crw-rw---- 即成功", "crw-rw---- means success")}
echo HELLO > ${profile.device_path || "/dev/rfcomm0"}   # ${t(locale, "打印机出纸即可用", "Print a test page to verify it")}`}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}

function SettingsView({ settings, setSettings, locale, onSaved, adminAuthorized = false }) {
  const originalProtectedSettings = useRef({
    tax: Number(settings.tax_rate),
    service: Number(settings.service_charge_rate),
    pricesIncludeTax: Boolean(settings.prices_include_tax),
    showTaxOnReceipt: Boolean(settings.show_tax_on_receipt)
  });
  const [confirmName, setConfirmName] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const protectedSettingsChanged = !adminAuthorized && (Number(settings.tax_rate) !== originalProtectedSettings.current.tax
    || Number(settings.service_charge_rate) !== originalProtectedSettings.current.service
    || Boolean(settings.prices_include_tax) !== originalProtectedSettings.current.pricesIncludeTax
    || Boolean(settings.show_tax_on_receipt) !== originalProtectedSettings.current.showTaxOnReceipt);

  async function save(event) {
    event.preventDefault();
    if (protectedSettingsChanged && (!confirmName.trim() || !confirmPin)) {
      setFeedback(t(locale, "修改税务或服务费设置需要输入当前账号名和 PIN。", "Changing tax or service settings requires the current username and PIN."));
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      await api("/settings", {
        method: "PUT",
        body: JSON.stringify({ ...settings, confirm_name: confirmName.trim(), confirm_pin: confirmPin })
      });
      originalProtectedSettings.current = {
        tax: Number(settings.tax_rate),
        service: Number(settings.service_charge_rate),
        pricesIncludeTax: Boolean(settings.prices_include_tax),
        showTaxOnReceipt: Boolean(settings.show_tax_on_receipt)
      };
      setConfirmName("");
      setConfirmPin("");
      await onSaved();
      setFeedback(t(locale, "设置已保存。", "Settings saved."));
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function printTest() {
    await api("/print-jobs/test", { method: "POST" });
    await onSaved();
  }

  return (
    <div className="settings-top">
      <form className="settings-form" onSubmit={save}>
        <div className="settings-section settings-section-basic">
          <div className="settings-section-title"><Settings size={17} /><div><h3>{t(locale, "基本设置", "General")}</h3></div></div>
          <div className="settings-fields">
            <label>{t(locale, "语言 / Locale", "Language / Locale")}
              <select value={settings.locale} onChange={(event) => setSettings({ ...settings, locale: event.target.value })}>
                <option value="zh-CN">中文（简体）</option>
                <option value="en-GB">English (UK)</option>
              </select>
            </label>
            <label>{t(locale, "结算币种", "Currency")}<input value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })} /></label>
          </div>
        </div>
        <div className="settings-section settings-section-tax">
          <div className="settings-section-title"><CircleDollarSign size={17} /><div><h3>{t(locale, "税务与费用", "Tax & fees")}</h3></div></div>
          <div className="settings-fields">
            <label>{t(locale, "VAT 税率", "VAT rate")}<input type="number" step="0.001" value={settings.tax_rate} onChange={(event) => setSettings({ ...settings, tax_rate: Number(event.target.value) })} /></label>
            <label>{t(locale, "服务费率", "Service charge rate")}<input type="number" step="0.001" value={settings.service_charge_rate} onChange={(event) => setSettings({ ...settings, service_charge_rate: Number(event.target.value) })} /></label>
          </div>
          <div className="settings-checkboxes">
            <label className="checkbox"><input type="checkbox" checked={settings.prices_include_tax} onChange={(event) => setSettings({ ...settings, prices_include_tax: event.target.checked })} /><b>{t(locale, "VAT 包含在标价中（默认 20%）", "Prices include VAT (default 20%)")}</b></label>
            <label className="checkbox"><input type="checkbox" checked={settings.show_tax_on_receipt} onChange={(event) => setSettings({ ...settings, show_tax_on_receipt: event.target.checked })} />{t(locale, "小票显示 VAT 金额", "Show VAT amount on receipt")}</label>
          </div>
          {protectedSettingsChanged && (
            <div className="settings-reauth">
              <div><strong>{t(locale, "需要身份确认", "Re-authentication required")}</strong></div>
              <label>{t(locale, "账号名", "Username")}<input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="username" /></label>
              <label>PIN<input type="password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value)} autoComplete="current-password" /></label>
            </div>
          )}
        </div>
        <div className="settings-section settings-section-tables">
          <div className="settings-section-title"><Armchair size={17} /><div><h3>{t(locale, "桌台行为", "Table behavior")}</h3></div></div>
          <div className="settings-checkboxes">
            <label className="checkbox"><input type="checkbox" checked={Boolean(settings.auto_clear_tables_after_payment)} onChange={(event) => setSettings({ ...settings, auto_clear_tables_after_payment: event.target.checked })} />{t(locale, "付款完成后自动清台", "Auto clear tables after payment")}</label>
            <label className="checkbox"><input type="checkbox" checked={Boolean(settings.auto_clear_empty_tables_after_idle)} onChange={(event) => setSettings({ ...settings, auto_clear_empty_tables_after_idle: event.target.checked })} />{t(locale, "开台后空台超过设定时间无操作自动清台", "Auto clear an empty table after it's idle for a set time")}</label>
          </div>
          {Boolean(settings.auto_clear_empty_tables_after_idle) && (
            <div className="settings-fields">
              <label>{t(locale, "空台等待分钟数", "Idle minutes before clearing")}<input type="number" min="1" step="1" value={settings.auto_clear_empty_tables_idle_minutes ?? 60} onChange={(event) => setSettings({ ...settings, auto_clear_empty_tables_idle_minutes: Number(event.target.value) })} /></label>
            </div>
          )}
        </div>
        <div className="settings-section settings-section-receipt">
          <div className="settings-section-title"><ReceiptText size={17} /><div><h3>{t(locale, "小票内容", "Receipt content")}</h3></div></div>
          <div className="settings-fields">
            <label>{t(locale, "店铺名称（英文）", "Store name (English)")}<input value={settings.receipt_header || ""} onChange={(event) => setSettings({ ...settings, receipt_header: event.target.value })} /></label>
            <label>{t(locale, "店铺名称（中文）", "Store name (Chinese)")}<input value={settings.receipt_header_zh || ""} onChange={(event) => setSettings({ ...settings, receipt_header_zh: event.target.value })} /></label>
            <label>{t(locale, "联系电话", "Phone")}<input value={settings.receipt_phone || ""} onChange={(event) => setSettings({ ...settings, receipt_phone: event.target.value })} placeholder="07347 997926" /></label>
            <label>{t(locale, "店铺地址", "Address")}<input value={settings.receipt_address || ""} onChange={(event) => setSettings({ ...settings, receipt_address: event.target.value })} /></label>
            <label>{t(locale, "小票页脚", "Receipt footer")}<input value={settings.receipt_footer || ""} onChange={(event) => setSettings({ ...settings, receipt_footer: event.target.value })} /></label>
          </div>
        </div>
        <div className="settings-actions">
          <button className="primary" type="submit" disabled={saving}><Save size={16} /><span>{saving ? t(locale, "保存中…", "Saving…") : t(locale, "保存设置", "Save settings")}</span></button>
          <button type="button" onClick={printTest}><Printer size={16} /><span>{t(locale, "打印测试", "Print test")}</span></button>
          {feedback && <span className="settings-feedback">{feedback}</span>}
        </div>
      </form>
      <section className="panel receipt-preview">
        <div className="panel-title"><ReceiptText size={18} /><h2>{t(locale, "Receipt 预览", "Receipt preview")}</h2></div>
        <div className="receipt-paper">
          <strong>{settings.receipt_header || "Granny Noodles"}</strong>
          {settings.receipt_header_zh && <span style={{textAlign:"center",fontWeight:600}}>{settings.receipt_header_zh}</span>}
          {settings.receipt_phone && <span style={{textAlign:"center"}}>{t(locale, "Tel 电话:", "Tel:")} {settings.receipt_phone}</span>}
          {settings.receipt_address && <span style={{textAlign:"center"}}>{settings.receipt_address}</span>}
          <hr />
          <span>{t(locale, "订单", "Order")}: DEMO-001 · {t(locale, "桌台", "Table")}: A1</span>
          <hr />
          <span style={{display:"grid",gridTemplateColumns:"1fr 30px 50px 50px",fontWeight:600}}>
            <span>{t(locale, "菜品", "Item")}</span><span style={{textAlign:"right"}}>Qty</span><span style={{textAlign:"right"}}>Unit</span><span style={{textAlign:"right"}}>Amt</span>
          </span>
          <span style={{display:"grid",gridTemplateColumns:"1fr 30px 50px 50px"}}>
            <span>重庆小面<br /><small>Chongqing Noodles</small></span>
            <span style={{textAlign:"right"}}>2</span>
            <span style={{textAlign:"right"}}>{money(10, settings.currency, settings.locale)}</span>
            <span style={{textAlign:"right"}}>{money(20, settings.currency, settings.locale)}</span>
          </span>
          <hr />
          <span>小计 Subtotal <b>{money(20, settings.currency, settings.locale)}</b></span>
          {settings.show_tax_on_receipt && <span>VAT {settings.prices_include_tax ? `(含 incl. ${Math.round((settings.tax_rate||0)*100)}%)` : `(${Math.round((settings.tax_rate||0)*100)}%)`} <b>{money(20 * (settings.tax_rate||0) / (settings.prices_include_tax ? (1+(settings.tax_rate||0)) : 1), settings.currency, settings.locale)}</b></span>}
          {Number(settings.service_charge_rate) > 0 && <span>服务费 Service ({Math.round((settings.service_charge_rate||0)*100)}%) <b>{money(20 * (settings.service_charge_rate||0), settings.currency, settings.locale)}</b></span>}
          <strong>合计 TOTAL {money(20 + 20 * (settings.service_charge_rate||0) + (settings.prices_include_tax ? 0 : 20 * (settings.tax_rate||0)), settings.currency, settings.locale)}</strong>
          <small>{settings.receipt_footer || "Thank you / 感谢光临"}</small>
        </div>
      </section>
    </div>
  );
}

// ── Users management ─────────────────────────────────────────────────────────
function UsersView({ usersList, rolesList, onSaved }) {
  const [editing, setEditing] = useState(null); // null = list, {user} = edit, "new" = create
  const [form, setForm] = useState({ name: "", pin: "", role_id: "", active: true });
  const [localUsers, setLocalUsers] = useState([]);
  const [localRoles, setLocalRoles] = useState([]);
  const [loadError, setLoadError] = useState("");

  const users = usersList.length ? usersList : localUsers;
  const roles = rolesList.length ? rolesList : localRoles;

  useEffect(() => {
    async function load() {
      try {
        const [u, r] = await Promise.all([api("/users"), api("/roles")]);
        setLocalUsers(u);
        setLocalRoles(r);
        setLoadError("");
      } catch (e) {
        setLoadError(e.message || "加载失败");
      }
    }
    load();
  }, []);

  function openNew() {
    setForm({ name: "", pin: "", role_id: roles[0]?.id ?? "", active: true });
    setLoadError(roles.length ? "" : "角色列表尚未加载，请稍后重试");
    setEditing("new");
  }
  function openEdit(user) {
    setForm({ name: user.name, pin: user.pin, role_id: user.role_id, active: user.active });
    setEditing(user);
  }
  function cancel() { setEditing(null); }

  async function save(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.pin.trim() || !form.role_id) {
      setLoadError("请填写姓名、PIN 并选择角色");
      return;
    }
    try {
      if (editing === "new") {
        await api("/users", { method: "POST", body: JSON.stringify(form) });
      } else {
        await api(`/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
      }
      setLoadError("");
      setEditing(null);
      await onSaved();
    } catch (error) {
      setLoadError(error.message || "保存账户失败");
    }
  }

  async function remove(user) {
    if (!confirm(`确定删除 ${user.name}？`)) return;
    await api(`/users/${user.id}`, { method: "DELETE" });
    await onSaved();
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-title split">
        <div className="inline-title"><Users size={18} /><h2>账户管理</h2></div>
        <button type="button" onClick={openNew}><Plus size={16} /><span>新建账户</span></button>
      </div>

      {editing && (
        <form className="settings-form" onSubmit={save} style={{ marginBottom: 16, padding: 14, border: "1px solid var(--line)", borderRadius: 8, background: "white" }}>
          <p style={{ margin: "0 0 10px", fontWeight: 600 }}>{editing === "new" ? "新建账户" : `编辑 ${editing.name}`}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, alignItems: "end" }}>
            <label>姓名<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></label>
            <label>PIN<input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></label>
            <label>角色<select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
            <label className="checkbox"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />启用</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" type="submit" disabled={!roles.length}><Save size={14} /><span>保存</span></button>
              <button type="button" onClick={cancel}>取消</button>
            </div>
          </div>
        </form>
      )}

      {loadError && <div style={{ padding: 10, marginBottom: 8, background: "#fef2f2", color: "#dc2626", borderRadius: 6, fontSize: 13 }}>{loadError}</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {users.map((u) => (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 10, alignItems: "center", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "white", opacity: u.active ? 1 : 0.5 }}>
            <div>
              <strong style={{ color: "var(--ink)" }}>{u.name}</strong>
              <small style={{ color: "var(--muted)", marginLeft: 8 }}>{u.role}</small>
              {!u.active && <small style={{ color: "#ef4444", marginLeft: 8 }}>已禁用</small>}
            </div>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>PIN: {u.pin}</span>
            <button type="button" onClick={() => openEdit(u)} style={{ fontSize: 12 }}>编辑</button>
            <button type="button" onClick={() => remove(u)} style={{ fontSize: 12, color: "#ef4444" }}><Trash2 size={14} /></button>
          </div>
        ))}
        {!users.length && !loadError && <div className="empty">暂无账户</div>}
      </div>
    </div>
  );
}

const GRID_SIZE = 20;

function LayoutView({ layout, onSaved }) {
  const [draftLayout, setDraftLayout] = useState(layout);
  const [dragging, setDragging] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [visibleAreaId, setVisibleAreaId] = useState(layout.areas[0]?.id || "");
  const [newAreaName, setNewAreaName] = useState("");
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const undoFnRef = useRef(null);
  const redoFnRef = useRef(null);

  useEffect(() => {
    setDraftLayout(layout);
    setVisibleAreaId((current) => layout.areas.some((area) => area.id === current) ? current : layout.areas[0]?.id || "");
    setSelectedTableId((current) => current || layout.tables[0]?.id || null);
    setUndoStack([]);
    setRedoStack([]);
  }, [layout]);

  const selectedTable = draftLayout.tables.find((table) => (table.id || table._client_id) === selectedTableId);
  const visibleTables = draftLayout.tables.filter((table) => !visibleAreaId || table.area_id === visibleAreaId);

  async function saveLayout() {
    const cleanLayout = {
      ...draftLayout,
      tables: draftLayout.tables.map(({ _client_id, ...table }) => table)
    };
    await api("/floor-layouts", { method: "PUT", body: JSON.stringify(cleanLayout) });
    setUndoStack([]);
    setRedoStack([]);
    await onSaved();
  }

  function moveTable(id, dx, dy) {
    if (!editMode) return;
    setDraftLayout((current) => ({
      ...current,
      tables: current.tables.map((table) => {
        if ((table.id || table._client_id) !== id) return table;
        const rawX = Math.max(0, Number(table.x) + dx);
        const rawY = Math.max(0, Number(table.y) + dy);
        const x = snapEnabled ? Math.round(rawX / GRID_SIZE) * GRID_SIZE : rawX;
        const y = snapEnabled ? Math.round(rawY / GRID_SIZE) * GRID_SIZE : rawY;
        return { ...table, x, y };
      })
    }));
  }

  function updateSelectedTable(field, value) {
    setDraftLayout((current) => ({
      ...current,
      tables: current.tables.map((table) => (table.id || table._client_id) === selectedTableId ? { ...table, [field]: value } : table)
    }));
  }

  function addTable() {
    const area = draftLayout.areas.find((item) => item.id === visibleAreaId) || draftLayout.areas[0];
    if (!area) return;
    pushHistory();
    const next = draftLayout.tables.length + 1;
    const newId = `new-${Date.now()}`;
    setDraftLayout((current) => ({
      ...current,
      tables: [...current.tables, {
        _client_id: newId,
        area_id: area.id,
        label: `N${next}`,
        seats: 2,
        status: "available",
        x: 40 + next * 12,
        y: 300,
        width: 100,
        height: 72,
        shape: "rect",
        rotation: 0
      }]
    }));
    setSelectedTableId(newId);
  }

  async function addArea(event) {
    event.preventDefault();
    if (!newAreaName.trim()) return;
    await api("/floor-areas", {
      method: "POST",
      body: JSON.stringify({ name: newAreaName.trim(), sort_order: draftLayout.areas.length })
    });
    setNewAreaName("");
    await onSaved();
  }

  async function updateArea(area, patch) {
    await api(`/floor-areas/${area.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...area, ...patch })
    });
    await onSaved();
  }

  async function deleteArea(area) {
    await api(`/floor-areas/${area.id}`, { method: "DELETE" });
    await onSaved();
  }

  async function copySelectedTable() {
    if (!selectedTable) return;
    if (!selectedTable.id) {
      const newId = `new-${Date.now()}`;
      setDraftLayout((current) => ({
        ...current,
        tables: [...current.tables, { ...selectedTable, _client_id: newId, label: `${selectedTable.label}-copy`, x: Number(selectedTable.x) + 24, y: Number(selectedTable.y) + 24 }]
      }));
      setSelectedTableId(newId);
      return;
    }
    await api(`/tables/${selectedTable.id}/copy`, {
      method: "POST",
      body: JSON.stringify({ label: `${selectedTable.label}-copy` })
    });
    await onSaved();
  }

  async function deleteSelectedTable() {
    if (!selectedTable) return;
    const key = selectedTable.id || selectedTable._client_id;
    if (!selectedTable.id) {
      setDraftLayout((current) => ({ ...current, tables: current.tables.filter((table) => (table.id || table._client_id) !== key) }));
      setSelectedTableId(null);
      return;
    }
    await api(`/tables/${selectedTable.id}`, { method: "DELETE" });
    setSelectedTableId(null);
    await onSaved();
  }

  function getSnapshot() {
    return { tables: draftLayout.tables.map((t) => ({ ...t })), areas: draftLayout.areas.map((a) => ({ ...a })) };
  }

  function pushHistory() {
    setUndoStack((u) => [...u.slice(-49), getSnapshot()]);
    setRedoStack([]);
  }

  function undo() {
    if (!undoStack.length) return;
    const snap = getSnapshot();
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, snap]);
    setUndoStack((u) => u.slice(0, -1));
    setDraftLayout((d) => ({ ...d, tables: prev.tables, areas: prev.areas }));
  }

  function redo() {
    if (!redoStack.length) return;
    const snap = getSnapshot();
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, snap]);
    setRedoStack((r) => r.slice(0, -1));
    setDraftLayout((d) => ({ ...d, tables: next.tables, areas: next.areas }));
  }

  undoFnRef.current = undo;
  redoFnRef.current = redo;

  useEffect(() => {
    function onKeyDown(event) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redoFnRef.current?.();
      else undoFnRef.current?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="layout-view">
      <div className="area-toolbar">
        {draftLayout.areas.map((area) => (
          <button key={area.id} className={visibleAreaId === area.id ? "selected" : ""} onClick={() => setVisibleAreaId(area.id)} type="button">
            {area.name}
          </button>
        ))}
      </div>
      <form className="inline-editor area-editor" onSubmit={addArea}>
        <label>新区域<input value={newAreaName} onChange={(event) => setNewAreaName(event.target.value)} placeholder="Patio" /></label>
        <button type="submit"><Plus size={16} /><span>添加区域</span></button>
      </form>
      <div className="inline-editor-list area-list">
        {draftLayout.areas.map((area) => (
          <div className="inline-editor" key={area.id}>
            <label>区域名<input value={area.name} onChange={(event) => {
              const name = event.target.value;
              setDraftLayout((current) => ({ ...current, areas: current.areas.map((item) => item.id === area.id ? { ...item, name } : item) }));
            }} /></label>
            <label>排序<input type="number" value={area.sort_order ?? 0} onChange={(event) => {
              const sortOrder = Number(event.target.value);
              setDraftLayout((current) => ({ ...current, areas: current.areas.map((item) => item.id === area.id ? { ...item, sort_order: sortOrder } : item) }));
            }} /></label>
            <button type="button" onClick={() => updateArea(area, draftLayout.areas.find((item) => item.id === area.id))}><Save size={16} /><span>保存区域</span></button>
            <button type="button" onClick={() => deleteArea(area)}><Trash2 size={16} /><span>删除区域</span></button>
          </div>
        ))}
      </div>
      <div className="layout-toolbar">
        <button className={editMode ? "selected" : ""} onClick={() => setEditMode((current) => !current)} type="button">
          <span>{editMode ? "退出编辑模式" : "进入编辑模式"}</span>
        </button>
        {editMode && <>
          <button onClick={undo} type="button" disabled={!undoStack.length} title="撤销 (⌘Z)"><Undo2 size={18} /><span>撤销</span></button>
          <button onClick={redo} type="button" disabled={!redoStack.length} title="重做 (⌘⇧Z)"><Redo2 size={18} /><span>重做</span></button>
          <button className={snapEnabled ? "selected" : ""} onClick={() => setSnapEnabled((v) => !v)} type="button" title="网格吸附"><Grid3X3 size={18} /><span>吸附</span></button>
        </>}
        <button onClick={addTable} type="button"><Plus size={18} /><span>添加桌台</span></button>
        <button className="primary" onClick={saveLayout} type="button"><Save size={18} /><span>保存布局</span></button>
      </div>
      <div className="layout-editor-grid">
        <div
          className={`floor-canvas editor ${editMode ? "is-editing" : ""}`}
          style={snapEnabled && editMode ? { backgroundImage: "radial-gradient(circle, #bbb 1.5px, transparent 1.5px)", backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px` } : undefined}
          onPointerMove={(event) => {
            if (!dragging) return;
            moveTable(dragging.id, event.movementX, event.movementY);
          }}
          onPointerUp={() => setDragging(null)}
          onPointerLeave={() => setDragging(null)}
        >
          {visibleTables.map((table) => {
            const tableKey = table.id || table._client_id;
            return (
              <button
                key={tableKey}
                className={`table-shape ${table.shape} ${table.status} ${selectedTableId === tableKey ? "selected-table" : ""}`}
                style={{ left: Number(table.x), top: Number(table.y), width: Number(table.width), height: Number(table.height) }}
                onClick={() => setSelectedTableId(tableKey)}
                onPointerDown={(event) => {
                  setSelectedTableId(tableKey);
                  if (!editMode) return;
                  pushHistory();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragging({ id: tableKey });
                }}
                type="button"
              >
                <strong>{table.label}</strong>
                <span>{table.seats} seats</span>
              </button>
            );
          })}
        </div>
        <aside className="table-inspector">
          <h3>桌台属性</h3>
          {!selectedTable ? (
            <p className="empty">选择一个桌台进行编辑</p>
          ) : (
            <>
              <label>自定义编号<input value={selectedTable.label} onChange={(event) => updateSelectedTable("label", event.target.value)} disabled={!editMode} /></label>
              <label>座位数<input type="number" min="1" value={selectedTable.seats} onChange={(event) => updateSelectedTable("seats", Number(event.target.value))} disabled={!editMode} /></label>
              <label>形状<select value={selectedTable.shape} onChange={(event) => updateSelectedTable("shape", event.target.value)} disabled={!editMode}>
                <option value="rect">方桌</option>
                <option value="round">圆桌</option>
              </select></label>
              <label>宽度<input type="number" min="64" value={selectedTable.width} onChange={(event) => updateSelectedTable("width", Number(event.target.value))} disabled={!editMode} /></label>
              <label>高度<input type="number" min="56" value={selectedTable.height} onChange={(event) => updateSelectedTable("height", Number(event.target.value))} disabled={!editMode} /></label>
              <label>区域<select value={selectedTable.area_id} onChange={(event) => updateSelectedTable("area_id", event.target.value)} disabled={!editMode}>
                {draftLayout.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select></label>
              <div className="inspector-actions">
                <button type="button" onClick={copySelectedTable} disabled={!editMode}><Copy size={16} /><span>复制桌台</span></button>
                <button type="button" onClick={deleteSelectedTable} disabled={!editMode || selectedTable.current_order_id}><Trash2 size={16} /><span>删除桌台</span></button>
              </div>
              <p className="inspector-help">{editMode ? "拖拽桌台可调整位置，修改编号后点击保存布局。" : "进入编辑模式后可拖拽和修改桌台属性。"}</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
