"use client";

import {
  Armchair,
  Check,
  ChevronLeft,
  CircleDollarSign,
  ClipboardList,
  Coins,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  TabletSmartphone,
  Loader2,
  LogOut,
  Trash2,
  Users,
  Utensils,
  UserRound,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, API_URL, labelOf } from "../lib/api";
import qyposLogo from "../pic/logo.png";

const statusText = {
  "zh-CN": {
    available: "空桌",
    opened: "已下单",
    ordered: "已下单",
    preparing: "制作中",
    ready_to_serve: "待上菜",
    partially_served: "部分上菜",
    pending_payment: "待支付",
    needs_cleaning: "需清台"
  },
  "en-GB": {
    available: "Available",
    opened: "Ordered",
    ordered: "Ordered",
    preparing: "Preparing",
    ready_to_serve: "Ready to serve",
    partially_served: "Partially served",
    pending_payment: "Pending payment",
    needs_cleaning: "Needs cleaning"
  }
};

const UI_COPY = {
  "zh-CN": {
    posTitle: "点餐前台",
    adminLink: "后台",
    refresh: "刷新",
    refreshing: "刷新中",
    takeaway: "外带",
    tabletMode: "平板模式",
    desktopMode: "桌面模式",
    logout: "退出",
    language: "中文"
  },
  "en-GB": {
    posTitle: "POS",
    adminLink: "Admin",
    refresh: "Refresh",
    refreshing: "Refreshing",
    takeaway: "Takeaway",
    tabletMode: "Tablet mode",
    desktopMode: "Desktop mode",
    logout: "Sign out",
    language: "English"
  }
};

function text(locale, zh, en) {
  return locale === "en-GB" ? en : zh;
}

function statusLabel(status, locale) {
  return statusText[locale]?.[status] || status;
}

function money(value, currency = "CNY", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value || 0));
}

function aggregateModifiers(modifiers = []) {
  const grouped = new Map();
  for (const modifier of modifiers) {
    const key = modifier.modifier_id || `${JSON.stringify(modifier.name_i18n)}:${modifier.price_delta}`;
    const current = grouped.get(key);
    if (current) current.count += 1;
    else grouped.set(key, { ...modifier, count: 1 });
  }
  return [...grouped.values()];
}

export default function PosPage() {
  const [settings, setSettings] = useState(null);
  const [paymentProviders, setPaymentProviders] = useState({ manual: { configured: true }, dojo: { configured: false } });
  const [menu, setMenu] = useState({ categories: [], items: [] });
  const [layout, setLayout] = useState({ areas: [], tables: [] });
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [pickerItem, setPickerItem] = useState(null);
  const [editingOrderItem, setEditingOrderItem] = useState(null); // { orderItem, menuItem }
  const [customOpen, setCustomOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [splitting, setSplitting] = useState(false); // 'items' | 'even' | false
  const [tableAction, setTableAction] = useState(null);
  const [confirmTakeaway, setConfirmTakeaway] = useState(false);
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(true);
  const [apiOnline, setApiOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyTableId, setBusyTableId] = useState(null);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [pendingDiscount, setPendingDiscount] = useState(null);
  const [mobileStep, setMobileStep] = useState("tables");
  const [mobileStepHistory, setMobileStepHistory] = useState([]);
  const [tabletMode, setTabletMode] = useState(false);
  const kitchenPrintRef = useRef(true);

  const locale = settings?.locale || "zh-CN";
  const currency = settings?.currency || "CNY";
  const copy = UI_COPY[locale] || UI_COPY["zh-CN"];

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale.startsWith("en") ? "en" : "zh-CN";
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return menu.items.filter((item) => {
      if (!item.active) return false;
      if (selectedCategory !== "all" && item.category_id !== selectedCategory) return false;
      if (!needle) return true;
      return `${labelOf(item.name_i18n, locale)} ${labelOf(item.description_i18n, locale)}`.toLowerCase().includes(needle);
    });
  }, [menu.items, selectedCategory, search, locale]);

  async function refresh(keepOrder = true) {
    const [settingsData, menuData, layoutData, ordersData, providersData] = await Promise.all([
      api("/settings"),
      api("/menu"),
      api("/floor-layouts"),
      api("/orders"),
      api("/payment-providers")
    ]);
    setSettings(settingsData);
    setMenu(menuData);
    setLayout(layoutData);
    setOrders(ordersData);
    setPaymentProviders(providersData);
    if (keepOrder && selectedOrder?.id) {
      setSelectedOrder(await api(`/orders/${selectedOrder.id}`));
    }
  }

  async function checkApiHealth() {
    try {
      await api("/health");
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
  }

  async function run(action, successText) {
    setBusy(true);
    setNotice("");
    try {
      await action();
      if (successText) setNotice(successText);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function manualRefresh() {
    setRefreshing(true);
    setNotice("");
    try {
      await refresh();
      setNotice(text(locale, "已刷新", "Refreshed"));
    } catch (error) {
      setNotice(error.message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    window.sessionStorage.removeItem("qypos_admin_grant");
    setTabletMode(window.localStorage.getItem("qypos_tablet_mode") === "1");
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    api("/auth/me")
      .then((me) => {
        setUser(me);
        return refresh(false);
      })
      .catch(() => {
        window.localStorage.removeItem("qypos_token");
        setUser(null);
      })
      .finally(() => setAuthChecked(true));
    checkApiHealth();
    const healthTimer = window.setInterval(checkApiHealth, 15000);
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const apiPort = process.env.NEXT_PUBLIC_API_PORT || "4000";
    const socket = new WebSocket(`${wsProtocol}//${window.location.hostname}:${apiPort}/ws`);
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if ((msg.event ?? "").startsWith("kitchen.")) return;
      } catch {
        // ignore parse errors
      }
      refresh().catch(() => {});
    };
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(healthTimer);
      socket.close();
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function toggleTabletMode() {
    setTabletMode((current) => {
      const next = !current;
      window.localStorage.setItem("qypos_tablet_mode", next ? "1" : "0");
      return next;
    });
  }

  async function login(credentials) {
    await run(async () => {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials)
      });
      window.localStorage.setItem("qypos_token", result.token);
      setUser(result.user);
      await refresh(false);
    }, text(locale, "已登录前台", "Signed in to POS"));
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    window.localStorage.removeItem("qypos_token");
    setUser(null);
    setSelectedOrder(null);
  }

  async function openTable(table) {
    setBusyTableId(table.id);
    await run(async () => {
      const order = await api(`/tables/${table.id}/open`, { method: "POST", body: JSON.stringify({ guests: table.seats }) });
      setSelectedOrder(await api(`/orders/${order.id}`));
      navigateMobileStep("menu");
      setNotice(text(locale, `${table.label} 已选中`, `${table.label} selected`));
      await refresh(false);
    });
    setBusyTableId(null);
    setTableAction(null);
  }

  async function clearTable(table) {
    setBusyTableId(table.id);
    await run(async () => {
      await api(`/tables/${table.id}/clear`, { method: "POST" });
      if (selectedOrder?.table_id === table.id) setSelectedOrder(null);
      navigateMobileStep("tables");
      setNotice(text(locale, `${table.label} 已清台`, `${table.label} cleared`));
      await refresh(false);
    });
    setBusyTableId(null);
    setTableAction(null);
  }

  async function createTakeaway() {
    await run(async () => {
      const order = await api("/orders", {
        method: "POST",
        body: JSON.stringify({ service_type: "takeaway", pickup_no: `T${Math.floor(Math.random() * 900 + 100)}` })
      });
      setSelectedOrder(await api(`/orders/${order.id}`));
      navigateMobileStep("menu");
      await refresh(false);
    }, text(locale, "外带订单已创建", "Takeaway order created"));
    setConfirmTakeaway(false);
  }

  async function addConfiguredItem({ variantId, modifierIds, quantity, notes }) {
    if (!selectedOrder) {
      setNotice(text(locale, "请先选择餐桌或创建外带订单", "Select a table or create a takeaway order first"));
      return;
    }
    await run(async () => {
      const updated = await api(`/orders/${selectedOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ add_item: { variant_id: variantId, modifier_ids: modifierIds, quantity, notes } })
      });
      setSelectedOrder(await api(`/orders/${updated.id}`));
      setPickerItem(null);
      navigateMobileStep("menu");
      await refresh(false);
    }, text(locale, "已加入订单", "Added to order"));
  }

  async function replaceOrderItem(oldOrderItem, { variantId, modifierIds, quantity, notes }) {
    if (!selectedOrder) return;
    await run(async () => {
      // Try to update the existing order item in place to preserve ordering
      const updated = await api(`/orders/${selectedOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ update_item: { id: oldOrderItem.id, variant_id: variantId, modifier_ids: modifierIds, quantity, notes } })
      });
      // Fallback: if API returns no updated id, refresh anyway
      if (updated && updated.id) {
        setSelectedOrder(await api(`/orders/${updated.id}`));
      } else {
        setSelectedOrder(await api(`/orders/${selectedOrder.id}`));
      }
      setEditingOrderItem(null);
      await refresh(false);
    }, text(locale, "已更新菜品", "Item updated"));
  }

  function openEditForOrderItem(orderItem) {
    if (!orderItem.item_id) return; // custom item, can't reopen menu modal
    const menuItem = (menu.items || []).find((mi) => mi.id === orderItem.item_id);
    if (!menuItem) return;
    setEditingOrderItem({ orderItem, menuItem });
  }

  async function addCustomItem({ name, price, quantity, notes }) {
    if (!selectedOrder) {
      setNotice(text(locale, "请先选择餐桌或创建外带订单", "Select a table or create a takeaway order first"));
      return;
    }
    await run(async () => {
      const updated = await api(`/orders/${selectedOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ add_item: { custom: { name, price }, quantity, notes } })
      });
      setSelectedOrder(await api(`/orders/${updated.id}`));
      setCustomOpen(false);
      navigateMobileStep("menu");
      await refresh(false);
    }, text(locale, "杂项已加入订单", "Misc charge added to order"));
  }

  function navigateMobileStep(step) {
    setMobileStep((current) => {
      if (current === step) return current;
      setMobileStepHistory((history) => [...history.slice(-4), current]);
      return step;
    });
  }

  function backMobileStep() {
    setMobileStepHistory((history) => {
      const previous = history.at(-1);
      if (previous) {
        setMobileStep(previous);
        return history.slice(0, -1);
      }
      setMobileStep((current) => current === "order" ? "menu" : "tables");
      return history;
    });
  }

  async function updateItem(item, quantity, options = {}) {
    if (!selectedOrder) return;
    await run(async () => {
      const payload = { id: item.id, quantity, ...options };
      const updated = await api(`/orders/${selectedOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ update_item: payload })
      });
      setSelectedOrder(await api(`/orders/${updated.id}`));
      await refresh(false);
    });
  }

  async function updateItemNotes(item, notes) {
    if (!selectedOrder) return;
    await run(async () => {
      const updated = await api(`/orders/${selectedOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ update_item: { id: item.id, quantity: Number(item.quantity), notes } })
      });
      setSelectedOrder(await api(`/orders/${updated.id}`));
      await refresh(false);
    }, text(locale, "备注已保存", "Notes saved"));
  }

  async function saveOrderNotes(notes) {
    if (!selectedOrder) return;
    await run(async () => {
      const updated = await api(`/orders/${selectedOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes })
      });
      setSelectedOrder(await api(`/orders/${updated.id}`));
    }, text(locale, "备注已保存", "Notes saved"));
  }

  async function submitOrder() {
    if (!selectedOrder) return;
    if (!(selectedOrder.items || []).length) {
      setNotice(text(locale, "订单没有菜品，无法提交", "This order has no items and cannot be submitted"));
      return;
    }
    kitchenPrintRef.current = true;
    setConfirmAction({
      title: text(locale, "厨房下单", "Send to kitchen"),
      message: text(locale, "确认下单？新菜品将发送到厨房。", "Submit this order? New items will be sent to the kitchen."),
      confirmLabel: text(locale, "确认下单", "Submit"),
      icon: <Printer size={22} />,
      extra: (
        <label className="modal-print-toggle">
          <input
            type="checkbox"
            defaultChecked
            onChange={(e) => { kitchenPrintRef.current = e.target.checked; }}
          />
          {text(locale, "发送后厨打印", "Print to kitchen")}
        </label>
      ),
      onConfirm: async () => {
        const shouldPrint = kitchenPrintRef.current;
        await run(async () => {
          await api(`/orders/${selectedOrder.id}/submit`, {
            method: "POST",
            body: JSON.stringify({ print: shouldPrint })
          });
          setSelectedOrder(await api(`/orders/${selectedOrder.id}`));
          await refresh(false);
        }, shouldPrint ? text(locale, "已下单，厨打已发送", "Submitted, kitchen print sent") : text(locale, "已下单", "Submitted"));
        setConfirmAction(null);
      }
    });
  }

  async function printBill() {
    if (!selectedOrder) return;
    setConfirmAction({
      title: text(locale, "账单打印", "Print bill"),
      message: text(locale, "确认打印当前账单？这不会完成收款。", "Print the current bill? This will not complete payment."),
      confirmLabel: text(locale, "打印账单", "Print bill"),
      icon: <ClipboardList size={22} />,
      onConfirm: async () => {
        await run(async () => {
          await api(`/orders/${selectedOrder.id}/print`, { method: "POST", body: JSON.stringify({ type: "receipt" }) });
          await refresh(false);
        }, text(locale, "已发送账单打印", "Bill print sent"));
        setConfirmAction(null);
      }
    });
  }

  async function payOrder(payment) {
    if (!selectedOrder) return;
    await run(async () => {
      await api(`/orders/${selectedOrder.id}/payments`, {
        method: "POST",
        body: JSON.stringify(payment)
      });
      // Auto-open cash drawer when paying with cash
      if (payment.method === "cash") {
        try { await api("/print-jobs/cash-drawer", { method: "POST" }); } catch { /* drawer is optional */ }
      }
      setSelectedOrder(null);
      setPaying(false);
      navigateMobileStep("tables");
      await refresh(false);
    }, text(locale, "已收款", "Payment received"));
  }

  async function payOrderPartial(payment) {
    if (!selectedOrder) return null;
    let result = null;
    await run(async () => {
      result = await api(`/orders/${selectedOrder.id}/payments`, {
        method: "POST",
        body: JSON.stringify(payment)
      });
      setSelectedOrder(await api(`/orders/${result.order.id}`));
      await refresh(false);
    }, text(locale, `已收 ${money(payment.amount, currency, locale)}`, `Received ${money(payment.amount, currency, locale)}`));
    return result;
  }

  async function finishDojoPayment(result) {
    setNotice(text(locale, "Dojo 刷卡成功", "Dojo payment succeeded"));
    setPaying(false);
    setSelectedOrder(null);
    navigateMobileStep("tables");
    await refresh(false);
  }

  async function splitOrderByItems(splits) {
    if (!selectedOrder) return;
    await run(async () => {
      await api(`/orders/${selectedOrder.id}/split`, {
        method: "POST",
        body: JSON.stringify({ splits })
      });
      setSplitting(false);
      setSelectedOrder(null);
      navigateMobileStep("tables");
      await refresh(false);
    }, text(locale, "分单完成", "Split completed"));
  }

  async function mergeOrder() {
    if (!selectedOrder) return;
    await run(async () => {
      const merged = await api(`/orders/${selectedOrder.id}/merge`, { method: "POST" });
      setSelectedOrder(await api(`/orders/${merged.id}`));
      await refresh(false);
    }, text(locale, "已合单", "Merged"));
  }

  async function adjustServiceCharge(patch) {
    if (!selectedOrder) return;
    await run(async () => {
      const updated = await api(`/orders/${selectedOrder.id}/service-charge`, {
        method: "POST",
        body: JSON.stringify(patch)
      });
      setSelectedOrder(await api(`/orders/${updated.id}`));
      await refresh(false);
    }, text(locale, "服务费已更新", "Service charge updated"));
  }

  async function applyDiscount(patch) {
    if (!selectedOrder) return;
    const updated = await api(`/orders/${selectedOrder.id}/discount`, {
      method: "POST",
      body: JSON.stringify(patch)
    });
    setSelectedOrder(await api(`/orders/${updated.id}`));
    await refresh(false);
    setNotice(text(locale, "折扣已更新", "Discount updated"));
  }

  async function cancelOrder(reason) {
    if (!selectedOrder) return;
    setConfirmAction({
      title: text(locale, "取消订单", "Cancel order"),
      message: text(locale, "确认取消当前订单？取消后会释放关联桌台。", "Cancel this order? The linked table will be released."),
      confirmLabel: text(locale, "取消订单", "Cancel order"),
      icon: <Trash2 size={22} />,
      onConfirm: async () => {
        await run(async () => {
          await api(`/orders/${selectedOrder.id}/cancel`, {
            method: "POST",
            body: JSON.stringify({ reason })
          });
          setSelectedOrder(null);
          navigateMobileStep("tables");
          await refresh(false);
        }, text(locale, "订单已取消", "Order cancelled"));
        setConfirmAction(null);
      }
    });
  }

  if (!authChecked) {
    return (
      <main className="pos-shell">
        <div className="center-state"><Loader2 className="spin" size={24} /> {text(locale, "正在检查登录状态", "Checking sign-in status")}</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="pos-shell">
        <PosLogin notice={notice} online={online} apiOnline={apiOnline} busy={busy} locale={locale} onLogin={login} />
      </main>
    );
  }

  return (
    <main className={`pos-shell ${tabletMode ? "tablet-mode" : ""}`}>
      <header className="pos-header">
        <div className="brand compact">
          <img className="brand-logo" src={qyposLogo.src} alt="QYPOS" />
          <span>QYPOS</span>
        </div>
        <div className="mode-pill">
          <Utensils size={18} />
          <span>{copy.posTitle}</span>
        </div>
        <div className="top-actions">
          <span className="user-chip"><UserRound size={16} />{user.name}</span>
          <a className="link-button" href="/admin">{copy.adminLink}</a>
          <button className={refreshing ? "is-refreshing" : ""} onClick={manualRefresh} disabled={busy || refreshing} title={copy.refresh}>
            <RefreshCw className={refreshing ? "spin" : ""} size={18} />
            <span>{refreshing ? copy.refreshing : copy.refresh}</span>
          </button>
          <button onClick={() => setConfirmTakeaway(true)} disabled={busy} title={copy.takeaway}>
            <ShoppingBag size={18} />
            <span>{copy.takeaway}</span>
          </button>
          <button
            className={tabletMode ? "selected" : ""}
            onClick={toggleTabletMode}
            disabled={busy}
            aria-pressed={tabletMode}
            title={tabletMode ? copy.desktopMode : copy.tabletMode}
          >
            <TabletSmartphone size={18} />
            <span>{tabletMode ? copy.desktopMode : copy.tabletMode}</span>
          </button>
          <button onClick={logout} disabled={busy} title={copy.logout}>
            <LogOut size={18} />
            <span>{copy.logout}</span>
          </button>
        </div>
      </header>

      {!online && <div className="offline-banner pos-offline"><WifiOff size={16} />{text(locale, "当前离线，点单、打印和收款可能无法同步。", "You're offline. Ordering, printing, and payment may not sync.")}</div>}
      {online && !apiOnline && <div className="offline-banner pos-offline"><WifiOff size={16} />{text(locale, "本地 API 暂不可用，请检查 Docker 服务。", "The local API is unavailable. Check the Docker service.")}</div>}
      {notice && <button className="notice toast" onClick={() => setNotice("")}>{notice}</button>}

      <MobileWorkflow
        step={mobileStep}
        order={selectedOrder}
        tables={layout.tables}
        locale={locale}
        currency={currency}
        onBack={backMobileStep}
        onStep={navigateMobileStep}
      />

      <section className={`pos-board mobile-step-${mobileStep}`}>
        <FloorMap
          layout={layout}
          locale={locale}
          currency={currency}
          selectedOrder={selectedOrder}
          busyTableId={busyTableId}
          onSelect={setTableAction}
          onClearSelection={() => setSelectedOrder(null)}
        />
        <MenuPicker
          categories={menu.categories}
          items={filteredItems}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          search={search}
          setSearch={setSearch}
          locale={locale}
          currency={currency}
          hasOrder={Boolean(selectedOrder) && !["paid", "cancelled"].includes(selectedOrder?.status)}
          onNeedOrder={() => setNotice(text(locale, "请先点击餐桌或创建外带订单", "Select a table or create a takeaway order first"))}
          onPick={setPickerItem}
          onCustom={() => (selectedOrder ? setCustomOpen(true) : setNotice(text(locale, "请先选择餐桌或创建外带订单", "Select a table or create a takeaway order first")))}
        />
        <OrderPanel
          order={selectedOrder}
          locale={locale}
          currency={currency}
          orders={orders}
          tables={layout.tables}
          user={user}
          onSelectOrder={async (id) => {
            setSelectedOrder(await api(`/orders/${id}`));
            navigateMobileStep("order");
          }}
          onQuantity={updateItem}
          onEditItem={openEditForOrderItem}
          onSaveNotes={saveOrderNotes}
          onSubmit={submitOrder}
          onPrintBill={printBill}
          onPay={() => setPaying(true)}
          onSplit={(mode) => setSplitting(mode)}
          onMerge={mergeOrder}
          onAdjustService={adjustServiceCharge}
          onDiscount={setPendingDiscount}
          onCancelOrder={cancelOrder}
          onExit={() => {
            setSelectedOrder(null);
            navigateMobileStep("tables");
          }}
          busy={busy}
        />
      </section>

      {pickerItem && (
        <ItemModal
          item={pickerItem}
          locale={locale}
          currency={currency}
          notePresets={(menu.note_presets ?? []).filter((p) => p.active !== false)}
          onClose={() => setPickerItem(null)}
          onAdd={addConfiguredItem}
        />
      )}

      {editingOrderItem && (
        <ItemModal
          item={editingOrderItem.menuItem}
          locale={locale}
          currency={currency}
          notePresets={(menu.note_presets ?? []).filter((p) => p.active !== false)}
          initialVariantId={editingOrderItem.orderItem.variant_id}
          initialModifierIds={(editingOrderItem.orderItem.modifiers ?? []).map((m) => m.modifier_id).filter(Boolean)}
          initialNotes={editingOrderItem.orderItem.notes || ""}
          initialQuantity={Number(editingOrderItem.orderItem.quantity)}
          editMode
          onClose={() => setEditingOrderItem(null)}
          onAdd={(cfg) => replaceOrderItem(editingOrderItem.orderItem, cfg)}
        />
      )}

      {customOpen && (
        <CustomItemModal
          locale={locale}
          currency={currency}
          onClose={() => setCustomOpen(false)}
          onAdd={addCustomItem}
        />
      )}

      {tableAction && (
        <TableActionModal
          table={tableAction}
          locale={locale}
          currency={currency}
          busy={busy || busyTableId === tableAction.id}
          isSelected={selectedOrder?.table_id === tableAction.id}
          onClose={() => setTableAction(null)}
          onOpen={() => openTable(tableAction)}
          onClear={() => clearTable(tableAction)}
        />
      )}

      {confirmTakeaway && (
        <ConfirmModal
          locale={locale}
          title={text(locale, "创建外带订单", "Create takeaway order")}
          message={text(locale, "确认创建一个新的外带订单？", "Create a new takeaway order?")}
          confirmLabel={text(locale, "创建外带", "Create takeaway")}
          icon={<ShoppingBag size={22} />}
          busy={busy}
          onCancel={() => setConfirmTakeaway(false)}
          onConfirm={createTakeaway}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          locale={locale}
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          icon={confirmAction.icon}
          extra={confirmAction.extra}
          busy={busy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmAction.onConfirm}
        />
      )}

      {pendingDiscount && (
        <DiscountAdminModal
          locale={locale}
          onCancel={() => setPendingDiscount(null)}
          onApply={async () => {
            await applyDiscount(pendingDiscount);
            setPendingDiscount(null);
          }}
        />
      )}

      {paying && selectedOrder && (
        <PaymentModal
          order={selectedOrder}
          locale={locale}
          currency={currency}
          dojoAvailable={Boolean(paymentProviders.dojo?.configured)}
          onClose={() => setPaying(false)}
          onPay={payOrder}
          onDojoPaid={finishDojoPayment}
        />
      )}

      {splitting === "even" && selectedOrder && (
        <EvenSplitModal
          order={selectedOrder}
          locale={locale}
          currency={currency}
          busy={busy}
          onClose={(fullyPaid) => {
            setSplitting(false);
            if (fullyPaid) {
              setSelectedOrder(null);
              navigateMobileStep("tables");
            }
          }}
          onPayPartial={payOrderPartial}
        />
      )}

      {splitting === "items" && selectedOrder && (
        <SplitByItemsModal
          order={selectedOrder}
          locale={locale}
          currency={currency}
          busy={busy}
          onClose={() => setSplitting(false)}
          onSplit={splitOrderByItems}
        />
      )}
    </main>
  );
}

function DiscountAdminModal({ locale, onCancel, onApply }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let granted = false;
    try {
      const grant = await api("/auth/admin-grant", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), pin, scope: "discount" })
      });
      window.sessionStorage.setItem("qypos_admin_grant", grant.token);
      granted = true;
      await onApply();
    } catch (caught) {
      setError(caught.message || text(locale, "管理员验证失败", "Admin verification failed"));
    } finally {
      if (granted) {
        try { await api("/auth/admin-grant", { method: "DELETE" }); } catch { /* grant expires server-side */ }
      }
      window.sessionStorage.removeItem("qypos_admin_grant");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <form className="modal" onSubmit={submit} style={{ maxWidth: 420 }}>
        <header className="modal-header">
          <button type="button" onClick={onCancel} disabled={busy} title={text(locale, "关闭", "Close")}><X size={20} /></button>
          <div><h2>{text(locale, "折扣 · 管理员验证", "Discount · Admin verification")}</h2></div>
        </header>
        <div className="modal-body" style={{ display: "grid", gap: 12, padding: 20 }}>
          <label>{text(locale, "管理员账号", "Admin account")}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="username" autoFocus /></label>
          <label>{text(locale, "管理员 PIN", "Admin PIN")}<input type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="current-password" /></label>
          {error && <div className="inline-error">{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onCancel} disabled={busy}>{text(locale, "取消", "Cancel")}</button>
            <button className="primary" type="submit" disabled={busy || !name.trim() || !pin}>{busy ? text(locale, "验证并应用中…", "Verifying and applying…") : text(locale, "验证并应用", "Verify and apply")}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function MobileWorkflow({ step, order, tables, locale, currency, onBack, onStep }) {
  const steps = [
    { id: "tables", label: text(locale, "选台", "Tables"), icon: <Armchair size={17} /> },
    { id: "menu", label: text(locale, "点菜", "Menu"), icon: <Utensils size={17} /> },
    { id: "order", label: text(locale, "订单", "Order"), icon: <CircleDollarSign size={17} /> }
  ];
  const itemCount = (order?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const table = order?.table_id ? tables.find((item) => item.id === order.table_id) : null;
  const location = order?.service_type === "dine_in"
    ? text(locale, `桌台 ${table?.label || "-"}`, `Table ${table?.label || "-"}`)
    : text(locale, `外带 ${order?.pickup_no || "-"}`, `Takeaway ${order?.pickup_no || "-"}`);

  return (
    <nav className="mobile-workflow" aria-label={text(locale, "点餐步骤", "Ordering steps")}>
      <div className="mobile-workflow-top">
        <button type="button" className="mobile-back-btn" onClick={onBack} disabled={step === "tables"}>
          <ChevronLeft size={18} />
          <span>{text(locale, "返回", "Back")}</span>
        </button>
        <div className="mobile-order-chip">
          {order ? (
            <>
              <strong>{location} · {money(order.total, currency, locale)}</strong>
              <span>{itemCount} {text(locale, "件", "items")} · {statusText[locale]?.[order.status] || order.status}</span>
            </>
          ) : (
            <>
              <strong>{text(locale, "先选择桌台", "Select a table first")}</strong>
              <span>{text(locale, "或创建外带订单", "or create a takeaway order")}</span>
            </>
          )}
        </div>
      </div>
      <div className="mobile-step-tabs">
        {steps.map((item) => (
          <button
            key={item.id}
            type="button"
            className={step === item.id ? "selected" : ""}
            onClick={() => onStep(item.id)}
            disabled={item.id !== "tables" && !order}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function FloorMap({ layout, locale, currency, selectedOrder, busyTableId, onSelect, onClearSelection }) {
  return (
    <section className="panel floor-panel">
      <div className="panel-title">
        <Armchair size={18} />
        <h2>{text(locale, "餐桌", "Tables")}</h2>
      </div>
      <div
        className="floor-canvas"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClearSelection();
        }}
      >
        {layout.tables.map((table) => (
          <button
            key={table.id}
            className={`table-shape ${table.shape} ${table.status} ${selectedOrder?.table_id === table.id ? "selected-table" : ""}`}
            style={{ left: Number(table.x), top: Number(table.y), width: Number(table.width), height: Number(table.height) }}
            onClick={() => onSelect(table)}
            disabled={busyTableId === table.id}
            title={`${table.label} ${statusLabel(table.status, locale)}`}
          >
            <strong>{busyTableId === table.id ? <Loader2 className="spin" size={18} /> : table.label}</strong>
            <span>{statusLabel(table.status, locale)}</span>
            {Number(table.current_total) > 0 && <em>{money(table.current_total, currency, locale)}</em>}
          </button>
        ))}
      </div>
    </section>
  );
}

function PosLogin({ notice, online, apiOnline, busy, locale, onLogin }) {
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onLogin({ name, pin });
        }}
      >
        <label>
          {text(locale, "员工", "Staff")}
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={text(locale, "Cashier", "Cashier")} autoComplete="username" />
        </label>
        <label>
          PIN
          <input type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="1111" autoComplete="current-password" />
        </label>
        <button className="primary wide-button" type="submit" disabled={busy || !name || !pin}>
          {busy ? <Loader2 className="spin" size={18} /> : <UserRound size={18} />}
          <span>{text(locale, "登录点餐", "Sign in")}</span>
        </button>
      </form>
    </section>
  );
}

function MenuPicker({ categories, items, selectedCategory, setSelectedCategory, search, setSearch, locale, currency, hasOrder, onNeedOrder, onPick, onCustom }) {
  return (
    <section className="panel menu-panel">
      <div className="panel-title split">
        <div>
          <ReceiptTitle locale={locale} />
        </div>
        <button type="button" className="misc-button" onClick={onCustom} disabled={!hasOrder} title={text(locale, "加入自定义价格的杂项代收", "Add a custom-priced misc charge")}>
          <Coins size={16} /><span>{text(locale, "杂项代收", "Misc charge")}</span>
        </button>
      </div>
      <div className="search-box">
        <Search size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text(locale, "搜索菜品", "Search items")} />
      </div>
      <div className="category-strip">
        <button className={selectedCategory === "all" ? "selected" : ""} onClick={() => setSelectedCategory("all")}>{text(locale, "全部", "All")}</button>
        {categories.filter((category) => category.active).map((category) => (
          <button key={category.id} className={selectedCategory === category.id ? "selected" : ""} onClick={() => setSelectedCategory(category.id)}>
            {labelOf(category.name_i18n, locale)}
          </button>
        ))}
      </div>
      <div className="menu-grid">
        {items.map((item) => {
          const minPrice = Math.min(...item.variants.filter((variant) => variant.active).map((variant) => Number(variant.price)));
          const zhName = labelOf(item.name_i18n, "zh-CN");
          const enName = item.name_i18n?.["en-GB"] || item.name_i18n?.["en"] || "";
          return (
            <button
              className="product-tile"
              key={item.id}
              onClick={() => (hasOrder ? onPick(item) : onNeedOrder())}
              disabled={!hasOrder || !item.variants.some((variant) => variant.active)}
            >
              <strong>{zhName}</strong>
              {enName && enName !== zhName && <em className="product-tile-en">{enName}</em>}
              <span>{labelOf(item.description_i18n, locale) || item.kitchen_group}</span>
              <b>{Number.isFinite(minPrice) ? money(minPrice, currency, locale) : text(locale, "未定价", "Unpriced")}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ReceiptTitle({ locale }) {
  return (
    <div className="inline-title">
      <ClipboardList size={18} />
      <h2>{text(locale, "菜单", "Menu")}</h2>
    </div>
  );
}

function OrderPanel({ order, orders, tables, locale, currency, user, onSelectOrder, onQuantity, onEditItem, onSaveNotes, onSubmit, onPrintBill, onPay, onSplit, onMerge, onAdjustService, onDiscount, onCancelOrder, onExit, busy }) {
  const [notes, setNotes] = useState("");
  const [discountRate, setDiscountRate] = useState("");
  const [discountAmt, setDiscountAmt] = useState("");
  const [serviceRate, setServiceRate] = useState("0.15");
  const [cancelReason, setCancelReason] = useState("");
  const [orderFilter, setOrderFilter] = useState("active");
  const [voidMode, setVoidMode] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const canVoid = Boolean(user?.permissions?.includes("manage_orders"));
  const orderPageSize = 20;

  useEffect(() => { setVoidMode(false); setVoidReason(""); }, [order?.id]);

  useEffect(() => setNotes(order?.notes || ""), [order?.id, order?.notes]);
  useEffect(() => {
    setDiscountRate(order?.discount_rate != null ? String(order.discount_rate) : "");
    setDiscountAmt(Number(order?.discount_fixed) > 0 ? String(order.discount_fixed) : "");
    setServiceRate(String(order?.service_charge_rate ?? 0.15));
  }, [order?.id, order?.discount_rate, order?.discount_fixed, order?.service_charge_rate]);

  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (item) => new Date(item.created_at).toDateString() === today
  );
  const filteredOrders = todayOrders.filter((item) => {
    if (orderFilter === "active") return !["paid", "cancelled", "split"].includes(item.status);
    if (orderFilter === "paid") return item.status === "paid";
    return item.status !== "split"; // "all" — split parent orders are historical noise
  });
  const totalOrderPages = Math.max(1, Math.ceil(filteredOrders.length / orderPageSize));
  const pagedOrders = filteredOrders.slice((orderPage - 1) * orderPageSize, orderPage * orderPageSize);
  const tableById = new Map(tables.map((table) => [table.id, table]));

  useEffect(() => {
    setOrderPage(1);
    setOrderPage((current) => Math.min(current, totalOrderPages));
  }, [totalOrderPages]);

  function orderLocation(targetOrder) {
    if (targetOrder.service_type === "dine_in") {
      return text(locale, `桌台 ${tableById.get(targetOrder.table_id)?.label || "-"}`, `Table ${tableById.get(targetOrder.table_id)?.label || "-"}`);
    }
    return text(locale, `外带 ${targetOrder.pickup_no || "-"}`, `Takeaway ${targetOrder.pickup_no || "-"}`);
  }

  const rateDiscAmt = order?.discount_rate != null
    ? Math.min(Number(order.subtotal ?? 0), Math.max(0, Math.round((Number(order.subtotal ?? 0) * (1 - Number(order.discount_rate) / 10) + 1e-10) * 100) / 100))
    : 0;

  return (
    <section className="panel order-panel">
      <div className="panel-title split">
        <div className="inline-title">
          <ClipboardList size={18} />
            <h2>{order ? order.order_no : text(locale, "当前订单", "Current order")}</h2>
        </div>
        <div className="inline-title">
          {order && <span className="order-location-tag">{orderLocation(order)}</span>}
          {order && <button className="icon-btn" onClick={onExit} title={text(locale, "退出订单", "Exit order")}><X size={18} /></button>}
        </div>
      </div>

      {!order && (
        <>
          <div className="order-filter-bar">
            <button className={orderFilter === "active" ? "selected" : ""} onClick={() => setOrderFilter("active")}>{text(locale, "已下单", "Open")}</button>
            <button className={orderFilter === "paid" ? "selected" : ""} onClick={() => setOrderFilter("paid")}>{text(locale, "已付款", "Paid")}</button>
            <button className={orderFilter === "all" ? "selected" : ""} onClick={() => setOrderFilter("all")}>{text(locale, "当日全部", "All today")}</button>
          </div>
          <div className="quick-orders">
            {filteredOrders.length === 0 && <div className="empty" style={{fontSize:13}}>{text(locale, "暂无订单", "No orders yet")}</div>}
            {pagedOrders.map((item) => (
              <button key={item.id} onClick={() => onSelectOrder(item.id)}
                className={["paid","cancelled"].includes(item.status) ? "order-done" : ""}>
                <span>
                  <strong>{item.order_no}</strong>
                  <small>{orderLocation(item)}</small>
                </span>
                <em className={`status-chip status-${item.status}`}>{statusLabel(item.status, locale)}</em>
                <b>{money(item.total, currency, locale)}</b>
              </button>
            ))}
          </div>
          {filteredOrders.length > orderPageSize && (
            <div className="quick-orders-pagination">
              <button type="button" onClick={() => setOrderPage((current) => Math.max(1, current - 1))} disabled={orderPage <= 1}>{text(locale, "上一页", "Previous")}</button>
              <span>{orderPage} / {totalOrderPages}</span>
              <button type="button" onClick={() => setOrderPage((current) => Math.min(totalOrderPages, current + 1))} disabled={orderPage >= totalOrderPages}>{text(locale, "下一页", "Next")}</button>
            </div>
          )}
        </>
      )}

      {order && (
        <>
          <div className="order-meta">
            <span>{orderLocation(order)}</span>
            <span>{order.service_type === "dine_in" ? text(locale, "堂食", "Dine in") : text(locale, "外带", "Takeaway")}</span>
            <span>{statusLabel(order.status, locale)}</span>
          </div>
          <div className="order-lines">
            {(order.items || []).map((item) => {
              const locked = Boolean(item.kitchen_printed_at);
              const canVoidThis = locked && voidMode && canVoid;
              return (
              <VoidableOrderLine
                key={item.id}
                item={item}
                locale={locale}
                currency={currency}
                locked={locked}
                canVoidThis={canVoidThis}
                voidReason={voidReason}
                onQuantity={onQuantity}
                onEditItem={onEditItem}
                onVoidDone={() => { setVoidMode(false); setVoidReason(""); }}
              />);
            })}
          </div>
          <label className="notes-box">
            {text(locale, "订单备注", "Order notes")}
            <input value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => onSaveNotes(notes)} placeholder={text(locale, "少盐、打包、过敏等", "Less salt, takeaway, allergy notes, etc.")} />
          </label>
          <div className="totals">
            <span>{text(locale, "小计", "Subtotal")} <b>{money(order.subtotal, currency, locale)}</b></span>
            {order.discount_rate != null && (
              <span>
                {text(locale, "折扣", "Discount")} {order.discount_rate}折<b> -{money(rateDiscAmt, currency, locale)}</b>
                <button type="button" style={{marginLeft:"6px",fontSize:"11px",padding:"1px 6px",cursor:"pointer"}} onClick={() => onDiscount({ discount_rate: null })}>{text(locale, "撤销", "Undo")}</button>
              </span>
            )}
            {Number(order.discount_fixed) > 0 && (
              <span>
                {text(locale, "优惠减额", "Fixed discount")}<b> -{money(order.discount_fixed, currency, locale)}</b>
                <button type="button" style={{marginLeft:"6px",fontSize:"11px",padding:"1px 6px",cursor:"pointer"}} onClick={() => onDiscount({ discount_fixed: 0 })}>{text(locale, "撤销", "Undo")}</button>
              </span>
            )}
            <span>{text(locale, "税费", "Tax")} <b>{money(order.tax, currency, locale)}</b></span>
            <span>{text(locale, "服务费", "Service")} <b>{money(order.service_charge, currency, locale)}</b></span>
            <strong>{text(locale, "合计", "Total")} <b>{money(order.total, currency, locale)}</b></strong>
          </div>
          <details className="admin-adjustments">
            <summary>{text(locale, "权限操作", "Manager actions")}</summary>
            <div className="adjustment-grid">
              <div className="adjust-row">
                <label>{text(locale, "折扣率（折）", "Discount rate (x/10)")}
                  <input type="number" min="0" max="10" step="0.1" value={discountRate} onChange={(event) => setDiscountRate(event.target.value)} placeholder={text(locale, "如 8.8", "e.g. 8.8")} />
                </label>
                <button type="button" onClick={() => {
                  const rate = parseFloat(discountRate);
                  if (isNaN(rate) || rate < 0 || rate > 10) return;
                  onDiscount({ discount_rate: rate, reason: "front desk adjustment" });
                }}>{text(locale, "应用折扣", "Apply discount")}</button>
              </div>

              <div className="adjust-row">
                <label>{text(locale, "优惠金额", "Discount amount")}
                  <input type="number" min="0" step="0.01" value={discountAmt} onChange={(event) => setDiscountAmt(event.target.value)} placeholder={text(locale, "减免金额", "Amount to reduce")} />
                </label>
                <button type="button" onClick={() => {
                  const amt = parseFloat(discountAmt);
                  if (isNaN(amt) || amt < 0) return;
                  onDiscount({ discount_fixed: amt, reason: "front desk adjustment" });
                }}>{text(locale, "减免优惠", "Apply fixed discount")}</button>
              </div>

              <div className="adjust-row">
                <label>{text(locale, "服务费率", "Service charge rate")}
                  <input type="number" step="0.001" value={serviceRate} onChange={(event) => setServiceRate(event.target.value)} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => onAdjustService({ service_charge_rate: Number(serviceRate), service_charge_exempt: false, reason: "front desk adjustment" })}>{text(locale, "更新服务费", "Update service charge")}</button>
                  <button type="button" onClick={() => onAdjustService({ service_charge_exempt: true, reason: "front desk exempt" })}>{text(locale, "豁免服务费", "Exempt service charge")}</button>
                </div>
              </div>

              <div className="adjust-row">
                <label>{text(locale, "取消原因", "Cancel reason")}
                  <input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder={text(locale, "客人取消、输错单等", "Guest cancelled, entered wrong order, etc.")} />
                </label>
                <button type="button" onClick={() => onCancelOrder(cancelReason || "front desk cancel")}>{text(locale, "取消订单", "Cancel order")}</button>
              </div>

              {canVoid && (
                <div className="adjust-row">
                  <label>{text(locale, "退菜原因", "Void reason")}
                    <input value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder={text(locale, "客人退菜、制作错误等", "Guest return, kitchen mistake, etc.")} />
                  </label>
                  <button type="button" className={voidMode ? "primary" : ""} onClick={() => setVoidMode((v) => !v)}>
                    {voidMode ? text(locale, "退出退菜模式", "Exit void mode") : text(locale, "退菜模式", "Void mode")}
                  </button>
                </div>
              )}
            </div>
          </details>
          <div className="action-row sticky-actions">
            <button onClick={onSubmit} disabled={busy || !(order.items || []).length || order.status === "split"}>
              <Printer size={18} />
              <span>{text(locale, "厨房下单", "Send to kitchen")}</span>
            </button>
            <button onClick={onPrintBill} disabled={busy || !(order.items || []).length}>
              <ClipboardList size={18} />
              <span>{text(locale, "账单", "Bill")}</span>
            </button>
            {order.parent_order_id && (
              <button onClick={onMerge} disabled={busy}>
                <Users size={18} />
                <span>{text(locale, "合单", "Merge")}</span>
              </button>
            )}
            {!order.parent_order_id && order.status !== "split" && (
              <button onClick={() => onSplit("items")} disabled={busy || !(order.items || []).length}>
                <Users size={18} />
                <span>{text(locale, "分单", "Split")}</span>
              </button>
            )}
            {order.status !== "split" && (
              <>
                <button onClick={() => onSplit("even")} disabled={busy || !(order.items || []).length}>
                  <Coins size={18} />
                  <span>{text(locale, "平分", "Split evenly")}</span>
                </button>
                <button className="primary" onClick={onPay} disabled={busy || !(order.items || []).length}>
                  <CircleDollarSign size={18} />
                  <span>{text(locale, "收款", "Take payment")}</span>
                </button>
                <button onClick={async () => { try { await api("/print-jobs/cash-drawer", { method: "POST" }); } catch { /* drawer optional */ } }} disabled={busy}>
                  <span>💵</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function TableActionModal({ table, locale, currency, busy, isSelected, onClose, onOpen, onClear }) {
  const isAvailable = table.status === "available";
  const needsCleaning = table.status === "needs_cleaning";
  const hasOrder = Boolean(table.current_order_id);
  const hasItems = Number(table.current_item_count || 0) > 0;
  const canClear = needsCleaning || !hasOrder || !hasItems;

  return (
    <div className="modal-backdrop">
      <section className="modal action-modal">
        <header className="modal-header">
          <button onClick={onClose} title={text(locale, "关闭", "Close")}><X size={20} /></button>
          <div>
            <h2>{text(locale, "桌台", "Table")} {table.label}</h2>
            <p>{statusLabel(table.status, locale)} · {table.seats} seats</p>
          </div>
          <span className={`status-badge ${table.status}`}>{statusLabel(table.status, locale)}</span>
        </header>
        <div className="action-summary">
          {Number(table.current_total) > 0 && <strong>{money(table.current_total, currency, locale)}</strong>}
          {isSelected && <span>{text(locale, "当前正在操作此桌", "This table is currently selected")}</span>}
          {needsCleaning && <span>{text(locale, "付款已完成，可以清台。", "Payment is complete. You can clear the table.")}</span>}
          {isAvailable && <span>{text(locale, "确认后才会开台，避免误触。", "Confirm to open the table and avoid accidental taps.")}</span>}
          {!isAvailable && !needsCleaning && hasItems && <span>{text(locale, "可继续点单；如需清台，请先完成付款。", "You can keep ordering. Pay first if you want to clear the table.")}</span>}
          {!isAvailable && !needsCleaning && !hasItems && <span>{text(locale, "此桌还没有点菜，可以直接清台。", "No items have been ordered yet, so you can clear the table.")}</span>}
        </div>
        <footer className="modal-footer">
          <button onClick={onClose}>{text(locale, "取消", "Cancel")}</button>
          {canClear && (
            <button onClick={onClear} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
              <span>{needsCleaning || hasOrder ? text(locale, "清台", "Clear table") : text(locale, "保持空桌", "Keep available")}</span>
            </button>
          )}
          <button className="primary" onClick={onOpen} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            <span>{isAvailable ? text(locale, "确认开台", "Open table") : needsCleaning ? text(locale, "新建订单", "New order") : text(locale, "继续点单", "Continue ordering")}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function ConfirmModal({ locale, title, message, confirmLabel, icon, extra, busy, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <section className="modal action-modal">
        <header className="modal-header">
          <button onClick={onCancel} title={text(locale, "关闭", "Close")}><X size={20} /></button>
          <div>
            <h2>{title}</h2>
            <p>{message}</p>
          </div>
          {icon}
        </header>
        {extra && <div className="modal-extra">{extra}</div>}
        <footer className="modal-footer">
          <button onClick={onCancel}>{text(locale, "取消", "Cancel")}</button>
          <button className="primary" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            <span>{confirmLabel}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function VoidableOrderLine({ item, locale, currency, locked, canVoidThis, voidReason, onQuantity, onEditItem, onVoidDone }) {
  const maxQty = Number(item.quantity);
  const [pendingVoid, setPendingVoid] = useState(false);
  const [voidQty, setVoidQty] = useState(maxQty);

  useEffect(() => {
    setPendingVoid(false);
    setVoidQty(maxQty);
  }, [item.id, canVoidThis, maxQty]);

  async function commitVoid() {
    await onQuantity(item, 0, { void: true, void_qty: voidQty, reason: voidReason || "front desk void" });
    onVoidDone();
  }

  const canEdit = !locked && !canVoidThis && item.item_id;

  return (
    <div className={`order-line rich${locked && !canVoidThis ? " locked" : ""}${canVoidThis ? " void-mode" : ""}`}>
      <div>
        <strong
          className={canEdit ? "item-name-editable" : ""}
          onClick={canEdit ? () => onEditItem(item) : undefined}
          title={canEdit ? text(locale, "点击修改规格/备注", "Edit variant/notes") : undefined}
        >{labelOf(item.name_i18n, locale)}</strong>
        <span>{labelOf(item.variant_name_i18n, locale)}</span>
        {locked && !canVoidThis && <small className="locked-line">{text(locale, "已下单制作中", "Submitted and being prepared")}</small>}
        {canVoidThis && !pendingVoid && <small className="locked-line warn">{text(locale, "点击删除进行退菜", "Click delete to void this item")}</small>}
        {canVoidThis && pendingVoid && (
          <small className="locked-line warn">{text(locale, "退菜数量：", "Void quantity:")}
            <button type="button" style={{padding:"0 4px"}} onClick={() => setVoidQty((q) => Math.max(1, q - 1))}>-</button>
            <b style={{margin:"0 4px"}}>{voidQty}</b>
            <button type="button" style={{padding:"0 4px"}} onClick={() => setVoidQty((q) => Math.min(maxQty, q + 1))}>+</button>
            &nbsp;/ {maxQty}
          </small>
        )}
        {aggregateModifiers(item.modifiers).map((modifier) => (
          <small key={modifier.modifier_id || modifier.id}>+ {modifier.count > 1 ? `${modifier.count}X ` : ""}{labelOf(modifier.name_i18n, locale)} {Number(modifier.price_delta) ? money(Number(modifier.price_delta) * modifier.count, currency, locale) : ""}</small>
        ))}
        {item.notes && <small className="item-notes">{text(locale, "备注：", "Notes:")}{item.notes}</small>}
      </div>
      <div className="qty-stepper">
        <button onClick={() => onQuantity(item, Number(item.quantity) - 1)} disabled={locked} title={text(locale, "减少", "Decrease")}><Minus size={16} /></button>
        <b>{item.quantity}</b>
        <button onClick={() => onQuantity(item, Number(item.quantity) + 1)} disabled={locked} title={text(locale, "增加", "Increase")}><Plus size={16} /></button>
      </div>
      {canVoidThis ? (
        pendingVoid ? (
          <button className="icon-danger" onClick={commitVoid} title={text(locale, "确认退菜", "Confirm void")}><Check size={16} /></button>
        ) : (
          <button className="icon-danger" onClick={() => {
            if (maxQty > 1) { setVoidQty(maxQty); setPendingVoid(true); }
            else commitVoid();
          }} title={text(locale, "退菜", "Void item")}><Trash2 size={16} /></button>
        )
      ) : (
        <button className="icon-danger" onClick={() => onQuantity(item, 0)} disabled={locked} title={text(locale, "删除", "Delete")}><Trash2 size={16} /></button>
      )}
    </div>
  );
}

function CustomItemModal({ locale, currency, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const priceNum = Number(price);
  const valid = name.trim().length > 0 && Number.isFinite(priceNum) && priceNum >= 0 && quantity >= 1;
  const total = valid ? priceNum * quantity : 0;

  function submit(event) {
    event.preventDefault();
    if (!valid) return;
    onAdd({ name: name.trim(), price: priceNum, quantity, notes });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-header">
          <button type="button" onClick={onClose} title={text(locale, "关闭", "Close")}><X size={20} /></button>
          <div>
            <h2>{text(locale, "杂项代收", "Misc charge")}</h2>
            <p>{text(locale, "自定义名称与价格，记入当前订单", "Set a custom name and price for the current order")}</p>
          </div>
        </header>
        <div className="modal-body" style={{display:"grid",gap:12,padding:"16px 20px"}}>
          <label>
            {text(locale, "名称", "Name")} <small className="label-hint">{text(locale, "如 \"塑料袋\"、\"打包盒\"、\"代收押金\" 等", "e.g. bag, box, deposit")}</small>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={text(locale, "杂项名称", "Charge name")} autoFocus />
          </label>
          <label>
            {text(locale, "单价", "Unit price")}（{currency}）
            <input type="number" inputMode="decimal" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </label>
          <label>
            {text(locale, "数量", "Quantity")}
            <div className="qty-stepper" style={{justifySelf:"start"}}>
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))}><Minus size={16} /></button>
              <b>{quantity}</b>
              <button type="button" onClick={() => setQuantity((q) => q + 1)}><Plus size={16} /></button>
            </div>
          </label>
          <label>
            {text(locale, "备注（可选）", "Notes (optional)")}
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={text(locale, "备注信息", "Notes") } />
          </label>
          {valid && <div className="totals" style={{borderTop:"1px solid var(--border)",paddingTop:8}}><strong>{text(locale, "小计", "Subtotal")} <b>{new Intl.NumberFormat(locale, { style: "currency", currency }).format(total)}</b></strong></div>}
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>{text(locale, "取消", "Cancel")}</button>
          <button type="submit" className="primary" disabled={!valid}>
            <Plus size={18} /><span>{text(locale, "加入订单", "Add to order")}</span>
          </button>
        </footer>
      </form>
    </div>
  );
}

function ItemModal({ item, locale, currency, notePresets = [], initialVariantId, initialModifierIds, initialNotes, initialQuantity, editMode, onClose, onAdd }) {
  const activeVariants = item.variants.filter((variant) => variant.active);
  const defaultModifierIds = item.modifier_groups
    .filter((group) => group.active)
    .flatMap((group) => group.modifiers
      .filter((modifier) => modifier.active && modifier.default_selected)
      .slice(0, Number(group.max_select || 1))
      .map((modifier) => modifier.id));
  const [variantId, setVariantId] = useState(initialVariantId || activeVariants[0]?.id || "");
  const [modifierIds, setModifierIds] = useState(() => Array.isArray(initialModifierIds) ? initialModifierIds : defaultModifierIds);
  const [quantity, setQuantity] = useState(initialQuantity || 1);
  const [selectedPresetIds, setSelectedPresetIds] = useState([]);
  const [notes, setNotes] = useState(initialNotes || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initialNotes) return;
    // Try to split saved notes into preset labels + free text, for example: "少辣、不要香菜；去汤"
    const parts = initialNotes.split("；").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) {
      setNotes("");
      return;
    }
    // The first segment may be a preset label list joined by '、'
    const candidateLabels = parts[0].split("、").map((s) => s.trim()).filter(Boolean);
    const matchedIds = candidateLabels.map((lbl) => (notePresets.find((p) => p.label === lbl) || {}).id).filter(Boolean);
    if (matchedIds.length > 0) {
      setSelectedPresetIds(matchedIds);
      const free = parts.slice(1).join("；").trim();
      setNotes(free);
    } else {
      // If no preset labels match, keep the whole note as free text
      setNotes(initialNotes);
    }
  }, [initialNotes, notePresets]);

  function togglePreset(id) {
    setSelectedPresetIds((curr) => curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]);
  }

  function composedNotes() {
    const labels = selectedPresetIds
      .map((id) => notePresets.find((p) => p.id === id)?.label)
      .filter(Boolean);
    const free = notes.trim();
    return [labels.join("、"), free].filter(Boolean).join("；");
  }

  function modifierCount(modifierId) {
    return modifierIds.filter((id) => id === modifierId).length;
  }

  function groupSelectionCount(group, ids = modifierIds) {
    const groupIds = new Set(group.modifiers.map((modifier) => modifier.id));
    return ids.filter((id) => groupIds.has(id)).length;
  }

  function changeModifierCount(group, modifierId, delta) {
    setModifierIds((current) => {
      const groupIds = group.modifiers.map((modifier) => modifier.id);
      const maxSelect = Number(group.max_select || 1);
      if (delta > 0) {
        if (maxSelect === 1) return [...current.filter((id) => !groupIds.includes(id)), modifierId];
        if (current.filter((id) => groupIds.includes(id)).length >= maxSelect) return current;
        return [...current, modifierId];
      }
      const removeAt = current.lastIndexOf(modifierId);
      if (removeAt < 0) return current;
      return current.filter((_id, index) => index !== removeAt);
    });
  }

  function toggleModifier(group, modifierId) {
    changeModifierCount(group, modifierId, modifierCount(modifierId) > 0 ? -1 : 1);
  }

  const activeModifierGroups = item.modifier_groups.filter((group) => group.active);
  const modifierSelectionValid = activeModifierGroups.every((group) => {
    const count = groupSelectionCount(group);
    return count >= Number(group.min_select || 0) && count <= Number(group.max_select || 1);
  });

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <header className="modal-header">
          <button onClick={onClose} title={text(locale, "返回", "Back")}><ChevronLeft size={20} /></button>
          <div>
            <h2>{labelOf(item.name_i18n, locale)}</h2>
            <p>{labelOf(item.description_i18n, locale)}</p>
          </div>
          <button onClick={onClose} title={text(locale, "关闭", "Close")}><X size={20} /></button>
        </header>

        <div className="choice-group">
          <h3>{text(locale, "规格", "Variants")}</h3>
          <div className="choice-grid">
            {activeVariants.map((variant) => (
              <button key={variant.id} className={variantId === variant.id ? "selected" : ""} onClick={() => setVariantId(variant.id)}>
                <span>{labelOf(variant.name_i18n, locale)}</span>
                <b>{money(variant.price, currency, locale)}</b>
              </button>
            ))}
          </div>
          {!activeVariants.length && <div className="inline-error">{text(locale, "这个菜品还没有可售规格，请到后台先添加规格。", "This item has no active variants yet. Add one in the admin panel first.")}</div>}
        </div>

        {activeModifierGroups.map((group) => (
          <div className="choice-group" key={group.id}>
            <h3>{labelOf(group.name_i18n, locale)} <small className="muted">{text(locale, "已选", "Selected")} {groupSelectionCount(group)} / {Number(group.max_select || 1)}{Number(group.min_select || 0) > 0 ? text(locale, `，至少 ${group.min_select}`, `, min ${group.min_select}`) : ""}</small></h3>
            {Number(group.max_select || 1) === 1 ? (
              <div className="choice-grid">
                {group.modifiers.filter((modifier) => modifier.active).map((modifier) => (
                  <button key={modifier.id} className={modifierIds.includes(modifier.id) ? "selected" : ""} onClick={() => toggleModifier(group, modifier.id)}>
                    <span>{labelOf(modifier.name_i18n, locale)}{modifier.default_selected && <small className="default-option-badge">{text(locale, "默认", "Default")}</small>}</span>
                    <b>{Number(modifier.price_delta) ? money(modifier.price_delta, currency, locale) : text(locale, "免费", "Free")}</b>
                  </button>
                ))}
              </div>
            ) : (
              <div className="modifier-quantity-grid">
                {group.modifiers.filter((modifier) => modifier.active).map((modifier) => {
                  const count = modifierCount(modifier.id);
                  const atGroupLimit = groupSelectionCount(group) >= Number(group.max_select || 1);
                  return (
                    <div className={`modifier-quantity-card ${count > 0 ? "selected" : ""}`} key={modifier.id}>
                      <button className="modifier-main-button" onClick={() => changeModifierCount(group, modifier.id, 1)} disabled={atGroupLimit}>
                        <span>{labelOf(modifier.name_i18n, locale)}{modifier.default_selected && <small className="default-option-badge">{text(locale, "默认", "Default")}</small>}</span>
                        <b>{Number(modifier.price_delta) ? money(modifier.price_delta, currency, locale) : text(locale, "免费", "Free")}</b>
                      </button>
                      <div className="modifier-quantity-stepper">
                        <button onClick={() => changeModifierCount(group, modifier.id, -1)} disabled={count === 0} aria-label={text(locale, `减少${labelOf(modifier.name_i18n, locale)}`, `Decrease ${labelOf(modifier.name_i18n, locale)}`)}><Minus size={15} /></button>
                        <strong>{count}</strong>
                        <button onClick={() => changeModifierCount(group, modifier.id, 1)} disabled={atGroupLimit} aria-label={text(locale, `增加${labelOf(modifier.name_i18n, locale)}`, `Increase ${labelOf(modifier.name_i18n, locale)}`)}><Plus size={15} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {notePresets.length > 0 && (
          <div className="choice-group">
            <h3>{text(locale, "常用备注", "Quick notes")} <small className="muted" style={{fontWeight:"normal"}}>{text(locale, "（只打印到厨房单）", "(printed on the kitchen ticket only)")}</small></h3>
            <div className="choice-grid">
              {notePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={selectedPresetIds.includes(preset.id) ? "selected" : ""}
                  onClick={() => togglePreset(preset.id)}
                >
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="notes-box">
          {text(locale, "菜品备注", "Item notes")}
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={text(locale, "不要香菜、汤分开等", "No coriander, soup separate, etc.")} />
        </label>

        <footer className="modal-footer">
          <div className="qty-stepper large">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={18} /></button>
            <b>{quantity}</b>
            <button onClick={() => setQuantity(quantity + 1)}><Plus size={18} /></button>
          </div>
          <button
            className="primary"
            onClick={async () => {
              setSubmitting(true);
              setError("");
              try {
                await onAdd({ variantId, modifierIds, quantity, notes: composedNotes() });
              } catch (caught) {
                setError(caught.message);
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={!variantId || !modifierSelectionValid || submitting}
          >
            {submitting ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            <span>{submitting ? (editMode ? text(locale, "更新中", "Updating") : text(locale, "加入中", "Adding")) : (editMode ? text(locale, "更新菜品", "Update item") : text(locale, "加入订单", "Add to order"))}</span>
          </button>
        </footer>
        {!modifierSelectionValid && <div className="inline-error">{text(locale, "请完成必选小料，并确认选择数量没有超过上限。", "Complete the required modifiers and make sure the selection count does not exceed the limit.")}</div>}
        {error && <div className="inline-error">{error}</div>}
      </section>
    </div>
  );
}

function SplitByItemsModal({ order, locale, currency, busy, onClose, onSplit }) {
  const [personCount, setPersonCount] = useState(2);
  const [assignments, setAssignments] = useState(() => {
    const init = {};
    for (const item of order.items ?? []) init[item.id] = {};
    return init;
  });

  const personLabels = ["客人A", "客人B", "客人C", "客人D", "客人E", "客人F", "客人G", "客人H", "客人I", "客人J"];

  function getA(itemId, pi) { return assignments[itemId]?.[pi] ?? 0; }

  function togglePerson(itemId, pi) {
    setAssignments(prev => {
      const cur = prev[itemId]?.[pi] ?? 0;
      return { ...prev, [itemId]: cur ? {} : { [pi]: 1 } };
    });
  }

  function setQty(itemId, pi, val, item) {
    const qty = Number(item.quantity);
    setAssignments(prev => {
      const itemA = { ...(prev[itemId] ?? {}) };
      itemA[pi] = Math.max(0, Math.min(val, qty));
      return { ...prev, [itemId]: itemA };
    });
  }

  function itemUnit(item) {
    return Number(item.unit_price ?? 0) + (item.modifiers ?? []).reduce((s, m) => s + Number(m.price_delta ?? 0), 0);
  }

  const personTotals = Array.from({ length: personCount }, (_, pi) =>
    (order.items ?? []).reduce((s, item) => s + getA(item.id, pi) * itemUnit(item), 0)
  );

  const unassigned = (order.items ?? []).filter(item => {
    const tot = Object.values(assignments[item.id] ?? {}).reduce((s, q) => s + q, 0);
    return tot < Number(item.quantity);
  });

  function handleConfirm() {
    const splits = Array.from({ length: personCount }, (_, pi) => ({
      label: personLabels[pi],
      items: (order.items ?? [])
        .filter(item => (assignments[item.id]?.[pi] ?? 0) > 0)
        .map(item => ({ id: item.id, quantity: assignments[item.id][pi] }))
    })).filter(s => s.items.length > 0);
    if (splits.length < 2) return;
    onSplit(splits);
  }

  return (
    <div className="modal-backdrop">
      <section className="modal split-items-modal">
        <header className="modal-header">
          <button onClick={onClose}><ChevronLeft size={20} /></button>
          <div><h2>{text(locale, "分单—按菜品分配", "Split order by item")}</h2><p>{order.order_no}</p></div>
          <button onClick={onClose}><X size={20} /></button>
        </header>

        <div className="split-person-bar">
          <span>{text(locale, "人数", "People")}</span>
          {[2,3,4,5,6,7,8,9,10].map(n => (
            <button key={n} className={personCount === n ? "selected" : ""}
              onClick={() => setPersonCount(n)}>{n}{text(locale, "人", "p")}</button>
          ))}
        </div>

        <div className="split-items-list">
          {(order.items ?? []).map(item => {
            const qty = Number(item.quantity);
            const unit = itemUnit(item);
            const totAssigned = Object.values(assignments[item.id] ?? {}).reduce((s, q) => s + q, 0);
            const remain = qty - totAssigned;
            return (
              <div key={item.id} className={`split-item-row${remain > 0 ? " unassigned" : ""}`}>
                <div className="split-item-name">
                  <span>{labelOf(item.name_i18n, locale)}</span>
                  <span className="split-item-price">{money(unit, currency, locale)}{qty > 1 ? ` ×${qty}` : ""}</span>
                </div>
                {qty === 1 ? (
                  <div className="split-person-btns">
                    {Array.from({ length: personCount }, (_, pi) => (
                      <button key={pi}
                        className={`split-person-btn${getA(item.id, pi) ? " selected" : ""}`}
                        onClick={() => togglePerson(item.id, pi)}>
                        {personLabels[pi].slice(-1)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="split-qty-controls">
                    {Array.from({ length: personCount }, (_, pi) => {
                      const a = getA(item.id, pi);
                      return (
                        <div key={pi} className="split-qty-person">
                          <span>{personLabels[pi].slice(-1)}</span>
                          <button onClick={() => setQty(item.id, pi, a - 1, item)} disabled={a <= 0}>−</button>
                          <span className="split-qty-num">{a}</span>
                          <button onClick={() => setQty(item.id, pi, a + 1, item)} disabled={remain <= 0 && a < qty}>+</button>
                        </div>
                      );
                    })}
                    {remain > 0 && <span className="split-unassigned-badge">{text(locale, `剩${remain}`, `Left ${remain}`)}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="split-person-totals">
          {Array.from({ length: personCount }, (_, pi) => (
            <div key={pi} className="split-person-total-row">
              <span>{personLabels[pi]}</span>
              <b>{money(personTotals[pi], currency, locale)}</b>
            </div>
          ))}
        </div>

        {unassigned.length > 0 && (
          <div className="split-warning">{text(locale, `还有 ${unassigned.length} 项未分配完毕`, `${unassigned.length} items still unassigned`)}</div>
        )}

        <footer className="modal-footer">
          <button onClick={onClose}>{text(locale, "取消", "Cancel")}</button>
          <button className="primary" onClick={handleConfirm} disabled={unassigned.length > 0 || busy}>
            <Users size={18} /><span>{text(locale, "确认分单", "Confirm split")}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function EvenSplitModal({ order, locale, currency, busy, onClose, onPayPartial }) {
  const [splitN, setSplitN] = useState(2);
  const [method, setMethod] = useState("card");
  const [amount, setAmount] = useState("");
  const [perPersonAmt, setPerPersonAmt] = useState(null);

  const total = Number(order.total ?? 0);
  const paidSoFar = (order.payments ?? []).reduce(
    (s, p) => s + Number(p.amount) - Number(p.change_due ?? 0), 0
  );
  const remaining = Math.max(0, Math.round((total - paidSoFar) * 100) / 100);
  const perPerson = splitN > 0 ? Math.round((remaining / splitN) * 100) / 100 : remaining;
  const isFullyPaid = remaining <= 0;

  useEffect(() => {
    if (perPersonAmt != null) {
      // Last person pays the exact remainder to avoid 0.01 rounding gaps
      const amt = remaining <= perPersonAmt + 0.05 ? remaining : perPersonAmt;
      setAmount(amt.toFixed(2));
    } else {
      setAmount(remaining > 0 ? remaining.toFixed(2) : "0");
    }
  }, [remaining, perPersonAmt]);

  const paid = Number(amount || 0);
  const change = Math.max(0, Math.round((paid - remaining) * 100) / 100);

  async function handlePay() {
    const amt = Number(amount || 0);
    if (isNaN(amt) || amt <= 0 || remaining <= 0) return;
    const result = await onPayPartial({ method, amount: amt, change_due: change });
    if (result?.order?.status === "paid") {
      onClose(true);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal payment-modal">
        <header className="modal-header">
          <button onClick={() => onClose(false)} title="返回"><ChevronLeft size={20} /></button>
          <div><h2>{text(locale, "拆单收款", "Split payment")}</h2><p>{order.order_no}</p></div>
          <button onClick={() => onClose(false)} title="关闭"><X size={20} /></button>
        </header>

        <div className="split-summary">
          <div><span>{text(locale, "订单总额", "Order total")}</span><b>{money(total, currency, locale)}</b></div>
          {paidSoFar > 0 && <div><span>{text(locale, "已收", "Paid")}</span><b className="split-paid-amt">{money(paidSoFar, currency, locale)}</b></div>}
          <div className="split-remaining-row"><span>{text(locale, "待收", "Remaining")}</span><b>{money(remaining, currency, locale)}</b></div>
        </div>

        {isFullyPaid ? (
          <div className="pay-total" style={{ color: "#16a34a", fontSize: "22px" }}>{text(locale, "已全额付清", "Fully paid")} ✓</div>
        ) : (
          <>
            <div className="split-n-bar">
              <span>{text(locale, "均分", "Even split")}</span>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button key={n}
                  className={splitN === n ? "selected" : ""}
                  onClick={() => {
                    const per = Math.round((remaining / n) * 100) / 100;
                    setSplitN(n);
                    setPerPersonAmt(per);
                    setAmount(per.toFixed(2));
                  }}
                >{n}{text(locale, "人", "p")}</button>
              ))}
              <button onClick={() => { setPerPersonAmt(null); setAmount(remaining.toFixed(2)); }}>{text(locale, "全额", "Full amount")}</button>
            </div>
            {perPerson > 0 && (
              <div className="split-per-person">{text(locale, "每份约", "Each about")} <b>{money(perPerson, currency, locale)}</b></div>
            )}
            <div className="choice-grid" style={{ margin: "12px 0" }}>
              {["cash", "card", "qr", "other"].map((m) => (
                <button key={m} className={method === m ? "selected" : ""} onClick={() => setMethod(m)}>{m}</button>
              ))}
            </div>
            <label className="notes-box">
              {text(locale, "收款金额", "Amount received")}
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <div className="totals">
              <span>{text(locale, "应收", "Due")} <b>{money(remaining, currency, locale)}</b></span>
              <span>{text(locale, "实收", "Received")} <b>{money(paid, currency, locale)}</b></span>
              {change > 0 && <strong>{text(locale, "找零", "Change")} <b>{money(change, currency, locale)}</b></strong>}
            </div>
          </>
        )}

        <footer className="modal-footer">
          <button onClick={() => onClose(false)}>{isFullyPaid ? text(locale, "关闭", "Close") : text(locale, "稍后", "Later")}</button>
          {!isFullyPaid && (
            <button className="primary" onClick={handlePay} disabled={busy || paid <= 0}>
              <CircleDollarSign size={18} />
              <span>{text(locale, "收款", "Take payment")} {money(paid, currency, locale)}</span>
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function PaymentModal({ order, locale, currency, dojoAvailable, onClose, onPay, onDojoPaid }) {
  const paidSoFar = (order.payments ?? []).reduce(
    (sum, payment) => sum + Number(payment.amount) - Number(payment.change_due ?? 0), 0
  );
  const total = Number(order.total || 0);
  const remaining = Math.max(0, Math.round((total - paidSoFar) * 100) / 100);
  const [mode, setMode] = useState(dojoAvailable ? "dojo" : "manual");
  const [method, setMethod] = useState("card");
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [terminals, setTerminals] = useState([]);
  const [terminalId, setTerminalId] = useState("");
  const [attempt, setAttempt] = useState(null);
  const [dojoBusy, setDojoBusy] = useState(false);
  const [dojoError, setDojoError] = useState("");
  const completedRef = useRef(false);
  const paid = Number(amount || 0);
  const change = Math.max(0, paid - remaining);
  const attemptPending = attempt?.status === "pending" || attempt?.status === "created";

  useEffect(() => {
    if (!dojoAvailable) return;
    let cancelled = false;
    api("/payment-providers/dojo/terminals")
      .then((items) => {
        if (cancelled) return;
        setTerminals(items);
        setTerminalId((current) => current || items[0]?.id || "");
      })
      .catch((error) => { if (!cancelled) setDojoError(error.message); });
    return () => { cancelled = true; };
  }, [dojoAvailable]);

  useEffect(() => {
    if (!attemptPending || !attempt?.id || completedRef.current) return;
    let cancelled = false;
    let timer;
    async function poll() {
      try {
        const latest = await api(`/payment-attempts/${attempt.id}`);
        if (cancelled) return;
        setAttempt(latest);
        setDojoError(latest.error_message || "");
        if (latest.status === "succeeded" && !completedRef.current) {
          completedRef.current = true;
          await onDojoPaid(latest);
          return;
        }
        if (["declined", "cancelled", "unknown", "failed"].includes(latest.status)) return;
      } catch (error) {
        if (!cancelled) setDojoError(error.message);
      }
      if (!cancelled) timer = window.setTimeout(poll, 1200);
    }
    timer = window.setTimeout(poll, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attempt?.id, attempt?.status, attemptPending, onDojoPaid]);

  async function startDojo() {
    setDojoBusy(true);
    setDojoError("");
    try {
      const created = await api(`/orders/${order.id}/payment-attempts/dojo`, {
        method: "POST",
        body: JSON.stringify({ amount: remaining, terminal_id: terminalId || undefined })
      });
      setAttempt(created);
    } catch (error) {
      setDojoError(error.message);
    } finally {
      setDojoBusy(false);
    }
  }

  async function cancelDojo() {
    if (!attempt?.id) return;
    setDojoBusy(true);
    setDojoError("");
    try {
      const cancelled = await api(`/payment-attempts/${attempt.id}/cancel`, { method: "POST" });
      setAttempt(cancelled);
    } catch (error) {
      setDojoError(error.message);
    } finally {
      setDojoBusy(false);
    }
  }

  async function answerSignature(accepted) {
    if (!attempt?.id) return;
    setDojoBusy(true);
    setDojoError("");
    try {
      const updated = await api(`/payment-attempts/${attempt.id}/signature`, {
        method: "POST",
        body: JSON.stringify({ accepted })
      });
      setAttempt(updated);
    } catch (error) {
      setDojoError(error.message);
    } finally {
      setDojoBusy(false);
    }
  }

  const dojoPrompt = {
    PresentCard: "请在 Dojo 刷卡机上刷卡或插卡",
    EnterPin: "请在刷卡机上输入 PIN",
    RemoveCard: "请取出银行卡",
    PleaseWait: "正在处理，请稍候"
  }[attempt?.terminal_prompt] || (attemptPending ? "正在等待 Dojo 刷卡机…" : "");
  const signatureRequired = attempt?.terminal_status === "SignatureVerificationRequired";

  return (
    <div className="modal-backdrop">
      <section className="modal payment-modal">
        <header className="modal-header">
          <button onClick={onClose} title={text(locale, "返回", "Back")} disabled={attemptPending}><ChevronLeft size={20} /></button>
          <div>
            <h2>{text(locale, "收款", "Payment")}</h2>
            <p>{order.order_no}</p>
          </div>
          <button onClick={onClose} title={text(locale, "关闭", "Close")} disabled={attemptPending}><X size={20} /></button>
        </header>
        <div className="pay-total">{money(remaining, currency, locale)}</div>
        <div className="payment-mode-tabs">
          {dojoAvailable && <button className={mode === "dojo" ? "selected" : ""} onClick={() => setMode("dojo")} disabled={attemptPending}>{text(locale, "Dojo 刷卡", "Dojo card")}</button>}
          <button className={mode === "manual" ? "selected" : ""} onClick={() => setMode("manual")} disabled={attemptPending}>{text(locale, "手工记账", "Manual payment")}</button>
        </div>
        {mode === "dojo" ? (
          <>
            {terminals.length > 1 && (
              <label className="notes-box">{text(locale, "刷卡机", "Terminal")}
                <select value={terminalId} onChange={(event) => setTerminalId(event.target.value)} disabled={attemptPending}>
                  {terminals.map((terminal) => <option value={terminal.id} key={terminal.id}>{terminal.name}</option>)}
                </select>
              </label>
            )}
            <div className={`dojo-payment-state ${attempt?.status || "ready"}`}>
              {dojoBusy ? <><Loader2 className="spin" size={28} />{text(locale, "正在连接 Dojo…", "Connecting to Dojo…")}</> : attemptPending ? <><Loader2 className="spin" size={28} />{dojoPrompt}</> : attempt?.status === "declined" ? text(locale, "付款被拒绝，请重试或改用手工记账", "Payment declined. Try again or use manual payment.") : attempt?.status === "unknown" ? text(locale, "支付结果不确定，请核对刷卡机或终端小票", "Payment status is uncertain. Check the terminal or receipt.") : text(locale, "金额将自动发送到 Dojo 刷卡机", "The amount will be sent to the Dojo terminal automatically")}
            </div>
            {dojoError && <div className="inline-error">{dojoError}</div>}
            {signatureRequired && (
              <div className="dojo-signature-actions">
                <button onClick={() => answerSignature(false)} disabled={dojoBusy}>{text(locale, "拒绝签名", "Decline signature")}</button>
                <button className="primary" onClick={() => answerSignature(true)} disabled={dojoBusy}>{text(locale, "确认签名一致", "Confirm signature matches")}</button>
              </div>
            )}
            <footer className="modal-footer">
              {attemptPending ? <button onClick={cancelDojo} disabled={dojoBusy}>{text(locale, "取消终端交易", "Cancel terminal payment")}</button> : <button onClick={onClose}>{text(locale, "关闭", "Close")}</button>}
              {!attemptPending && <button className="primary" onClick={startDojo} disabled={dojoBusy || terminals.length === 0 || remaining <= 0 || attempt?.status === "unknown"}><CircleDollarSign size={18} /><span>{text(locale, "发送到 Dojo", "Send to Dojo")}</span></button>}
            </footer>
          </>
        ) : (
          <>
            <div className="choice-grid">
              {["cash", "card", "qr", "other"].map((item) => (
                <button key={item} className={method === item ? "selected" : ""} onClick={() => setMethod(item)}>{item}</button>
              ))}
            </div>
            <label className="notes-box">{text(locale, "手工输入实收金额", "Enter manual payment amount")}
              <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <div className="totals">
              <span>{text(locale, "待收", "Remaining")} <b>{money(remaining, currency, locale)}</b></span>
              <span>{text(locale, "实收", "Received")} <b>{money(paid, currency, locale)}</b></span>
              <strong>{text(locale, "找零", "Change")} <b>{money(change, currency, locale)}</b></strong>
            </div>
            {!dojoAvailable && <small className="payment-provider-hint">{text(locale, "Dojo 尚未配置，当前仍可使用手工收款。", "Dojo is not configured yet. Manual payment is still available.")}</small>}
            <footer className="modal-footer">
              <button onClick={onClose}>{text(locale, "取消", "Cancel")}</button>
              <button className="primary" onClick={() => onPay({ method, amount: paid, change_due: change })} disabled={paid < remaining}>
                <CircleDollarSign size={18} /><span>{text(locale, "确认手工收款", "Confirm manual payment")}</span>
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
