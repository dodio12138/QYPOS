"use client";

import { Gift, Pause, Pencil, Play, Plus, Save, Settings, Sparkles, Trash2, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, labelOf } from "../../../lib/api";
import { formatLotteryProbability, lotteryProbabilities, normalizedLotteryWeights } from "./lottery-form-helpers";

function t(locale, zh, en) { return locale === "en-GB" ? en : zh; }
function dateInput(date) {
  const value = new Date(date);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
function initialForm() {
  const now = Date.now();
  return {
    internal_name: "新抽奖活动",
    title_i18n: { "zh-CN": "幸运大转盘", "en-GB": "Lucky Wheel" },
    subtitle_i18n: { "zh-CN": "每张有效小票一次机会", "en-GB": "One chance per valid receipt" },
    button_i18n: { "zh-CN": "开始抽奖", "en-GB": "Start draw" },
    losing_message_i18n: { "zh-CN": "谢谢参与", "en-GB": "Thank you for taking part" },
    rules_i18n: { "zh-CN": "点击按钮或滑动转盘开始抽奖", "en-GB": "Tap the button or swipe the wheel to start" },
    starts_at: dateInput(now),
    ends_at: dateInput(now + 30 * 86400000),
    minimum_order_total: 0,
    ticket_valid_minutes: 1440,
    claim_valid_minutes: 1440,
    prizes: [
      { kind: "prize", name_i18n: { "zh-CN": "免费饮料", "en-GB": "Free drink" }, weight_value: 5, stock_total: 20, background_color: "#f97316", text_color: "#fff" },
      { kind: "prize", name_i18n: { "zh-CN": "下次九折", "en-GB": "10% off next time" }, weight_value: 15, stock_total: null, background_color: "#2563eb", text_color: "#fff" },
      { kind: "no_prize", name_i18n: { "zh-CN": "谢谢参与", "en-GB": "Thank you" }, weight_value: 80, stock_total: null, background_color: "#64748b", text_color: "#fff" }
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
    minimum_order_total: Number(campaign.minimum_order_total || 0),
    service_types: Array.isArray(campaign.service_types) ? campaign.service_types : fallback.service_types,
    excluded_payment_methods: Array.isArray(campaign.excluded_payment_methods) ? campaign.excluded_payment_methods : fallback.excluded_payment_methods,
    ticket_valid_minutes: Number(campaign.ticket_valid_minutes || fallback.ticket_valid_minutes),
    claim_valid_minutes: Number(campaign.claim_valid_minutes || fallback.claim_valid_minutes),
    theme: campaign.theme || {},
    prizes: (campaign.prizes || []).filter((prize) => prize.enabled !== false).map((prize, position) => ({
      id: prize.id,
      kind: prize.kind,
      name_i18n: prize.name_i18n || {},
      description_i18n: prize.description_i18n || {},
      claim_instructions_i18n: prize.claim_instructions_i18n || {},
      weight_value: Number(prize.weight_bps) / 100,
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
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [testCampaignId, setTestCampaignId] = useState("");
  const [testing, setTesting] = useState(false);
  const [confirmRedeemId, setConfirmRedeemId] = useState(null);
  const campaignFormRef = useRef(null);
  const canManage = Boolean(user?.permissions?.includes("manage_lottery"));
  const canRedeem = Boolean(user?.permissions?.includes("redeem_lottery"));
  const canSettings = Boolean(user?.permissions?.includes("manage_settings"));
  const probabilities = useMemo(() => lotteryProbabilities(form.prizes), [form.prizes]);

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

  function updatePrize(index, patch) {
    setForm((current) => ({ ...current, prizes: current.prizes.map((prize, i) => i === index ? { ...prize, ...patch } : prize) }));
  }
  function updateI18n(field, localeKey, value) {
    setForm((current) => ({ ...current, [field]: { ...current[field], [localeKey]: value } }));
  }
  async function saveCampaign(event) {
    event.preventDefault();
    if (!canManage) return;
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
          prizes: form.prizes.map(({ weight_value, ...prize }, position) => ({ ...prize, weight_bps: normalizedWeights[position], position }))
        })
      });
      setForm(initialForm());
      setEditingCampaignId(null);
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
      window.requestAnimationFrame(() => campaignFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) { onNotify?.(error.message); }
  }
  function cancelEdit() {
    setEditingCampaignId(null);
    setForm(initialForm());
  }
  async function campaignAction(id, action) {
    try { await api(`/lottery/campaigns/${id}/${action}`, { method: "POST" }); await load(); onNotify?.(t(locale, "活动状态已更新。", "Campaign status updated.")); }
    catch (error) { onNotify?.(error.message); }
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
        customer_display_payment_success_seconds: Number(settings.customer_display_payment_success_seconds),
        customer_display_lottery_result_seconds: Number(settings.customer_display_lottery_result_seconds),
        customer_display_idle_content: settings.customer_display_idle_content || {}
      }) });
      onNotify?.(t(locale, "顾客屏设置已保存。", "Customer display settings saved."));
    } catch (error) { onNotify?.(error.message); }
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
      setConfirmRedeemId(null);
      await load();
      onNotify?.(t(locale, "已标记兑奖。", "Prize redeemed."));
    } catch (error) { onNotify?.(error.message); }
  }

  return (
    <div className="admin-content-grid lottery-admin-view">
      {canManage && <section className="panel" ref={campaignFormRef}>
        <div className="panel-title split">
          <div className="inline-title"><Sparkles size={18} /><h2>{editingCampaignId ? t(locale, "编辑抽奖活动", "Edit lottery campaign") : t(locale, "新建抽奖活动", "New lottery campaign")}</h2></div>
          {editingCampaignId ? <button type="button" className="lottery-cancel-edit" onClick={cancelEdit}><X size={15} />{t(locale, "取消编辑", "Cancel edit")}</button> : null}
        </div>
        <form className="settings-form" onSubmit={saveCampaign}>
          <div className="settings-fields">
            <label>{t(locale, "内部名称", "Internal name")}<input value={form.internal_name} onChange={(e) => setForm({ ...form, internal_name: e.target.value })} required /></label>
            <label>{t(locale, "最低订单金额", "Minimum order total")}<input type="number" min="0" step="0.01" value={form.minimum_order_total} onChange={(e) => setForm({ ...form, minimum_order_total: Number(e.target.value) })} /></label>
            <label>{t(locale, "开始时间", "Starts")}<input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required /></label>
            <label>{t(locale, "结束时间", "Ends")}<input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} required /></label>
          </div>
          <div className="settings-fields">
            <label>{t(locale, "标题（中文）", "Title (Chinese)")}<input value={form.title_i18n["zh-CN"]} onChange={(e) => updateI18n("title_i18n", "zh-CN", e.target.value)} /></label>
            <label>{t(locale, "标题（英文）", "Title (English)")}<input value={form.title_i18n["en-GB"]} onChange={(e) => updateI18n("title_i18n", "en-GB", e.target.value)} /></label>
            <label>{t(locale, "规则说明", "Rules")}<input value={form.rules_i18n["zh-CN"]} onChange={(e) => updateI18n("rules_i18n", "zh-CN", e.target.value)} /></label>
          </div>
          <div className="lottery-prize-editor">
            <div className="panel-title"><Gift size={18} /><h3>{t(locale, "奖项与概率", "Prizes & probabilities")}</h3><span>{t(locale, "自动归一 100%", "Normalized to 100%")}</span></div>
            {form.prizes.map((prize, index) => <div className="lottery-prize-row" key={prize.id || index}>
              <select value={prize.kind} onChange={(e) => updatePrize(index, { kind: e.target.value })}><option value="prize">{t(locale, "奖品", "Prize")}</option><option value="no_prize">{t(locale, "谢谢参与", "No prize")}</option></select>
              <input placeholder={t(locale, "奖项名称（中文）", "Prize name (Chinese)")} value={prize.name_i18n["zh-CN"] || ""} onChange={(e) => updatePrize(index, { name_i18n: { ...prize.name_i18n, "zh-CN": e.target.value } })} required />
              <input placeholder={t(locale, "奖项名称（英文）", "Prize name (English)")} value={prize.name_i18n["en-GB"] || ""} onChange={(e) => updatePrize(index, { name_i18n: { ...prize.name_i18n, "en-GB": e.target.value } })} required />
              <div className="lottery-weight-field">
                <input type="number" min="0.01" step="0.01" value={prize.weight_value} onChange={(e) => updatePrize(index, { weight_value: Number(e.target.value) })} aria-label={t(locale, "概率权重", "Probability weight")} />
                <span>{formatLotteryProbability(probabilities[index])}</span>
              </div>
              <input type="number" min={prize.stock_awarded || 0} placeholder={t(locale, "库存不限", "Unlimited stock")} value={prize.stock_total ?? ""} onChange={(e) => updatePrize(index, { stock_total: e.target.value === "" ? null : Number(e.target.value) })} />
              <button type="button" className="lottery-remove-prize" onClick={() => setForm({ ...form, prizes: form.prizes.filter((_, prizeIndex) => prizeIndex !== index) })} disabled={form.prizes.length <= 2} title={t(locale, "删除奖项", "Remove prize")}><Trash2 size={15} /></button>
            </div>)}
            <button type="button" onClick={() => setForm({ ...form, prizes: [...form.prizes, { kind: "prize", name_i18n: { "zh-CN": "新奖项", "en-GB": "New prize" }, weight_value: 1, stock_total: null, background_color: "#f59e0b", text_color: "#fff" }] })}><Plus size={15} />{t(locale, "添加奖项", "Add prize")}</button>
          </div>
          <div className="settings-actions"><button className="primary" type="submit" disabled={saving}><Save size={16} />{saving ? t(locale, "保存中…", "Saving…") : editingCampaignId ? t(locale, "保存修改", "Save changes") : t(locale, "保存草稿", "Save draft")}</button></div>
        </form>
      </section>}

      {canManage && <section className="panel">
        <div className="panel-title"><Trophy size={18} /><h2>{t(locale, "活动列表", "Campaigns")}</h2></div>
        <div className="lottery-campaign-list">
          {campaigns.map((campaign) => (
            <article className={`lottery-campaign-card${editingCampaignId === campaign.id ? " is-editing" : ""}`} key={campaign.id}>
              <div>
                <strong>{labelOf(campaign.title_i18n, locale) || campaign.internal_name}</strong>
                <span>{campaign.internal_name} · {campaign.status}</span>
              </div>
              <div className="settings-actions">
                {(campaign.status === "draft" || campaign.status === "paused") ? <button onClick={() => editCampaign(campaign.id)}><Pencil size={14} />{t(locale, "编辑", "Edit")}</button> : null}
                {campaign.status === "draft" && <button onClick={() => campaignAction(campaign.id, "publish")}><Play size={14} />{t(locale, "发布", "Publish")}</button>}
                {campaign.status === "published" && <button onClick={() => campaignAction(campaign.id, "pause")}><Pause size={14} />{t(locale, "暂停", "Pause")}</button>}
                {campaign.status === "paused" && <button onClick={() => campaignAction(campaign.id, "resume")}><Play size={14} />{t(locale, "恢复", "Resume")}</button>}
                <button className="lottery-delete-campaign" onClick={() => deleteCampaign(campaign)}><Trash2 size={14} />{t(locale, "删除", "Delete")}</button>
              </div>
            </article>
          ))}
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

      {canSettings && settings && <section className="panel"><div className="panel-title"><Settings size={18} /><h2>{t(locale, "顾客屏设置", "Customer display")}</h2></div><form className="settings-form" onSubmit={saveDisplaySettings}><div className="settings-checkboxes"><label className="checkbox"><input type="checkbox" checked={settings.customer_display_enabled !== false} onChange={(e) => setSettings({ ...settings, customer_display_enabled: e.target.checked })} />{t(locale, "启用顾客屏", "Enable customer display")}</label><label className="checkbox"><input type="checkbox" checked={Boolean(settings.customer_display_show_bill_on_checkout)} onChange={(e) => setSettings({ ...settings, customer_display_show_bill_on_checkout: e.target.checked })} />{t(locale, "结账时显示账单", "Show bill at checkout")}</label><label className="checkbox"><input type="checkbox" checked={Boolean(settings.customer_display_auto_show_lottery)} onChange={(e) => setSettings({ ...settings, customer_display_auto_show_lottery: e.target.checked })} />{t(locale, "付款后自动显示抽奖", "Auto-show lottery after payment")}</label></div><div className="settings-fields"><label>{t(locale, "付款成功显示秒数", "Paid screen seconds")}<input type="number" min="1" max="30" value={settings.customer_display_payment_success_seconds ?? 5} onChange={(e) => setSettings({ ...settings, customer_display_payment_success_seconds: Number(e.target.value) })} /></label><label>{t(locale, "抽奖结果显示秒数", "Result screen seconds")}<input type="number" min="5" max="120" value={settings.customer_display_lottery_result_seconds ?? 20} onChange={(e) => setSettings({ ...settings, customer_display_lottery_result_seconds: Number(e.target.value) })} /></label></div><div className="settings-actions"><button className="primary" type="submit"><Save size={16} />{t(locale, "保存顾客屏设置", "Save display settings")}</button></div></form></section>}

      {canManage && <section className="panel">
        <div className="panel-title"><Gift size={18} /><h2>{t(locale, "抽奖记录", "Draw history")}</h2></div>
        <div className="lottery-draw-list">
          {draws.slice(0, 30).map((draw) => {
            const prizeName = labelOf(draw.prize_snapshot?.name_i18n, locale) || labelOf(draw.prize_name_i18n, locale);
            const noPrize = (draw.prize_snapshot?.kind || draw.prize_kind) === "no_prize";
            return <div className="lottery-draw-row" key={draw.id}>
              <button type="button" className="lottery-order-link" onClick={() => onOpenOrder?.(draw.source_order_id)} title={t(locale, "打开原订单", "Open original order")}>
                {t(locale, "订单", "Order")} {draw.source_order_no}
              </button>
              <div className="lottery-draw-result"><strong>{prizeName}</strong><span>{labelOf(draw.campaign_title_i18n, locale)} · {draw.access_code_suffix}</span></div>
              <span>{noPrize ? t(locale, "未中奖", "No prize") : draw.redeemed_at ? t(locale, "已兑奖", "Redeemed") : t(locale, "中奖 · 待兑奖", "Won · Pending")}</span>
              {canRedeem && !noPrize && !draw.redeemed_at ? confirmRedeemId === draw.id ? <div className="lottery-redeem-confirmation">
                <button className="lottery-redeem-confirm" onClick={() => redeemDraw(draw)}><Sparkles size={14} />{t(locale, "确认兑奖", "Confirm redeem")}</button>
                <button onClick={() => setConfirmRedeemId(null)}>{t(locale, "取消", "Cancel")}</button>
              </div> : <button onClick={() => setConfirmRedeemId(draw.id)}><Sparkles size={14} />{t(locale, "兑奖", "Redeem")}</button> : null}
            </div>;
          })}
        </div>
      </section>}
    </div>
  );
}
