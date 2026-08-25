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
  Settings,
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
import { api, labelOf, websocketUrl } from "../lib/api";
import qyposLogo from "../pic/logo.png";
import ConfirmModal from "./_components/confirm-modal";
import ReceiptTitle from "./_components/receipt-title";
import PosLogin from "./_components/pos-login";
import TableActionModal from "./_components/table-action-modal";
import DiscountAdminModal from "./_components/discount-admin-modal";
import ComplimentaryAdminModal from "./_components/complimentary-admin-modal";
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
import CustomerDisplayControl from "./_components/customer-display-control";
import OnlineOrderAlertModal from "./admin/_components/online-order-alert-modal";

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
    posTitle: "前台",
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
  const [onlineOrderAlerts, setOnlineOrderAlerts] = useState([]);
  const [onlineOrderPrintBusy, setOnlineOrderPrintBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [apiOnline, setApiOnline] = useState(true);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyTableId, setBusyTableId] = useState(null);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [pendingDiscount, setPendingDiscount] = useState(null);
  const [pendingComplimentary, setPendingComplimentary] = useState(false);
  const [mobileStep, setMobileStep] = useState("tables");
  const [mobileStepHistory, setMobileStepHistory] = useState([]);
  const [tabletMode, setTabletMode] = useState(false);
  const kitchenPrintRef = useRef(true);
  const userRef = useRef(null);
  const previousSelectedOrderIdRef = useRef(null);
  const pendingCustomerDisplayInvitationTimerRef = useRef(null);

  useEffect(() => () => {
    window.clearTimeout(pendingCustomerDisplayInvitationTimerRef.current);
  }, []);

  const locale = settings?.locale || "zh-CN";
  const currency = settings?.currency || "CNY";
  const copy = UI_COPY[locale] || UI_COPY["zh-CN"];

  useEffect(() => {
    userRef.current = user;
  }, [user]);

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

  function enqueueOnlineOrderAlert(summary) {
    if (!summary?.id) return;
    const alertKey = String(summary.id);
    setOnlineOrderAlerts((current) => current.some((item) => item.alertKey === alertKey)
      ? current
      : [...current, { ...summary, alertKey }]);
    if (!summary.test) {
      api(`/online-orders/${encodeURIComponent(summary.id)}`)
        .then((detail) => setOnlineOrderAlerts((current) => current.map((item) => item.alertKey === alertKey ? { ...item, ...detail, alertKey } : item)))
        .catch(() => {});
    }
  }

  function closeOnlineOrderAlert(message) {
    setOnlineOrderAlerts((current) => current.slice(1));
    if (message) setNotice(message);
  }

  async function acceptOnlineOrderAlert() {
    const order = onlineOrderAlerts[0];
    if (!order) return;
    setOnlineOrderPrintBusy(true);
    try {
      await api(order.test ? "/online-orders/test-print-kitchen" : `/online-orders/${encodeURIComponent(order.id)}/print-kitchen`, { method: "POST" });
      closeOnlineOrderAlert(text(locale, "已确认，简易后厨单已入队", "Confirmed; simple kitchen ticket queued"));
    } catch (error) {
      setNotice(error.message || text(locale, "后厨单打印失败", "Kitchen ticket print failed"));
    } finally {
      setOnlineOrderPrintBusy(false);
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
    setWsStatus("connecting");
    let socket;
    try {
      const url = websocketUrl("/ws");
      socket = new WebSocket(url);
      socket.onopen = () => {
        setWsStatus("connected");
        console.info("[QYPOS] POS WebSocket connected");
      };
      socket.onerror = (error) => {
        setWsStatus("error");
        console.error("[QYPOS] POS WebSocket error", error);
      };
      socket.onclose = () => {
        setWsStatus("disconnected");
        console.warn("[QYPOS] POS WebSocket disconnected");
      };
    } catch (error) {
      setWsStatus("error");
      console.error("[QYPOS] POS WebSocket setup failed", error);
    }
    if (socket) socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === "online_order.received") {
          console.info("[QYPOS] POS received online_order.received", msg.data?.id || "unknown");
          if (userRef.current?.permissions?.includes("print_receipt")) enqueueOnlineOrderAlert(msg.data);
          return;
        }
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
      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Showing a different order must not leave the previous customer's bill or
  // lottery result on the unpaired customer display. A paid order with a live
  // ticket immediately restores its configured invitation when it is reopened.
  const canControlCustomerDisplay = Boolean(user?.permissions?.includes("control_customer_display"));
  useEffect(() => {
    const previousId = previousSelectedOrderIdRef.current;
    const currentId = selectedOrder?.id || null;
    previousSelectedOrderIdRef.current = currentId;
    if (!currentId || (previousId && previousId !== currentId)) {
      window.clearTimeout(pendingCustomerDisplayInvitationTimerRef.current);
      pendingCustomerDisplayInvitationTimerRef.current = null;
    }
    if (!currentId || previousId === currentId || !canControlCustomerDisplay) return undefined;
    let active = true;
    async function syncSelectedOrderDisplay() {
      await api("/customer-display/reset", { method: "POST" }).catch(() => {});
      if (!active || selectedOrder?.status !== "paid") return;
      const path = settings?.customer_display_lottery_invitation_enabled !== false
        ? "/customer-display/show-lottery-invitation"
        : settings?.customer_display_auto_show_lottery
          ? "/customer-display/show-lottery"
          : null;
      if (path) await api(path, { method: "POST", body: JSON.stringify({ order_id: currentId }) }).catch(() => {});
    }
    syncSelectedOrderDisplay();
    return () => { active = false; };
  }, [canControlCustomerDisplay, selectedOrder?.id, selectedOrder?.status, settings?.customer_display_auto_show_lottery, settings?.customer_display_lottery_invitation_enabled]);

  async function presentPostPaymentLottery(orderId, lotteryTicket) {
    if (!canControlCustomerDisplay || !orderId) return null;
    if (!lotteryTicket) {
      if (settings?.customer_display_show_bill_on_checkout !== false) {
        try { await api("/customer-display/show-order", { method: "POST", body: JSON.stringify({ order_id: orderId }) }); } catch { /* customer display is optional */ }
      }
      return null;
    }
    if (settings?.customer_display_lottery_invitation_enabled !== false) {
      try {
        if (settings?.customer_display_show_bill_on_checkout !== false) {
          await api("/customer-display/show-order", { method: "POST", body: JSON.stringify({ order_id: orderId }) });
          const seconds = Math.min(30, Math.max(1, Number(settings?.customer_display_payment_success_seconds || 5)));
          window.clearTimeout(pendingCustomerDisplayInvitationTimerRef.current);
          pendingCustomerDisplayInvitationTimerRef.current = window.setTimeout(() => {
            pendingCustomerDisplayInvitationTimerRef.current = null;
            api("/customer-display/show-lottery-invitation", { method: "POST", body: JSON.stringify({ order_id: orderId }) }).catch(() => {});
          }, seconds * 1000);
        } else {
          await api("/customer-display/show-lottery-invitation", { method: "POST", body: JSON.stringify({ order_id: orderId }) });
        }
        return "invitation";
      } catch { return null; }
    }
    if (settings?.customer_display_auto_show_lottery) {
      try {
        await api("/customer-display/show-lottery", { method: "POST", body: JSON.stringify({ order_id: orderId }) });
        return "lottery";
      } catch { return null; }
    }
    return null;
  }

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
    if (user?.permissions?.includes("control_customer_display")) {
      await api("/customer-display/reset", { method: "POST" }).catch(() => {});
    }
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
    if (["cancelled", "split"].includes(selectedOrder.status)) return;
    if (!(selectedOrder.items || []).length) {
      setNotice(text(locale, "订单没有菜品，无法提交", "This order has no items and cannot be submitted"));
      return;
    }
    const isPaidOrder = selectedOrder.status === "paid";
    const isKitchenReprint = ["paid", "submitted", "preparing", "ready", "ready_to_serve", "partially_served", "pending_payment"].includes(selectedOrder.status);
    kitchenPrintRef.current = true;
    setConfirmAction({
      title: isKitchenReprint ? text(locale, "补打后厨单", "Reprint kitchen") : text(locale, "厨房下单", "Send to kitchen"),
      message: isPaidOrder
        ? text(locale, "该订单已付款，是否补打后厨单？订单状态将保持为已付款。", "This order is already paid. Reprint the kitchen ticket? Its status will remain paid.")
        : isKitchenReprint
          ? text(locale, "该订单已经发送过后厨，是否补打后厨单？订单状态不会改变。", "This order has already been sent to the kitchen. Reprint the kitchen ticket? Its status will not change.")
        : text(locale, "确认下单？新菜品将发送到厨房。", "Submit this order? New items will be sent to the kitchen."),
      confirmLabel: isKitchenReprint ? text(locale, "补打后厨单", "Reprint kitchen") : text(locale, "确认下单", "Submit"),
      icon: <Printer size={22} />,
      extra: !isKitchenReprint && (
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
        }, isPaidOrder
          ? text(locale, "后厨单已补打，订单仍为已付款", "Kitchen ticket reprinted; order remains paid")
          : isKitchenReprint
            ? text(locale, "后厨单已补打，订单状态未改变", "Kitchen ticket reprinted; order status unchanged")
            : shouldPrint ? text(locale, "已下单，厨打已发送", "Submitted, kitchen print sent") : text(locale, "已下单", "Submitted"));
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
    let result = null;
    await run(async () => {
      result = await api(`/orders/${selectedOrder.id}/payments`, {
        method: "POST",
        body: JSON.stringify(payment)
      });
      // Auto-open cash drawer when paying with cash
      if (payment.method === "cash") {
        try { await api("/print-jobs/cash-drawer", { method: "POST", body: JSON.stringify({ source: "cash_payment_auto" }) }); } catch { /* drawer is optional */ }
      }
      if (result.order.status === "paid") {
        const lotteryPresentation = await presentPostPaymentLottery(result.order.id, result.lottery_ticket);
        // Keep a manually paid order selected until the cashier either starts
        // its lottery or exits, so the POS still has an order to target.
        setSelectedOrder(lotteryPresentation === "lottery" ? null : result.order);
        setPaying(false);
        navigateMobileStep("tables");
      } else {
        setSelectedOrder(await api(`/orders/${result.order.id}`));
        if (settings?.customer_display_show_bill_on_checkout !== false && user?.permissions?.includes("control_customer_display")) {
          try { await api("/customer-display/show-order", { method: "POST", body: JSON.stringify({ order_id: result.order.id }) }); } catch { /* customer display is optional */ }
        }
      }
      await refresh(false);
    }, text(locale, "付款已记录", "Payment recorded"));
    return result;
  }

  async function settleComplimentaryOrder(payload) {
    if (!selectedOrder) return;
    await api(`/orders/${selectedOrder.id}/complimentary`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    closePaymentModal();
    setPendingComplimentary(false);
    setSelectedOrder(null);
    navigateMobileStep("tables");
    await refresh(false);
    setNotice(text(locale, "免单结账已完成", "Complimentary checkout completed"));
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
      if (settings?.customer_display_show_bill_on_checkout !== false && user?.permissions?.includes("control_customer_display")) {
        try { await api("/customer-display/show-order", { method: "POST", body: JSON.stringify({ order_id: result.order.id }) }); } catch { /* customer display is optional */ }
      }
      await refresh(false);
    }, text(locale, `已收 ${money(payment.amount, currency, locale)}`, `Received ${money(payment.amount, currency, locale)}`));
    return result;
  }

  function closePaymentModal() {
    setPaying(false);
    if (canControlCustomerDisplay) {
      api("/customer-display/reset", { method: "POST" }).catch(() => {});
    }
  }

  async function finishDojoPayment(result) {
    setNotice(text(locale, "Dojo 刷卡成功", "Dojo payment succeeded"));
    const fullyPaid = result.order?.status === "paid";
    if (fullyPaid) {
      const lotteryPresentation = await presentPostPaymentLottery(result.order.id, result.lottery_ticket);
      setPaying(false);
      setSelectedOrder(lotteryPresentation === "lottery" ? null : result.order);
      navigateMobileStep("tables");
    } else if (result.order?.id) {
      setSelectedOrder(await api(`/orders/${result.order.id}`));
    }
    await refresh(false);
    return fullyPaid;
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
      if (canControlCustomerDisplay) {
        await api("/customer-display/refresh-order", {
          method: "POST",
          body: JSON.stringify({ order_id: updated.id })
        }).catch(() => {});
      }
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
    if (canControlCustomerDisplay) {
      await api("/customer-display/refresh-order", {
        method: "POST",
        body: JSON.stringify({ order_id: updated.id })
      }).catch(() => {});
    }
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
    <main className={`pos-shell${tabletMode ? " tablet-mode" : ""}${canControlCustomerDisplay ? " has-customer-display-control" : ""}`}>
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
          <span className="user-chip" title={user.name}><UserRound size={16} /><span className="user-chip-label">{user.name}</span></span>
          <span className={`realtime-status ${wsStatus}`} title={text(locale, "网站订单实时连接状态", "Website order realtime connection status")}>
            <span className="realtime-status-label">{text(locale, "实时", "Live")}: {wsStatus === "connected" ? text(locale, "已连接", "Connected") : wsStatus === "connecting" ? text(locale, "连接中", "Connecting") : wsStatus === "error" ? text(locale, "异常", "Error") : text(locale, "已断开", "Disconnected")}</span>
          </span>
          <a className="link-button" href="/admin" title={copy.adminLink} aria-label={copy.adminLink}>
            <Settings size={18} />
            <span className="header-action-label">{copy.adminLink}</span>
          </a>
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
      <OnlineOrderAlertModal
        order={onlineOrderAlerts[0]}
        locale={locale}
        currency={currency}
        busy={onlineOrderPrintBusy}
        onDismiss={() => closeOnlineOrderAlert(text(locale, "已关闭在线订单提示", "Online-order alert dismissed"))}
        onAccept={acceptOnlineOrderAlert}
      />

      <CustomerDisplayControl order={selectedOrder} locale={locale} user={user} onNotify={setNotice} />

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
          onPay={async () => {
            setPaying(true);
            if (settings?.customer_display_show_bill_on_checkout !== false && user?.permissions?.includes("control_customer_display") && selectedOrder?.id) {
              try {
                await api("/customer-display/show-order", { method: "POST", body: JSON.stringify({ order_id: selectedOrder.id }) });
              } catch (error) {
                setNotice(error.message);
              }
            }
          }}
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

      {pendingComplimentary && selectedOrder && (
        <ComplimentaryAdminModal
          locale={locale}
          onCancel={() => {
            setPendingComplimentary(false);
            setPaying(true);
          }}
          onApply={settleComplimentaryOrder}
        />
      )}

      {paying && selectedOrder && (
        <PaymentModal
          order={selectedOrder}
          locale={locale}
          currency={currency}
          dojoAvailable={Boolean(paymentProviders.dojo?.configured)}
          busy={busy}
          onClose={closePaymentModal}
          onPay={payOrder}
          onDojoPaid={finishDojoPayment}
          onComplimentary={() => {
            setPaying(false);
            setPendingComplimentary(true);
          }}
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
