"use client";
import { useEffect, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { text, money } from "./pos-helpers";
import { labelOf } from "../../lib/api";
export default function ItemModal({ item, locale, currency, notePresets = [], initialVariantId, initialModifierIds, initialNotes, initialQuantity, editMode, onClose, onAdd }) {
  const activeVariants = item.variants.filter((variant) => variant.active);
  const defaultModifierIds = item.modifier_groups
    .filter((group) => group.active)
    .flatMap((group) => group.modifiers
      .filter((modifier) => modifier.active && modifier.default_selected)
      .slice(0, Number(group.max_select || 1))
      .map((modifier) => modifier.id));
  const [variantId, setVariantId] = useState(initialVariantId || activeVariants[0]?.id || "");
  const [modifierIds, setModifierIds] = useState(() => Array.isArray(initialModifierIds) ? initialModifierIds : defaultModifierIds);
  const [quantity, setQuantity] = useState(initialQuantity || 1);
  const [selectedPresetIds, setSelectedPresetIds] = useState([]);
  const [notes, setNotes] = useState(initialNotes || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initialNotes) return;
    // Try to split saved notes into preset labels + free text, for example: "少辣、不要香菜；去汤"
    const parts = initialNotes.split("；").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) {
      setNotes("");
      return;
    }
    // The first segment may be a preset label list joined by '、'
    const candidateLabels = parts[0].split("、").map((s) => s.trim()).filter(Boolean);
    const matchedIds = candidateLabels.map((lbl) => (notePresets.find((p) => p.label === lbl) || {}).id).filter(Boolean);
    if (matchedIds.length > 0) {
      setSelectedPresetIds(matchedIds);
      const free = parts.slice(1).join("；").trim();
      setNotes(free);
    } else {
      // If no preset labels match, keep the whole note as free text
      setNotes(initialNotes);
    }
  }, [initialNotes, notePresets]);

  function togglePreset(id) {
    setSelectedPresetIds((curr) => curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]);
  }

  function composedNotes() {
    const labels = selectedPresetIds
      .map((id) => notePresets.find((p) => p.id === id)?.label)
      .filter(Boolean);
    const free = notes.trim();
    return [labels.join("、"), free].filter(Boolean).join("；");
  }

  function modifierCount(modifierId) {
    return modifierIds.filter((id) => id === modifierId).length;
  }

  function groupSelectionCount(group, ids = modifierIds) {
    const groupIds = new Set(group.modifiers.map((modifier) => modifier.id));
    return ids.filter((id) => groupIds.has(id)).length;
  }

  function changeModifierCount(group, modifierId, delta) {
    setModifierIds((current) => {
      const groupIds = group.modifiers.map((modifier) => modifier.id);
      const maxSelect = Number(group.max_select || 1);
      if (delta > 0) {
        if (maxSelect === 1) return [...current.filter((id) => !groupIds.includes(id)), modifierId];
        if (current.filter((id) => groupIds.includes(id)).length >= maxSelect) return current;
        return [...current, modifierId];
      }
      const removeAt = current.lastIndexOf(modifierId);
      if (removeAt < 0) return current;
      return current.filter((_id, index) => index !== removeAt);
    });
  }

  function toggleModifier(group, modifierId) {
    changeModifierCount(group, modifierId, modifierCount(modifierId) > 0 ? -1 : 1);
  }

  const activeModifierGroups = item.modifier_groups.filter((group) => group.active);
  const modifierSelectionValid = activeModifierGroups.every((group) => {
    const count = groupSelectionCount(group);
    return count >= Number(group.min_select || 0) && count <= Number(group.max_select || 1);
  });

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <header className="modal-header">
          <button onClick={onClose} title={text(locale, "返回", "Back")}><ChevronLeft size={20} /></button>
          <div>
            <h2>{labelOf(item.name_i18n, locale)}</h2>
            <p>{labelOf(item.description_i18n, locale)}</p>
          </div>
          <button onClick={onClose} title={text(locale, "关闭", "Close")}><X size={20} /></button>
        </header>

        <div className="choice-group">
          <h3>{text(locale, "规格", "Variants")}</h3>
          <div className="choice-grid">
            {activeVariants.map((variant) => (
              <button key={variant.id} className={variantId === variant.id ? "selected" : ""} onClick={() => setVariantId(variant.id)}>
                <span>{labelOf(variant.name_i18n, locale)}</span>
                <b>{money(variant.price, currency, locale)}</b>
              </button>
            ))}
          </div>
          {!activeVariants.length && <div className="inline-error">{text(locale, "这个菜品还没有可售规格，请到后台先添加规格。", "This item has no active variants yet. Add one in the admin panel first.")}</div>}
        </div>

        {activeModifierGroups.map((group) => (
          <div className="choice-group" key={group.id}>
            <h3>{labelOf(group.name_i18n, locale)} <small className="muted">{text(locale, "已选", "Selected")} {groupSelectionCount(group)} / {Number(group.max_select || 1)}{Number(group.min_select || 0) > 0 ? text(locale, `，至少 ${group.min_select}`, `, min ${group.min_select}`) : ""}</small></h3>
            {Number(group.max_select || 1) === 1 ? (
              <div className="choice-grid">
                {group.modifiers.filter((modifier) => modifier.active).map((modifier) => (
                  <button key={modifier.id} className={modifierIds.includes(modifier.id) ? "selected" : ""} onClick={() => toggleModifier(group, modifier.id)}>
                    <span>{labelOf(modifier.name_i18n, locale)}{modifier.default_selected && <small className="default-option-badge">{text(locale, "默认", "Default")}</small>}</span>
                    <b>{Number(modifier.price_delta) ? money(modifier.price_delta, currency, locale) : text(locale, "免费", "Free")}</b>
                  </button>
                ))}
              </div>
            ) : (
              <div className="modifier-quantity-grid">
                {group.modifiers.filter((modifier) => modifier.active).map((modifier) => {
                  const count = modifierCount(modifier.id);
                  const atGroupLimit = groupSelectionCount(group) >= Number(group.max_select || 1);
                  return (
                    <div className={`modifier-quantity-card ${count > 0 ? "selected" : ""}`} key={modifier.id}>
                      <button className="modifier-main-button" onClick={() => changeModifierCount(group, modifier.id, 1)} disabled={atGroupLimit}>
                        <span>{labelOf(modifier.name_i18n, locale)}{modifier.default_selected && <small className="default-option-badge">{text(locale, "默认", "Default")}</small>}</span>
                        <b>{Number(modifier.price_delta) ? money(modifier.price_delta, currency, locale) : text(locale, "免费", "Free")}</b>
                      </button>
                      <div className="modifier-quantity-stepper">
                        <button onClick={() => changeModifierCount(group, modifier.id, -1)} disabled={count === 0} aria-label={text(locale, `减少${labelOf(modifier.name_i18n, locale)}`, `Decrease ${labelOf(modifier.name_i18n, locale)}`)}><Minus size={15} /></button>
                        <strong>{count}</strong>
                        <button onClick={() => changeModifierCount(group, modifier.id, 1)} disabled={atGroupLimit} aria-label={text(locale, `增加${labelOf(modifier.name_i18n, locale)}`, `Increase ${labelOf(modifier.name_i18n, locale)}`)}><Plus size={15} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {notePresets.length > 0 && (
          <div className="choice-group">
            <h3>{text(locale, "常用备注", "Quick notes")} <small className="muted" style={{fontWeight:"normal"}}>{text(locale, "（只打印到厨房单）", "(printed on the kitchen ticket only)")}</small></h3>
            <div className="choice-grid">
              {notePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={selectedPresetIds.includes(preset.id) ? "selected" : ""}
                  onClick={() => togglePreset(preset.id)}
                >
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="notes-box">
          {text(locale, "菜品备注", "Item notes")}
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={text(locale, "不要香菜、汤分开等", "No coriander, soup separate, etc.")} />
        </label>

        <footer className="modal-footer">
          <div className="qty-stepper large">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={18} /></button>
            <b>{quantity}</b>
            <button onClick={() => setQuantity(quantity + 1)}><Plus size={18} /></button>
          </div>
          <button
            className="primary"
            onClick={async () => {
              setSubmitting(true);
              setError("");
              try {
                await onAdd({ variantId, modifierIds, quantity, notes: composedNotes() });
              } catch (caught) {
                setError(caught.message);
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={!variantId || !modifierSelectionValid || submitting}
          >
            {submitting ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            <span>{submitting ? (editMode ? text(locale, "更新中", "Updating") : text(locale, "加入中", "Adding")) : (editMode ? text(locale, "更新菜品", "Update item") : text(locale, "加入订单", "Add to order"))}</span>
          </button>
        </footer>
        {!modifierSelectionValid && <div className="inline-error">{text(locale, "请完成必选小料，并确认选择数量没有超过上限。", "Complete the required modifiers and make sure the selection count does not exceed the limit.")}</div>}
        {error && <div className="inline-error">{error}</div>}
      </section>
    </div>
  );
}

