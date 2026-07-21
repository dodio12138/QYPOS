"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";

export default function MetricCard({ title, value, deltaPercent = null, changeText = "", compareText = "", icon: Icon }) {
  const trendClass = deltaPercent == null ? "flat" : deltaPercent >= 0 ? "up" : "down";
  const TrendIcon = deltaPercent == null ? Minus : deltaPercent >= 0 ? TrendingUp : TrendingDown;
  const percentText = deltaPercent == null ? "0%" : `${deltaPercent >= 0 ? "+" : ""}${deltaPercent}%`;

  return (
    <section className="metric metric-card">
      <div className="metric-card-head">
        <span className="metric-card-title">
          {Icon && <Icon size={18} />}
          <span>{title}</span>
        </span>
        <span className={`metric-card-trend ${trendClass}`}>
          <TrendIcon size={15} />
          <span>{percentText}</span>
        </span>
      </div>
      <div className="metric-card-body">
        <strong>{value}</strong>
        <span className={`metric-card-change ${trendClass}`}>
          {changeText && <b>{changeText}</b>}
          {compareText && <small>{compareText}</small>}
        </span>
      </div>
    </section>
  );
}
