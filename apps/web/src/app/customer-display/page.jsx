"use client";

import { AlertCircle, CircleCheck, Gift, Loader2, Receipt, Sparkles, Trophy, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, labelOf } from "../../lib/api";
import qyposLogo from "../../pic/logo.png";
import { distinctAdjacentWheelColors, equalWheelSliceBounds, lotterySafeStopAngle, lotteryWheelLabelLayout, lotteryWheelSeparatorWidth, LOTTERY_SPIN_MS, lotteryDrawPayload, lotteryPresentationPhase, lotteryTickSchedule, lotteryWheelRotation } from "./customer-display-helpers";
import "./customer-display.css";

const FALLBACK_STATE = {
  revision: 0,
  mode: "idle",
  visible_until: null,
  payload: {}
};

const CUSTOMER_DISPLAY_POLL_MS = 1000;
const LOTTERY_RESULT_SOUND_DELAY_MS = 220;
const CUSTOMER_DISPLAY_EVENTS = new Set([
  "customer_display.idle",
  "customer_display.bill",
  "customer_display.paid",
  "customer_display.lottery_invitation",
  "customer_display.lottery_ready",
  "customer_display.lottery_spinning",
  "customer_display.lottery_result",
  "customer_display.state"
]);

function text(locale, zh, en) {
  return locale === "en-GB" ? en : zh;
}

function bilingual(zh, en) {
  return `${zh} / ${en}`;
}

function bilingualLabel(value, fallbackZh, fallbackEn) {
  const zh = labelOf(value, "zh-CN") || fallbackZh;
  const en = labelOf(value, "en-GB") || fallbackEn;
  return bilingual(zh, en);
}

function customerDisplayWebsocketUrl() {
  if (typeof window === "undefined") return "";
  const configured = String(process.env.NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_URL || "").trim();
  const port = String(process.env.NEXT_PUBLIC_CUSTOMER_DISPLAY_WS_PORT || "4000").trim();
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostname = window.location.hostname.includes(":") ? `[${window.location.hostname}]` : window.location.hostname;
  const fallback = `${protocol}//${hostname}:${port}`;
  const url = new URL(configured || fallback, window.location.origin);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  const path = "/ws/customer-display";
  if (!url.pathname.endsWith(path)) url.pathname = `${url.pathname.replace(/\/+$/, "")}${path}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function money(value, currency = "GBP", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  }).format(Number(value || 0));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function invitationTimeoutSeconds(payload) {
  const value = Number(
    payload?.invitation_seconds
    ?? payload?.settings?.lottery_invitation_seconds
    ?? payload?.settings?.customer_display_lottery_invitation_seconds
    ?? payload?.customer_display_lottery_invitation_seconds
    ?? 10
  );
  return Math.min(60, Math.max(1, Number.isFinite(value) ? value : 10));
}

function logoSource(value) {
  // The API's default is a legacy public path; the bundled QYPOS logo is a
  // Next static asset and must use its emitted hashed URL in the browser.
  return !value || value === "/pic/logo.png" ? qyposLogo.src : value;
}

function audioContextConstructor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

function playWheelTick(context, progress = 0) {
  if (!context || context.state === "closed") return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(1080 - Math.min(1, progress) * 500, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.075, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.06);
}

function playWheelBell(context) {
  if (!context || context.state === "closed") return;
  const now = context.currentTime;
  for (const [frequency, volume, delay] of [[880, 0.08, 0], [1320, 0.045, 0.08], [1760, 0.025, 0.16]]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + delay);
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(volume * 1.35, now + delay + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.9);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + 0.95);
  }
}

function normalizeItem(item, locale, currency) {
  const nameValue = item?.name_i18n || item?.name;
  const variantValue = item?.variant_name_i18n || item?.variant_name;
  return {
    id: item?.id || item?.order_item_id || `${labelOf(item?.name_i18n, locale)}-${item?.quantity || 1}`,
    name: labelOf(nameValue, locale),
    nameZh: labelOf(nameValue, "zh-CN"),
    nameEn: labelOf(nameValue, "en-GB"),
    variant: labelOf(variantValue, locale),
    variantZh: labelOf(variantValue, "zh-CN"),
    variantEn: labelOf(variantValue, "en-GB"),
    quantity: toNumber(item?.quantity, 1),
    unitPrice: toNumber(item?.unit_price ?? item?.price),
    lineTotal: toNumber(item?.line_total ?? item?.total ?? item?.amount),
    modifiers: Array.isArray(item?.modifiers)
      ? item.modifiers.map((modifier, index) => ({
          id: modifier?.id || modifier?.modifier_id || `${index}`,
          name: labelOf(modifier?.name_i18n || modifier?.name, locale),
          nameZh: labelOf(modifier?.name_i18n || modifier?.name, "zh-CN"),
          nameEn: labelOf(modifier?.name_i18n || modifier?.name, "en-GB"),
          quantity: toNumber(modifier?.quantity ?? modifier?.count, 1),
          priceDelta: toNumber(modifier?.price_delta),
          currency
        }))
      : []
  };
}

function normalizeTotals(payload, locale, currency) {
  const totals = payload?.totals || payload || {};
  return {
    subtotal: toNumber(totals?.subtotal),
    discount: toNumber(totals?.discount),
    serviceCharge: toNumber(totals?.service_charge ?? totals?.serviceCharge),
    tax: toNumber(totals?.tax ?? totals?.tax_amount),
    total: toNumber(totals?.total),
    paid: toNumber(totals?.paid ?? totals?.paid_amount),
    balance: toNumber(totals?.balance ?? totals?.due ?? totals?.pending_amount),
    currency,
    locale
  };
}

function normalizeWheelSegments(payload, locale) {
  const rawSegments = payload?.wheel?.segments || payload?.wheel_snapshot?.segments || payload?.segments || payload?.prize_snapshot?.wheel_segments || payload?.campaign?.prizes || [];
  const fallbackColors = ["#f97316", "#0f766e", "#ca8a04", "#2563eb", "#be123c", "#7c3aed"];
  const segments = rawSegments.map((segment, index) => {
    const weight = Math.max(1, toNumber(segment?.weight_bps ?? segment?.weight ?? segment?.range_size ?? segment?.probability_units, 1));
    const nameValue = segment?.label_i18n || segment?.title_i18n || segment?.name_i18n || segment?.label || segment?.name;
    const kind = segment?.kind || segment?.type || (segment?.is_no_prize ? "no_prize" : "prize");
    const labelZh = labelOf(nameValue, "zh-CN") || "谢谢参与";
    const storedEnglish = labelOf(nameValue, "en-GB");
    const labelEn = kind === "no_prize" && (!storedEnglish || storedEnglish === "Try again") ? "Thank you" : storedEnglish || "Thank you";
    return {
      id: segment?.id || segment?.prize_id || `${index}`,
      label: locale === "en-GB" ? labelEn : labelZh,
      labelZh,
      labelEn,
      type: kind,
      color: segment?.background_color || segment?.color || segment?.hex_color || fallbackColors[index % fallbackColors.length],
      textColor: segment?.text_color || "#fffaf0",
      weight,
      prizeId: segment?.prize_id || segment?.id,
      effectivePrizeId: segment?.effective_prize_id || segment?.effectivePrizeId || segment?.prize_id || segment?.id
    };
  });
  const displayColors = distinctAdjacentWheelColors(segments.map((segment) => segment.color), fallbackColors);
  return segments.map((segment, index) => ({ ...segment, color: displayColors[index] }));
}

function resolveWinningIndex(payload, segments) {
  const explicitIndex = toNumber(payload?.winning_segment_index ?? payload?.result_segment_index, -1);
  if (explicitIndex >= 0 && explicitIndex < segments.length) return explicitIndex;
  const prizeId = payload?.prize?.id || payload?.prize_id || payload?.draw?.prize_id;
  if (prizeId) {
    const matchedIndex = segments.findIndex((segment) => segment.prizeId === prizeId || segment.effectivePrizeId === prizeId || segment.id === prizeId);
    if (matchedIndex >= 0) return matchedIndex;
  }
  return segments.findIndex((segment) => segment.type === "no_prize");
}

function resolveTargetAngle(payload, segments, revision) {
  const explicitAngle = Number(payload?.pointer_angle ?? payload?.target_angle ?? payload?.stop_angle ?? payload?.result_angle);
  if (Number.isFinite(explicitAngle)) return explicitAngle;
  if (!segments.length) return 0;
  const winningIndex = Math.max(0, resolveWinningIndex(payload, segments));
  return lotterySafeStopAngle(
    winningIndex,
    segments.length,
    payload?.draw_id || payload?.ticket_id || `revision:${revision}`
  );
}

function sanitizeState(source) {
  const revision = toNumber(source?.revision, 0);
  const mode = typeof source?.mode === "string" ? source.mode : "idle";
  const visibleUntil = toIsoOrNull(source?.visible_until);
  const payload = source?.payload && typeof source.payload === "object" ? source.payload : {};
  const locale = payload?.locale || payload?.settings?.locale || "zh-CN";
  const currency = payload?.currency || payload?.settings?.currency || "GBP";
  const bill = payload?.bill && typeof payload.bill === "object" ? payload.bill : payload;
  const order = payload?.order || bill?.order || {};
  const billItems = Array.isArray(bill?.items || order?.items) ? bill.items || order.items : [];
  const wheelSegments = normalizeWheelSegments(payload, locale);
  const rawSpinDurationSeconds = Number(payload?.spin_duration_seconds ?? payload?.campaign?.spin_duration_seconds ?? 10);
  const spinDurationMs = Math.min(30000, Math.max(3000, Number.isFinite(rawSpinDurationSeconds) ? rawSpinDurationSeconds * 1000 : LOTTERY_SPIN_MS));

  return {
    revision,
    mode,
    visible_until: visibleUntil,
    payload: {
      locale,
      currency,
      restaurantName: labelOf(payload?.restaurant_name_i18n || payload?.restaurant_name || payload?.brand?.name_i18n, locale) || "QYPOS",
      logoUrl: payload?.logo_url || payload?.idle_content?.logo_url || "/pic/logo.png",
      invitationImageUrl: payload?.invitation_image_url || payload?.review_image_url || payload?.idle_content?.review_image_url || "/customer-display/default-review-qr.png",
      welcomeTitle: labelOf(payload?.idle_content?.title_i18n || payload?.welcome_title_i18n || payload?.title_i18n, locale),
      welcomeTitleI18n: payload?.idle_content?.title_i18n || payload?.welcome_title_i18n || payload?.title_i18n || {},
      welcomeMessage: labelOf(payload?.idle_content?.message_i18n || payload?.idle_content?.subtitle_i18n || payload?.welcome_message_i18n || payload?.brand?.welcome_i18n || payload?.subtitle_i18n, locale),
      welcomeMessageI18n: payload?.idle_content?.message_i18n || payload?.idle_content?.subtitle_i18n || payload?.welcome_message_i18n || payload?.brand?.welcome_i18n || payload?.subtitle_i18n || {},
      invitationI18n: payload?.invitation_i18n || {},
      invitationTimeoutSeconds: invitationTimeoutSeconds(payload),
      orderNumber: order?.order_number || bill?.order_no || payload?.order_number || payload?.display_order_number || "",
      serviceType: order?.service_type || bill?.service_type || payload?.service_type || "",
      tableLabel: order?.table_name || bill?.table_label || payload?.table_name || payload?.table_label || "",
      paid: Boolean(payload?.paid ?? bill?.paid ?? order?.paid ?? mode === "paid"),
      items: billItems.map((item) => normalizeItem(item, locale, currency)),
      totals: normalizeTotals(bill?.totals || order?.totals || bill, locale, currency),
      campaignTitle: labelOf(payload?.campaign?.title_i18n || payload?.campaign_title_i18n, locale),
      campaignTitleI18n: payload?.campaign?.title_i18n || payload?.campaign_title_i18n || {},
      campaignSubtitle: labelOf(payload?.campaign?.subtitle_i18n || payload?.campaign_subtitle_i18n, locale),
      campaignSubtitleI18n: payload?.campaign?.subtitle_i18n || payload?.campaign_subtitle_i18n || {},
      buttonText:
        labelOf(payload?.button_i18n || payload?.campaign?.button_i18n, locale) || text(locale, "点击开始抽奖", "Tap to start"),
      buttonI18n: payload?.button_i18n || payload?.campaign?.button_i18n || {},
      resultTitle:
        labelOf(payload?.result_title_i18n || payload?.prize?.title_i18n || payload?.prize_snapshot?.title_i18n, locale) ||
        labelOf(payload?.prize?.name_i18n || payload?.prize_snapshot?.name_i18n, locale),
      resultTitleI18n:
        payload?.result_title_i18n || payload?.prize?.title_i18n || payload?.prize_snapshot?.title_i18n ||
        payload?.prize?.name_i18n || payload?.prize_snapshot?.name_i18n || {},
      resultKind: payload?.prize?.kind || payload?.prize_snapshot?.kind || payload?.draw?.prize_snapshot?.kind || "prize",
      resultFulfillmentType: payload?.prize?.fulfillment_type || payload?.prize_snapshot?.fulfillment_type || null,
      resultMessage:
        labelOf(payload?.result_message_i18n || payload?.prize?.message_i18n || payload?.prize_snapshot?.message_i18n, locale) ||
        labelOf(payload?.losing_message_i18n, locale),
      rules: labelOf(payload?.rules_i18n || payload?.campaign?.rules_i18n, locale),
      rulesI18n: payload?.rules_i18n || payload?.campaign?.rules_i18n || {},
      claimCode: payload?.claim_code || payload?.claimCode || "",
      wheelSegments,
      targetAngle: resolveTargetAngle(payload, wheelSegments, revision),
      winningIndex: resolveWinningIndex(payload, wheelSegments),
      ticketId: payload?.ticket_id || null,
      actionToken: payload?.action_token || null,
      invitationToken: payload?.invitation_token || null,
      spinDurationMs,
      claimExpiresAt: toIsoOrNull(payload?.claim_expires_at || payload?.result_expires_at),
      disconnected: Boolean(payload?.disconnected || mode === "disconnected")
    }
  };
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  return reducedMotion;
}

function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(timer);
  }, [tickMs]);
  return now;
}

function Wheel({ state, spinning, reducedMotion, interactive, onSwipe, onGesture, ariaLabel }) {
  const [dragRotation, setDragRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const segments = state.payload.wheelSegments;
  const cumulative = segments.map((segment, index) => ({ ...segment, ...equalWheelSliceBounds(index, segments.length) }));

  const baseRotation = lotteryWheelRotation(state.mode, spinning, state.payload.targetAngle);
  const rotation = baseRotation + dragRotation;

  function pointerAngle(event, element) {
    const rect = element.getBoundingClientRect();
    return (Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * 180) / Math.PI;
  }

  function beginDrag(event) {
    if (!interactive || spinning || dragRef.current) return;
    void onGesture?.();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, lastAngle: pointerAngle(event, event.currentTarget), distance: 0 };
    setDragging(true);
    setDragRotation(0);
  }

  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    let delta = pointerAngle(event, event.currentTarget) - drag.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    drag.lastAngle += delta;
    drag.distance += Math.abs(delta);
    setDragRotation((current) => current + delta);
  }

  function endDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
    setDragRotation(0);
    if (drag.distance >= 18) onSwipe?.();
  }

  return (
    <div
      className={`customer-display-wheel-shell${interactive ? " is-interactive" : ""}${dragging ? " is-dragging" : ""}`}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? ariaLabel : undefined}
    >
      <div
        className={`customer-display-wheel${spinning ? " is-spinning" : ""}${reducedMotion ? " is-reduced-motion" : ""}`}
        style={{
          transform: `rotate(${rotation}deg)`,
          transitionDuration: dragging ? "0ms" : spinning ? reducedMotion ? "220ms" : `${state.payload.spinDurationMs || LOTTERY_SPIN_MS}ms` : "0ms"
        }}
        aria-hidden={interactive ? undefined : "true"}
      >
        <svg viewBox="0 0 100 100" className="customer-display-wheel-svg">
          {cumulative.map((segment) => {
            const startAngle = segment.start * Math.PI * 2 - Math.PI / 2;
            const endAngle = segment.end * Math.PI * 2 - Math.PI / 2;
            const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
            const x1 = 50 + Math.cos(startAngle) * 46;
            const y1 = 50 + Math.sin(startAngle) * 46;
            const x2 = 50 + Math.cos(endAngle) * 46;
            const y2 = 50 + Math.sin(endAngle) * 46;
            const midAngle = (startAngle + endAngle) / 2;
            const midAngleDegrees = (midAngle * 180) / Math.PI;
            const labelLayout = lotteryWheelLabelLayout(segments.length, segment.labelZh, segment.labelEn, midAngleDegrees);
            const labelX = 50 + Math.cos(midAngle) * labelLayout.radius;
            const labelY = 50 + Math.sin(midAngle) * labelLayout.radius;
            const labelTransform = `rotate(${labelLayout.rotation}, ${labelX}, ${labelY})`;

            return (
              <g key={segment.id}>
                <path d={`M 50 50 L ${x1} ${y1} A 46 46 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={segment.color} />
                <text
                  x={labelX}
                  y={labelY - labelLayout.lineOffset}
                  fill={segment.textColor}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="700"
                  fontSize={labelLayout.chineseFontSize}
                  transform={labelTransform}
                >
                  {segment.labelZh}
                </text>
                <text
                  x={labelX}
                  y={labelY + labelLayout.lineOffset}
                  fill={segment.textColor}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="700"
                  fontSize={labelLayout.englishFontSize}
                  transform={labelTransform}
                >
                  {segment.labelEn}
                </text>
              </g>
            );
          })}
          {cumulative.map((segment) => {
            const boundaryAngle = segment.start * Math.PI * 2 - Math.PI / 2;
            return (
              <line
                key={`separator-${segment.id}`}
                x1={50 + Math.cos(boundaryAngle) * 8.5}
                y1={50 + Math.sin(boundaryAngle) * 8.5}
                x2={50 + Math.cos(boundaryAngle) * 46}
                y2={50 + Math.sin(boundaryAngle) * 46}
                stroke="#fffaf0"
                strokeOpacity="0.92"
                strokeWidth={lotteryWheelSeparatorWidth(segments.length)}
              />
            );
          })}
          <circle cx="50" cy="50" r="8.5" fill="#fffaf0" />
          <circle cx="50" cy="50" r="4.5" fill="#b45309" opacity="0.85" />
        </svg>
      </div>
      <div className={`customer-display-wheel-pointer${spinning && !reducedMotion ? " is-spinning" : ""}`} />
    </div>
  );
}

function BillRows({ items, locale, currency }) {
  if (!items.length) {
    return (
      <div className="customer-display-empty-panel">
        <Receipt size={30} />
        <p>{text(locale, "暂无商品", "No items")}</p>
      </div>
    );
  }

  return (
    <div className="customer-display-bill-list" role="list">
      <div className="customer-display-bill-columns" aria-hidden="true">
        <span>{bilingual("菜品", "Item")}</span>
        <span>{bilingual("数量", "Qty")}</span>
        <span>{bilingual("单价", "Unit")}</span>
        <span>{bilingual("金额", "Amount")}</span>
      </div>
      {items.map((item) => (
        <article key={item.id} className="customer-display-bill-row" role="listitem">
          <div className="customer-display-bill-title">
            <strong>{item.nameZh || item.nameEn || item.name}</strong>
            {item.nameEn && item.nameEn !== (item.nameZh || item.name) ? <span className="customer-display-bill-english">{item.nameEn}</span> : null}
            {item.variantZh || item.variantEn || item.variant ? (
              <span>
                {item.variantZh || item.variant}
                {item.variantEn && item.variantEn !== (item.variantZh || item.variant) ? <small>{item.variantEn}</small> : null}
              </span>
            ) : null}
          </div>
          <span className="customer-display-bill-quantity">{item.quantity}</span>
          <span className="customer-display-bill-unit">{money(item.unitPrice, currency, locale)}</span>
          <strong className="customer-display-bill-amount">{money(item.lineTotal, currency, locale)}</strong>
          {item.modifiers.length ? (
            <div className="customer-display-modifiers">
              {item.modifiers.map((modifier) => (
                <span key={modifier.id}>
                  + {modifier.nameZh || modifier.nameEn || modifier.name}
                  {modifier.nameEn && modifier.nameEn !== (modifier.nameZh || modifier.name) ? ` / ${modifier.nameEn}` : ""}
                  {modifier.quantity > 1 ? ` x${modifier.quantity}` : ""}
                  {modifier.priceDelta ? ` ${money(modifier.priceDelta, currency, locale)}` : ""}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export default function CustomerDisplayPage() {
  const [displayState, setDisplayState] = useState(FALLBACK_STATE);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [drawError, setDrawError] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [revealedResultRevision, setRevealedResultRevision] = useState(0);
  const latestRevisionRef = useRef(0);
  const customerDisplayReconnectRef = useRef(0);
  const scheduledResultRevisionRef = useRef(0);
  const resultRevealTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const tickTimersRef = useRef([]);
  const soundedResultRevisionRef = useRef(0);
  const resultSoundTimerRef = useRef(null);
  const invitationTimerRef = useRef(null);
  const invitationResponseInFlightRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const now = useNow(1000);

  const effectiveState = useMemo(() => {
    if (displayState.mode === "idle") return displayState;
    const visibleUntil = displayState.visible_until ? new Date(displayState.visible_until).getTime() : 0;
    if (visibleUntil && visibleUntil <= now) {
      return {
        revision: displayState.revision,
        mode: "idle",
        visible_until: null,
        payload: {
          ...displayState.payload,
          items: [],
          totals: normalizeTotals({}, displayState.payload.locale, displayState.payload.currency),
          ticketId: null,
          actionToken: null,
          wheelSegments: []
        }
      };
    }
    return displayState;
  }, [displayState, now]);
  const effectiveStateRef = useRef(effectiveState);
  effectiveStateRef.current = effectiveState;

  const locale = effectiveState.payload.locale || "zh-CN";
  const currency = effectiveState.payload.currency || "GBP";
  const lotteryPhase = lotteryPresentationPhase(effectiveState, revealedResultRevision);
  const isSpinning = effectiveState.mode === "lottery_spinning"
    || (effectiveState.mode === "lottery_result" && lotteryPhase === "drawing");
  const showLotteryResult = lotteryPhase === "result";

  const resumeAudioContext = useCallback(async () => {
    const AudioContextClass = audioContextConstructor();
    if (!AudioContextClass) return null;
    if (!audioContextRef.current || audioContextRef.current.state === "closed") audioContextRef.current = new AudioContextClass();
    if (audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume();
      } catch {
        return null;
      }
    }
    return audioContextRef.current.state === "running" ? audioContextRef.current : null;
  }, []);

  const ensureAudioContext = useCallback(async () => {
    if (!soundEnabled) return null;
    return resumeAudioContext();
  }, [resumeAudioContext, soundEnabled]);

  const clearTickTimers = useCallback(() => {
    for (const timer of tickTimersRef.current) window.clearTimeout(timer);
    tickTimersRef.current = [];
  }, []);

  useEffect(() => {
    clearTickTimers();
    if (!isSpinning || !soundEnabled) return undefined;
    let cancelled = false;
    const spinDurationMs = effectiveState.payload.spinDurationMs || LOTTERY_SPIN_MS;
    ensureAudioContext().then((context) => {
      if (cancelled || !context) return;
      tickTimersRef.current = lotteryTickSchedule(spinDurationMs).map((delay) => window.setTimeout(() => playWheelTick(context, delay / spinDurationMs), delay));
    });
    return () => {
      cancelled = true;
      clearTickTimers();
    };
  }, [clearTickTimers, effectiveState.payload.spinDurationMs, ensureAudioContext, isSpinning, reducedMotion, soundEnabled]);

  useEffect(() => {
    if (!showLotteryResult || soundedResultRevisionRef.current === effectiveState.revision) return;
    soundedResultRevisionRef.current = effectiveState.revision;
    if (!soundEnabled) return;
    let cancelled = false;
    resultSoundTimerRef.current = window.setTimeout(() => {
      ensureAudioContext().then((context) => {
        if (!cancelled && context) playWheelBell(context);
      });
    }, LOTTERY_RESULT_SOUND_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(resultSoundTimerRef.current);
      resultSoundTimerRef.current = null;
    };
  }, [effectiveState.revision, ensureAudioContext, showLotteryResult, soundEnabled]);

  useEffect(() => () => {
    clearTickTimers();
    window.clearTimeout(resultSoundTimerRef.current);
    const closing = audioContextRef.current?.close?.();
    closing?.catch?.(() => {});
  }, [clearTickTimers]);

  useEffect(() => {
    document.documentElement.lang = locale === "en-GB" ? "en" : "zh-CN";
    document.documentElement.classList.add("customer-display-root");
    document.body.classList.add("customer-display-body");
    return () => {
      document.documentElement.classList.remove("customer-display-root");
      document.body.classList.remove("customer-display-body");
    };
  }, [locale]);

  // This route runs on a dedicated customer-facing tablet. Keep the receipt
  // scrollable and the wheel draggable, but block browser gestures that can
  // accidentally zoom, select, drag, or open a context menu over the display.
  useEffect(() => {
    const preventDefault = (event) => event.preventDefault();
    const preventPinch = (event) => {
      if (event.touches?.length > 1) event.preventDefault();
    };
    const preventZoomWheel = (event) => {
      if (event.ctrlKey) event.preventDefault();
    };
    const preventZoomKeys = (event) => {
      if ((event.ctrlKey || event.metaKey) && ["+", "-", "=", "0"].includes(event.key)) event.preventDefault();
    };

    document.addEventListener("contextmenu", preventDefault);
    document.addEventListener("dragstart", preventDefault);
    document.addEventListener("selectstart", preventDefault);
    document.addEventListener("gesturestart", preventDefault, { passive: false });
    document.addEventListener("gesturechange", preventDefault, { passive: false });
    document.addEventListener("gestureend", preventDefault, { passive: false });
    document.addEventListener("touchmove", preventPinch, { passive: false });
    document.addEventListener("wheel", preventZoomWheel, { passive: false });
    document.addEventListener("keydown", preventZoomKeys);

    return () => {
      document.removeEventListener("contextmenu", preventDefault);
      document.removeEventListener("dragstart", preventDefault);
      document.removeEventListener("selectstart", preventDefault);
      document.removeEventListener("gesturestart", preventDefault);
      document.removeEventListener("gesturechange", preventDefault);
      document.removeEventListener("gestureend", preventDefault);
      document.removeEventListener("touchmove", preventPinch);
      document.removeEventListener("wheel", preventZoomWheel);
      document.removeEventListener("keydown", preventZoomKeys);
    };
  }, []);

  const applyState = useCallback((next, options = {}) => {
    const normalized = sanitizeState(next);
    if (!options.force && normalized.revision && normalized.revision < latestRevisionRef.current) return;
    latestRevisionRef.current = Math.max(latestRevisionRef.current, normalized.revision);
    setDisplayState(normalized);
    if (normalized.mode === "lottery_result" && scheduledResultRevisionRef.current !== normalized.revision) {
      scheduledResultRevisionRef.current = normalized.revision;
      window.clearTimeout(resultRevealTimerRef.current);
      const revealDelay = reducedMotion ? 270 : (normalized.payload.spinDurationMs || LOTTERY_SPIN_MS) + 100;
      resultRevealTimerRef.current = window.setTimeout(() => {
        setRevealedResultRevision(normalized.revision);
      }, revealDelay);
    } else if (normalized.mode !== "lottery_result" && normalized.mode !== "lottery_spinning") {
      scheduledResultRevisionRef.current = 0;
      window.clearTimeout(resultRevealTimerRef.current);
      setRevealedResultRevision(0);
    }
  }, [reducedMotion]);

  useEffect(() => () => window.clearTimeout(resultRevealTimerRef.current), []);

  const refreshState = useCallback(async () => {
    try {
      const state = await api("/customer-display/state");
      applyState(state, { force: true });
      setFetchError("");
    } catch (error) {
      setFetchError(error.message || "Failed to load customer display state");
    } finally {
      setLoading(false);
    }
  }, [applyState]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  // The customer tablet is intentionally unpaired: the display reads the
  // public state endpoint and refreshes it periodically.
  useEffect(() => {
    const timer = window.setInterval(() => refreshState(), CUSTOMER_DISPLAY_POLL_MS);
    return () => window.clearInterval(timer);
  }, [applyState, refreshState]);

  // Customer display has its own LAN WebSocket channel. It is deliberately
  // separate from the website-order `/ws` channel and polling remains the
  // source-of-truth fallback when a proxy or firewall blocks upgrades.
  useEffect(() => {
    let cancelled = false;
    let socket;
    let reconnectTimer;

    function scheduleReconnect() {
      if (cancelled) return;
      customerDisplayReconnectRef.current += 1;
      const delay = Math.min(8000, 600 * 2 ** (customerDisplayReconnectRef.current - 1));
      reconnectTimer = window.setTimeout(connect, delay);
    }

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(customerDisplayWebsocketUrl());
      socket.addEventListener("open", () => {
        customerDisplayReconnectRef.current = 0;
        refreshState();
      });
      socket.addEventListener("message", (message) => {
        let parsed;
        try {
          parsed = JSON.parse(message.data);
        } catch {
          return;
        }
        if (parsed?.event === "ping" || parsed?.type === "ping") return;
        if (parsed?.event && !CUSTOMER_DISPLAY_EVENTS.has(parsed.event) && !parsed?.data?.mode && !parsed?.mode) return;
        const candidate = parsed?.data?.mode ? parsed.data : parsed?.mode ? parsed : null;
        if (candidate) applyState(candidate);
      });
      socket.addEventListener("close", scheduleReconnect);
      socket.addEventListener("error", () => socket?.close());
    }

    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [applyState, refreshState]);

  async function startDraw() {
    if (!effectiveState.payload.ticketId || !effectiveState.payload.actionToken || drawing) return;
    const context = await ensureAudioContext();
    if (context) playWheelTick(context, 0);
    setDrawing(true);
    setDrawError("");
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `draw-${Date.now()}`;
      const result = await api("/customer-display/lottery/draw", {
        method: "POST",
        body: JSON.stringify(lotteryDrawPayload(effectiveState, idempotencyKey))
      });
      if (result?.mode || result?.data?.mode) applyState(result?.data?.mode ? result.data : result, { force: true });
      setDrawError("");
    } catch {
      setDrawError(bilingual("抽奖暂时无法开始，请稍后重试", "Draw unavailable, please try again"));
    } finally {
      setDrawing(false);
    }
  }

  const respondToInvitation = useCallback(async (accepted) => {
    const state = effectiveStateRef.current;
    if (!state.payload.invitationToken || invitationResponseInFlightRef.current) return;
    invitationResponseInFlightRef.current = true;
    setInvitationBusy(true);
    setDrawError("");
    try {
      const result = await api("/customer-display/lottery-invitation/respond", {
        method: "POST",
        body: JSON.stringify({
          accepted,
          revision: state.revision,
          invitation_token: state.payload.invitationToken
        })
      });
      applyState(result, { force: true });
    } catch {
      setDrawError(bilingual("此邀请已失效，请联系店员", "This invitation has expired. Please ask a member of staff."));
      refreshState();
    } finally {
      invitationResponseInFlightRef.current = false;
      setInvitationBusy(false);
    }
  }, [applyState, refreshState]);

  useEffect(() => {
    window.clearTimeout(invitationTimerRef.current);
    if (effectiveState.mode !== "lottery_invitation") return undefined;
    // Current APIs publish visible_until. The local fallback below supports
    // older payloads that expose only the setting, without racing that expiry.
    if (effectiveState.visible_until) return undefined;
    const revision = effectiveState.revision;
    invitationTimerRef.current = window.setTimeout(() => {
      // Declining through the public invitation endpoint resets the shared
      // display state too, so polling cannot revive an expired invitation.
      if (effectiveStateRef.current.revision === revision) void respondToInvitation(false);
    }, effectiveState.payload.invitationTimeoutSeconds * 1000);
    return () => window.clearTimeout(invitationTimerRef.current);
  }, [effectiveState.mode, effectiveState.payload.invitationTimeoutSeconds, effectiveState.revision, effectiveState.visible_until, respondToInvitation]);

  useEffect(() => () => window.clearTimeout(invitationTimerRef.current), []);

  async function toggleSound() {
    if (soundEnabled) {
      clearTickTimers();
      setSoundEnabled(false);
      return;
    }
    setSoundEnabled(true);
    const context = await resumeAudioContext();
    if (context) playWheelTick(context, 0);
  }

  const serviceLabel = effectiveState.payload.serviceType
    ? bilingual(
        effectiveState.payload.serviceType === "takeaway" ? "外带" : "堂食",
        effectiveState.payload.serviceType === "takeaway" ? "Takeaway" : "Dine in"
      )
    : "";

  return (
    <main className="customer-display-page">
      <div className="customer-display-backdrop" aria-hidden="true" />
      <section className="customer-display-shell" aria-live="polite">
        {loading ? (
          <section className="customer-display-center-panel">
            <Loader2 className="customer-display-spinner" />
            <h1>{text(locale, "正在加载", "Loading")}</h1>
          </section>
        ) : null}

        {!loading && fetchError && effectiveState.mode === "idle" ? (
          <section className="customer-display-error-banner" role="status">
            <AlertCircle size={18} />
            <span>{fetchError}</span>
          </section>
        ) : null}

        {!loading && effectiveState.mode === "idle" ? (
          <section className="customer-display-center-panel customer-display-idle">
            <div className="customer-display-idle-orb" aria-hidden="true" />
            <img src={logoSource(effectiveState.payload.logoUrl)} alt="" className="customer-display-idle-logo" />
            {effectiveState.payload.welcomeTitleI18n?.["zh-CN"] || effectiveState.payload.welcomeTitleI18n?.["en-GB"] ? (
              <h1 className="customer-display-welcome-title">
                {effectiveState.payload.welcomeTitleI18n?.["zh-CN"] ? <span lang="zh-CN">{effectiveState.payload.welcomeTitleI18n["zh-CN"]}</span> : null}
                {effectiveState.payload.welcomeTitleI18n?.["en-GB"] ? <span lang="en">{effectiveState.payload.welcomeTitleI18n["en-GB"]}</span> : null}
              </h1>
            ) : null}
            {effectiveState.payload.welcomeMessageI18n?.["zh-CN"] || effectiveState.payload.welcomeMessageI18n?.["en-GB"] ? (
              <p className="customer-display-welcome-subtitle">
                {effectiveState.payload.welcomeMessageI18n?.["zh-CN"] ? <span lang="zh-CN">{effectiveState.payload.welcomeMessageI18n["zh-CN"]}</span> : null}
                {effectiveState.payload.welcomeMessageI18n?.["en-GB"] ? <span lang="en">{effectiveState.payload.welcomeMessageI18n["en-GB"]}</span> : null}
              </p>
            ) : null}
          </section>
        ) : null}

        {!loading && effectiveState.mode === "lottery_invitation" ? (
          <section className="customer-display-center-panel customer-display-lottery-invitation" role="dialog" aria-modal="true" aria-labelledby="lottery-invitation-title">
            <div className="customer-display-invitation-icon" aria-hidden="true"><Gift size={42} /></div>
            {effectiveState.payload.invitationImageUrl ? <img src={effectiveState.payload.invitationImageUrl} alt="" className="customer-display-invitation-image" /> : null}
            <h1 id="lottery-invitation-title">
              <span lang="zh-CN">{effectiveState.payload.invitationI18n?.["zh-CN"] || "留下 Google 评论即可参加幸运大转盘抽奖"}</span>
              <span lang="en">{effectiveState.payload.invitationI18n?.["en-GB"] || "Leave us a Google review to join the Lucky Wheel draw"}</span>
            </h1>
            <div className="customer-display-invitation-actions">
              <button type="button" className="customer-display-invitation-no" disabled={invitationBusy} onClick={() => respondToInvitation(false)}>{bilingual("否", "No")}</button>
              <button type="button" className="customer-display-invitation-yes" disabled={invitationBusy} onClick={() => respondToInvitation(true)}>
                {invitationBusy ? <Loader2 className="customer-display-spinner-inline" /> : <Sparkles size={22} />}
                {bilingual("是", "Yes")}
              </button>
            </div>
            {drawError || fetchError ? <p className="customer-display-side-note">{drawError || fetchError}</p> : null}
          </section>
        ) : null}

        {!loading && (effectiveState.mode === "bill" || effectiveState.mode === "paid") ? (
          <section className="customer-display-content-grid customer-display-bill-grid">
            <article className="customer-display-panel customer-display-bill-panel">
              <div className="customer-display-section-head">
                <div className="customer-display-bill-heading">
                  <strong>{bilingual("当前账单", "Current bill")}</strong>
                  <span>
                    {effectiveState.payload.orderNumber ? `${bilingual("订单", "Order")} #${effectiveState.payload.orderNumber}` : ""}
                    {serviceLabel ? ` · ${serviceLabel}` : ""}
                    {effectiveState.payload.tableLabel ? ` · ${bilingual("桌台", "Table")} ${effectiveState.payload.tableLabel}` : ""}
                  </span>
                </div>
                {effectiveState.mode === "paid" ? (
                  <span className="customer-display-paid-pill"><CircleCheck size={16} />{bilingual("已付款", "Paid")}</span>
                ) : null}
              </div>

              {effectiveState.mode === "paid" ? (
                <div className="customer-display-payment-feedback" role="status">
                  <CircleCheck size={24} />
                  <strong>{bilingual("付款成功", "Payment successful")}</strong>
                </div>
              ) : null}

              <BillRows items={effectiveState.payload.items} locale={locale} currency={currency} />

              <div className="customer-display-totals">
                <div><span>{bilingual("小计", "Subtotal")}</span><strong>{money(effectiveState.payload.totals.subtotal, currency, locale)}</strong></div>
                {effectiveState.payload.totals.discount ? (
                  <div><span>{bilingual("优惠", "Discount")}</span><strong>-{money(Math.abs(effectiveState.payload.totals.discount), currency, locale)}</strong></div>
                ) : null}
                {effectiveState.payload.totals.serviceCharge ? (
                  <div><span>{bilingual("服务费", "Service charge")}</span><strong>{money(effectiveState.payload.totals.serviceCharge, currency, locale)}</strong></div>
                ) : null}
                <div className="is-grand-total">
                  <span>{bilingual("合计", "TOTAL")}</span>
                  <strong>{money(effectiveState.payload.totals.total, currency, locale)}</strong>
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {!loading && (effectiveState.mode === "lottery_ready" || effectiveState.mode === "lottery_spinning" || effectiveState.mode === "lottery_result") ? (
          <section className="customer-display-content-grid customer-display-lottery-grid">
            <article className="customer-display-panel customer-display-lottery-panel">
              <div className="customer-display-section-head">
                <div>
                  <strong>{bilingualLabel(effectiveState.payload.campaignTitleI18n, "幸运大转盘", "Lucky Wheel")}</strong>
                </div>
                <button type="button" className="customer-display-sound-toggle" onClick={toggleSound} aria-label={soundEnabled ? bilingual("关闭音效", "Mute sound") : bilingual("开启音效", "Enable sound")} title={soundEnabled ? bilingual("关闭音效", "Mute sound") : bilingual("开启音效", "Enable sound")}>
                  {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </button>
              </div>

              <Wheel
                state={effectiveState}
                spinning={isSpinning}
                reducedMotion={reducedMotion}
                interactive={effectiveState.mode === "lottery_ready" && !drawing && Boolean(effectiveState.payload.ticketId && effectiveState.payload.actionToken)}
                onSwipe={startDraw}
                onGesture={ensureAudioContext}
                ariaLabel={bilingual("滑动轮盘开始抽奖", "Swipe the wheel to start")}
              />

              {effectiveState.payload.campaignSubtitleI18n?.["zh-CN"] || effectiveState.payload.campaignSubtitleI18n?.["en-GB"] ? (
                <p className="customer-display-lottery-receipt">
                  {effectiveState.payload.campaignSubtitleI18n?.["zh-CN"] || ""}
                  {effectiveState.payload.campaignSubtitleI18n?.["zh-CN"] && effectiveState.payload.campaignSubtitleI18n?.["en-GB"] ? " / " : ""}
                  {effectiveState.payload.campaignSubtitleI18n?.["en-GB"] || ""}
                </p>
              ) : null}

              {!showLotteryResult && lotteryPhase === "drawing" ? <div className="customer-display-lottery-copy">
                  <h2>{bilingual("开奖中", "Drawing...")}</h2>
              </div> : null}

              {effectiveState.mode === "lottery_ready" ? (
                <button className="customer-display-draw-button" onClick={startDraw} disabled={drawing || !effectiveState.payload.ticketId || !effectiveState.payload.actionToken}>
                  {drawing ? <Loader2 className="customer-display-spinner-inline" /> : null}
                  {drawing ? bilingual("正在启动", "Starting") : bilingualLabel(effectiveState.payload.buttonI18n, "开始抽奖", "Start draw")}
                </button>
              ) : null}
              {drawError || fetchError ? <p className="customer-display-side-note">{drawError || fetchError}</p> : null}

              {showLotteryResult ? (
                <div className="customer-display-result-backdrop" role="dialog" aria-modal="true" aria-label={bilingual("抽奖结果", "Draw result")}>
                  <section className={`customer-display-result-modal${effectiveState.payload.resultKind === "no_prize" ? " is-no-prize" : " is-win"}`}>
                    <div className="customer-display-result-icon"><Trophy size={38} /></div>
                    <h2>
                      {effectiveState.payload.resultKind === "no_prize"
                        ? bilingual("谢谢参与", "Thank you")
                        : bilingualLabel(effectiveState.payload.resultTitleI18n, "抽奖完成", "Draw complete")}
                    </h2>
                    {effectiveState.payload.resultMessage ? <p>{effectiveState.payload.resultMessage}</p> : null}
                    {effectiveState.payload.resultKind !== "no_prize" && effectiveState.payload.resultFulfillmentType === "instant" ? (
                      <p className="customer-display-result-fulfillment">{bilingual("请向店员现场领取", "Please collect your prize from a member of staff")}</p>
                    ) : null}
                    {effectiveState.payload.claimCode ? (
                      <div className="customer-display-claim-code">
                        <span>{bilingual("兑奖码", "Claim code")}</span>
                        <strong>{effectiveState.payload.claimCode}</strong>
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : null}
            </article>
          </section>
        ) : null}
      </section>
    </main>
  );
}
