import Workforce from './modules/administration/views/WorkforceView.vue';
import WorkerDetail from './modules/administration/views/WorkerDetailView.vue';
import AuthorizationAdmin from './modules/administration/views/AuthorizationAdminView.vue';
import WorksAdmin from './modules/administration/views/WorksAdminView.vue';
import Maintainers from './modules/administration/views/MaintainersView.vue';
import CompanyAndEquipment from './modules/administration/views/CompanyAndEquipmentView.vue';
import { createApp, h } from 'vue';
import { createRouter, createWebHistory, RouterView } from 'vue-router';
import { state, refreshSession, ensurePermissions, can, canAccessSales } from './lib/state';
import AppShell from './components/AppShell.vue';
import Login from './views/LoginView.vue';
import Dashboard from './views/DashboardView.vue';
import Obra from './views/ObraView.vue';
import Pdr from './views/PdrView.vue';
import Avance from './views/AvanceView.vue';
import Records from './views/RecordsView.vue';
import Photos from './views/PhotosView.vue';
import Reports from './views/ReportsView.vue';
import ReportEdit from './views/ReportEditView.vue';
import Sales from './views/SalesView.vue';
import SalesBook from './views/SalesBookView.vue';
import SalesEdit from './views/SalesEditView.vue';
import SalesImport from './views/SalesImportView.vue';
import Privacy from './views/PrivacyView.vue';
import './style.css';

const routes = [
  { path: '/login', name: 'login', component: Login, meta: { title: 'Acceso' } },
  { path: '/', name: 'dashboard', component: Dashboard, meta: { title: 'Panel general' } },
  { path: '/obras/:obraId', name: 'obra', component: Obra, meta: { title: 'Resumen' } },
  { path: '/obras/:obraId/pdr', name: 'pdr', component: Pdr, meta: { title: 'Prevención' } },
  { path: '/obras/:obraId/avance', name: 'avance', component: Avance, meta: { title: 'Avance' } },
  { path: '/obras/:obraId/fotos', name: 'fotos', component: Photos, meta: { title: 'Fotografías' } },
  { path: '/obras/:obraId/informes', name: 'informes', component: Reports, meta: { title: 'Informes' } },
  { path: '/obras/:obraId/informes/:pk', name: 'informe', component: ReportEdit, meta: { title: 'Informe' } },
  { path: '/obras/:obraId/:module/nuevo', name: 'record-new', component: Records, meta: { title: 'Registrar' } },
  { path: '/obras/:obraId/:module/:pk', name: 'record-edit', component: Records, meta: { title: 'Editar' } },
  { path: '/obras/:obraId/:module', name: 'records', component: Records, meta: { title: 'Registros' } },
  { path: '/ventas', name: 'ventas', component: Sales, meta: { title: 'Ventas' } },
  { path: '/ventas/documentos', name: 'ventas-libro', component: SalesBook, meta: { title: 'Libro de ventas' } },
  { path: '/ventas/documentos/nuevo', name: 'venta-nueva', component: SalesEdit, meta: { title: 'Registrar documento' } },
  { path: '/ventas/documentos/:pk', name: 'venta-editar', component: SalesEdit, meta: { title: 'Editar documento' } },
  { path: '/ventas/importar', name: 'ventas-importar', component: SalesImport, meta: { title: 'Importar planilla' } },
  {
    path: '/privacidad',
    name: 'privacidad',
    component: Privacy,
    meta: { title: 'Privacidad' }
  },
  {
    path: '/administracion/accesos',
    name: 'administracion-accesos',
    component: AuthorizationAdmin,
    meta: { title: 'Roles y permisos', permission: 'roles.ver' }
  },

  { path: '/administracion/trabajadores', name: 'administracion-trabajadores', component: Workforce, meta: { title: 'Trabajadores y cargos', permission: 'empleados.ver' } },
  { path: '/administracion/trabajadores/:trabajadorId', name: 'trabajador-detalle', component: WorkerDetail, meta: { title: 'Ficha del trabajador', permission: 'empleados.ver' } },
  {
    path: '/administracion/obras',
    name: 'administracion-obras',
    component: WorksAdmin,
    meta: { title: 'Administrar obras', permission: 'obras.ver' },
  },
  { path: '/administracion/empresa-equipos', name: 'administracion-empresa-equipos', component: CompanyAndEquipment, meta: { title: 'Empresa y equipos', permission: 'documentos.ver' } },
  { path: '/administracion/ajustes', name: 'administracion-ajustes', component: Maintainers, meta: { title: 'Ajustes y mantenedores', permission: 'documentos.ver' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];
const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach(async to => {
  if (!state.loaded) await refreshSession();
  if (to.name !== 'login' && !state.user) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.name === 'login' && state.user) return { name: 'dashboard' };
  if (to.path.startsWith('/ventas') && !canAccessSales()) return { name: 'dashboard' };
  if (to.meta.permission) {
    await ensurePermissions();
    if (!can(to.meta.permission)) return { name: 'dashboard' };
  }
  // Las rutas de obra solo pueden mostrarse si pertenecen al contexto activo.
  if (to.params.obraId && !state.obras.some(o => String(o.id) === String(to.params.obraId))) return { name: 'dashboard' };
  return true;
});
const Root = {
  setup() {
    return () => {
      const isLogin = router.currentRoute.value.name === 'login';

      if (isLogin) {
        return h(RouterView);
      }

      return h(AppShell, null, {
        default: () => h(RouterView)
      });
    };
  }
};

createApp(Root).use(router).mount('#app');
