"use client";

import { CircleCheck, Gift, Home, MessageCircle, Monitor, Pause, Play, ReceiptText, Sparkles, TicketCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, labelOf } from "../../lib/api";
import { nextPosLotteryFeedback, POS_LOTTERY_FEEDBACK_MS } from "./customer-display-control-helpers";

function text(locale, zh, en) {
  return locale === "en-GB" ? en : zh;
}

function campaignControlCandidate(campaigns = []) {
  const byRecentUpdate = (left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime();
  return campaigns.filter((item) => item.status === "published").sort(byRecentUpdate)[0]
    || campaigns.filter((item) => item.status === "paused").sort(byRecentUpdate)[0]
    || campaigns.filter((item) => item.status === "draft").sort(byRecentUpdate)[0]
    || null;
}

function displayModeLabel(mode, locale) {
  const labels = {
    idle: ["欢迎页", "Welcome"],
    bill: ["账单", "Bill"],
    paid: ["付款成功", "Payment complete"],
    lottery_invitation: ["抽奖邀请", "Lottery invitation"],
    lottery_ready: ["抽奖转盘", "Lottery wheel"],
    lottery_spinning: ["抽奖进行中", "Lottery spinning"],
    lottery_result: ["抽奖结果", "Lottery result"]
  };
  const [zh, en] = labels[mode] || ["未知页面", "Unknown screen"];
  return text(locale, zh, en);
}

export default function CustomerDisplayControl({ order, locale, user, onNotify }) {
  const [busy, setBusy] = useState("");
  const [orderLottery, setOrderLottery] = useState(null);
  const [lotteryFeedback, setLotteryFeedback] = useState(null);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [campaignControl, setCampaignControl] = useState(null);
  const [displayStatus, setDisplayStatus] = useState(null);
  const feedbackTrackerRef = useRef({ initialized: false, seenDrawId: null });
  const feedbackTimerRef = useRef(null);
  const canControl = Boolean(user?.permissions?.includes("control_customer_display"));

  const refreshDisplayStatus = useCallback(async () => {
    if (!canControl) return;
    try {
      const status = await api("/customer-display/status");
      setDisplayStatus(status || null);
    } catch {
      setDisplayStatus(null);
    }
  }, [canControl]);

  useEffect(() => {
    if (!canControl) {
      setDisplayStatus(null);
      return undefined;
    }
    refreshDisplayStatus();
    const timer = window.setInterval(refreshDisplayStatus, 5000);
    return () => window.clearInterval(timer);
  }, [canControl, refreshDisplayStatus]);

  useEffect(() => {
    let active = true;
    if (!canControl) {
      setActiveCampaign(null);
      setCampaignControl(null);
      return undefined;
    }
    async function refreshCampaignState() {
      try {
        const campaign = await api("/lottery/public/active");
        if (active) {
          setActiveCampaign(campaign || null);
          const campaigns = await api("/lottery/control-campaign");
          setCampaignControl(campaignControlCandidate(campaigns));
        }
      } catch {
        if (active) {
          setActiveCampaign(null);
          setCampaignControl(null);
        }
      }
    }
    refreshCampaignState();
    const timer = window.setInterval(refreshCampaignState, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canControl]);

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
      if (result?.mode) setDisplayStatus((current) => ({ ...current, state: result }));
      await refreshDisplayStatus();
      if (onNotify) onNotify(text(locale, "顾客屏已更新", "Customer display updated"));
      return result;
    } catch (error) {
      if (onNotify) onNotify(error.message);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function toggleCampaign(action) {
    if (!campaignControl || busy !== "") return;
    setBusy("campaign");
    try {
      await api(`/lottery/campaigns/${campaignControl.id}/${action}`, { method: "POST" });
      const [campaign, campaigns] = await Promise.all([
        api("/lottery/public/active"),
        api("/lottery/control-campaign")
      ]);
      setActiveCampaign(campaign || null);
      setCampaignControl(campaignControlCandidate(campaigns));
      onNotify?.(text(locale, action === "pause" ? "抽奖活动已暂停" : "抽奖活动已开始", action === "pause" ? "Lottery paused" : "Lottery started"));
    } catch (error) {
      onNotify?.(error.message);
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
  const instantPrize = won && prize?.fulfillment_type === "instant";
  const lotteryReady = lottery?.ticket_status === "issued" && !draw;
  return (
    <section className="customer-display-control" aria-label={text(locale, "顾客屏控制", "Customer display controls")}>
      <div className="customer-display-control-heading">
        <span><Monitor size={16} />{text(locale, "顾客屏", "Customer display")}</span>
        <span className={`customer-display-lottery-status${activeCampaign ? " is-active" : ""}`} title={activeCampaign ? labelOf(activeCampaign.title_i18n, locale) : undefined}>
          <i aria-hidden="true" />
          {activeCampaign ? text(locale, "抽奖活动进行中", "Lottery active") : text(locale, "暂无抽奖活动", "No active draw")}
        </span>
        <span className="customer-display-screen-status" title={text(locale, "当前顾客屏页面", "Current customer display screen")}>
          <i aria-hidden="true" />
          {displayStatus ? `${text(locale, "当前", "Now")}: ${displayModeLabel(displayStatus.state?.mode, locale)}` : text(locale, "状态读取中", "Reading status")}
        </span>
        {campaignControl ? (
          <span className="customer-display-campaign-actions" aria-label={text(locale, "抽奖活动快捷控制", "Lottery quick controls")}>
            <button
              type="button"
              onClick={() => toggleCampaign(campaignControl.status === "published" ? "pause" : campaignControl.status === "paused" ? "resume" : "publish")}
              disabled={busy !== ""}
              title={text(locale, campaignControl.status === "published" ? "暂停活动" : "开始活动", campaignControl.status === "published" ? "Pause campaign" : "Start campaign")}
              aria-label={text(locale, campaignControl.status === "published" ? "暂停活动" : "开始活动", campaignControl.status === "published" ? "Pause campaign" : "Start campaign")}
            >
              {campaignControl.status === "published" ? <Pause size={13} /> : <Play size={13} />}
            </button>
          </span>
        ) : null}
      </div>
      <div className="customer-display-control-actions">
        <button type="button" onClick={() => call("idle", "/customer-display/reset")} disabled={busy !== ""} aria-label={text(locale, "欢迎界面", "Welcome screen")} title={text(locale, "欢迎界面", "Welcome screen")}>
          <Home size={15} /><span className="customer-display-control-label">{busy === "idle" ? "…" : text(locale, "欢迎界面", "Welcome screen")}</span>
        </button>
        <button type="button" onClick={() => call("bill", "/customer-display/show-order", { order_id: order?.id })} disabled={disabled} aria-label={text(locale, "显示账单", "Show bill")} title={text(locale, "显示账单", "Show bill")}>
          <ReceiptText size={15} /><span className="customer-display-control-label">{busy === "bill" ? "…" : text(locale, "显示账单", "Show bill")}</span>
        </button>
        <button type="button" onClick={() => call("lottery_invitation", "/customer-display/show-lottery-invitation", { order_id: order?.id })} disabled={disabled || order?.status !== "paid"} aria-label={text(locale, "显示邀请页", "Show invitation")} title={text(locale, "显示邀请页", "Show invitation")}>
          <MessageCircle size={15} /><span className="customer-display-control-label">{busy === "lottery_invitation" ? "…" : text(locale, "显示邀请页", "Show invitation")}</span>
        </button>
        <button type="button" onClick={() => call("lottery", "/customer-display/show-lottery", { order_id: order?.id })} disabled={disabled || order?.status !== "paid"} aria-label={text(locale, "抽奖节目", "Lottery screen")} title={text(locale, "抽奖节目", "Lottery screen")}>
          <Sparkles size={15} /><span className="customer-display-control-label">{busy === "lottery" ? "…" : text(locale, "抽奖节目", "Lottery screen")}</span>
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
            {draw?.voided_at ? <small>{text(locale, "中奖记录已作废", "Prize record voided")}</small> : instantPrize ? <small>{text(locale, "请现场发放奖品", "Give this prize now")}</small> : draw?.redeemed_at ? <small>{text(locale, "奖品已兑奖", "Prize redeemed")}</small> : null}
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
