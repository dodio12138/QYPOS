export function buildCumulativeTimeSeries(rows = []) {
  let orders = 0;
  let revenue = 0;
  return rows.map((row) => {
    orders += Number(row?.orders || 0);
    revenue += Number(row?.revenue || 0);
    return {
      orders,
      revenue
    };
  });
}
