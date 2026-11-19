
<script setup>
import {
  computed,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
} from 'vue';

import {
  useRoute,
  useRouter,
  RouterLink,
} from 'vue-router';

import {
  LayoutDashboard,
  TrendingUp,
  Building2,
  PanelLeft,
  Menu,
  Search,
  Calendar,
  LogOut,
  ChevronRight,
  X,
  Shield,
  ShieldCheck,
  Users,
  Settings,
  Bell,
} from 'lucide-vue-next';

import {
  state,
  notice,
  selectCompany,
  clearCompanyContext,
  can,
  canAccessSales,
} from '../lib/state';

import { api } from '../lib/api';
import { documentsApi } from '../modules/administration/services/documentsApi';


import { obraPath } from '../lib/format';

const route = useRoute();
const router = useRouter();

/* =========================================================
   ESTADO DEL COMPONENTE
========================================================= */

const collapsed = ref(
  localStorage.getItem('tocal.sidebar') === 'collapsed'
);

const mobile = ref(false);
const search = ref('');
const searchOpen = ref(false);
const profileOpen = ref(false);
const alertsOpen = ref(false);
const showPermissionsDetail = ref(false);
const editProfileOpen = ref(false);
const profileForm = ref({ name: '', current_password: '', new_password: '' });
const profileSaving = ref(false);
const profileError = ref('');
const profileSuccess = ref('');
const unreadAlertsCount = ref(0);
const recentAlerts = ref([]);

const userInitials = computed(() => {
  const n = (state.user?.name || state.user?.email || 'U').trim();
  const parts = n.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
});

const myWorkerProfile = computed(() => {
  const empId = state.activeCompanyId;
  if (!empId || !state.user?.fichas_trabajador) return null;
  return state.user.fichas_trabajador[empId] || null;
});

function toggleProfileMenu() {
  alertsOpen.value = false;
  profileOpen.value = !profileOpen.value;
  if (profileOpen.value && state.user) {
    profileForm.value = { name: state.user.name || '', current_password: '', new_password: '' };
    profileError.value = '';
    profileSuccess.value = '';
  }
}

async function saveMyProfile() {
  if (profileSaving.value) return;
  profileSaving.value = true;
  profileError.value = '';
  profileSuccess.value = '';
  try {
    const res = await api.post('/auth/perfil', profileForm.value);
    if (res?.user && state.user) {
      state.user.name = res.user.name;
    }
    profileForm.value.current_password = '';
    profileForm.value.new_password = '';
    profileSuccess.value = 'Tus datos de cuenta fueron actualizados.';
    editProfileOpen.value = false;
  } catch (e) {
    profileError.value = e.message || 'No fue posible actualizar tu perfil.';
  } finally {
    profileSaving.value = false;
  }
}

async function refreshAlertsBadge() {
  const empId = state.activeCompanyId;
  if (!empId || !state.user || !(can('alertas.ver') || can('documentos.ver'))) {
    unreadAlertsCount.value = 0;
    recentAlerts.value = [];
    return;
  }
  try {
    const res = await documentsApi.alerts(empId, { leida: false });
    const list = res?.results || [];
    recentAlerts.value = list.slice(0, 6);
    unreadAlertsCount.value = Number(res?.resumen?.no_leidas ?? list.length ?? 0);
  } catch {
    unreadAlertsCount.value = 0;
    recentAlerts.value = [];
  }
}

async function markQuickAlertRead(alerta) {
  const empId = state.activeCompanyId;
  if (!empId || !alerta?.id) return;
  try {
    await documentsApi.markAlert(empId, alerta.id, true);
    await refreshAlertsBadge();
  } catch {
    // ignore
  }
}

watch(() => [state.activeCompanyId, state.user, route.path], () => {
  refreshAlertsBadge();
}, { immediate: true });

const title = computed(
  () => route.meta.title || 'Panel general'
);

/* =========================================================
   EMPRESA ACTIVA
========================================================= */

const activeCompany = computed(() =>
  state.companies.find(
    company => company.id === state.activeCompanyId
  ) || null
);

const activeCompanyName = computed(
  () => activeCompany.value?.nombre || 'Sin empresa'
);

/* =========================================================
   PERMISOS RBAC
========================================================= */

const canViewAccess = computed(() => can('roles.ver'));
const canViewWorks = computed(() => can('obras.ver'));
const canViewWorkers = computed(() => can('empleados.ver'));
const canViewSettings = computed(() => can('documentos.ver'));
const canViewSales = computed(() => canAccessSales());

/* =========================================================
   CAMBIAR EMPRESA
========================================================= */

function changeCompany(event) {
  const empresaId = event.target.value;

  if (!empresaId) {
    return;
  }

  if (empresaId === state.activeCompanyId) {
    return;
  }

  const companyExists = state.companies.some(
    company => company.id === empresaId
  );

  if (!companyExists) {
    notice('La empresa seleccionada no está disponible.');
    return;
  }

  selectCompany(empresaId);

  // Evita conservar rutas de obras pertenecientes
  // a la empresa seleccionada anteriormente.
  router.push('/');

  mobile.value = false;
  searchOpen.value = false;
  search.value = '';
}

/* =========================================================
   OBRA ACTUAL
========================================================= */

const obra = computed(() =>
  state.obras.find(
    item => String(item.id) === String(route.params.obraId)
  )
);

const activeObraModule = computed(() => {
  if (route.params.module) return String(route.params.module);
  if (route.name === 'pdr') return 'pdr';
  if (route.name === 'avance') return 'avance';
  if (route.name === 'fotos') return 'fotos';
  if (route.name === 'informes' || route.name === 'informe') return 'informes';
  const match = route.path.match(/^\/obras\/[^/]+\/([^/?#]+)/);
  return match ? match[1] : 'resumen';
});

/* =========================================================
   BUSCADOR GLOBAL
========================================================= */

const matches = computed(() => {
  const query = search.value.trim().toLowerCase();

  const items = [
    {
      name: 'Panel general',
      url: '/',
    },
  ];

  if (canViewSales.value) {
    items.push(
      {
        name: 'Ventas',
        url: '/ventas',
      },
      {
        name: 'Libro de ventas',
        url: '/ventas/documentos',
      }
    );
  }

  if (canViewAccess.value) {
    items.push({
      name: 'Roles y permisos',
      url: '/administracion/accesos',
    });
  }

  if (canViewWorks.value) {
    items.push({
      name: 'Administrar obras',
      url: '/administracion/obras',
    });
  }

  if (canViewSettings.value) {
    items.push({ name: 'Empresa, equipos y checklists', url: '/administracion/empresa-equipos' });
    items.push({ name: 'Consulta rápida en terreno (RF-15)', url: '/administracion/consulta-terreno' });
    items.push({ name: 'Checklists e inspecciones digitales (RF-12)', url: '/administracion/empresa-equipos?tab=checklists' });
    items.push({ name: 'Dossier Fiscalización FUF / DS 44 (RF-16)', url: '/administracion/dossier-fiscalizacion' });
    items.push({ name: 'Ajustes y mantenedores', url: '/administracion/ajustes' });
  }

  if (canViewWorkers.value) {
    items.push({
      name: 'Trabajadores, cargos y «Hombre Nuevo» (RF-06)',
      url: '/administracion/trabajadores',
    });
  }

  items.push({
    name: 'Privacidad, Portabilidad y Derechos ARCO+ (Ley 21.719)',
    url: '/privacidad',
  });

  state.obras.forEach(item => {
    items.push({
      name: item.nombre,
      url: obraPath(item.id),
    });

    state.modules.forEach(([slug, name]) => {
      items.push({
        name: `${item.nombre} · ${name}`,
        url: obraPath(item.id, slug),
      });
    });
  });

  return items
    .filter(item =>
      item.name.toLowerCase().includes(query)
    )
    .slice(0, 18);
});

/* =========================================================
   SIDEBAR
========================================================= */

function toggle() {
  collapsed.value = !collapsed.value;

  const mode = collapsed.value
    ? 'collapsed'
    : 'expanded';

  localStorage.setItem('tocal.sidebar', mode);

  document.documentElement.dataset.sidebar = mode;
}

/* =========================================================
   ATAJOS DE TECLADO
========================================================= */

function keydown(event) {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'k'
  ) {
    event.preventDefault();
    searchOpen.value = true;
  }

  if (event.key === 'Escape') {
    searchOpen.value = false;
    profileOpen.value = false;
    alertsOpen.value = false;
  }
}

/* =========================================================
   CERRAR SESIÓN Y MONITOR DE INACTIVIDAD (.ENV)
========================================================= */

const envTimeoutSec = Number(
  import.meta.env.VITE_INACTIVITY_TIMEOUT_SECONDS ||
    (import.meta.env.VITE_INACTIVITY_TIMEOUT_MINUTES
      ? Number(import.meta.env.VITE_INACTIVITY_TIMEOUT_MINUTES) * 60
      : 0)
);
const envWarningSec = Number(import.meta.env.VITE_INACTIVITY_WARNING_SECONDS || 0);

const totalTimeoutSeconds = computed(() => {
  if (envTimeoutSec > 0) return envTimeoutSec;
  const fromSession = Number(state.user?.inactivity_timeout_seconds || 0);
  return fromSession > 0 ? fromSession : 300;
});

const warningThresholdSeconds = computed(() => {
  if (envWarningSec > 0) return envWarningSec;
  const fromSession = Number(state.user?.inactivity_warning_seconds || 0);
  return fromSession > 0 ? fromSession : 10;
});

const lastActivityAt = ref(Date.now());
const remainingInactivitySeconds = ref(300);
const inactivityWarningOpen = ref(false);
let inactivityIntervalId = null;
let lastActivityUpdateMs = 0;

function registerUserActivity() {
  if (!state.user || inactivityWarningOpen.value) return;
  const now = Date.now();
  if (now - lastActivityUpdateMs < 400) return;
  lastActivityUpdateMs = now;
  lastActivityAt.value = now;
  remainingInactivitySeconds.value = totalTimeoutSeconds.value;
}

async function confirmUserActive() {
  lastActivityAt.value = Date.now();
  remainingInactivitySeconds.value = totalTimeoutSeconds.value;
  inactivityWarningOpen.value = false;
  try {
    await api.get('/session');
  } catch {
    // ignore keep-alive errors
  }
}

function triggerInactivityWarningPreview() {
  profileOpen.value = false;
  const targetRemaining = warningThresholdSeconds.value;
  lastActivityAt.value = Date.now() - (totalTimeoutSeconds.value - targetRemaining) * 1000;
  remainingInactivitySeconds.value = targetRemaining;
  inactivityWarningOpen.value = true;
}

function tickInactivityTimer() {
  if (!state.user) {
    inactivityWarningOpen.value = false;
    return;
  }
  const elapsedSeconds = Math.floor((Date.now() - lastActivityAt.value) / 1000);
  const remaining = Math.max(0, totalTimeoutSeconds.value - elapsedSeconds);
  remainingInactivitySeconds.value = remaining;

  if (remaining <= 0) {
    inactivityWarningOpen.value = false;
    signOut({ byInactivity: true });
    return;
  }

  if (remaining <= warningThresholdSeconds.value) {
    inactivityWarningOpen.value = true;
  }
}

async function signOut(options = {}) {
  const byInactivity = Boolean(options?.byInactivity);
  inactivityWarningOpen.value = false;
  try {
    await api.post('/auth/logout', {});
  } catch {
    // Si la sesión ya expiró en servidor, igual limpiamos cliente
  } finally {
    state.user = null;
    clearCompanyContext();
    mobile.value = false;
    searchOpen.value = false;
    profileOpen.value = false;
    alertsOpen.value = false;
    await router.push(byInactivity ? '/login?reason=inactivity' : '/login');
  }
}

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

/* =========================================================
   CICLO DE VIDA
========================================================= */

onMounted(() => {
  document.documentElement.dataset.sidebar =
    collapsed.value ? 'collapsed' : 'expanded';

  window.addEventListener('keydown', keydown);
  lastActivityAt.value = Date.now();
  remainingInactivitySeconds.value = totalTimeoutSeconds.value;
  ACTIVITY_EVENTS.forEach(evt =>
    window.addEventListener(evt, registerUserActivity, { passive: true })
  );
  inactivityIntervalId = window.setInterval(tickInactivityTimer, 1000);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', keydown);
  ACTIVITY_EVENTS.forEach(evt =>
    window.removeEventListener(evt, registerUserActivity)
  );
  if (inactivityIntervalId) {
    window.clearInterval(inactivityIntervalId);
    inactivityIntervalId = null;
  }
});
</script>

<template>
  <div
    class="shell"
    :class="{ 'is-mobile-open': mobile }"
  >
    <!-- SIDEBAR -->
    <aside
      id="sidebar"
      class="sidebar"
      aria-label="Menú lateral"
    >
      <div class="sidebar__head">
        <RouterLink class="brand" to="/">
          <span class="brand__mark">
            <img
              src="/logo-marca.png"
              alt=""
              width="20"
              height="20"
            />
          </span>

          <span class="brand__text">
            <strong>Tocal</strong>
            <small>Control de obras</small>
          </span>
        </RouterLink>

        <button
          class="btn btn-ghost btn-icon btn-sm sidebar__close"
          aria-label="Cerrar menú"
          @click="mobile = false"
        >
          <X :size="18" />
        </button>
      </div>

      <div class="side-navs">

        <!-- GENERAL -->
        <nav
          class="side-nav"
          aria-label="Navegación principal"
        >
          <div class="side-nav__label">
            General
          </div>

          <RouterLink
            to="/"
            class="side-link"
            :class="{ 'is-active': route.path === '/' }"
          >
            <LayoutDashboard :size="18" />
            <span class="side-link__text">
              Panel general
            </span>
          </RouterLink>

          <RouterLink
            v-if="canViewSales"
            to="/ventas"
            class="side-link"
            :class="{
              'is-active': route.path.startsWith('/ventas')
            }"
          >
            <TrendingUp :size="18" />
            <span class="side-link__text">
              Ventas
            </span>
          </RouterLink>
        </nav>

        <!-- OBRAS -->
        <nav
          class="side-nav"
          aria-label="Obras"
        >
          <div class="side-nav__label">
            Obras
          </div>

          <RouterLink
            v-for="item in state.obras"
            :key="item.id"
            :to="obraPath(item.id)"
            class="side-link"
            :class="{
              'is-active': route.params.obraId === item.id,
              'is-inactive': !item.activa
            }"
          >
            <Building2 :size="18" />
            <span class="side-link__text">
              {{ item.nombre }}
            </span>
          </RouterLink>

          <p
            v-if="!state.obras.length"
            class="side-nav__empty"
          >
            Sin obras asignadas.
          </p>
        </nav>

        <!-- ADMINISTRACIÓN -->
        <nav
          v-if="
            canViewAccess ||
            canViewWorks ||
            canViewWorkers ||
            canViewSettings
          "
          class="side-nav"
          aria-label="Administración"
        >
          <div class="side-nav__label">
            Administración
          </div>

          <RouterLink
            v-if="canViewAccess"
            to="/administracion/accesos"
            class="side-link"
            :class="{
              'is-active':
                route.path === '/administracion/accesos'
            }"
          >
            <ShieldCheck :size="18" />
            <span class="side-link__text">
              Roles y permisos
            </span>
          </RouterLink>

          <RouterLink
            v-if="canViewWorks"
            to="/administracion/obras"
            class="side-link"
            :class="{
              'is-active':
                route.path === '/administracion/obras'
            }"
          >
            <Building2 :size="18" />
            <span class="side-link__text">
              Administrar obras
            </span>
          </RouterLink>

          <RouterLink
            v-if="canViewWorkers"
            to="/administracion/trabajadores"
            class="side-link"
            :class="{
              'is-active':
                route.path === '/administracion/trabajadores'
            }"
          >
            <Users :size="18" />
            <span class="side-link__text">
              Trabajadores y cargos
            </span>
          </RouterLink>
          <RouterLink
            v-if="canViewSettings"
            to="/administracion/empresa-equipos"
            class="side-link"
            :class="{ 'is-active': route.path === '/administracion/empresa-equipos' }"
          >
            <Building2 :size="18" />
            <span class="side-link__text">Empresa y equipos</span>
          </RouterLink>
          <RouterLink
            v-if="canViewSettings"
            to="/administracion/consulta-terreno"
            class="side-link"
            :class="{ 'is-active': route.path === '/administracion/consulta-terreno' }"
          >
            <Search :size="18" />
            <span class="side-link__text">Consulta en terreno</span>
          </RouterLink>
          <RouterLink
            v-if="canViewSettings"
            to="/administracion/dossier-fiscalizacion"
            class="side-link"
            :class="{ 'is-active': route.path === '/administracion/dossier-fiscalizacion' }"
          >
            <ShieldCheck :size="18" />
            <span class="side-link__text">Dossier FUF / DS 44</span>
          </RouterLink>
          <RouterLink
            v-if="canViewSettings"
            to="/administracion/ajustes"
            class="side-link"
            :class="{ 'is-active': route.path === '/administracion/ajustes' }"
          >
            <Settings :size="18" />
            <span class="side-link__text">Ajustes y mantenedores</span>
          </RouterLink>
        </nav>

        <!-- CUENTA -->
        <nav
          class="side-nav"
          aria-label="Cuenta"
        >
          <div class="side-nav__label">
            Cuenta
          </div>

          <RouterLink
            to="/privacidad"
            class="side-link"
            :class="{
              'is-active': route.path === '/privacidad'
            }"
          >
            <Shield :size="18" />
            <span class="side-link__text">
              Privacidad
            </span>
          </RouterLink>
        </nav>
      </div>

      <!-- USUARIO -->
      <div class="side-user">
        <span class="avatar">
          {{ state.user?.name?.slice(0, 2)?.toUpperCase() }}
        </span>

        <div class="side-user__meta">
          <strong>{{ state.user?.name }}</strong>

          <small>
            {{ state.user?.role?.replaceAll('_', ' ') }}
          </small>
        </div>

        <button
          class="btn btn-ghost btn-icon btn-sm"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          @click="signOut"
        >
          <LogOut :size="18" />
        </button>
      </div>
    </aside>

    <!-- OVERLAY MÓVIL -->
    <div
      v-if="mobile"
      class="scrim"
      @click="mobile = false"
    />

    <!-- CONTENIDO -->
    <div class="workspace">

      <!-- BARRA SUPERIOR -->
      <header class="topbar">
        <button
          class="btn btn-ghost btn-icon btn-sm topbar__collapse"
          aria-label="Contraer menú"
          @click="toggle"
        >
          <PanelLeft :size="18" />
        </button>

        <button
          class="btn btn-ghost btn-icon btn-sm topbar__menu"
          aria-label="Abrir menú"
          @click="mobile = true"
        >
          <Menu :size="18" />
        </button>

        <span class="topbar__divider"></span>

        <!-- BREADCRUMBS -->
        <nav class="crumbs" aria-label="Ruta">
          <span class="crumbs__root">
            Tocal
          </span>

          <ChevronRight :size="14" />

          <span
            v-if="obra"
            class="crumbs__step"
          >
            Obras
            <ChevronRight
              :size="14"
              style="display:inline"
            />
          </span>

          <span class="crumbs__current">
            {{ title }}
          </span>
        </nav>

        <div class="topbar__end">

          <!-- SELECTOR MULTIEMPRESA -->
          <label
            class="company-picker"
            style="
              display:flex;
              align-items:center;
              gap:6px;
              font-size:12px;
            "
          >
            Empresa

            <select
              :value="state.activeCompanyId || ''"
              :disabled="
                state.companyLoading ||
                !state.companies.length
              "
              aria-label="Empresa activa"
              style="
                max-width:240px;
                padding:6px 32px 6px 12px;
                border-radius:9px;
                font-weight:600;
                text-overflow:ellipsis;
              "
              @change="changeCompany"
            >
              <option
                v-if="!state.companies.length"
                value=""
              >
                Sin empresas asignadas
              </option>

              <option
                v-for="company in state.companies"
                :key="company.id"
                :value="company.id"
              >
                {{ company.nombre }}
              </option>
            </select>
          </label>

          <!-- BUSCADOR -->
          <button
            class="search-trigger"
            @click="searchOpen = true"
          >
            <Search :size="16" />

            <span class="search-trigger__text">
              Buscar obra o módulo
            </span>

            <kbd class="kbd">
              Ctrl K
            </kbd>
          </button>

          <!-- ALERTAS DE VENCIMIENTO (BANDEJA DESPLEGABLE) -->
          <div v-if="canViewSettings" class="profile-menu-wrap">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              style="position:relative;display:inline-flex;align-items:center;gap:6px"
              title="Alertas de vencimiento documental"
              aria-label="Alertas de vencimiento documental"
              @click="profileOpen = false; alertsOpen = !alertsOpen"
            >
              <Bell :size="16" />
              <span
                v-if="unreadAlertsCount > 0"
                style="background:#dc2626;color:#fff;font-size:11px;font-weight:700;padding:1px 6px;border-radius:999px"
              >
                {{ unreadAlertsCount }}
              </span>
            </button>

            <div
              v-if="alertsOpen"
              class="profile-backdrop"
              @click="alertsOpen = false"
            />

            <div
              v-if="alertsOpen"
              class="profile-dropdown card"
              style="width:360px"
              role="dialog"
              aria-label="Bandeja de alertas de vencimiento"
            >
              <div class="profile-dropdown__header" style="justify-content:space-between;align-items:center">
                <div>
                  <strong class="profile-dropdown__name">Alertas de Vencimiento</strong>
                  <div class="profile-dropdown__email">{{ unreadAlertsCount }} alerta(s) pendiente(s) de lectura</div>
                </div>
                <span class="badge" :style="{ background: unreadAlertsCount > 0 ? '#fee2e2' : '#dcfce7', color: '#111827' }">
                  {{ unreadAlertsCount > 0 ? 'Requiere atención' : 'Al día' }}
                </span>
              </div>

              <div style="max-height:280px;overflow-y:auto;padding:8px 12px">
                <p v-if="!recentAlerts.length" class="muted" style="font-size:12px;margin:8px 4px">
                  No tienes alertas de vencimiento pendientes de revisar en esta empresa.
                </p>
                <div
                  v-for="al in recentAlerts"
                  :key="al.id"
                  style="padding:10px 8px;border-bottom:1px solid var(--border,#e2ded5);display:grid;gap:4px"
                >
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                    <strong style="font-size:12px;line-height:1.3">{{ al.titulo }}</strong>
                    <span class="badge" style="font-size:10px;padding:2px 6px;white-space:nowrap" :style="{ background: al.nivel === 'vencido' || al.dias_restantes < 0 ? '#fee2e2' : '#fef3c7', color: '#111827', fontWeight: 700 }">
                      {{ al.dias_restantes < 0 ? `Vencido hace ${Math.abs(al.dias_restantes)}d` : al.dias_restantes === 0 ? 'Vence hoy' : `Vence en ${al.dias_restantes}d` }}
                    </span>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--muted-fg,#6f6d68);gap:6px;flex-wrap:wrap">
                    <span>Vence: {{ al.fecha_vencimiento }} · {{ al.obra_nombre || 'General' }}</span>
                    <div style="display:flex;gap:4px">
                      <RouterLink
                        v-if="al.trabajador_id"
                        :to="{ name: 'trabajador-detalle', params: { trabajadorId: al.trabajador_id } }"
                        class="btn btn-ghost btn-sm"
                        style="height:22px;padding:0 8px;font-size:11px"
                        @click="alertsOpen = false"
                      >
                        Ver ficha
                      </RouterLink>
                      <button type="button" class="btn btn-ghost btn-sm" style="height:22px;padding:0 8px;font-size:11px" @click="markQuickAlertRead(al)">
                        Leída
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="profile-dropdown__footer">
                <RouterLink
                  to="/administracion/ajustes?tab=alertas"
                  class="btn btn-primary btn-sm"
                  style="width:100%;justify-content:center"
                  @click="alertsOpen = false"
                >
                  Ver centro de alertas y configurar umbrales
                </RouterLink>
              </div>
            </div>
          </div>

          <!-- FECHA -->
          <span class="topbar__date">
            <Calendar :size="15" />
            {{ new Date().toLocaleDateString('es-CL') }}
          </span>

          <!-- MENÚ DE PERFIL DE USUARIO -->
          <div class="profile-menu-wrap">
            <button
              type="button"
              class="profile-trigger"
              :aria-expanded="profileOpen"
              aria-label="Menú de perfil de usuario"
              @click="toggleProfileMenu"
            >
              <span class="profile-trigger__avatar">{{ userInitials }}</span>
              <span class="profile-trigger__meta">
                <strong>{{ state.user?.name || 'Mi cuenta' }}</strong>
                <small>{{ state.user?.role?.replaceAll('_', ' ') || 'Usuario' }}</small>
              </span>
              <span class="profile-trigger__chevron" aria-hidden="true">▾</span>
            </button>

            <div
              v-if="profileOpen"
              class="profile-backdrop"
              @click="profileOpen = false"
            />

            <div
              v-if="profileOpen"
              class="profile-dropdown card"
              role="dialog"
              aria-label="Detalles de perfil de usuario"
            >
              <div class="profile-dropdown__header">
                <span class="profile-dropdown__avatar">{{ userInitials }}</span>
                <div style="min-width:0;flex:1">
                  <strong class="profile-dropdown__name">{{ state.user?.name || 'Usuario Tocal' }}</strong>
                  <div class="profile-dropdown__email">{{ state.user?.email || 'Sin correo registrado' }}</div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
                    <span class="badge">Rol: {{ state.user?.role?.replaceAll('_', ' ') || 'usuario' }}</span>
                    <span v-if="state.user?.id" class="badge">ID #{{ state.user.id }}</span>
                  </div>
                </div>
              </div>

              <div class="profile-dropdown__section">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div class="profile-dropdown__label">Mi cuenta y seguridad</div>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    style="padding:2px 8px;height:auto;font-size:11px"
                    @click="editProfileOpen = !editProfileOpen"
                  >
                    {{ editProfileOpen ? 'Ocultar edición ▴' : 'Cambiar clave / nombre ▾' }}
                  </button>
                </div>

                <p v-if="profileError" class="notice bad" style="padding:6px 10px;font-size:11px;margin:4px 0">{{ profileError }}</p>
                <p v-if="profileSuccess" class="notice" style="padding:6px 10px;font-size:11px;margin:4px 0">{{ profileSuccess }}</p>

                <form v-if="editProfileOpen" class="stack-sm" style="padding-top:6px" @submit.prevent="saveMyProfile">
                  <label style="font-size:11px">Mi nombre completo
                    <input v-model.trim="profileForm.name" required maxlength="160" style="padding:6px 8px;height:32px;font-size:12px" />
                  </label>
                  <label style="font-size:11px">Contraseña actual (solo si deseas cambiar clave)
                    <input v-model="profileForm.current_password" type="password" autocomplete="current-password" placeholder="••••••••••••" style="padding:6px 8px;height:32px;font-size:12px" />
                  </label>
                  <label style="font-size:11px">Nueva contraseña (mínimo 12 caracteres)
                    <input v-model="profileForm.new_password" type="password" minlength="12" autocomplete="new-password" placeholder="Mínimo 12 caracteres" style="padding:6px 8px;height:32px;font-size:12px" />
                  </label>
                  <button class="btn btn-primary btn-sm" type="submit" :disabled="profileSaving">
                    {{ profileSaving ? 'Guardando…' : 'Guardar cambios de mi cuenta' }}
                  </button>
                </form>
              </div>

              <div class="profile-dropdown__section">
                <div class="profile-dropdown__label">Contexto empresarial activo</div>
                <div class="profile-dropdown__kv">
                  <span>Empresa</span>
                  <strong>{{ activeCompanyName }}</strong>
                </div>
                <div class="profile-dropdown__kv">
                  <span>Obras habilitadas</span>
                  <strong>{{ state.obras.length }} obra(s)</strong>
                </div>
                <div class="profile-dropdown__kv">
                  <span>Permisos RBAC activos</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    style="padding:2px 8px;height:auto;font-size:11px"
                    @click="showPermissionsDetail = !showPermissionsDetail"
                  >
                    {{ state.permissions.length }} permisos {{ showPermissionsDetail ? '▴' : '▾' }}
                  </button>
                </div>
                <div class="profile-dropdown__kv" style="margin-top:4px;padding-top:6px;border-top:1px dashed var(--border,#e2ded5)">
                  <span>Cierre por inactividad ({{ Math.round(totalTimeoutSeconds / 60) || 1 }} min)</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    style="padding:2px 8px;height:auto;font-size:11px"
                    title="Simular que faltan 10 segundos para cerrar la sesión por inactividad"
                    @click="triggerInactivityWarningPreview"
                  >
                    Probar aviso ({{ warningThresholdSeconds }}s)
                  </button>
                </div>
                <div v-if="showPermissionsDetail" class="profile-dropdown__perms">
                  <code v-for="p in state.permissions" :key="p">{{ p }}</code>
                  <span v-if="!state.permissions.length" class="muted">Sin permisos específicos en esta empresa.</span>
                </div>
              </div>

              <div class="profile-dropdown__links">
                <RouterLink
                  v-if="myWorkerProfile"
                  :to="{ name: 'trabajador-detalle', params: { trabajadorId: myWorkerProfile.id } }"
                  class="profile-dropdown__link"
                  @click="profileOpen = false"
                >
                  <Users :size="16" />
                  <div>
                    <strong>Mi ficha de trabajador</strong>
                    <small>{{ myWorkerProfile.nombre }}</small>
                  </div>
                </RouterLink>

                <RouterLink
                  v-if="canViewAccess"
                  to="/administracion/accesos"
                  class="profile-dropdown__link"
                  @click="profileOpen = false"
                >
                  <ShieldCheck :size="16" />
                  <div>
                    <strong>Administración de cuenta y empresa</strong>
                    <small>Usuarios, roles, permisos y multiempresa</small>
                  </div>
                </RouterLink>

                <RouterLink
                  to="/privacidad"
                  class="profile-dropdown__link"
                  @click="profileOpen = false"
                >
                  <Shield :size="16" />
                  <div>
                    <strong>Privacidad y derechos ARCO+</strong>
                    <small>Solicitudes de datos personales (Ley 21.719)</small>
                  </div>
                </RouterLink>
              </div>

              <div class="profile-dropdown__footer">
                <button
                  type="button"
                  class="btn btn-danger-soft"
                  style="width:100%;justify-content:center"
                  @click="profileOpen = false; signOut()"
                >
                  <LogOut :size="16" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- PÁGINA -->
      <main
        id="main"
        class="page"
        tabindex="-1"
      >
        <!-- CABECERA DE OBRA -->
        <template v-if="obra">
          <header class="obra-header">
            <nav class="obra-header__crumbs">
              <RouterLink to="/">
                Obras
              </RouterLink>
              /
              {{ obra.nombre }}
            </nav>

            <h1 class="obra-header__title display">
              {{ obra.nombre }}
            </h1>

            <p class="obra-header__meta">
              {{ obra.servicio }} · {{ obra.mandante }}
            </p>
          </header>

          <!-- MÓDULOS DE OBRA -->
          <nav
            class="pills module-nav"
            aria-label="Módulos de obra"
          >
            <RouterLink
              v-for="[slug, label] in state.modules"
              :key="slug"
              class="pill"
              :to="obraPath(obra.id, slug)"
              :aria-current="
                activeObraModule === slug
                  ? 'page'
                  : undefined
              "
            >
              {{ label }}
            </RouterLink>
          </nav>
        </template>

        <slot />
      </main>

      <!-- FOOTER -->
      <footer class="page-footer">
        <span>
          {{ activeCompanyName }} · Control de obras
        </span>

        <span class="page-footer__hint">
          Ctrl K para buscar
        </span>
      </footer>
    </div>
  </div>

  <!-- ALERTAS -->
  <div
    v-if="state.alert"
    class="toast-stack"
  >
    <div
      class="toast"
      role="status"
    >
      {{ state.alert }}

      <button
        class="btn btn-ghost btn-sm"
        @click="state.alert = ''"
      >
        Cerrar
      </button>
    </div>
  </div>

  <!-- BUSCADOR GLOBAL -->
  <div
    v-if="searchOpen"
    class="command-backdrop"
    @click.self="searchOpen = false"
  >
    <div
      class="card"
      style="
        max-width:610px;
        margin:12vh auto;
        padding:20px;
      "
      role="dialog"
      aria-modal="true"
      aria-label="Buscar obra o módulo"
    >
      <input
        v-model="search"
        autofocus
        placeholder="Buscar obra o módulo"
        style="width:100%;padding:12px"
      />

      <div
        class="stack-sm"
        style="max-height:400px;overflow:auto"
      >
        <RouterLink
          v-for="item in matches"
          :key="item.url"
          :to="item.url"
          class="side-link"
          @click="
            searchOpen = false;
            search = ''
          "
        >
          <Search :size="16" />
          {{ item.name }}
        </RouterLink>
      </div>

      <button
        class="btn btn-ghost"
        @click="searchOpen = false"
      >
        Cerrar
      </button>
    </div>
  </div>

  <!-- MODAL DE AVISO Y CONTADOR REGRESIVO DE CIERRE POR INACTIVIDAD -->
  <div
    v-if="inactivityWarningOpen"
    class="command-backdrop"
    style="z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(17,24,39,0.65)"
  >
    <div
      class="card"
      style="max-width:440px;width:100%;padding:26px 24px;border:2px solid #dc2626;box-shadow:0 24px 60px rgba(0,0,0,0.35);text-align:center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="inactivity-modal-title"
    >
      <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:999px;background:#fee2e2;color:#dc2626;font-size:24px;font-weight:800;margin:0 auto 12px">
        {{ remainingInactivitySeconds }}s
      </div>

      <h3 id="inactivity-modal-title" style="margin:0 0 8px;font-size:18px;font-weight:750;color:#111827">
        ¿Sigues activo en la plataforma?
      </h3>

      <p class="muted" style="margin:0 0 14px;font-size:13px;line-height:1.5">
        No hemos detectado actividad reciente. Por seguridad, tu sesión se cerrará automáticamente en
        <strong style="color:#dc2626">{{ remainingInactivitySeconds }} segundo(s)</strong>.
      </p>

      <div style="width:100%;height:8px;background:#f3f4f6;border-radius:999px;overflow:hidden;margin-bottom:18px">
        <div
          :style="{
            width: `${Math.min(100, Math.max(0, (remainingInactivitySeconds / warningThresholdSeconds) * 100))}%`,
            height: '100%',
            background: '#dc2626',
            transition: 'width 0.35s linear',
          }"
        />
      </div>

      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button
          type="button"
          class="btn btn-primary"
          style="min-width:190px;justify-content:center;font-weight:700"
          autofocus
          @click="confirmUserActive"
        >
          Sigo activo · Mantener sesión
        </button>
        <button
          type="button"
          class="btn btn-danger-soft"
          @click="signOut()"
        >
          Cerrar sesión ahora
        </button>
      </div>
    </div>
  </div>
</template>
