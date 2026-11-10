# TOCAL Frontend (Vue 3 + Vite)

Interfaz web administrativa y operacional de la plataforma **Tocal**, integrada con `tocal-backend` mediante sesiones seguras con CSRF, aislamiento multiempresa y control de permisos RBAC.

---

## 1. Instalación y Compilación (`T0.2`, `T14.5`)

```bash
npm install

# Servidor de desarrollo (puerto 5173 con proxy a Django en 8000)
npm run dev

# Compilación de producción
npm run build
```

---

## 2. Estructura de Módulos y Rutas Principales (`Etapas 2 a 11`)

- `/` — **Panel general (`DashboardView.vue`)**: KPIs operacionales de obras, panel ejecutivo de cumplimiento documental y preventivo (con filtros por obra, cargo y estado), alertas activas y exportación CSV/Excel.
- `/obras/:obraId` — **Resumen de obra (`ObraView.vue`)**: Curva S, indicadores contractuales, dotación vigente por cargo e integración con módulos de Prevención (`/pdr`), Avance (`/avance`), Fotografías (`/fotos`) e Informes (`/informes`).
- `/administracion/accesos` — **Roles, permisos, empresa y auditoría (`AuthorizationAdminView.vue`)**:
  - Administración de roles y matriz de permisos RBAC.
  - Gestión de miembros de la empresa, activación/desactivación y visor de permisos efectivos.
  - Configuración de datos generales de la empresa activa.
  - Registro de auditoría de seguridad (`SecurityAuditEvent`).
- `/administracion/obras` — **Administración de obras (`WorksAdminView.vue`)**: Creación, edición, responsable, fechas contractuales y activación/desactivación de obras de la empresa.
- `/administracion/trabajadores` — **Trabajadores y cargos (`WorkforceView.vue`)**:
  - Listado con filtros por búsqueda, estado laboral y cargo.
  - Catálogo de cargos empresariales + carga automática del catálogo de perfiles Tocal.
  - Asignaciones laborales a obras y cambio de cargo conservando historial.
- `/administracion/trabajadores/:trabajadorId` — **Ficha del trabajador (`WorkerDetailView.vue`)**:
  - Datos personales (con protección de RUT según permiso `empleados.ver_sensibles`) e historial laboral.
  - Expediente documental (`WorkerDocumentsPanel.vue`): cumplimiento automático, carga/descarga privada de evidencias, aprobación segura (deshabilitada sin evidencia) e historial de revisiones.
  - Prevención de riesgos: indicador de habilitación preventiva (`Habilitado` / `Condicionado` / `No habilitado`), capacitaciones y entregas de EPP.
- `/administracion/empresa-equipos` — **Empresa y equipos (`CompanyAndEquipmentView.vue`)**:
  - Expediente documental corporativo de la empresa y cumplimiento empresarial.
  - Catálogo de equipos y maquinaria, asignaciones históricas a obras, documentos de equipos y cumplimiento.
- `/administracion/ajustes` — **Ajustes y mantenedores (`MaintainersView.vue`)**:
  - Tipos documentales (`trabajador`, `empresa`, `equipo`).
  - Requisitos documentales por cargo y por obra (`RequirementsMaintainer.vue`).
  - Catálogo de capacitaciones y requisitos de capacitación por cargo/obra.
  - Categorías de EPP.
  - Configuración de umbrales de alertas de vencimiento (`30/15/7` días) y bandeja de alertas activas.
