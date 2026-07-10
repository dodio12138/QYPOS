"use client";

import { useRef, useState } from "react";
import { Armchair, CircleDollarSign, Printer, ReceiptText, Save, Settings } from "lucide-react";
import { api } from "../../../lib/api";

function t(locale, zh, en) { return locale === "en-GB" ? en : zh; }
function money(value, currency = "CNY", locale = "zh-CN") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value || 0));
}

export default function SettingsView({ settings, setSettings, locale, onSaved, adminAuthorized = false }) {
  const originalProtectedSettings = useRef({
    tax: Number(settings.tax_rate), service: Number(settings.service_charge_rate),
    pricesIncludeTax: Boolean(settings.prices_include_tax), showTaxOnReceipt: Boolean(settings.show_tax_on_receipt)
  });
  const [confirmName, setConfirmName] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const protectedSettingsChanged = !adminAuthorized && (
    Number(settings.tax_rate) !== originalProtectedSettings.current.tax ||
    Number(settings.service_charge_rate) !== originalProtectedSettings.current.service ||
    Boolean(settings.prices_include_tax) !== originalProtectedSettings.current.pricesIncludeTax ||
    Boolean(settings.show_tax_on_receipt) !== originalProtectedSettings.current.showTaxOnReceipt
  );

  async function save(event) {
    event.preventDefault();
    if (protectedSettingsChanged && (!confirmName.trim() || !confirmPin)) {
      setFeedback(t(locale, "修改税务或服务费设置需要输入当前账号名和 PIN。", "Changing tax or service settings requires the current username and PIN."));
      return;
    }
    setSaving(true); setFeedback("");
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify({ ...settings, confirm_name: confirmName.trim(), confirm_pin: confirmPin }) });
      originalProtectedSettings.current = { tax: Number(settings.tax_rate), service: Number(settings.service_charge_rate), pricesIncludeTax: Boolean(settings.prices_include_tax), showTaxOnReceipt: Boolean(settings.show_tax_on_receipt) };
      setConfirmName(""); setConfirmPin("");
      await onSaved();
      setFeedback(t(locale, "设置已保存。", "Settings saved."));
    } catch (error) { setFeedback(error.message); }
    finally { setSaving(false); }
  }

  async function printTest() { await api("/print-jobs/test", { method: "POST" }); await onSaved(); }

  return (
    <div className="settings-top">
      <form className="settings-form" onSubmit={save}>
        <div className="settings-section settings-section-basic">
          <div className="settings-section-title"><Settings size={17} /><div><h3>{t(locale, "基本设置", "General")}</h3></div></div>
          <div className="settings-fields">
            <label>{t(locale, "语言 / Locale", "Language / Locale")}<select value={settings.locale} onChange={(e) => setSettings({ ...settings, locale: e.target.value })}>
              <option value="zh-CN">中文（简体）</option><option value="en-GB">English (UK)</option>
            </select></label>
            <label>{t(locale, "结算币种", "Currency")}<input value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} /></label>
          </div>
        </div>
        <div className="settings-section settings-section-tax">
          <div className="settings-section-title"><CircleDollarSign size={17} /><div><h3>{t(locale, "税务与费用", "Tax & fees")}</h3></div></div>
          <div className="settings-fields">
            <label>{t(locale, "VAT 税率", "VAT rate")}<input type="number" step="0.001" value={settings.tax_rate} onChange={(e) => setSettings({ ...settings, tax_rate: Number(e.target.value) })} /></label>
            <label>{t(locale, "服务费率", "Service charge rate")}<input type="number" step="0.001" value={settings.service_charge_rate} onChange={(e) => setSettings({ ...settings, service_charge_rate: Number(e.target.value) })} /></label>
          </div>
          <div className="settings-checkboxes">
            <label className="checkbox"><input type="checkbox" checked={settings.prices_include_tax} onChange={(e) => setSettings({ ...settings, prices_include_tax: e.target.checked })} /><b>{t(locale, "VAT 包含在标价中（默认 20%）", "Prices include VAT (default 20%)")}</b></label>
            <label className="checkbox"><input type="checkbox" checked={settings.show_tax_on_receipt} onChange={(e) => setSettings({ ...settings, show_tax_on_receipt: e.target.checked })} />{t(locale, "小票显示 VAT 金额", "Show VAT amount on receipt")}</label>
          </div>
          {protectedSettingsChanged && (
            <div className="settings-reauth">
              <div><strong>{t(locale, "需要身份确认", "Re-authentication required")}</strong></div>
              <label>{t(locale, "账号名", "Username")}<input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="username" /></label>
              <label>PIN<input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} autoComplete="current-password" /></label>
            </div>
          )}
        </div>
        <div className="settings-section settings-section-tables">
          <div className="settings-section-title"><Armchair size={17} /><div><h3>{t(locale, "桌台行为", "Table behavior")}</h3></div></div>
          <div className="settings-checkboxes">
            <label className="checkbox"><input type="checkbox" checked={Boolean(settings.auto_clear_tables_after_payment)} onChange={(e) => setSettings({ ...settings, auto_clear_tables_after_payment: e.target.checked })} />{t(locale, "付款完成后自动清台", "Auto clear tables after payment")}</label>
            <label className="checkbox"><input type="checkbox" checked={Boolean(settings.auto_clear_empty_tables_after_idle)} onChange={(e) => setSettings({ ...settings, auto_clear_empty_tables_after_idle: e.target.checked })} />{t(locale, "开台后空台超过设定时间无操作自动清台", "Auto clear an empty table after it's idle for a set time")}</label>
          </div>
          {Boolean(settings.auto_clear_empty_tables_after_idle) && (
            <div className="settings-fields"><label>{t(locale, "空台等待分钟数", "Idle minutes before clearing")}<input type="number" min="1" step="1" value={settings.auto_clear_empty_tables_idle_minutes ?? 60} onChange={(e) => setSettings({ ...settings, auto_clear_empty_tables_idle_minutes: Number(e.target.value) })} /></label></div>
          )}
        </div>
        <div className="settings-section settings-section-receipt">
          <div className="settings-section-title"><ReceiptText size={17} /><div><h3>{t(locale, "小票内容", "Receipt content")}</h3></div></div>
          <div className="settings-fields">
            <label>{t(locale, "店铺名称（英文）", "Store name (English)")}<input value={settings.receipt_header || ""} onChange={(e) => setSettings({ ...settings, receipt_header: e.target.value })} /></label>
            <label>{t(locale, "店铺名称（中文）", "Store name (Chinese)")}<input value={settings.receipt_header_zh || ""} onChange={(e) => setSettings({ ...settings, receipt_header_zh: e.target.value })} /></label>
            <label>{t(locale, "联系电话", "Phone")}<input value={settings.receipt_phone || ""} onChange={(e) => setSettings({ ...settings, receipt_phone: e.target.value })} placeholder="07347 997926" /></label>
            <label>{t(locale, "店铺地址", "Address")}<input value={settings.receipt_address || ""} onChange={(e) => setSettings({ ...settings, receipt_address: e.target.value })} /></label>
            <label>{t(locale, "小票页脚", "Receipt footer")}<input value={settings.receipt_footer || ""} onChange={(e) => setSettings({ ...settings, receipt_footer: e.target.value })} /></label>
          </div>
        </div>
        <div className="settings-actions">
          <button className="primary" type="submit" disabled={saving}><Save size={16} /><span>{saving ? t(locale, "保存中…", "Saving…") : t(locale, "保存设置", "Save settings")}</span></button>
          <button type="button" onClick={printTest}><Printer size={16} /><span>{t(locale, "打印测试", "Print test")}</span></button>
          {feedback && <span className="settings-feedback">{feedback}</span>}
        </div>
      </form>
      <section className="panel receipt-preview">
        <div className="panel-title"><ReceiptText size={18} /><h2>{t(locale, "Receipt 预览", "Receipt preview")}</h2></div>
        <div className="receipt-paper">
          <strong>{settings.receipt_header || "Granny Noodles"}</strong>
          {settings.receipt_header_zh && <span style={{textAlign:"center",fontWeight:600}}>{settings.receipt_header_zh}</span>}
          {settings.receipt_phone && <span style={{textAlign:"center"}}>{t(locale, "Tel 电话:", "Tel:")} {settings.receipt_phone}</span>}
          {settings.receipt_address && <span style={{textAlign:"center"}}>{settings.receipt_address}</span>}
          <hr /><span>{t(locale, "订单", "Order")}: DEMO-001 · {t(locale, "桌台", "Table")}: A1</span><hr />
          <span style={{display:"grid",gridTemplateColumns:"1fr 30px 50px 50px",fontWeight:600}}><span>{t(locale, "菜品", "Item")}</span><span style={{textAlign:"right"}}>Qty</span><span style={{textAlign:"right"}}>Unit</span><span style={{textAlign:"right"}}>Amt</span></span>
          <span style={{display:"grid",gridTemplateColumns:"1fr 30px 50px 50px"}}><span>重庆小面<br /><small>Chongqing Noodles</small></span><span style={{textAlign:"right"}}>2</span><span style={{textAlign:"right"}}>{money(10, settings.currency, settings.locale)}</span><span style={{textAlign:"right"}}>{money(20, settings.currency, settings.locale)}</span></span>
          <hr /><span>小计 Subtotal <b>{money(20, settings.currency, settings.locale)}</b></span>
          {settings.show_tax_on_receipt && <span>VAT {settings.prices_include_tax ? `(含 incl. ${Math.round((settings.tax_rate||0)*100)}%)` : `(${Math.round((settings.tax_rate||0)*100)}%)`} <b>{money(20 * (settings.tax_rate||0) / (settings.prices_include_tax ? (1+(settings.tax_rate||0)) : 1), settings.currency, settings.locale)}</b></span>}
          {Number(settings.service_charge_rate) > 0 && <span>服务费 Service ({Math.round((settings.service_charge_rate||0)*100)}%) <b>{money(20 * (settings.service_charge_rate||0), settings.currency, settings.locale)}</b></span>}
          <strong>合计 TOTAL {money(20 + 20 * (settings.service_charge_rate||0) + (settings.prices_include_tax ? 0 : 20 * (settings.tax_rate||0)), settings.currency, settings.locale)}</strong>
          <small>{settings.receipt_footer || "Thank you / 感谢光临"}</small>
        </div>
      </section>
    </div>
  );
}
