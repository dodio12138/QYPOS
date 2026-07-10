"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Copy, Download, Eye, EyeOff, FileDown, Image, List, Loader2, Lock, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { t, money } from "./helpers";
import { api, labelOf } from "../../../lib/api";

export function MenuAvailabilityAdmin({ menu, locale, currency, onSaved, onNotify }) {
  const [selectedCatId, setSelectedCatId] = useState("all");
  const [busyItemId, setBusyItemId] = useState(null);
  const items = selectedCatId === "all"
    ? menu.items
    : menu.items.filter((item) => item.category_id === selectedCatId);

  async function toggleItem(item) {
    setBusyItemId(item.id);
    try {
      await api(`/menu/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active })
      });
      await onSaved();
      onNotify(item.active ? t(locale, "菜品已下架", "Item deactivated") : t(locale, "菜品已上架", "Item activated"));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title split">
          <div className="inline-title"><ReceiptText size={18} /><h2>{t(locale, "菜品上下架", "Item availability")}</h2></div>
        </div>
      <div className="order-filter-bar" style={{ marginBottom: 12 }}>
        <button className={selectedCatId === "all" ? "selected" : ""} onClick={() => setSelectedCatId("all")}>{t(locale, "全部", "All")}</button>
        {menu.categories.map((category) => (
          <button
            key={category.id}
            className={selectedCatId === category.id ? "selected" : ""}
            onClick={() => setSelectedCatId(category.id)}
          >
            {labelOf(category.name_i18n, locale)}
          </button>
        ))}
      </div>
      <div className="menu-item-list">
        {items.map((item) => (
          <div key={item.id} className={`menu-item-row${item.active ? "" : " inactive"}`}>
            <div className="menu-item-row-head" style={{ cursor: "default" }}>
              <span className="item-name">{labelOf(item.name_i18n, locale)}</span>
              <span className={`item-badge${item.active ? " badge-active" : " badge-inactive"}`}>
                {item.active ? t(locale, "上架", "Active") : t(locale, "下架", "Inactive")}
              </span>
              <span className="muted">{labelOf(menu.categories.find((category) => category.id === item.category_id)?.name_i18n, locale) || "未分类"}</span>
              <button
                type="button"
                className="action-toggle"
                disabled={busyItemId === item.id}
                onClick={() => toggleItem(item)}
              >
                <Power size={16} />
                <span>{busyItemId === item.id ? t(locale, "处理中…", "Working…") : item.active ? t(locale, "下架", "Deactivate") : t(locale, "上架", "Activate")}</span>
              </button>
            </div>
          </div>
        ))}
        {!items.length && <div className="empty">{t(locale, "暂无菜品", "No items")}</div>}
      </div>
    </div>
  );
}

export default function MenuAdmin({ menu, locale, currency, onSaved, onNotify }) {
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [categoryZh, setCategoryZh] = useState("");
  const [categoryEn, setCategoryEn] = useState("");
  const [newItem, setNewItem] = useState({ nameZh: "", nameEn: "", price: "0", categoryId: "", variantPresetId: "" });

  const firstCatId = menu.categories[0]?.id;
  const filteredItems = selectedCatId ? menu.items.filter((item) => item.category_id === selectedCatId) : menu.items;
  const selectedCat = selectedCatId ? menu.categories.find((c) => c.id === selectedCatId) : null;

  async function deleteCategory(cat, itemCount) {
    const suffix = itemCount > 0 ? `\n该分类下 ${itemCount} 个菜品将变为"未分类"。` : "";
    if (!window.confirm(`永久删除分类"${labelOf(cat.name_i18n, locale)}"？${suffix}`)) return;
    try {
      await api(`/menu/categories/${cat.id}/destroy`, { method: "DELETE" });
      if (selectedCatId === cat.id) setSelectedCatId(null);
      await onSaved();
    } catch (err) {
      alert(err.message);
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    await api("/menu/categories", {
      method: "POST",
      body: JSON.stringify({
        name_i18n: { "zh-CN": categoryZh, "en-GB": categoryEn || categoryZh },
        sort_order: menu.categories.length
      })
    });
    setCategoryZh("");
    setCategoryEn("");
    setShowCatForm(false);
    await onSaved();
  }

  async function saveItem(event) {
    event.preventDefault();
    const item = await api("/menu/items", {
      method: "POST",
      body: JSON.stringify({
        category_id: newItem.categoryId || selectedCatId || firstCatId,
        name_i18n: { "zh-CN": newItem.nameZh, "en-GB": newItem.nameEn || newItem.nameZh },
        variants: newItem.variantPresetId ? [] : [{ name_i18n: { "zh-CN": "标准", "en-GB": "Standard" }, price: Number(newItem.price) }]
      })
    });
    for (const presetId of [newItem.variantPresetId].filter(Boolean)) {
      await api(`/menu/items/${item.id}/apply-option-preset`, {
        method: "POST",
        body: JSON.stringify({ preset_id: presetId, replace: true })
      });
    }
    setNewItem({ nameZh: "", nameEn: "", price: "0", categoryId: "", variantPresetId: "" });
    setShowItemForm(false);
    await onSaved();
  }

  return (
    <div className="menu-admin-stack">
      <OptionPresetsAdmin presets={menu.option_presets ?? []} locale={locale} onSaved={onSaved} onNotify={onNotify} />
      <div className="menu-split">
      <aside className="menu-sidebar">
          <div className="menu-sidebar-head">
            <span>{t(locale, "分类管理", "Categories")}</span>
            <button type="button" title={t(locale, "新建分类", "New category")} onClick={() => setShowCatForm((v) => !v)}>
            <Plus size={14} />
          </button>
        </div>
        {showCatForm && (
          <form className="menu-cat-form" onSubmit={saveCategory}>
            <input placeholder={t(locale, "中文名", "Chinese name")} value={categoryZh} onChange={(e) => setCategoryZh(e.target.value)} required />
            <input placeholder="English" value={categoryEn} onChange={(e) => setCategoryEn(e.target.value)} />
            <div className="menu-cat-form-actions">
              <button className="primary" type="submit">{t(locale, "保存", "Save")}</button>
              <button type="button" onClick={() => setShowCatForm(false)}>{t(locale, "取消", "Cancel")}</button>
            </div>
          </form>
        )}
        <button
          type="button"
          className={`menu-sidebar-item${selectedCatId === null ? " active" : ""}`}
          onClick={() => setSelectedCatId(null)}
        >
          <span>{t(locale, "全部", "All")}</span>
          <span className="cat-count">{menu.items.length}</span>
        </button>
        {menu.categories.map((cat) => {
          const count = menu.items.filter((item) => item.category_id === cat.id).length;
          return (
            <div
              key={cat.id}
              className={`menu-sidebar-item${selectedCatId === cat.id ? " active" : ""}${!cat.active ? " cat-inactive" : ""}`}
            >
              <button
                type="button"
                className="cat-select-btn"
                onClick={() => setSelectedCatId(cat.id)}
              >
                <span>{labelOf(cat.name_i18n, locale)}</span>
                <span className="cat-count">{count}</span>
              </button>
              <button
                type="button"
                className="cat-delete-btn"
                title={t(locale, "删除分类", "Delete category")}
                onClick={() => deleteCategory(cat, count)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
        {selectedCat && (
          <CategoryEditor key={selectedCat.id} category={selectedCat} locale={locale} onSaved={onSaved} />
        )}
        <NotePresetsAdmin presets={menu.note_presets ?? []} locale={locale} onSaved={onSaved} />
      </aside>

      <div className="menu-items-pane">
        <div className="menu-toolbar">
          <h2>
            {selectedCat ? labelOf(selectedCat.name_i18n, locale) : t(locale, "全部菜品", "All items")}
            <span className="muted"> ({filteredItems.length})</span>
          </h2>
          <button type="button" onClick={() => setShowItemForm((v) => !v)}>
            <Plus size={16} /><span>{t(locale, "新建菜品", "New item")}</span>
          </button>
        </div>
        {showItemForm && (
          <form className="form-panel menu-new-item-form" onSubmit={saveItem}>
            <div className="inline-editor">
              <label>{t(locale, "分类", "Category")}
                <select
                  value={newItem.categoryId || selectedCatId || firstCatId || ""}
                  onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value })}
                >
                  {menu.categories.map((c) => <option key={c.id} value={c.id}>{labelOf(c.name_i18n, locale)}</option>)}
                </select>
              </label>
              <label>{t(locale, "中文名", "Chinese name")}<input value={newItem.nameZh} onChange={(e) => setNewItem({ ...newItem, nameZh: e.target.value })} required /></label>
              <label>English<input value={newItem.nameEn} onChange={(e) => setNewItem({ ...newItem, nameEn: e.target.value })} /></label>
              {!newItem.variantPresetId && <label>{t(locale, "标准价格", "Base price")}<input type="number" step="0.01" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} /></label>}
              <label>{t(locale, "规格预设", "Option preset")}<select value={newItem.variantPresetId} onChange={(e) => setNewItem({ ...newItem, variantPresetId: e.target.value })}>
                <option value="">{t(locale, "不使用", "None")}</option>
                {(menu.option_presets ?? []).filter((preset) => preset.kind === "variants" && preset.active !== false).map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}
              </select></label>
              <button className="primary" type="submit"><Plus size={16} /><span>{t(locale, "保存", "Save")}</span></button>
              <button type="button" onClick={() => setShowItemForm(false)}>{t(locale, "取消", "Cancel")}</button>
            </div>
          </form>
        )}
        <div className="menu-item-list">
          {filteredItems.map((item) => (
            <MenuItemRow
              key={item.id}
              item={item}
              categories={menu.categories}
              optionPresets={menu.option_presets ?? []}
              locale={locale}
              currency={currency}
              expanded={expandedItemId === item.id}
              onToggle={() => setExpandedItemId((id) => id === item.id ? null : item.id)}
              onSaved={onSaved}
              onNotify={onNotify}
            />
          ))}
          {!filteredItems.length && <div className="empty">{t(locale, "暂无菜品", "No items")}</div>}
        </div>
      </div>
      </div>
    </div>
  );
}

function MenuItemRow({ item, categories, optionPresets, locale, currency, expanded, onToggle, onSaved, onNotify }) {
  const activeVariants = item.variants.filter((v) => v.active !== false);
  const priceSource = activeVariants.length ? activeVariants : item.variants;
  const prices = priceSource.map((v) => Number(v.price));
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 0;
  const priceLabel = !prices.length ? "-" : priceMin === priceMax
    ? money(priceMin, currency, locale)
    : `${money(priceMin, currency, locale)} – ${money(priceMax, currency, locale)}`;

  const [itemAction, setItemAction] = useState("");

  async function toggleItem() {
    setItemAction("toggle");
    try {
      await api(`/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) });
      await onSaved();
      onNotify(item.active ? t(locale, "产品已停用", "Item disabled") : t(locale, "产品已启用", "Item enabled"));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setItemAction("");
    }
  }

  async function destroyItem() {
    if (!window.confirm(t(locale, `永久删除"${labelOf(item.name_i18n, locale)}"？此操作无法恢复，历史订单记录将保留但不再关联该菜品。`, `Delete "${labelOf(item.name_i18n, locale)}" permanently? This cannot be undone. Historical orders will remain, but the item will no longer be linked.`))) return;
    setItemAction("destroy");
    try {
      await api(`/menu/items/${item.id}/destroy`, { method: "DELETE" });
      await onSaved();
      onNotify(t(locale, "产品已永久删除", "Item deleted permanently"));
    } catch (err) {
      onNotify(err.message);
    } finally {
      setItemAction("");
    }
  }

  async function copyItem() {
    setItemAction("copy");
    try {
      await api(`/menu/items/${item.id}/copy`, { method: "POST" });
      await onSaved();
      onNotify(t(locale, "菜品已复制", "Item duplicated"));
    } catch (err) {
      onNotify(err.message);
    } finally {
      setItemAction("");
    }
  }

  return (
    <div className={`menu-item-row${expanded ? " expanded" : ""}${!item.active ? " inactive" : ""}`}>
      <div className="menu-item-row-head" onClick={onToggle}>
        <ChevronRight size={15} className={`expand-icon${expanded ? " rotated" : ""}`} />
        <span className="item-name">{labelOf(item.name_i18n, locale)}</span>
        <span className={`item-badge${item.active ? " badge-active" : " badge-inactive"}`}>
          {item.active ? t(locale, "上架", "Active") : t(locale, "下架", "Inactive")}
        </span>
        <span className="item-price muted">{priceLabel}</span>
        <span className="muted item-spec-count">{item.variants.length} {t(locale, "规格", "options")}</span>
      </div>
      {expanded && (
        <div className="menu-item-row-body">
          <MenuItemEditor
            item={item}
            categories={categories}
            optionPresets={optionPresets}
            locale={locale}
            currency={currency}
            onSaved={onSaved}
            onNotify={onNotify}
            onToggleActive={toggleItem}
            onDestroy={destroyItem}
            onCopy={copyItem}
            itemAction={itemAction}
          />
        </div>
      )}
    </div>
  );
}

function OptionPresetsAdmin({ presets, locale, onSaved, onNotify }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("variants");
  const [expandedId, setExpandedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createPreset(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const preset = await api("/menu/option-presets", {
        method: "POST",
        body: JSON.stringify({ name, kind, payload: [] })
      });
      setName("");
      setShowCreate(false);
      setExpandedId(preset.id);
      await onSaved();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="option-presets-panel">
      <div className="option-presets-head">
        <div>
          <h2>{t(locale, "规格与加料预设库", "Options & extras presets")}</h2>
          <p>{t(locale, "产品绑定预设后会自动同步；直接修改产品配置时，该类型的绑定会自动断开。", "Linked products sync automatically. Editing an item directly will detach that preset type.")}</p>
        </div>
        <button type="button" onClick={() => setShowCreate((value) => !value)}><Plus size={15} /><span>{t(locale, "新建预设", "New preset")}</span></button>
      </div>
      {showCreate && (
        <form className="option-preset-create" onSubmit={createPreset}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t(locale, "预设名称，例如：面条大小规格", "Preset name, e.g. noodle size options")} required />
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="variants">{t(locale, "产品规格", "Item options")}</option>
            <option value="modifiers">{t(locale, "加料小项", "Extras")}</option>
          </select>
          <button className="primary" type="submit" disabled={busy}>{t(locale, "创建", "Create")}</button>
          <button type="button" onClick={() => setShowCreate(false)}>{t(locale, "取消", "Cancel")}</button>
        </form>
      )}
      {error && <div className="inline-error">{error}</div>}
      <div className="option-preset-list">
        {presets.map((preset) => (
          <OptionPresetCard
            key={preset.id}
            preset={preset}
            expanded={expandedId === preset.id}
            onToggle={() => setExpandedId((id) => id === preset.id ? null : preset.id)}
            onSaved={onSaved}
            onNotify={onNotify}
            locale={locale}
          />
        ))}
        {!presets.length && <div className="empty">{t(locale, "暂无规格或加料预设", "No option or extra presets")}</div>}
      </div>
    </section>
  );
}

function OptionPresetCard({ preset, expanded, onToggle, onSaved, onNotify, locale }) {
  const [name, setName] = useState(preset.name);
  const [payload, setPayload] = useState(() => structuredClone(preset.payload || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(preset.name);
    setPayload(structuredClone(preset.payload || []));
  }, [preset]);

  function updateRow(index, patch) {
    setPayload((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await api(`/menu/option-presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, payload })
      });
      await onSaved();
      onNotify(result.synced_items ? t(locale, `预设已保存，并同步到 ${result.synced_items} 个产品`, `Preset saved and synced to ${result.synced_items} items`) : t(locale, "预设已保存", "Preset saved"));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t(locale, `删除预设“${preset.name}”？绑定产品会保留当前配置，但不再继续同步。`, `Delete preset "${preset.name}"? Bound items will keep the current configuration but stop syncing.`))) return;
    await api(`/menu/option-presets/${preset.id}`, { method: "DELETE" });
    await onSaved();
    onNotify(t(locale, "预设已删除，相关产品已转为独立配置", "Preset deleted; linked items are now standalone"));
  }

  function addVariant() {
    setPayload((current) => [...current, {
      name_i18n: { "zh-CN": "新规格", "en-GB": "New option" },
      price: 0,
      sort_order: current.length,
      active: true
    }]);
  }

  function addGroup() {
    setPayload((current) => [...current, {
      name_i18n: { "zh-CN": "加料", "en-GB": "Extras" },
      min_select: 0,
      max_select: 5,
      sort_order: current.length,
      active: true,
      modifiers: []
    }]);
  }

  function addModifier(groupIndex) {
    setPayload((current) => current.map((group, index) => index === groupIndex ? {
      ...group,
      modifiers: [...(group.modifiers || []), {
        name_i18n: { "zh-CN": "新选项", "en-GB": "New extra" },
        price_delta: 0,
        sort_order: (group.modifiers || []).length,
        active: true,
        default_selected: false
      }]
    } : group));
  }

  function updateModifier(groupIndex, modifierIndex, patch) {
    setPayload((current) => current.map((group, index) => index === groupIndex ? {
      ...group,
      modifiers: group.modifiers.map((modifier, childIndex) => childIndex === modifierIndex ? { ...modifier, ...patch } : modifier)
    } : group));
  }

  function moveRow(index, direction) {
    setPayload((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((row, sortOrder) => ({ ...row, sort_order: sortOrder }));
    });
  }

  function moveModifier(groupIndex, modifierIndex, direction) {
    setPayload((current) => current.map((group, index) => {
      if (index !== groupIndex) return group;
      const modifiers = [...(group.modifiers || [])];
      const target = modifierIndex + direction;
      if (target < 0 || target >= modifiers.length) return group;
      [modifiers[modifierIndex], modifiers[target]] = [modifiers[target], modifiers[modifierIndex]];
      return { ...group, modifiers: modifiers.map((modifier, sortOrder) => ({ ...modifier, sort_order: sortOrder })) };
    }));
  }

  return (
    <article className={`option-preset-card${expanded ? " expanded" : ""}`}>
      <button type="button" className="option-preset-summary" onClick={onToggle}>
        <ChevronRight size={15} className={expanded ? "rotated" : ""} />
        <strong>{preset.name}</strong>
        <span>{preset.kind === "variants" ? t(locale, "产品规格", "Item options") : t(locale, "加料小项", "Extras")}</span>
        <em>{(preset.payload || []).length} {t(locale, "项", "items")}</em>
      </button>
      {expanded && (
        <div className="option-preset-body">
          <label>{t(locale, "预设名称", "Preset name")}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          {preset.kind === "variants" ? (
            <div className="option-preset-rows">
              {payload.map((variant, index) => (
                <div className="option-preset-row" key={index}>
                  <div className="option-row-order">
                    <button type="button" title={t(locale, "上移", "Move up")} disabled={index === 0} onClick={() => moveRow(index, -1)}><ChevronUp size={13} /></button>
                    <button type="button" title={t(locale, "下移", "Move down")} disabled={index === payload.length - 1} onClick={() => moveRow(index, 1)}><ChevronDown size={13} /></button>
                  </div>
                  <input value={labelOf(variant.name_i18n, "zh-CN")} onChange={(event) => updateRow(index, { name_i18n: { ...variant.name_i18n, "zh-CN": event.target.value } })} placeholder={t(locale, "中文规格", "Chinese option")} />
                  <input value={labelOf(variant.name_i18n, "en-GB")} onChange={(event) => updateRow(index, { name_i18n: { ...variant.name_i18n, "en-GB": event.target.value } })} placeholder="English" />
                  <input type="number" step="0.01" value={variant.price} onChange={(event) => updateRow(index, { price: Number(event.target.value) })} placeholder={t(locale, "价格", "Price")} />
                  <button type="button" onClick={() => setPayload((current) => current.filter((_row, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" className="option-preset-add" onClick={addVariant}><Plus size={14} />{t(locale, "添加规格", "Add option")}</button>
            </div>
          ) : (
            <div className="option-preset-rows">
              {payload.map((group, groupIndex) => (
                <div className="option-preset-group" key={groupIndex}>
                  <div className="option-preset-row group-row">
                    <div className="option-row-order">
                      <button type="button" title={t(locale, "上移", "Move up")} disabled={groupIndex === 0} onClick={() => moveRow(groupIndex, -1)}><ChevronUp size={13} /></button>
                      <button type="button" title={t(locale, "下移", "Move down")} disabled={groupIndex === payload.length - 1} onClick={() => moveRow(groupIndex, 1)}><ChevronDown size={13} /></button>
                    </div>
                    <input value={labelOf(group.name_i18n, "zh-CN")} onChange={(event) => updateRow(groupIndex, { name_i18n: { ...group.name_i18n, "zh-CN": event.target.value } })} placeholder={t(locale, "加料组", "Modifier group")} />
                    <input value={labelOf(group.name_i18n, "en-GB")} onChange={(event) => updateRow(groupIndex, { name_i18n: { ...group.name_i18n, "en-GB": event.target.value } })} placeholder="English" />
                    <label>{t(locale, "最少", "Min")}<input type="number" min="0" value={group.min_select} onChange={(event) => updateRow(groupIndex, { min_select: Number(event.target.value) })} /></label>
                    <label>{t(locale, "最多", "Max")}<input type="number" min="1" value={group.max_select} onChange={(event) => updateRow(groupIndex, { max_select: Number(event.target.value) })} /></label>
                    <label className="preset-required-toggle"><input type="checkbox" checked={Number(group.min_select) > 0} onChange={(event) => updateRow(groupIndex, { min_select: event.target.checked ? Math.max(1, Number(group.min_select || 0)) : 0 })} />{t(locale, "必选", "Required")}</label>
                    <button type="button" onClick={() => setPayload((current) => current.filter((_row, index) => index !== groupIndex))}><Trash2 size={14} /></button>
                  </div>
                  {(group.modifiers || []).map((modifier, modifierIndex) => (
                    <div className="option-preset-row child-row" key={modifierIndex}>
                      <div className="option-row-order">
                        <button type="button" title={t(locale, "上移", "Move up")} disabled={modifierIndex === 0} onClick={() => moveModifier(groupIndex, modifierIndex, -1)}><ChevronUp size={13} /></button>
                        <button type="button" title={t(locale, "下移", "Move down")} disabled={modifierIndex === group.modifiers.length - 1} onClick={() => moveModifier(groupIndex, modifierIndex, 1)}><ChevronDown size={13} /></button>
                      </div>
                      <input value={labelOf(modifier.name_i18n, "zh-CN")} onChange={(event) => updateModifier(groupIndex, modifierIndex, { name_i18n: { ...modifier.name_i18n, "zh-CN": event.target.value } })} placeholder={t(locale, "小料名称", "Modifier name")} />
                      <input value={labelOf(modifier.name_i18n, "en-GB")} onChange={(event) => updateModifier(groupIndex, modifierIndex, { name_i18n: { ...modifier.name_i18n, "en-GB": event.target.value } })} placeholder="English" />
                      <input type="number" step="0.01" value={modifier.price_delta} onChange={(event) => updateModifier(groupIndex, modifierIndex, { price_delta: Number(event.target.value) })} placeholder={t(locale, "加价", "Price delta")} />
                      <label className="preset-default-toggle"><input type="checkbox" checked={modifier.default_selected === true} onChange={(event) => {
                        const checked = event.target.checked;
                        if (checked && Number(group.max_select) === 1) {
                          updateRow(groupIndex, { modifiers: group.modifiers.map((entry, index) => ({ ...entry, default_selected: index === modifierIndex })) });
                        } else {
                          updateModifier(groupIndex, modifierIndex, { default_selected: checked });
                        }
                      }} />{t(locale, "默认", "Default")}</label>
                      <button type="button" onClick={() => updateRow(groupIndex, { modifiers: group.modifiers.filter((_modifier, index) => index !== modifierIndex) })}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button type="button" className="option-preset-add child-add" onClick={() => addModifier(groupIndex)}><Plus size={14} />{t(locale, "添加小料", "Add modifier")}</button>
                </div>
              ))}
              {!payload.length && <button type="button" className="option-preset-add" onClick={addGroup}><Plus size={14} />{t(locale, "添加加料组模板", "Add modifier group template")}</button>}
            </div>
          )}
          {error && <div className="inline-error">{error}</div>}
          <div className="option-preset-actions">
            <button className="primary" type="button" onClick={save} disabled={busy}><Save size={14} />{t(locale, "保存预设", "Save preset")}</button>
            <button className="danger" type="button" onClick={remove}><Trash2 size={14} />{t(locale, "删除预设", "Delete preset")}</button>
          </div>
        </div>
      )}
    </article>
  );
}

function CategoryEditor({ category, locale, onSaved }) {
  const [draft, setDraft] = useState({
    zh: labelOf(category.name_i18n, "zh-CN"),
    en: labelOf(category.name_i18n, "en-GB"),
    sort_order: category.sort_order ?? 0,
    active: category.active
  });

  const save = useCallback(async (overrides = {}, refresh = true) => {
    const data = { ...draft, ...overrides };
    setDraft(data);
    await api(`/menu/categories/${category.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": data.zh, "en-GB": data.en || data.zh },
        sort_order: Number(data.sort_order),
        active: data.active
      })
    });
    if (refresh) await onSaved();
  }, [draft, category.id, onSaved]);

  return (
    <div className="cat-editor-panel">
      <p className="muted cat-editor-title">{t(locale, "编辑分类", "Edit category")}</p>
      <label>{t(locale, "中文", "Chinese")}<input value={draft.zh} onChange={(e) => setDraft({ ...draft, zh: e.target.value })} onBlur={() => save({ zh: draft.zh })} /></label>
      <label>English<input value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} onBlur={() => save({ en: draft.en })} /></label>
      <label>{t(locale, "排序", "Sort")}<input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} onBlur={() => save({ sort_order: draft.sort_order })} /></label>
      <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(e) => { const v = e.target.checked; setDraft({ ...draft, active: v }); save({ active: v }); }} />{t(locale, "启用", "Enabled")}</label>
    </div>
  );
}

function NotePresetsAdmin({ presets, locale, onSaved }) {
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function addPreset(event) {
    event.preventDefault();
    const value = label.trim();
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      await api("/note-presets", {
        method: "POST",
        body: JSON.stringify({ label: value, sort_order: presets.length + 1 })
      });
      setLabel("");
      setShowForm(false);
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function movePreset(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= presets.length) return;
    const next = presets.map((preset) => ({ ...preset }));
    const [picked] = next.splice(index, 1);
    next.splice(targetIndex, 0, picked);
    setBusy(true);
    try {
      await Promise.all(next.map((preset, orderIndex) => api(`/note-presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sort_order: orderIndex + 1 })
      })));
      await onSaved();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePreset(preset) {
    try {
      await api(`/note-presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !preset.active })
      });
      await onSaved();
    } catch (err) {
      alert(err.message);
    }
  }

  async function destroyPreset(preset) {
    if (!window.confirm(t(locale, `删除备注词条"${preset.label}"？`, `Delete note preset "${preset.label}"?`))) return;
    try {
      await api(`/note-presets/${preset.id}`, { method: "DELETE" });
      await onSaved();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="cat-editor-panel" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p className="muted cat-editor-title" style={{ margin: 0 }}>{t(locale, "备注词条管理", "Note presets")}</p>
        <button type="button" title={t(locale, "新建词条", "New note")} onClick={() => setShowForm((v) => !v)}>
          <Plus size={14} />
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        {t(locale, "点菜时可一键加到菜品备注，仅在厨房打印单上显示。", "Add to item notes with one click; shown only on kitchen tickets.")}
      </p>
      {showForm && (
        <form onSubmit={addPreset} style={{ display: "grid", gap: 6, marginBottom: 8 }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t(locale, "例如：白人辣、去葱", "For example: mild, no scallions")}
            autoFocus
            required
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button className="primary" type="submit" disabled={busy}>{t(locale, "保存", "Save")}</button>
            <button type="button" onClick={() => { setShowForm(false); setLabel(""); setError(""); }}>{t(locale, "取消", "Cancel")}</button>
          </div>
          {error && <div className="inline-error">{error}</div>}
        </form>
      )}
      {!presets.length && <div className="empty" style={{ padding: "8px 0" }}>{t(locale, "暂无词条", "No notes")}</div>}
      {presets.map((preset, index) => (
        <div
          key={preset.id}
          className={`menu-sidebar-item${!preset.active ? " cat-inactive" : ""}`}
          style={{ paddingRight: 6 }}
        >
          <div className="cat-order-controls">
            <button type="button" title={t(locale, "上移", "Move up")} disabled={busy || index === 0} onClick={() => movePreset(index, -1)}>
              <ChevronUp size={13} />
            </button>
            <button type="button" title={t(locale, "下移", "Move down")} disabled={busy || index === presets.length - 1} onClick={() => movePreset(index, 1)}>
              <ChevronDown size={13} />
            </button>
          </div>
          <button
            type="button"
            className="cat-select-btn"
            title={preset.active ? t(locale, "点击停用", "Click to disable") : t(locale, "点击启用", "Click to enable")}
            onClick={() => togglePreset(preset)}
          >
            <span>{preset.label}</span>
            <span className="cat-count">{preset.active ? t(locale, "启用", "Enabled") : t(locale, "停用", "Disabled")}</span>
          </button>
          <button
            type="button"
            className="cat-delete-btn"
            title={t(locale, "删除词条", "Delete note")}
            onClick={() => destroyPreset(preset)}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function PresetControls({ item, kind, presets, currentPresetId, locale, onSaved, onNotify }) {
  const available = presets.filter((preset) => preset.kind === kind && preset.active !== false);
  const [presetId, setPresetId] = useState(currentPresetId || "");
  const [busy, setBusy] = useState(false);
  const boundPreset = available.find((preset) => preset.id === currentPresetId);

  useEffect(() => {
    setPresetId(currentPresetId || "");
  }, [currentPresetId, presets]);

  async function applyPreset() {
    if (!presetId) return;
    const preset = available.find((entry) => entry.id === presetId);
    if (!window.confirm(t(locale, `绑定“${preset?.name || "该预设"}”并替换当前${kind === "variants" ? "规格" : "加料小项"}？以后修改该预设时，此产品会自动同步。`, `Bind "${preset?.name || "this preset"}" and replace the current ${kind === "variants" ? "options" : "extras"}? Future preset edits will sync to this item.`))) return;
    setBusy(true);
    try {
      await api(`/menu/items/${item.id}/apply-option-preset`, {
        method: "POST",
        body: JSON.stringify({ preset_id: presetId, replace: true })
      });
      await onSaved();
      onNotify(t(locale, `已绑定预设“${preset?.name}”`, `Bound preset "${preset?.name}"`));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAsPreset() {
    const name = window.prompt(t(locale, `为当前${kind === "variants" ? "产品规格" : "加料小项"}输入新预设名称：`, `Enter a new preset name for the current ${kind === "variants" ? "item options" : "extras"}:`));
    if (!name?.trim()) return;
    setBusy(true);
    try {
      await api(`/menu/items/${item.id}/option-presets`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), kind })
      });
      await onSaved();
      onNotify(t(locale, `已保存并绑定新预设“${name.trim()}”`, `Saved and bound new preset "${name.trim()}"`));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="item-preset-controls">
      <span className="preset-control-label">{t(locale, "预设", "Preset")}</span>
      <select value={presetId} onChange={(event) => setPresetId(event.target.value)} disabled={busy || !available.length}>
        <option value="">{available.length ? t(locale, "选择要绑定的预设", "Select a preset to bind") : t(locale, "暂无预设", "No presets")}</option>
        {available.map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}
      </select>
      <button type="button" onClick={applyPreset} disabled={busy || !presetId}>{t(locale, "绑定预设", "Bind preset")}</button>
      <button type="button" onClick={saveAsPreset} disabled={busy}>{t(locale, "保存当前为预设", "Save current as preset")}</button>
      <span className={`preset-binding-status${boundPreset ? " bound" : " detached"}`}>
        {boundPreset ? t(locale, `已绑定：${boundPreset.name}`, `Bound: ${boundPreset.name}`) : t(locale, "独立配置", "Standalone configuration")}
      </span>
    </div>
  );
}

function ModifierGroupPresetControls({ group, presets, locale, onSaved, onNotify }) {
  const available = presets.filter((preset) => preset.kind === "modifiers" && preset.active !== false && (preset.payload || []).length === 1);
  const [presetId, setPresetId] = useState(group.preset_id || "");
  const [busy, setBusy] = useState(false);
  const boundPreset = available.find((preset) => preset.id === group.preset_id);

  useEffect(() => setPresetId(group.preset_id || ""), [group.preset_id, presets]);

  async function applyPreset() {
    if (!presetId) return;
    const preset = available.find((entry) => entry.id === presetId);
    if (!window.confirm(t(locale, `将加料组“${labelOf(group.name_i18n, "zh-CN")}”绑定到“${preset?.name}”？当前组设置和选项会被替换。`, `Bind modifier group "${labelOf(group.name_i18n, locale)}" to "${preset?.name}"? The current group settings and options will be replaced.`))) return;
    setBusy(true);
    try {
      await api(`/menu/modifier-groups/${group.id}/apply-option-preset`, {
        method: "POST",
        body: JSON.stringify({ preset_id: presetId })
      });
      await onSaved();
      onNotify(t(locale, `加料组已绑定预设“${preset?.name}”`, `Modifier group bound to preset "${preset?.name}"`));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAsPreset() {
    const name = window.prompt(t(locale, "为当前加料组输入新预设名称：", "Enter a new preset name for the current modifier group:"));
    if (!name?.trim()) return;
    setBusy(true);
    try {
      await api(`/menu/modifier-groups/${group.id}/option-presets`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim() })
      });
      await onSaved();
      onNotify(t(locale, `已保存并绑定新预设“${name.trim()}”`, `Saved and bound new preset "${name.trim()}"`));
    } catch (error) {
      onNotify(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="item-preset-controls modifier-group-preset-controls">
      <span className="preset-control-label">{t(locale, "组预设", "Group preset")}</span>
      <select value={presetId} onChange={(event) => setPresetId(event.target.value)} disabled={busy || !available.length}>
        <option value="">{available.length ? t(locale, "选择预设", "Select a preset") : t(locale, "暂无组预设", "No group presets")}</option>
        {available.map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}
      </select>
      <button type="button" onClick={applyPreset} disabled={busy || !presetId}>{t(locale, "绑定", "Bind")}</button>
      <button type="button" onClick={saveAsPreset} disabled={busy}>{t(locale, "保存为预设", "Save as preset")}</button>
      <span className={`preset-binding-status${boundPreset ? " bound" : " detached"}`}>
        {boundPreset ? t(locale, `已绑定：${boundPreset.name}`, `Bound: ${boundPreset.name}`) : t(locale, "独立配置", "Standalone configuration")}
      </span>
    </div>
  );
}

function MenuItemEditor({ item, categories, optionPresets, locale, currency, onSaved, onNotify, onToggleActive, onDestroy, onCopy, itemAction }) {
  const [draft, setDraft] = useState({
    zh: labelOf(item.name_i18n, "zh-CN"),
    en: labelOf(item.name_i18n, "en-GB"),
    category_id: item.category_id,
    kitchen_group: item.kitchen_group,
    sort_order: item.sort_order ?? 0,
    active: item.active
  });
  const [variantDraft, setVariantDraft] = useState({ zh: "", en: "", price: "0" });
  const [groupDraft, setGroupDraft] = useState({ zh: t(locale, "加料", "Extras"), en: "Extras", min: 0, max: 1 });

  const saveItem = useCallback(async (overrides = {}) => {
    const data = { ...draft, ...overrides };
    setDraft(data);
    await api(`/menu/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        category_id: data.category_id,
        name_i18n: { "zh-CN": data.zh, "en-GB": data.en || data.zh },
        kitchen_group: data.kitchen_group,
        sort_order: Number(data.sort_order),
        active: data.active
      })
    });
    await onSaved();
  }, [draft, item.id, onSaved]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const autoSave = useCallback((field, value) => saveItem({ [field]: value }), [saveItem]);

  async function addVariant(event) {
    event.preventDefault();
    await api(`/menu/items/${item.id}/variants`, {
      method: "POST",
      body: JSON.stringify({
        name_i18n: { "zh-CN": variantDraft.zh, "en-GB": variantDraft.en || variantDraft.zh },
        price: Number(variantDraft.price),
        sort_order: item.variants.length
      })
    });
    setVariantDraft({ zh: "", en: "", price: "0" });
    await onSaved();
    onNotify(item.variant_preset_id ? "规格已添加，已断开规格预设绑定" : "规格已添加");
  }

  async function addGroup(event) {
    event.preventDefault();
    await api("/menu/modifier-groups", {
      method: "POST",
      body: JSON.stringify({
        item_id: item.id,
        name_i18n: { "zh-CN": groupDraft.zh, "en-GB": groupDraft.en || groupDraft.zh },
        min_select: Number(groupDraft.min),
        max_select: Number(groupDraft.max),
        sort_order: item.modifier_groups.length
      })
    });
    setGroupDraft({ zh: "加料", en: "Extras", min: 0, max: 1 });
    await onSaved();
    onNotify(item.modifier_preset_id ? "加料组已添加，已断开加料预设绑定" : "加料组已添加");
  }

  async function moveVariant(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= item.variants.length) return;
    const current = item.variants[index];
    const target = item.variants[targetIndex];
    await Promise.all([
      api(`/menu/items/${item.id}/variants/${current.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: targetIndex }) }),
      api(`/menu/items/${item.id}/variants/${target.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: index }) })
    ]);
    await onSaved();
    onNotify(item.variant_preset_id ? "规格顺序已更新，已断开规格预设绑定" : "规格顺序已更新");
  }

  return (
    <div className={`menu-editor${item.active ? "" : " inactive"}`}>
      <div className="inline-editor item-main-editor">
        <label>{t(locale, "中文", "Chinese")}<input value={draft.zh} onChange={(e) => setDraft({ ...draft, zh: e.target.value })} onBlur={() => autoSave("zh", draft.zh)} /></label>
        <label>English<input value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} onBlur={() => autoSave("en", draft.en)} /></label>
        <label>{t(locale, "分类", "Category")}<select value={draft.category_id || ""} onChange={(e) => { const v = e.target.value; setDraft({ ...draft, category_id: v }); saveItem({ category_id: v }); }}>
          {categories.map((category) => <option key={category.id} value={category.id}>{labelOf(category.name_i18n, locale)}</option>)}
        </select></label>
        <label>{t(locale, "厨房分组", "Kitchen group")}<input value={draft.kitchen_group} onChange={(e) => setDraft({ ...draft, kitchen_group: e.target.value })} onBlur={() => autoSave("kitchen_group", draft.kitchen_group)} /></label>
        <label>{t(locale, "排序", "Sort")}<input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} onBlur={() => autoSave("sort_order", draft.sort_order)} /></label>
        <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={(e) => { const v = e.target.checked; setDraft({ ...draft, active: v }); saveItem({ active: v }); }} />{t(locale, "上架", "Active")}</label>
        <button className="action-toggle" type="button" onClick={onToggleActive} disabled={Boolean(itemAction)}>
          <Power size={16} /><span>{itemAction === "toggle" ? t(locale, "处理中…", "Working…") : item.active ? t(locale, "停用产品", "Disable item") : t(locale, "启用产品", "Enable item")}</span>
        </button>
        {onCopy && (
          <button type="button" className="action-copy" onClick={onCopy} disabled={Boolean(itemAction)}>
            <Copy size={16} /><span>{itemAction === "copy" ? t(locale, "复制中…", "Duplicating…") : t(locale, "复制菜品", "Duplicate item")}</span>
          </button>
        )}
        {!item.active && onDestroy && (
          <button type="button" className="action-delete" onClick={onDestroy} disabled={Boolean(itemAction)}><Trash2 size={16} /><span>{itemAction === "destroy" ? t(locale, "删除中…", "Deleting…") : t(locale, "永久删除", "Delete permanently")}</span></button>
        )}
      </div>

      <div className="editor-subsection variants-editor-section">
        <div className="editor-subsection-title">
          <div className="editor-subsection-heading-copy">
            <span className="editor-section-step">1</span>
            <div>
              <h3>产品规格 <span className="editor-section-count">{item.variants.length} 项</span></h3>
              <p>设置不同份量或尺寸，以及每个规格的销售价格</p>
            </div>
          </div>
          <div className="section-preset-bar">
            <PresetControls item={item} kind="variants" presets={optionPresets} currentPresetId={item.variant_preset_id} locale={locale} onSaved={onSaved} onNotify={onNotify} />
          </div>
        </div>
        <div className="item-sub-list">
          {!item.variants.length && <div className="editor-empty-state">{t(locale, "还没有规格，请在下方添加，或直接应用一个规格预设。", "No options yet. Add one below or apply an option preset.")}</div>}
          {item.variants.map((variant, index) => (
            <VariantEditor key={variant.id} index={index} item={item} variant={variant} locale={locale} currency={currency} onSaved={onSaved} onNotify={onNotify} wasPresetBound={Boolean(item.variant_preset_id)} onMove={moveVariant} total={item.variants.length} />
          ))}
        </div>
        <form className="item-sub-add" onSubmit={addVariant}>
          <span className="sub-add-label">{t(locale, "新规格", "New option")}</span>
          <input className="sub-field" placeholder={t(locale, "规格名", "Option name")} value={variantDraft.zh} onChange={(event) => setVariantDraft({ ...variantDraft, zh: event.target.value })} required />
          <input className="sub-field" placeholder="English" value={variantDraft.en} onChange={(event) => setVariantDraft({ ...variantDraft, en: event.target.value })} />
          <input className="sub-field sub-field-price" type="number" step="0.01" placeholder={t(locale, "价格", "Price")} value={variantDraft.price} onChange={(event) => setVariantDraft({ ...variantDraft, price: event.target.value })} />
          <button type="submit"><Plus size={14} /><span>{t(locale, "添加规格", "Add option")}</span></button>
        </form>
      </div>

      <div className="editor-subsection modifiers-editor-section">
        <div className="editor-subsection-title">
          <div className="editor-subsection-heading-copy">
            <span className="editor-section-step">2</span>
            <div>
              <h3>{t(locale, "加料与小项", "Extras & modifiers")} <span className="editor-section-count">{item.modifier_groups.length} {t(locale, "组", "groups")}</span></h3>
              <p>{t(locale, "先建立分组，再在组内配置顾客可以选择的加料选项", "Create groups first, then configure the add-ons customers can choose")}</p>
            </div>
          </div>
        </div>
        <div className="modifier-groups-list">
        {!item.modifier_groups.length && <div className="editor-empty-state">{t(locale, "还没有加料组，请先创建分组，再向组内添加选项。", "No modifier groups yet. Create a group first, then add options.")}</div>}
        {item.modifier_groups.map((group, index) => (
          <ModifierGroupEditor key={group.id} index={index} group={group} presets={optionPresets} locale={locale} currency={currency} onSaved={onSaved} onNotify={onNotify} wasPresetBound={Boolean(group.preset_id || item.modifier_preset_id)} />
        ))}
        </div>
        <form className="item-sub-add" onSubmit={addGroup}>
          <span className="sub-add-label">{t(locale, "新加料组", "New modifier group")}</span>
          <input className="sub-field" placeholder={t(locale, "组名", "Group name")} value={groupDraft.zh} onChange={(event) => setGroupDraft({ ...groupDraft, zh: event.target.value })} />
          <input className="sub-field" placeholder="English" value={groupDraft.en} onChange={(event) => setGroupDraft({ ...groupDraft, en: event.target.value })} />
          <label className="sub-num-label">{t(locale, "最少", "Min")}<input className="sub-field sub-field-num" type="number" min="0" value={groupDraft.min} onChange={(event) => setGroupDraft({ ...groupDraft, min: event.target.value })} /></label>
          <label className="sub-num-label">{t(locale, "最多", "Max")}<input className="sub-field sub-field-num" type="number" min="1" value={groupDraft.max} onChange={(event) => setGroupDraft({ ...groupDraft, max: event.target.value })} /></label>
          <label className="checkbox group-required-toggle"><input type="checkbox" checked={Number(groupDraft.min) > 0} onChange={(event) => setGroupDraft({ ...groupDraft, min: event.target.checked ? Math.max(1, Number(groupDraft.min || 0)) : 0 })} />{t(locale, "必选组", "Required")}</label>
          <button type="submit"><Plus size={14} /><span>{t(locale, "添加小项组", "Add modifier group")}</span></button>
        </form>
      </div>
    </div>
  );
}

function VariantEditor({ item, variant, index, locale, currency, onSaved, onNotify, wasPresetBound, onMove, total }) {
  const [draft, setDraft] = useState({
    zh: labelOf(variant.name_i18n, "zh-CN"),
    en: labelOf(variant.name_i18n, "en-GB"),
    price: variant.price,
    sort_order: variant.sort_order ?? 0,
    active: variant.active
  });
  const [action, setAction] = useState("");

  const save = useCallback(async (overrides = {}, refresh = true) => {
    const data = { ...draft, ...overrides };
    setDraft(data);
    await api(`/menu/items/${item.id}/variants/${variant.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": data.zh, "en-GB": data.en || data.zh },
        price: Number(data.price),
        sort_order: Number(data.sort_order),
        active: data.active
      })
    });
    if (refresh) await onSaved();
  }, [draft, item.id, variant.id, onSaved]);

  async function runVariantAction(kind, operation, successText) {
    setAction(kind);
    try {
      await operation();
      await onSaved();
      onNotify(`${successText}${wasPresetBound ? "，已断开规格预设绑定" : ""}`);
    } catch (error) {
      onNotify(error.message);
    } finally {
      setAction("");
    }
  }

  function destroyVariant() {
    if (!window.confirm(`永久删除规格“${draft.zh}”？历史订单中的规格名称和价格仍会保留。`)) return;
    runVariantAction("destroy", () => api(`/menu/items/${item.id}/variants/${variant.id}/destroy`, { method: "DELETE" }), "规格已永久删除");
  }

  return (
    <div className="item-sub-row">
      <span className="sub-row-index">{index + 1}</span>
      <div className="sub-row-order">
        <button type="button" title="上移" disabled={index === 0 || Boolean(action)} onClick={() => onMove(index, -1)}><ChevronUp size={13} /></button>
        <button type="button" title="下移" disabled={index === total - 1 || Boolean(action)} onClick={() => onMove(index, 1)}><ChevronDown size={13} /></button>
      </div>
      <input className="sub-field sub-field-name" placeholder="名称" value={draft.zh} onChange={(e) => setDraft({ ...draft, zh: e.target.value })} onBlur={() => save({ zh: draft.zh })} />
      <input className="sub-field sub-field-name" placeholder="English" value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} onBlur={() => save({ en: draft.en })} />
      <input className="sub-field sub-field-price" type="number" step="0.01" placeholder="价格" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} onBlur={() => save({ price: draft.price })} />
      <span className="sub-price-display muted">{money(draft.price, currency, locale)}</span>
      <button className="action-save" type="button" disabled={Boolean(action)} onClick={() => runVariantAction("save", () => save({}, false), t(locale, "规格已保存", "Option saved"))}><Save size={14} /><span>{action === "save" ? t(locale, "保存中…", "Saving…") : t(locale, "保存", "Save")}</span></button>
      <button className="action-toggle" type="button" disabled={Boolean(action)} onClick={() => runVariantAction("toggle", () => save({ active: !draft.active }, false), draft.active ? t(locale, "规格已停用", "Option disabled") : t(locale, "规格已启用", "Option enabled"))}><Power size={14} /><span>{action === "toggle" ? t(locale, "处理中…", "Working…") : draft.active ? t(locale, "停用", "Disable") : t(locale, "启用", "Enable")}</span></button>
      <button className="action-delete" type="button" disabled={Boolean(action)} onClick={destroyVariant}><Trash2 size={14} /><span>{action === "destroy" ? t(locale, "删除中…", "Deleting…") : t(locale, "删除", "Delete")}</span></button>
    </div>
  );
}

function ModifierGroupEditor({ group, index, presets, locale, currency, onSaved, onNotify, wasPresetBound }) {
  const [draft, setDraft] = useState(() => ({
    zh: labelOf(group.name_i18n, "zh-CN"),
    en: labelOf(group.name_i18n, "en-GB"),
    min_select: group.min_select,
    max_select: group.max_select,
    active: group.active
  }));
  const [modifierDraft, setModifierDraft] = useState({ zh: "", en: "", price: "0", default_selected: false });
  const [expanded, setExpanded] = useState(true);
  const [action, setAction] = useState("");

  // Sync draft when group props change externally (e.g. after preset apply)
  useEffect(() => {
    setDraft({
      zh: labelOf(group.name_i18n, "zh-CN"),
      en: labelOf(group.name_i18n, "en-GB"),
      min_select: group.min_select,
      max_select: group.max_select,
      active: group.active
    });
  }, [group.id, group.min_select, group.max_select, group.name_i18n, group.active]);

  async function saveGroup(refresh = true, overrides = {}) {
    const data = { ...draft, ...overrides };
    setDraft(data);
    await api(`/menu/modifier-groups/${group.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": data.zh, "en-GB": data.en || data.zh },
        min_select: Number(data.min_select),
        max_select: Number(data.max_select),
        active: data.active
      })
    });
    if (refresh) await onSaved();
  }

  async function runGroupAction(kind, operation, successText) {
    setAction(kind);
    try {
      await operation();
      await onSaved();
      onNotify(`${successText}${wasPresetBound ? "，已断开加料预设绑定" : ""}`);
    } catch (error) {
      onNotify(error.message);
    } finally {
      setAction("");
    }
  }

  function destroyGroup() {
    if (!window.confirm(`永久删除整个加料组“${draft.zh}”及其中 ${group.modifiers.length} 个选项？此操作无法恢复。`)) return;
    runGroupAction("destroy", () => api(`/menu/modifier-groups/${group.id}/destroy`, { method: "DELETE" }), "整个加料组已永久删除");
  }

  async function addModifier(event) {
    event.preventDefault();
    await api(`/menu/modifier-groups/${group.id}/modifiers`, {
      method: "POST",
      body: JSON.stringify({
        name_i18n: { "zh-CN": modifierDraft.zh, "en-GB": modifierDraft.en || modifierDraft.zh },
        price_delta: Number(modifierDraft.price),
        sort_order: group.modifiers.length,
        default_selected: modifierDraft.default_selected
      })
    });
    setModifierDraft({ zh: "", en: "", price: "0", default_selected: false });
    await onSaved();
    onNotify(wasPresetBound ? "加料已添加，已断开加料预设绑定" : "加料已添加");
  }

  async function moveModifier(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= group.modifiers.length) return;
    const current = group.modifiers[index];
    const target = group.modifiers[targetIndex];
    await Promise.all([
      api(`/menu/modifiers/${current.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: targetIndex }) }),
      api(`/menu/modifiers/${target.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: index }) })
    ]);
    await onSaved();
    onNotify(wasPresetBound ? "加料顺序已更新，已断开组预设绑定" : "加料顺序已更新");
  }

  return (
    <div className={`modifier-group-editor${expanded ? " expanded" : ""}`}>
      <div className="modifier-group-summary">
        <button className="modifier-group-toggle" type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          <span className="modifier-group-index">组 {index + 1}</span>
          <span className="modifier-group-name">{draft.zh || "未命名加料组"}</span>
          <span className="modifier-group-rule">{Number(draft.min_select) > 0 ? "必选" : "可选"} · {Number(draft.max_select) === 1 ? "单选" : `最多 ${draft.max_select} 项`} · {group.modifiers.length} 个选项</span>
        </button>
        <ModifierGroupPresetControls group={group} presets={presets} locale={locale} onSaved={onSaved} onNotify={onNotify} />
        <div className="item-sub-group-actions">
          <button className="action-save" type="button" disabled={Boolean(action)} onClick={() => runGroupAction("save", () => saveGroup(false), "加料组已保存")}><Save size={14} /><span>{action === "save" ? "保存中…" : "保存组"}</span></button>
          <button className="action-toggle" type="button" disabled={Boolean(action)} onClick={() => runGroupAction("toggle", () => saveGroup(false, { active: !draft.active }), draft.active ? "加料组已停用" : "加料组已启用")}><Power size={14} /><span>{action === "toggle" ? "处理中…" : draft.active ? "停用" : "启用"}</span></button>
          <button className="action-delete" type="button" disabled={Boolean(action)} onClick={destroyGroup}><Trash2 size={14} /><span>{action === "destroy" ? "删除中…" : "删除整组"}</span></button>
        </div>
      </div>
      {expanded && <div className="modifier-group-body">
      <div className="item-sub-group-head">
        <span className="group-settings-label">分组设置</span>
        <div className="item-sub-group-inputs">
          <input className="sub-field sub-field-name" placeholder="组名" value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} />
          <input className="sub-field sub-field-name" placeholder="English" value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} />
          <label className="sub-num-label">最少<input className="sub-field sub-field-num" type="number" min="0" value={draft.min_select} onChange={(event) => setDraft({ ...draft, min_select: event.target.value })} /></label>
          <label className="sub-num-label">最多<input className="sub-field sub-field-num" type="number" min="1" value={draft.max_select} onChange={(event) => setDraft({ ...draft, max_select: event.target.value })} /></label>
          <label className="checkbox group-required-toggle"><input type="checkbox" checked={Number(draft.min_select) > 0} onChange={(event) => setDraft({ ...draft, min_select: event.target.checked ? Math.max(1, Number(draft.min_select || 0)) : 0 })} />必选组</label>
          <span className="muted sub-price-display">{Number(draft.min_select) > 0 ? "必选" : "可选"} · {Number(draft.max_select) === 1 ? "单选" : "多选"}</span>
          <span className={`item-badge${draft.active ? " badge-active" : " badge-inactive"}`}>{draft.active ? "启用中" : "已停用"}</span>
        </div>
      </div>
      <div className="group-options-label"><span>组内选项</span><small>{group.modifiers.length} 项</small></div>
      <div className="item-sub-group-modifiers">
        {group.modifiers.map((modifier, modifierIndex) => (
          <ModifierEditor key={modifier.id} index={modifierIndex} modifier={modifier} locale={locale} currency={currency} onSaved={onSaved} onNotify={onNotify} wasPresetBound={wasPresetBound} onMove={moveModifier} total={group.modifiers.length} />
        ))}
      </div>
      <form className="item-sub-add" onSubmit={addModifier}>
        <span className="sub-add-label">新选项</span>
        <input className="sub-field" placeholder="选项名" value={modifierDraft.zh} onChange={(event) => setModifierDraft({ ...modifierDraft, zh: event.target.value })} required />
        <input className="sub-field" placeholder="English" value={modifierDraft.en} onChange={(event) => setModifierDraft({ ...modifierDraft, en: event.target.value })} />
        <input className="sub-field sub-field-price" type="number" step="0.01" placeholder="加价" value={modifierDraft.price} onChange={(event) => setModifierDraft({ ...modifierDraft, price: event.target.value })} />
        <label className="checkbox modifier-default-new"><input type="checkbox" checked={modifierDraft.default_selected} onChange={(event) => setModifierDraft({ ...modifierDraft, default_selected: event.target.checked })} />默认选中</label>
        <button type="submit"><Plus size={14} /><span>添加选项</span></button>
      </form>
      </div>}
    </div>
  );
}

function ModifierEditor({ modifier, index, locale, currency, onSaved, onNotify, wasPresetBound, onMove, total }) {
  const [draft, setDraft] = useState({
    zh: labelOf(modifier.name_i18n, "zh-CN"),
    en: labelOf(modifier.name_i18n, "en-GB"),
    price_delta: modifier.price_delta,
    active: modifier.active,
    default_selected: modifier.default_selected === true
  });
  const [action, setAction] = useState("");

  async function save(refresh = true, overrides = {}) {
    const data = { ...draft, ...overrides };
    setDraft(data);
    await api(`/menu/modifiers/${modifier.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name_i18n: { "zh-CN": data.zh, "en-GB": data.en || data.zh },
        price_delta: Number(data.price_delta),
        active: data.active,
        default_selected: data.default_selected
      })
    });
    if (refresh) await onSaved();
  }

  async function runModifierAction(kind, operation, successText) {
    setAction(kind);
    try {
      await operation();
      await onSaved();
      onNotify(`${successText}${wasPresetBound ? "，已断开加料预设绑定" : ""}`);
    } catch (error) {
      onNotify(error.message);
    } finally {
      setAction("");
    }
  }

  function destroyModifier() {
    if (!window.confirm(`永久删除加料“${draft.zh}”？此操作无法恢复。`)) return;
    runModifierAction("destroy", () => api(`/menu/modifiers/${modifier.id}/destroy`, { method: "DELETE" }), "加料已永久删除");
  }

  return (
    <div className="item-sub-row modifier-option">
      <span className="sub-row-index">{index + 1}</span>
      <div className="sub-row-order">
        <button type="button" title="上移" disabled={index === 0 || Boolean(action)} onClick={() => onMove(index, -1)}><ChevronUp size={13} /></button>
        <button type="button" title="下移" disabled={index === total - 1 || Boolean(action)} onClick={() => onMove(index, 1)}><ChevronDown size={13} /></button>
      </div>
      <input className="sub-field sub-field-name" placeholder="选项" value={draft.zh} onChange={(event) => setDraft({ ...draft, zh: event.target.value })} />
      <input className="sub-field sub-field-name" placeholder="English" value={draft.en} onChange={(event) => setDraft({ ...draft, en: event.target.value })} />
      <input className="sub-field sub-field-price" type="number" step="0.01" placeholder="加价" value={draft.price_delta} onChange={(event) => setDraft({ ...draft, price_delta: event.target.value })} />
      <span className="sub-price-display muted">{money(draft.price_delta, currency, locale)}</span>
      <label className="checkbox modifier-default-toggle"><input type="checkbox" checked={draft.default_selected} onChange={(event) => setDraft({ ...draft, default_selected: event.target.checked })} />默认</label>
      <button className="action-save" type="button" disabled={Boolean(action)} onClick={() => runModifierAction("save", () => save(false), "加料已保存")}><Save size={14} /><span>{action === "save" ? "保存中…" : "保存"}</span></button>
      <button className="action-toggle" type="button" disabled={Boolean(action)} onClick={() => runModifierAction("toggle", () => save(false, { active: !draft.active }), draft.active ? "加料已停用" : "加料已启用")}><Power size={14} /><span>{action === "toggle" ? "处理中…" : draft.active ? "停用" : "启用"}</span></button>
      <button className="action-delete" type="button" disabled={Boolean(action)} onClick={destroyModifier}><Trash2 size={14} /><span>{action === "destroy" ? "删除中…" : "删除"}</span></button>
    </div>
  );
}

