const MINUTE_MS = 60 * 1000;

function clockMinutes(value) {
  if (!value) return null;
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function dateAtClock(workDate, clock) {
  const [year, month, day] = String(workDate).split("-").map(Number);
  const minutes = clockMinutes(clock);
  if (![year, month, day, minutes].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

export function elapsedShiftHours(cell, workDate, now = new Date()) {
  if (!cell || cell.actual_is_off) return 0;

  const hasActualTimes = Boolean(cell.actual_start_time && cell.actual_end_time);
  if (!hasActualTimes && cell.is_off) return 0;

  const startTime = hasActualTimes ? cell.actual_start_time : cell.start_time;
  const endTime = hasActualTimes ? cell.actual_end_time : cell.end_time;
  const breakMinutes = Number(hasActualTimes ? cell.actual_break_minutes : cell.break_minutes) || 0;
  const start = dateAtClock(workDate, startTime);
  const end = dateAtClock(workDate, endTime);
  const current = now instanceof Date ? now : new Date(now);
  if (!start || !end || Number.isNaN(current.getTime())) return 0;

  const startMinutes = clockMinutes(startTime);
  const endMinutes = clockMinutes(endTime);
  if (endMinutes < startMinutes) end.setDate(end.getDate() + 1);

  const grossMinutes = (end.getTime() - start.getTime()) / MINUTE_MS;
  if (grossMinutes <= 0 || current <= start) return 0;

  const elapsedMinutes = Math.min(grossMinutes, (current.getTime() - start.getTime()) / MINUTE_MS);
  const paidMinutes = Math.max(0, grossMinutes - Math.max(0, breakMinutes));
  return (elapsedMinutes / grossMinutes) * paidMinutes / 60;
}

export function hasScheduleDayStarted(workDate, now = new Date()) {
  const start = dateAtClock(workDate, "00:00");
  const current = now instanceof Date ? now : new Date(now);
  return Boolean(start && !Number.isNaN(current.getTime()) && current >= start);
}

export function averageMetric(values) {
  const available = values.filter((value) => Number.isFinite(value));
  if (!available.length) return null;
  return available.reduce((sum, value) => sum + value, 0) / available.length;
}
