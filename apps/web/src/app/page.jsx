"use client";

import {
  Armchair,
  Check,
  ChevronLeft,
  CircleDollarSign,
  ClipboardList,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Loader2,
  LogOut,
  Trash2,
  Utensils,
  UserRound,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, API_URL, labelOf } from "../lib/api";

const statusText = {
  available: "空桌",
  opened: "已开台",
  ordered: "已下单",
  preparing: "制作中",
  ready_to_serve: "待上菜",
  partially_served: "部分上菜",
  pending_payment: "待支付",
  needs_cleaning: "需清台"
};

function money(value, currency = "CNY", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value || 0));
}

export default function PosPage() {
  const [settings, setSettings] = useState(null);
  const [menu, setMenu] = useState({ categories: [], items: [] });
  const [layout, setLayout] = useState({ areas: [], tables: [] });
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [pickerItem, setPickerItem] = useState(null);
  const [paying, setPaying] = useState(false);
  const [tableAction, setTableAction] = useState(null);
  const [confirmTakeaway, setConfirmTakeaway] = useState(false);
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(true);
  const [apiOnline, setApiOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyTableId, setBusyTableId] = useState(null);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const locale = settings?.locale || "zh-CN";
  const currency = settings?.currency || "CNY";

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
    const [settingsData, menuData, layoutData, ordersData] = await Promise.all([
      api("/settings"),
      api("/menu"),
      api("/floor-layouts"),
      api("/orders")
    ]);
    setSettings(settingsData);
    setMenu(menuData);
    setLayout(layoutData);
    setOrders(ordersData);
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

  useEffect(() => {
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
    const socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws`);
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

  async function login(credentials) {
    await run(async () => {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials)
      });
      window.localStorage.setItem("qypos_token", result.token);
      setUser(result.user);
      await refresh(false);
    }, "已登录前台");
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
      setNotice(`${table.label} 已选中`);
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
      setNotice(`${table.label} 已清台`);
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
      await refresh(false);
    }, "外带订单已创建");
    setConfirmTakeaway(false);
  }

  async function addConfiguredItem({ variantId, modifierIds, quantity, notes }) {
    if (!selectedOrder) {
      setNotice("请先选择餐桌或创建外带订单");
      return;
    }
    await run(async () => {
      const updated = await api(`/orders/${selectedOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ add_item: { variant_id: variantId, modifier_ids: modifierIds, quantity, notes } })
      });
      setSelectedOrder(await api(`/orders/${updated.id}`));
      setPickerItem(null);
      await refresh(false);
    }, "已加入订单");
  }

  async function updateItem(item, quantity) {
    if (!selectedOrder) return;
    await run(async () => {
      const updated = await api(`/orders/${selectedOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ update_item: { id: item.id, quantity } })
      });
      setSelectedOrder(await api(`/orders/${updated.id}`));
      await refresh(false);
    });
  }

  async function saveOrderNotes(notes) {
    if (!selectedOrder) return;
    await run(async () => {
      const updated = await api(`/orders/${selectedOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes })
      });
      setSelectedOrder(await api(`/orders/${updated.id}`));
    }, "备注已保存");
  }

  async function submitOrder() {
    if (!selectedOrder) return;
    if (!(selectedOrder.items || []).length) {
      setNotice("订单没有菜品，无法提交");
      return;
    }
    setConfirmAction({
      title: "厨房打印",
      message: "确认把未打印的新菜品发送到厨房？已厨打的菜品不会重复打印。",
      confirmLabel: "发送厨打",
      icon: <Printer size={22} />,
      onConfirm: async () => {
        await run(async () => {
      await api(`/orders/${selectedOrder.id}/submit`, { method: "POST" });
      setSelectedOrder(await api(`/orders/${selectedOrder.id}`));
      await refresh(false);
        }, "已发送厨房打印");
        setConfirmAction(null);
      }
    });
  }

  async function printBill() {
    if (!selectedOrder) return;
    setConfirmAction({
      title: "账单打印",
      message: "确认打印当前账单？这不会完成收款。",
      confirmLabel: "打印账单",
      icon: <ClipboardList size={22} />,
      onConfirm: async () => {
        await run(async () => {
          await api(`/orders/${selectedOrder.id}/print`, { method: "POST", body: JSON.stringify({ type: "receipt" }) });
          await refresh(false);
        }, "已发送账单打印");
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
      setSelectedOrder(null);
      setPaying(false);
      await refresh(false);
    }, "已收款");
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
    }, "服务费已更新");
  }

  async function applyDiscount(patch) {
    if (!selectedOrder) return;
    await run(async () => {
      const updated = await api(`/orders/${selectedOrder.id}/discount`, {
        method: "POST",
        body: JSON.stringify(patch)
      });
      setSelectedOrder(await api(`/orders/${updated.id}`));
      await refresh(false);
    }, "折扣已更新");
  }

  async function cancelOrder(reason) {
    if (!selectedOrder) return;
    setConfirmAction({
      title: "取消订单",
      message: "确认取消当前订单？取消后会释放关联桌台。",
      confirmLabel: "取消订单",
      icon: <Trash2 size={22} />,
      onConfirm: async () => {
        await run(async () => {
          await api(`/orders/${selectedOrder.id}/cancel`, {
            method: "POST",
            body: JSON.stringify({ reason })
          });
          setSelectedOrder(null);
          await refresh(false);
        }, "订单已取消");
        setConfirmAction(null);
      }
    });
  }

  if (!authChecked) {
    return (
      <main className="pos-shell">
        <div className="center-state"><Loader2 className="spin" size={24} /> 正在检查登录状态</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="pos-shell">
        <PosLogin notice={notice} online={online} apiOnline={apiOnline} busy={busy} onLogin={login} />
      </main>
    );
  }

  return (
    <main className="pos-shell">
      <header className="pos-header">
        <div className="brand compact">
          <CircleDollarSign size={24} />
          <span>QYPOS</span>
        </div>
        <div className="mode-pill">
          <Utensils size={18} />
          <span>点餐前台</span>
        </div>
        <div className="top-actions">
          <span className="user-chip"><UserRound size={16} />{user.name}</span>
          <a className="link-button" href="/admin">后台</a>
          <button onClick={() => refresh()} disabled={busy} title="刷新">
            <RefreshCw size={18} />
            <span>刷新</span>
          </button>
          <button onClick={() => setConfirmTakeaway(true)} disabled={busy} title="外带">
            <ShoppingBag size={18} />
            <span>外带</span>
          </button>
          <button onClick={logout} disabled={busy} title="退出">
            <LogOut size={18} />
            <span>退出</span>
          </button>
        </div>
      </header>

      {!online && <div className="offline-banner pos-offline"><WifiOff size={16} />当前离线，点单、打印和收款可能无法同步。</div>}
      {online && !apiOnline && <div className="offline-banner pos-offline"><WifiOff size={16} />本地 API 暂不可用，请检查 Docker 服务。</div>}
      {notice && <button className="notice toast" onClick={() => setNotice("")}>{notice}</button>}

      <section className="pos-board">
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
          hasOrder={Boolean(selectedOrder)}
          onNeedOrder={() => setNotice("请先点击餐桌或创建外带订单")}
          onPick={setPickerItem}
        />
        <OrderPanel
          order={selectedOrder}
          locale={locale}
          currency={currency}
          orders={orders}
          tables={layout.tables}
          onSelectOrder={async (id) => setSelectedOrder(await api(`/orders/${id}`))}
          onQuantity={updateItem}
          onSaveNotes={saveOrderNotes}
          onSubmit={submitOrder}
          onPrintBill={printBill}
          onPay={() => setPaying(true)}
          onAdjustService={adjustServiceCharge}
          onDiscount={applyDiscount}
          onCancelOrder={cancelOrder}
          onExit={() => setSelectedOrder(null)}
          busy={busy}
        />
      </section>

      {pickerItem && (
        <ItemModal
          item={pickerItem}
          locale={locale}
          currency={currency}
          onClose={() => setPickerItem(null)}
          onAdd={addConfiguredItem}
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
          title="创建外带订单"
          message="确认创建一个新的外带订单？"
          confirmLabel="创建外带"
          icon={<ShoppingBag size={22} />}
          busy={busy}
          onCancel={() => setConfirmTakeaway(false)}
          onConfirm={createTakeaway}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          icon={confirmAction.icon}
          busy={busy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmAction.onConfirm}
        />
      )}

      {paying && selectedOrder && (
        <PaymentModal
          order={selectedOrder}
          locale={locale}
          currency={currency}
          onClose={() => setPaying(false)}
          onPay={payOrder}
        />
      )}
    </main>
  );
}

function FloorMap({ layout, locale, currency, selectedOrder, busyTableId, onSelect, onClearSelection }) {
  return (
    <section className="panel floor-panel">
      <div className="panel-title">
        <Armchair size={18} />
        <h2>餐桌</h2>
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
            title={`${table.label} ${statusText[table.status] || table.status}`}
          >
            <strong>{busyTableId === table.id ? <Loader2 className="spin" size={18} /> : table.label}</strong>
            <span>{statusText[table.status] || table.status}</span>
            {Number(table.current_total) > 0 && <em>{money(table.current_total, currency, locale)}</em>}
          </button>
        ))}
      </div>
    </section>
  );
}

function PosLogin({ notice, online, apiOnline, busy, onLogin }) {
  const [name, setName] = useState("Cashier");
  const [pin, setPin] = useState("1111");

  return (
    <section className="login-panel pos-login-panel">
      <div className="brand login-brand">
        <CircleDollarSign size={28} />
        <span>QYPOS</span>
      </div>
      <h1>点餐前台登录</h1>
      <p>开台、点餐、打印和收款需要员工账号。</p>
      {!online && <div className="offline-banner"><WifiOff size={16} />当前离线，无法登录。</div>}
      {online && !apiOnline && <div className="offline-banner"><WifiOff size={16} />本地 API 暂不可用，请检查 Docker 服务。</div>}
      {notice && <div className="inline-error">{notice}</div>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onLogin({ name, pin });
        }}
      >
        <label>
          员工
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Cashier" autoComplete="username" />
        </label>
        <label>
          PIN
          <input type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="1111" autoComplete="current-password" />
        </label>
        <button className="primary wide-button" type="submit" disabled={busy || !name || !pin}>
          {busy ? <Loader2 className="spin" size={18} /> : <UserRound size={18} />}
          <span>登录点餐</span>
        </button>
      </form>
    </section>
  );
}

function MenuPicker({ categories, items, selectedCategory, setSelectedCategory, search, setSearch, locale, currency, hasOrder, onNeedOrder, onPick }) {
  return (
    <section className="panel menu-panel">
      <div className="panel-title split">
        <div>
          <ReceiptTitle />
        </div>
      </div>
      <div className="search-box">
        <Search size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索菜品" />
      </div>
      <div className="category-strip">
        <button className={selectedCategory === "all" ? "selected" : ""} onClick={() => setSelectedCategory("all")}>全部</button>
        {categories.filter((category) => category.active).map((category) => (
          <button key={category.id} className={selectedCategory === category.id ? "selected" : ""} onClick={() => setSelectedCategory(category.id)}>
            {labelOf(category.name_i18n, locale)}
          </button>
        ))}
      </div>
      <div className="menu-grid">
        {items.map((item) => {
          const minPrice = Math.min(...item.variants.filter((variant) => variant.active).map((variant) => Number(variant.price)));
          return (
            <button
              className="product-tile"
              key={item.id}
              onClick={() => (hasOrder ? onPick(item) : onNeedOrder())}
              disabled={!hasOrder || !item.variants.some((variant) => variant.active)}
            >
              <strong>{labelOf(item.name_i18n, locale)}</strong>
              <span>{labelOf(item.description_i18n, locale) || item.kitchen_group}</span>
              <b>{Number.isFinite(minPrice) ? money(minPrice, currency, locale) : "未定价"}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ReceiptTitle() {
  return (
    <div className="inline-title">
      <ClipboardList size={18} />
      <h2>菜单</h2>
    </div>
  );
}

function OrderPanel({ order, orders, tables, locale, currency, onSelectOrder, onQuantity, onSaveNotes, onSubmit, onPrintBill, onPay, onAdjustService, onDiscount, onCancelOrder, onExit, busy }) {
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("0");
  const [serviceRate, setServiceRate] = useState("0.15");
  const [cancelReason, setCancelReason] = useState("");
  const [orderFilter, setOrderFilter] = useState("active");

  useEffect(() => setNotes(order?.notes || ""), [order?.id, order?.notes]);
  useEffect(() => {
    setDiscount(String(order?.discount || 0));
    setServiceRate(String(order?.service_charge_rate ?? 0.15));
  }, [order?.id, order?.discount, order?.service_charge_rate]);

  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (item) => new Date(item.created_at).toDateString() === today
  );
  const filteredOrders = todayOrders.filter((item) => {
    if (orderFilter === "active") return !["paid", "cancelled"].includes(item.status);
    if (orderFilter === "paid") return item.status === "paid";
    return true; // "all"
  });
  const tableById = new Map(tables.map((table) => [table.id, table]));

  function orderLocation(targetOrder) {
    if (targetOrder.service_type === "dine_in") {
      return `桌台 ${tableById.get(targetOrder.table_id)?.label || "-"}`;
    }
    return `外带 ${targetOrder.pickup_no || "-"}`;
  }

  return (
    <section className="panel order-panel">
      <div className="panel-title split">
        <div className="inline-title">
          <ClipboardList size={18} />
          <h2>{order ? order.order_no : "当前订单"}</h2>
        </div>
        <div className="inline-title">
          {order && <span className="order-location-tag">{orderLocation(order)}</span>}
          {order && <button className="icon-btn" onClick={onExit} title="退出订单"><X size={18} /></button>}
        </div>
      </div>

      {!order && (
        <>
          <div className="order-filter-bar">
            <button className={orderFilter === "active" ? "selected" : ""} onClick={() => setOrderFilter("active")}>已开台</button>
            <button className={orderFilter === "paid" ? "selected" : ""} onClick={() => setOrderFilter("paid")}>已付款</button>
            <button className={orderFilter === "all" ? "selected" : ""} onClick={() => setOrderFilter("all")}>当日全部</button>
          </div>
          <div className="quick-orders">
            {filteredOrders.length === 0 && <div className="empty" style={{fontSize:13}}>暂无订单</div>}
            {filteredOrders.slice(0, 12).map((item) => (
              <button key={item.id} onClick={() => onSelectOrder(item.id)}
                className={["paid","cancelled"].includes(item.status) ? "order-done" : ""}>
                <span>
                  <strong>{orderLocation(item)}</strong>
                  <small>{item.order_no}</small>
                </span>
                <em className={`status-chip status-${item.status}`}>{item.status}</em>
                <b>{money(item.total, currency, locale)}</b>
              </button>
            ))}
          </div>
        </>
      )}

      {order && (
        <>
          <div className="order-meta">
            <span>{orderLocation(order)}</span>
            <span>{order.service_type === "dine_in" ? "堂食" : "外带"}</span>
            <span>{order.status}</span>
          </div>
          <div className="order-lines">
            {(order.items || []).map((item) => (
              <div className="order-line rich" key={item.id}>
                <div>
                  <strong>{labelOf(item.name_i18n, locale)}</strong>
                  <span>{labelOf(item.variant_name_i18n, locale)}</span>
                  {item.kitchen_printed_at && <small className="locked-line">已厨打锁定</small>}
                  {(item.modifiers || []).map((modifier) => (
                    <small key={modifier.id}>+ {labelOf(modifier.name_i18n, locale)} {Number(modifier.price_delta) ? money(modifier.price_delta, currency, locale) : ""}</small>
                  ))}
                </div>
                <div className="qty-stepper">
                  <button onClick={() => onQuantity(item, Number(item.quantity) - 1)} disabled={Boolean(item.kitchen_printed_at)} title="减少"><Minus size={16} /></button>
                  <b>{item.quantity}</b>
                  <button onClick={() => onQuantity(item, Number(item.quantity) + 1)} disabled={Boolean(item.kitchen_printed_at)} title="增加"><Plus size={16} /></button>
                </div>
                <button className="icon-danger" onClick={() => onQuantity(item, 0)} disabled={Boolean(item.kitchen_printed_at)} title="删除"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <label className="notes-box">
            订单备注
            <input value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => onSaveNotes(notes)} placeholder="少盐、打包、过敏等" />
          </label>
          <div className="totals">
            <span>Subtotal <b>{money(order.subtotal, currency, locale)}</b></span>
            {Number(order.discount) > 0 && <span>Discount <b>-{money(order.discount, currency, locale)}</b></span>}
            <span>Tax <b>{money(order.tax, currency, locale)}</b></span>
            <span>Service <b>{money(order.service_charge, currency, locale)}</b></span>
            <strong>Total <b>{money(order.total, currency, locale)}</b></strong>
          </div>
          <details className="admin-adjustments">
            <summary>权限操作</summary>
            <div className="adjustment-grid">
              <label>折扣金额<input type="number" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
              <button type="button" onClick={() => onDiscount({ discount: Number(discount), reason: "front desk adjustment" })}>应用折扣</button>
              <label>服务费率<input type="number" step="0.001" value={serviceRate} onChange={(event) => setServiceRate(event.target.value)} /></label>
              <button type="button" onClick={() => onAdjustService({ service_charge_rate: Number(serviceRate), service_charge_exempt: false, reason: "front desk adjustment" })}>更新服务费</button>
              <button type="button" onClick={() => onAdjustService({ service_charge_exempt: true, reason: "front desk exempt" })}>豁免服务费</button>
              <label>取消原因<input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="客人取消、输错单等" /></label>
              <button type="button" onClick={() => onCancelOrder(cancelReason || "front desk cancel")}>取消订单</button>
            </div>
          </details>
          <div className="action-row sticky-actions">
            <button onClick={onSubmit} disabled={busy || !(order.items || []).length}>
              <Printer size={18} />
              <span>厨房打印</span>
            </button>
            <button onClick={onPrintBill} disabled={busy || !(order.items || []).length}>
              <ClipboardList size={18} />
              <span>账单打印</span>
            </button>
            <button className="primary" onClick={onPay} disabled={busy || !(order.items || []).length}>
              <CircleDollarSign size={18} />
              <span>收款</span>
            </button>
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
          <button onClick={onClose} title="关闭"><X size={20} /></button>
          <div>
            <h2>桌台 {table.label}</h2>
            <p>{statusText[table.status] || table.status} · {table.seats} seats</p>
          </div>
          <span className={`status-badge ${table.status}`}>{statusText[table.status] || table.status}</span>
        </header>
        <div className="action-summary">
          {Number(table.current_total) > 0 && <strong>{money(table.current_total, currency, locale)}</strong>}
          {isSelected && <span>当前正在操作此桌</span>}
          {needsCleaning && <span>付款已完成，可以清台。</span>}
          {isAvailable && <span>确认后才会开台，避免误触。</span>}
          {!isAvailable && !needsCleaning && hasItems && <span>可继续点单；如需清台，请先完成付款。</span>}
          {!isAvailable && !needsCleaning && !hasItems && <span>此桌还没有点菜，可以直接清台。</span>}
        </div>
        <footer className="modal-footer">
          <button onClick={onClose}>取消</button>
          {canClear && (
            <button onClick={onClear} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
              <span>{needsCleaning || hasOrder ? "清台" : "保持空桌"}</span>
            </button>
          )}
          {!needsCleaning && (
            <button className="primary" onClick={onOpen} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
              <span>{isAvailable ? "确认开台" : "继续点单"}</span>
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, icon, busy, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <section className="modal action-modal">
        <header className="modal-header">
          <button onClick={onCancel} title="关闭"><X size={20} /></button>
          <div>
            <h2>{title}</h2>
            <p>{message}</p>
          </div>
          {icon}
        </header>
        <footer className="modal-footer">
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            <span>{confirmLabel}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function ItemModal({ item, locale, currency, onClose, onAdd }) {
  const activeVariants = item.variants.filter((variant) => variant.active);
  const [variantId, setVariantId] = useState(activeVariants[0]?.id || "");
  const [modifierIds, setModifierIds] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleModifier(group, modifierId) {
    setModifierIds((current) => {
      if (current.includes(modifierId)) return current.filter((id) => id !== modifierId);
      const groupIds = group.modifiers.map((modifier) => modifier.id);
      const maxSelect = Number(group.max_select || 1);
      const withoutGroup = maxSelect === 1 ? current.filter((id) => !groupIds.includes(id)) : current;
      const selectedInGroup = withoutGroup.filter((id) => groupIds.includes(id));
      if (selectedInGroup.length >= maxSelect) return withoutGroup;
      return [...withoutGroup, modifierId];
    });
  }

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <header className="modal-header">
          <button onClick={onClose} title="返回"><ChevronLeft size={20} /></button>
          <div>
            <h2>{labelOf(item.name_i18n, locale)}</h2>
            <p>{labelOf(item.description_i18n, locale)}</p>
          </div>
          <button onClick={onClose} title="关闭"><X size={20} /></button>
        </header>

        <div className="choice-group">
          <h3>规格</h3>
          <div className="choice-grid">
            {activeVariants.map((variant) => (
              <button key={variant.id} className={variantId === variant.id ? "selected" : ""} onClick={() => setVariantId(variant.id)}>
                <span>{labelOf(variant.name_i18n, locale)}</span>
                <b>{money(variant.price, currency, locale)}</b>
              </button>
            ))}
          </div>
          {!activeVariants.length && <div className="inline-error">这个菜品还没有可售规格，请到后台先添加规格。</div>}
        </div>

        {item.modifier_groups.filter((group) => group.active).map((group) => (
          <div className="choice-group" key={group.id}>
            <h3>{labelOf(group.name_i18n, locale)}</h3>
            <div className="choice-grid">
              {group.modifiers.filter((modifier) => modifier.active).map((modifier) => (
                <button key={modifier.id} className={modifierIds.includes(modifier.id) ? "selected" : ""} onClick={() => toggleModifier(group, modifier.id)}>
                  <span>{labelOf(modifier.name_i18n, locale)}</span>
                  <b>{Number(modifier.price_delta) ? money(modifier.price_delta, currency, locale) : "免费"}</b>
                </button>
              ))}
            </div>
          </div>
        ))}

        <label className="notes-box">
          菜品备注
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="不要香菜、汤分开等" />
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
                await onAdd({ variantId, modifierIds, quantity, notes });
              } catch (caught) {
                setError(caught.message);
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={!variantId || submitting}
          >
            {submitting ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            <span>{submitting ? "加入中" : "加入订单"}</span>
          </button>
        </footer>
        {error && <div className="inline-error">{error}</div>}
      </section>
    </div>
  );
}

function PaymentModal({ order, locale, currency, onClose, onPay }) {
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState(String(order.total));
  const paid = Number(amount || 0);
  const total = Number(order.total || 0);
  const change = Math.max(0, paid - total);

  return (
    <div className="modal-backdrop">
      <section className="modal payment-modal">
        <header className="modal-header">
          <button onClick={onClose} title="返回"><ChevronLeft size={20} /></button>
          <div>
            <h2>收款</h2>
            <p>{order.order_no}</p>
          </div>
          <button onClick={onClose} title="关闭"><X size={20} /></button>
        </header>
        <div className="pay-total">{money(order.total, currency, locale)}</div>
        <div className="choice-grid">
          {["cash", "card", "qr", "other"].map((item) => (
            <button key={item} className={method === item ? "selected" : ""} onClick={() => setMethod(item)}>
              {item}
            </button>
          ))}
        </div>
        <label className="notes-box">
          实收金额
          <input type="number" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <div className="totals">
          <span>应收 <b>{money(total, currency, locale)}</b></span>
          <span>实收 <b>{money(paid, currency, locale)}</b></span>
          <strong>找零 <b>{money(change, currency, locale)}</b></strong>
        </div>
        <footer className="modal-footer">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={() => onPay({ method, amount: paid, change_due: change })} disabled={paid < total}>
            <CircleDollarSign size={18} />
            <span>确认收款</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
