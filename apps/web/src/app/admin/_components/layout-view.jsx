"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Grid3X3, Plus, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import { api } from "../../../lib/api";

const GRID_SIZE = 20;

export default function LayoutView({ layout, onSaved }) {
  const [draftLayout, setDraftLayout] = useState(layout);
  const [dragging, setDragging] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [visibleAreaId, setVisibleAreaId] = useState(layout.areas[0]?.id || "");
  const [newAreaName, setNewAreaName] = useState("");
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const undoFnRef = useRef(null);
  const redoFnRef = useRef(null);

  useEffect(() => {
    setDraftLayout(layout);
    setVisibleAreaId((current) => layout.areas.some((area) => area.id === current) ? current : layout.areas[0]?.id || "");
    setSelectedTableId((current) => current || layout.tables[0]?.id || null);
    setUndoStack([]);
    setRedoStack([]);
  }, [layout]);

  const selectedTable = draftLayout.tables.find((table) => (table.id || table._client_id) === selectedTableId);
  const visibleTables = draftLayout.tables.filter((table) => !visibleAreaId || table.area_id === visibleAreaId);

  async function saveLayout() {
    const cleanLayout = { ...draftLayout, tables: draftLayout.tables.map(({ _client_id, ...table }) => table) };
    await api("/floor-layouts", { method: "PUT", body: JSON.stringify(cleanLayout) });
    setUndoStack([]);
    setRedoStack([]);
    await onSaved();
  }

  function moveTable(id, dx, dy) {
    if (!editMode) return;
    setDraftLayout((current) => ({
      ...current,
      tables: current.tables.map((table) => {
        if ((table.id || table._client_id) !== id) return table;
        const rawX = Math.max(0, Number(table.x) + dx);
        const rawY = Math.max(0, Number(table.y) + dy);
        return { ...table, x: snapEnabled ? Math.round(rawX / GRID_SIZE) * GRID_SIZE : rawX, y: snapEnabled ? Math.round(rawY / GRID_SIZE) * GRID_SIZE : rawY };
      })
    }));
  }

  function updateSelectedTable(field, value) {
    setDraftLayout((current) => ({
      ...current,
      tables: current.tables.map((table) => (table.id || table._client_id) === selectedTableId ? { ...table, [field]: value } : table)
    }));
  }

  function addTable() {
    const area = draftLayout.areas.find((item) => item.id === visibleAreaId) || draftLayout.areas[0];
    if (!area) return;
    pushHistory();
    const next = draftLayout.tables.length + 1;
    const newId = `new-${Date.now()}`;
    setDraftLayout((current) => ({
      ...current,
      tables: [...current.tables, { _client_id: newId, area_id: area.id, label: `N${next}`, seats: 2, status: "available", x: 40 + next * 12, y: 300, width: 100, height: 72, shape: "rect", rotation: 0 }]
    }));
    setSelectedTableId(newId);
  }

  async function addArea(event) {
    event.preventDefault();
    if (!newAreaName.trim()) return;
    await api("/floor-areas", { method: "POST", body: JSON.stringify({ name: newAreaName.trim(), sort_order: draftLayout.areas.length }) });
    setNewAreaName("");
    await onSaved();
  }

  async function deleteArea(area) {
    await api(`/floor-areas/${area.id}`, { method: "DELETE" });
    await onSaved();
  }

  async function copySelectedTable() {
    if (!selectedTable) return;
    if (!selectedTable.id) {
      const newId = `new-${Date.now()}`;
      setDraftLayout((current) => ({ ...current, tables: [...current.tables, { ...selectedTable, _client_id: newId, label: `${selectedTable.label}-copy`, x: Number(selectedTable.x) + 24, y: Number(selectedTable.y) + 24 }] }));
      setSelectedTableId(newId);
      return;
    }
    await api(`/tables/${selectedTable.id}/copy`, { method: "POST", body: JSON.stringify({ label: `${selectedTable.label}-copy` }) });
    await onSaved();
  }

  async function deleteSelectedTable() {
    if (!selectedTable) return;
    const key = selectedTable.id || selectedTable._client_id;
    if (!selectedTable.id) {
      setDraftLayout((current) => ({ ...current, tables: current.tables.filter((table) => (table.id || table._client_id) !== key) }));
      setSelectedTableId(null);
      return;
    }
    await api(`/tables/${selectedTable.id}`, { method: "DELETE" });
    setSelectedTableId(null);
    await onSaved();
  }

  function getSnapshot() {
    return { tables: draftLayout.tables.map((t) => ({ ...t })), areas: draftLayout.areas.map((a) => ({ ...a })) };
  }

  function pushHistory() {
    setUndoStack((u) => [...u.slice(-49), getSnapshot()]);
    setRedoStack([]);
  }

  function undo() {
    if (!undoStack.length) return;
    const snap = getSnapshot();
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, snap]);
    setUndoStack((u) => u.slice(0, -1));
    setDraftLayout((d) => ({ ...d, tables: prev.tables, areas: prev.areas }));
  }

  function redo() {
    if (!redoStack.length) return;
    const snap = getSnapshot();
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, snap]);
    setRedoStack((r) => r.slice(0, -1));
    setDraftLayout((d) => ({ ...d, tables: next.tables, areas: next.areas }));
  }

  undoFnRef.current = undo;
  redoFnRef.current = redo;

  useEffect(() => {
    function onKeyDown(event) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redoFnRef.current?.();
      else undoFnRef.current?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="layout-view">
      <div className="area-toolbar">
        {draftLayout.areas.map((area) => (
          <button key={area.id} className={visibleAreaId === area.id ? "selected" : ""} onClick={() => setVisibleAreaId(area.id)} type="button">{area.name}</button>
        ))}
      </div>
      <form className="inline-editor area-editor" onSubmit={addArea}>
        <label>新区域<input value={newAreaName} onChange={(event) => setNewAreaName(event.target.value)} placeholder="Patio" /></label>
        <button type="submit"><Plus size={16} /><span>添加区域</span></button>
      </form>
      <div className="inline-editor-list area-list">
        {draftLayout.areas.map((area) => (
          <div className="inline-editor" key={area.id}>
            <label>区域名<input value={area.name} onChange={(event) => {
              const name = event.target.value;
              setDraftLayout((current) => ({ ...current, areas: current.areas.map((item) => item.id === area.id ? { ...item, name } : item) }));
            }} /></label>
            <label>排序<input type="number" value={area.sort_order ?? 0} onChange={(event) => {
              const sortOrder = Number(event.target.value);
              setDraftLayout((current) => ({ ...current, areas: current.areas.map((item) => item.id === area.id ? { ...item, sort_order: sortOrder } : item) }));
            }} /></label>
            <button type="button" onClick={() => {}}><Save size={16} /><span>保存区域</span></button>
            <button type="button" onClick={() => deleteArea(area)}><Trash2 size={16} /><span>删除区域</span></button>
          </div>
        ))}
      </div>
      <div className="layout-toolbar">
        <button className={editMode ? "selected" : ""} onClick={() => setEditMode((current) => !current)} type="button"><span>{editMode ? "退出编辑模式" : "进入编辑模式"}</span></button>
        {editMode && <>
          <button onClick={undo} type="button" disabled={!undoStack.length} title="撤销 (⌘Z)"><Undo2 size={18} /><span>撤销</span></button>
          <button onClick={redo} type="button" disabled={!redoStack.length} title="重做 (⌘⇧Z)"><Redo2 size={18} /><span>重做</span></button>
          <button className={snapEnabled ? "selected" : ""} onClick={() => setSnapEnabled((v) => !v)} type="button" title="网格吸附"><Grid3X3 size={18} /><span>吸附</span></button>
        </>}
        <button onClick={addTable} type="button"><Plus size={18} /><span>添加桌台</span></button>
        <button className="primary" onClick={saveLayout} type="button"><Save size={18} /><span>保存布局</span></button>
      </div>
      <div className="layout-editor-grid">
        <div className={`floor-canvas editor ${editMode ? "is-editing" : ""}`}
          style={snapEnabled && editMode ? { backgroundImage: "radial-gradient(circle, #bbb 1.5px, transparent 1.5px)", backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px` } : undefined}
          onPointerMove={(event) => { if (!dragging) return; moveTable(dragging.id, event.movementX, event.movementY); }}
          onPointerUp={() => setDragging(null)} onPointerLeave={() => setDragging(null)}>
          {visibleTables.map((table) => {
            const tableKey = table.id || table._client_id;
            return (
              <button key={tableKey} className={`table-shape ${table.shape} ${table.status} ${selectedTableId === tableKey ? "selected-table" : ""}`}
                style={{ left: Number(table.x), top: Number(table.y), width: Number(table.width), height: Number(table.height) }}
                onClick={() => setSelectedTableId(tableKey)}
                onPointerDown={(event) => { setSelectedTableId(tableKey); if (!editMode) return; pushHistory(); event.currentTarget.setPointerCapture(event.pointerId); setDragging({ id: tableKey }); }}
                type="button">
                <strong>{table.label}</strong><span>{table.seats} seats</span>
              </button>
            );
          })}
        </div>
        <aside className="table-inspector">
          <h3>桌台属性</h3>
          {!selectedTable ? (
            <p className="empty">选择一个桌台进行编辑</p>
          ) : (
            <>
              <label>自定义编号<input value={selectedTable.label} onChange={(event) => updateSelectedTable("label", event.target.value)} disabled={!editMode} /></label>
              <label>座位数<input type="number" min="1" value={selectedTable.seats} onChange={(event) => updateSelectedTable("seats", Number(event.target.value))} disabled={!editMode} /></label>
              <label>形状<select value={selectedTable.shape} onChange={(event) => updateSelectedTable("shape", event.target.value)} disabled={!editMode}>
                <option value="rect">方桌</option><option value="round">圆桌</option>
              </select></label>
              <label>宽度<input type="number" min="64" value={selectedTable.width} onChange={(event) => updateSelectedTable("width", Number(event.target.value))} disabled={!editMode} /></label>
              <label>高度<input type="number" min="56" value={selectedTable.height} onChange={(event) => updateSelectedTable("height", Number(event.target.value))} disabled={!editMode} /></label>
              <label>区域<select value={selectedTable.area_id} onChange={(event) => updateSelectedTable("area_id", event.target.value)} disabled={!editMode}>
                {draftLayout.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select></label>
              <div className="inspector-actions">
                <button type="button" onClick={copySelectedTable} disabled={!editMode}><Copy size={16} /><span>复制桌台</span></button>
                <button type="button" onClick={deleteSelectedTable} disabled={!editMode || selectedTable.current_order_id}><Trash2 size={16} /><span>删除桌台</span></button>
              </div>
              <p className="inspector-help">{editMode ? "拖拽桌台可调整位置，修改编号后点击保存布局。" : "进入编辑模式后可拖拽和修改桌台属性。"}</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
