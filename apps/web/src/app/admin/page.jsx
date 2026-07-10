"use client";

import {
  Armchair,
  AlertCircle,
  Activity,
  BarChart3,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
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
  Shield,
  Trash2,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileDown,
  HardDrive,
  Key,
  LogOut,
  Lock,
  Pencil,
  TrendingDown,
  TrendingUp,
  Undo2,
  User,
  UserPlus,
  Users,
  WifiOff,
  Wrench,
  X
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, API_URL, labelOf } from "../../lib/api";
import qyposLogo from "../../pic/logo.png";
import AdminLogin from "./_components/admin-login";
import AdminGateModal from "./_components/admin-gate-modal";
import UsersView, { RoleBadge } from "./_components/users-view";
import LayoutView from "./_components/layout-view";
import Dashboard from "./_components/dashboard-view";
import OrdersView from "./_components/orders-view";
import { KitchenView, PrintJobsView } from "./_components/orders-view";
import SettingsView from "./_components/settings-view";
import OpsView from "./_components/ops-view";
import ReportsAnalytics from "./_components/reports-view";
import StaffScheduleView from "./_components/schedule-view";
import MenuAdmin, { MenuAvailabilityAdmin } from "./_components/menu-admin";

const tabs = [
  ["orders", ClipboardList, { "zh-CN": "订单", "en-GB": "Orders" }, ["manage_orders"]],
  ["kitchen", ChefHat, { "zh-CN": "厨房", "en-GB": "Kitchen" }, ["view_kitchen"]],
  ["prints", Printer, { "zh-CN": "打印", "en-GB": "Prints" }, ["manage_prints"]],
  ["menu", ReceiptText, { "zh-CN": "菜单", "en-GB": "Menu" }, ["manage_menu", "manage_menu_availability"]],
  ["dashboard", BarChart3, { "zh-CN": "看板", "en-GB": "Dashboard" }, ["view_dashboard"]],
  ["reports", TrendingUp, { "zh-CN": "分析", "en-GB": "Reports" }, ["view_reports"]],
  ["schedule", CalendarDays, { "zh-CN": "排班", "en-GB": "Schedule" }, ["view_staff_schedules", "manage_staff_schedules"]],
  ["settings", Settings, { "zh-CN": "设置", "en-GB": "Settings" }, ["manage_settings"]],
  ["users", Users, { "zh-CN": "账户", "en-GB": "Users" }, ["manage_users"]],
  ["ops", Wrench, { "zh-CN": "运维", "en-GB": "Ops" }, ["manage_ops"]],
  ["layout", Armchair, { "zh-CN": "布局", "en-GB": "Layout" }, ["manage_tables"]]
];
const adminGatedTabs = new Set(["dashboard", "reports", "schedule", "settings", "users", "ops", "layout"]);

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

// ── AdminLogin & AdminGateModal (imported) ──────────────────────────────────

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("orders");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== "undefined" && localStorage.getItem("qypos_sidebar_collapsed") === "1");
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
    // Remove pre-hydration style injected by the beforeInteractive script
    var preStyle = document.getElementById("qypos-sidebar-prehydrate");
    if (preStyle) preStyle.remove();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (sidebarCollapsed) {
      document.body.dataset.qyposSidebarCollapsed = "1";
    } else {
      document.body.removeAttribute("data-qypos-sidebar-collapsed");
    }
  }, [sidebarCollapsed]);

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
    <main className="admin-shell" style={{ display: 'table', width: '100%', tableLayout: 'fixed', minHeight: '100vh' }}>
      <aside className={`sidebar animate${sidebarCollapsed ? " collapsed" : ""}`} style={{ display: 'table-cell', width: sidebarCollapsed ? 72 : 220, minWidth: sidebarCollapsed ? 72 : 220, overflow: 'hidden' }}>
        <div className="brand" onClick={() => { const next = !sidebarCollapsed; setSidebarCollapsed(next); localStorage.setItem("qypos_sidebar_collapsed", next ? "1" : "0"); }} title={sidebarCollapsed ? t(locale, "展开", "Expand") : t(locale, "收起", "Collapse")} style={{cursor:"pointer"}}>
          <img className="brand-logo" src={qyposLogo.src} alt="QYPOS" />
          {!sidebarCollapsed && <span>QYPOS</span>}
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

      <section className="workspace" style={{ display: 'table-cell' }}>
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
        {activeTab === "schedule" && <StaffScheduleView locale={locale} currency={currency} onNotify={showNotice} canManage={user.permissions.includes("manage_staff_schedules") || adminGrantTab === "schedule"} />}
        {activeTab === "settings" && settings && <SettingsView settings={settings} setSettings={setSettings} locale={locale} onSaved={refresh} adminAuthorized={adminGrantTab === "settings"} />}
        {activeTab === "layout" && <LayoutView layout={layout} onSaved={refresh} />}
        {activeTab === "users" && <UsersView usersList={usersList} rolesList={rolesList} onSaved={async () => { await refresh(); await refreshUsers(); }} />}
        {activeTab === "ops" && settings && <OpsView health={opsHealth} backups={backups} settings={settings} setSettings={setSettings} locale={locale} onRefresh={refreshOps} onSaved={async () => { await refresh(); await refreshOps(); }} />}
      </section>
      {adminGateTarget && <AdminGateModal tab={adminGateTarget} locale={locale} tabs={tabs} onCancel={() => setAdminGateTarget(null)} onGranted={enterAdminTab} />}
    </main>
  );
}
