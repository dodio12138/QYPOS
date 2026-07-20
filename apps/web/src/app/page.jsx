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
import ConfirmModal from "./_components/confirm-modal";
import ReceiptTitle from "./_components/receipt-title";
import PosLogin from "./_components/pos-login";
import TableActionModal from "./_components/table-action-modal";
import DiscountAdminModal from "./_components/discount-admin-modal";
import FloorMap from "./_components/floor-map";
import VoidableOrderLine from "./_components/voidable-order-line";
import CustomItemModal from "./_components/custom-item-modal";
import ItemModal from "./_components/item-modal";
import SplitByItemsModal from "./_components/split-by-items-modal";
import EvenSplitModal from "./_components/even-split-modal";
import PaymentModal from "./_components/payment-modal";
import MobileWorkflow from "./_components/mobile-workflow";
import MenuPicker from "./_components/menu-picker";
import OrderPanel from "./_components/order-panel";

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

  function notePresetsForItem(item) {
    return (menu.note_presets ?? []).filter((preset) => {
      if (preset.active === false) return false;
      const categoryIds = Array.isArray(preset.category_ids) ? preset.category_ids : [];
      return !categoryIds.length || categoryIds.includes(item.category_id);
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
          notePresets={notePresetsForItem(pickerItem)}
          onClose={() => setPickerItem(null)}
          onAdd={addConfiguredItem}
        />
      )}

      {editingOrderItem && (
        <ItemModal
          item={editingOrderItem.menuItem}
          locale={locale}
          currency={currency}
          notePresets={notePresetsForItem(editingOrderItem.menuItem)}
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

// DiscountAdminModal imported from ./_components/discount-admin-modal
