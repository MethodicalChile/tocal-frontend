
const BASE = import.meta.env?.VITE_API_BASE || '/api';

let csrf = null;

export async function token() {
  const res = await fetch(BASE + '/csrf', {
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('No se pudo obtener el token CSRF');
  }

  const data = await res.json();

  if (!data.csrfToken) {
    throw new Error('Django no devolvió un token CSRF');
  }

  csrf = data.csrfToken;
  return csrf;
}

export async function request(path, { method = 'GET', data, ...extra } = {}) {
  method = method.toUpperCase();

  const unsafe = !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method);

  // Refrescar el token antes de cada operación de escritura.
  // Esto evita usar uno anterior al inicio de sesión.
  if (unsafe) {
    await token();
  }

  const body =
    data instanceof FormData
      ? data
      : data !== undefined
        ? JSON.stringify(data)
        : undefined;

  const headers = {
    Accept: 'application/json',
    ...extra.headers,
  };

  if (body !== undefined && !(data instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (unsafe) {
    headers['X-CSRFToken'] = csrf;
  }

  const res = await fetch(BASE + path, {
    ...extra,
    method,
    body,
    credentials: 'same-origin',
    headers,
    cache: 'no-store',
  });

  const type = res.headers.get('content-type') || '';
  const result = type.includes('application/json')
    ? await res.json()
    : null;

  if (!res.ok || !type.includes('application/json')) {
    const message =
      result?.error ||
      result?.errors ||
      (res.status === 403
        ? 'Acceso denegado'
        : res.status === 401
          ? 'Sesión no autorizada'
          : `Error HTTP ${res.status}`);

    const err = new Error(
      typeof message === 'string'
        ? message
        : JSON.stringify(message)
    );

    err.status = res.status;
    err.details = result;

    throw err;
  }

  return result;
}

export const api = {
  get: (p) => request(p),

  post: (p, data) => request(p, {
    method: 'POST',
    data,
  }),

  put: (p, data) => request(p, {
    method: 'PUT',
    data,
  }),

  patch: (p, data) => request(p, { method: 'PATCH', data }),

  del: (p) => request(p, {
    method: 'DELETE',
  }),

  file: (key) =>
    BASE + '/files/' +
    String(key || '')
      .split('/')
      .map(encodeURIComponent)
      .join('/'),

  pdf: (obra, id) =>
    BASE +
    `/obras/${encodeURIComponent(obra)}/informes/${encodeURIComponent(id)}/pdf`,
};

// Descargas privadas: no se pueden procesar con request(), porque responde JSON únicamente.
// Usa la sesión de Django y nunca expone una URL pública de almacenamiento.
export async function downloadPrivateFile(path, suggestedName = 'documento') {
  const res = await fetch(BASE + path, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    let message = `Error HTTP ${res.status}`;
    try {
      const error = await res.json();
      message = error.error || message;
    } catch { /* La respuesta de error puede no ser JSON. */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = String(suggestedName || 'documento').split(/[\\/]/).pop() || 'documento';
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
