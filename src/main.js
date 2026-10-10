import { createApp, h } from 'vue';
import { createRouter, createWebHistory, RouterView } from 'vue-router';
import { state, refreshSession } from './lib/state';
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
  { path: '/privacidad', name: 'privacidad', component: Privacy, meta: { title: 'Privacidad' } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];
const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach(async to => {
  if (!state.loaded) await refreshSession();
  if (to.name !== 'login' && !state.user) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.name === 'login' && state.user) return { name: 'dashboard' };
  if (to.path.startsWith('/ventas') && state.user?.role !== 'gerencia') return { name: 'dashboard' };
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
