export const LOTTERY_SPIN_MS = 10000;

export function lotteryDrawPayload(state, idempotencyKey) {
  return {
    ticket_id: state?.payload?.ticketId || state?.payload?.ticket_id || null,
    action_token: state?.payload?.actionToken || state?.payload?.action_token || null,
    revision: Number(state?.revision || 0),
    idempotency_key: idempotencyKey
  };
}

export function lotteryPresentationPhase(state, revealedRevision) {
  if (state?.mode === "lottery_spinning") return "drawing";
  if (state?.mode === "lottery_result") {
    return Number(revealedRevision) === Number(state.revision) ? "result" : "drawing";
  }
  return state?.mode || "idle";
}

export function lotteryWheelRotation(mode, spinning, targetAngle) {
  const target = Number.isFinite(Number(targetAngle)) ? Number(targetAngle) : 0;
  if (mode === "lottery_result" || spinning) return 2880 + target;
  return 0;
}

export function lotteryTickSchedule(durationMs = LOTTERY_SPIN_MS) {
  const duration = Math.max(1000, Number(durationMs) || LOTTERY_SPIN_MS);
  const times = [];
  let elapsed = 90;
  while (elapsed < duration - 320) {
    const progress = elapsed / duration;
    let interval;
    if (progress < 0.18) interval = 170 - (progress / 0.18) * 110;
    else if (progress < 0.62) interval = 60;
    else interval = 60 + Math.pow((progress - 0.62) / 0.38, 2) * 420;
    times.push(Math.round(elapsed));
    elapsed += interval;
  }
  return times;
}

export function equalWheelSliceBounds(index, segmentCount) {
  const count = Math.max(1, Number(segmentCount) || 1);
  return { start: Number(index) / count, end: (Number(index) + 1) / count };
}

const DEFAULT_WHEEL_COLORS = ["#f97316", "#0f766e", "#ca8a04", "#2563eb", "#be123c", "#7c3aed"];

export function distinctAdjacentWheelColors(colors, palette = DEFAULT_WHEEL_COLORS) {
  const safePalette = palette.filter(Boolean).length ? palette.filter(Boolean) : DEFAULT_WHEEL_COLORS;
  const result = colors.map((color, index) => color || safePalette[index % safePalette.length]);
  const sameColor = (left, right) => String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
  const rgbOf = (color) => {
    const value = String(color || "").trim().match(/^#([\da-f]{6})$/i)?.[1];
    return value ? [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) : null;
  };
  const colorsConflict = (left, right) => {
    if (sameColor(left, right)) return true;
    const leftRgb = rgbOf(left);
    const rightRgb = rgbOf(right);
    if (!leftRgb || !rightRgb) return false;
    const distance = Math.sqrt(leftRgb.reduce((total, channel, index) => total + (channel - rightRgb[index]) ** 2, 0));
    return distance < 75;
  };
  const replacement = (index, blocked) => {
    for (let offset = 0; offset < safePalette.length; offset += 1) {
      const candidate = safePalette[(index + offset) % safePalette.length];
      if (![...blocked].some((color) => colorsConflict(color, candidate))) return candidate;
    }
    return DEFAULT_WHEEL_COLORS.find((candidate) => ![...blocked].some((color) => colorsConflict(color, candidate))) || result[index];
  };

  for (let index = 1; index < result.length; index += 1) {
    if (colorsConflict(result[index], result[index - 1])) result[index] = replacement(index, new Set([result[index - 1]]));
  }

  if (result.length > 1 && colorsConflict(result.at(-1), result[0])) {
    result[result.length - 1] = replacement(result.length - 1, new Set([result[result.length - 2], result[0]]));
  }

  return result;
}

export function lotteryWheelLabelLayout(segmentCount, chineseLabel = "", englishLabel = "", midAngleDegrees = 0) {
  const count = Math.max(1, Number(segmentCount) || 1);
  const chineseLength = Math.max(1, Array.from(String(chineseLabel)).length);
  const englishLength = Math.max(1, Array.from(String(englishLabel)).length);
  const widthAtLabelRadius = 2 * 29 * Math.sin(Math.PI / count);
  const sectorScale = Math.min(1, Math.max(0.38, (widthAtLabelRadius - 1.5) / 17));
  const radialTextLength = 27;
  const chineseFontSize = Math.max(1.35, Math.min(4.15 * sectorScale, radialTextLength / chineseLength));
  const englishFontSize = Math.max(1.05, Math.min(3 * sectorScale, radialTextLength / (englishLength * 0.56)));
  const normalizedAngle = ((Number(midAngleDegrees) % 360) + 360) % 360;
  const rotation = normalizedAngle > 90 && normalizedAngle < 270 ? Number(midAngleDegrees) + 180 : Number(midAngleDegrees);

  return {
    chineseFontSize,
    englishFontSize,
    rotation,
    radius: 29,
    lineOffset: Math.max(1.4, (chineseFontSize + englishFontSize) * 0.32)
  };
}

export function lotteryWheelSeparatorWidth(segmentCount) {
  const count = Math.max(1, Number(segmentCount) || 1);
  return Math.max(0.3, Math.min(0.58, 5.4 / count));
}

export function equalWheelTargetAngle(winningIndex, segmentCount) {
  const count = Math.max(1, Number(segmentCount) || 1);
  const index = Math.min(count - 1, Math.max(0, Number(winningIndex) || 0));
  return 360 - ((index + 0.5) / count) * 360;
}

export function deterministicLotteryStopUnit(seed) {
  const value = String(seed ?? "lottery");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

export function lotterySafeStopAngle(winningIndex, segmentCount, seed) {
  const count = Math.max(1, Number(segmentCount) || 1);
  const index = Math.min(count - 1, Math.max(0, Number(winningIndex) || 0));
  const safePosition = 0.2 + deterministicLotteryStopUnit(seed) * 0.6;
  return 360 - ((index + safePosition) / count) * 360;
}
