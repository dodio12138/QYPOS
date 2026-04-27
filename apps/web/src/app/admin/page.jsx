"use client";

import {
  Armchair,
  AlertCircle,
  BarChart3,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  Languages,
  Plus,
  Printer,
  RefreshCw,
  ReceiptText,
  Save,
  Settings,
  Trash2,
  Copy,
  FileDown,
  LogOut,
  User
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, API_URL, labelOf } from "../../lib/api";

const tabs = [
  ["orders", ClipboardList, "订单"],
  ["kitchen", ChefHat, "厨房"],
  ["prints", Printer, "打印"],
  ["menu", ReceiptText, "菜单"],
  ["dashboard", BarChart3, "看板"],
  ["settings", Settings, "设置"]
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
    loadProtectedData().catch(() => setUser(null));
    const socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws`);
    socket.onmessage = () => refresh().catch(() => {});
    return () => socket.close();
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
  const [categoryZh, setCategoryZh] = useState("");
  const [categoryEn, setCategoryEn] = useState("");
  const [newItem, setNewItem] = useState({ nameZh: "", nameEn: "", price: "0", categoryId: "" });
  const categoryId = menu.categories[0]?.id;

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
    await onSaved();
  }

  async function saveItem(event) {
    event.preventDefault();
    await api("/menu/items", {
      method: "POST",
      body: JSON.stringify({
        category_id: newItem.categoryId || categoryId,
        name_i18n: { "zh-CN": newItem.nameZh, "en-GB": newItem.nameEn || newItem.nameZh },
        variants: [{ name_i18n: { "zh-CN": "标准", "en-GB": "Standard" }, price: Number(newItem.price) }]
      })
    });
    setNewItem({ nameZh: "", nameEn: "", price: "0", categoryId: "" });
    await onSaved();
  }

  return (
    <div className="menu-admin">
      <section className="admin-grid">
        <form className="panel form-panel" onSubmit={saveCategory}>
          <h2>新建分类</h2>
          <label>中文名<input value={categoryZh} onChange={(event) => setCategoryZh(event.target.value)} required /></label>
          <label>English<input value={categoryEn} onChange={(event) => setCategoryEn(event.target.value)} /></label>
          <button className="primary" type="submit"><Plus size={18} /><span>保存分类</span></button>
        </form>
        <form className="panel form-panel" onSubmit={saveItem}>
          <h2>新建菜品</h2>
          <label>分类<select value={newItem.categoryId} onChange={(event) => setNewItem({ ...newItem, categoryId: event.target.value })}>
            {menu.categories.map((category) => <option key={category.id} value={category.id}>{labelOf(category.name_i18n, locale)}</option>)}
          </select></label>
          <label>中文名<input value={newItem.nameZh} onChange={(event) => setNewItem({ ...newItem, nameZh: event.target.value })} required /></label>
          <label>English<input value={newItem.nameEn} onChange={(event) => setNewItem({ ...newItem, nameEn: event.target.value })} /></label>
          <label>标准价格<input type="number" step="0.01" value={newItem.price} onChange={(event) => setNewItem({ ...newItem, price: event.target.value })} /></label>
          <button className="primary" type="submit" disabled={!categoryId && !newItem.categoryId}><Plus size={18} /><span>保存菜品</span></button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-title"><h2>分类管理</h2></div>
        <div className="inline-editor-list">
          {menu.categories.map((category) => (
            <CategoryEditor key={category.id} category={category} locale={locale} onSaved={onSaved} />
          ))}
        </div>
      </section>

      <section className="menu-editor-list">
        {menu.items.map((item) => (
          <MenuItemEditor key={item.id} item={item} categories={menu.categories} locale={locale} currency={currency} onSaved={onSaved} />
        ))}
      </section>
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
    <div className="inline-editor">
      <label>中文<input value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} /></label>
      <label>English<input value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} /></label>
      <label>排序<input type="number" value={draft.sort_order} onChange={(event) => setDraft({ ...draft, sort_order: event.target.value })} /></label>
      <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />启用</label>
      <button className="primary" type="button" onClick={save}><Save size={16} /><span>保存</span></button>
    </div>
  );
}

function MenuItemEditor({ item, categories, locale, currency, onSaved }) {
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
    <article className={`panel menu-editor ${item.active ? "" : "inactive"}`}>
      <div className="menu-editor-head">
        <h2>{labelOf(item.name_i18n, locale)}</h2>
        <span>{item.active ? "已上架" : "已下架"}</span>
      </div>
      <div className="inline-editor item-main-editor">
        <label>中文<input value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} /></label>
        <label>English<input value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} /></label>
        <label>分类<select value={draft.category_id || ""} onChange={(event) => setDraft({ ...draft, category_id: event.target.value })}>
          {categories.map((category) => <option key={category.id} value={category.id}>{labelOf(category.name_i18n, locale)}</option>)}
        </select></label>
        <label>厨房分组<input value={draft.kitchen_group} onChange={(event) => setDraft({ ...draft, kitchen_group: event.target.value })} /></label>
        <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />上架</label>
        <button className="primary" type="button" onClick={saveItem}><Save size={16} /><span>保存菜品</span></button>
        <button type="button" onClick={async () => { await api(`/menu/items/${item.id}`, { method: "DELETE" }); await onSaved(); }}><Trash2 size={16} /><span>下架</span></button>
      </div>

      <div className="editor-subsection">
        <h3>规格价格</h3>
        {item.variants.map((variant) => (
          <VariantEditor key={variant.id} item={item} variant={variant} locale={locale} currency={currency} onSaved={onSaved} />
        ))}
        <form className="inline-editor compact-form" onSubmit={addVariant}>
          <label>规格<input value={variantDraft.zh} onChange={(event) => setVariantDraft({ ...variantDraft, zh: event.target.value })} required /></label>
          <label>English<input value={variantDraft.en} onChange={(event) => setVariantDraft({ ...variantDraft, en: event.target.value })} /></label>
          <label>价格<input type="number" step="0.01" value={variantDraft.price} onChange={(event) => setVariantDraft({ ...variantDraft, price: event.target.value })} /></label>
          <button type="submit"><Plus size={16} /><span>添加规格</span></button>
        </form>
      </div>

      <div className="editor-subsection">
        <h3>小项 / 加料组</h3>
        {item.modifier_groups.map((group) => (
          <ModifierGroupEditor key={group.id} group={group} locale={locale} currency={currency} onSaved={onSaved} />
        ))}
        <form className="inline-editor compact-form" onSubmit={addGroup}>
          <label>组名<input value={groupDraft.zh} onChange={(event) => setGroupDraft({ ...groupDraft, zh: event.target.value })} /></label>
          <label>English<input value={groupDraft.en} onChange={(event) => setGroupDraft({ ...groupDraft, en: event.target.value })} /></label>
          <label>最少<input type="number" min="0" value={groupDraft.min} onChange={(event) => setGroupDraft({ ...groupDraft, min: event.target.value })} /></label>
          <label>最多<input type="number" min="1" value={groupDraft.max} onChange={(event) => setGroupDraft({ ...groupDraft, max: event.target.value })} /></label>
          <button type="submit"><Plus size={16} /><span>添加小项组</span></button>
        </form>
      </div>
    </article>
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
    <div className="inline-editor nested-editor">
      <label>名称<input value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} /></label>
      <label>English<input value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} /></label>
      <label>价格<input type="number" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} /></label>
      <span className="muted">{money(draft.price, currency, locale)}</span>
      <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />启用</label>
      <button type="button" onClick={save}><Save size={16} /><span>保存</span></button>
      <button type="button" onClick={async () => { await api(`/menu/items/${item.id}/variants/${variant.id}`, { method: "DELETE" }); await onSaved(); }}><Trash2 size={16} /><span>停用</span></button>
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
      <div className="inline-editor nested-editor">
        <label>组名<input value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} /></label>
        <label>English<input value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} /></label>
        <label>最少<input type="number" min="0" value={draft.min_select} onChange={(event) => setDraft({ ...draft, min_select: event.target.value })} /></label>
        <label>最多<input type="number" min="1" value={draft.max_select} onChange={(event) => setDraft({ ...draft, max_select: event.target.value })} /></label>
        <span className="muted">{Number(draft.min_select) > 0 ? "必选" : "可选"} · {Number(draft.max_select) === 1 ? "单选" : "多选"}</span>
        <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />启用</label>
        <button type="button" onClick={saveGroup}><Save size={16} /><span>保存</span></button>
      </div>
      {group.modifiers.map((modifier) => (
        <ModifierEditor key={modifier.id} modifier={modifier} locale={locale} currency={currency} onSaved={onSaved} />
      ))}
      <form className="inline-editor compact-form" onSubmit={addModifier}>
        <label>选项<input value={modifierDraft.zh} onChange={(event) => setModifierDraft({ ...modifierDraft, zh: event.target.value })} required /></label>
        <label>English<input value={modifierDraft.en} onChange={(event) => setModifierDraft({ ...modifierDraft, en: event.target.value })} /></label>
        <label>加价<input type="number" step="0.01" value={modifierDraft.price} onChange={(event) => setModifierDraft({ ...modifierDraft, price: event.target.value })} /></label>
        <button type="submit"><Plus size={16} /><span>添加选项</span></button>
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
    <div className="inline-editor nested-editor modifier-option">
      <label>选项<input value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} /></label>
      <label>English<input value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} /></label>
      <label>加价<input type="number" step="0.01" value={draft.price_delta} onChange={(event) => setDraft({ ...draft, price_delta: event.target.value })} /></label>
      <span className="muted">{money(draft.price_delta, currency, locale)}</span>
      <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />启用</label>
      <button type="button" onClick={save}><Save size={16} /><span>保存</span></button>
      <button type="button" onClick={async () => { await api(`/menu/modifiers/${modifier.id}`, { method: "DELETE" }); await onSaved(); }}><Trash2 size={16} /><span>停用</span></button>
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

function SettingsView({ settings, setSettings, layout, onSaved }) {
  const [draftLayout, setDraftLayout] = useState(layout);
  const [dragging, setDragging] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [visibleAreaId, setVisibleAreaId] = useState(layout.areas[0]?.id || "");
  const [newAreaName, setNewAreaName] = useState("");

  useEffect(() => {
    setDraftLayout(layout);
    setVisibleAreaId((current) => layout.areas.some((area) => area.id === current) ? current : layout.areas[0]?.id || "");
    setSelectedTableId((current) => current || layout.tables[0]?.id || null);
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
    await onSaved();
  }

  function moveTable(id, dx, dy) {
    if (!editMode) return;
    setDraftLayout((current) => ({
      ...current,
      tables: current.tables.map((table) => (table.id || table._client_id) === id ? { ...table, x: Math.max(0, Number(table.x) + dx), y: Math.max(0, Number(table.y) + dy) } : table)
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

  return (
    <div className="settings-stack">
      <form className="settings-form" onSubmit={save}>
        <label><Languages size={16} />语言<input value={settings.locale} onChange={(event) => setSettings({ ...settings, locale: event.target.value })} /></label>
        <label>币种<input value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })} /></label>
        <label>Tax Rate<input type="number" step="0.001" value={settings.tax_rate} onChange={(event) => setSettings({ ...settings, tax_rate: Number(event.target.value) })} /></label>
        <label>Service Rate<input type="number" step="0.001" value={settings.service_charge_rate} onChange={(event) => setSettings({ ...settings, service_charge_rate: Number(event.target.value) })} /></label>
        <label>打印机 IP<input value={settings.printer_host} onChange={(event) => setSettings({ ...settings, printer_host: event.target.value })} /></label>
        <label>小票页脚<input value={settings.receipt_footer} onChange={(event) => setSettings({ ...settings, receipt_footer: event.target.value })} /></label>
        <label className="checkbox"><input type="checkbox" checked={settings.prices_include_tax} onChange={(event) => setSettings({ ...settings, prices_include_tax: event.target.checked })} />价格含税</label>
        <label className="checkbox"><input type="checkbox" checked={settings.show_tax_on_receipt} onChange={(event) => setSettings({ ...settings, show_tax_on_receipt: event.target.checked })} />小票显示 Tax</label>
        <button className="primary" type="submit"><Save size={18} /><span>保存设置</span></button>
        <button type="button" onClick={printTest}><Printer size={18} /><span>打印测试</span></button>
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
          <button onClick={addTable} type="button"><Plus size={18} /><span>添加桌台</span></button>
          <button className="primary" onClick={saveLayout} type="button"><Save size={18} /><span>保存布局</span></button>
        </div>
        <div className="layout-editor-grid">
          <div
            className={`floor-canvas editor ${editMode ? "is-editing" : ""}`}
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
