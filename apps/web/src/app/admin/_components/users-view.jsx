"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle, Eye, EyeOff, Key, Plus, Save, Shield, Trash2, UserPlus, Users
} from "lucide-react";
import { api } from "../../../lib/api";

const ROLE_STYLES = {
  owner: { bg: "var(--lavender)", color: "var(--accent)", border: "var(--lavender-border)", label: "Owner" },
  cashier: { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe", label: "Cashier" },
  kitchen: { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0", label: "Kitchen" },
};

export function RoleBadge({ role }) {
  const style = ROLE_STYLES[role] || ROLE_STYLES.cashier;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: style.bg, color: style.color, border: `1px solid ${style.border}`,
      whiteSpace: "nowrap",
    }}>
      <Shield size={11} />{style.label || role}
    </span>
  );
}

export default function UsersView({ usersList, rolesList, onSaved }) {
  const [editingId, setEditingId] = useState(null);
  const [resettingPinFor, setResettingPinFor] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showPin, setShowPin] = useState(false);
  const [form, setForm] = useState({ name: "", pin: "", pinConfirm: "", role_id: "", active: true });
  const [localUsers, setLocalUsers] = useState([]);
  const [localRoles, setLocalRoles] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const users = usersList.length ? usersList : localUsers;
  const roles = rolesList.length ? rolesList : localRoles;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [u, r] = await Promise.all([api("/users"), api("/roles")]);
        if (!cancelled) { setLocalUsers(u); setLocalRoles(r); setLoadError(""); }
      } catch (e) {
        if (!cancelled) setLoadError(e.message || "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const roleLabel = (roleId) => roles.find((r) => r.id === roleId)?.name ?? "";

  function openNew() {
    setForm({ name: "", pin: "", pinConfirm: "", role_id: roles[0]?.id ?? "", active: true });
    setShowPin(false);
    setEditingId("new");
    setResettingPinFor(null);
    setDeletingId(null);
    setLoadError("");
  }
  function openEdit(user) {
    setForm({ name: user.name, pin: "", pinConfirm: "", role_id: user.role_id, active: user.active });
    setShowPin(false);
    setEditingId(user.id);
    setResettingPinFor(null);
    setDeletingId(null);
  }
  function startResetPin(user) {
    setForm({ ...form, pin: "", pinConfirm: "" });
    setShowPin(false);
    setResettingPinFor(user.id);
    setEditingId(null);
    setDeletingId(null);
  }
  function cancel() {
    setEditingId(null);
    setResettingPinFor(null);
    setDeletingId(null);
    setShowPin(false);
  }

  async function save(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.role_id) { setLoadError("请填写姓名并选择角色"); return; }
    if (editingId === "new" && !form.pin.trim()) { setLoadError("请设置 PIN"); return; }
    if (form.pin && form.pin !== form.pinConfirm) { setLoadError("两次输入的 PIN 不一致"); return; }
    try {
      const payload = { name: form.name.trim(), role_id: form.role_id, active: form.active };
      if (form.pin) payload.pin = form.pin.trim();
      if (editingId === "new") {
        await api("/users", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await api(`/users/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      setLoadError("");
      cancel();
      await onSaved();
    } catch (error) { setLoadError(error.message || "保存账户失败"); }
  }

  async function saveResetPin(event) {
    event.preventDefault();
    if (!form.pin.trim()) { setLoadError("请输入新 PIN"); return; }
    if (form.pin !== form.pinConfirm) { setLoadError("两次输入的 PIN 不一致"); return; }
    try {
      await api(`/users/${resettingPinFor}`, { method: "PATCH", body: JSON.stringify({ pin: form.pin.trim() }) });
      setLoadError("");
      cancel();
      await onSaved();
    } catch (error) { setLoadError(error.message || "重置 PIN 失败"); }
  }

  async function remove(user) {
    await api(`/users/${user.id}`, { method: "DELETE" });
    setDeletingId(null);
    setEditingId(null);
    await onSaved();
  }

  function PinFields({ required, submitLabel, onSubmit }) {
    return (
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ minWidth: 130 }}>
          PIN{required ? " *" : ""}
          <div style={{ display: "flex", gap: 4 }}>
            <input type={showPin ? "text" : "password"} inputMode="numeric" value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value })}
              placeholder={required ? "设置数字 PIN" : "留空则不修改"} autoFocus style={{ width: 130 }} />
            <button type="button" onClick={() => setShowPin(!showPin)} style={{ padding: "4px 6px", fontSize: 12, lineHeight: 1 }} title={showPin ? "隐藏" : "显示"}>
              {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </label>
        {(form.pin || required) && (
          <label style={{ minWidth: 130 }}>
            确认 PIN
            <input type="password" inputMode="numeric" value={form.pinConfirm} onChange={(e) => setForm({ ...form, pinConfirm: e.target.value })} placeholder="再次输入" style={{ width: 130 }} />
          </label>
        )}
        <button className="primary" type="submit"><Save size={14} /><span>{submitLabel}</span></button>
        <button type="button" onClick={cancel}>取消</button>
      </form>
    );
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-title split">
        <div className="inline-title"><Users size={18} /><h2>账户管理</h2></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{users.length} 个账户</span>
          <button type="button" onClick={openNew}><Plus size={16} /><span>新建账户</span></button>
        </div>
      </div>

      {loadError && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 12, background: "#fef2f2", color: "#dc2626", borderRadius: 8, fontSize: 13, border: "1px solid #fecaca" }}>
          <AlertCircle size={16} />{loadError}
        </div>
      )}

      {loading && users.length === 0 && (<div className="empty" style={{ padding: 40 }}>加载中...</div>)}

      {editingId === "new" && (
        <div style={{ marginBottom: 14, padding: 14, border: "1.5px solid var(--accent)", borderRadius: 10, background: "var(--lavender)" }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 14, color: "var(--accent-strong)", display: "flex", alignItems: "center", gap: 6 }}>
            <UserPlus size={16} />新建账户
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, alignItems: "end" }}>
            <label>姓名<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus placeholder="员工姓名" /></label>
            <label>角色<select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
            <label className="checkbox" style={{ alignSelf: "center", marginTop: 24 }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />启用账户
            </label>
          </div>
          <div style={{ marginTop: 12 }}><PinFields required submitLabel="创建账户" /></div>
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {users.map((u) => {
          const isEditing = editingId === u.id;
          const isResettingPin = resettingPinFor === u.id;
          const isDeleting = deletingId === u.id;
          const role = roleLabel(u.role_id);
          return (
            <div key={u.id} style={{ border: `1.5px solid ${isEditing ? "var(--accent)" : isResettingPin ? "#facc15" : "var(--line)"}`, borderRadius: 10, background: "white", opacity: u.active ? 1 : 0.55, overflow: "hidden", transition: "border-color 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: isEditing || isResettingPin ? "default" : "pointer" }}
                onClick={() => { if (!isEditing && !isResettingPin && !isDeleting) openEdit(u); }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: u.active ? (ROLE_STYLES[role]?.bg || "#f3f4f6") : "#f3f4f6", color: u.active ? (ROLE_STYLES[role]?.color || "var(--muted)") : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <strong style={{ color: "var(--ink)", fontSize: 14 }}>{u.name}</strong>
                    {role && <RoleBadge role={role} />}
                    {!u.active && <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 500 }}>已禁用</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => startResetPin(u)} style={{ padding: "6px", fontSize: 12, borderRadius: 6, background: "transparent" }} title="重置 PIN"><Key size={14} /></button>
                  {!isDeleting && <button type="button" onClick={() => setDeletingId(u.id)} style={{ padding: "6px", fontSize: 12, borderRadius: 6, background: "transparent", color: "#ef4444" }} title="删除账户"><Trash2 size={14} /></button>}
                </div>
              </div>
              {isDeleting && (
                <div style={{ padding: "10px 14px", background: "#fef2f2", borderTop: "1px solid #fecaca", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#991b1b", flex: 1 }}>确定删除 <strong>{u.name}</strong>？此操作不可撤销。</span>
                  <button type="button" onClick={() => remove(u)} style={{ fontSize: 12, background: "#ef4444", color: "white", border: "none", padding: "4px 12px", borderRadius: 6, fontWeight: 600 }}>确认删除</button>
                  <button type="button" onClick={() => setDeletingId(null)} style={{ fontSize: 12, padding: "4px 12px" }}>取消</button>
                </div>
              )}
              {isEditing && (
                <div style={{ padding: "12px 14px", background: "#fafafa", borderTop: "1px solid var(--line)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, alignItems: "end", marginBottom: 10 }}>
                    <label>姓名<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></label>
                    <label>角色<select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select></label>
                    <label className="checkbox" style={{ alignSelf: "center", marginTop: 24 }}>
                      <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />启用
                    </label>
                    <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                      <button className="primary" type="button" onClick={save}><Save size={14} /><span>保存</span></button>
                      <button type="button" onClick={cancel}>取消</button>
                    </div>
                  </div>
                  <PinFields required={false} submitLabel="修改 PIN" />
                </div>
              )}
              {isResettingPin && (
                <div style={{ padding: "12px 14px", background: "#fefce8", borderTop: "1px solid #fde68a" }}>
                  <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 13, color: "#92400e" }}>重置 {u.name} 的 PIN</p>
                  <PinFields required submitLabel="更新 PIN" />
                </div>
              )}
            </div>
          );
        })}
        {!loading && users.length === 0 && !loadError && (
          <div style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
            <Users size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ margin: 0, fontSize: 14 }}>暂无账户</p>
            <p style={{ margin: "4px 0 16px", fontSize: 12 }}>点击"新建账户"添加员工</p>
            <button type="button" onClick={openNew}><Plus size={16} /><span>新建账户</span></button>
          </div>
        )}
      </div>
    </div>
  );
}
