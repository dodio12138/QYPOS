"use client";

import { Ban, ChevronLeft, ChevronRight, Clock, Gift, Lock, Pause, Pencil, Play, Plus, Save, Settings, Sparkles, Trash2, Trophy, Unlock, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, labelOf } from "../../../lib/api";
import { lotteryProbabilities, normalizedLotteryWeights, rebalanceLotteryProbabilities } from "./lottery-form-helpers";

function t(locale, zh, en) { return locale === "en-GB" ? en : zh; }
function numberDraft(value) { return value == null || Number.isNaN(Number(value)) ? "" : String(value); }
function DeferredNumberInput({ value, onCommit, min, max, step = 1, allowEmpty = false, ...props }) {
  const [draft, setDraft] = useState(numberDraft(value));
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(numberDraft(value));
  }, [value]);
  function commit(raw) {
    const trimmed = raw.trim();
    focusedRef.current = false;
    if (!trimmed) {
      if (allowEmpty) onCommit(null);
      else setDraft(numberDraft(value));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(numberDraft(value));
      return;
    }
    const stepSize = Number(step);
    const stepOffset = (parsed - (min ?? 0)) / stepSize;
    if (stepSize > 0 && Math.abs(stepOffset - Math.round(stepOffset)) > 1e-8) {
      setDraft(numberDraft(value));
      return;
    }
    const bounded = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed));
    onCommit(bounded);
    setDraft(String(bounded));
  }
  return <input
    {...props}
    type="text"
    inputMode={String(step).includes(".") ? "decimal" : "numeric"}
    value={draft}
    onFocus={(event) => {
      focusedRef.current = true;
      const input = event.currentTarget;
      window.requestAnimationFrame(() => input.select());
    }}
    onChange={(event) => {
      if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setDraft(event.target.value);
    }}
    onBlur={(event) => commit(event.target.value)}
    onKeyDown={(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit(event.currentTarget.value);
        event.currentTarget.blur();
      }
    }}
  />;
}
function campaignStatus(campaign, locale) {
  const now = Date.now();
  const running = campaign.status === "published" && new Date(campaign.starts_at).getTime() <= now && new Date(campaign.ends_at).getTime() > now;
  if (running) return { running: true, label: t(locale, "正在进行", "Running") };
  const labels = {
    draft: t(locale, "草稿", "Draft"),
    published: t(locale, "已发布 · 未在活动时段", "Published · Outside schedule"),
    paused: t(locale, "已暂停", "Paused"),
    ended: t(locale, "已结束", "Ended")
  };
  return { running: false, label: labels[campaign.status] || campaign.status };
}
function campaignsOverlap(first, second) {
  return new Date(first.starts_at).getTime() < new Date(second.ends_at).getTime()
    && new Date(first.ends_at).getTime() > new Date(second.starts_at).getTime();
}
function hasPublishedScheduleConflict(campaign, campaigns) {
  return campaigns.some((candidate) => candidate.id !== campaign.id
    && candidate.status === "published"
    && campaignsOverlap(campaign, candidate));
}
function dateInput(date) {
  const value = new Date(date);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
function scheduleLabel(campaign, locale) {
  const formatter = new Intl.DateTimeFormat(locale === "en-GB" ? "en-GB" : "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London"
  });
  return `${formatter.format(new Date(campaign.starts_at))} – ${formatter.format(new Date(campaign.ends_at))}`;
}
function initialForm() {
  const now = Date.now();
  return {
    internal_name: "新抽奖活动",
    title_i18n: { "zh-CN": "幸运大转盘", "en-GB": "Lucky Wheel" },
    subtitle_i18n: { "zh-CN": "", "en-GB": "" },
    button_i18n: { "zh-CN": "开始抽奖", "en-GB": "Start draw" },
    losing_message_i18n: { "zh-CN": "谢谢参与", "en-GB": "Thank you for taking part" },
    rules_i18n: { "zh-CN": "点击按钮或滑动转盘开始抽奖", "en-GB": "Tap the button or swipe the wheel to start" },
    starts_at: dateInput(now),
    ends_at: dateInput(now + 30 * 86400000),
    spin_duration_seconds: 10,
    minimum_order_total: 0,
    ticket_valid_minutes: 1440,
    claim_valid_minutes: 1440,
    prizes: [
      { kind: "prize", fulfillment_type: "instant", name_i18n: { "zh-CN": "免费饮料", "en-GB": "Free drink" }, weight_value: 25, locked: false, stock_total: 20, background_color: "#f97316", text_color: "#fff" },
      { kind: "prize", fulfillment_type: "voucher", name_i18n: { "zh-CN": "下次九折", "en-GB": "10% off next time" }, weight_value: 75, locked: false, stock_total: null, background_color: "#2563eb", text_color: "#fff" }
    ]
  };
}

function formFromCampaign(campaign) {
  const fallback = initialForm();
  return {
    ...fallback,
    internal_name: campaign.internal_name || fallback.internal_name,
    title_i18n: campaign.title_i18n || fallback.title_i18n,
    subtitle_i18n: campaign.subtitle_i18n || fallback.subtitle_i18n,
    button_i18n: campaign.button_i18n || fallback.button_i18n,
    losing_message_i18n: campaign.losing_message_i18n || fallback.losing_message_i18n,
    rules_i18n: campaign.rules_i18n || fallback.rules_i18n,
    starts_at: dateInput(campaign.starts_at),
    ends_at: dateInput(campaign.ends_at),
    spin_duration_seconds: Number(campaign.spin_duration_seconds || fallback.spin_duration_seconds),
    minimum_order_total: Number(campaign.minimum_order_total || 0),
    service_types: Array.isArray(campaign.service_types) ? campaign.service_types : fallback.service_types,
    excluded_payment_methods: Array.isArray(campaign.excluded_payment_methods) ? campaign.excluded_payment_methods : fallback.excluded_payment_methods,
    ticket_valid_minutes: Number(campaign.ticket_valid_minutes || fallback.ticket_valid_minutes),
    claim_valid_minutes: Number(campaign.claim_valid_minutes || fallback.claim_valid_minutes),
    theme: campaign.theme || {},
    prizes: (campaign.prizes || []).filter((prize) => prize.enabled !== false).map((prize, position) => ({
      id: prize.id,
      kind: prize.kind,
      fulfillment_type: prize.kind === "prize" ? prize.fulfillment_type || "voucher" : null,
      name_i18n: prize.name_i18n || {},
      description_i18n: prize.description_i18n || {},
      claim_instructions_i18n: prize.claim_instructions_i18n || {},
      weight_value: Number(prize.weight_bps) / 100,
      locked: false,
      stock_total: prize.stock_total == null ? null : Number(prize.stock_total),
      stock_awarded: Number(prize.stock_awarded || 0),
      position,
      background_color: prize.background_color,
      text_color: prize.text_color,
      enabled: true
    }))
  };
}

export default function LotteryView({ locale, user, onOpenOrder, onNotify }) {
  const [campaigns, setCampaigns] = useState([]);
  const [draws, setDraws] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [probabilityDrafts, setProbabilityDrafts] = useState({});
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [campaignFormOpen, setCampaignFormOpen] = useState(false);
  const [testCampaignId, setTestCampaignId] = useState("");
  const [testing, setTesting] = useState(false);
  const [confirmDrawAction, setConfirmDrawAction] = useState(null);
  const [drawPage, setDrawPage] = useState(1);
  const campaignFormRef = useRef(null);
  const canManage = Boolean(user?.permissions?.includes("manage_lottery"));
  const canRedeem = Boolean(user?.permissions?.includes("redeem_lottery"));
  const canSettings = Boolean(user?.permissions?.includes("manage_settings"));
  const probabilities = useMemo(() => lotteryProbabilities(form.prizes), [form.prizes]);
  const drawPageSize = 10;
  const drawPageCount = Math.max(1, Math.ceil(draws.length / drawPageSize));
  const visibleDraws = draws.slice((drawPage - 1) * drawPageSize, drawPage * drawPageSize);

  const load = useCallback(async () => {
    const requests = [];
    if (canManage) requests.push(api("/lottery/campaigns").then(setCampaigns));
    if (canManage) requests.push(api("/lottery/draws").then(setDraws));
    if (canSettings) requests.push(api("/settings").then(setSettings));
    await Promise.all(requests);
  }, [canManage, canSettings]);
  useEffect(() => { load().catch((error) => onNotify?.(error.message)); }, [load, onNotify]);
  useEffect(() => {
    if (!testCampaignId && campaigns[0]?.id) setTestCampaignId(campaigns[0].id);
  }, [campaigns, testCampaignId]);
  useEffect(() => {
    setDrawPage((page) => Math.min(page, drawPageCount));
  }, [drawPageCount]);

  function updatePrize(index, patch) {
    setForm((current) => ({ ...current, prizes: current.prizes.map((prize, i) => i === index ? { ...prize, ...patch } : prize) }));
  }
  function updateProbability(index, value) {
    setProbabilityDrafts({});
    setForm((current) => ({ ...current, prizes: rebalanceLotteryProbabilities(current.prizes, index, value) }));
  }
  function commitProbability(index, value) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) updateProbability(index, numericValue);
    else setProbabilityDrafts((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  }
  function updateI18n(field, localeKey, value) {
    setForm((current) => ({ ...current, [field]: { ...current[field], [localeKey]: value } }));
  }
  async function saveCampaign(event) {
    event.preventDefault();
    if (!canManage) return;
    if (new Date(form.ends_at) <= new Date(form.starts_at)) {
      onNotify?.(t(locale, "结束时间必须晚于开始时间。", "The end time must be after the start time."));
      return;
    }
    const normalizedWeights = normalizedLotteryWeights(form.prizes);
    if (!normalizedWeights) { onNotify?.(t(locale, "每个奖项都需要输入大于 0 的权重数字。", "Enter a weight greater than 0 for every prize.")); return; }
    setSaving(true);
    try {
      const path = editingCampaignId ? `/lottery/campaigns/${editingCampaignId}` : "/lottery/campaigns";
      await api(path, {
        method: editingCampaignId ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
          prizes: form.prizes.map(({ weight_value, locked, ...prize }, position) => ({ ...prize, weight_bps: normalizedWeights[position], position }))
        })
      });
      setForm(initialForm());
      setEditingCampaignId(null);
      setCampaignFormOpen(false);
      await load();
      onNotify?.(editingCampaignId
        ? t(locale, "抽奖活动已更新。", "Lottery campaign updated.")
        : t(locale, "抽奖活动已保存为草稿。", "Campaign saved as draft."));
    } catch (error) { onNotify?.(error.message); }
    finally { setSaving(false); }
  }
  async function editCampaign(id) {
    try {
      const campaign = await api(`/lottery/campaigns/${id}`);
      setForm(formFromCampaign(campaign));
      setEditingCampaignId(id);
      setCampaignFormOpen(true);
      window.requestAnimationFrame(() => campaignFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) { onNotify?.(error.message); }
  }
  function cancelEdit() {
    setEditingCampaignId(null);
    setForm(initialForm());
    setCampaignFormOpen(false);
  }
  function startNewCampaign() {
    setEditingCampaignId(null);
    setForm(initialForm());
    setCampaignFormOpen(true);
    window.requestAnimationFrame(() => campaignFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  async function campaignAction(id, action) {
    try { await api(`/lottery/campaigns/${id}/${action}`, { method: "POST" }); await load(); onNotify?.(t(locale, "活动状态已更新。", "Campaign status updated.")); }
    catch (error) {
      onNotify?.(error.code === "LOTTERY_CAMPAIGN_OVERLAP" || error.message?.includes("Only one lottery campaign")
        ? t(locale, "同一时段只能进行一个活动，请先暂停或结束当前活动。", "Only one campaign can run at a time. Pause or end the current campaign first.")
        : error.message);
    }
  }
  async function deleteCampaign(campaign) {
    const name = labelOf(campaign.title_i18n, locale) || campaign.internal_name;
    if (!window.confirm(t(locale, `确认删除“${name}”？历史中奖记录会保留。`, `Delete “${name}”? Historical draw records will be kept.`))) return;
    try {
      await api(`/lottery/campaigns/${campaign.id}`, { method: "DELETE" });
      if (editingCampaignId === campaign.id) cancelEdit();
      if (testCampaignId === campaign.id) setTestCampaignId("");
      await load();
      onNotify?.(t(locale, "活动已删除。", "Campaign deleted."));
    } catch (error) { onNotify?.(error.message); }
  }
  async function saveDisplaySettings(event) {
    event.preventDefault();
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify({
        customer_display_enabled: settings.customer_display_enabled,
        customer_display_interaction_mode: "customer_touch",
        customer_display_show_bill_on_checkout: settings.customer_display_show_bill_on_checkout,
        customer_display_auto_show_lottery: settings.customer_display_auto_show_lottery,
        customer_display_lottery_invitation_enabled: settings.customer_display_lottery_invitation_enabled,
        customer_display_lottery_invitation_i18n: settings.customer_display_lottery_invitation_i18n || {},
        customer_display_lottery_invitation_seconds: Number(settings.customer_display_lottery_invitation_seconds ?? 10),
        customer_display_payment_success_seconds: Number(settings.customer_display_payment_success_seconds),
        customer_display_lottery_result_seconds: Number(settings.customer_display_lottery_result_seconds),
        customer_display_idle_content: settings.customer_display_idle_content || {}
      }) });
      onNotify?.(t(locale, "顾客屏设置已保存。", "Customer display settings saved."));
    } catch (error) { onNotify?.(error.message); }
  }
  function updateDisplayI18n(container, localeKey, value) {
    setSettings((current) => ({
      ...current,
      [container]: { ...(current[container] || {}), [localeKey]: value }
    }));
  }
  function updateIdleI18n(field, localeKey, value) {
    setSettings((current) => ({
      ...current,
      customer_display_idle_content: {
        ...(current.customer_display_idle_content || {}),
        [field]: {
          ...(current.customer_display_idle_content?.[field] || {}),
          [localeKey]: value
        }
      }
    }));
  }
  function updateInvitationImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      onNotify?.(t(locale, "请选择图片文件。", "Choose an image file."));
      return;
    }
    if (file.size > 650 * 1024) {
      onNotify?.(t(locale, "图片不能超过 650KB。", "The image must be smaller than 650KB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSettings((current) => ({
      ...current,
      customer_display_idle_content: {
        ...(current.customer_display_idle_content || {}),
        review_image_url: String(reader.result || "")
      }
    }));
    reader.onerror = () => onNotify?.(t(locale, "图片读取失败。", "The image could not be read."));
    reader.readAsDataURL(file);
  }
  function resetInvitationImage() {
    setSettings((current) => ({
      ...current,
      customer_display_idle_content: {
        ...(current.customer_display_idle_content || {}),
        review_image_url: "/customer-display/default-review-qr.png"
      }
    }));
  }
  async function showTestOnCustomerDisplay() {
    if (!testCampaignId || testing) return;
    setTesting(true);
    try {
      await api(`/lottery/campaigns/${testCampaignId}/test-draw`, {
        method: "POST",
        body: JSON.stringify({ show_on_customer_display: true })
      });
      onNotify?.(t(locale, "测试抽奖页面已显示在顾客屏。", "Test draw is ready on the customer display."));
    } catch (error) { onNotify?.(error.message); }
    finally { setTesting(false); }
  }
  async function redeemDraw(draw) {
    try {
      await api(`/lottery/draws/${draw.id}/redeem`, { method: "POST" });
      setConfirmDrawAction(null);
      await load();
      onNotify?.(t(locale, "已标记兑奖。", "Prize redeemed."));
    } catch (error) { onNotify?.(error.message); }
  }
  async function voidDraw(draw) {
    try {
      await api(`/lottery/draws/${draw.id}/void`, { method: "POST" });
      setConfirmDrawAction(null);
      await load();
      onNotify?.(t(locale, "中奖记录已作废。", "Lottery record voided."));
    } catch (error) { onNotify?.(error.message); }
  }

  return (
    <div className="admin-content-grid lottery-admin-view">
      {canManage && (campaignFormOpen || editingCampaignId) && <section className="panel" ref={campaignFormRef}>
        <div className="panel-title split">
          <div className="inline-title"><Sparkles size={18} /><h2>{editingCampaignId ? t(locale, "编辑抽奖活动", "Edit lottery campaign") : t(locale, "新建抽奖活动", "New lottery campaign")}</h2></div>
          <button type="button" className="lottery-cancel-edit" onClick={cancelEdit}><X size={15} />{editingCampaignId ? t(locale, "取消编辑", "Cancel edit") : t(locale, "取消", "Cancel")}</button>
        </div>
        <form className="settings-form" onSubmit={saveCampaign}>
          <div className="settings-fields">
            <label>{t(locale, "内部名称", "Internal name")}<input value={form.internal_name} onChange={(e) => setForm({ ...form, internal_name: e.target.value })} required /></label>
            <label>{t(locale, "最低订单金额", "Minimum order total")}<DeferredNumberInput min={0} step={0.01} value={form.minimum_order_total} onCommit={(value) => setForm((current) => ({ ...current, minimum_order_total: value }))} /></label>
          </div>
          <div className="lottery-schedule-editor">
            <div className="panel-title"><Clock size={17} /><h3>{t(locale, "活动有效期", "Campaign validity")}</h3><span>{t(locale, "按英国时间显示", "Europe/London time")}</span></div>
            <div className="settings-fields">
              <label>{t(locale, "开始时间", "Starts")}<input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required /></label>
              <label>{t(locale, "结束时间", "Ends")}<input type="datetime-local" min={form.starts_at} value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} required /></label>
            </div>
          </div>
          <div className="lottery-spin-duration-editor">
            <div className="panel-title"><Clock size={17} /><h3>{t(locale, "转盘转动时长", "Wheel spin duration")}</h3><span>{t(locale, "从开始转动到停止", "From start to stop")}</span></div>
            <div className="settings-fields">
              <label>{t(locale, "转动秒数（3–30）", "Spin duration (3–30 seconds)")}<DeferredNumberInput min={3} max={30} step={1} value={form.spin_duration_seconds} onCommit={(value) => setForm((current) => ({ ...current, spin_duration_seconds: value }))} required /></label>
            </div>
          </div>
          <div className="settings-fields">
            <label>{t(locale, "标题（中文）", "Title (Chinese)")}<input value={form.title_i18n["zh-CN"]} onChange={(e) => updateI18n("title_i18n", "zh-CN", e.target.value)} /></label>
            <label>{t(locale, "标题（英文）", "Title (English)")}<input value={form.title_i18n["en-GB"]} onChange={(e) => updateI18n("title_i18n", "en-GB", e.target.value)} /></label>
            <label>{t(locale, "转盘下方提示（中文，可留空）", "Wheel note (Chinese, optional)")}<input value={form.subtitle_i18n["zh-CN"] || ""} onChange={(e) => updateI18n("subtitle_i18n", "zh-CN", e.target.value)} /></label>
            <label>{t(locale, "转盘下方提示（英文，可留空）", "Wheel note (English, optional)")}<input value={form.subtitle_i18n["en-GB"] || ""} onChange={(e) => updateI18n("subtitle_i18n", "en-GB", e.target.value)} /></label>
          </div>
          <div className="lottery-prize-editor">
            <div className="panel-title"><Gift size={18} /><h3>{t(locale, "奖项与概率", "Prizes & probabilities")}</h3><span>{t(locale, "滑块自动平衡 · 可锁定", "Auto-balanced sliders · Lockable")}</span></div>
            {form.prizes.map((prize, index) => <div className="lottery-prize-row" key={prize.id || index}>
              <select value={prize.kind} onChange={(e) => updatePrize(index, { kind: e.target.value, fulfillment_type: e.target.value === "no_prize" ? null : prize.fulfillment_type || "instant" })}><option value="prize">{t(locale, "奖品", "Prize")}</option><option value="no_prize">{t(locale, "谢谢参与", "No prize")}</option></select>
              <select value={prize.fulfillment_type || ""} disabled={prize.kind === "no_prize"} onChange={(e) => updatePrize(index, { fulfillment_type: e.target.value })} aria-label={t(locale, "发放方式", "Fulfilment type")}>
                {prize.kind === "no_prize" ? <option value="">{t(locale, "不适用", "Not applicable")}</option> : null}
                <option value="instant">{t(locale, "现场发放", "Give now")}</option>
                <option value="voucher">{t(locale, "下次使用", "Use next time")}</option>
              </select>
              <input placeholder={t(locale, "奖项名称（中文）", "Prize name (Chinese)")} value={prize.name_i18n["zh-CN"] || ""} onChange={(e) => updatePrize(index, { name_i18n: { ...prize.name_i18n, "zh-CN": e.target.value } })} required />
              <input placeholder={t(locale, "奖项名称（英文）", "Prize name (English)")} value={prize.name_i18n["en-GB"] || ""} onChange={(e) => updatePrize(index, { name_i18n: { ...prize.name_i18n, "en-GB": e.target.value } })} required />
              <div className={`lottery-weight-field${prize.locked ? " is-locked" : ""}`}>
                <input type="range" min="0.01" max="99.99" step="0.01" value={probabilities[index] || 0.01} onChange={(e) => updateProbability(index, Number(e.target.value))} disabled={prize.locked} aria-label={t(locale, "中奖概率", "Winning probability")} />
                <input className="lottery-probability-input" type="text" inputMode="decimal" min="0.01" max="99.99" step="0.01" value={probabilityDrafts[index] ?? Number(probabilities[index] || 0).toFixed(2)} onFocus={(e) => { setProbabilityDrafts((current) => ({ ...current, [index]: Number(probabilities[index] || 0).toFixed(2) })); const input = e.currentTarget; window.requestAnimationFrame(() => input.select()); }} onChange={(e) => { if (/^\d*(?:\.\d*)?$/.test(e.target.value)) setProbabilityDrafts((current) => ({ ...current, [index]: e.target.value })); }} onBlur={(e) => commitProbability(index, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitProbability(index, e.currentTarget.value); e.currentTarget.blur(); } }} disabled={prize.locked} aria-label={t(locale, "精确中奖概率百分比", "Exact winning probability percentage")} />
                <button type="button" className="lottery-lock-button" onClick={() => updatePrize(index, { locked: !prize.locked })} aria-pressed={Boolean(prize.locked)} title={prize.locked ? t(locale, "解锁概率", "Unlock probability") : t(locale, "锁定概率", "Lock probability")}>
                  {prize.locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
              </div>
              <DeferredNumberInput min={prize.stock_awarded || 0} step={1} allowEmpty placeholder={t(locale, "库存不限", "Unlimited stock")} value={prize.stock_total} onCommit={(value) => updatePrize(index, { stock_total: value })} />
              <button type="button" className="lottery-remove-prize" onClick={() => setForm({ ...form, prizes: form.prizes.filter((_, prizeIndex) => prizeIndex !== index) })} disabled={form.prizes.length <= 2} title={t(locale, "删除奖项", "Remove prize")}><Trash2 size={15} /></button>
            </div>)}
            <button type="button" onClick={() => setForm({ ...form, prizes: [...form.prizes, { kind: "prize", fulfillment_type: "instant", name_i18n: { "zh-CN": "新奖项", "en-GB": "New prize" }, weight_value: 1, locked: false, stock_total: null, background_color: "#f59e0b", text_color: "#fff" }] })}><Plus size={15} />{t(locale, "添加奖项", "Add prize")}</button>
          </div>
          <div className="settings-actions"><button className="primary" type="submit" disabled={saving}><Save size={16} />{saving ? t(locale, "保存中…", "Saving…") : editingCampaignId ? t(locale, "保存修改", "Save changes") : t(locale, "保存草稿", "Save draft")}</button></div>
        </form>
      </section>}

      {canManage && <section className="panel">
        <div className="panel-title split"><div className="inline-title"><Trophy size={18} /><h2>{t(locale, "活动列表", "Campaigns")}</h2></div><button type="button" className="lottery-new-campaign primary" onClick={startNewCampaign}><Plus size={15} />{t(locale, "新建活动", "New campaign")}</button></div>
        <div className="lottery-campaign-list">
          {campaigns.map((campaign) => {
            const status = campaignStatus(campaign, locale);
            const activationBlocked = hasPublishedScheduleConflict(campaign, campaigns);
            return <article className={`lottery-campaign-card${editingCampaignId === campaign.id ? " is-editing" : ""}${status.running ? " is-running" : ""}`} key={campaign.id}>
              <div>
                <div className="lottery-campaign-name"><strong>{labelOf(campaign.title_i18n, locale) || campaign.internal_name}</strong>{status.running ? <em>{t(locale, "当前活动", "Current")}</em> : null}{activationBlocked && campaign.status !== "published" ? <em className="is-conflicting">{t(locale, "时段冲突", "Schedule conflict")}</em> : null}</div>
                <span>{campaign.internal_name} · {status.label}</span>
                <small className="lottery-campaign-schedule"><Clock size={13} />{t(locale, "活动有效期：", "Valid: ")}{scheduleLabel(campaign, locale)}</small>
              </div>
              <div className="settings-actions">
                {(campaign.status === "draft" || campaign.status === "paused") ? <button onClick={() => editCampaign(campaign.id)}><Pencil size={14} />{t(locale, "编辑", "Edit")}</button> : null}
                {campaign.status === "draft" && <button disabled={activationBlocked} title={activationBlocked ? t(locale, "请先暂停或结束时段重叠的活动", "Pause or end the overlapping campaign first") : ""} onClick={() => campaignAction(campaign.id, "publish")}><Play size={14} />{t(locale, "发布", "Publish")}</button>}
                {campaign.status === "published" && <button onClick={() => campaignAction(campaign.id, "pause")}><Pause size={14} />{t(locale, "暂停", "Pause")}</button>}
                {campaign.status === "paused" && <button disabled={activationBlocked} title={activationBlocked ? t(locale, "请先暂停或结束时段重叠的活动", "Pause or end the overlapping campaign first") : ""} onClick={() => campaignAction(campaign.id, "resume")}><Play size={14} />{t(locale, "恢复", "Resume")}</button>}
                <button className="lottery-delete-campaign" onClick={() => deleteCampaign(campaign)}><Trash2 size={14} />{t(locale, "删除", "Delete")}</button>
              </div>
            </article>;
          })}
        </div>
      </section>}

      {canManage && <section className="panel lottery-test-panel">
        <div className="panel-title"><Sparkles size={18} /><h2>{t(locale, "抽奖测试", "Test draw")}</h2></div>
        <div className="lottery-test-controls">
          <label>
            <span>{t(locale, "选择活动", "Campaign")}</span>
            <select value={testCampaignId} onChange={(event) => setTestCampaignId(event.target.value)}>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{labelOf(campaign.title_i18n, locale) || campaign.internal_name} · {campaign.status}</option>)}
            </select>
          </label>
          <button className="primary lottery-test-action" type="button" disabled={!testCampaignId || testing} onClick={showTestOnCustomerDisplay}>
            <Sparkles size={15} />{testing ? t(locale, "发送中…", "Sending…") : t(locale, "显示测试抽奖", "Show test draw")}
          </button>
        </div>
        <p className="lottery-test-note">{t(locale, "顾客在顾客屏点击或滑动后才会开奖；测试不扣库存、不写抽奖记录。", "The draw starts only after customer interaction; tests do not use stock or create draw records.")}</p>
      </section>}

      {canSettings && settings && <section className="panel lottery-display-settings">
        <div className="panel-title"><Settings size={18} /><h2>{t(locale, "顾客屏设置", "Customer display")}</h2></div>
        <form className="settings-form" onSubmit={saveDisplaySettings}>
          <div className="settings-checkboxes">
            <label className="checkbox"><input type="checkbox" checked={settings.customer_display_enabled !== false} onChange={(e) => setSettings({ ...settings, customer_display_enabled: e.target.checked })} />{t(locale, "启用顾客屏", "Enable customer display")}</label>
            <label className="checkbox"><input type="checkbox" checked={Boolean(settings.customer_display_show_bill_on_checkout)} onChange={(e) => setSettings({ ...settings, customer_display_show_bill_on_checkout: e.target.checked })} />{t(locale, "结账时显示账单", "Show bill at checkout")}</label>
            <label className="checkbox"><input type="checkbox" checked={settings.customer_display_lottery_invitation_enabled !== false} onChange={(e) => setSettings({ ...settings, customer_display_lottery_invitation_enabled: e.target.checked, customer_display_auto_show_lottery: e.target.checked ? false : settings.customer_display_auto_show_lottery })} />{t(locale, "付款后显示抽奖邀请", "Show lottery invitation after payment")}</label>
            <label className="checkbox"><input type="checkbox" checked={Boolean(settings.customer_display_auto_show_lottery)} onChange={(e) => setSettings({ ...settings, customer_display_auto_show_lottery: e.target.checked, customer_display_lottery_invitation_enabled: e.target.checked ? false : settings.customer_display_lottery_invitation_enabled })} />{t(locale, "跳过邀请，直接显示转盘", "Skip invitation and show wheel")}</label>
          </div>

          <div className="lottery-display-copy-group">
            <div className="panel-title"><h3>{t(locale, "抽奖邀请文案", "Lottery invitation copy")}</h3></div>
            <div className="settings-fields">
              <label>{t(locale, "邀请文字（中文）", "Invitation (Chinese)")}<input required value={settings.customer_display_lottery_invitation_i18n?.["zh-CN"] || ""} onChange={(e) => updateDisplayI18n("customer_display_lottery_invitation_i18n", "zh-CN", e.target.value)} /></label>
              <label>{t(locale, "邀请文字（英文）", "Invitation (English)")}<input required value={settings.customer_display_lottery_invitation_i18n?.["en-GB"] || ""} onChange={(e) => updateDisplayI18n("customer_display_lottery_invitation_i18n", "en-GB", e.target.value)} /></label>
            </div>
            <div className="lottery-display-image-setting">
              <label>{t(locale, "邀请页图片（Logo 下方）", "Invitation image (below logo)")}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={updateInvitationImage} /></label>
              <div className="lottery-display-image-preview">
                <img src={settings.customer_display_idle_content?.review_image_url || "/customer-display/default-review-qr.png"} alt="" />
                <button type="button" className="lottery-record-action" onClick={resetInvitationImage}>{t(locale, "恢复默认二维码", "Restore default QR")}</button>
              </div>
            </div>
          </div>

          <div className="lottery-display-copy-group">
            <div className="panel-title"><h3>{t(locale, "欢迎界面文字", "Welcome screen copy")}</h3></div>
            <div className="settings-fields lottery-welcome-fields">
              <label>{t(locale, "欢迎标题（中文）", "Welcome title (Chinese)")}<input value={settings.customer_display_idle_content?.title_i18n?.["zh-CN"] || ""} onChange={(e) => updateIdleI18n("title_i18n", "zh-CN", e.target.value)} /></label>
              <label>{t(locale, "欢迎标题（英文）", "Welcome title (English)")}<input value={settings.customer_display_idle_content?.title_i18n?.["en-GB"] || ""} onChange={(e) => updateIdleI18n("title_i18n", "en-GB", e.target.value)} /></label>
              <label>{t(locale, "副标题（中文，可留空）", "Subtitle (Chinese, optional)")}<input value={settings.customer_display_idle_content?.subtitle_i18n?.["zh-CN"] || ""} onChange={(e) => updateIdleI18n("subtitle_i18n", "zh-CN", e.target.value)} /></label>
              <label>{t(locale, "副标题（英文，可留空）", "Subtitle (English, optional)")}<input value={settings.customer_display_idle_content?.subtitle_i18n?.["en-GB"] || ""} onChange={(e) => updateIdleI18n("subtitle_i18n", "en-GB", e.target.value)} /></label>
            </div>
          </div>

          <div className="settings-fields">
            <label>{t(locale, "抽奖邀请显示秒数", "Invitation screen seconds")}<DeferredNumberInput min={1} max={60} step={1} value={settings.customer_display_lottery_invitation_seconds ?? 10} onCommit={(value) => setSettings((current) => ({ ...current, customer_display_lottery_invitation_seconds: value }))} /></label>
            <label>{t(locale, "付款成功显示秒数", "Paid screen seconds")}<DeferredNumberInput min={1} max={30} step={1} value={settings.customer_display_payment_success_seconds ?? 5} onCommit={(value) => setSettings((current) => ({ ...current, customer_display_payment_success_seconds: value }))} /></label>
            <label>{t(locale, "抽奖结果显示秒数", "Result screen seconds")}<DeferredNumberInput min={5} max={120} step={1} value={settings.customer_display_lottery_result_seconds ?? 20} onCommit={(value) => setSettings((current) => ({ ...current, customer_display_lottery_result_seconds: value }))} /></label>
          </div>
          <div className="settings-actions"><button className="primary" type="submit"><Save size={16} />{t(locale, "保存顾客屏设置", "Save display settings")}</button></div>
        </form>
      </section>}

      {canManage && <section className="panel">
        <div className="panel-title"><Gift size={18} /><h2>{t(locale, "抽奖记录", "Draw history")}</h2></div>
        <div className="lottery-draw-list">
          {visibleDraws.map((draw) => {
            const prizeName = labelOf(draw.prize_snapshot?.name_i18n, locale) || labelOf(draw.prize_name_i18n, locale);
            const noPrize = (draw.prize_snapshot?.kind || draw.prize_kind) === "no_prize";
            const instantPrize = !noPrize && draw.prize_snapshot?.fulfillment_type === "instant";
            const voided = Boolean(draw.voided_at);
            const action = confirmDrawAction?.id === draw.id ? confirmDrawAction.action : null;
            return <div className="lottery-draw-row" key={draw.id}>
              <button type="button" className="lottery-order-link" onClick={() => onOpenOrder?.(draw.source_order_id)} title={t(locale, "打开原订单", "Open original order")}>
                {t(locale, "订单", "Order")} {draw.source_order_no}
              </button>
              <div className="lottery-draw-result"><strong>{prizeName}</strong><span>{labelOf(draw.campaign_title_i18n, locale)} · {draw.access_code_suffix}</span></div>
              <span>{noPrize ? t(locale, "未中奖", "No prize") : voided ? t(locale, "已作废", "Voided") : instantPrize ? t(locale, "现场发放", "Give now") : draw.redeemed_at ? t(locale, "已兑奖", "Redeemed") : t(locale, "中奖 · 待兑奖", "Won · Pending")}</span>
              {canRedeem && !noPrize && !draw.redeemed_at && !voided ? action ? <div className="lottery-redeem-confirmation">
                <span className="lottery-action-confirm-label">{action === "void" ? t(locale, "确认作废？", "Confirm void?") : t(locale, "确认兑奖？", "Confirm redeem?")}</span>
                <button className={action === "void" ? "lottery-record-action void" : "lottery-record-action primary"} onClick={() => action === "void" ? voidDraw(draw) : redeemDraw(draw)}>{action === "void" ? <Ban size={14} /> : <Sparkles size={14} />}{action === "void" ? t(locale, "确认作废", "Confirm void") : t(locale, "确认兑奖", "Confirm redeem")}</button>
                <button className="lottery-record-action" onClick={() => setConfirmDrawAction(null)}>{t(locale, "取消", "Cancel")}</button>
              </div> : <div className="lottery-record-actions">
                {!instantPrize ? <button className="lottery-record-action primary" onClick={() => setConfirmDrawAction({ id: draw.id, action: "redeem" })}><Sparkles size={14} />{t(locale, "兑奖", "Redeem")}</button> : null}
                <button className="lottery-record-action void" onClick={() => setConfirmDrawAction({ id: draw.id, action: "void" })}><Ban size={14} />{t(locale, "作废", "Void")}</button>
              </div> : null}
            </div>;
          })}
        </div>
        <div className="lottery-pagination" aria-label={t(locale, "抽奖记录分页", "Lottery history pagination")}>
          <button className="lottery-record-action" type="button" disabled={drawPage <= 1} onClick={() => setDrawPage((page) => Math.max(1, page - 1))}><ChevronLeft size={15} />{t(locale, "上一页", "Previous")}</button>
          <span>{t(locale, `第 ${drawPage} / ${drawPageCount} 页`, `Page ${drawPage} / ${drawPageCount}`)} · {draws.length}</span>
          <button className="lottery-record-action" type="button" disabled={drawPage >= drawPageCount} onClick={() => setDrawPage((page) => Math.min(drawPageCount, page + 1))}>{t(locale, "下一页", "Next")}<ChevronRight size={15} /></button>
        </div>
      </section>}
    </div>
  );
}
