import { round2 } from './format';

/** Normalise a rate chart: numeric, positive, unique fat values, sorted ascending. */
export function cleanChart(rows) {
  const byFat = new Map();
  for (const r of rows || []) {
    const f = Math.round(Number(r.fat) * 10) / 10;
    const rate = round2(Number(r.rate));
    if (f > 0 && rate > 0) byFat.set(f, rate);
  }
  return [...byFat.entries()].sort((a, b) => a[0] - b[0]).map(([fat, rate]) => ({ fat, rate }));
}

/**
 * Rate (₹/L) for a fat % from a supplier's chart.
 * Exact chart points are used as-is; fat values between two points are linearly
 * interpolated; values outside the chart are clamped to the nearest end and flagged.
 */
export function lookupRate(chart, fatPct) {
  const rows = cleanChart(chart);
  const f = Number(fatPct);
  if (!rows.length || !(f > 0)) return { rate: null, note: rows.length ? null : 'No rate chart set' };

  const first = rows[0];
  const last = rows[rows.length - 1];
  if (f < first.fat) return { rate: first.rate, note: `Below chart (min ${first.fat.toFixed(1)}%)` };
  if (f > last.fat) return { rate: last.rate, note: `Above chart (max ${last.fat.toFixed(1)}%)` };

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    if (Math.abs(a.fat - f) < 1e-9) return { rate: a.rate, note: null };
    const b = rows[i + 1];
    if (b && f > a.fat && f < b.fat) {
      const rate = round2(a.rate + ((f - a.fat) / (b.fat - a.fat)) * (b.rate - a.rate));
      return { rate, note: 'Interpolated' };
    }
  }
  return { rate: null, note: null };
}

/** Generate chart rows: fromFat..toFat in `step`, starting at baseRate and adding perStep each step. */
export function generateChart({ fromFat, toFat, step, baseRate, perStep }) {
  const rows = [];
  const s = Number(step);
  if (!(s > 0) || !(Number(toFat) >= Number(fromFat))) return rows;
  const n = Math.round((Number(toFat) - Number(fromFat)) / s);
  for (let i = 0; i <= n && i < 500; i++) {
    rows.push({
      fat: Math.round((Number(fromFat) + i * s) * 10) / 10,
      rate: round2(Number(baseRate) + i * Number(perStep)),
    });
  }
  return rows;
}
