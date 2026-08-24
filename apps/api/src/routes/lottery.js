import crypto from "node:crypto";
import { publishCustomerDisplayState } from "../services/customer-display.js";
import { activeLotteryCampaign, deleteLotteryCampaign, drawLottery, getLotteryCampaignSnapshot, testLotteryCampaign } from "../services/lottery.js";

function jsonObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function jsonArray(value, fallback = []) {
  return Array.isArray(value) ? JSON.stringify(value) : JSON.stringify(fallback);
}

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePrizes(prizes) {
  if (!Array.isArray(prizes)) throw fail("At least two lottery prizes are required");
  return prizes.map((prize, position) => ({
    id: prize.id ? String(prize.id) : null,
    kind: prize.kind === "no_prize" ? "no_prize" : "prize",
    name_i18n: jsonObject(prize.name_i18n),
    description_i18n: jsonObject(prize.description_i18n),
    claim_instructions_i18n: jsonObject(prize.claim_instructions_i18n),
    weight_bps: Number(prize.weight_bps),
    stock_total: prize.stock_total == null || prize.stock_total === "" ? null : Number(prize.stock_total),
    stock_awarded: Number(prize.stock_awarded || 0),
    position: Number.isInteger(Number(prize.position)) ? Number(prize.position) : position,
    background_color: String(prize.background_color || "#f59e0b"),
    text_color: String(prize.text_color || "#241b12"),
    enabled: prize.enabled !== false
  }));
}

function validatePrizes(prizes, { publish = false } = {}) {
  if (prizes.length < 2 || prizes.length > 12) throw fail("Lottery needs between 2 and 12 prizes");
  const enabled = prizes.filter((prize) => prize.enabled);
  if (enabled.some((prize) => !Number.isInteger(prize.weight_bps) || prize.weight_bps <= 0)) throw fail("Enabled prize weights must be positive integers");
  if (publish && enabled.reduce((sum, prize) => sum + prize.weight_bps, 0) !== 10000) throw fail("Prize weights must total 10000 basis points");
  const fallbacks = enabled.filter((prize) => prize.kind === "no_prize" && prize.stock_total == null);
  if (publish && fallbacks.length !== 1) throw fail("A published campaign needs exactly one unlimited no-prize fallback");
  if (enabled.some((prize) => prize.stock_total != null && (!Number.isInteger(prize.stock_total) || prize.stock_total < 0))) throw fail("Prize stock must be a non-negative integer");
  if (enabled.some((prize) => prize.stock_total != null && prize.stock_total < Number(prize.stock_awarded || 0))) throw fail("Prize stock cannot be lower than stock already awarded");
}

function campaignPayload(body = {}) {
  const startsAt = new Date(body.starts_at);
  const endsAt = new Date(body.ends_at);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw fail("Campaign start and end times are invalid");
  return {
    internal_name: String(body.internal_name || "").trim(),
    title_i18n: jsonObject(body.title_i18n),
    subtitle_i18n: jsonObject(body.subtitle_i18n),
    button_i18n: jsonObject(body.button_i18n, { "zh-CN": "开始抽奖", "en-GB": "Start draw" }),
    losing_message_i18n: jsonObject(body.losing_message_i18n, { "zh-CN": "谢谢参与", "en-GB": "Thank you for taking part" }),
    rules_i18n: jsonObject(body.rules_i18n),
    status: "draft",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    minimum_order_total: Number(body.minimum_order_total || 0),
    // PostgreSQL's `pg` driver serializes JavaScript arrays as SQL arrays.
    // These columns are JSONB, so serialize explicitly to avoid a 400 from
    // `invalid input syntax for type json` when creating a campaign.
    service_types: jsonArray(body.service_types, ["dine_in", "takeaway"]),
    excluded_payment_methods: jsonArray(body.excluded_payment_methods, ["complimentary"]),
    ticket_valid_minutes: Number(body.ticket_valid_minutes || 1440),
    claim_valid_minutes: Number(body.claim_valid_minutes || 1440),
    theme: jsonObject(body.theme)
  };
}

async function insertPrizes(client, campaignId, prizes) {
  for (const prize of prizes) {
    await client.query(
      `INSERT INTO lottery_prizes
        (campaign_id, kind, name_i18n, description_i18n, claim_instructions_i18n, weight_bps, stock_total, position, background_color, text_color, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [campaignId, prize.kind, prize.name_i18n, prize.description_i18n, prize.claim_instructions_i18n, prize.weight_bps, prize.stock_total, prize.position, prize.background_color, prize.text_color, prize.enabled]
    );
  }
}

export default function register({ app, pool, redis, query, one, requirePermission, auditLog, userFromToken, emitCustomerDisplay }) {
  app.get("/lottery/public/active", async () => {
    const campaign = await activeLotteryCampaign(pool);
    return campaign ? getLotteryCampaignSnapshot(pool, campaign.id) : null;
  });

  app.post("/lottery/public/tickets/validate", async (request, reply) => {
    const value = String(request.body?.code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (value.length < 8 || value.length > 20) {
      reply.code(400);
      return { error: "Invalid lottery code" };
    }
    const ticket = await one(
      `SELECT t.id, t.expires_at, t.status, c.id AS campaign_id
       FROM lottery_tickets t JOIN lottery_campaigns c ON c.id = t.campaign_id
       WHERE t.access_code_hash = $1 AND c.deleted_at IS NULL`,
      [crypto.createHash("sha256").update(value).digest("hex")]
    );
    if (!ticket || ticket.status !== "issued" || new Date(ticket.expires_at) <= new Date()) {
      reply.code(404);
      return { error: "Lottery code is invalid or expired" };
    }
    return { valid: true, ticket_id: ticket.id, campaign: await getLotteryCampaignSnapshot(pool, ticket.campaign_id) };
  });

  app.post("/lottery/public/draw", async (request, reply) => {
    const value = String(request.body?.code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const ticket = await one("SELECT id FROM lottery_tickets WHERE access_code_hash = $1", [crypto.createHash("sha256").update(value).digest("hex")]);
    if (!ticket) { reply.code(404); return { error: "Lottery code is invalid" }; }
    try {
      const result = await drawLottery({ pool, ticketId: ticket.id, idempotencyKey: String(request.body?.idempotency_key || crypto.randomUUID()) });
      return { draw: result.draw, prize: result.prize_snapshot, wheel: result.wheel_snapshot, claim_code: result.claim_code };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.get("/lottery/campaigns", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_lottery")) return;
    return query("SELECT * FROM lottery_campaigns WHERE deleted_at IS NULL ORDER BY created_at DESC");
  });

  app.get("/lottery/campaigns/:id", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_lottery")) return;
    const campaign = await one("SELECT * FROM lottery_campaigns WHERE id = $1 AND deleted_at IS NULL", [request.params.id]);
    if (!campaign) { reply.code(404); return { error: "Campaign not found" }; }
    return { ...campaign, prizes: await query("SELECT * FROM lottery_prizes WHERE campaign_id = $1 ORDER BY position", [campaign.id]) };
  });

  app.post("/lottery/campaigns/:id/test-draw", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_lottery")) return;
    try {
      if (request.body?.show_on_customer_display === true) {
        const campaign = await getLotteryCampaignSnapshot(pool, request.params.id);
        if (!campaign) throw fail("Campaign not found", 404);
        const ticketId = `test:${campaign.id}:${crypto.randomUUID()}`;
        const state = await publishCustomerDisplayState({
          redis,
          broadcast: emitCustomerDisplay,
          mode: "lottery_ready",
          durationSeconds: 0,
          payload: {
            test: true,
            test_campaign_id: campaign.id,
            ticket_id: ticketId,
            action_token: crypto.randomBytes(18).toString("hex"),
            campaign,
            interaction_mode: "customer_touch"
          }
        });
        return { test: true, waiting_for_customer: true, customer_display_state: state };
      }
      return testLotteryCampaign({ pool, campaignId: request.params.id });
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.post("/lottery/campaigns", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_lottery")) return;
    try {
      const campaign = campaignPayload(request.body);
      const prizes = normalizePrizes(request.body?.prizes);
      if (!campaign.internal_name) throw fail("Campaign name is required");
      validatePrizes(prizes);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO lottery_campaigns
            (internal_name, title_i18n, subtitle_i18n, button_i18n, losing_message_i18n, rules_i18n, starts_at, ends_at, minimum_order_total, service_types, excluded_payment_methods, ticket_valid_minutes, claim_valid_minutes, theme, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [campaign.internal_name, campaign.title_i18n, campaign.subtitle_i18n, campaign.button_i18n, campaign.losing_message_i18n, campaign.rules_i18n, campaign.starts_at, campaign.ends_at, campaign.minimum_order_total, campaign.service_types, campaign.excluded_payment_methods, campaign.ticket_valid_minutes, campaign.claim_valid_minutes, campaign.theme, (await userFromToken(request))?.id ?? null]
        );
        await insertPrizes(client, inserted.rows[0].id, prizes);
        await client.query("COMMIT");
        await auditLog(request, "lottery.campaign.create", "lottery_campaign", inserted.rows[0].id, { prize_count: prizes.length });
        reply.code(201);
        return { ...inserted.rows[0], prizes };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.put("/lottery/campaigns/:id", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_lottery")) return;
    const client = await pool.connect();
    try {
      const payload = campaignPayload(request.body);
      if (!payload.internal_name) throw fail("Campaign name is required");
      await client.query("BEGIN");
      const campaign = (await client.query("SELECT * FROM lottery_campaigns WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [request.params.id])).rows[0];
      if (!campaign) throw fail("Campaign not found", 404);
      if (campaign.status === "published") throw fail("Pause the campaign before editing", 409);
      if (campaign.status === "ended") throw fail("Ended campaigns cannot be edited", 409);

      const existingPrizes = (await client.query("SELECT * FROM lottery_prizes WHERE campaign_id = $1 ORDER BY position FOR UPDATE", [campaign.id])).rows;
      const existingById = new Map(existingPrizes.map((prize) => [prize.id, prize]));
      const prizes = normalizePrizes(request.body?.prizes).map((prize) => {
        if (!prize.id) return prize;
        const existing = existingById.get(prize.id);
        if (!existing) throw fail("Lottery prize does not belong to this campaign", 400);
        return { ...prize, stock_awarded: Number(existing.stock_awarded || 0) };
      });
      validatePrizes(prizes, { publish: campaign.status === "paused" });

      const updatedCampaign = (await client.query(
        `UPDATE lottery_campaigns SET
           internal_name = $2, title_i18n = $3, subtitle_i18n = $4, button_i18n = $5,
           losing_message_i18n = $6, rules_i18n = $7, starts_at = $8, ends_at = $9,
           minimum_order_total = $10, service_types = $11, excluded_payment_methods = $12,
           ticket_valid_minutes = $13, claim_valid_minutes = $14, theme = $15, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [campaign.id, payload.internal_name, payload.title_i18n, payload.subtitle_i18n, payload.button_i18n, payload.losing_message_i18n, payload.rules_i18n, payload.starts_at, payload.ends_at, payload.minimum_order_total, payload.service_types, payload.excluded_payment_methods, payload.ticket_valid_minutes, payload.claim_valid_minutes, payload.theme]
      )).rows[0];

      // Move old positions out of the active range before reordering. This
      // avoids transient UNIQUE(campaign_id, position) conflicts.
      await client.query("UPDATE lottery_prizes SET position = position + 100 WHERE campaign_id = $1", [campaign.id]);
      const keptIds = new Set();
      for (const prize of prizes) {
        if (prize.id) {
          keptIds.add(prize.id);
          await client.query(
            `UPDATE lottery_prizes SET kind = $2, name_i18n = $3, description_i18n = $4,
               claim_instructions_i18n = $5, weight_bps = $6, stock_total = $7, position = $8,
               background_color = $9, text_color = $10, enabled = $11, updated_at = now()
             WHERE id = $1`,
            [prize.id, prize.kind, prize.name_i18n, prize.description_i18n, prize.claim_instructions_i18n, prize.weight_bps, prize.stock_total, prize.position, prize.background_color, prize.text_color, prize.enabled]
          );
        } else {
          await insertPrizes(client, campaign.id, [prize]);
        }
      }

      let retiredPosition = 1000;
      for (const existing of existingPrizes) {
        if (keptIds.has(existing.id)) continue;
        const referenced = (await client.query("SELECT 1 FROM lottery_draws WHERE prize_id = $1 LIMIT 1", [existing.id])).rows[0];
        if (referenced) {
          await client.query("UPDATE lottery_prizes SET enabled = false, position = $2, updated_at = now() WHERE id = $1", [existing.id, retiredPosition]);
          retiredPosition += 1;
        } else {
          await client.query("DELETE FROM lottery_prizes WHERE id = $1", [existing.id]);
        }
      }

      await client.query("COMMIT");
      const savedPrizes = (await client.query("SELECT * FROM lottery_prizes WHERE campaign_id = $1 AND enabled = true ORDER BY position", [campaign.id])).rows;
      await auditLog(request, "lottery.campaign.update", "lottery_campaign", campaign.id, { prize_count: savedPrizes.length, status: campaign.status });
      return { ...updatedCampaign, prizes: savedPrizes };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      reply.code(error.statusCode || 400);
      return { error: error.message };
    } finally {
      client.release();
    }
  });

  app.post("/lottery/campaigns/:id/publish", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_lottery")) return;
    try {
      const campaign = await one("SELECT * FROM lottery_campaigns WHERE id = $1 AND deleted_at IS NULL", [request.params.id]);
      if (!campaign) throw fail("Campaign not found", 404);
      const prizes = await query("SELECT * FROM lottery_prizes WHERE campaign_id = $1 AND enabled = true ORDER BY position", [campaign.id]);
      validatePrizes(prizes.map((prize) => ({ ...prize, weight_bps: Number(prize.weight_bps), stock_total: prize.stock_total == null ? null : Number(prize.stock_total) })), { publish: true });
      const overlap = await one(
        `SELECT id FROM lottery_campaigns
         WHERE id <> $1 AND deleted_at IS NULL AND status = 'published' AND starts_at < $3 AND ends_at > $2 LIMIT 1`,
        [campaign.id, campaign.starts_at, campaign.ends_at]
      );
      if (overlap) throw fail("Another published campaign overlaps this time range", 409);
      const updated = await one("UPDATE lottery_campaigns SET status = 'published', published_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *", [campaign.id]);
      await auditLog(request, "lottery.campaign.publish", "lottery_campaign", campaign.id, {});
      return updated;
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  for (const [path, status, action] of [
    ["pause", "paused", "lottery.campaign.pause"],
    ["resume", "published", "lottery.campaign.resume"],
    ["end", "ended", "lottery.campaign.end"]
  ]) {
    app.post(`/lottery/campaigns/:id/${path}`, async (request, reply) => {
      if (!await requirePermission(request, reply, "manage_lottery")) return;
      const updated = await one("UPDATE lottery_campaigns SET status = $2, ended_at = CASE WHEN $2 = 'ended' THEN now() ELSE ended_at END, updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *", [request.params.id, status]);
      if (!updated) { reply.code(404); return { error: "Campaign not found" }; }
      await auditLog(request, action, "lottery_campaign", updated.id, { status });
      return updated;
    });
  }

  app.delete("/lottery/campaigns/:id", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_lottery")) return;
    try {
      const result = await deleteLotteryCampaign({ pool, campaignId: request.params.id });
      await auditLog(request, "lottery.campaign.delete", "lottery_campaign", result.id, { revoked_ticket_count: result.revoked_ticket_count });
      return result;
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { error: error.message };
    }
  });

  app.get("/lottery/draws", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_lottery")) return;
    return query(
      `SELECT d.id, d.campaign_id, d.prize_id, d.claim_code_suffix, d.claim_expires_at, d.redeemed_at, d.created_at,
              d.prize_snapshot, t.access_code_suffix, t.source_order_id,
              p.kind AS prize_kind, p.name_i18n AS prize_name_i18n,
              c.title_i18n AS campaign_title_i18n,
              source_order.order_no AS source_order_no
       FROM lottery_draws d
       JOIN lottery_tickets t ON t.id = d.ticket_id
       JOIN lottery_prizes p ON p.id = d.prize_id
       JOIN lottery_campaigns c ON c.id = d.campaign_id
       JOIN orders source_order ON source_order.id = t.source_order_id
       ORDER BY d.created_at DESC LIMIT 500`
    );
  });

  app.post("/lottery/draws/:id/redeem", async (request, reply) => {
    if (!await requirePermission(request, reply, "redeem_lottery")) return;
    const actor = await userFromToken(request);
    const draw = await one("SELECT * FROM lottery_draws WHERE id = $1", [request.params.id]);
    if (!draw) { reply.code(404); return { error: "Draw not found" }; }
    if (draw.redeemed_at) return { ...draw, already_redeemed: true };
    if (draw.claim_expires_at && new Date(draw.claim_expires_at) <= new Date()) { reply.code(409); return { error: "Prize claim has expired" }; }
    const updated = await one("UPDATE lottery_draws SET redeemed_at = now(), redeemed_by = $2 WHERE id = $1 AND redeemed_at IS NULL RETURNING *", [draw.id, actor?.id ?? null]);
    await auditLog(request, "lottery.prize.redeem", "lottery_draw", draw.id, { redeemed_by: actor?.id ?? null });
    return updated ?? draw;
  });
}
