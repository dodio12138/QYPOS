"use client";

import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { text } from "./pos-helpers";

export default function CustomItemModal({ locale, currency, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const priceNum = Number(price);
  const valid = name.trim().length > 0 && Number.isFinite(priceNum) && priceNum >= 0 && quantity >= 1;
  const total = valid ? priceNum * quantity : 0;

  function submit(event) { event.preventDefault(); if (!valid) return; onAdd({ name: name.trim(), price: priceNum, quantity, notes }); }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-header">
          <button type="button" onClick={onClose} title={text(locale, "关闭", "Close")}><X size={20} /></button>
          <div><h2>{text(locale, "杂项代收", "Misc charge")}</h2><p>{text(locale, "自定义名称与价格，记入当前订单", "Set a custom name and price for the current order")}</p></div>
        </header>
        <div className="modal-body" style={{display:"grid",gap:12,padding:"16px 20px"}}>
          <label>{text(locale, "名称", "Name")}<small className="label-hint">{text(locale, "如 \"塑料袋\"、\"打包盒\"、\"代收押金\" 等", "e.g. bag, box, deposit")}</small><input value={name} onChange={(e) => setName(e.target.value)} placeholder={text(locale, "杂项名称", "Charge name")} autoFocus /></label>
          <label>{text(locale, "单价", "Unit price")}（{currency}）<input type="number" inputMode="decimal" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" /></label>
          <label>{text(locale, "数量", "Quantity")}<div className="qty-stepper" style={{justifySelf:"start"}}><button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))}><Minus size={16} /></button><b>{quantity}</b><button type="button" onClick={() => setQuantity((q) => q + 1)}><Plus size={16} /></button></div></label>
          <label>{text(locale, "备注（可选）", "Notes (optional)")}<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={text(locale, "备注信息", "Notes")} /></label>
          {valid && <div className="totals" style={{borderTop:"1px solid var(--border)",paddingTop:8}}><strong>{text(locale, "小计", "Subtotal")} <b>{new Intl.NumberFormat(locale,{style:"currency",currency}).format(total)}</b></strong></div>}
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>{text(locale, "取消", "Cancel")}</button>
          <button type="submit" className="primary" disabled={!valid}><Plus size={18} /><span>{text(locale, "加入订单", "Add to order")}</span></button>
        </footer>
      </form>
    </div>
  );
}
