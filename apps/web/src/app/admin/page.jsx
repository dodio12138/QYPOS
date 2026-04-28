"use client";

import {
  Armchair,
  AlertCircle,
  Activity,
  BarChart3,
  ChefHat,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Grid3X3,
  Plus,
  Printer,
  Redo2,
  RefreshCw,
  ReceiptText,
  Save,
  Settings,
  Trash2,
  Copy,
  Download,
  FileDown,
  HardDrive,
  LogOut,
  Undo2,
  User,
  WifiOff,
  Wrench
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, API_URL, labelOf } from "../../lib/api";

const tabs = [
  ["orders", ClipboardList, "订单"],
  ["kitchen", ChefHat, "厨房"],
  ["prints", Printer, "打印"],
  ["menu", ReceiptText, "菜单"],
  ["dashboard", BarChart3, "看板"],
  ["settings", Settings, "设置"],
  ["ops", Wrench, "运维"]
];

function money(value, currency = "CNY", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value || 0));
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
          <CircleDollarSign size={28} />
          <span>QYPOS</span>
        </div>
        <h1>后台登录</h1>
        <label>员工名<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="username" /></label>
        <label>PIN<input value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="current-password" type="password" /></label>
        {error && <div className="inline-error">{error}</div>}
        <button className="primary" type="submit" disabled={busy}><User size={18} /><span>{busy ? "登录中" : "登录"}</span></button>
        <p className="empty">默认 Owner / 0000</p>
      </form>
    </main>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
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
  const [notice, setNotice] = useState("");

  const locale = settings?.locale || "zh-CN";
  const currency = settings?.currency || "CNY";

  async function refresh() {
    if (!user) return;
    const [settingsData, menuData, layoutData, ordersData, kitchenItemsData, printJobsData, dashboardData] = await Promise.all([
      api("/settings"),
      api("/menu"),
      api("/floor-layouts"),
      api("/orders"),
      api("/kitchen/items"),
      api("/print-jobs"),
      api("/dashboard/today")
    ]);
    setSettings(settingsData);
    setMenu(menuData);
    setLayout(layoutData);
    setOrders(ordersData);
    setKitchenItems(kitchenItemsData);
    setPrintJobs(printJobsData);
    setDashboard(dashboardData);
    if (activeTab === "ops") await refreshOps();
  }

  async function loadProtectedData() {
    const [me, settingsData, menuData, layoutData, ordersData, kitchenItemsData, printJobsData, dashboardData, auditData] = await Promise.all([
      api("/auth/me"),
      api("/settings"),
      api("/menu"),
      api("/floor-layouts"),
      api("/orders"),
      api("/kitchen/items"),
      api("/print-jobs"),
      api("/dashboard/today"),
      api("/audit-logs")
    ]);
    setUser(me);
    setSettings(settingsData);
    setMenu(menuData);
    setLayout(layoutData);
    setOrders(ordersData);
    setKitchenItems(kitchenItemsData);
    setPrintJobs(printJobsData);
    setDashboard(dashboardData);
    setAuditLogs(auditData);
    refreshOps().catch(() => {});
  }

  async function refreshOps() {
    const [healthData, backupData] = await Promise.all([
      api("/ops/health"),
      api("/ops/backups")
    ]);
    setOpsHealth(healthData);
    setBackups(backupData);
  }

  async function run(action, successText) {
    setNotice("");
    try {
      await action();
      if (successText) setNotice(successText);
    } catch (error) {
      setNotice(error.message);
    }
  }

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    loadProtectedData().catch(() => setUser(null));
    const socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws`);
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
      socket.close();
    };
  }, [user?.id]);

  if (!user) {
    return <AdminLogin onLogin={async (nextUser) => {
      setUser(nextUser);
      await loadProtectedData();
    }} />;
  }

  return (
    <main>
      <aside className="sidebar">
        <div className="brand">
          <CircleDollarSign size={24} />
          <span>QYPOS</span>
        </div>
        <nav>
          {tabs.map(([id, Icon, label]) => (
            <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)} title={label}>
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{tabs.find(([id]) => id === activeTab)?.[2]}</h1>
            <p>{settings ? `${settings.currency} · Tax ${(Number(settings.tax_rate) * 100).toFixed(1)}% · Service ${(Number(settings.service_charge_rate) * 100).toFixed(1)}%` : "Loading"}</p>
          </div>
          <div className="top-actions">
            <span className="user-chip"><User size={16} />{user.name} · {user.role}</span>
            <a className="link-button" href="/">点餐前台</a>
            <button onClick={refresh} title="刷新">
              <Save size={18} />
              <span>刷新</span>
            </button>
            <button onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              window.localStorage.removeItem("qypos_token");
              setUser(null);
            }} title="退出">
              <LogOut size={18} />
              <span>退出</span>
            </button>
          </div>
        </header>

        {!online && <div className="offline-banner"><WifiOff size={16} />当前离线，部分操作会失败，请检查网络或本地服务。</div>}
        {notice && <button className="notice toast" onClick={() => setNotice("")}>{notice}</button>}
        {activeTab === "orders" && <OrdersView orders={orders} locale={locale} currency={currency} />}
        {activeTab === "kitchen" && <KitchenView items={kitchenItems} locale={locale} onStatus={async (item, status) => run(async () => {
          await api(`/orders/${item.order_id}/items/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
          await refresh();
        }, "厨房状态已更新")} />}
        {activeTab === "prints" && <PrintJobsView jobs={printJobs} locale={locale} onRetry={async (job) => run(async () => {
          await api(`/print-jobs/${job.id}/retry`, { method: "POST" });
          await refresh();
        }, "打印任务已重新入队")} />}
        {activeTab === "menu" && <MenuAdmin menu={menu} locale={locale} currency={currency} onSaved={refresh} />}
        {activeTab === "dashboard" && <Dashboard dashboard={dashboard} report={report} setReport={setReport} auditLogs={auditLogs} locale={locale} currency={currency} />}
        {activeTab === "settings" && settings && <SettingsView settings={settings} setSettings={setSettings} layout={layout} onSaved={refresh} />}
        {activeTab === "ops" && settings && <OpsView health={opsHealth} backups={backups} settings={settings} setSettings={setSettings} locale={locale} onRefresh={refreshOps} onSaved={async () => { await refresh(); await refreshOps(); }} />}
      </section>
    </main>
  );
}

function OrdersView({ orders, locale, currency }) {
  return (
    <section className="wide-list">
      {orders.map((order) => (
        <div className="list-row" key={order.id}>
          <span>{order.order_no}</span>
          <span>{order.service_type === "dine_in" ? "堂食" : "外带"}</span>
          <span>{order.status}</span>
          <strong>{money(order.total, currency, locale)}</strong>
        </div>
      ))}
    </section>
  );
}

function KitchenView({ items, locale, onStatus }) {
  const statusLabels = {
    ordered: "待制作",
    preparing: "制作中",
    ready_to_serve: "待上菜",
    served: "已上菜",
    cancelled: "已取消"
  };

  return (
    <section className="kitchen-board">
      {items.map((item) => (
        <article className={`kitchen-ticket kitchen-${item.status}`} key={item.id}>
          <div className="ticket-head">
            <h2>{labelOf(item.name_i18n, locale)}</h2>
            <strong>x{item.quantity}</strong>
          </div>
          <p>{item.service_type === "dine_in" ? `桌台 ${item.table_label || "-"}` : `外带 ${item.pickup_no || "-"}`}</p>
          <p>{item.order_no} · {statusLabels[item.status] || item.status}</p>
          {item.notes && <small>{item.notes}</small>}
          <time>{new Date(item.created_at).toLocaleTimeString(locale)}</time>
          <div className="ticket-actions">
            <button onClick={() => onStatus(item, "preparing")} disabled={item.status === "preparing"}>制作中</button>
            <button onClick={() => onStatus(item, "ready_to_serve")} disabled={item.status === "ready_to_serve"}>待上菜</button>
            <button className="primary" onClick={() => onStatus(item, "served")}>已上菜</button>
          </div>
        </article>
      ))}
      {!items.length && <div className="empty">暂无待处理菜品</div>}
    </section>
  );
}

function PrintJobsView({ jobs, locale, onRetry }) {
  const statusLabels = {
    queued: "排队中",
    printing: "打印中",
    succeeded: "已完成",
    failed: "失败"
  };
  const typeLabels = {
    kitchen: "厨房单",
    receipt: "收银小票",
    test: "测试打印"
  };

  return (
    <section className="wide-list">
      {jobs.map((job) => (
        <div className="list-row print-row" key={job.id}>
          <span>{typeLabels[job.type] || job.type}</span>
          <span>{statusLabels[job.status] || job.status}</span>
          <span>{new Date(job.created_at).toLocaleString(locale)}</span>
          <span>{job.attempts} 次</span>
          {job.error ? <small className="print-error"><AlertCircle size={14} />{job.error}</small> : <small>-</small>}
          <button onClick={() => onRetry(job)} disabled={job.status === "queued" || job.status === "printing"}>
            <RefreshCw size={16} />
            <span>重试</span>
          </button>
        </div>
      ))}
      {!jobs.length && <div className="empty">暂无打印任务</div>}
    </section>
  );
}

function MenuAdmin({ menu, locale, currency, onSaved }) {
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [categoryZh, setCategoryZh] = useState("");
  const [categoryEn, setCategoryEn] = useState("");
  const [newItem, setNewItem] = useState({ nameZh: "", nameEn: "", price: "0", categoryId: "" });

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
    await api("/menu/items", {
      method: "POST",
      body: JSON.stringify({
        category_id: newItem.categoryId || selectedCatId || firstCatId,
        name_i18n: { "zh-CN": newItem.nameZh, "en-GB": newItem.nameEn || newItem.nameZh },
        variants: [{ name_i18n: { "zh-CN": "标准", "en-GB": "Standard" }, price: Number(newItem.price) }]
      })
    });
    setNewItem({ nameZh: "", nameEn: "", price: "0", categoryId: "" });
    setShowItemForm(false);
    await onSaved();
  }

  return (
    <div className="menu-split">
      <aside className="menu-sidebar">
        <div className="menu-sidebar-head">
          <span>分类管理</span>
          <button type="button" title="新建分类" onClick={() => setShowCatForm((v) => !v)}>
            <Plus size={14} />
          </button>
        </div>
        {showCatForm && (
          <form className="menu-cat-form" onSubmit={saveCategory}>
            <input placeholder="中文名" value={categoryZh} onChange={(e) => setCategoryZh(e.target.value)} required />
            <input placeholder="English" value={categoryEn} onChange={(e) => setCategoryEn(e.target.value)} />
            <div className="menu-cat-form-actions">
              <button className="primary" type="submit">保存</button>
              <button type="button" onClick={() => setShowCatForm(false)}>取消</button>
            </div>
          </form>
        )}
        <button
          type="button"
          className={`menu-sidebar-item${selectedCatId === null ? " active" : ""}`}
          onClick={() => setSelectedCatId(null)}
        >
          <span>全部</span>
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
                title="删除分类"
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
      </aside>

      <div className="menu-items-pane">
        <div className="menu-toolbar">
          <h2>
            {selectedCat ? labelOf(selectedCat.name_i18n, locale) : "全部菜品"}
            <span className="muted"> ({filteredItems.length})</span>
          </h2>
          <button type="button" onClick={() => setShowItemForm((v) => !v)}>
            <Plus size={16} /><span>新建菜品</span>
          </button>
        </div>
        {showItemForm && (
          <form className="form-panel menu-new-item-form" onSubmit={saveItem}>
            <div className="inline-editor">
              <label>分类
                <select
                  value={newItem.categoryId || selectedCatId || firstCatId || ""}
                  onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value })}
                >
                  {menu.categories.map((c) => <option key={c.id} value={c.id}>{labelOf(c.name_i18n, locale)}</option>)}
                </select>
              </label>
              <label>中文名<input value={newItem.nameZh} onChange={(e) => setNewItem({ ...newItem, nameZh: e.target.value })} required /></label>
              <label>English<input value={newItem.nameEn} onChange={(e) => setNewItem({ ...newItem, nameEn: e.target.value })} /></label>
              <label>标准价格<input type="number" step="0.01" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} /></label>
              <button className="primary" type="submit"><Plus size={16} /><span>保存</span></button>
              <button type="button" onClick={() => setShowItemForm(false)}>取消</button>
            </div>
          </form>
        )}
        <div className="menu-item-list">
          {filteredItems.map((item) => (
            <MenuItemRow
              key={item.id}
              item={item}
              categories={menu.categories}
              locale={locale}
              currency={currency}
              expanded={expandedItemId === item.id}
              onToggle={() => setExpandedItemId((id) => id === item.id ? null : item.id)}
              onSaved={onSaved}
            />
          ))}
          {!filteredItems.length && <div className="empty">暂无菜品</div>}
        </div>
      </div>
    </div>
  );
}

function MenuItemRow({ item, categories, locale, currency, expanded, onToggle, onSaved }) {
  const activeVariants = item.variants.filter((v) => v.active !== false);
  const priceSource = activeVariants.length ? activeVariants : item.variants;
  const prices = priceSource.map((v) => Number(v.price));
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 0;
  const priceLabel = !prices.length ? "-" : priceMin === priceMax
    ? money(priceMin, currency, locale)
    : `${money(priceMin, currency, locale)} – ${money(priceMax, currency, locale)}`;

  async function disableItem() {
    await api(`/menu/items/${item.id}`, { method: "DELETE" });
    await onSaved();
  }

  async function destroyItem() {
    if (!window.confirm(`永久删除"${labelOf(item.name_i18n, locale)}"？此操作无法恢复，历史订单记录将保留但不再关联该菜品。`)) return;
    try {
      await api(`/menu/items/${item.id}/destroy`, { method: "DELETE" });
      await onSaved();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className={`menu-item-row${expanded ? " expanded" : ""}${!item.active ? " inactive" : ""}`}>
      <div className="menu-item-row-head" onClick={onToggle}>
        <ChevronRight size={15} className={`expand-icon${expanded ? " rotated" : ""}`} />
        <span className="item-name">{labelOf(item.name_i18n, locale)}</span>
        <span className={`item-badge${item.active ? " badge-active" : " badge-inactive"}`}>
          {item.active ? "上架" : "下架"}
        </span>
        <span className="item-price muted">{priceLabel}</span>
        <span className="muted item-spec-count">{item.variants.length} 规格</span>
      </div>
      {expanded && (
        <div className="menu-item-row-body">
          <MenuItemEditor
            item={item}
            categories={categories}
            locale={locale}
            currency={currency}
            onSaved={onSaved}
            onDisable={disableItem}
            onDestroy={destroyItem}
          />
        </div>
      )}
    </div>
  );
}

function CategoryEditor({ category, locale, onSaved }) {
  const [draft, setDraft] = useState({
    zh: labelOf(category.name_i18n, "zh-CN"),
    en: labelOf(category.name_i18n, "en-GB"),
    sort_order: category.sort_order ?? 0,
    active: category.active
  });

  async function save() {
    await api(`/menu/categories/${category.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": draft.zh, "en-GB": draft.en || draft.zh },
        sort_order: Number(draft.sort_order),
        active: draft.active
      })
    });
    await onSaved();
  }

  return (
    <div className="cat-editor-panel">
      <p className="muted cat-editor-title">编辑分类</p>
      <label>中文<input value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} /></label>
      <label>English<input value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} /></label>
      <label>排序<input type="number" value={draft.sort_order} onChange={(event) => setDraft({ ...draft, sort_order: event.target.value })} /></label>
      <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />启用</label>
      <button className="primary" type="button" onClick={save}><Save size={16} /><span>保存分类</span></button>
    </div>
  );
}

function MenuItemEditor({ item, categories, locale, currency, onSaved, onDisable, onDestroy }) {
  const [draft, setDraft] = useState({
    zh: labelOf(item.name_i18n, "zh-CN"),
    en: labelOf(item.name_i18n, "en-GB"),
    category_id: item.category_id,
    kitchen_group: item.kitchen_group,
    active: item.active
  });
  const [variantDraft, setVariantDraft] = useState({ zh: "", en: "", price: "0" });
  const [groupDraft, setGroupDraft] = useState({ zh: "加料", en: "Extras", min: 0, max: 1 });

  async function saveItem() {
    await api(`/menu/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        category_id: draft.category_id,
        name_i18n: { "zh-CN": draft.zh, "en-GB": draft.en || draft.zh },
        kitchen_group: draft.kitchen_group,
        active: draft.active
      })
    });
    await onSaved();
  }

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
  }

  return (
    <div className={`menu-editor${item.active ? "" : " inactive"}`}>
      <div className="inline-editor item-main-editor">
        <label>中文<input value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} /></label>
        <label>English<input value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} /></label>
        <label>分类<select value={draft.category_id || ""} onChange={(event) => setDraft({ ...draft, category_id: event.target.value })}>
          {categories.map((category) => <option key={category.id} value={category.id}>{labelOf(category.name_i18n, locale)}</option>)}
        </select></label>
        <label>厨房分组<input value={draft.kitchen_group} onChange={(event) => setDraft({ ...draft, kitchen_group: event.target.value })} /></label>
        <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />上架</label>
        <button className="primary" type="button" onClick={saveItem}><Save size={16} /><span>保存菜品</span></button>
        <button type="button" onClick={onDisable}><Trash2 size={16} /><span>{item.active ? "下架" : "已下架"}</span></button>
        {!item.active && onDestroy && (
          <button type="button" className="danger" onClick={onDestroy}><Trash2 size={16} /><span>永久删除</span></button>
        )}
      </div>

      <div className="editor-subsection">
        <h3>规格价格</h3>
        <div className="item-sub-list">
          {item.variants.map((variant) => (
            <VariantEditor key={variant.id} item={item} variant={variant} locale={locale} currency={currency} onSaved={onSaved} />
          ))}
        </div>
        <form className="item-sub-add" onSubmit={addVariant}>
          <input className="sub-field" placeholder="规格名" value={variantDraft.zh} onChange={(event) => setVariantDraft({ ...variantDraft, zh: event.target.value })} required />
          <input className="sub-field" placeholder="English" value={variantDraft.en} onChange={(event) => setVariantDraft({ ...variantDraft, en: event.target.value })} />
          <input className="sub-field sub-field-price" type="number" step="0.01" placeholder="价格" value={variantDraft.price} onChange={(event) => setVariantDraft({ ...variantDraft, price: event.target.value })} />
          <button type="submit"><Plus size={14} /><span>添加规格</span></button>
        </form>
      </div>

      <div className="editor-subsection">
        <h3>小项 / 加料组</h3>
        {item.modifier_groups.map((group) => (
          <ModifierGroupEditor key={group.id} group={group} locale={locale} currency={currency} onSaved={onSaved} />
        ))}
        <form className="item-sub-add" onSubmit={addGroup}>
          <input className="sub-field" placeholder="组名" value={groupDraft.zh} onChange={(event) => setGroupDraft({ ...groupDraft, zh: event.target.value })} />
          <input className="sub-field" placeholder="English" value={groupDraft.en} onChange={(event) => setGroupDraft({ ...groupDraft, en: event.target.value })} />
          <label className="sub-num-label">最少<input className="sub-field sub-field-num" type="number" min="0" value={groupDraft.min} onChange={(event) => setGroupDraft({ ...groupDraft, min: event.target.value })} /></label>
          <label className="sub-num-label">最多<input className="sub-field sub-field-num" type="number" min="1" value={groupDraft.max} onChange={(event) => setGroupDraft({ ...groupDraft, max: event.target.value })} /></label>
          <button type="submit"><Plus size={14} /><span>添加小项组</span></button>
        </form>
      </div>
    </div>
  );
}

function VariantEditor({ item, variant, locale, currency, onSaved }) {
  const [draft, setDraft] = useState({
    zh: labelOf(variant.name_i18n, "zh-CN"),
    en: labelOf(variant.name_i18n, "en-GB"),
    price: variant.price,
    sort_order: variant.sort_order ?? 0,
    active: variant.active
  });

  async function save() {
    await api(`/menu/items/${item.id}/variants/${variant.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": draft.zh, "en-GB": draft.en || draft.zh },
        price: Number(draft.price),
        sort_order: Number(draft.sort_order),
        active: draft.active
      })
    });
    await onSaved();
  }

  return (
    <div className="item-sub-row">
      <input className="sub-field sub-field-name" placeholder="名称" value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} />
      <input className="sub-field sub-field-name" placeholder="English" value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} />
      <input className="sub-field sub-field-price" type="number" step="0.01" placeholder="价格" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
      <span className="sub-price-display muted">{money(draft.price, currency, locale)}</span>
      <label className="checkbox sub-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />启用</label>
      <button type="button" onClick={save}><Save size={14} /></button>
      <button type="button" onClick={async () => { await api(`/menu/items/${item.id}/variants/${variant.id}`, { method: "DELETE" }); await onSaved(); }}><Trash2 size={14} /></button>
    </div>
  );
}

function ModifierGroupEditor({ group, locale, currency, onSaved }) {
  const [draft, setDraft] = useState({
    zh: labelOf(group.name_i18n, "zh-CN"),
    en: labelOf(group.name_i18n, "en-GB"),
    min_select: group.min_select,
    max_select: group.max_select,
    active: group.active
  });
  const [modifierDraft, setModifierDraft] = useState({ zh: "", en: "", price: "0" });

  async function saveGroup() {
    await api(`/menu/modifier-groups/${group.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": draft.zh, "en-GB": draft.en || draft.zh },
        min_select: Number(draft.min_select),
        max_select: Number(draft.max_select),
        active: draft.active
      })
    });
    await onSaved();
  }

  async function addModifier(event) {
    event.preventDefault();
    await api(`/menu/modifier-groups/${group.id}/modifiers`, {
      method: "POST",
      body: JSON.stringify({
        name_i18n: { "zh-CN": modifierDraft.zh, "en-GB": modifierDraft.en || modifierDraft.zh },
        price_delta: Number(modifierDraft.price),
        sort_order: group.modifiers.length
      })
    });
    setModifierDraft({ zh: "", en: "", price: "0" });
    await onSaved();
  }

  return (
    <div className="modifier-group-editor">
      <div className="item-sub-group-head">
        <div className="item-sub-group-inputs">
          <input className="sub-field sub-field-name" placeholder="组名" value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} />
          <input className="sub-field sub-field-name" placeholder="English" value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} />
          <label className="sub-num-label">最少<input className="sub-field sub-field-num" type="number" min="0" value={draft.min_select} onChange={(event) => setDraft({ ...draft, min_select: event.target.value })} /></label>
          <label className="sub-num-label">最多<input className="sub-field sub-field-num" type="number" min="1" value={draft.max_select} onChange={(event) => setDraft({ ...draft, max_select: event.target.value })} /></label>
          <span className="muted sub-price-display">{Number(draft.min_select) > 0 ? "必选" : "可选"} · {Number(draft.max_select) === 1 ? "单选" : "多选"}</span>
          <label className="checkbox sub-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />启用</label>
        </div>
        <div className="item-sub-group-actions">
          <button type="button" onClick={saveGroup}><Save size={14} /><span>保存</span></button>
          <button type="button" onClick={async () => {
            if (!window.confirm(`停用加料组"${labelOf(group.name_i18n, locale)}"？所有选项也会同时停用。`)) return;
            await api(`/menu/modifier-groups/${group.id}`, { method: "DELETE" });
            await onSaved();
          }}><Trash2 size={14} /><span>停用组</span></button>
        </div>
      </div>
      <div className="item-sub-group-modifiers">
        {group.modifiers.map((modifier) => (
          <ModifierEditor key={modifier.id} modifier={modifier} locale={locale} currency={currency} onSaved={onSaved} />
        ))}
      </div>
      <form className="item-sub-add" onSubmit={addModifier}>
        <input className="sub-field" placeholder="选项名" value={modifierDraft.zh} onChange={(event) => setModifierDraft({ ...modifierDraft, zh: event.target.value })} required />
        <input className="sub-field" placeholder="English" value={modifierDraft.en} onChange={(event) => setModifierDraft({ ...modifierDraft, en: event.target.value })} />
        <input className="sub-field sub-field-price" type="number" step="0.01" placeholder="加价" value={modifierDraft.price} onChange={(event) => setModifierDraft({ ...modifierDraft, price: event.target.value })} />
        <button type="submit"><Plus size={14} /><span>添加选项</span></button>
      </form>
    </div>
  );
}

function ModifierEditor({ modifier, locale, currency, onSaved }) {
  const [draft, setDraft] = useState({
    zh: labelOf(modifier.name_i18n, "zh-CN"),
    en: labelOf(modifier.name_i18n, "en-GB"),
    price_delta: modifier.price_delta,
    active: modifier.active
  });

  async function save() {
    await api(`/menu/modifiers/${modifier.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": draft.zh, "en-GB": draft.en || draft.zh },
        price_delta: Number(draft.price_delta),
        active: draft.active
      })
    });
    await onSaved();
  }

  return (
    <div className="item-sub-row modifier-option">
      <input className="sub-field sub-field-name" placeholder="选项" value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} />
      <input className="sub-field sub-field-name" placeholder="English" value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} />
      <input className="sub-field sub-field-price" type="number" step="0.01" placeholder="加价" value={draft.price_delta} onChange={(event) => setDraft({ ...draft, price_delta: event.target.value })} />
      <span className="sub-price-display muted">{money(draft.price_delta, currency, locale)}</span>
      <label className="checkbox sub-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />启用</label>
      <button type="button" onClick={save}><Save size={14} /></button>
      <button type="button" onClick={async () => { await api(`/menu/modifiers/${modifier.id}`, { method: "DELETE" }); await onSaved(); }}><Trash2 size={14} /></button>
    </div>
  );
}

function Dashboard({ dashboard, report, setReport, auditLogs, locale, currency }) {
  const summary = dashboard?.summary || {};
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  async function loadReport(event) {
    event.preventDefault();
    setReport(await api(`/reports/sales?from=${from}&to=${to}`));
  }

  function exportUrl() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("qypos_token") : "";
    return `${API_URL}/reports/sales.csv?from=${from}&to=${to}&token=${token}`;
  }

  return (
    <div className="dashboard">
      {[
        ["营业额", summary.revenue],
        ["折扣", summary.discount],
        ["净销售额", summary.net_sales],
        ["Tax", summary.tax],
        ["服务费", summary.service_charge],
        ["客单价", summary.average_ticket]
      ].map(([label, value]) => (
        <section className="metric" key={label}>
          <span>{label}</span>
          <strong>{money(value, currency, locale)}</strong>
        </section>
      ))}
      <section className="wide-list dashboard-list">
        <h2>热销菜品</h2>
        {(dashboard?.hotItems || []).map((item) => (
          <div className="list-row" key={labelOf(item.name_i18n, locale)}>
            <span>{labelOf(item.name_i18n, locale)}</span>
            <span>{item.quantity}</span>
            <strong>{money(item.sales, currency, locale)}</strong>
          </div>
        ))}
      </section>
      <section className="panel dashboard-list">
        <div className="panel-title"><h2>历史报表</h2></div>
        <form className="report-toolbar" onSubmit={loadReport}>
          <label>开始日期<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>结束日期<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button className="primary" type="submit"><RefreshCw size={16} /><span>生成报表</span></button>
          <a className="link-button" href={exportUrl()}><FileDown size={16} /><span>导出 CSV</span></a>
        </form>
        {report && (
          <div className="report-grid">
            <section className="metric"><span>订单数</span><strong>{report.summary.orders}</strong></section>
            <section className="metric"><span>营业额</span><strong>{money(report.summary.revenue, currency, locale)}</strong></section>
            <section className="metric"><span>折扣</span><strong>{money(report.summary.discount, currency, locale)}</strong></section>
            <section className="metric"><span>Tax</span><strong>{money(report.summary.tax, currency, locale)}</strong></section>
            <section className="wide-list report-lines">
              {report.byDay.map((row) => (
                <div className="list-row" key={row.day}>
                  <span>{new Date(row.day).toLocaleDateString(locale)}</span>
                  <span>{row.orders} 单</span>
                  <strong>{money(row.revenue, currency, locale)}</strong>
                </div>
              ))}
            </section>
          </div>
        )}
      </section>
      <section className="wide-list dashboard-list">
        <h2>审计日志</h2>
        {(auditLogs || []).slice(0, 12).map((log) => (
          <div className="list-row audit-row" key={log.id}>
            <span>{log.action}</span>
            <span>{log.actor_name || "System"}</span>
            <span>{log.entity_type}</span>
            <small>{new Date(log.created_at).toLocaleString(locale)}</small>
          </div>
        ))}
      </section>
    </div>
  );
}

function OpsView({ health, backups, settings, setSettings, locale, onRefresh, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState(settings.printer_profiles || []);

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
    setProfiles((current) => current.map((profile) => profile.id === id ? { ...profile, ...patch } : profile));
  }

  function addProfile() {
    const id = `printer-${Date.now().toString().slice(-5)}`;
    setProfiles((current) => [...current, { id, name: "新打印机", role: "receipt", host: "192.168.1.100", port: 9100, enabled: true }]);
  }

  function removeProfile(id) {
    setProfiles((current) => current.filter((profile) => profile.id !== id));
  }

  function downloadUrl(name) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("qypos_token") : "";
    return `${API_URL}/ops/backups/${encodeURIComponent(name)}?token=${token}`;
  }

  return (
    <div className="ops-page">
      <section className="ops-grid">
        <article className="panel ops-card">
          <div className="panel-title"><Activity size={18} /><h2>健康检查</h2></div>
          <div className={`health-status ${health?.ok ? "ok" : "bad"}`}>
            {health?.ok ? "系统正常" : "需要检查"}
            <small>{health ? `${health.latency_ms}ms · uptime ${health.uptime_seconds}s` : "Loading"}</small>
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
          <button type="button" onClick={onRefresh}><RefreshCw size={16} /><span>刷新运维状态</span></button>
        </article>

        <article className="panel ops-card">
          <div className="panel-title"><HardDrive size={18} /><h2>数据库备份</h2></div>
          <form className="ops-form" onSubmit={saveOpsSettings}>
            <label className="checkbox"><input type="checkbox" checked={settings.backup_enabled} onChange={(event) => setSettings({ ...settings, backup_enabled: event.target.checked })} />启用自动备份</label>
            <label>备份间隔（小时）<input type="number" min="1" max="168" value={settings.backup_interval_hours || 24} onChange={(event) => setSettings({ ...settings, backup_interval_hours: Number(event.target.value) })} /></label>
            <div className="ops-actions">
              <button className="primary" type="submit"><Save size={16} /><span>保存计划</span></button>
              <button type="button" disabled={busy} onClick={() => run(async () => { await api("/ops/backups", { method: "POST" }); await onRefresh(); })}>
                <HardDrive size={16} /><span>{busy ? "备份中" : "立即备份"}</span>
              </button>
            </div>
          </form>
          <div className="backup-list">
            {backups.map((file) => (
              <div className="backup-row" key={file.name}>
                <span>{file.name}</span>
                <small>{(Number(file.size) / 1024).toFixed(1)} KB · {new Date(file.updated_at).toLocaleString(locale)}</small>
                <a className="link-button" href={downloadUrl(file.name)}><Download size={15} /><span>下载</span></a>
              </div>
            ))}
            {!backups.length && <div className="empty">暂无备份文件</div>}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-title split">
          <div className="inline-title"><Printer size={18} /><h2>多打印机配置</h2></div>
          <button type="button" onClick={addProfile}><Plus size={16} /><span>添加打印机</span></button>
        </div>
        <form className="printer-config" onSubmit={saveOpsSettings}>
          <div className="printer-route-row">
            <label>厨房单打印机
              <select value={settings.kitchen_printer_id || ""} onChange={(event) => setSettings({ ...settings, kitchen_printer_id: event.target.value })}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
            <label>账单打印机
              <select value={settings.receipt_printer_id || ""} onChange={(event) => setSettings({ ...settings, receipt_printer_id: event.target.value })}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
            <button className="primary" type="submit"><Save size={16} /><span>保存打印配置</span></button>
          </div>
          <div className="printer-profile-list">
            {profiles.map((profile) => (
              <div className="printer-profile-row" key={profile.id}>
                <label>名称<input value={profile.name} onChange={(event) => updateProfile(profile.id, { name: event.target.value })} /></label>
                <label>用途<select value={profile.role} onChange={(event) => updateProfile(profile.id, { role: event.target.value })}>
                  <option value="kitchen">厨房</option>
                  <option value="receipt">收银</option>
                  <option value="bar">吧台</option>
                </select></label>
                <label>IP 地址<input value={profile.host} onChange={(event) => updateProfile(profile.id, { host: event.target.value })} /></label>
                <label>端口<input type="number" min="1" max="65535" value={profile.port} onChange={(event) => updateProfile(profile.id, { port: Number(event.target.value) })} /></label>
                <label className="checkbox"><input type="checkbox" checked={profile.enabled !== false} onChange={(event) => updateProfile(profile.id, { enabled: event.target.checked })} />启用</label>
                <button type="button" onClick={() => run(async () => { await api("/print-jobs/test", { method: "POST", body: JSON.stringify({ printer_id: profile.id }) }); await onRefresh(); })}>测试</button>
                <button type="button" onClick={() => removeProfile(profile.id)}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}

const GRID_SIZE = 20;

function SettingsView({ settings, setSettings, layout, onSaved }) {
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

  async function save(event) {
    event.preventDefault();
    await api("/settings", { method: "PUT", body: JSON.stringify(settings) });
    await onSaved();
  }

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

  async function printTest() {
    await api("/print-jobs/test", { method: "POST" });
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
    <div className="settings-stack">
      <div className="settings-top">
        <form className="settings-form" onSubmit={save}>
          <div className="settings-section">
            <p className="settings-section-title">基本</p>
            <div className="settings-fields">
              <label>语言 / Locale<input value={settings.locale} onChange={(event) => setSettings({ ...settings, locale: event.target.value })} /></label>
              <label>结算币种<input value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })} /></label>
            </div>
          </div>
          <div className="settings-section">
            <p className="settings-section-title">税务 &amp; 费用</p>
            <div className="settings-fields">
              <label>税率<small className="label-hint">小数，0.08 = 8%</small><input type="number" step="0.001" value={settings.tax_rate} onChange={(event) => setSettings({ ...settings, tax_rate: Number(event.target.value) })} /></label>
              <label>服务费率<small className="label-hint">小数，0.10 = 10%</small><input type="number" step="0.001" value={settings.service_charge_rate} onChange={(event) => setSettings({ ...settings, service_charge_rate: Number(event.target.value) })} /></label>
            </div>
            <div className="settings-checkboxes">
              <label className="checkbox"><input type="checkbox" checked={settings.prices_include_tax} onChange={(event) => setSettings({ ...settings, prices_include_tax: event.target.checked })} />价格含税</label>
              <label className="checkbox"><input type="checkbox" checked={settings.show_tax_on_receipt} onChange={(event) => setSettings({ ...settings, show_tax_on_receipt: event.target.checked })} />小票显示税额</label>
            </div>
          </div>
          <div className="settings-section">
            <p className="settings-section-title">打印机 &amp; 小票</p>
            <div className="settings-fields">
              <label>打印机 IP<input value={settings.printer_host} onChange={(event) => setSettings({ ...settings, printer_host: event.target.value })} /></label>
              <label>小票页脚<input value={settings.receipt_footer} onChange={(event) => setSettings({ ...settings, receipt_footer: event.target.value })} /></label>
            </div>
          </div>
          <div className="settings-actions">
            <button className="primary" type="submit"><Save size={16} /><span>保存设置</span></button>
            <button type="button" onClick={printTest}><Printer size={16} /><span>打印测试</span></button>
          </div>
        </form>

      <section className="panel receipt-preview">
        <div className="panel-title"><ReceiptText size={18} /><h2>Receipt 预览</h2></div>
        <div className="receipt-paper">
          <strong>{settings.receipt_header || "QY Restaurant"}</strong>
          <span>Order: DEMO-001</span>
          <span>Table: A1</span>
          <hr />
          <span>2 x Beef Noodles</span>
          <span>1 x Lemon Tea</span>
          <hr />
          <span>Subtotal <b>{money(20, settings.currency, settings.locale)}</b></span>
          {settings.show_tax_on_receipt && <span>Tax <b>{money(4, settings.currency, settings.locale)}</b></span>}
          <span>Service <b>{money(3, settings.currency, settings.locale)}</b></span>
          <strong>Total {money(27, settings.currency, settings.locale)}</strong>
          <small>{settings.receipt_footer || "Thank you"}</small>
        </div>
      </section>
      </div>

      <section className="panel">
        <div className="panel-title"><Armchair size={18} /><h2>餐桌布局编辑</h2></div>
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
      </section>
    </div>
  );
}
