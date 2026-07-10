"use client";

export { api, API_URL, labelOf } from "../../../lib/api";

export function t(locale, zh, en) { return locale === "en-GB" ? en : zh; }
export function money(value, currency = "CNY", locale = "zh-CN") { return new Intl.NumberFormat(locale,{style:"currency",currency}).format(Number(value||0)); }

export function getLocalToday() { try { const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"Europe/London"; return new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); } catch { return new Date().toISOString().slice(0,10); } }
export function formatDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
export function addDays(s,d) { const dt=new Date(`${s}T00:00:00`); dt.setDate(dt.getDate()+d); return formatDateStr(dt); }
export function addYears(s,d) { const dt=new Date(`${s}T00:00:00`); dt.setFullYear(dt.getFullYear()+d); return formatDateStr(dt); }
export function mondayOf(s) { const d=new Date(`${s}T00:00:00`); return addDays(s,-((d.getDay()+6)%7)); }
export function daySpan(a,b) { return Math.round((new Date(`${b}T00:00:00`)-new Date(`${a}T00:00:00`))/86400000)+1; }
export function pctDelta(c,p) { const cn=Number(c||0),pn=Number(p||0); if(!pn) return null; return Math.round(((cn-pn)/pn)*1000)/10; }
export function weekdayLabels(l) { return l==="en-GB"?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:["星期一","星期二","星期三","星期四","星期五","星期六","星期日"]; }
export function formatClockMinute(t) { const n=((Number(t)%1440)+1440)%1440; return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`; }
