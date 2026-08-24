export function lotteryWeightValues(prizes = []) {
  return prizes.map((prize) => {
    const value = Number(prize?.weight_value ?? prize?.weight_bps ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
}

export function lotteryProbabilities(prizes = []) {
  const values = lotteryWeightValues(prizes);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return values.map(() => 0);
  return values.map((value) => (value / total) * 100);
}

export function normalizedLotteryWeights(prizes = []) {
  const values = lotteryWeightValues(prizes);
  if (values.length < 2 || values.some((value) => value <= 0) || values.length > 10000) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  const raw = values.map((value) => (value / total) * 10000);
  const weights = raw.map((value) => Math.floor(value));
  let remainder = 10000 - weights.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < remainder; index += 1) weights[order[index].index] += 1;

  for (let index = 0; index < weights.length; index += 1) {
    if (weights[index] > 0) continue;
    const donor = weights
      .map((weight, donorIndex) => ({ donorIndex, weight }))
      .filter(({ donorIndex, weight }) => donorIndex !== index && weight > 1)
      .sort((left, right) => right.weight - left.weight || left.donorIndex - right.donorIndex)[0];
    if (!donor) return null;
    weights[index] = 1;
    weights[donor.donorIndex] -= 1;
  }
  return weights;
}

export function formatLotteryProbability(value) {
  return `${Number(value || 0).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}%`;
}
