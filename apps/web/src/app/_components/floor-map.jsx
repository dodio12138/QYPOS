"use client";

import { Armchair, Loader2 } from "lucide-react";
import { text, money, statusLabel } from "./pos-helpers";

export default function FloorMap({ layout, locale, currency, selectedOrder, busyTableId, onSelect, onClearSelection }) {
  return (
    <section className="panel floor-panel">
      <div className="panel-title">
        <Armchair size={18} />
        <h2>{text(locale, "餐桌", "Tables")}</h2>
      </div>
      <div className="floor-canvas" onClick={(event) => { if (event.target === event.currentTarget) onClearSelection(); }}>
        {layout.tables.map((table) => (
          <button key={table.id}
            className={`table-shape ${table.shape} ${table.status} ${selectedOrder?.table_id === table.id ? "selected-table" : ""}`}
            style={{ left: Number(table.x), top: Number(table.y), width: Number(table.width), height: Number(table.height) }}
            onClick={() => onSelect(table)} disabled={busyTableId === table.id}
            title={`${table.label} ${statusLabel(table.status, locale)}`}>
            <strong>{busyTableId === table.id ? <Loader2 className="spin" size={18} /> : table.label}</strong>
            <span>{statusLabel(table.status, locale)}</span>
            {Number(table.current_total) > 0 && <em>{money(table.current_total, currency, locale)}</em>}
          </button>
        ))}
      </div>
    </section>
  );
}
