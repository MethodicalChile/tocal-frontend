export const num = (n, decimals = 0) => n == null || n === '' ? '—' : Number(n).toLocaleString('es-CL', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
export const pct = (n, decimals = 0) => n == null ? '—' : `${num(Number(n) * 100, decimals)} %`;
export const money = (n) => n == null ? '—' : `UF ${num(n, 2)}`;
export const date = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
export const display = (v, key = '') => v == null || v === '' ? '—' : key.includes('fecha') || key === 'inicio' || key === 'fin' ? date(v) :
  ['monto_uf', 'monto_aprobado_uf', 'afecto_uf'].includes(key) ? money(v) :
  typeof v === 'boolean' ? (v ? 'Sí' : 'No') : typeof v === 'number' ? num(v, Number.isInteger(v) ? 0 : 2) : String(v).replaceAll('_', ' ');
export const obraPath = (id, module = '') => `/obras/${encodeURIComponent(id)}${module && module !== 'resumen' ? '/' + module : ''}`;
