import crypto from "node:crypto";
import {
  buildCustomerBill,
  customerDisplayInvitationMatches,
  customerDisplayMatchesOrder,
  defaultCustomerDisplayState,
  displaySettings,
  getCustomerDisplayState,
  publishCustomerDisplayState,
  resetCustomerDisplay,
  shouldRefreshCustomerDisplayOrder
} from "../services/customer-display.js";
import { drawLottery, getLotteryCampaignSnapshot, issueAdditionalLotteryTicket, testLotteryCampaign } from "../services/lottery.js";

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export default function register({
  app,
  pool,
  redis,
  query,
  one,
  getSettings,
  requirePermission,
  auditLog,
  emitCustomerDisplay,
  getOrderItems,
  customerDisplaySockets
}) {
  async function settingsAndDisplay() {
    const settings = displaySettings(await getSettings());
    return { settings, idle: settings.idle_content };
  }

  async function currentState() {
    const { idle } = await settingsAndDisplay();
    const state = await getCustomerDisplayState(redis, idle);
    if (state.mode !== "idle") return state;
    return { ...defaultCustomerDisplayState(idle), revision: state.revision };
  }

  async function publishIdle() {
    const { idle } = await settingsAndDisplay();
    return resetCustomerDisplay({ redis, broadcast: emitCustomerDisplay, idleContent: idle });
  }

  async function publishOrder(orderId) {
    const order = await one("SELECT * FROM orders WHERE id = $1", [orderId]);
    if (!order) throw httpError("Order not found", 404);
    const [items, payments, settings, table] = await Promise.all([
      getOrderItems(order.id),
      query("SELECT amount, change_due, retained_amount FROM payments WHERE order_id = $1 ORDER BY created_at", [order.id]),
      getSettings(),
      order.table_id ? one("SELECT label FROM tables WHERE id = $1", [order.table_id]) : null
    ]);
    const bill = buildCustomerBill({ order, items, payments, settings, table });
    const display = displaySettings(settings);
    return publishCustomerDisplayState({
      redis,
      broadcast: emitCustomerDisplay,
      mode: order.status === "paid" ? "paid" : "bill",
      durationSeconds: order.status === "paid" ? display.payment_success_seconds : 0,
      payload: { order_id: order.id, bill }
    });
  }

  async function issueReadyForOrder(orderId) {
    const ticket = (await query(
      `SELECT t.id, t.campaign_id, t.expires_at, t.issuance_index
       FROM lottery_tickets t
       WHERE t.source_order_id = $1 AND t.status = 'issued' AND t.expires_at > now()
       ORDER BY t.issued_at DESC LIMIT 1`,
      [orderId]
    ))[0];
    return ticket;
  }

  async function ensureReadyForOrder(orderId) {
    const existing = await issueReadyForOrder(orderId);
    if (existing) return { ticket: existing, additional: false };
    const order = await one("SELECT * FROM orders WHERE id = $1", [orderId]);
    if (!order) throw httpError("Order not found", 404);
    const issued = await issueAdditionalLotteryTicket({ pool, order });
    if (!issued.eligible || !issued.ticket_id) throw httpError("Order is not eligible for another lottery entry", 409);
    return {
      ticket: { id: issued.ticket_id, campaign_id: issued.campaign_id, expires_at: issued.expires_at, issuance_index: issued.issuance_index },
      additional: true
    };
  }

  async function publishLotteryReady({ orderId, ticket }) {
    const campaign = await getLotteryCampaignSnapshot(pool, ticket.campaign_id);
    if (!campaign) throw httpError("Lottery campaign not found", 409);
    const actionToken = crypto.randomBytes(18).toString("hex");
    const settings = displaySettings(await getSettings());
    return publishCustomerDisplayState({
      redis,
      broadcast: emitCustomerDisplay,
      mode: "lottery_ready",
      payload: {
        order_id: orderId,
        ticket_id: ticket.id,
        campaign,
        action_token: actionToken,
        interaction_mode: settings.interaction_mode
      },
      durationSeconds: 0
    });
  }

  async function publishLotteryInvitation(orderId) {
    const settings = displaySettings(await getSettings());
    if (!settings.lottery_invitation_enabled) throw httpError("Lottery invitation is disabled", 409);
    const ready = await ensureReadyForOrder(orderId);
    const ticket = ready.ticket;
    return publishCustomerDisplayState({
      redis,
      broadcast: emitCustomerDisplay,
      mode: "lottery_invitation",
      payload: {
        order_id: orderId,
        ticket_id: ticket.id,
        campaign_id: ticket.campaign_id,
        invitation_token: crypto.randomBytes(18).toString("hex"),
        invitation_i18n: settings.lottery_invitation_i18n,
        invitation_image_url: settings.invitation_image_url
      },
      durationSeconds: settings.lottery_invitation_seconds
    });
  }

  async function executeDraw({ ticketId, actionToken, revision, idempotencyKey, request }) {
    const state = await currentState();
    if (state.mode !== "lottery_ready") throw httpError("Lottery is not ready on the customer display", 409);
    if (Number(state.revision) !== Number(revision)) throw httpError("Customer display state has changed", 409);
    if (state.payload?.ticket_id !== ticketId || state.payload?.action_token !== actionToken) throw httpError("Invalid lottery action", 403);
    const isTest = state.payload?.test === true && Boolean(state.payload?.test_campaign_id);
    const spinning = await publishCustomerDisplayState({
      redis,
      broadcast: emitCustomerDisplay,
      mode: "lottery_spinning",
      payload: { campaign: state.payload.campaign, order_id: state.payload.order_id, test: isTest },
      durationSeconds: 0
    });
    let result;
    try {
      result = isTest
        ? await testLotteryCampaign({ pool, campaignId: state.payload.test_campaign_id })
        : await drawLottery({ pool, ticketId, idempotencyKey });
    } catch (error) {
      // The spinning state is only transitional. If validation or the draw
      // transaction fails, restore the same actionable screen so the customer
      // can retry after the POS operator resolves the cause.
      const latest = await currentState().catch(() => null);
      if (latest?.mode === "lottery_spinning" && Number(latest.revision) === Number(spinning.revision)) {
        await publishCustomerDisplayState({
          redis,
          broadcast: emitCustomerDisplay,
          mode: "lottery_ready",
          payload: state.payload,
          durationSeconds: 0
        }).catch(() => null);
      }
      throw error;
    }
    const settings = displaySettings(await getSettings());
    const completed = await publishCustomerDisplayState({
      redis,
      broadcast: emitCustomerDisplay,
      mode: "lottery_result",
      durationSeconds: settings.lottery_result_seconds,
      payload: {
        order_id: state.payload.order_id,
        test: isTest,
        campaign: state.payload.campaign,
        prize: isTest ? result.prize : result.prize_snapshot,
        wheel: isTest ? result.wheel : result.wheel_snapshot,
        winning_segment_index: isTest ? result.winning_segment_index : undefined,
        claim_code: isTest ? null : result.claim_code,
        draw_id: isTest ? null : result.draw.id
      }
    });
    if (request && !isTest) await auditLog(request, "lottery.draw.complete", "lottery_draw", result.draw.id, { ticket_suffix: state.payload.ticket_id?.slice(-4) });
    return { spinning, state: completed, result };
  }

  app.get("/customer-display/state", async () => {
    const settings = displaySettings(await getSettings());
    if (!settings.enabled) return defaultCustomerDisplayState(settings.idle_content);
    return currentState();
  });

  app.get("/customer-display/status", async (request, reply) => {
    if (!await requirePermission(request, reply, "control_customer_display")) return;
    const state = await currentState();
    return { connected: customerDisplaySockets.size > 0, connected_count: customerDisplaySockets.size, state };
  });

  app.get("/customer-display/orders/:orderId/lottery", async (request, reply) => {
    if (!await requirePermission(request, reply, "control_customer_display")) return;
    const order = await one("SELECT id, order_no, parent_order_id FROM orders WHERE id = $1", [request.params.orderId]);
    if (!order) {
      reply.code(404);
      return { error: "Order not found" };
    }
    const orderGroupId = order.parent_order_id || order.id;
    const lottery = await one(
      `SELECT t.id AS ticket_id, t.source_order_id, t.order_group_id, t.issuance_index, t.status AS ticket_status,
              t.issued_at, t.expires_at,
              d.id AS draw_id, d.prize_snapshot, d.claim_code_suffix, d.claim_expires_at,
              d.redeemed_at, d.voided_at, d.created_at AS drawn_at,
              c.title_i18n AS campaign_title_i18n
       FROM lottery_tickets t
       JOIN lottery_campaigns c ON c.id = t.campaign_id
       LEFT JOIN lottery_draws d ON d.ticket_id = t.id
       WHERE t.source_order_id = $1 OR t.order_group_id = $2
       ORDER BY (t.source_order_id = $1) DESC, t.issued_at DESC
       LIMIT 1`,
      [order.id, orderGroupId]
    );
    return {
      order_id: order.id,
      order_no: order.order_no,
      order_group_id: orderGroupId,
      lottery: lottery || null
    };
  });

  app.post("/customer-display/show-order", async (request, reply) => {
    if (!await requirePermission(request, reply, "control_customer_display")) return;
    try {
      const state = await publishOrder(request.body?.order_id);
      await auditLog(request, "customer_display.show_order", "order", request.body?.order_id, { mode: state.mode });
      return state;
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.post("/customer-display/refresh-order", async (request, reply) => {
    if (!await requirePermission(request, reply, "control_customer_display")) return;
    try {
      const orderId = request.body?.order_id;
      const state = await currentState();
      if (!shouldRefreshCustomerDisplayOrder(state, orderId)) {
        return { refreshed: false, state };
      }
      return { refreshed: true, state: await publishOrder(orderId) };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.post("/customer-display/show-lottery", async (request, reply) => {
    if (!await requirePermission(request, reply, "control_customer_display")) return;
    try {
      const orderId = request.body?.order_id;
      const ready = await ensureReadyForOrder(orderId);
      const ticket = ready.ticket;
      const billState = await publishOrder(orderId);
      const state = await publishLotteryReady({ orderId, ticket });
      await auditLog(request, "customer_display.show_lottery", "lottery_ticket", ticket.id, { order_id: orderId, previous_revision: billState.revision, additional_entry: ready.additional, issuance_index: ticket.issuance_index || null });
      return state;
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.post("/customer-display/show-lottery-invitation", async (request, reply) => {
    if (!await requirePermission(request, reply, "control_customer_display")) return;
    try {
      const orderId = request.body?.order_id;
      const state = await publishLotteryInvitation(orderId);
      await auditLog(request, "customer_display.show_lottery_invitation", "lottery_ticket", state.payload.ticket_id, { order_id: orderId });
      return state;
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.post("/customer-display/lottery-invitation/respond", async (request, reply) => {
    try {
      const state = await currentState();
      if (!customerDisplayInvitationMatches(state, {
        revision: request.body?.revision,
        token: request.body?.invitation_token
      })) throw httpError("The lottery invitation is no longer active", 409);

      if (request.body?.accepted !== true) return publishIdle();
      const ticket = await issueReadyForOrder(state.payload?.order_id);
      if (!ticket || ticket.id !== state.payload?.ticket_id) throw httpError("Lottery ticket is no longer available", 409);
      return publishLotteryReady({ orderId: state.payload.order_id, ticket });
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.post("/customer-display/start-lottery", async (request, reply) => {
    if (!await requirePermission(request, reply, "control_customer_display")) return;
    try {
      const state = await currentState();
      if (!customerDisplayMatchesOrder(state, request.body?.order_id)) {
        throw httpError("The customer display lottery belongs to a different order", 409);
      }
      const result = await executeDraw({
        ticketId: state.payload?.ticket_id,
        actionToken: state.payload?.action_token,
        revision: state.revision,
        idempotencyKey: request.body?.idempotency_key || crypto.randomUUID(),
        request
      });
      return result.state;
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.post("/customer-display/lottery/draw", async (request, reply) => {
    try {
      const state = await executeDraw({
        ticketId: request.body?.ticket_id,
        actionToken: request.body?.action_token,
        revision: request.body?.revision,
        idempotencyKey: request.body?.idempotency_key || crypto.randomUUID(),
        request: null
      });
      return state.state;
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.post("/customer-display/reset", async (request, reply) => {
    if (!await requirePermission(request, reply, "control_customer_display")) return;
    const state = await publishIdle();
    await auditLog(request, "customer_display.reset", "customer_display", null, { revision: state.revision });
    return state;
  });

  app.post("/customer-display/test", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_lottery")) return;
    const state = await publishCustomerDisplayState({
      redis,
      broadcast: emitCustomerDisplay,
      mode: "bill",
      payload: { test: true, bill: { order_no: "TEST-001", currency: "GBP", items: [], subtotal: 0, discount: 0, service_charge: 0, tax: 0, total: 0, paid: 0, remaining: 0, status: "draft" } },
      durationSeconds: 10
    });
    await auditLog(request, "customer_display.test", "customer_display", null, { revision: state.revision });
    return state;
  });
}
