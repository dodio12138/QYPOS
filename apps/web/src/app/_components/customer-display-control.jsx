"use client";

import { CircleCheck, Gift, Home, Monitor, ReceiptText, Sparkles, TicketCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, labelOf } from "../../lib/api";
import { nextPosLotteryFeedback, POS_LOTTERY_FEEDBACK_MS } from "./customer-display-control-helpers";

function text(locale, zh, en) {
  return locale === "en-GB" ? en : zh;
}

export default function CustomerDisplayControl({ order, locale, user, onNotify }) {
  const [busy, setBusy] = useState("");
  const [orderLottery, setOrderLottery] = useState(null);
  const [lotteryFeedback, setLotteryFeedback] = useState(null);
  const feedbackTrackerRef = useRef({ initialized: false, seenDrawId: null });
  const feedbackTimerRef = useRef(null);
  const canControl = Boolean(user?.permissions?.includes("control_customer_display"));

  useEffect(() => {
    let active = true;
    feedbackTrackerRef.current = { initialized: false, seenDrawId: null };
    setLotteryFeedback(null);
    window.clearTimeout(feedbackTimerRef.current);
    if (!canControl || !order?.id) {
      setOrderLottery(null);
      return undefined;
    }
    async function refreshOrderLottery() {
      try {
        const result = await api(`/customer-display/orders/${order.id}/lottery`);
        if (active) {
          setOrderLottery(result);
          const update = nextPosLotteryFeedback(feedbackTrackerRef.current, result.lottery);
          feedbackTrackerRef.current = update.tracker;
          if (update.feedback) {
            setLotteryFeedback(update.feedback);
            window.clearTimeout(feedbackTimerRef.current);
            feedbackTimerRef.current = window.setTimeout(() => setLotteryFeedback(null), POS_LOTTERY_FEEDBACK_MS);
          }
        }
      } catch {
        if (active) setOrderLottery(null);
      }
    }
    refreshOrderLottery();
    const timer = window.setInterval(refreshOrderLottery, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearTimeout(feedbackTimerRef.current);
    };
  }, [canControl, order?.id]);

  async function call(action, path, body = {}) {
    setBusy(action);
    try {
      const result = await api(path, { method: "POST", body: JSON.stringify(body) });
      if (onNotify) onNotify(text(locale, "顾客屏已更新", "Customer display updated"));
      return result;
    } catch (error) {
      if (onNotify) onNotify(error.message);
      return null;
    } finally {
      setBusy("");
    }
  }

  if (!canControl) return null;

  const disabled = !order || busy !== "";
  const lottery = orderLottery?.lottery;
  const draw = lotteryFeedback?.draw_id ? lotteryFeedback : null;
  const prize = draw?.prize_snapshot || null;
  const prizeNameZh = labelOf(prize?.name_i18n, "zh-CN");
  const prizeNameEn = labelOf(prize?.name_i18n, "en-GB");
  const prizeName = prizeNameEn && prizeNameEn !== prizeNameZh ? `${prizeNameZh} / ${prizeNameEn}` : prizeNameZh || prizeNameEn;
  const won = Boolean(draw && prize?.kind !== "no_prize");
  const lotteryReady = lottery?.ticket_status === "issued" && !draw;
  return (
    <section className="customer-display-control" aria-label={text(locale, "顾客屏控制", "Customer display controls")}>
      <div className="customer-display-control-heading">
        <span><Monitor size={16} />{text(locale, "顾客屏", "Customer display")}</span>
      </div>
      <div className="customer-display-control-actions">
        <button type="button" onClick={() => call("idle", "/customer-display/reset")} disabled={busy !== ""}>
          <Home size={15} />{busy === "idle" ? "…" : text(locale, "欢迎界面", "Welcome screen")}
        </button>
        <button type="button" onClick={() => call("bill", "/customer-display/show-order", { order_id: order?.id })} disabled={disabled}>
          <ReceiptText size={15} />{busy === "bill" ? "…" : text(locale, "显示账单", "Show bill")}
        </button>
        <button type="button" onClick={() => call("lottery", "/customer-display/show-lottery", { order_id: order?.id })} disabled={disabled || order?.status !== "paid" || !lotteryReady}>
          <Sparkles size={15} />{busy === "lottery" ? "…" : text(locale, "抽奖节目", "Lottery screen")}
        </button>
      </div>
      {!order ? <small>{text(locale, "先选择订单，再把内容发送到顾客屏。", "Select an order to send content to the customer display.")}</small> : null}
      {lotteryReady || draw ? (
        <div className={`customer-display-order-lottery${draw ? won ? " is-winner" : " is-no-prize" : " is-ready"}`}>
          <span className="customer-display-order-lottery-icon">
            {draw ? won ? <Gift size={19} /> : <CircleCheck size={19} /> : <TicketCheck size={19} />}
          </span>
          <span className="customer-display-order-lottery-copy">
            <small>{text(locale, "订单", "Order")} {orderLottery.order_no}</small>
            <strong>
              {draw
                ? won
                  ? `${text(locale, "中奖", "Winner")}: ${prizeName}`
                  : text(locale, "本次未中奖", "No prize this time")
                : text(locale, "抽奖资格已绑定此订单", "Lottery entry linked to this order")}
            </strong>
            {draw?.redeemed_at ? <small>{text(locale, "奖品已兑奖", "Prize redeemed")}</small> : null}
          </span>
          {won && draw.claim_code_suffix ? (
            <span className="customer-display-order-lottery-code">
              <small>{text(locale, "兑奖码尾号", "Claim code ending")}</small>
              <strong>{draw.claim_code_suffix}</strong>
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
