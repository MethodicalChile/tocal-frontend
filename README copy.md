# TOCAL · Frontend Vue 3

Frontend separado de la intranet original: **Vue 3 + Vite + Vue Router**, estilos y recursos gráficos originales del monolito.

## Requisitos

- Node.js 22 (desarrollo), npm
- Django REST en puerto 8000 (carpeta hermana `../tocal-backend`)
- Proyecto Supabase configurado **solo en el backend**

```bash
cp .env.example .env
npm install
npm run dev
```

Acceso local: `http://localhost:5173`. Vite envía `/api/*` a Django vía proxy; sesión HttpOnly, cookie CSRF y mismo origen. Los secrets privados jamás se compilan ni se entregan a Vue.

```bash
npm run build  # genera dist/ para Nginx/CDN
npm run preview
```

En producción servir `dist` y enrutar `/api/*` al backend; se adjunta `nginx.conf`, que presupone que el backend se llama `backend:8000` en la red Docker. Configura HTTPS en el proxy/ingress de producción y `TRUST_PROXY_HEADERS` solo si confías en el proxy.

## Rutas principales

`/`, `/obras/:id`, `/obras/:id/pdr`, `/obras/:id/avance`, `/obras/:id/edp`, `/obras/:id/adicionales`, `/obras/:id/rdi`, `/obras/:id/fotos`, `/obras/:id/informes`, `/ventas`, `/ventas/documentos`, `/ventas/importar`, `/privacidad`.

## Fidelidad respecto al monolito

Se recuperaron las hojas CSS, tipografía, logos y archivo ECharts sin modificaciones. Las pantallas se han **reconstruido en componentes Vue**; no son byte a byte las plantillas originales. Los controles más complejos pueden requerir una ronda de comparación visual y pruebas de usuario para alcanzar paridad completa.

## Seguridad

No guardar usuarios ni contraseñas en `localStorage`, y no utilizar `service_role`, `sb_secret_*` ni `DATABASE_URL` en variables `VITE_*`. Los archivos personales siempre se descargan a través de `/api/files` y requieren una sesión Django autorizada sobre la obra.
