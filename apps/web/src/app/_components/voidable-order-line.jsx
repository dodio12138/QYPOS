"use client";

import { useEffect, useState } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { text, money, aggregateModifiers } from "./pos-helpers";
import { labelOf } from "../../lib/api";

export default function VoidableOrderLine({ item, locale, currency, locked, canVoidThis, voidReason, onQuantity, onEditItem, onVoidDone }) {
  const maxQty = Number(item.quantity);
  const [pendingVoid, setPendingVoid] = useState(false);
  const [voidQty, setVoidQty] = useState(maxQty);

  useEffect(() => { setPendingVoid(false); setVoidQty(maxQty); }, [item.id, canVoidThis, maxQty]);

  async function commitVoid() { await onQuantity(item, 0, { void: true, void_qty: voidQty, reason: voidReason || "front desk void" }); onVoidDone(); }

  const canEdit = !locked && !canVoidThis && item.item_id;

  return (
    <div className={`order-line rich${locked && !canVoidThis ? " locked" : ""}${canVoidThis ? " void-mode" : ""}`}>
      <div>
        <strong className={canEdit ? "item-name-editable" : ""} onClick={canEdit ? () => onEditItem(item) : undefined} title={canEdit ? text(locale, "点击修改规格/备注", "Edit variant/notes") : undefined}>{labelOf(item.name_i18n, locale)}</strong>
        <span>{labelOf(item.variant_name_i18n, locale)}</span>
        {locked && !canVoidThis && <small className="locked-line">{text(locale, "已下单制作中", "Submitted and being prepared")}</small>}
        {canVoidThis && !pendingVoid && <small className="locked-line warn">{text(locale, "点击删除进行退菜", "Click delete to void this item")}</small>}
        {canVoidThis && pendingVoid && (
          <small className="locked-line warn">{text(locale, "退菜数量：", "Void quantity:")}
            <button type="button" style={{padding:"0 4px"}} onClick={() => setVoidQty((q) => Math.max(1, q - 1))}>-</button>
            <b style={{margin:"0 4px"}}>{voidQty}</b>
            <button type="button" style={{padding:"0 4px"}} onClick={() => setVoidQty((q) => Math.min(maxQty, q + 1))}>+</button>
            &nbsp;/ {maxQty}
          </small>
        )}
        {aggregateModifiers(item.modifiers).map((m) => (
          <small key={m.modifier_id || m.id}>+ {m.count > 1 ? `${m.count}X ` : ""}{labelOf(m.name_i18n, locale)} {Number(m.price_delta) ? money(Number(m.price_delta) * m.count, currency, locale) : ""}</small>
        ))}
        {item.notes && <small className="item-notes">{text(locale, "备注：", "Notes:")}{item.notes}</small>}
      </div>
      <div className="qty-stepper">
        <button onClick={() => onQuantity(item, Number(item.quantity)-1)} disabled={locked}><Minus size={16} /></button>
        <b>{item.quantity}</b>
        <button onClick={() => onQuantity(item, Number(item.quantity)+1)} disabled={locked}><Plus size={16} /></button>
      </div>
      {canVoidThis ? (pendingVoid ? (
        <button className="icon-danger" onClick={commitVoid} title={text(locale,"确认退菜","Confirm void")}><Check size={16} /></button>
      ) : (
        <button className="icon-danger" onClick={() => { if(maxQty>1){setVoidQty(maxQty);setPendingVoid(true);} else commitVoid(); }} title={text(locale,"退菜","Void item")}><Trash2 size={16} /></button>
      )) : (
        <button className="icon-danger" onClick={() => onQuantity(item,0)} disabled={locked} title={text(locale,"删除","Delete")}><Trash2 size={16} /></button>
      )}
    </div>
  );
}
