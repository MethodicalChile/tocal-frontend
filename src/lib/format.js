export const num = (n, decimals = 0) => n == null || n === '' ? '—' : Number(n).toLocaleString('es-CL', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
export const pct = (n, decimals = 0) => n == null ? '—' : `${num(Number(n) * 100, decimals)} %`;
export const money = (n) => n == null ? '—' : `UF ${num(n, 2)}`;
export const date = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
export const display = (v, key = '') => v == null || v === '' ? '—' : key.includes('fecha') || key === 'inicio' || key === 'fin' ? date(v) :
  ['monto_uf', 'monto_aprobado_uf', 'afecto_uf'].includes(key) ? money(v) :
  typeof v === 'boolean' ? (v ? 'Sí' : 'No') : typeof v === 'number' ? num(v, Number.isInteger(v) ? 0 : 2) : String(v).replaceAll('_', ' ');
export const obraPath = (id, module = '') => `/obras/${encodeURIComponent(id)}${module && module !== 'resumen' ? '/' + module : ''}`;

export function formatRut(value) {
  const clean = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv}`;
}

export function isValidRut(value) {
  const clean = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (!clean) return true; // vacío es válido cuando el campo es opcional
  if (clean.length < 7 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const mod = 11 - (sum % 11);
  const expectedDv = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);
  return dv === expectedDv;
}

