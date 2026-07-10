"use client";

import { useEffect, useState } from "react";
import { Activity, Download, HardDrive, Plus, Printer, RefreshCw, Save, Trash2 } from "lucide-react";
import { t, money } from "./helpers";
import { api, API_URL } from "../../../lib/api";

function OpsView({ health, backups, settings, setSettings, locale, onRefresh, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState(settings.printer_profiles || []);
  const [showAllBackups, setShowAllBackups] = useState(false);

  useEffect(() => setProfiles(settings.printer_profiles || []), [settings.printer_profiles]);

  async function run(action) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  async function saveOpsSettings(event) {
    event.preventDefault();
    const next = { ...settings, printer_profiles: profiles };
    setSettings(next);
    await api("/settings", { method: "PUT", body: JSON.stringify(next) });
    await onSaved();
  }

  function updateProfile(id, patch) {
    setProfiles((current) => current.map((profile) => {
      if (profile.id !== id) return profile;
      const next = { ...profile, ...patch };
      // Auto-fill defaults when switching transport so the profile is immediately valid.
      if (patch.connection_type === "usb" && !next.device_path) next.device_path = "/dev/usb/lp0";
      if (patch.connection_type === "bluetooth") {
        if (!next.device_path) next.device_path = "/dev/rfcomm0";
        if (!next.channel) next.channel = 1;
      }
      if (patch.connection_type === "network") {
        if (!next.host) next.host = "192.168.1.251";
        if (!next.port) next.port = 9100;
      }
      return next;
    }));
  }

  function addProfile(type = "network") {
    const id = `printer-${Date.now().toString().slice(-5)}`;
    const base = { id, charset: "GBK", enabled: true };
    let profile;
    if (type === "usb") {
      profile = { ...base, name: t(locale, "USB 打印机", "USB printer"), connection_type: "usb", device_path: "/dev/usb/lp0" };
    } else if (type === "bluetooth") {
      profile = { ...base, name: t(locale, "蓝牙打印机", "Bluetooth printer"), connection_type: "bluetooth", device_path: "/dev/rfcomm0", mac: "", channel: 1 };
    } else {
      profile = { ...base, name: t(locale, "网络打印机", "Network printer"), connection_type: "network", host: "192.168.1.251", port: 9100 };
    }
    setProfiles((current) => [...current, profile]);
  }

  function removeProfile(id) {
    setProfiles((current) => current.filter((profile) => profile.id !== id));
  }

  function downloadUrl(name) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("qypos_token") : "";
    const grant = typeof window !== "undefined" ? window.sessionStorage.getItem("qypos_admin_grant") : "";
    return `${API_URL}/ops/backups/${encodeURIComponent(name)}?token=${token}&admin_grant=${grant}`;
  }

  return (
    <div className="ops-page">
      <section className="ops-grid">
        <article className="panel ops-card">
          <div className="panel-title"><Activity size={18} /><h2>{t(locale, "健康检查", "Health checks")}</h2></div>
          <div className={`health-status ${health?.ok ? "ok" : "bad"}`}>
            {health?.ok ? t(locale, "系统正常", "All systems healthy") : t(locale, "需要检查", "Needs attention")}
            <small>{health ? `${health.latency_ms}ms · uptime ${health.uptime_seconds}s` : t(locale, "加载中", "Loading")}</small>
          </div>
          <div className="health-checks">
            {(health?.checks || []).map((check) => (
              <div className={`health-check ${check.ok ? "ok" : "bad"}`} key={check.name}>
                <span>{check.name}</span>
                <b>{check.ok ? "OK" : "FAIL"}</b>
                <small>{check.error || `${check.latency_ms}ms`}</small>
              </div>
            ))}
          </div>
          <button type="button" onClick={onRefresh}><RefreshCw size={16} /><span>{t(locale, "刷新运维状态", "Refresh ops status")}</span></button>
        </article>

        <article className="panel ops-card">
          <div className="panel-title"><HardDrive size={18} /><h2>{t(locale, "数据库备份", "Database backups")}</h2></div>
          <form className="ops-form" onSubmit={saveOpsSettings}>
            <label className="checkbox"><input type="checkbox" checked={settings.backup_enabled} onChange={(event) => setSettings({ ...settings, backup_enabled: event.target.checked })} />{t(locale, "启用自动备份", "Enable automatic backups")}</label>
            <label>{t(locale, "备份间隔（小时）", "Backup interval (hours)")}<input type="number" min="1" max="168" value={settings.backup_interval_hours || 24} onChange={(event) => setSettings({ ...settings, backup_interval_hours: Number(event.target.value) })} /></label>
            <div className="ops-actions">
              <button className="primary" type="submit"><Save size={16} /><span>{t(locale, "保存计划", "Save schedule")}</span></button>
              <button type="button" disabled={busy} onClick={() => run(async () => { await api("/ops/backups", { method: "POST" }); await onRefresh(); })}>
                <HardDrive size={16} /><span>{busy ? t(locale, "备份中", "Backing up") : t(locale, "立即备份", "Back up now")}</span>
              </button>
            </div>
          </form>
          <div className="backup-list" style={{ maxHeight: showAllBackups ? "none" : 280, overflowY: "auto" }}>
            {(showAllBackups ? backups : backups.slice(0, 5)).map((file) => (
              <div className="backup-row" key={file.name}>
                <span>{file.name}</span>
                <small>{(Number(file.size) / 1024).toFixed(1)} KB · {new Date(file.updated_at).toLocaleString(locale)}</small>
                <a className="link-button" href={downloadUrl(file.name)}><Download size={15} /><span>{t(locale, "下载", "Download")}</span></a>
              </div>
            ))}
            {!backups.length && <div className="empty">{t(locale, "暂无备份文件", "No backup files")}</div>}
            {backups.length > 5 && (
              <button type="button" className="link-button" style={{ justifySelf: "center" }}
                onClick={() => setShowAllBackups((v) => !v)}>
                {showAllBackups ? t(locale, "收起 (仅显示最近 5 个)", "Collapse (latest 5 only)") : t(locale, `显示全部 ${backups.length} 个备份`, `Show all ${backups.length} backups`)}
              </button>
            )}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-title split">
          <div className="inline-title"><Printer size={18} /><h2>{t(locale, "多打印机配置", "Multi-printer configuration")}</h2></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => addProfile("network")}><Plus size={16} /><span>{t(locale, "添加网络打印机", "Add network printer")}</span></button>
            <button type="button" onClick={() => addProfile("usb")}><Plus size={16} /><span>{t(locale, "添加 USB 打印机", "Add USB printer")}</span></button>
            <button type="button" onClick={() => addProfile("bluetooth")}><Plus size={16} /><span>{t(locale, "添加蓝牙打印机", "Add Bluetooth printer")}</span></button>
          </div>
        </div>
        <form className="printer-config" onSubmit={saveOpsSettings}>
          <div className="printer-route-row">
            <label>{t(locale, "厨房单打印机", "Kitchen ticket printer")}
              <select value={settings.kitchen_printer_id || ""} onChange={(event) => setSettings({ ...settings, kitchen_printer_id: event.target.value })}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
            <label>{t(locale, "账单打印机", "Receipt printer")}
              <select value={settings.receipt_printer_id || ""} onChange={(event) => setSettings({ ...settings, receipt_printer_id: event.target.value })}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
            <label>{t(locale, "厨房菜品字号", "Kitchen item font size")}
              <input type="number" min="1" max="8" value={settings.kitchen_item_font_size ?? 5} onChange={(event) => setSettings({ ...settings, kitchen_item_font_size: Number(event.target.value) })} />
            </label>
            <label className="checkbox"><input type="checkbox" checked={settings.kitchen_qty_bold !== false} onChange={(event) => setSettings({ ...settings, kitchen_qty_bold: event.target.checked })} />{t(locale, "数量加粗 (1X)", "Bold quantity (1X)")}</label>
            <label className="checkbox"><input type="checkbox" checked={settings.kitchen_item_bold !== false} onChange={(event) => setSettings({ ...settings, kitchen_item_bold: event.target.checked })} />{t(locale, "菜品名加粗", "Bold item name")}</label>
            <button className="primary" type="submit"><Save size={16} /><span>{t(locale, "保存打印配置", "Save printer settings")}</span></button>
            <button type="button" onClick={() => run(async () => { await api("/print-jobs/cash-drawer", { method: "POST" }); alert(t(locale, "钱箱信号已发送", "Cash drawer signal sent")); })}><span>💵 {t(locale, "弹出钱箱", "Open cash drawer")}</span></button>
          </div>
          <div className="printer-profile-list">
            {profiles.map((profile) => (
              <div className="printer-profile-row" key={profile.id}>
                <label>{t(locale, "名称", "Name")}<input value={profile.name} onChange={(event) => updateProfile(profile.id, { name: event.target.value })} /></label>
                <label>{t(locale, "连接方式", "Connection")}<select value={profile.connection_type || "network"} onChange={(event) => updateProfile(profile.id, { connection_type: event.target.value })}>
                  <option value="network">{t(locale, "网络 (TCP/IP)", "Network (TCP/IP)")}</option>
                  <option value="usb">USB</option>
                  <option value="bluetooth">{t(locale, "蓝牙 (rfcomm)", "Bluetooth (rfcomm)")}</option>
                </select></label>
                <label>{t(locale, "字符集", "Charset")}<select value={profile.charset || "GBK"} onChange={(event) => updateProfile(profile.id, { charset: event.target.value })}>
                  <option value="GBK">GBK（常用）</option>
                  <option value="GB18030">GB18030（延伸GBK）</option>
                  <option value="UTF-8">UTF-8（新型打印机）</option>
                </select></label>
                {(profile.connection_type === "usb") && (
                  <label>{t(locale, "设备路径", "Device path")}<input value={profile.device_path || "/dev/usb/lp0"} onChange={(event) => updateProfile(profile.id, { device_path: event.target.value })} /></label>
                )}
                {(profile.connection_type === "bluetooth") && (
                  <>
                    <label>{t(locale, "蓝牙 MAC", "Bluetooth MAC")}<input placeholder="00:11:22:33:44:55" value={profile.mac || ""} onChange={(event) => updateProfile(profile.id, { mac: event.target.value })} /></label>
                    <label>{t(locale, "RFCOMM 通道", "RFCOMM channel")}<input type="number" min="1" max="30" value={profile.channel || 1} onChange={(event) => updateProfile(profile.id, { channel: Number(event.target.value) })} /></label>
                    <label>{t(locale, "设备路径", "Device path")}<input value={profile.device_path || "/dev/rfcomm0"} onChange={(event) => updateProfile(profile.id, { device_path: event.target.value })} /></label>
                  </>
                )}
                {(!profile.connection_type || profile.connection_type === "network") && (
                  <>
                    <label>{t(locale, "IP 地址", "IP address")}<input value={profile.host || ""} onChange={(event) => updateProfile(profile.id, { host: event.target.value })} /></label>
                    <label>{t(locale, "端口", "Port")}<input type="number" min="1" max="65535" value={profile.port || 9100} onChange={(event) => updateProfile(profile.id, { port: Number(event.target.value) })} /></label>
                  </>
                )}
                <label className="checkbox"><input type="checkbox" checked={profile.enabled !== false} onChange={(event) => updateProfile(profile.id, { enabled: event.target.checked })} />{t(locale, "启用", "Enabled")}</label>
                <button type="button" onClick={() => run(async () => { await api("/print-jobs/test", { method: "POST", body: JSON.stringify({ printer_id: profile.id }) }); await onRefresh(); })}>{t(locale, "测试", "Test")}</button>
                <button type="button" onClick={() => removeProfile(profile.id)}><Trash2 size={15} /></button>
                {profile.connection_type === "bluetooth" && (
                  <pre className="bt-guide" style={{ gridColumn: "1 / -1", margin: "4px 0 0", padding: "8px 10px", background: "#f1f5f9", borderRadius: 6, fontSize: 12, lineHeight: 1.5, color: "#334155", whiteSpace: "pre-wrap" }}>
{`${t(locale, "# 在 Linux 服务器（宿主机，不是容器）一次性配对 + 绑定：", "# On the Linux host (not the container), pair and bind once:")}
sudo bluetoothctl
  scan on            # ${t(locale, "看到", "Find")} ${profile.name || t(locale, "打印机", "printer")}（${profile.mac || "MAC"}）${t(locale, "后 scan off", "then scan off")}
  pair ${profile.mac || "<MAC>"}        # ${t(locale, "输入 PIN（Rongta 多为 0000）", "Enter PIN (Rongta is usually 0000)")}
  trust ${profile.mac || "<MAC>"}
  exit
sudo rfcomm bind ${profile.device_path || "/dev/rfcomm0"} ${profile.mac || "<MAC>"} ${profile.channel || 1}
ls -l ${profile.device_path || "/dev/rfcomm0"}   # ${t(locale, "出现 crw-rw---- 即成功", "crw-rw---- means success")}
echo HELLO > ${profile.device_path || "/dev/rfcomm0"}   # ${t(locale, "打印机出纸即可用", "Print a test page to verify it")}`}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}

