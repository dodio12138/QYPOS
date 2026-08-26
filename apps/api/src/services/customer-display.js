export const CUSTOMER_DISPLAY_STATE_KEY = "customer_display:state";
export const CUSTOMER_DISPLAY_REVISION_KEY = "customer_display:revision";
export const DEFAULT_CUSTOMER_DISPLAY_REVIEW_IMAGE = "/customer-display/default-review-qr.png";

const DISPLAY_MODES = new Set(["idle", "bill", "paid", "lottery_invitation", "lottery_ready", "lottery_spinning", "lottery_result"]);

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function visibleUntil(seconds) {
  const duration = Math.max(0, Number(seconds || 0));
  return duration ? new Date(Date.now() + duration * 1000).toISOString() : null;
}

export function defaultCustomerDisplayState(idleContent = {}) {
  return {
    revision: 0,
    mode: "idle",
    visible_until: null,
    payload: {
      title_i18n: idleContent.title_i18n ?? {},
      subtitle_i18n: idleContent.subtitle_i18n ?? {},
      logo_url: idleContent.logo_url ?? "/pic/logo.png",
      background: idleContent.background ?? "#fff8ed"
    }
  };
}

export function customerDisplayMatchesOrder(state, orderId) {
  return Boolean(orderId && state?.payload?.order_id === orderId);
}

export function customerDisplayInvitationMatches(state, { revision, token } = {}) {
  return Boolean(
    state?.mode === "lottery_invitation"
    && Number(state.revision) === Number(revision)
    && token
    && state.payload?.invitation_token === token
  );
}

export function shouldRefreshCustomerDisplayOrder(state, orderId) {
  return ["bill", "paid"].includes(state?.mode) && customerDisplayMatchesOrder(state, orderId);
}

export async function getCustomerDisplayState(redis, idleContent = {}) {
  const raw = await redis.get(CUSTOMER_DISPLAY_STATE_KEY);
  if (!raw) return defaultCustomerDisplayState(idleContent);
  try {
    const state = JSON.parse(raw);
    if (!DISPLAY_MODES.has(state.mode) || !Number.isInteger(Number(state.revision))) {
      return defaultCustomerDisplayState(idleContent);
    }
    if (state.visible_until && new Date(state.visible_until).getTime() <= Date.now()) {
      return defaultCustomerDisplayState(idleContent);
    }
    return state;
  } catch {
    return defaultCustomerDisplayState(idleContent);
  }
}

export async function publishCustomerDisplayState({ redis, broadcast, mode, payload = {}, durationSeconds = 0 }) {
  if (!DISPLAY_MODES.has(mode)) throw new Error(`Unsupported customer display mode: ${mode}`);
  const revision = await redis.incr(CUSTOMER_DISPLAY_REVISION_KEY);
  const state = {
    revision,
    mode,
    visible_until: visibleUntil(durationSeconds),
    payload
  };
  await redis.set(CUSTOMER_DISPLAY_STATE_KEY, JSON.stringify(state));
  if (typeof broadcast === "function") broadcast(`customer_display.${mode}`, state);
  return state;
}

export async function resetCustomerDisplay({ redis, broadcast, idleContent = {} }) {
  return publishCustomerDisplayState({
    redis,
    broadcast,
    mode: "idle",
    payload: {
      title_i18n: idleContent.title_i18n ?? {},
      subtitle_i18n: idleContent.subtitle_i18n ?? {},
      logo_url: idleContent.logo_url ?? "/pic/logo.png",
      background: idleContent.background ?? "#fff8ed"
    }
  });
}

function displayItem(item) {
  return {
    name_i18n: item.name_i18n ?? {},
    variant_name_i18n: item.variant_name_i18n ?? {},
    modifiers: (item.modifiers ?? []).map((modifier) => ({
      name_i18n: modifier.name_i18n ?? {},
      price_delta: numberOrZero(modifier.price_delta)
    })),
    quantity: Math.max(0, Number(item.quantity || 0)),
    unit_price: numberOrZero(item.unit_price),
    line_total: numberOrZero(item.line_total)
  };
}

export function buildCustomerBill({ order, items = [], payments = [], settings = {}, table = null }) {
  const applied = payments.reduce(
    (sum, payment) => sum + numberOrZero(payment.amount) - numberOrZero(payment.change_due) - numberOrZero(payment.retained_amount),
    0
  );
  const total = numberOrZero(order?.total);
  const paid = Math.min(total, Math.max(0, applied));
  return {
    order_no: order?.order_no ?? "",
    service_type: order?.service_type ?? "",
    table_label: table?.label ?? null,
    currency: settings.currency ?? "GBP",
    items: items.filter((item) => item.status !== "cancelled").map(displayItem),
    subtotal: numberOrZero(order?.subtotal),
    discount: numberOrZero(order?.discount),
    service_charge: numberOrZero(order?.service_charge),
    tax: numberOrZero(order?.tax),
    total,
    paid,
    remaining: Math.max(0, total - paid),
    status: order?.status ?? "draft",
    paid_at: toIsoOrNull(order?.paid_at)
  };
}

export function displaySettings(settings = {}) {
  return {
    enabled: settings.customer_display_enabled !== false,
    interaction_mode: "customer_touch",
    show_bill_on_checkout: settings.customer_display_show_bill_on_checkout !== false,
    auto_show_lottery: Boolean(settings.customer_display_auto_show_lottery),
    lottery_invitation_enabled: settings.customer_display_lottery_invitation_enabled !== false,
    lottery_invitation_i18n: settings.customer_display_lottery_invitation_i18n && typeof settings.customer_display_lottery_invitation_i18n === "object"
      ? settings.customer_display_lottery_invitation_i18n
      : {
          "zh-CN": "留下 Google 评论即可参加幸运大转盘抽奖",
          "en-GB": "Leave us a Google review to join the Lucky Wheel draw"
        },
    payment_success_seconds: Math.min(30, Math.max(1, Number(settings.customer_display_payment_success_seconds || 5))),
    lottery_invitation_seconds: Math.min(60, Math.max(1, Number(settings.customer_display_lottery_invitation_seconds || 10))),
    lottery_result_seconds: Math.min(120, Math.max(5, Number(settings.customer_display_lottery_result_seconds || 20))),
    invitation_image_url: settings.customer_display_idle_content && typeof settings.customer_display_idle_content === "object"
      ? settings.customer_display_idle_content.review_image_url || DEFAULT_CUSTOMER_DISPLAY_REVIEW_IMAGE
      : DEFAULT_CUSTOMER_DISPLAY_REVIEW_IMAGE,
    idle_content: {
      review_image_url: DEFAULT_CUSTOMER_DISPLAY_REVIEW_IMAGE,
      ...(settings.customer_display_idle_content && typeof settings.customer_display_idle_content === "object"
        ? settings.customer_display_idle_content
        : {})
    }
  };
}
