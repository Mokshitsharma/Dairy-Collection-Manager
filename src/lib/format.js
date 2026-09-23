const moneyFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

export const money = (n) => (n == null || Number.isNaN(n) ? '—' : moneyFmt.format(round2(n)));
export const qty = (n) => (n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(3));
export const fat = (n) => (n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(1));

/** Liters as a decimal quantity from the separate liters + milliliters inputs. */
export const quantity = (liters, ml) => round3((Number(liters) || 0) + (Number(ml) || 0) / 1000);

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const todayISO = () => toISO(new Date());

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + n));
}

/** "23 Sep 2026" */
export function dateLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
/** "23 Sep" — fixed-width when rendered in the mono face */
export function dateShort(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
}

export const defaultShift = () => (new Date().getHours() < 14 ? 'morning' : 'evening');
export const shiftLabel = (s) => (s === 'morning' ? 'Morning' : 'Evening');
export const shiftShort = (s) => (s === 'morning' ? 'AM' : 'PM');
