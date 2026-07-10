"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Plus, Save, Trash2, X } from "lucide-react";
import { t, money, getLocalToday, formatDateStr, addDays, mondayOf, weekdayLabels } from "./helpers";
import { api } from "../../../lib/api";

const SCHEDULE_COLORS = ["#f87171", "#22c55e", "#38bdf8", "#818cf8", "#f59e0b", "#14b8a6", "#ec4899", "#94a3b8"];
const DEFAULT_SCHEDULE_TIME_PRESETS = [
  { id: "default-0900-1400", label: "09:00-14:00", start_time: "09:00", end_time: "14:00" },
  { id: "default-1130-1400", label: "11:30-14:00", start_time: "11:30", end_time: "14:00" },
  { id: "default-1200-1600", label: "12:00-16:00", start_time: "12:00", end_time: "16:00" },
  { id: "default-1400-2000", label: "14:00-20:00", start_time: "14:00", end_time: "20:00" },
  { id: "default-1400-2230", label: "14:00-22:30", start_time: "14:00", end_time: "22:30" },
  { id: "default-2030-2230", label: "20:30-22:30", start_time: "20:30", end_time: "22:30" }
];
const SCHEDULE_BREAK_PRESETS = [0, 15, 30, 45, 60];
const STAFF_SCHEDULE_PREFS_KEY = "qypos_staff_schedule_preferences";
function readStaffSchedulePreferences() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STAFF_SCHEDULE_PREFS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStaffSchedulePreferences(nextPrefs) {
  if (typeof window === "undefined") return;
  const current = readStaffSchedulePreferences();
  window.localStorage.setItem(STAFF_SCHEDULE_PREFS_KEY, JSON.stringify({ ...current, ...nextPrefs }));
}

function staffSchedulePreferenceSet(key) {
  const value = readStaffSchedulePreferences()[key];
  return new Set(Array.isArray(value) ? value.map(String).filter(Boolean) : []);
}

function staffSchedulePreferenceMode() {
  return readStaffSchedulePreferences().mode === "edit" ? "edit" : "view";
}

function staffSchedulePreferenceColor() {
  const color = readStaffSchedulePreferences().employeeColor;
  return SCHEDULE_COLORS.includes(color) ? color : SCHEDULE_COLORS[0];
}

function staffSchedulePreferenceCopiedCell() {
  const copiedCell = readStaffSchedulePreferences().copiedCell;
  if (!copiedCell || typeof copiedCell !== "object" || Array.isArray(copiedCell)) return null;
  if (copiedCell.is_off) {
    return {
      is_off: true,
      start_time: null,
      end_time: null,
      break_minutes: Number(copiedCell.break_minutes || 0),
      note: copiedCell.note ?? "",
      actual_start_time: null,
      actual_end_time: null,
      actual_break_minutes: 0,
      actual_note: ""
    };
  }
  if (!copiedCell.start_time || !copiedCell.end_time) return null;
  return {
    is_off: false,
    start_time: copiedCell.start_time,
    end_time: copiedCell.end_time,
    break_minutes: Number(copiedCell.break_minutes || 0),
    note: copiedCell.note ?? "",
    actual_start_time: null,
    actual_end_time: null,
    actual_break_minutes: 0,
    actual_note: ""
  };
}

function minutesFromClock(value) {
  if (!value) return null;
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function normalizeClockInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d]/g, "");
  if (/^\d{1,2}$/.test(compact)) return `${compact.padStart(2, "0")}:00`;
  if (/^\d{3,4}$/.test(compact)) return `${compact.slice(0, -2).padStart(2, "0")}:${compact.slice(-2)}`;
  const match = raw.match(/^(\d{1,2})[:：](\d{1,2})$/);
  if (!match) return raw;
  return `${match[1].padStart(2, "0")}:${match[2].padStart(2, "0")}`;
}

function scheduleHours(cell) {
  if (!cell || cell.is_off) return 0;
  return shiftHours(cell.start_time, cell.end_time, cell.break_minutes);
}

function shiftHours(startTime, endTime, breakMinutes = 0) {
  const start = minutesFromClock(startTime);
  const end = minutesFromClock(endTime);
  if (start === null || end === null) return 0;
  const duration = (end >= start ? end - start : end + 1440 - start) - Number(breakMinutes || 0);
  return Math.max(0, duration / 60);
}

function hasActualAttendance(cell) {
  return Boolean(cell?.actual_start_time && cell?.actual_end_time);
}

function actualHours(cell) {
  if (!hasActualAttendance(cell)) return 0;
  return shiftHours(cell.actual_start_time, cell.actual_end_time, cell.actual_break_minutes);
}

function effectiveScheduleHours(cell) {
  return hasActualAttendance(cell) ? actualHours(cell) : scheduleHours(cell);
}

function formatScheduleHours(value) {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded.toFixed(1)).replace(/\.0$/, "");
}

function formatScheduleCell(cell) {
  if (!cell) return "";
  if (cell.is_off) return "OFF";
  const hours = formatScheduleHours(scheduleHours(cell));
  return `${cell.start_time}-${cell.end_time}(${hours})`;
}

function formatActualCell(cell) {
  if (!hasActualAttendance(cell)) return "";
  const hours = formatScheduleHours(actualHours(cell));
  return `${cell.actual_start_time}-${cell.actual_end_time}(${hours})`;
}

function dateMonthDay(dateStr) {
  const [, month, day] = String(dateStr).split("-");
  return `${Number(month)}/${Number(day)}`;
}

function DayGanttView({ day, employees, cellByKey, locale, currency, onClose }) {
  const SLOT_MINUTES = 30;
  const DAY_START = 0;
  const DAY_END = 24 * 60;
  const totalRange = DAY_END - DAY_START;
  const toMin = (t) => t ? parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3, 5)) : null;
  const prevDay = addDays(day, -1);

  // Today's shifts, with continuation from previous day's overnight merged into same row
  const shifts = employees.map((emp) => {
    const cell = cellByKey.get(`${emp.id}:${day}`);
    const prevCell = cellByKey.get(`${emp.id}:${prevDay}`);
    // Check for continuation from previous day
    let contEnd = null;
    if (prevCell && !prevCell.is_off) {
      const ps = toMin(prevCell.start_time);
      const pe = toMin(prevCell.end_time);
      if (ps != null && pe != null && pe < ps) contEnd = pe; // overnight continues to today
    }
    if (!cell || cell.is_off) {
      // No shift today, but may have continuation
      if (contEnd != null) return { employee: emp, startMin: null, endMin: null, overnight: false, breakMin: 0, color: emp.color, contEnd };
      return null;
    }
    const s = toMin(cell.start_time);
    const e = toMin(cell.end_time);
    const overnight = s != null && e != null && e < s;
    return { employee: emp, startMin: s, endMin: e, overnight, breakMin: cell.break_minutes || 0, color: emp.color, contEnd };
  }).filter(Boolean);

  const [hoveredId, setHoveredId] = useState(null);
  const hoveredShift = hoveredId != null ? shifts.find((s) => s.employee.id === hoveredId) : null;

  function formatMin(min) {
    const h = Math.floor(((min % 1440) + 1440) % 1440 / 60);
    const m = ((min % 1440) + 1440) % 1440 % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function pct(min) { return Math.max(0, Math.min(100, ((min - DAY_START) / totalRange) * 100)); }

  // Build timeline slots with half-hour grid lines
  const timelineSlots = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) {
    if (m < DAY_END) timelineSlots.push({ min: m, isHour: true });
    if (m + 30 < DAY_END) timelineSlots.push({ min: m + 30, isHour: false });
  }
  // Add 24:00 tick at the end
  timelineSlots.push({ min: DAY_END, isHour: true, isEnd: true });

  // Current time indicator (only for today)
  const isToday = day === getLocalToday();
  const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : null;
  const showNow = nowMinutes != null && nowMinutes >= DAY_START && nowMinutes < DAY_END;

  return (
    <div className="schedule-gantt">
      <div className="schedule-gantt-header">
        <div>
          <h3>{dateMonthDay(day)} · {weekdayLabels(locale)[daysOfWeek(day)]}</h3>
        </div>
        <button type="button" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="schedule-gantt-body">
        <div className="schedule-gantt-timeline">
          {/* Half-hour grid lines */}
          {timelineSlots.map(({ min, isHour }) => (
            <div key={min} className={`schedule-gantt-gridline${isHour ? " hour" : ""}`} style={{ left: `${pct(min)}%` }} />
          ))}
          {/* Hour tick labels (on top of grid lines) */}
          {timelineSlots.filter((s) => s.isHour).map(({ min }) => (
            <div key={`tick-${min}`} className="schedule-gantt-slot" style={{ left: `${pct(min)}%`, width: "40px" }}>
              <span className="schedule-gantt-tick">{formatMin(min)}</span>
            </div>
          ))}
          {/* Current time indicator */}
          {showNow && (
            <div className="schedule-gantt-now" style={{ left: `${pct(nowMinutes)}%` }} />
          )}
        </div>
        {/* Guide line overlay — spans from timeline through all rows */}
        {hoveredShift && hoveredShift.startMin != null && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 180, right: 0, pointerEvents: "none", zIndex: 5 }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(hoveredShift.startMin)}%`, borderLeft: "2px dashed rgba(0,0,0,0.35)" }} />
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(hoveredShift.overnight ? DAY_END : hoveredShift.endMin)}%`, borderLeft: "2px dashed rgba(0,0,0,0.35)" }} />
          </div>
        )}
        {shifts.map((shift) => {
          const barW = shift.startMin != null
            ? shift.overnight
              ? Math.max(0.5, pct(DAY_END) - pct(shift.startMin))
              : Math.max(0.5, pct(shift.endMin) - pct(shift.startMin))
            : 0;
          const barL = shift.startMin != null ? pct(shift.startMin) : 0;
          return (
            <div key={shift.employee.id} className="schedule-gantt-row"
              onMouseEnter={() => setHoveredId(shift.employee.id)}
              onMouseLeave={() => setHoveredId(null)}>
              <div className="schedule-gantt-label" style={{ "--employee-color": shift.color }}>
                <span className="schedule-gantt-name">{shift.employee.name}</span>
                {shift.startMin != null && (
                  <span className="schedule-gantt-time">{formatMin(shift.startMin)}-{formatMin(shift.endMin)}{shift.overnight ? "+1" : ""}{shift.breakMin > 0 ? ` · ${shift.breakMin}min` : ""}</span>
                )}
              </div>
              <div className={`schedule-gantt-track${showNow ? " has-now" : ""}`} style={showNow ? { "--now-pct": `${pct(nowMinutes)}%` } : undefined}>
                {/* Current time indicator per-row */}
                {showNow && (
                  <div className="schedule-gantt-now" style={{ left: `${pct(nowMinutes)}%`, top: "-2px", bottom: "0" }} />
                )}
                {/* Continuation from previous day's overnight */}
                {shift.contEnd != null && (
                  <div className="schedule-gantt-bar schedule-gantt-continuation" style={{ left: "0%", width: `${pct(shift.contEnd)}%`, backgroundColor: shift.color, borderRadius: "0 6px 6px 0" }}
                    title={`${shift.employee.name}: 00:00-${formatMin(shift.contEnd)} (${t(locale, "接前日", "from prev day")})`}>
                    <span className="schedule-gantt-bar-text">00:00-{formatMin(shift.contEnd)}</span>
                  </div>
                )}
                {/* Today's shift */}
                {shift.startMin != null && !shift.overnight && (
                  <div
                    className="schedule-gantt-bar clickable"
                    style={{ left: `${barL}%`, width: `${barW}%`, backgroundColor: shift.color }}
                    title={`${shift.employee.name}: ${formatMin(shift.startMin)}-${formatMin(shift.endMin)}${shift.breakMin > 0 ? ` (${shift.breakMin}min ${t(locale, "休息", "break")})` : ""}`}
                  >
                    <span className="schedule-gantt-bar-text">
                      {formatMin(shift.startMin)}-{formatMin(shift.endMin)}
                      {shift.breakMin > 0 && ` · ${shift.breakMin}m`}
                    </span>
                    {/* Break period overlap indicator */}
                    {shift.breakMin > 0 && (
                      <div className="schedule-gantt-break" style={{
                        left: `${Math.max(0, (barW / 2) - (shift.breakMin / (shift.endMin - shift.startMin) * barW) / 2)}%`,
                        width: `${Math.min(barW * 0.35, (shift.breakMin / (shift.endMin - shift.startMin)) * barW)}%`
                      }} />
                    )}
                  </div>
                )}
                {shift.startMin != null && shift.overnight && (
                  <div className="schedule-gantt-bar clickable" style={{ left: `${barL}%`, width: `${barW}%`, backgroundColor: shift.color, borderRadius: "6px 0 0 6px" }}
                    title={`${shift.employee.name}: ${formatMin(shift.startMin)}→(${t(locale, "次日", "next day")}${formatMin(shift.endMin)})`}>
                    <span className="schedule-gantt-bar-text">{formatMin(shift.startMin)}→+1</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function daysOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay() === 0 ? 6 : new Date(`${dateStr}T00:00:00`).getDay() - 1;
}

function StaffScheduleView({ locale, currency, onNotify, canManage = false }) {
  const [weekStart, setWeekStart] = useState(mondayOf(getLocalToday()));
  const [data, setData] = useState({ employees: [], cells: [] });
  const [dailyRevenue, setDailyRevenue] = useState([]); // [{ day, revenue }, ...]
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("view");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeColor, setEmployeeColor] = useState(SCHEDULE_COLORS[0]);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [copiedCell, setCopiedCell] = useState(null);
  const [timePresets, setTimePresets] = useState(DEFAULT_SCHEDULE_TIME_PRESETS);
  const [excludedTotalEmployeeIds, setExcludedTotalEmployeeIds] = useState(() => new Set());
  const [autoCollapseQuietEmployees, setAutoCollapseQuietEmployees] = useState(false);
  const [manuallyHiddenEmployeeIds, setManuallyHiddenEmployeeIds] = useState(() => new Set());
  const [expandedQuietEmployeeIds, setExpandedQuietEmployeeIds] = useState(() => new Set());
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [showDailyTotal, setShowDailyTotal] = useState(true);
  const [showRevenue, setShowRevenue] = useState(true);
  const [showConversion, setShowConversion] = useState(true);
  const [showLaborRatio, setShowLaborRatio] = useState(true);
  const [expandedDay, setExpandedDay] = useState(null); // date string of expanded day for Gantt view
  const days = useMemo(() => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)), [weekStart]);
  const todayDateStr = useMemo(() => getLocalToday(), []);
  const cellByKey = useMemo(() => {
    const map = new Map();
    for (const cell of data.cells ?? []) map.set(`${cell.employee_id}:${cell.work_date}`, cell);
    return map;
  }, [data.cells]);
  const quietEmployeeIds = useMemo(() => {
    const ids = new Set();
    for (const employee of data.employees ?? []) {
      const hasWork = days.some((day) => {
        const cell = cellByKey.get(`${employee.id}:${day}`);
        return Boolean(cell && (!cell.is_off || hasActualAttendance(cell)));
      });
      if (!hasWork) ids.add(employee.id);
    }
    return ids;
  }, [cellByKey, data.employees, days]);
  const hiddenEmployees = useMemo(() => (data.employees ?? []).filter((employee) => {
    if (manuallyHiddenEmployeeIds.has(employee.id)) return true;
    return autoCollapseQuietEmployees && quietEmployeeIds.has(employee.id) && !expandedQuietEmployeeIds.has(employee.id);
  }), [autoCollapseQuietEmployees, data.employees, expandedQuietEmployeeIds, manuallyHiddenEmployeeIds, quietEmployeeIds]);
  const hiddenEmployeeIds = useMemo(() => new Set(hiddenEmployees.map((employee) => employee.id)), [hiddenEmployees]);
  const visibleEmployees = useMemo(
    () => (data.employees ?? []).filter((employee) => !hiddenEmployeeIds.has(employee.id)),
    [data.employees, hiddenEmployeeIds]
  );
  const countedEmployees = useMemo(
    () => (data.employees ?? []).filter((employee) => !excludedTotalEmployeeIds.has(employee.id)),
    [data.employees, excludedTotalEmployeeIds]
  );
  const totalsByEmployee = useMemo(() => {
    const map = new Map();
    for (const employee of data.employees ?? []) {
      const total = days.reduce((sum, day) => sum + effectiveScheduleHours(cellByKey.get(`${employee.id}:${day}`)), 0);
      map.set(employee.id, total);
    }
    return map;
  }, [cellByKey, data.employees, days]);
  const totalsByDay = useMemo(() => days.map((day) => {
    const total = countedEmployees.reduce((sum, employee) => sum + effectiveScheduleHours(cellByKey.get(`${employee.id}:${day}`)), 0);
    const cost = countedEmployees.reduce((sum, employee) => {
      const hours = effectiveScheduleHours(cellByKey.get(`${employee.id}:${day}`));
      return sum + hours * Number(employee.hourly_wage || 0);
    }, 0);
    return { day, total, cost };
  }), [cellByKey, countedEmployees, days]);
  const weekTotal = useMemo(() => totalsByDay.reduce((sum, item) => sum + item.total, 0), [totalsByDay]);
  const weekCost = useMemo(() => totalsByDay.reduce((sum, item) => sum + item.cost, 0), [totalsByDay]);

  const revenueByDay = useMemo(() => {
    const map = new Map(dailyRevenue.map((r) => [r.day, Number(r.revenue || 0)]));
    return days.map((day) => map.get(day) || 0);
  }, [dailyRevenue, days]);
  const weekRevenue = useMemo(() => revenueByDay.reduce((sum, v) => sum + v, 0), [revenueByDay]);
  const conversionByDay = useMemo(() => totalsByDay.map((item, i) => {
    return (item.total > 0 && revenueByDay[i] > 0) ? revenueByDay[i] / item.total : null;
  }), [totalsByDay, revenueByDay]);
  const weekConversion = useMemo(() => (weekTotal > 0 && weekRevenue > 0) ? weekRevenue / weekTotal : null, [weekRevenue, weekTotal]);

  const laborRatioByDay = useMemo(() => totalsByDay.map((item, i) => {
    return revenueByDay[i] > 0 ? (item.cost / revenueByDay[i]) * 100 : null;
  }), [totalsByDay, revenueByDay]);
  const weekLaborRatio = useMemo(() => weekRevenue > 0 ? (weekCost / weekRevenue) * 100 : null, [weekCost, weekRevenue]);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const schedule = await api(`/staff-schedules?week_start=${weekStart}`);
      setData(schedule);
      setDailyRevenue(schedule.daily_revenue || []);
      if (canManage) {
        const presets = await api("/staff-schedules/time-presets");
        setTimePresets(presets.length ? presets : DEFAULT_SCHEDULE_TIME_PRESETS);
      }
    } catch (error) {
      onNotify(error.message || t(locale, "排班加载失败", "Failed to load schedule"));
    } finally {
      setLoading(false);
    }
  }, [canManage, locale, onNotify, weekStart]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  useEffect(() => {
    if (!canManage && mode !== "view") {
      setMode("view");
      setEditingCell(null);
    }
  }, [canManage, mode]);

  useEffect(() => {
    if (!canManage) {
      setPreferencesReady(false);
      return;
    }
    setMode(staffSchedulePreferenceMode());
    setEmployeeColor(staffSchedulePreferenceColor());
    setCopiedCell(staffSchedulePreferenceCopiedCell());
    setAutoCollapseQuietEmployees(Boolean(readStaffSchedulePreferences().autoCollapseQuietEmployees));
    setShowDailyTotal(readStaffSchedulePreferences().showDailyTotal !== false);
    setShowRevenue(readStaffSchedulePreferences().showRevenue !== false);
    setShowConversion(readStaffSchedulePreferences().showConversion !== false);
    setShowLaborRatio(readStaffSchedulePreferences().showLaborRatio !== false);
    setExcludedTotalEmployeeIds(staffSchedulePreferenceSet("excludedTotalEmployeeIds"));
    setManuallyHiddenEmployeeIds(staffSchedulePreferenceSet("manuallyHiddenEmployeeIds"));
    setExpandedQuietEmployeeIds(staffSchedulePreferenceSet("expandedQuietEmployeeIds"));
    setPreferencesReady(true);
  }, [canManage]);

  useEffect(() => {
    // Only clean up stale IDs when employees are actually loaded (not empty initial state)
    if (!(data.employees ?? []).length) return;
    setExcludedTotalEmployeeIds((current) => {
      const activeIds = new Set((data.employees ?? []).map((employee) => employee.id));
      const next = new Set([...current].filter((id) => activeIds.has(id)));
      return next.size === current.size ? current : next;
    });
    setManuallyHiddenEmployeeIds((current) => {
      const activeIds = new Set((data.employees ?? []).map((employee) => employee.id));
      const next = new Set([...current].filter((id) => activeIds.has(id)));
      return next.size === current.size ? current : next;
    });
    setExpandedQuietEmployeeIds((current) => {
      const activeIds = new Set((data.employees ?? []).map((employee) => employee.id));
      const next = new Set([...current].filter((id) => activeIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [data.employees]);

  useEffect(() => {
    if (!canManage || !preferencesReady) return;
    writeStaffSchedulePreferences({
      mode,
      employeeColor,
      copiedCell,
      autoCollapseQuietEmployees,
      showDailyTotal,
      showRevenue,
      showConversion,
      showLaborRatio,
      excludedTotalEmployeeIds: [...excludedTotalEmployeeIds],
      manuallyHiddenEmployeeIds: [...manuallyHiddenEmployeeIds],
      expandedQuietEmployeeIds: [...expandedQuietEmployeeIds]
    });
  }, [
    autoCollapseQuietEmployees,
    canManage,
    copiedCell,
    employeeColor,
    excludedTotalEmployeeIds,
    expandedQuietEmployeeIds,
    manuallyHiddenEmployeeIds,
    mode,
    preferencesReady,
    showDailyTotal,
    showRevenue,
    showConversion,
    showLaborRatio
  ]);

  function toggleEmployeeInTotals(employeeId) {
    setExcludedTotalEmployeeIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function includeAllEmployeesInTotals() {
    setExcludedTotalEmployeeIds(new Set());
  }

  function hideEmployeeRow(employeeId) {
    setManuallyHiddenEmployeeIds((current) => {
      const next = new Set(current);
      next.add(employeeId);
      return next;
    });
    setExpandedQuietEmployeeIds((current) => {
      const next = new Set(current);
      next.delete(employeeId);
      return next;
    });
  }

  function showEmployeeRow(employee) {
    setManuallyHiddenEmployeeIds((current) => {
      const next = new Set(current);
      next.delete(employee.id);
      return next;
    });
    if (quietEmployeeIds.has(employee.id)) {
      setExpandedQuietEmployeeIds((current) => {
        const next = new Set(current);
        next.add(employee.id);
        return next;
      });
    }
  }

  function showAllEmployeeRows() {
    setManuallyHiddenEmployeeIds(new Set());
    setExpandedQuietEmployeeIds(new Set((data.employees ?? []).map((employee) => employee.id)));
  }

  function openEmployeeEditor(employee) {
    if (!canManage || mode !== "edit") return;
    setEditingEmployee({
      id: employee.id,
      name: employee.name,
      color: employee.color,
      hourly_wage: employee.hourly_wage ?? 0,
      sort_order: employee.sort_order ?? 0,
      hidden: hiddenEmployeeIds.has(employee.id)
    });
  }

  async function saveEmployeeEditor(event) {
    event.preventDefault();
    const name = String(editingEmployee.name ?? "").trim();
    if (!name) return;
    await api(`/staff-schedules/employees/${editingEmployee.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        color: editingEmployee.color,
        hourly_wage: Number(editingEmployee.hourly_wage || 0),
        sort_order: Number(editingEmployee.sort_order || 0)
      })
    });
    setEditingEmployee(null);
    await loadSchedule();
    onNotify(t(locale, "员工设置已保存", "Staff settings saved"));
  }

  async function deleteEmployeeFromEditor() {
    const employee = data.employees.find((item) => item.id === editingEmployee.id);
    if (!employee) return;
    const deleted = await deleteEmployee(employee);
    if (deleted) setEditingEmployee(null);
  }

  function toggleEmployeeEditorVisibility() {
    if (editingEmployee.hidden) {
      const employee = data.employees.find((item) => item.id === editingEmployee.id);
      if (employee) showEmployeeRow(employee);
      setEditingEmployee({ ...editingEmployee, hidden: false });
    } else {
      hideEmployeeRow(editingEmployee.id);
      setEditingEmployee({ ...editingEmployee, hidden: true });
    }
  }

  async function addEmployee(event) {
    event.preventDefault();
    if (!canManage || mode !== "edit") return;
    const name = employeeName.trim();
    if (!name) return;
    await api("/staff-schedules/employees", {
      method: "POST",
      body: JSON.stringify({ name, color: employeeColor, hourly_wage: 0, sort_order: data.employees.length + 1 })
    });
    setEmployeeName("");
    await loadSchedule();
    onNotify(t(locale, "员工行已添加", "Staff row added"));
  }

  async function renameEmployee(employee) {
    if (!canManage || mode !== "edit") return;
    const nextName = window.prompt(t(locale, "员工姓名", "Staff name"), employee.name);
    if (!nextName || !nextName.trim()) return;
    await api(`/staff-schedules/employees/${employee.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: nextName.trim() })
    });
    await loadSchedule();
    onNotify(t(locale, "员工行已更新", "Staff row updated"));
  }

  async function deleteEmployee(employee) {
    if (!canManage || mode !== "edit") return;
    if (!window.confirm(t(locale, `删除 ${employee.name} 这一行？`, `Delete ${employee.name}?`))) return false;
    await api(`/staff-schedules/employees/${employee.id}`, { method: "DELETE" });
    await loadSchedule();
    onNotify(t(locale, "员工行已删除", "Staff row deleted"));
    return true;
  }

  function openCell(employee, workDate) {
    if (!canManage || mode !== "edit") return;
    skipNextAutoSaveRef.current = true;
    const existing = cellByKey.get(`${employee.id}:${workDate}`);
    setEditingCell({
      employee,
      work_date: workDate,
      is_off: existing?.is_off ?? false,
      start_time: existing?.start_time ?? "14:00",
      end_time: existing?.end_time ?? "20:00",
      break_minutes: existing?.break_minutes ?? 0,
      note: existing?.note ?? "",
      actual_enabled: hasActualAttendance(existing),
      actual_start_time: existing?.actual_start_time ?? existing?.start_time ?? "14:00",
      actual_end_time: existing?.actual_end_time ?? existing?.end_time ?? "20:00",
      actual_break_minutes: existing?.actual_break_minutes ?? existing?.break_minutes ?? 0,
      actual_note: existing?.actual_note ?? "",
      hasValue: Boolean(existing)
    });
  }

  function payloadFromCell(cell) {
    if (!cell) return null;
    return {
      is_off: Boolean(cell.is_off),
      start_time: cell.is_off ? null : normalizeClockInput(cell.start_time),
      end_time: cell.is_off ? null : normalizeClockInput(cell.end_time),
      break_minutes: Number(cell.break_minutes || 0),
      note: cell.note ?? "",
      actual_start_time: cell.actual_enabled ? normalizeClockInput(cell.actual_start_time) : null,
      actual_end_time: cell.actual_enabled ? normalizeClockInput(cell.actual_end_time) : null,
      actual_break_minutes: cell.actual_enabled ? Number(cell.actual_break_minutes || 0) : 0,
      actual_note: cell.actual_enabled ? (cell.actual_note ?? "") : ""
    };
  }

  async function saveCellPayload(employee, workDate, payload) {
    await api("/staff-schedules/cells", {
      method: "PUT",
      body: JSON.stringify({
        employee_id: employee.id,
        work_date: workDate,
        ...payload
      })
    });
  }

  // ── Auto-save for cell editor ──────────────────────────────────────────
  const autoSaveTimerRef = useRef(null);
  const skipNextAutoSaveRef = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState("");

  useEffect(() => {
    if (!editingCell) return;
    if (skipNextAutoSaveRef.current) { skipNextAutoSaveRef.current = false; return; }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveCellPayload(editingCell.employee, editingCell.work_date, payloadFromCell(editingCell));
        setAutoSaveStatus(t(locale, "✓ 已自动保存", "✓ Auto-saved"));
        setTimeout(() => setAutoSaveStatus(""), 1500);
        const schedule = await api(`/staff-schedules?week_start=${weekStart}`);
        setData(schedule);
      } catch (err) {
        setAutoSaveStatus(t(locale, "自动保存失败", "Auto-save failed"));
        onNotify(err.message || "Auto-save failed");
      }
    }, 800);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [editingCell]);

  function closeCellEditor() {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (editingCell) {
      saveCellPayload(editingCell.employee, editingCell.work_date, payloadFromCell(editingCell))
        .then(() => loadSchedule())
        .catch((err) => onNotify(err.message));
    }
    setEditingCell(null);
  }

  async function saveCell(event) {
    event.preventDefault();
    await saveCellPayload(editingCell.employee, editingCell.work_date, payloadFromCell(editingCell));
    setEditingCell(null);
    await loadSchedule();
    onNotify(t(locale, "排班单元格已保存", "Schedule cell saved"));
  }

  function copyCell(cell) {
    const payload = {
      is_off: Boolean(cell.is_off),
      start_time: cell.is_off ? null : normalizeClockInput(cell.start_time),
      end_time: cell.is_off ? null : normalizeClockInput(cell.end_time),
      break_minutes: Number(cell.break_minutes || 0),
      note: cell.note ?? "",
      actual_start_time: null,
      actual_end_time: null,
      actual_break_minutes: 0,
      actual_note: ""
    };
    if (!payload) return;
    setCopiedCell(payload);
    onNotify(t(locale, "已复制这个单元格", "Cell copied"));
  }

  async function pasteCell(employee, workDate) {
    if (!copiedCell) return;
    await saveCellPayload(employee, workDate, copiedCell);
    await loadSchedule();
    onNotify(t(locale, "已粘贴到目标单元格", "Cell pasted"));
  }

  async function addCurrentTimePreset() {
    const startTime = normalizeClockInput(editingCell.start_time);
    const endTime = normalizeClockInput(editingCell.end_time);
    if (!startTime || !endTime) return;
    const preset = await api("/staff-schedules/time-presets", {
      method: "POST",
      body: JSON.stringify({
        label: `${startTime}-${endTime}`,
        start_time: startTime,
        end_time: endTime,
        sort_order: timePresets.length + 1
      })
    });
    setTimePresets((presets) => {
      const withoutDuplicate = presets.filter((item) => item.id !== preset.id && !(item.start_time === preset.start_time && item.end_time === preset.end_time));
      return [...withoutDuplicate, preset].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    });
    onNotify(t(locale, "时间段预设已保存", "Time preset saved"));
  }

  async function deleteTimePreset(preset) {
    if (String(preset.id).startsWith("default-")) {
      setTimePresets((presets) => presets.filter((item) => item.id !== preset.id));
      return;
    }
    await api(`/staff-schedules/time-presets/${preset.id}`, { method: "DELETE" });
    setTimePresets((presets) => presets.filter((item) => item.id !== preset.id));
    onNotify(t(locale, "时间段预设已删除", "Time preset deleted"));
  }

  async function clearCell() {
    await api("/staff-schedules/cells", {
      method: "PUT",
      body: JSON.stringify({ employee_id: editingCell.employee.id, work_date: editingCell.work_date, clear: true })
    });
    setEditingCell(null);
    await loadSchedule();
    onNotify(t(locale, "排班单元格已清空", "Schedule cell cleared"));
  }

  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="staff-schedule">
      <div className="schedule-toolbar">
        <div>
          <h2>{dateMonthDay(weekStart)} - {dateMonthDay(weekEnd)}</h2>
        </div>
        <div className="schedule-actions">
          {canManage && (
            <div className="schedule-mode-toggle" role="group" aria-label={t(locale, "排班模式", "Schedule mode")}>
              <button type="button" className={mode === "view" ? "selected" : ""} onClick={() => { setMode("view"); setEditingCell(null); }}><Eye size={16} /><span>{t(locale, "展示", "View")}</span></button>
              <button type="button" className={mode === "edit" ? "selected" : ""} onClick={() => setMode("edit")}><Pencil size={16} /><span>{t(locale, "编辑", "Edit")}</span></button>
            </div>
          )}
          <div className="schedule-week-nav">
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronRight className="flip-icon" size={16} /><span>{t(locale, "上一周", "Previous")}</span></button>
            <input type="date" value={weekStart} onChange={(event) => setWeekStart(mondayOf(event.target.value))} />
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))}><span>{t(locale, "下一周", "Next")}</span><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {canManage && mode === "edit" && (
        <>
          <form className="schedule-employee-form" onSubmit={addEmployee}>
            <input value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder={t(locale, "添加员工姓名", "Add staff name")} />
            <div className="schedule-swatches" role="group" aria-label={t(locale, "姓名颜色", "Name color")}>
              {SCHEDULE_COLORS.map((color) => (
                <button key={color} type="button" className={employeeColor === color ? "selected" : ""} style={{ "--swatch": color }} onClick={() => setEmployeeColor(color)} aria-label={color} />
              ))}
            </div>
            {copiedCell && <span className="schedule-copy-chip"><Copy size={14} />{formatScheduleCell(copiedCell)}</span>}
            <button className="primary" type="submit"><Plus size={16} /><span>{t(locale, "添加行", "Add row")}</span></button>
          </form>
          {!!data.employees.length && (
            <div className="schedule-row-visibility">
              {!!hiddenEmployees.length && (
                <div className="schedule-hidden-list">
                  <strong>{t(locale, "已隐藏", "Hidden")}</strong>
                  {hiddenEmployees.map((employee) => (
                    <button key={employee.id} type="button" className="schedule-employee-pill" style={{ "--employee-color": employee.color }} onClick={() => showEmployeeRow(employee)}>
                      <span className="schedule-filter-dot" style={{ backgroundColor: employee.color }} />
                      <span>{employee.name}</span>
                    </button>
                  ))}
                  <button type="button" onClick={showAllEmployeeRows}>{t(locale, "全部展开", "Show all")}</button>
                </div>
              )}
            </div>
          )}
          {!!data.employees.length && (
            <div className="schedule-total-filter">
              <div className="schedule-total-filter-head">
                <strong>{t(locale, "每日合计统计人员", "Daily total staff")}</strong>
                <button type="button" onClick={includeAllEmployeesInTotals}>{t(locale, "全部统计", "Include all")}</button>
              </div>
              <div className="schedule-total-filter-list">
                {data.employees.map((employee) => {
                  const included = !excludedTotalEmployeeIds.has(employee.id);
                  return (
                    <button key={employee.id} type="button" className={`schedule-employee-pill ${included ? "included" : "excluded"}`} style={{ "--employee-color": employee.color }} onClick={() => toggleEmployeeInTotals(employee.id)}>
                      <span className="schedule-filter-dot" style={{ backgroundColor: employee.color }} />
                      <span>{employee.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="schedule-summary-toggles">
            <label className="schedule-visibility-toggle"><input type="checkbox" checked={autoCollapseQuietEmployees} onChange={(e) => setAutoCollapseQuietEmployees(e.target.checked)} /><span>{t(locale, "自动折叠空/OFF", "Auto hide empty")}</span></label>
            <label className="schedule-visibility-toggle"><input type="checkbox" checked={showDailyTotal} onChange={(e) => setShowDailyTotal(e.target.checked)} /><span>{t(locale, "每日合计", "Daily total")}</span></label>
            <label className="schedule-visibility-toggle"><input type="checkbox" checked={showRevenue} onChange={(e) => setShowRevenue(e.target.checked)} /><span>{t(locale, "营业额", "Revenue")}</span></label>
            <label className="schedule-visibility-toggle"><input type="checkbox" checked={showConversion} onChange={(e) => setShowConversion(e.target.checked)} /><span>{t(locale, "工时转化率", "Rev/Hour")}</span></label>
            <label className="schedule-visibility-toggle"><input type="checkbox" checked={showLaborRatio} onChange={(e) => setShowLaborRatio(e.target.checked)} /><span>{t(locale, "工资占比", "Labor %")}</span></label>
          </div>
        </>
      )}

      {!expandedDay && (
      <div className="schedule-sheet-wrap">
        <table className="schedule-sheet">
          <thead>
            <tr>
              <th className="schedule-name-col">{t(locale, "姓名 (Name)", "Name")}</th>
              {days.map((day, idx) => (
                <th key={day} className={`${day === todayDateStr ? "is-today" : ""} ${mode === "view" ? "clickable" : ""}`} onClick={() => { if (mode === "view") setExpandedDay(expandedDay === day ? null : day); }}>
                  <strong>{weekdayLabels(locale)[idx]}</strong>
                  <span>{dateMonthDay(day)}</span>
                </th>
              ))}
              {canManage && <th>{t(locale, "合计", "Total")}</th>}
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((employee) => (
              <tr key={employee.id}>
                <th className="schedule-name-col schedule-employee-name-col" style={{ "--employee-color": employee.color }}>
                  <button type="button" className="schedule-name-edit-button" onClick={() => openEmployeeEditor(employee)} disabled={mode !== "edit" || !canManage}>
                    <span>{employee.name}</span>
                    {mode === "edit" && canManage && <Pencil size={14} />}
                  </button>
                </th>
                {days.map((day) => {
                  const cell = cellByKey.get(`${employee.id}:${day}`);
                  return (
                    <td key={day} className={day === todayDateStr ? "is-today" : ""}>
                      <div className={`schedule-cell-frame ${mode === "edit" ? "is-editing" : ""}`}>
                        <button type="button" className={`schedule-cell ${cell?.is_off ? "is-off" : cell ? "has-shift" : ""}`} onClick={() => openCell(employee, day)} disabled={mode !== "edit"}>
                          {cell ? (
                            <>
                              <span className={`schedule-plan-line ${hasActualAttendance(cell) ? "has-actual" : ""}`}>{formatScheduleCell(cell)}</span>
                              {hasActualAttendance(cell) && <span className="schedule-actual-line">{t(locale, "实到", "Actual")} {formatActualCell(cell)}</span>}
                            </>
                          ) : <span className="schedule-empty-cell">{mode === "edit" ? "+" : ""}</span>}
                        </button>
                        {mode === "edit" && (
                          <div className="schedule-cell-tools">
                            {cell && <button type="button" title={t(locale, "复制", "Copy")} onClick={() => copyCell(cell)}><Copy size={13} /></button>}
                            {copiedCell && <button type="button" title={t(locale, "粘贴", "Paste")} onClick={() => pasteCell(employee, day)}><Save size={13} /></button>}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
                {canManage && (
                  <td className="schedule-total">
                    <span className="schedule-total-plan">{formatScheduleHours(totalsByEmployee.get(employee.id))}</span>
                  </td>
                )}
              </tr>
            ))}
            {!data.employees.length && (
              <tr><td className="empty" colSpan={canManage ? 9 : 8}>{loading ? t(locale, "加载中…", "Loading...") : t(locale, "先添加员工行，再点击单元格填写时间。", "Add staff rows, then click cells to enter shifts.")}</td></tr>
            )}
            {!!data.employees.length && !visibleEmployees.length && (
              <tr><td className="empty" colSpan={canManage ? 9 : 8}>{t(locale, "当前员工行已全部折叠，点击上方已隐藏姓名可恢复。", "All staff rows are hidden. Use the hidden staff chips above to restore rows.")}</td></tr>
            )}
          </tbody>
          {canManage && (
            <tfoot>
              {showDailyTotal && (
              <tr>
                <th className="schedule-name-col schedule-day-total-label">
                  <span>{t(locale, "每日合计", "Daily total")}</span>
                  <small>{countedEmployees.length}/{data.employees.length || 0}</small>
                </th>
                {totalsByDay.map((item) => (
                <td key={item.day} className={`schedule-day-total ${item.day === todayDateStr ? "is-today" : ""}`}>
                  <span className="schedule-total-plan">{formatScheduleHours(item.total)}</span>
                  <span className="schedule-total-cost">{money(item.cost, currency, locale)}</span>
                </td>
              ))}
              <td className="schedule-total schedule-week-total">
                <span className="schedule-total-plan">{formatScheduleHours(weekTotal)}</span>
                <span className="schedule-total-cost">{money(weekCost, currency, locale)}</span>
              </td>
              </tr>
              )}
              {showRevenue && (
              <tr>
                <th className="schedule-name-col schedule-day-total-label">
                  <span>{t(locale, "营业额", "Revenue")}</span>
                </th>
                {revenueByDay.map((rev, i) => (
                <td key={i} className={`schedule-day-total ${days[i] === todayDateStr ? "is-today" : ""}`}>
                  <span className="schedule-total-plan">{money(rev, currency, locale)}</span>
                </td>
                ))}
                <td className="schedule-total schedule-week-total">
                  <span className="schedule-total-plan">{money(weekRevenue, currency, locale)}</span>
                </td>
              </tr>
              )}
              {showConversion && (
              <tr>
                <th className="schedule-name-col schedule-day-total-label">
                  <span>{t(locale, "工时转化率", "Rev/Hour")}</span>
                </th>
                {conversionByDay.map((rate, i) => (
                <td key={i} className={`schedule-day-total ${days[i] === todayDateStr ? "is-today" : ""}`}>
                  <span className="schedule-total-plan">{rate != null ? `${money(rate, currency, locale)}/h` : "—"}</span>
                </td>
                ))}
                <td className="schedule-total schedule-week-total">
                  <span className="schedule-total-plan">{weekConversion != null ? `${money(weekConversion, currency, locale)}/h` : "—"}</span>
                </td>
              </tr>
              )}
              {showLaborRatio && (
              <tr>
                <th className="schedule-name-col schedule-day-total-label">
                  <span>{t(locale, "工资占比", "Labor %")}</span>
                </th>
                {laborRatioByDay.map((ratio, i) => (
                <td key={i} className={`schedule-day-total ${days[i] === todayDateStr ? "is-today" : ""}`}>
                  <span className="schedule-total-plan">{ratio != null ? `${ratio.toFixed(1)}%` : "—"}</span>
                </td>
                ))}
                <td className="schedule-total schedule-week-total">
                  <span className="schedule-total-plan">{weekLaborRatio != null ? `${weekLaborRatio.toFixed(1)}%` : "—"}</span>
                </td>
              </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>
      )}

      {expandedDay && mode === "view" && (
        <DayGanttView
          day={expandedDay}
          employees={visibleEmployees}
          cellByKey={cellByKey}
          locale={locale}
          currency={currency}
          onClose={() => setExpandedDay(null)}
        />
      )}

      {editingCell && (
        <div className="modal-backdrop">
          <form className="modal schedule-modal" onSubmit={saveCell}>
            <div className="modal-header">
              <div>
                <h2>{editingCell.employee.name}</h2>
                <p>{dateMonthDay(editingCell.work_date)} · {weekdayLabels(locale)[days.indexOf(editingCell.work_date)]}</p>
              </div>
              <button type="button" onClick={closeCellEditor}><X size={18} /></button>
            </div>
            <label className="schedule-off-toggle">
              <input type="checkbox" checked={editingCell.is_off} onChange={(event) => setEditingCell({ ...editingCell, is_off: event.target.checked })} />
              <span>OFF</span>
            </label>
            {!editingCell.is_off && (
              <>
                <div className="schedule-quick-row">
                  {timePresets.map((preset) => (
                    <span key={preset.id} className="schedule-preset-pill">
                      <button type="button" onClick={() => setEditingCell({ ...editingCell, start_time: preset.start_time, end_time: preset.end_time })}>{preset.label || `${preset.start_time}-${preset.end_time}`}</button>
                      <button type="button" className="schedule-preset-delete" title={t(locale, "删除预设", "Delete preset")} onClick={() => deleteTimePreset(preset)}><X size={12} /></button>
                    </span>
                  ))}
                  <button type="button" className="schedule-save-preset" onClick={addCurrentTimePreset}><Plus size={14} />{t(locale, "保存当前", "Save current")}</button>
                </div>
                <div className="schedule-time-grid">
                  <label>{t(locale, "开始时间", "Start")}<input type="time" step="900" value={normalizeClockInput(editingCell.start_time)} onChange={(event) => setEditingCell({ ...editingCell, start_time: event.target.value })} /></label>
                  <label>{t(locale, "结束时间", "End")}<input type="time" step="900" value={normalizeClockInput(editingCell.end_time)} onChange={(event) => setEditingCell({ ...editingCell, end_time: event.target.value })} /></label>
                  <label>{t(locale, "休息分钟", "Break minutes")}<input type="number" min="0" step="5" value={editingCell.break_minutes} onChange={(event) => setEditingCell({ ...editingCell, break_minutes: event.target.value })} /></label>
                  <div className="schedule-break-presets">
                    {SCHEDULE_BREAK_PRESETS.map((minutes) => (
                      <button key={minutes} type="button" className={Number(editingCell.break_minutes || 0) === minutes ? "selected" : ""} onClick={() => setEditingCell({ ...editingCell, break_minutes: minutes })}>{minutes}m</button>
                    ))}
                  </div>
                  <div className="schedule-preview">{formatScheduleCell({ ...editingCell, start_time: normalizeClockInput(editingCell.start_time), end_time: normalizeClockInput(editingCell.end_time) })}</div>
                </div>
              </>
            )}
            <div className="schedule-actual-panel">
              <label className="schedule-off-toggle">
                <input type="checkbox" checked={Boolean(editingCell.actual_enabled)} onChange={(event) => setEditingCell({
                  ...editingCell,
                  actual_enabled: event.target.checked,
                  actual_start_time: event.target.checked ? (editingCell.actual_start_time || editingCell.start_time || "14:00") : editingCell.actual_start_time,
                  actual_end_time: event.target.checked ? (editingCell.actual_end_time || editingCell.end_time || "20:00") : editingCell.actual_end_time
                })} />
                <span>{t(locale, "记录实际到班", "Record actual attendance")}</span>
              </label>
              {editingCell.actual_enabled && (
                <>
                  <div className="schedule-time-grid">
                    <label>{t(locale, "实际开始", "Actual start")}<input type="time" step="900" value={normalizeClockInput(editingCell.actual_start_time)} onChange={(event) => setEditingCell({ ...editingCell, actual_start_time: event.target.value })} /></label>
                    <label>{t(locale, "实际结束", "Actual end")}<input type="time" step="900" value={normalizeClockInput(editingCell.actual_end_time)} onChange={(event) => setEditingCell({ ...editingCell, actual_end_time: event.target.value })} /></label>
                    <label>{t(locale, "实际休息分钟", "Actual break")}<input type="number" min="0" step="5" value={editingCell.actual_break_minutes} onChange={(event) => setEditingCell({ ...editingCell, actual_break_minutes: event.target.value })} /></label>
                    <div className="schedule-break-presets">
                      {SCHEDULE_BREAK_PRESETS.map((minutes) => (
                        <button key={minutes} type="button" className={Number(editingCell.actual_break_minutes || 0) === minutes ? "selected" : ""} onClick={() => setEditingCell({ ...editingCell, actual_break_minutes: minutes })}>{minutes}m</button>
                      ))}
                    </div>
                    <div className="schedule-preview schedule-actual-preview">{t(locale, "实际", "Actual")} {formatActualCell({
                      actual_start_time: normalizeClockInput(editingCell.actual_start_time),
                      actual_end_time: normalizeClockInput(editingCell.actual_end_time),
                      actual_break_minutes: editingCell.actual_break_minutes
                    })}</div>
                  </div>
                  <label>{t(locale, "实际备注", "Actual note")}<input value={editingCell.actual_note} onChange={(event) => setEditingCell({ ...editingCell, actual_note: event.target.value })} /></label>
                </>
              )}
            </div>
            <label>{t(locale, "备注", "Note")}<input value={editingCell.note} onChange={(event) => setEditingCell({ ...editingCell, note: event.target.value })} /></label>
            <div className="modal-footer">
              {autoSaveStatus && <span className="schedule-autosave-status">{autoSaveStatus}</span>}
              <button type="button" onClick={() => copyCell(editingCell)}><Copy size={16} /><span>{t(locale, "复制", "Copy")}</span></button>
              <button type="button" onClick={clearCell}><Eraser size={16} /><span>{t(locale, "清空", "Clear")}</span></button>
              <button className="primary" type="submit"><Save size={16} /><span>{t(locale, "保存", "Save")}</span></button>
            </div>
          </form>
        </div>
      )}

      {editingEmployee && (
        <div className="modal-backdrop">
          <form className="modal schedule-modal" onSubmit={saveEmployeeEditor}>
            <div className="modal-header">
              <div>
                <h2>{t(locale, "员工设置", "Staff settings")}</h2>
                <p>{editingEmployee.name}</p>
              </div>
              <button type="button" onClick={() => setEditingEmployee(null)}><X size={18} /></button>
            </div>
            <div className="schedule-employee-editor-grid">
              <label>{t(locale, "姓名", "Name")}<input value={editingEmployee.name} onChange={(event) => setEditingEmployee({ ...editingEmployee, name: event.target.value })} autoFocus /></label>
              <label>{t(locale, "时薪", "Hourly wage")}<input type="number" min="0" step="0.01" value={editingEmployee.hourly_wage} onChange={(event) => setEditingEmployee({ ...editingEmployee, hourly_wage: event.target.value })} /></label>
              <label>{t(locale, "排序", "Sort order")}<input type="number" step="1" value={editingEmployee.sort_order} onChange={(event) => setEditingEmployee({ ...editingEmployee, sort_order: event.target.value })} /></label>
            </div>
            <div className="schedule-editor-section">
              <strong>{t(locale, "姓名颜色", "Name color")}</strong>
              <div className="schedule-swatches" role="group" aria-label={t(locale, "姓名颜色", "Name color")}>
                {SCHEDULE_COLORS.map((color) => (
                  <button key={color} type="button" className={editingEmployee.color === color ? "selected" : ""} style={{ "--swatch": color }} onClick={() => setEditingEmployee({ ...editingEmployee, color })} aria-label={color} />
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={toggleEmployeeEditorVisibility}>{editingEmployee.hidden ? <Eye size={16} /> : <EyeOff size={16} />}<span>{editingEmployee.hidden ? t(locale, "显示此行", "Show row") : t(locale, "隐藏此行", "Hide row")}</span></button>
              <button type="button" className="danger" onClick={deleteEmployeeFromEditor}><Trash2 size={16} /><span>{t(locale, "删除员工", "Delete staff")}</span></button>
              <button className="primary" type="submit"><Save size={16} /><span>{t(locale, "保存", "Save")}</span></button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

