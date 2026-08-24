import crypto from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function code(length = 12) {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return result;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function jsonValue(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

function activeCampaignWhere(now = new Date()) {
  return [now.toISOString()];
}

export function lotteryClaimCodeRequired(prize) {
  return prize?.kind === "prize" && prize?.fulfillment_type !== "instant";
}

export async function activeLotteryCampaign(pool, now = new Date()) {
  const result = await pool.query(
    `SELECT * FROM lottery_campaigns
     WHERE deleted_at IS NULL AND status = 'published' AND starts_at <= $1 AND ends_at > $1
     ORDER BY starts_at DESC LIMIT 1`,
    activeCampaignWhere(now)
  );
  return result.rows[0] ?? null;
}

export async function assertNoOverlappingLotteryCampaign(client, campaign) {
  // Serialize campaign activation so two simultaneous publish/resume requests
  // cannot both pass the overlap check before either update is visible.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["lottery_campaign_schedule"]);
  const overlap = (await client.query(
    `SELECT id FROM lottery_campaigns
     WHERE id <> $1 AND deleted_at IS NULL AND status = 'published'
       AND starts_at < $3 AND ends_at > $2
     LIMIT 1`,
    [campaign.id, campaign.starts_at, campaign.ends_at]
  )).rows[0];
  if (overlap) {
    throw Object.assign(
      new Error("Only one lottery campaign can run at a time. Pause or end the overlapping campaign first."),
      { statusCode: 409, code: "LOTTERY_CAMPAIGN_OVERLAP" }
    );
  }
}

export async function getLotteryCampaignSnapshot(pool, campaignId) {
  const campaign = (await pool.query("SELECT * FROM lottery_campaigns WHERE id = $1 AND deleted_at IS NULL", [campaignId])).rows[0];
  if (!campaign) return null;
  const prizes = (await pool.query(
    `SELECT id, kind, fulfillment_type, name_i18n, description_i18n, claim_instructions_i18n,
            weight_bps, stock_total, stock_awarded, position, background_color, text_color, enabled
       FROM lottery_prizes WHERE campaign_id = $1 AND enabled = true ORDER BY position`,
    [campaignId]
  )).rows;
  return {
    id: campaign.id,
    title_i18n: jsonValue(campaign.title_i18n),
    subtitle_i18n: jsonValue(campaign.subtitle_i18n),
    button_i18n: jsonValue(campaign.button_i18n),
    losing_message_i18n: jsonValue(campaign.losing_message_i18n),
    rules_i18n: jsonValue(campaign.rules_i18n),
    theme: jsonValue(campaign.theme),
    prizes: prizes.map((prize) => ({
      id: prize.id,
      kind: prize.kind,
      fulfillment_type: prize.kind === "prize" ? prize.fulfillment_type || "voucher" : null,
      name_i18n: jsonValue(prize.name_i18n),
      description_i18n: jsonValue(prize.description_i18n),
      weight_bps: Number(prize.weight_bps),
      background_color: prize.background_color,
      text_color: prize.text_color,
      position: Number(prize.position),
      stock_remaining: prize.stock_total == null ? null : Math.max(0, Number(prize.stock_total) - Number(prize.stock_awarded))
    }))
  };
}

async function eligibleLotteryContext({ pool, order, now = new Date() }) {
  if (!order || order.status !== "paid") return { eligible: false, reason: "order_not_paid" };
  if (order.service_type !== "dine_in" && order.service_type !== "takeaway") return { eligible: false, reason: "service_type_not_eligible" };
  const campaign = await activeLotteryCampaign(pool, now);
  if (!campaign || Number(order.total) < Number(campaign.minimum_order_total)) return { eligible: false, reason: "no_active_campaign" };
  const serviceTypes = Array.isArray(campaign.service_types) ? campaign.service_types : ["dine_in", "takeaway"];
  if (!serviceTypes.includes(order.service_type)) return { eligible: false, reason: "service_type_not_in_campaign" };
  const excluded = Array.isArray(campaign.excluded_payment_methods) ? campaign.excluded_payment_methods : ["complimentary"];
  if (excluded.includes("complimentary") && Number(order.total) === 0) return { eligible: false, reason: "payment_method_excluded" };

  const orderGroupId = order.parent_order_id || order.id;
  if (order.parent_order_id) {
    const groupOrders = (await pool.query(
      "SELECT status FROM orders WHERE id = $1 OR parent_order_id = $1",
      [order.parent_order_id]
    )).rows;
    if (groupOrders.some((member) => member.status !== "paid")) {
      return { eligible: false, reason: "order_group_not_fully_paid" };
    }
  }
  return { eligible: true, campaign, order_group_id: orderGroupId };
}

export async function issueLotteryTicket({ pool, order, now = new Date() }) {
  const context = await eligibleLotteryContext({ pool, order, now });
  if (!context.eligible) return context;
  const { campaign, order_group_id: orderGroupId } = context;
  const existing = (await pool.query(
    "SELECT id, access_code_suffix, expires_at, status FROM lottery_tickets WHERE campaign_id = $1 AND order_group_id = $2 AND issuance_index = 1",
    [campaign.id, orderGroupId]
  )).rows[0];
  if (existing) return { eligible: true, duplicate: true, ticket_id: existing.id, expires_at: existing.expires_at, code: null };

  const plainCode = code();
  const expiresAt = new Date(now.getTime() + Number(campaign.ticket_valid_minutes || 1440) * 60_000);
  const inserted = await pool.query(
    `INSERT INTO lottery_tickets
      (campaign_id, order_group_id, source_order_id, access_code_hash, access_code_suffix, expires_at, issuance_index)
     VALUES ($1, $2, $3, $4, $5, $6, 1)
     ON CONFLICT (campaign_id, order_group_id, issuance_index) DO NOTHING
     RETURNING id, expires_at`,
    [campaign.id, orderGroupId, order.id, hash(plainCode), plainCode.slice(-4), expiresAt.toISOString()]
  );
  if (!inserted.rows[0]) {
    const duplicate = (await pool.query(
      "SELECT id, expires_at FROM lottery_tickets WHERE campaign_id = $1 AND order_group_id = $2 AND issuance_index = 1",
      [campaign.id, orderGroupId]
    )).rows[0];
    return { eligible: true, duplicate: true, ticket_id: duplicate?.id ?? null, expires_at: duplicate?.expires_at ?? null, code: null };
  }
  return {
    eligible: true,
    duplicate: false,
    ticket_id: inserted.rows[0].id,
    expires_at: inserted.rows[0].expires_at,
    code: plainCode,
    campaign_id: campaign.id
  };
}

export async function issueAdditionalLotteryTicket({ pool, order, now = new Date() }) {
  const context = await eligibleLotteryContext({ pool, order, now });
  if (!context.eligible) return context;
  const { campaign, order_group_id: orderGroupId } = context;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${campaign.id}:${orderGroupId}`]);
    const issuance = (await client.query(
      "SELECT COALESCE(MAX(issuance_index), 0)::integer + 1 AS next_index FROM lottery_tickets WHERE campaign_id = $1 AND order_group_id = $2",
      [campaign.id, orderGroupId]
    )).rows[0]?.next_index || 1;
    const plainCode = code();
    const expiresAt = new Date(now.getTime() + Number(campaign.ticket_valid_minutes || 1440) * 60_000);
    const ticket = (await client.query(
      `INSERT INTO lottery_tickets
        (campaign_id, order_group_id, source_order_id, access_code_hash, access_code_suffix, expires_at, issuance_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, expires_at, issuance_index`,
      [campaign.id, orderGroupId, order.id, hash(plainCode), plainCode.slice(-4), expiresAt.toISOString(), issuance]
    )).rows[0];
    await client.query("COMMIT");
    return {
      eligible: true,
      duplicate: false,
      additional: true,
      ticket_id: ticket.id,
      issuance_index: Number(ticket.issuance_index),
      expires_at: ticket.expires_at,
      code: plainCode,
      campaign_id: campaign.id
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function makeWheelSnapshot(prizes, fallbackId) {
  const segments = [];
  let cursor = 0;
  for (const prize of prizes) {
    const weight = Number(prize.weight_bps);
    const exhausted = prize.stock_total != null && Number(prize.stock_awarded) >= Number(prize.stock_total);
    const effectivePrize = exhausted ? prizes.find((candidate) => candidate.id === fallbackId) : prize;
    segments.push({
      prize_id: prize.id,
      effective_prize_id: effectivePrize.id,
      start_bps: cursor,
      end_bps: cursor + weight,
      name_i18n: jsonValue(effectivePrize.name_i18n),
      kind: effectivePrize.kind,
      fulfillment_type: effectivePrize.kind === "prize" ? effectivePrize.fulfillment_type || "voucher" : null,
      background_color: effectivePrize.background_color,
      text_color: effectivePrize.text_color,
      weight_bps: weight
    });
    cursor += weight;
  }
  return { total_weight_bps: cursor, segments };
}

export function selectLotteryOutcome(prizes, randomInt = crypto.randomInt) {
  if (prizes.length < 2) throw Object.assign(new Error("Lottery campaign is not publishable"), { statusCode: 409 });
  const available = prizes.filter((prize) => prize.stock_total == null || Number(prize.stock_awarded) < Number(prize.stock_total));
  const fallback = available.find((prize) => prize.kind === "no_prize" && prize.stock_total == null) || available[0];
  if (!fallback) throw Object.assign(new Error("Lottery campaign has no remaining prize stock"), { statusCode: 409 });
  const wheel = makeWheelSnapshot(prizes, fallback.id);
  if (wheel.total_weight_bps !== 10000) throw Object.assign(new Error("Lottery probability total must equal 10000"), { statusCode: 409 });
  const bucket = randomInt(0, wheel.total_weight_bps);
  const winningSegmentIndex = Math.max(0, wheel.segments.findIndex((candidate) => bucket >= candidate.start_bps && bucket < candidate.end_bps));
  const segment = wheel.segments[winningSegmentIndex] ?? wheel.segments.at(-1);
  const prize = prizes.find((candidate) => candidate.id === segment.effective_prize_id) ?? fallback;
  return { bucket, fallback, prize, segment, wheel, winning_segment_index: winningSegmentIndex };
}

export async function testLotteryCampaign({ pool, campaignId }) {
  const campaign = (await pool.query("SELECT * FROM lottery_campaigns WHERE id = $1 AND deleted_at IS NULL", [campaignId])).rows[0];
  if (!campaign) throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });
  const prizes = (await pool.query(
    "SELECT * FROM lottery_prizes WHERE campaign_id = $1 AND enabled = true ORDER BY position",
    [campaign.id]
  )).rows;
  const outcome = selectLotteryOutcome(prizes);
  return {
    test: true,
    campaign: {
      id: campaign.id,
      internal_name: campaign.internal_name,
      title_i18n: jsonValue(campaign.title_i18n)
    },
    prize: {
      id: outcome.prize.id,
      kind: outcome.prize.kind,
      fulfillment_type: outcome.prize.kind === "prize" ? outcome.prize.fulfillment_type || "voucher" : null,
      name_i18n: jsonValue(outcome.prize.name_i18n),
      description_i18n: jsonValue(outcome.prize.description_i18n),
      background_color: outcome.prize.background_color,
      text_color: outcome.prize.text_color
    },
    wheel: outcome.wheel,
    winning_segment_index: outcome.winning_segment_index
  };
}

export async function deleteLotteryCampaign({ pool, campaignId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const campaign = (await client.query(
      `UPDATE lottery_campaigns
       SET deleted_at = now(), status = 'ended', ended_at = COALESCE(ended_at, now()), updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [campaignId]
    )).rows[0];
    if (!campaign) throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });
    const revoked = await client.query(
      "UPDATE lottery_tickets SET status = 'revoked', revoked_at = now() WHERE campaign_id = $1 AND status = 'issued' RETURNING id",
      [campaign.id]
    );
    await client.query("COMMIT");
    return { deleted: true, id: campaign.id, revoked_ticket_count: revoked.rowCount };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function drawLottery({ pool, ticketId, idempotencyKey, now = new Date() }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ticketResult = await client.query("SELECT * FROM lottery_tickets WHERE id = $1 FOR UPDATE", [ticketId]);
    const ticket = ticketResult.rows[0];
    if (!ticket) throw Object.assign(new Error("Lottery ticket not found"), { statusCode: 404 });

    const existingResult = await client.query("SELECT * FROM lottery_draws WHERE ticket_id = $1", [ticket.id]);
    if (existingResult.rows[0]) {
      await client.query("COMMIT");
      return {
        duplicate: true,
        draw: existingResult.rows[0],
        claim_code: null,
        prize_snapshot: existingResult.rows[0].prize_snapshot,
        wheel_snapshot: existingResult.rows[0].wheel_snapshot
      };
    }
    if (ticket.status !== "issued") throw Object.assign(new Error("Lottery ticket is no longer available"), { statusCode: 409 });
    if (new Date(ticket.expires_at).getTime() <= now.getTime()) {
      await client.query("UPDATE lottery_tickets SET status = 'expired' WHERE id = $1", [ticket.id]);
      throw Object.assign(new Error("Lottery ticket has expired"), { statusCode: 409 });
    }

    const campaign = (await client.query("SELECT * FROM lottery_campaigns WHERE id = $1 FOR UPDATE", [ticket.campaign_id])).rows[0];
    if (!campaign || campaign.deleted_at || campaign.status === "paused" || campaign.status === "ended") {
      throw Object.assign(new Error("Lottery campaign is unavailable"), { statusCode: 409 });
    }
    const prizes = (await client.query(
      "SELECT * FROM lottery_prizes WHERE campaign_id = $1 AND enabled = true ORDER BY position FOR UPDATE",
      [campaign.id]
    )).rows;
    const outcome = selectLotteryOutcome(prizes);
    const wheel = outcome.wheel;
    let prize = outcome.prize;
    if (prize.stock_total != null) {
      const updated = await client.query(
        "UPDATE lottery_prizes SET stock_awarded = stock_awarded + 1, updated_at = now() WHERE id = $1 AND stock_awarded < stock_total RETURNING *",
        [prize.id]
      );
      if (!updated.rows[0]) throw Object.assign(new Error("Lottery campaign has no remaining prize stock"), { statusCode: 409 });
      prize = updated.rows[0];
    }
    const fulfillmentType = prize.kind === "prize" ? prize.fulfillment_type || "voucher" : null;
    const claimCode = lotteryClaimCodeRequired(prize) ? code(8) : null;
    const claimExpiresAt = claimCode
      ? new Date(now.getTime() + Number(campaign.claim_valid_minutes || 1440) * 60_000)
      : null;
    const prizeSnapshot = {
      id: prize.id,
      kind: prize.kind,
      fulfillment_type: fulfillmentType,
      name_i18n: jsonValue(prize.name_i18n),
      description_i18n: jsonValue(prize.description_i18n),
      claim_instructions_i18n: jsonValue(prize.claim_instructions_i18n),
      background_color: prize.background_color,
      text_color: prize.text_color,
      claim_expires_at: claimExpiresAt?.toISOString() ?? null
    };
    const drawResult = await client.query(
      `INSERT INTO lottery_draws
        (ticket_id, campaign_id, prize_id, idempotency_key, prize_snapshot, wheel_snapshot,
         claim_code_hash, claim_code_suffix, claim_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [ticket.id, campaign.id, prize.id, String(idempotencyKey || crypto.randomUUID()), prizeSnapshot, wheel, claimCode ? hash(claimCode) : null, claimCode?.slice(-4) ?? null, claimExpiresAt?.toISOString() ?? null]
    );
    await client.query("UPDATE lottery_tickets SET status = 'used', used_at = now() WHERE id = $1", [ticket.id]);
    await client.query("COMMIT");
    return { duplicate: false, draw: drawResult.rows[0], claim_code: claimCode, prize_snapshot: prizeSnapshot, wheel_snapshot: wheel };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
