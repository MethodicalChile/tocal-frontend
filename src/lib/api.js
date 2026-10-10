const BASE = import.meta.env.VITE_API_BASE || '/api';
let csrf = null;

export async function request(path, { method = 'GET', data, ...extra } = {}) {
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (unsafe && !csrf) await token();
  const body = data instanceof FormData ? data : data !== undefined ? JSON.stringify(data) : undefined;
  const headers = { Accept: 'application/json', ...extra.headers };
  if (body !== undefined && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (unsafe) headers['X-CSRFToken'] = csrf;
  const res = await fetch(BASE + path, { method, body, credentials: 'same-origin', headers, cache: 'no-store', ...extra });
  const type = res.headers.get('content-type') || '';
  const result = type.includes('application/json') ? await res.json() : null;
  if (!res.ok || !type.includes('application/json')) {
    const message = result?.error || result?.errors || (res.status === 403 ? 'Acceso denegado' : res.status === 401 ? 'Sesión no autorizada' : `Error HTTP ${res.status}`);
    const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    err.status = res.status; err.details = result;
    throw err;
  }
  return result;
}
export async function token() { const res = await fetch(BASE + '/csrf', { credentials: 'same-origin' }); const data = await res.json(); csrf = data.csrfToken; return csrf; }
export const api = {
  get: (p) => request(p), post: (p, data) => request(p, { method: 'POST', data }),
  put: (p, data) => request(p, { method: 'PUT', data }),
  del: (p) => request(p, { method: 'DELETE' }),
  file: (key) => BASE + '/files/' + String(key || '').split('/').map(encodeURIComponent).join('/'),
  pdf: (obra, id) => BASE + `/obras/${encodeURIComponent(obra)}/informes/${encodeURIComponent(id)}/pdf`
};
